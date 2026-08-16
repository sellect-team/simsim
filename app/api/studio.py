"""🧪 스튜디오 — 이 컴퓨터에서 직접 만들어 보는 곳.

작업실에서 쓸 **객체**(배경·캐릭터·소품 그림, 짧은 영상)를 여기서 만들고 시험한다.
바깥 서비스를 쓰지 않는다. 쓰는 것은 셋뿐이다.

  · ComfyUI (Wan 2.2 5B)  그림 한 장 · 짧은 영상
  · Ollama (exaone3.5)    한국어 → 영어 프롬프트, 글 다듬기
  · 파이썬 라이브러리      배경 지우기 · 자르기 · 크기 맞추기 · 키우기(업스케일)

로컬 LLM 은 작아서 판단력이 좋지 않다. 그래서 **번역·다듬기 같은 '옮기는 일'만** 시키고
무엇을 만들지 정하는 일은 시키지 않는다.
"""
import base64
import io as _io
import json
import os
import re
import time
import urllib.request

from aiohttp import web

from paths import APP_DIR, COMFY_INPUT_DIR, COMFY_URL, JOBS, job_id

OLLAMA = "http://127.0.0.1:11434"
UPSCALE_MODEL = "RealESRGAN_x4plus_anime_6B.pth"
COMFY_OUTPUT_DIR = os.path.join(os.path.dirname(COMFY_INPUT_DIR), "output")
MODELS_DIR = os.path.join(os.path.dirname(COMFY_INPUT_DIR), "models")


# ──────────────────────────────────────────────────────────
# 무엇을 쓸 수 있는가 (화면이 이걸 보고 안내를 바꾼다)
# ──────────────────────────────────────────────────────────
def _get(url, timeout=2):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.load(r)
    except Exception:
        return None


async def capabilities(request):
    comfy = _get(COMFY_URL + "/system_stats")
    tags = _get(OLLAMA + "/api/tags")
    models = [m.get("name") for m in (tags or {}).get("models", [])]
    dm = os.path.join(MODELS_DIR, "diffusion_models")
    있는모델 = os.listdir(dm) if os.path.isdir(dm) else []
    return web.json_response({
        "comfy": {
            "켜짐": bool(comfy),
            "모델": [m for m in 있는모델 if m.endswith(".safetensors")],
            "그림": any("ti2v" in m.lower() for m in 있는모델),
            "영상": any("ti2v" in m.lower() for m in 있는모델),
        },
        "ollama": {"켜짐": bool(tags), "모델": models},
        "업스케일": os.path.isfile(os.path.join(MODELS_DIR, "upscale_models", UPSCALE_MODEL)),
        "3d": any("hunyuan3d" in f.lower()
                  for f in (os.listdir(os.path.join(MODELS_DIR, "checkpoints"))
                            if os.path.isdir(os.path.join(MODELS_DIR, "checkpoints")) else [])),
    })


# ──────────────────────────────────────────────────────────
# ✍ 로컬 LLM — 옮기는 일만 시킨다
# ──────────────────────────────────────────────────────────
JOBS_PROMPT = {
    "영어로": ("You translate Korean image descriptions into short English image prompts. "
              "Answer with ONLY the prompt, comma separated, no explanation, no quotes."),
    "다듬기": ("You rewrite an English image prompt to be clearer and more visual. "
              "Answer with ONLY the prompt, comma separated, no explanation."),
    "자막다듬기": ("너는 한국어 자막을 더 짧고 읽기 쉽게 다듬는다. "
                 "설명 없이 다듬은 문장만 답한다. 문장 뜻은 바꾸지 않는다."),
}


