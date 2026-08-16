"""📚 프로젝트 그룹 (시리즈) — 만드는 일의 가장 바깥 단위.

    📚 그룹  "누룽이 시리즈"
       ├ 📁 프로젝트  EP01 출근길
       ├ 📁 프로젝트  EP02 …
       └ 🎨 자산      누룽이 · 현관 · 지하철 …

왜 이렇게 나누는가
  · 시리즈물은 캐릭터를 **여러 편이 함께** 쓴다. 편마다 올리면 수백 개가 된다.
  · 그렇다고 전부 한 곳에 두면 시리즈가 여럿일 때 목록이 뒤섞인다.
  · 그래서 '그룹 안에서 공유' 가 맞다.

자산은 **폴더를 옮기지 않는다.** 소속 그룹을 적어만 둔다.
  · 파일을 옮기면 이미 저장된 프로젝트의 참조가 깨질 수 있다
  · 비워 두면 **공용** — 모든 그룹에서 보인다 (공통 캐릭터·효과음)
"""
import json
import os
import re
import time

from aiohttp import web

from paths import APP_DIR, AUDIO_DIR, BG_DIR, CHAR_DIR, clean_name, unique_name

GROUP_DIR = os.path.join(APP_DIR, "groups")
SCENE_DIR = os.path.join(APP_DIR, "scenes")
PREFAB_DIR = os.path.join(APP_DIR, "prefabs")


def _safe(gid):
    gid = str(gid or "")
    return gid if re.fullmatch(r"gp_[0-9a-z]+", gid) else None


def _path(gid):
    return os.path.join(GROUP_DIR, gid + ".json")


def read_all():
    out = []
    if not os.path.isdir(GROUP_DIR):
        return out
    for n in sorted(os.listdir(GROUP_DIR)):
        if not n.endswith(".json"):
            continue
        try:
            with open(os.path.join(GROUP_DIR, n), encoding="utf-8") as f:
                out.append(json.load(f))
        except Exception:
            continue
    out.sort(key=lambda x: -(x.get("updated") or x.get("created") or 0))
    return out


def read_one(gid):
    p = _path(_safe(gid) or "")
    if not os.path.isfile(p):
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def asset_iter(종류=None):
    """모든 자산을 (종류, meta, 경로) 로 돌려준다"""
    표 = {
        "배경": (BG_DIR, lambda d, n: os.path.join(d, n), lambda n: n.endswith(".json")),
        "음악": (AUDIO_DIR, lambda d, n: os.path.join(d, n), lambda n: n.endswith(".json")),
        "장면": (SCENE_DIR, lambda d, n: os.path.join(d, n), lambda n: n.endswith(".json")),
        "조각": (PREFAB_DIR, lambda d, n: os.path.join(d, n), lambda n: n.endswith(".json")),
    }
    for k, (d, 만들기, 걸러내기) in 표.items():
        if 종류 and k != 종류:
            continue
        if not os.path.isdir(d):
            continue
        for n in os.listdir(d):
            if not 걸러내기(n):
                continue
            p = 만들기(d, n)
            try:
                with open(p, encoding="utf-8") as f:
                    yield k, json.load(f), p
            except Exception:
                continue
    if not 종류 or 종류 == "캐릭터":
        if os.path.isdir(CHAR_DIR):
            for n in os.listdir(CHAR_DIR):
                p = os.path.join(CHAR_DIR, n, "meta.json")
                if not os.path.isfile(p):
                    continue
                try:
                    with open(p, encoding="utf-8") as f:
                        yield "캐릭터", json.load(f), p
                except Exception:
                    continue


def belongs(meta, gid):
    """이 자산을 그 그룹에서 쓸 수 있는가 (그룹이 비면 공용)"""
    g = meta.get("group") or ""
    return (not g) or (not gid) or (g == gid)


def _counts(gid):
    from api.projects import _all as 프로젝트들
    프 = [m for m in 프로젝트들() if (m.get("group") or "") == gid]
    자산 = {"배경": 0, "캐릭터": 0, "장면": 0, "조각": 0}
    for 종류, m, _ in asset_iter():
        if (m.get("group") or "") == gid:
            자산[종류] = 자산.get(종류, 0) + 1
    return {
        "프로젝트": len(프),
        "편": sum(len(m.get("stories") or []) for m in 프),
        "초": sum(s.get("seconds") or 0 for m in 프 for s in (m.get("stories") or [])),
        "자산": 자산,
    }


