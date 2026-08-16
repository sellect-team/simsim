"""뮤직비주얼 프로젝트(음악 + 가사 타임라인) 보관 API.

영상으로 굽지 않고 원본 음악과 타임라인만 저장하므로, 재생할 때마다
화질 손실 없이 실시간으로 렌더링된다.
"""
import json
import os
import re
import time

from aiohttp import web

from paths import MUSIC_DIR, safe_id


def meta_path(pid):
    return os.path.join(MUSIC_DIR, pid + ".json")


async def save(request):
    os.makedirs(MUSIC_DIR, exist_ok=True)
    pid = "mv_%x" % int(time.time() * 1000)
    meta, audio_name = {}, None
    reader = await request.multipart()
    while True:
        field = await reader.next()
        if field is None:
            break
        if field.name == "meta":
            try:
                meta = json.loads((await field.read()).decode("utf-8"))
            except Exception:
                meta = {}
        elif field.name == "audio":
            ext = os.path.splitext(field.filename or "song.mp3")[1].lower()
            if ext not in (".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac", ".opus"):
                ext = ".mp3"
            audio_name = pid + ext
            with open(os.path.join(MUSIC_DIR, audio_name), "wb") as f:
                while True:
                    chunk = await field.read_chunk()
                    if not chunk:
                        break
                    f.write(chunk)
    if not audio_name:
        return web.json_response({"error": "음악 파일이 필요합니다."}, status=400)
    meta.update({
        "id": pid, "audio": audio_name, "created": time.time(),
        "size": os.path.getsize(os.path.join(MUSIC_DIR, audio_name)),
    })
    meta.setdefault("title", "뮤직비주얼")
    with open(meta_path(pid), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    return web.json_response({"ok": True, "id": pid, "item": meta})


async def listing(request):
    items = []
    if os.path.isdir(MUSIC_DIR):
        for name in os.listdir(MUSIC_DIR):
            if not name.endswith(".json"):
                continue
            try:
                with open(os.path.join(MUSIC_DIR, name), encoding="utf-8") as f:
                    m = json.load(f)
            except Exception:
                continue
            t = m.get("created") or 0
            m["date"] = time.strftime("%Y-%m-%d", time.localtime(t))
            m["time"] = time.strftime("%H:%M", time.localtime(t))
            items.append(m)
    items.sort(key=lambda m: m.get("created") or 0, reverse=True)
    return web.json_response({"items": items})


async def audio(request):
    pid = safe_id(request.query.get("id"), "mv")
    if not pid or not os.path.exists(meta_path(pid)):
        return web.json_response({"error": "없는 항목"}, status=404)
    with open(meta_path(pid), encoding="utf-8") as f:
        m = json.load(f)
    path = os.path.join(MUSIC_DIR, m.get("audio", ""))
    if not os.path.isfile(path):
        return web.json_response({"error": "음악 파일이 없습니다."}, status=404)
    return web.FileResponse(path)


async def delete(request):
    data = await request.json()
    pid = safe_id(data.get("id"), "mv")
    if not pid or not os.path.exists(meta_path(pid)):
        return web.json_response({"error": "없는 항목"}, status=404)
    with open(meta_path(pid), encoding="utf-8") as f:
        m = json.load(f)
    for p in (os.path.join(MUSIC_DIR, m.get("audio", "")), meta_path(pid)):
        try:
            if p and os.path.isfile(p):
                os.remove(p)
        except Exception:
            pass
    return web.json_response({"ok": True})


def register(app):
    app.router.add_post("/api/mv/save", save)
    app.router.add_get("/api/mv/list", listing)
    app.router.add_get("/api/mv/audio", audio)
    app.router.add_post("/api/mv/delete", delete)
