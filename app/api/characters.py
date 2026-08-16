"""캐릭터(포즈 스프라이트)와 배경 사진 관리 API."""
import base64
import json
import os
import re
import shutil
import time

from aiohttp import web

import sprites
from paths import BG_DIR, CHAR_DIR, names_in_dir, unique_name
from api.tags import clean_tags, suggest


# ---------------------------------------------------------------- 캐릭터
async def split(request):
    """캐릭터 시트 그림 → 포즈별 투명 스프라이트로 자동 분리 (배경 제거 옵션 적용)"""
    q = request.query
    reader = await request.multipart()
    field = await reader.next()
    if field is None:
        return web.json_response({"error": "그림 파일이 필요합니다."}, status=400)
    data = await field.read()

    def num(name, default, lo, hi):
        try:
            return max(lo, min(hi, float(q.get(name, default))))
        except (TypeError, ValueError):
            return default
    try:
        return web.json_response(sprites.split_sheet(
            data,
            mode=q.get("mode", "auto"),
            key=q.get("key"),
            tol=num("tol", 26, 2, 200),
            gap=int(num("gap", 5, 1, 25)),
            feather=q.get("feather", "1") != "0",
            min_area=int(num("min_area", 1200, 50, 200000)),
            pad=int(num("pad", 8, 0, 60)),
        ))
    except Exception as e:
        return web.json_response({"error": "분리 실패: " + str(e)[:200]}, status=500)