async def listing(request):
    items = []
    for m in read_all():
        items.append({**m, **_counts(m["id"])})
    # 어디에도 안 속한 것들 (예전에 만든 것)
    공용 = {"배경": 0, "캐릭터": 0, "장면": 0, "조각": 0}
    for 종류, m, _ in asset_iter():
        if not (m.get("group") or ""):
            공용[종류] = 공용.get(종류, 0) + 1
    from api.projects import _all as 프로젝트들
    묶이지않은 = [m for m in 프로젝트들() if not (m.get("group") or "")]
    return web.json_response({
        "items": items,
        "공용자산": 공용,
        "묶이지않은프로젝트": len(묶이지않은),
    })


async def save(request):
    os.makedirs(GROUP_DIR, exist_ok=True)
    body = await request.json()
    gid = _safe(body.get("id"))
    old = read_one(gid) if gid else None
    if not old:
        gid = "gp_%x" % int(time.time() * 1000)
        old = {"id": gid, "created": time.time()}
    딴것 = [g.get("name") for g in read_all() if g.get("id") != gid]
    old["name"] = unique_name(body.get("name") or old.get("name"), 딴것, default="시리즈")
    if "메모" in body:
        old["메모"] = clean_name(body.get("메모"), default="", limit=120)
    old["updated"] = time.time()
    with open(_path(gid), "w", encoding="utf-8") as f:
        json.dump(old, f, ensure_ascii=False, indent=1)
    return web.json_response({"ok": True, "id": gid, "item": {**old, **_counts(gid)}})


async def delete(request):
    """그룹만 지운다 — 안에 든 프로젝트·자산은 '공용'으로 풀린다 (아무것도 안 사라진다)"""
    body = await request.json()
    gid = _safe(body.get("id"))
    if not gid:
        return web.json_response({"error": "없음"}, status=404)
    푼것 = 0
    from api.projects import _all as 프로젝트들, _write as 프저장
    for m in 프로젝트들():
        if (m.get("group") or "") == gid:
            m["group"] = ""
            프저장(m)
            푼것 += 1
    for 종류, m, p in asset_iter():
        if (m.get("group") or "") == gid:
            m["group"] = ""
            with open(p, "w", encoding="utf-8") as f:
                json.dump(m, f, ensure_ascii=False)
            푼것 += 1
    try:
        os.remove(_path(gid))
    except OSError:
        pass
    return web.json_response({"ok": True, "푼것": 푼것})


async def assign(request):
    """프로젝트·자산을 그룹에 넣거나 뺀다 (그룹을 비우면 공용)"""
    body = await request.json()
    gid = _safe(body.get("group")) or ""
    바뀐것 = 0

    from api.projects import _all as 프로젝트들, _read as 프읽기, _write as 프저장
    for pid in body.get("프로젝트") or []:
        m = 프읽기(pid)
        if m:
            m["group"] = gid
            프저장(m)
            바뀐것 += 1

    원하는것 = {(a.get("kind"), str(a.get("id"))) for a in (body.get("자산") or [])}
    if 원하는것:
        for 종류, m, p in asset_iter():
            if (종류, str(m.get("id"))) in 원하는것:
                m["group"] = gid
                with open(p, "w", encoding="utf-8") as f:
                    json.dump(m, f, ensure_ascii=False)
                바뀐것 += 1
    return web.json_response({"ok": True, "수": 바뀐것})


async def assets(request):
    """그 그룹에서 쓸 수 있는 자산 (그룹 것 + 공용)"""
    gid = _safe(request.query.get("group")) or ""
    나온것 = []
    for 종류, m, _ in asset_iter(request.query.get("kind")):
        if not belongs(m, gid):
            continue
        나온것.append({"종류": 종류, "id": m.get("id"), "name": m.get("name"),
                       "group": m.get("group") or "", "tags": m.get("tags") or [],
                       "공용": not (m.get("group") or "")})
    return web.json_response({"items": 나온것, "수": len(나온것)})


def register(app):
    app.router.add_get("/api/group/list", listing)
    app.router.add_post("/api/group/save", save)
    app.router.add_post("/api/group/delete", delete)
    app.router.add_post("/api/group/assign", assign)
    app.router.add_get("/api/group/assets", assets)
