"""캐릭터·3D 모델마다 자주 쓰는 설정(크기·바닥·거꾸로·색 등)을 기본값으로 저장한다.

키는 "char:<캐릭터id>" 또는 "mesh:<파일명>" 형태이며, 값은 그대로 돌려준다.
다음에 그 캐릭터를 출연시키면 저장해 둔 설정이 자동으로 적용된다.
"""
import json
import os

from aiohttp import web

from paths import APP_DIR

PRESETS_PATH = os.path.join(APP_DIR, "presets.json")


def _load():
    try:
        with open(PRESETS_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save(data):
    with open(PRESETS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


async def listing(request):
    return web.json_response({"presets": _load()})


async def save(request):
    """한 캐릭터에 여러 상태를 이름으로 저장한다: presets[key][name] = values"""
    body = await request.json()
    key = str(body.get("key") or "").strip()
    name = str(body.get("name") or "").strip()[:30]
    values = body.get("values")
    if not key or not name or not isinstance(values, dict):
        return web.json_response({"error": "key, name, values 가 필요합니다."}, status=400)
    data = _load()
    data.setdefault(key, {})[name] = values
    _save(data)
    return web.json_response({"ok": True, "key": key, "name": name, "states": data[key]})


async def delete(request):
    body = await request.json()
    key = str(body.get("key") or "")
    name = body.get("name")
    data = _load()
    if key in data:
        if name:
            data[key].pop(str(name), None)
            if not data[key]:
                del data[key]
        else:
            del data[key]
        _save(data)
    return web.json_response({"ok": True, "states": data.get(key, {})})


def register(app):
    app.router.add_get("/api/presets", listing)
    app.router.add_post("/api/presets/save", save)
    app.router.add_post("/api/presets/delete", delete)
