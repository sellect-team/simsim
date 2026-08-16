"""장면(shot) 보관함 — 캐릭터 배치·동작·경로·말풍선·자막이 담긴 한 장면을 저장한다.

영상 만들기에서 저장하면 여기 쌓이고, 다른 영상을 만들 때 골라 넣을 수 있다.
미리보기 그림(thumb)도 함께 저장해 목록에서 눈으로 고를 수 있게 한다.
"""
import base64
import json
import os
import re
import time

from aiohttp import web

from paths import APP_DIR, names_in_dir, unique_name

SCENE_DIR = os.path.join(APP_DIR, "scenes")


def _path(sid, ext="json"):
    return os.path.join(SCENE_DIR, f"{sid}.{ext}")


def _safe(sid):
    sid = str(sid or "")
    return sid if re.fullmatch(r"sc_[0-9a-z]+", sid) else None


async def save(request):
    os.makedirs(SCENE_DIR, exist_ok=True)
    body = await request.json()
    data = body.get("data")
    if not isinstance(data, dict):
        return web.json_response({"error": "장면 내용이 필요합니다."}, status=400)
    sid = _safe(body.get("id")) or "sc_%x" % int(time.time() * 1000)
    name = unique_name(body.get("name"), names_in_dir(SCENE_DIR, skip_id=sid), default="장면")
    tags = [str(t)[:20] for t in (body.get("tags") or []) if str(t).strip()][:8]

    thumb = body.get("thumb")
    if isinstance(thumb, str) and "," in thumb:
        with open(_path(sid, "jpg"), "wb") as f:
            f.write(base64.b64decode(thumb.split(",", 1)[1]))

    kind = re.sub(r"[^\w]", "", str(body.get("kind") or "scene"))[:20] or "scene"
    meta = {"id": sid, "name": name, "kind": kind, "tags": tags, "created": time.time(),
            "seconds": float(data.get("seconds") or 3),
            "cast": [c.get("name") for c in (body.get("cast") or [])],
            "data": data, "castData": body.get("cast") or []}
    with open(_path(sid), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    return web.json_response({"ok": True, "id": sid, "item": _brief(meta)})


def _brief(m):
    return {k: m[k] for k in ("id", "name", "kind", "tags", "created", "seconds", "cast")
            if k in m}


async def listing(request):
    items = []
    if os.path.isdir(SCENE_DIR):
        for n in sorted(os.listdir(SCENE_DIR), reverse=True):
            if not n.endswith(".json"):
                continue
            try:
                with open(os.path.join(SCENE_DIR, n), encoding="utf-8") as f:
                    m = json.load(f)
            except Exception:
                continue
            b = _brief(m)
            b["date"] = time.strftime("%Y-%m-%d %H:%M", time.localtime(m.get("created") or 0))
            b["hasThumb"] = os.path.isfile(_path(m["id"], "jpg"))
            items.append(b)
    return web.json_response({"items": items})


async def get(request):
    sid = _safe(request.query.get("id"))
    if not sid or not os.path.isfile(_path(sid)):
        return web.json_response({"error": "없음"}, status=404)
    with open(_path(sid), encoding="utf-8") as f:
        return web.json_response(json.load(f))


async def thumb(request):
    sid = _safe(request.query.get("id"))
    if not sid or not os.path.isfile(_path(sid, "jpg")):
        return web.json_response({"error": "없음"}, status=404)
    return web.FileResponse(_path(sid, "jpg"))


async def delete(request):
    body = await request.json()
    sid = _safe(body.get("id"))
    if not sid:
        return web.json_response({"error": "없음"}, status=404)
    for p in (_path(sid), _path(sid, "jpg")):
        try:
            if os.path.isfile(p):
                os.remove(p)
        except Exception:
            pass
    return web.json_response({"ok": True})


def register(app):
    app.router.add_post("/api/scene/save", save)
    app.router.add_get("/api/scene/list", listing)
    app.router.add_get("/api/scene/get", get)
    app.router.add_get("/api/scene/thumb", thumb)
    app.router.add_post("/api/scene/delete", delete)