async def ask(request):
    """로컬 LLM 에게 짧은 일 하나 시키기"""
    body = await request.json()
    할일 = body.get("할일") or "영어로"
    글 = str(body.get("글") or "").strip()
    if not 글:
        return web.json_response({"error": "글이 필요합니다."}, status=400)
    system = JOBS_PROMPT.get(할일, JOBS_PROMPT["영어로"])
    tags = _get(OLLAMA + "/api/tags")
    if not tags:
        return web.json_response({"error": "로컬 LLM(Ollama)이 꺼져 있습니다."}, status=503)
    model = body.get("모델") or (tags.get("models") or [{}])[0].get("name") or "exaone3.5:2.4b"
    payload = json.dumps({
        "model": model, "stream": False,
        "options": {"temperature": 0.4, "num_predict": 220},
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": 글}],
    }).encode()
    req = urllib.request.Request(OLLAMA + "/api/chat", data=payload,
                                 headers={"Content-Type": "application/json"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            d = json.load(r)
    except Exception as e:
        return web.json_response({"error": "로컬 LLM 오류: " + str(e)[:160]}, status=502)
    답 = (d.get("message") or {}).get("content", "").strip()
    답 = re.sub(r"^```[a-z]*|```$", "", 답).strip().strip('"')
    return web.json_response({"답": 답, "모델": model, "걸린초": round(time.time() - t0, 1)})


# ──────────────────────────────────────────────────────────
# ✂ 이미지 다듬기 — 올린 그림을 손보고 돌려준다
# ──────────────────────────────────────────────────────────
def _read_data_url(durl):
    from PIL import Image
    if not isinstance(durl, str) or "," not in durl:
        raise ValueError("이미지가 없습니다.")
    raw = base64.b64decode(durl.split(",", 1)[1])
    return Image.open(_io.BytesIO(raw)).convert("RGBA")


def _to_data_url(img, fmt="PNG"):
    buf = _io.BytesIO()
    img.save(buf, fmt)
    return f"data:image/{fmt.lower()};base64," + base64.b64encode(buf.getvalue()).decode()


def _fill_holes(img, 부드럽게=3):
    """투명한 곳을 **가장 가까운 색으로 메운다** (간단 인페인팅).

    제대로 된 인페인팅 모델은 없다. 대신 만화처럼 **납작한 색 배경**에는
    '가장 가까운 성한 픽셀의 색으로 채우기'가 놀랄 만큼 잘 듣는다.
    (scipy 의 거리변환으로 한 번에 구한다 — 반복 계산이 없다)

    잘 되는 것: 하늘·잔디·벽처럼 색이 고른 배경
    안 되는 것: 무늬·글자·복잡한 그림 — 늘어난 자국이 남는다
    """
    import numpy as np
    from PIL import Image, ImageFilter
    from scipy import ndimage

    a = np.array(img.convert("RGBA"))
    구멍 = a[..., 3] < 128
    if not 구멍.any() or 구멍.all():
        return img
    # 각 구멍 픽셀에서 가장 가까운 '성한 픽셀'의 자리를 찾는다
    _, 자리 = ndimage.distance_transform_edt(구멍, return_indices=True)
    채운것 = a.copy()
    채운것[..., :3] = a[자리[0], 자리[1], :3]
    채운것[..., 3] = 255
    나온것 = Image.fromarray(채운것)
    if 부드럽게 > 0:
        # 메운 자리만 살짝 흐리게 해서 이음매를 지운다
        흐림 = 나온것.filter(ImageFilter.GaussianBlur(부드럽게))
        마스크 = Image.fromarray((구멍 * 255).astype("uint8")).filter(
            ImageFilter.GaussianBlur(부드럽게))
        나온것 = Image.composite(흐림, 나온것, 마스크)
    return 나온것


async def fill_image(request):
    """캐릭터를 지운 자리를 배경색으로 메운다 (배경만 남기기)"""
    body = await request.json()
    try:
        img = _read_data_url(body.get("image"))
    except Exception as e:
        return web.json_response({"error": str(e)[:120]}, status=400)
    한일 = []
    # ① 먼저 오려낼 것을 정한다 — 색으로 고르거나, 이미 투명한 곳을 쓴다
    if body.get("먼저지우기"):
        import numpy as np
        import sprites
        from PIL import Image
        a = np.array(img)
        fg, soft = sprites.background_alpha(a, mode=body.get("방식") or "auto",
                                            tol=int(body.get("허용") or 26))
        # 배경 지우기는 '배경'을 남긴다 — 우리는 반대로 **앞것(캐릭터)** 을 지운다.
        # 지울 자리를 조금 넓혀야 테두리 색이 안 남는다.
        from scipy import ndimage
        넓힌것 = ndimage.binary_dilation(fg, iterations=int(body.get("넓히기") or 3))
        a[..., 3] = np.where(넓힌것, 0, 255).astype("uint8")
        img = Image.fromarray(a)
        한일.append("앞것 지우기")
    try:
        img = _fill_holes(img, int(body.get("부드럽게") or 3))
        한일.append("빈 곳 메우기")
    except Exception as e:
        return web.json_response({"error": "메우기 실패: " + str(e)[:160]}, status=500)
    return web.json_response({"ok": True, "image": _to_data_url(img.convert("RGB"), "PNG"),
                              "가로": img.width, "세로": img.height, "한일": 한일})


async def edit_image(request):
    """자르기 · 배경 지우기 · 크기 맞추기 — 한 번에 시킨 것만 한다"""
    body = await request.json()
    try:
        img = _read_data_url(body.get("image"))
    except Exception as e:
        return web.json_response({"error": str(e)[:120]}, status=400)
    한일 = []

    자르기 = body.get("자르기")          # {x,y,w,h} 0~1 비율
    if isinstance(자르기, dict):
        W, H = img.size
        x = max(0, min(1, float(자르기.get("x", 0)))) * W
        y = max(0, min(1, float(자르기.get("y", 0)))) * H
        w = max(0.02, min(1, float(자르기.get("w", 1)))) * W
        h = max(0.02, min(1, float(자르기.get("h", 1)))) * H
        img = img.crop((int(x), int(y), int(min(W, x + w)), int(min(H, y + h))))
        한일.append(f"자르기 {img.width}×{img.height}")

    if body.get("배경지우기"):
        # 주의: background_alpha 는 그림이 아니라 **(앞것 마스크, 부드러운 알파)** 를 준다
        import numpy as np
        import sprites
        from PIL import Image
        a = np.array(img)
        fg, soft = sprites.background_alpha(a, mode=body.get("방식") or "auto",
                                            tol=int(body.get("허용") or 26))
        a[..., 3] = (np.clip(soft, 0, 1) * 255).astype("uint8")
        img = Image.fromarray(a)
        한일.append("배경 지우기")

    긴변 = int(body.get("긴변") or 0)
    if 긴변 > 0:
        w, h = img.size
        k = 긴변 / max(w, h)
        if abs(k - 1) > 0.01:
            from PIL import Image
            img = img.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
            한일.append(f"크기 {img.width}×{img.height}")

    if body.get("다듬기"):               # 투명한 가장자리 잘라내기
        bb = img.getbbox()
        if bb:
            img = img.crop(bb)
            한일.append("여백 잘라내기")

    return web.json_response({"ok": True, "image": _to_data_url(img),
                              "가로": img.width, "세로": img.height,
                              "한일": 한일 or ["아무것도 안 함"]})


# ──────────────────────────────────────────────────────────
# 🔎 키우기 (업스케일) — ComfyUI 의 RealESRGAN
# ──────────────────────────────────────────────────────────
async def upscale(request):
    body = await request.json()
    durl = body.get("image")
    if not isinstance(durl, str) or "," not in durl:
        return web.json_response({"error": "이미지가 없습니다."}, status=400)
    if not os.path.isfile(os.path.join(MODELS_DIR, "upscale_models", UPSCALE_MODEL)):
        return web.json_response({"error": "업스케일 모델이 없습니다."}, status=503)
    os.makedirs(COMFY_INPUT_DIR, exist_ok=True)
    이름 = "st_up_%x.png" % int(time.time() * 1000)
    with open(os.path.join(COMFY_INPUT_DIR, 이름), "wb") as f:
        f.write(base64.b64decode(durl.split(",", 1)[1]))
    prefix = "studio/up_%x" % int(time.time() * 1000)
    wf = {
        "1": {"class_type": "LoadImage", "inputs": {"image": 이름}},
        "2": {"class_type": "UpscaleModelLoader", "inputs": {"model_name": UPSCALE_MODEL}},
        "3": {"class_type": "ImageUpscaleWithModel",
              "inputs": {"upscale_model": ["2", 0], "image": ["1", 0]}},
        "4": {"class_type": "SaveImage", "inputs": {"images": ["3", 0], "filename_prefix": prefix}},
    }
    jid = job_id("job_up")
    JOBS[jid] = {"state": "running", "progress": 5, "note": "키우는 중"}
    import asyncio
    asyncio.create_task(_run_comfy(jid, wf, "키우기"))
    return web.json_response({"ok": True, "job": jid})


async def _run_comfy(jid, wf, 이름="만들기"):
    """ComfyUI 에 넣고 끝날 때까지 지켜본 뒤, 나온 그림을 데이터 URL 로 돌려준다"""
    import asyncio
    from aiohttp import ClientSession
    try:
        async with ClientSession() as sess:
            async with sess.post(COMFY_URL + "/prompt", json={"prompt": wf}) as r:
                body = await r.json()
                if r.status != 200 or body.get("node_errors"):
                    raise RuntimeError(json.dumps(body.get("node_errors") or body)[:300])
            pid = body["prompt_id"]
            for i in range(180):
                await asyncio.sleep(2)
                async with sess.get(COMFY_URL + f"/history/{pid}") as r:
                    hist = await r.json()
                e = hist.get(pid)
                if not e:
                    JOBS[jid]["progress"] = min(90, 10 + i * 2)
                    continue
                if e.get("status", {}).get("status_str") == "error":
                    raise RuntimeError(str(e.get("status"))[:300])
                if e.get("status", {}).get("completed"):
                    for out in e.get("outputs", {}).values():
                        for f in out.get("images", []) or []:
                            p = os.path.join(COMFY_OUTPUT_DIR, f.get("subfolder", ""), f["filename"])
                            if os.path.isfile(p):
                                with open(p, "rb") as fh:
                                    b64 = base64.b64encode(fh.read()).decode()
                                JOBS[jid] = {"state": "done", "progress": 100,
                                             "image": "data:image/png;base64," + b64,
                                             "note": 이름 + " 끝"}
                                return
                    raise RuntimeError("결과가 없습니다.")
            raise RuntimeError("너무 오래 걸립니다.")
    except Exception as e:
        JOBS[jid] = {"state": "error", "progress": 100, "error": str(e)[:300]}


# ──────────────────────────────────────────────────────────
# 💾 만든 것을 자산으로 넣기
# ──────────────────────────────────────────────────────────
async def keep(request):
    """스튜디오에서 만든 그림을 배경·캐릭터로 등록한다"""
    body = await request.json()
    종류 = body.get("kind")
    이름 = str(body.get("name") or "").strip()
    durl = body.get("image")
    if not 이름 or not isinstance(durl, str) or "," not in durl:
        return web.json_response({"error": "이름과 그림이 필요합니다."}, status=400)
    raw = base64.b64decode(durl.split(",", 1)[1])
    from paths import BG_DIR, CHAR_DIR, names_in_dir, unique_name
    if 종류 == "캐릭터":
        from api.characters import _char_names
        os.makedirs(CHAR_DIR, exist_ok=True)
        cid = "ch_%x" % int(time.time() * 1000)
        d = os.path.join(CHAR_DIR, cid)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "front.png"), "wb") as f:
            f.write(raw)
        from api.tags import clean_tags, suggest
        이름2 = unique_name(이름, _char_names(), default="캐릭터", limit=30)
        m = {"id": cid, "name": 이름2, "poses": ["front"], "created": time.time(),
             "made": True, "출처": body.get("출처") or "다듬음",
             "tags": clean_tags(body.get("tags")) or suggest(이름2, "캐릭터")}
        with open(os.path.join(d, "meta.json"), "w", encoding="utf-8") as f:
            json.dump(m, f, ensure_ascii=False)
    else:
        os.makedirs(BG_DIR, exist_ok=True)
        bid = "bg_%x" % int(time.time() * 1000)
        with open(os.path.join(BG_DIR, bid + ".png"), "wb") as f:
            f.write(raw)
        from api.tags import clean_tags, suggest
        이름2 = unique_name(이름, names_in_dir(BG_DIR), default="배경")
        m = {"id": bid, "name": 이름2, "file": bid + ".png", "created": time.time(),
             "made": True, "출처": body.get("출처") or "다듬음",
             "tags": clean_tags(body.get("tags")) or suggest(이름2, "배경")}
        with open(os.path.join(BG_DIR, bid + ".json"), "w", encoding="utf-8") as f:
            json.dump(m, f, ensure_ascii=False)
    return web.json_response({"ok": True, "item": m})


def register(app):
    app.router.add_get("/api/studio/can", capabilities)
    app.router.add_post("/api/studio/ask", ask)
    app.router.add_post("/api/studio/edit", edit_image)
    app.router.add_post("/api/studio/fill", fill_image)
    app.router.add_post("/api/studio/upscale", upscale)
    app.router.add_post("/api/studio/keep", keep)