async def save(request):
    """포즈별 스프라이트(데이터 URL)와 이름을 캐릭터로 저장"""
    data = await request.json()
    # 같은 이름이 있으면 (1) (2) … 를 붙여 겹치지 않게 한다
    name = unique_name(data.get("name"), _char_names(), default="캐릭터", limit=30)
    poses = data.get("poses") or {}
    if not poses:
        return web.json_response({"error": "포즈가 없습니다."}, status=400)
    cid = "ch_%x" % int(time.time() * 1000)
    d = os.path.join(CHAR_DIR, cid)
    os.makedirs(d, exist_ok=True)
    saved = {}
    for role, durl in poses.items():
        if not isinstance(durl, str) or "," not in durl:
            continue
        role_safe = re.sub(r"[^\w]", "", role)[:20]
        with open(os.path.join(d, role_safe + ".png"), "wb") as f:
            f.write(base64.b64decode(durl.split(",", 1)[1]))
        saved[role_safe] = role_safe + ".png"
    # 태그 — 준 것이 있으면 쓰고, 없으면 이름을 보고 지어 준다
    태그 = clean_tags(data.get("tags")) or suggest(name, "캐릭터")
    meta = {"id": cid, "name": name, "created": time.time(), "poses": saved,
            "출처": data.get("출처") or "올림",
            "group": data.get("group") or "",       # 소속 시리즈 (비면 공용)
            "tags": 태그}
    with open(os.path.join(d, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    return web.json_response({"ok": True, "id": cid, "item": meta})


def _char_names(skip_id=None):
    """이미 쓰고 있는 캐릭터 이름들 (캐릭터는 폴더마다 meta.json 이 있다)"""
    out = []
    if not os.path.isdir(CHAR_DIR):
        return out
    for cid in os.listdir(CHAR_DIR):
        if skip_id and cid == skip_id:
            continue
        p = os.path.join(CHAR_DIR, cid, "meta.json")
        try:
            with open(p, encoding="utf-8") as f:
                m = json.load(f)
            if m.get("name"):
                out.append(m["name"])
        except Exception:
            continue
    return out


async def listing(request):
    items = []
    if os.path.isdir(CHAR_DIR):
        for cid in sorted(os.listdir(CHAR_DIR), reverse=True):
            p = os.path.join(CHAR_DIR, cid, "meta.json")
            if not os.path.isfile(p):
                continue
            try:
                with open(p, encoding="utf-8") as f:
                    m = json.load(f)
            except Exception:
                continue
            m["date"] = time.strftime("%Y-%m-%d %H:%M", time.localtime(m.get("created") or 0))
            items.append(m)
    return web.json_response({"items": items})


async def sprite(request):
    cid = re.sub(r"[^\w]", "", request.query.get("id") or "")
    role = re.sub(r"[^\w]", "", request.query.get("role") or "")
    path = os.path.join(CHAR_DIR, cid, role + ".png")
    if not cid or not role or not os.path.isfile(path):
        return web.json_response({"error": "없음"}, status=404)
    return web.FileResponse(path)


async def add_poses(request):
    """이미 저장된 캐릭터에 포즈(측면·앉기 등)를 더 넣는다."""
    data = await request.json()
    cid = re.sub(r"[^\w]", "", str(data.get("id") or ""))
    d = os.path.join(CHAR_DIR, cid)
    meta_path = os.path.join(d, "meta.json")
    if not cid or not os.path.isfile(meta_path):
        return web.json_response({"error": "캐릭터를 찾을 수 없습니다."}, status=404)
    poses = data.get("poses") or {}
    if not poses:
        return web.json_response({"error": "추가할 포즈가 없습니다."}, status=400)
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)
    added = []
    for role, durl in poses.items():
        if not isinstance(durl, str) or "," not in durl:
            continue
        role_safe = re.sub(r"[^\w]", "", role)[:20]
        with open(os.path.join(d, role_safe + ".png"), "wb") as f:
            f.write(base64.b64decode(durl.split(",", 1)[1]))
        meta.setdefault("poses", {})[role_safe] = role_safe + ".png"
        added.append(role_safe)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    return web.json_response({"ok": True, "added": added, "item": meta})


async def rig_save(request):
    """캐릭터의 뼈대·얼굴 부위 설정을 저장한다 (characters/<id>/rig.json)."""
    body = await request.json()
    cid = re.sub(r"[^\w]", "", str(body.get("id") or ""))
    d = os.path.join(CHAR_DIR, cid)
    if not cid or not os.path.isdir(d):
        return web.json_response({"error": "캐릭터를 찾을 수 없습니다."}, status=404)
    rig = body.get("rig")
    if not isinstance(rig, dict):
        return web.json_response({"error": "rig 자료가 필요합니다."}, status=400)
    rig["updated"] = time.time()
    with open(os.path.join(d, "rig.json"), "w", encoding="utf-8") as f:
        json.dump(rig, f, ensure_ascii=False, indent=1)
    return web.json_response({"ok": True})


async def rig_get(request):
    cid = re.sub(r"[^\w]", "", request.query.get("id") or "")
    p = os.path.join(CHAR_DIR, cid, "rig.json")
    if not cid or not os.path.isfile(p):
        return web.json_response({"rig": None})
    with open(p, encoding="utf-8") as f:
        return web.json_response({"rig": json.load(f)})


async def palette(request):
    """캐릭터 그림을 로컬 이미지 인식 모델로 읽어 색·특징을 뽑는다 (자동 색 입히기용)."""
    cid = re.sub(r"[^\w]", "", request.query.get("id") or "")
    front = os.path.join(CHAR_DIR, cid, "front.png")
    if not cid or not os.path.isfile(front):
        return web.json_response({"error": "캐릭터 그림이 없습니다."}, status=404)

    # 배경(투명)을 뺀 캐릭터 픽셀만 모아 대표 색을 뽑는다
    import numpy as np
    from PIL import Image
    im = Image.open(front).convert("RGBA")
    im.thumbnail((220, 220))
    a = np.array(im)
    mask = a[:, :, 3] > 60
    px = a[:, :, :3][mask]
    colors = []
    if len(px):
        q = Image.fromarray(px.reshape(-1, 1, 3).astype("uint8")).quantize(
            colors=6, method=Image.MEDIANCUT, dither=Image.NONE)
        pal = q.getpalette()
        total = sum(c for c, _ in q.getcolors())
        for cnt, idx in sorted(q.getcolors(), key=lambda x: -x[0]):
            rgb = pal[idx * 3: idx * 3 + 3]
            colors.append({"hex": "#%02x%02x%02x" % tuple(rgb),
                           "ratio": round(cnt / max(1, total), 3)})

    tags = []
    try:
        import tagger
        if tagger.available():
            tags = [t for t, _ in tagger.tag_image(front, top_k=20)][:20]
    except Exception:
        tags = []
    return web.json_response({"colors": colors, "tags": tags,
                              "base": colors[0]["hex"] if colors else "#f4dcae"})


async def delete(request):
    data = await request.json()
    cid = re.sub(r"[^\w]", "", data.get("id") or "")
    d = os.path.join(CHAR_DIR, cid)
    if cid and os.path.isdir(d):
        shutil.rmtree(d, ignore_errors=True)
        return web.json_response({"ok": True})
    return web.json_response({"error": "없음"}, status=404)


# ---------------------------------------------------------------- 배경
async def bg_save(request):
    os.makedirs(BG_DIR, exist_ok=True)
    reader = await request.multipart()
    field = await reader.next()
    if field is None:
        return web.json_response({"error": "그림 파일이 필요합니다."}, status=400)
    ext = os.path.splitext(field.filename or "bg.png")[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp"):
        ext = ".png"
    bid = "bg_%x" % int(time.time() * 1000)
    with open(os.path.join(BG_DIR, bid + ext), "wb") as f:
        while True:
            chunk = await field.read_chunk()
            if not chunk:
                break
            f.write(chunk)
    # 올리는 쪽이 이름·시리즈·출처를 함께 보낼 수 있다
    # (여러 장을 한 번에 올릴 때, 올린 뒤 하나씩 다시 고치지 않아도 되게)
    q = request.query
    name = unique_name(q.get("name") or os.path.splitext(field.filename or "배경")[0],
                       names_in_dir(BG_DIR), default="배경")
    meta = {"id": bid, "name": name, "file": bid + ext, "created": time.time(),
            "출처": q.get("출처") or "올림",   # 사람이 파일로 올린 것
            "group": q.get("group") or "",     # 소속 시리즈 (비면 공용)
            "tags": suggest(name, "배경")}
    with open(os.path.join(BG_DIR, bid + ".json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)
    return web.json_response({"ok": True, "item": meta})


async def bg_list(request):
    items = []
    if os.path.isdir(BG_DIR):
        for n in sorted(os.listdir(BG_DIR), reverse=True):
            if not n.endswith(".json"):
                continue
            try:
                with open(os.path.join(BG_DIR, n), encoding="utf-8") as f:
                    m = json.load(f)
            except Exception:
                continue
            m["date"] = time.strftime("%Y-%m-%d %H:%M", time.localtime(m.get("created") or 0))
            items.append(m)
    return web.json_response({"items": items})


def _bg_meta(bid):
    p = os.path.join(BG_DIR, bid + ".json")
    if not bid or not os.path.isfile(p):
        return None, None
    with open(p, encoding="utf-8") as f:
        return json.load(f), p


async def bg_file(request):
    bid = re.sub(r"[^\w]", "", request.query.get("id") or "")
    m, _ = _bg_meta(bid)
    if not m:
        return web.json_response({"error": "없음"}, status=404)
    path = os.path.join(BG_DIR, m.get("file", ""))
    if not os.path.isfile(path):
        return web.json_response({"error": "없음"}, status=404)
    return web.FileResponse(path)


async def bg_delete(request):
    data = await request.json()
    bid = re.sub(r"[^\w]", "", data.get("id") or "")
    m, meta_path = _bg_meta(bid)
    if not m:
        return web.json_response({"error": "없음"}, status=404)
    for f2 in (os.path.join(BG_DIR, m.get("file", "")), meta_path):
        try:
            if f2 and os.path.isfile(f2):
                os.remove(f2)
        except Exception:
            pass
    return web.json_response({"ok": True})


def register(app):
    app.router.add_post("/api/char/split", split)
    app.router.add_post("/api/char/save", save)
    app.router.add_get("/api/char/list", listing)
    app.router.add_get("/api/char/sprite", sprite)
    app.router.add_get("/api/char/palette", palette)
    app.router.add_post("/api/char/addposes", add_poses)
    app.router.add_post("/api/char/rig", rig_save)
    app.router.add_get("/api/char/rig", rig_get)
    app.router.add_post("/api/char/delete", delete)
    app.router.add_post("/api/bg/save", bg_save)
    app.router.add_get("/api/bg/list", bg_list)
    app.router.add_get("/api/bg/file", bg_file)
    app.router.add_post("/api/bg/delete", bg_delete)
