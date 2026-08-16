"""이미지 → 3D (Hunyuan3D-2) 로 만든 메시 파일 목록·다운로드.

ComfyUI 가 output/mesh 에 저장한 .glb 를 앱에서 바로 불러 쓸 수 있게 한다.
"""
import json
import os
import re
import time

from aiohttp import web

from paths import ROOT_DIR

MESH_DIR = os.path.normpath(os.path.join(
    ROOT_DIR, "ComfyUI_windows_portable", "ComfyUI", "output", "mesh"))
MESH_EXT_RE = r"\.(glb|gltf|obj|ply)$"
META_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mesh_meta.json")
META_PATH = os.path.normpath(META_PATH)


def load_meta():
    """어느 2D 캐릭터에서 만든 3D인지 기억해 둔다 (자동 색칠에 쓰임)"""
    try:
        with open(META_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_meta(data):
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


def set_source(mesh_name, char_id):
    d = load_meta()
    d[mesh_name] = {"src_char": char_id}
    save_meta(d)


async def listing(request):
    items = []
    meta = load_meta()
    if os.path.isdir(MESH_DIR):
        for name in sorted(os.listdir(MESH_DIR), reverse=True):
            if not re.search(MESH_EXT_RE, name, re.I):
                continue
            st = os.stat(os.path.join(MESH_DIR, name))
            items.append({
                "name": name,
                "size": st.st_size,
                "date": time.strftime("%Y-%m-%d %H:%M", time.localtime(st.st_mtime)),
                "src_char": (meta.get(name) or {}).get("src_char"),
            })
    return web.json_response({"items": items, "dir": MESH_DIR})


async def file(request):
    name = os.path.basename(request.query.get("name") or "")
    if not name or not re.search(MESH_EXT_RE, name, re.I):
        return web.json_response({"error": "잘못된 파일"}, status=400)
    path = os.path.join(MESH_DIR, name)
    if not os.path.isfile(path):
        return web.json_response({"error": "없음"}, status=404)
    return web.FileResponse(path, headers={"Content-Type": "model/gltf-binary"})


async def save(request):
    """색을 입힌 메시(.glb)를 새 파일로 저장한다."""
    os.makedirs(MESH_DIR, exist_ok=True)
    name = re.sub(r"[^\w\-가-힣]", "_", request.query.get("name") or "painted")[:40] or "painted"
    out = f"{name}.glb"
    path = os.path.join(MESH_DIR, out)
    n = 1
    while os.path.exists(path):                    # 겹치면 번호를 붙인다
        out = f"{name}_{n}.glb"
        path = os.path.join(MESH_DIR, out)
        n += 1
    reader = await request.multipart()
    field = await reader.next()
    if field is None:
        return web.json_response({"error": "메시 데이터가 필요합니다."}, status=400)
    size = 0
    with open(path, "wb") as f:
        while True:
            chunk = await field.read_chunk()
            if not chunk:
                break
            size += len(chunk)
            f.write(chunk)
    src = request.query.get("src")
    if src:
        set_source(out, src)
    return web.json_response({"ok": True, "name": out, "size": size})


async def delete(request):
    data = await request.json()
    name = os.path.basename(data.get("name") or "")
    path = os.path.join(MESH_DIR, name)
    if not name or not re.search(MESH_EXT_RE, name, re.I) or not os.path.isfile(path):
        return web.json_response({"error": "없음"}, status=404)
    os.remove(path)
    return web.json_response({"ok": True})


def register(app):
    app.router.add_get("/api/mesh/list", listing)
    app.router.add_get("/api/mesh/file", file)
    app.router.add_post("/api/mesh/save", save)
    app.router.add_post("/api/mesh/delete", delete)
