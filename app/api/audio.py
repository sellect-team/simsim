"""🎵 음악 자산 — 배경 음악도 캐릭터·배경과 똑같이 다룬다.

지금까지 음악은 그냥 파일이었다. 이름·태그·시리즈 소속이 없어서
"이 시리즈에 쓸 음악이 뭐였지?" 를 알 수 없었다.

그래서 파일 옆에 작은 설명서(`이름.json`)를 두어 배경·캐릭터와 같은 규칙으로 만든다.
  · 태그 · 시리즈 소속 · 길이 · 출처
  · 설명서가 없는 옛 파일도 목록에는 나온다 (처음 만질 때 만들어 준다)
"""
import json
import os
import re
import time

from aiohttp import web

from paths import AUDIO_DIR, clean_name

EXT = re.compile(r"\.(mp3|wav|ogg|m4a|flac)$", re.I)


def _meta_path(name):
    return os.path.join(AUDIO_DIR, name + ".json")


def _read(name):
    p = _meta_path(name)
    if os.path.isfile(p):
        try:
            with open(p, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return None


def _write(name, m):
    os.makedirs(AUDIO_DIR, exist_ok=True)
    with open(_meta_path(name), "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False)
    return m


def _duration(path):
    try:
        import av
        with av.open(path) as c:
            return round(float(c.duration / av.time_base), 1) if c.duration else 0
    except Exception:
        return 0


def _safe(name):
    """폴더 밖으로 못 나가게. 파일 이름만 받는다."""
    n = os.path.basename(str(name or ""))
    return n if n and n == name and EXT.search(n) else None


def ensure_all():
    """설명서가 없는 옛 음악 파일에 설명서를 만들어 준다.

    태그·시리즈 API 는 설명서(`.json`)를 훑어서 자산을 찾는다.
    설명서가 없으면 그 음악은 태그도, 시리즈 소속도 가질 수 없다.
    그래서 프로그램이 켜질 때 한 번 채워 둔다 (파일은 건드리지 않는다).
    """
    made = 0
    if not os.path.isdir(AUDIO_DIR):
        return 0
    for n in sorted(os.listdir(AUDIO_DIR)):
        if not EXT.search(n) or _read(n):
            continue
        path = os.path.join(AUDIO_DIR, n)
        _write(n, {"id": n, "name": os.path.splitext(n)[0], "file": n,
                   "group": "", "tags": [], "출처": "올림",
                   "초": _duration(path), "created": os.path.getmtime(path)})
        made += 1
    return made


def all_items():
    out = []
    if not os.path.isdir(AUDIO_DIR):
        return out
    ensure_all()
    for n in sorted(os.listdir(AUDIO_DIR)):
        if not EXT.search(n):
            continue
        path = os.path.join(AUDIO_DIR, n)
        m = _read(n) or {}
        out.append({
            "id": n,                                  # 음악은 파일 이름이 곧 id 다
            "name": m.get("name") or os.path.splitext(n)[0],
            "file": n,
            "group": m.get("group") or "",
            "tags": m.get("tags") or [],
            "출처": m.get("출처") or "올림",
            "초": m.get("초") or _duration(path),
            "크기": os.path.getsize(path),
            "date": time.strftime("%Y-%m-%d %H:%M",
                                  time.localtime(os.path.getmtime(path))),
            "설명서": bool(m),
        })
    return out


async def listing(request):
    items = all_items()
    gid = request.query.get("group") or ""
    if gid and gid != "__none":
        # 그 시리즈 것 + 공용
        items = [x for x in items if not x["group"] or x["group"] == gid]
    elif gid == "__none":
        items = [x for x in items if not x["group"]]
    return web.json_response({"items": items, "수": len(items)})


async def update(request):
    """이름·태그·시리즈를 고친다 (파일은 그대로 둔다)"""
    body = await request.json()
    n = _safe(body.get("id"))
    if not n or not os.path.isfile(os.path.join(AUDIO_DIR, n)):
        return web.json_response({"error": "음악이 없습니다."}, status=404)
    from api.tags import clean_tags
    m = _read(n) or {}
    if "name" in body:
        m["name"] = clean_name(body["name"], default=os.path.splitext(n)[0], limit=40)
    if "tags" in body:
        m["tags"] = clean_tags(body["tags"])
    if "group" in body:
        m["group"] = str(body["group"] or "")
    m.setdefault("출처", "올림")
    m.setdefault("초", _duration(os.path.join(AUDIO_DIR, n)))
    m["updated"] = time.time()
    _write(n, m)
    return web.json_response({"ok": True, "item": m})


async def delete(request):
    body = await request.json()
    n = _safe(body.get("id"))
    if not n:
        return web.json_response({"error": "없음"}, status=404)
    for p in (os.path.join(AUDIO_DIR, n), _meta_path(n)):
        try:
            if os.path.isfile(p):
                os.remove(p)
        except OSError:
            pass
    return web.json_response({"ok": True})


def register(app):
    # 켤 때 한 번 — 설명서 없는 옛 음악도 태그·시리즈를 가질 수 있게
    try:
        ensure_all()
    except OSError:
        pass
    app.router.add_get("/api/audio/list", listing)
    app.router.add_post("/api/audio/update", update)
    app.router.add_post("/api/audio/delete", delete)
