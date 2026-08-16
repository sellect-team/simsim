"""캐릭터 그림 → 3D 모델(.glb) 생성.

캐릭터의 정면·측면·후면 스프라이트를 ComfyUI 의 Hunyuan3D-2 멀티뷰 파이프라인에 넣어
메시를 만든다. ComfyUI 기본 노드만 쓰므로 별도 커스텀 노드가 필요 없다.
"""
import asyncio
import io
import json
import os
import re
import time

from aiohttp import ClientSession, web

from paths import CHAR_DIR, COMFY_INPUT_DIR, COMFY_URL, JOBS, job_id

MODELS = {
    "turbo": "hunyuan3d-dit-v2-mv-turbo_fp16.safetensors",
    "standard": "hunyuan3d-dit-v2-mv_fp16.safetensors",
    "single": "hunyuan3d-dit-v2_fp16.safetensors",
}
ROLE_TO_VIEW = {"front": "front", "side": "left", "back": "back"}


def _prep_images(cid, size=512):
    """캐릭터 스프라이트를 흰 배경 정사각형으로 만들어 ComfyUI 입력 폴더에 둔다."""
    from PIL import Image
    out = {}
    base = os.path.join(CHAR_DIR, cid)
    os.makedirs(COMFY_INPUT_DIR, exist_ok=True)
    for role in ("front", "side", "back"):
        p = os.path.join(base, role + ".png")
        if not os.path.isfile(p):
            continue
        im = Image.open(p).convert("RGBA")
        s = max(im.size)
        canvas = Image.new("RGBA", (int(s * 1.15), int(s * 1.15)), (255, 255, 255, 255))
        canvas.alpha_composite(im, ((canvas.width - im.width) // 2,
                                    (canvas.height - im.height) // 2))
        canvas = canvas.convert("RGB").resize((size, size), Image.LANCZOS)
        name = f"c3d_{cid}_{role}.png"
        canvas.save(os.path.join(COMFY_INPUT_DIR, name))
        out[role] = name
    return out


def _workflow(images, opts, prefix):
    ckpt = MODELS.get(opts.get("model"), MODELS["turbo"])
    wf = {
        "54": {"class_type": "ImageOnlyCheckpointLoader", "inputs": {"ckpt_name": ckpt}},
        "70": {"class_type": "ModelSamplingAuraFlow",
               "inputs": {"model": ["54", 0], "shift": float(opts.get("shift", 1.0))}},
        "66": {"class_type": "EmptyLatentHunyuan3Dv2",
               "inputs": {"resolution": 3072, "batch_size": 1}},
        "65": {"class_type": "Hunyuan3Dv2ConditioningMultiView", "inputs": {}},
        "78": {"class_type": "FluxGuidance",
               "inputs": {"conditioning": ["65", 0], "guidance": float(opts.get("guidance", 3.5))}},
        "3": {"class_type": "KSampler",
              "inputs": {"model": ["70", 0], "positive": ["78", 0], "negative": ["65", 1],
                         "latent_image": ["66", 0], "seed": int(opts.get("seed", 0)) or int(time.time()),
                         "steps": int(opts.get("steps", 20)), "cfg": float(opts.get("cfg", 4)),
                         "sampler_name": "euler", "scheduler": "normal", "denoise": 1}},
        "61": {"class_type": "VAEDecodeHunyuan3D",
               "inputs": {"samples": ["3", 0], "vae": ["54", 2], "num_chunks": 8000,
                          "octree_resolution": int(opts.get("octree", 256))}},
        "83": {"class_type": "VoxelToMesh",
               "inputs": {"voxel": ["61", 0], "algorithm": "surface net",
                          "threshold": float(opts.get("threshold", 0.6))}},
        "67": {"class_type": "SaveGLB",
               "inputs": {"mesh": ["83", 0], "filename_prefix": "mesh/" + prefix}},
    }
    nid = 100
    for role, view in ROLE_TO_VIEW.items():
        if role not in images:
            continue
        load, enc = str(nid), str(nid + 1)
        nid += 2
        wf[load] = {"class_type": "LoadImage", "inputs": {"image": images[role]}}
        wf[enc] = {"class_type": "CLIPVisionEncode",
                   "inputs": {"clip_vision": ["54", 1], "image": [load, 0], "crop": "none"}}
        wf["65"]["inputs"][view] = [enc, 0]
    return wf


async def _watch(prompt_id, jid, prefix, t0, cid=None):
    """ComfyUI 가 끝날 때까지 지켜보며 진행 상황을 알려준다."""
    try:
        async with ClientSession() as sess:
            while True:
                await asyncio.sleep(2)
                el = int(time.time() - t0)
                async with sess.get(f"{COMFY_URL}/history/{prompt_id}") as r:
                    hist = await r.json()
                if hist.get(prompt_id):
                    outs = hist[prompt_id].get("outputs", {})
                    name = None
                    for node in outs.values():
                        for key in ("3d", "gltf", "mesh", "result", "files"):
                            for item in node.get(key, []) or []:
                                if isinstance(item, dict) and item.get("filename"):
                                    name = item["filename"]
                                elif isinstance(item, str) and item.endswith(".glb"):
                                    name = os.path.basename(item)
                    if not name:                      # 못 찾으면 폴더에서 가장 최근 파일
                        from api.meshes import MESH_DIR
                        cands = [f for f in os.listdir(MESH_DIR)
                                 if f.startswith(prefix) and f.endswith(".glb")]
                        name = sorted(cands)[-1] if cands else None
                    if name:
                        from api.meshes import set_source
                        set_source(name, cid)          # 이 3D가 어느 그림에서 나왔는지 기록
                    JOBS[jid] = {"state": "done", "progress": 100, "filename": name,
                                 "note": f"완료 ({el}초)"}
                    return
                JOBS[jid] = {"state": "running", "progress": min(95, 5 + el * 3),
                             "note": f"3D 모양을 만드는 중… {el}초"}
                if el > 900:
                    JOBS[jid] = {"state": "error", "error": "시간이 너무 오래 걸립니다."}
                    return
    except Exception as e:
        JOBS[jid] = {"state": "error", "error": str(e)[:300]}


async def generate(request):
    body = await request.json()
    cid = re.sub(r"[^\w]", "", str(body.get("char_id") or ""))
    if not cid or not os.path.isdir(os.path.join(CHAR_DIR, cid)):
        return web.json_response({"error": "캐릭터를 찾을 수 없습니다."}, status=404)
    images = _prep_images(cid)
    if not images:
        return web.json_response({"error": "정면·측면·후면 그림이 없습니다."}, status=400)

    name = re.sub(r"[^\w\-가-힣]", "_", str(body.get("name") or cid))[:30] or cid
    prefix = f"{name}_{int(time.time()) % 100000}"
    wf = _workflow(images, body, prefix)
    try:
        async with ClientSession() as sess:
            async with sess.post(COMFY_URL + "/prompt",
                                 json={"prompt": wf, "client_id": "char3d"}) as r:
                data = await r.json()
        if data.get("node_errors"):
            return web.json_response({"error": json.dumps(data["node_errors"])[:300]}, status=400)
        pid = data.get("prompt_id")
    except Exception as e:
        return web.json_response(
            {"error": "생성 엔진(ComfyUI)에 연결하지 못했습니다: " + str(e)[:200]}, status=502)

    jid = job_id("job_3d")
    JOBS[jid] = {"state": "running", "progress": 3, "note": "3D 생성 시작"}
    asyncio.create_task(_watch(pid, jid, prefix, time.time(), cid))
    return web.json_response({"ok": True, "job": jid, "views": list(images.keys())})


def register(app):
    app.router.add_post("/api/mesh/generate", generate)
