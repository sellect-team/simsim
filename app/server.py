# 심심 공작소 - 로컬 서버
# 채팅(Claude CLI) -> Wan 2.2 5B 워크플로우 생성 -> ComfyUI 실행
import asyncio
import json
import os
import random
import sys
import re
import shutil
import subprocess
import threading
import time
import traceback

import aiohttp
from aiohttp import web, ClientSession

APP_DIR = os.path.dirname(os.path.abspath(__file__))
# 임베디드 파이썬은 스크립트 폴더를 자동으로 넣지 않으므로 직접 추가한다
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

import api                                     # noqa: E402 (sys.path 설정 후에 불러와야 함)
from paths import (AUDIO_DIR, BG_DIR, CHAR_DIR, COMFY_INPUT_DIR, COMFY_URL,  # noqa: E402
                   FRAMES_DIR, JOBS, MUSIC_DIR, PORT, SHAPES_DIR, TEMPLATES_PATH,
                   TRASH_DIR, VIDEOS_META_PATH, VIDEO_DIR, VIDEO_EXT_RE,
                   load_videos_meta, safe_video_path, save_videos_meta)

DEFAULT_SETTINGS = {
    "prompt": "",
    "negative": "blurry, low quality, distorted, watermark, text, ugly, deformed, "
                "flickering, jittering, shaking, trembling, wobbling lines",
    "width": 1280,
    "height": 704,
    "seconds": 3,
    "steps": 20,
    "seed": -1,
    "cfg": 5.0,
    "sampler": "uni_pc",
    "scheduler": "simple",
    "shift": 8.0,
    "denoise": 1.0,
    "frame_hold": 1,
    "stabilize": 2,
    "speed": 1.0,
    "turbo": False,
    "smooth": True,
    "interpolate": 1,
    "format": "mp4",
    "filename": "studio",
    "start_image": None,
}


SAMPLERS = ["uni_pc", "euler", "euler_ancestral", "dpmpp_2m", "dpmpp_2m_sde",
            "dpmpp_3m_sde", "ddim", "lcm", "res_multistep", "heun"]
SCHEDULERS = ["simple", "normal", "karras", "exponential", "sgm_uniform",
              "beta", "ddim_uniform", "kl_optimal", "linear_quadratic"]

DEFAULT_TEMPLATES = {
    "고품질 (1280×704 · 3초 · 20스텝) ★기본": dict(DEFAULT_SETTINGS),
    "중간 화질 (960×544 · 3초 · 20스텝)": {
        **DEFAULT_SETTINGS, "width": 960, "height": 544},
    "2D 애니 스타일 (1280×704 · 3초 · 2프레임 홀드)": {
        **DEFAULT_SETTINGS,
        "frame_hold": 2,
        "prompt": "2D anime style, cel shading, clean lineart, detailed illustration, "
                  "soft lighting, high quality, smooth animation",
        "negative": "photorealistic, 3d render, photo, realistic, blurry, low quality, "
                    "watermark, text, deformed, flickering, jittering"},
    "빠른 테스트 (480×272 · 1초 · 8스텝, 저화질)": {
        **DEFAULT_SETTINGS, "width": 480, "height": 272, "seconds": 1, "steps": 8},
    "최고 품질 (1280×704 · 5초 · 30스텝, 매우 느림)": {
        **DEFAULT_SETTINGS, "seconds": 5, "steps": 30},
}


def load_templates():
    if not os.path.exists(TEMPLATES_PATH):
        save_templates(DEFAULT_TEMPLATES)
        return dict(DEFAULT_TEMPLATES)
    with open(TEMPLATES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_templates(templates):
    with open(TEMPLATES_PATH, "w", encoding="utf-8") as f:
        json.dump(templates, f, ensure_ascii=False, indent=2)

CLAUDE_INSTRUCTION = """You are the planning engine of a local text-to-video app using the Wan 2.2 5B model.
The user writes in Korean (or any language) describing a video they want, or asking to modify current settings.
This user primarily makes 2D CARTOON/ANIME style ANIMATIONS. Unless they clearly ask for a
realistic/photographic/3D look, write prompts in a HIGH-QUALITY 2D ANIME style using wording this
model is good at: "2D anime style, cel shading, clean lineart, detailed illustration, soft lighting,
high quality, smooth animation". NEVER use "minimal vector", "flat design" or "simple shapes"
wording — it visibly degrades this model's output quality. Add "photorealistic, 3d render, photo,
realistic" to the negative prompt for 2D looks.

HARDWARE (respect these limits): laptop RTX 5070 Ti, 12GB VRAM, 32GB RAM.
- Never exceed 1280x704 resolution or 5 seconds.
- Rough generation time scales with width*height*frames*steps. Guide:
  * fast preview: 640x352, 10-12 steps (about 1-3 min) — visibly low quality, tests only
  * balanced: 960x544, 20 steps (about 4-8 min)
  * high quality: 1280x704 (native), 20 steps (about 10-20 min) — best results
- If the user asks for speed / a test / "빨리", choose fast preview. If they ask for best quality, high quality.
  Otherwise prefer balanced or high quality. For the 2D-animation feel use frame_hold 2, NOT lower resolution.

Current settings JSON:
{current}

User message:
{message}

Reply with ONLY a raw JSON object (no markdown fence, no extra text) with these keys:
- "reply": short friendly Korean sentence summarizing what you set up or changed
- "prompt": detailed English video prompt (scene, subject, motion, camera, lighting, style). Keep user's intent; if user asked a modification, modify the current prompt accordingly.
  SUBJECT FIDELITY RULES (critical — this 5B model easily draws malformed subjects):
  * Describe ONE clear main subject concretely: species/type, colors, distinctive body parts, pose, what it is doing (e.g. "a cartoon orange tabby cat with pointed ears, white paws and a long tail, walking to the right").
  * Keep the scene simple: one subject + a simple background. Crowds or multiple animals often come out deformed.
  * Style words support the subject, never replace it — avoid abstract-only prompts like "minimal vector shapes".
  * Prefer slow, simple motions (walking, floating, waving); fast/complex actions deform anatomy.
  * When the user specifies WHICH parts should move (especially with a start image), end the prompt
    with this exact pattern: "Motion: only <moving parts>. Everything else is a completely static
    illustration — no other movement, no transformation, no morphing, camera locked."
  * MINIMAL MOTION RULE (critical — the user hates unnecessary movement): for i2v idle animations,
    pick ONE single subtle motion (two at most). More motions = the model morphs and ruins the image.
    Also set "shift" to 4 or 5 for minimal-motion i2v (8 makes big movements), and add
    "morphing, transformation, background motion, extra movement" to the negative prompt.
- "negative": English negative prompt
- "width": int, multiple of 16 (default 1280, the model's native resolution; max 1280)
- "height": int, multiple of 16 (default 704; max 704)
- "seconds": int 1-10 (video length in seconds, default 3). 6-10 seconds is auto-split into
  chained 5s segments (last frame continues into the next segment) — suggest lower resolution
  (e.g. 512x512 or 640x352) for long videos to keep generation time reasonable.
- "steps": int 8-30 (default 20). NEVER go below 20 for a final render — below ~15 steps subjects
  become malformed blobs (not just blurry). Use 8-12 only when the user explicitly asks for a rough draft.
Optional keys (include only when the user asks or it clearly helps):
- "cfg": float 1-10 (default 5; higher = follows prompt more strictly)
- "sampler": one of uni_pc, euler, euler_ancestral, dpmpp_2m, dpmpp_2m_sde, dpmpp_3m_sde, ddim, lcm, res_multistep, heun (default uni_pc)
- "scheduler": one of simple, normal, karras, exponential, sgm_uniform, beta, ddim_uniform, kl_optimal, linear_quadratic (default simple)
- "shift": float 1-12 (default 8)
- "turbo": true/false (default false). Turbo LoRA mode: 6 steps, cfg 1 — about 5x faster with
  slightly lower quality. Great for drafts and i2v; set true when the user asks for speed.
- "frame_hold": int 1, 2 or 3 (default 1). Video is ALWAYS generated at the model's native 24fps
  (never change that — lower generation fps degrades quality). frame_hold thins frames AFTER
  generation for a classic 2D-animation look: 1 = smooth 24fps, 2 = "on twos" 12fps feel
  (recommended for 2D cartoon), 3 = "on threes" 8fps feel.
- "speed": float 0.25-2.0 (default 1.0; playback speed — frames stay the same, video plays slower/faster)
Rules: keep 1280x704 for best quality (going lower visibly degrades output). Suggest smaller sizes only when the user asks for speed/tests. Keep aspect sensible for the scene."""


def build_workflow(s):
    seed = s.get("seed", -1)
    if seed is None or int(seed) < 0:
        seed = random.randint(0, 2**48)
    # 공식 ComfyUI Wan 2.2 5B 템플릿 기준: 항상 네이티브 24fps로 생성 (다른 fps는 품질 저하)
    NATIVE_FPS = 24
    speed = max(0.25, min(2.0, float(s.get("speed", 1.0))))
    out_fps = max(1.0, min(60.0, NATIVE_FPS * speed))
    length = int(s["seconds"]) * NATIVE_FPS + 1
    sampler = s.get("sampler", "uni_pc")
    if sampler not in SAMPLERS:
        sampler = "uni_pc"
    scheduler = s.get("scheduler", "simple")
    if scheduler not in SCHEDULERS:
        scheduler = "simple"
    fmt = s.get("format", "mp4")
    if fmt not in ("mp4", "webm", "webp"):
        fmt = "mp4"
    filename = re.sub(r"[^\w\-가-힣]", "_", (s.get("filename") or "studio").strip()) or "studio"

    # 터보 LoRA는 그림을 붕괴시키는 것이 실측으로 확인되어 완전히 비활성화됨
    turbo = False
    steps = int(s["steps"])
    cfg = float(s.get("cfg", 5.0))
    if turbo:
        steps = max(4, min(8, steps if steps <= 8 else 6))
        cfg = 1.0
    model_src = ["61", 0] if turbo else ["37", 0]
    # 시작+끝 이미지가 모두 있으면 Fun-InP 모델(진짜 first-last-frame)을 사용
    flf = bool(s.get("start_image") and s.get("end_image")) and os.path.exists(
        os.path.join(MODELS_DIR, "diffusion_models", FUN_INPAINT_MODEL))
    unet_name = FUN_INPAINT_MODEL if flf else "wan2.2_ti2v_5B_fp16.safetensors"
    wf = {
        "37": {"class_type": "UNETLoader", "inputs": {
            "unet_name": unet_name, "weight_dtype": "default"}},
        "38": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default"}},
        "39": {"class_type": "VAELoader", "inputs": {"vae_name": "wan2.2_vae.safetensors"}},
        "48": {"class_type": "ModelSamplingSD3", "inputs": {
            "model": model_src, "shift": float(s.get("shift", 8.0))}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["38", 0], "text": s["prompt"]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["38", 0], "text": s["negative"]}},
        "55": {"class_type": "Wan22ImageToVideoLatent", "inputs": {
            "vae": ["39", 0], "width": int(s["width"]), "height": int(s["height"]),
            "length": length, "batch_size": 1}},
        "3": {"class_type": "KSampler", "inputs": {
            "model": ["48", 0], "positive": ["6", 0], "negative": ["7", 0],
            "latent_image": ["55", 0], "seed": int(seed), "steps": steps,
            "cfg": cfg, "sampler_name": sampler,
            "scheduler": scheduler, "denoise": float(s.get("denoise", 1.0))}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["39", 0]}},
    }
    # 프레임 보간: 적은 프레임으로 생성한 뒤 중간 프레임을 만들어 움직임을 부드럽게
    interp = int(s.get("interpolate", 1))
    images_src = ["8", 0]
    if interp in (2, 3, 4) and os.path.exists(os.path.join(
            MODELS_DIR, "frame_interpolation", INTERP_MODEL)):
        wf["70"] = {"class_type": "FrameInterpolationModelLoader",
                    "inputs": {"model_name": INTERP_MODEL}}
        wf["71"] = {"class_type": "FrameInterpolate", "inputs": {
            "interp_model": ["70", 0], "images": ["8", 0], "multiplier": interp}}
        images_src = ["71", 0]
        # fps는 그대로 두어 보간이 '재생 길이'를 채우게 한다
        # (목표 N초 = N/interp초만 생성 → interp배 보간 → 다시 N초, 더 부드럽고 빠름)
    if turbo:
        wf["61"] = {"class_type": "LoraLoaderModelOnly", "inputs": {
            "model": ["37", 0],
            "lora_name": "Wan22_TI2V_5B_Turbo_lora_rank_64_fp16.safetensors",
            "strength_model": 1.0}}
    if fmt == "webp":
        wf["58"] = {"class_type": "SaveAnimatedWEBP", "inputs": {
            "images": images_src, "filename_prefix": "video/" + filename,
            "fps": out_fps, "lossless": False, "quality": 90, "method": "default"}}
    else:
        wf["57"] = {"class_type": "CreateVideo",
                    "inputs": {"images": images_src, "fps": out_fps}}
        wf["58"] = {"class_type": "SaveVideo", "inputs": {
            "video": ["57", 0], "filename_prefix": "video/" + filename,
            "format": fmt, "codec": "auto"}}
    if flf:
        # Fun-InP: 시작·끝 프레임을 모두 고정하고 그 사이를 모델이 생성 (드리프트 없음)
        wf["55"] = {"class_type": "WanFunInpaintToVideo", "inputs": {
            "positive": ["6", 0], "negative": ["7", 0], "vae": ["39", 0],
            "width": int(s["width"]), "height": int(s["height"]),
            "length": length, "batch_size": 1,
            "start_image": ["60", 0], "end_image": ["62", 0]}}
        wf["60"] = {"class_type": "LoadImage", "inputs": {"image": s["start_image"]}}
        wf["62"] = {"class_type": "LoadImage", "inputs": {"image": s["end_image"]}}
        wf["3"]["inputs"]["positive"] = ["55", 0]
        wf["3"]["inputs"]["negative"] = ["55", 1]
        wf["3"]["inputs"]["latent_image"] = ["55", 2]
    elif s.get("start_image"):
        wf["60"] = {"class_type": "LoadImage", "inputs": {"image": s["start_image"]}}
        wf["55"]["inputs"]["start_image"] = ["60", 0]
    return wf


def extract_json(text):
    text = text.strip()
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        raise ValueError("no JSON in claude output: " + text[:200])
    return json.loads(m.group(0))


"""한국어 → 영어 프롬프트 사전 (완전 로컬, 외부 LLM 불필요)"""
KO_EN = [
    # 피사체
    (("강아지", "개", "puppy", "dog"), "a cute puppy"),
    (("고양이", "냥이", "cat"), "a cute cat"),
    (("소녀", "여자아이", "girl"), "a cute girl"),
    (("소년", "남자아이", "boy"), "a cute boy"),
    (("사람", "인물", "캐릭터"), "a character"),
    (("토끼",), "a cute rabbit"), (("곰",), "a cute bear"),
    (("새", "새가"), "a small bird"), (("물고기",), "a fish"),
    (("자동차", "차가"), "a car"), (("우주선",), "a spaceship"),
    (("열기구",), "a hot air balloon"), (("배", "돛단배"), "a small boat"),
    # 장소·배경
    (("공원",), "in a park"), (("바다", "해변"), "by the sea"),
    (("숲", "나무"), "in a forest"), (("도시", "거리"), "in a city street"),
    (("하늘",), "in the sky"), (("방", "실내"), "in a cozy room"),
    (("학교",), "at school"), (("카페",), "in a cafe"),
    (("초원", "들판"), "in a green meadow"), (("산",), "in the mountains"),
    (("눈", "겨울"), "in a snowy winter scene"), (("비", "장마"), "in the rain"),
    (("벚꽃", "봄"), "with cherry blossoms"), (("노을", "석양"), "at sunset"),
    (("밤", "야경"), "at night"), (("아침",), "in the morning light"),
    # 동작
    (("걷", "산책"), "walking slowly"), (("뛰", "달리"), "running"),
    (("앉", "앉아"), "sitting"), (("웃", "미소"), "smiling gently"),
    (("잠", "자는"), "sleeping peacefully"), (("먹",), "eating"),
    (("춤",), "dancing"), (("날", "비행"), "flying"),
    (("손 흔", "인사"), "waving a hand"), (("점프", "뛰어오"), "jumping"),
    # 스타일
    (("만화", "카툰", "애니"), "2D anime style, cel shading, clean lineart"),
    (("웹툰",), "2D webtoon style, soft pastel colors, clean lineart"),
    (("수채화",), "soft watercolor illustration style"),
    (("동화",), "storybook illustration style"),
    (("실사", "사진"), "photorealistic, cinematic"),
    (("귀엽", "귀여운"), "cute, adorable"),
    (("따뜻",), "warm cozy lighting"), (("차가", "쓸쓸"), "cool blue tones"),
]
SIZE_HINTS = [(("고화질", "고품질", "선명"), (1280, 704, 24)),
              (("빠르", "빨리", "테스트", "미리"), (640, 352, 12)),
              (("세로", "쇼츠", "릴스"), (704, 1280, 20))]


def build_prompt_locally(message, current):
    msg = message.lower()
    parts, notes = [], []
    for keys, en in KO_EN:
        if any(k in msg for k in keys):
            parts.append(en)
            notes.append(keys[0])
    settings = dict(current)
    for keys, (w, h, st) in SIZE_HINTS:
        if any(k in msg for k in keys):
            settings.update({"width": w, "height": h, "steps": st})
            break
    if not any("style" in p or "cinematic" in p for p in parts):
        parts.append("2D anime style, cel shading, clean lineart")
    parts.append("high quality, smooth animation")
    settings["prompt"] = ", ".join(dict.fromkeys(parts))
    settings["negative"] = FAITHFUL_NEGATIVE if current.get("start_image") else (
        "photorealistic, 3d render, photo, blurry, low quality, watermark, text, "
        "deformed, extra limbs, flickering, jittering")
    reply = ("인식한 키워드: " + ", ".join(notes) if notes else
             "아는 단어를 찾지 못해 기본 스타일로 만들었어요") + \
        " → 프롬프트를 만들었습니다. 오른쪽에서 자유롭게 수정하세요."
    return {"reply": reply, "settings": settings}


async def api_chat(request):
    data = await request.json()
    message = data.get("message", "").strip()
    current = data.get("settings") or DEFAULT_SETTINGS
    if not message:
        return web.json_response({"error": "빈 메시지입니다."}, status=400)
    # 완전 로컬 사전 방식 (외부 LLM/로그인 불필요)
    return web.json_response(build_prompt_locally(message, current))


async def _api_chat_llm_unused(request):
    data = await request.json()
    message = data.get("message", "").strip()
    current = data.get("settings") or DEFAULT_SETTINGS
    claude = shutil.which("claude") or shutil.which("claude.cmd")
    if not claude:
        return web.json_response({"error": "claude CLI를 찾을 수 없습니다."}, status=500)

    instruction = CLAUDE_INSTRUCTION.format(
        current=json.dumps(current, ensure_ascii=False), message=message)
    try:
        proc = await asyncio.create_subprocess_exec(
            claude, "-p", instruction, "--output-format", "text",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        out, err = await asyncio.wait_for(proc.communicate(), timeout=120)
    except asyncio.TimeoutError:
        return web.json_response({"error": "Claude 응답 시간 초과(120초)"}, status=504)

    text = out.decode("utf-8", "ignore")
    if proc.returncode != 0:
        combined = (text + " " + err.decode("utf-8", "ignore")).strip()
        if "Not logged in" in combined or "/login" in combined:
            return web.json_response({"error": (
                "Claude 로그인이 필요합니다. 터미널(명령 프롬프트)을 열고 "
                "'claude /login'을 실행해 로그인한 뒤 다시 시도하세요. (최초 1회만)")}, status=401)
        return web.json_response({"error": "claude CLI 오류: " + combined[:300]}, status=500)
    try:
        result = extract_json(text)
    except Exception as e:
        return web.json_response({"error": "응답 해석 실패: " + str(e)}, status=500)

    settings = dict(current)
    for k in ("prompt", "negative", "width", "height", "seconds", "steps",
              "cfg", "sampler", "scheduler", "shift", "frame_hold", "speed"):
        if k in result:
            settings[k] = result[k]
    settings["seconds"] = max(1, min(10, int(settings["seconds"])))
    settings["steps"] = max(8, min(30, int(settings["steps"])))
    settings["width"] = max(256, min(1280, int(settings["width"]) // 16 * 16))
    settings["height"] = max(256, min(704, int(settings["height"]) // 16 * 16))
    settings["cfg"] = max(1.0, min(10.0, float(settings.get("cfg", 5.0))))
    settings["shift"] = max(1.0, min(12.0, float(settings.get("shift", 8.0))))
    settings["frame_hold"] = int(settings.get("frame_hold", 1))
    if settings["frame_hold"] not in (1, 2, 3):
        settings["frame_hold"] = 1
    settings["speed"] = max(0.25, min(2.0, float(settings.get("speed", 1.0))))
    return web.json_response({
        "reply": result.get("reply", "설정을 준비했어요."), "settings": settings})


PENDING_SETTINGS = {}
THUMBS_DIR = os.path.join(APP_DIR, "thumbs")


def settings_from_api_workflow(wf):
    try:
        g = lambda nid: (wf.get(nid) or {}).get("inputs") or {}
        ks, lat = g("3"), g("55")
        if not ks or not lat:
            return None
        s = dict(DEFAULT_SETTINGS)
        sv = g("58")
        prefix = sv.get("filename_prefix", "video/studio")
        s.update({
            "prompt": g("6").get("text", ""),
            "negative": g("7").get("text", s["negative"]),
            "width": lat.get("width", 1280), "height": lat.get("height", 704),
            "seconds": max(1, min(10, round((lat.get("length", 73) - 1) / 24))),
            "steps": ks.get("steps", 20), "cfg": ks.get("cfg", 5.0),
            "sampler": ks.get("sampler_name", "uni_pc"),
            "scheduler": ks.get("scheduler", "simple"),
            "seed": ks.get("seed", -1), "denoise": ks.get("denoise", 1.0),
            "shift": g("48").get("shift", 8.0),
            "start_image": g("60").get("image") if wf.get("60") else None,
            "filename": prefix.split("/", 1)[-1] or "studio",
        })
        if (wf.get("58") or {}).get("class_type") == "SaveAnimatedWEBP":
            s["format"] = "webp"
        elif sv.get("format") in ("mp4", "webm"):
            s["format"] = sv.get("format")
        return s
    except Exception:
        return None


def record_video_settings(filenames, settings, duration=None):
    meta = load_videos_meta()
    changed = False
    for fn in filenames:
        if fn:
            entry = meta.setdefault(fn, {})
            if "settings" not in entry:
                entry["settings"] = settings
                changed = True
            if duration and not entry.get("duration"):
                entry["duration"] = round(float(duration), 1)
                changed = True
    if changed:
        save_videos_meta(meta)


def duration_from_history_entry(entry):
    try:
        t0 = t1 = None
        for m in entry.get("status", {}).get("messages", []):
            if m[0] == "execution_start":
                t0 = m[1].get("timestamp")
            elif m[0] in ("execution_success", "execution_error"):
                t1 = m[1].get("timestamp")
        if t0 and t1 and t1 > t0:
            return (t1 - t0) / 1000.0
    except Exception:
        pass
    return None


async def _submit_and_wait(wf, timeout_sec=3600):
    async with ClientSession() as sess:
        async with sess.post(COMFY_URL + "/prompt", json={"prompt": wf}) as r:
            body = await r.json()
            if r.status != 200 or body.get("node_errors"):
                raise RuntimeError("ComfyUI 오류: " + json.dumps(body)[:300])
        pid = body["prompt_id"]
        t0 = asyncio.get_event_loop().time()
        while True:
            await asyncio.sleep(5)
            async with sess.get(COMFY_URL + f"/history/{pid}") as r:
                hist = await r.json()
            entry = hist.get(pid)
            if entry:
                st = entry.get("status", {})
                if st.get("completed"):
                    for node_out in entry.get("outputs", {}).values():
                        for key in ("images", "video", "gifs"):
                            for f in node_out.get(key, []) or []:
                                if re.search(r"\.(mp4|webm)$", f.get("filename", ""), re.I):
                                    return f
                    raise RuntimeError("출력 파일을 찾지 못했습니다.")
                if st.get("status_str") == "error":
                    raise RuntimeError("구간 생성 실패")
            if asyncio.get_event_loop().time() - t0 > timeout_sec:
                raise RuntimeError("구간 생성 시간 초과")


def _extract_last_frame(path, out_png):
    import av
    last = None
    with av.open(path) as c:
        for frame in c.decode(video=0):
            last = frame
    if last is None:
        raise ValueError("프레임 없음")
    last.to_image().save(out_png)


def _concat_videos(paths, dest, fps=None, skip_first=True,
                   transition="cut", trans_frames=8):
    import av
    from PIL import Image
    clips = []
    for p in paths:
        fr = []
        with av.open(p) as c:
            if fps is None:
                r = c.streams.video[0].average_rate
                fps = float(r) if r else 24.0
            for f in c.decode(video=0):
                fr.append(f.to_image())
        clips.append(fr)
    frames = list(clips[0])
    for nxt in clips[1:]:
        nxt = list(nxt)
        if transition == "crossfade":
            k = max(2, min(trans_frames, len(frames) // 2, len(nxt) // 2))
            for i in range(k):
                t = (i + 1) / (k + 1)
                idx = len(frames) - k + i
                frames[idx] = Image.blend(frames[idx], nxt[i], t)
            frames.extend(nxt[k:])
        elif transition == "fade_white":
            k = max(2, min(trans_frames // 2, len(frames) // 2, len(nxt) // 2))
            white = Image.new("RGB", frames[0].size, "white")
            for i in range(k):
                t = (i + 1) / (k + 1)
                idx = len(frames) - k + i
                frames[idx] = Image.blend(frames[idx], white, t)
            for i in range(k):
                t = 1.0 - (i + 1) / (k + 1)
                nxt[i] = Image.blend(nxt[i], white, t)
            frames.extend(nxt)
        else:  # cut
            frames.extend(nxt[1:] if skip_first else nxt)
    with av.open(dest, "w") as out:
        vs = out.add_stream("h264", rate=int(round(fps)))
        vs.width, vs.height = frames[0].width, frames[0].height
        vs.pix_fmt = "yuv420p"
        for img in frames:
            for pkt in vs.encode(av.VideoFrame.from_image(img)):
                out.mux(pkt)
        for pkt in vs.encode():
            out.mux(pkt)


async def _run_long_job(job_id, settings):
    loop = asyncio.get_event_loop()
    t_start = time.time()
    try:
        total = max(1, min(10, int(settings["seconds"])))
        remaining = total
        cur = dict(settings)
        seg_paths = []
        seg_no = 0
        base_seed = int(settings.get("seed", -1))
        if base_seed < 0:
            base_seed = random.randint(0, 2**48)
        segments = []
        while remaining > 0:
            sec = min(5, remaining)
            remaining -= sec
            segments.append(sec)
        for sec in segments:
            seg_no += 1
            JOBS[job_id] = {"state": "running",
                            "note": f"{seg_no}/{len(segments)} 구간({sec}초) 생성 중"}
            seg = {**cur, "seconds": sec, "frame_hold": 1, "format": "mp4",
                   "filename": (settings.get("filename") or "long") + f"_part{seg_no}",
                   "seed": base_seed + seg_no}
            f = await _submit_and_wait(build_workflow(seg))
            seg_paths.append(os.path.join(VIDEO_DIR, f["filename"]))
            if seg_no < len(segments):
                png = f"long_{job_id}_seg{seg_no}.png"
                await loop.run_in_executor(
                    None, _extract_last_frame, seg_paths[-1],
                    os.path.join(COMFY_INPUT_DIR, png))
                cur["start_image"] = png
        base = re.sub(r"[^\w\-가-힣]", "_", (settings.get("filename") or "long"))
        out_name = f"{base}_{total}s_{job_id[-6:]}.mp4"
        dest = os.path.join(VIDEO_DIR, out_name)
        JOBS[job_id] = {"state": "running", "note": "구간을 이어붙이는 중"}
        await loop.run_in_executor(
            None, lambda: _concat_videos(seg_paths, dest, fps=24.0, skip_first=True))
        stab = int(settings.get("stabilize", 2))
        if stab in (1, 2, 3):
            JOBS[job_id] = {"state": "running", "note": "떨림 제거 중"}
            await loop.run_in_executor(None, _apply_stabilize, dest, stab)
        hold = int(settings.get("frame_hold", 1))
        if hold in (2, 3):
            JOBS[job_id] = {"state": "running", "note": "프레임 홀드 적용 중"}
            await loop.run_in_executor(None, _apply_frame_hold, dest, hold)
        record_video_settings([out_name], settings, duration=time.time() - t_start)
        JOBS[job_id] = {"state": "done", "files": [
            {"filename": out_name, "subfolder": "video", "type": "output"}]}
    except Exception as e:
        JOBS[job_id] = {"state": "error", "error": str(e)[:300]}


def _reverse_and_crossfade(path_a, path_b, dest, fade_frames=10, fps=24.0):
    """A(정방향) + B(역방향)를 크로스페이드로 연결 — 시작→끝 이미지 유사 FLF."""
    import av
    from PIL import Image
    def read_frames(p):
        out = []
        with av.open(p) as c:
            for fr in c.decode(video=0):
                out.append(fr.to_image())
        return out
    a = read_frames(path_a)
    b = read_frames(path_b)
    b.reverse()  # B는 끝 이미지에서 시작했으므로 뒤집으면 끝 이미지로 끝남
    k = max(2, min(fade_frames, len(a) // 2, len(b) // 2))
    blended = []
    for i in range(k):
        t = (i + 1) / (k + 1)
        blended.append(Image.blend(a[len(a) - k + i], b[i], t))
    frames = a[:len(a) - k] + blended + b[k:]
    with av.open(dest, "w") as out:
        vs = out.add_stream("h264", rate=int(round(fps)))
        vs.width, vs.height = frames[0].width, frames[0].height
        vs.pix_fmt = "yuv420p"
        for img in frames:
            for pkt in vs.encode(av.VideoFrame.from_image(img)):
                out.mux(pkt)
        for pkt in vs.encode():
            out.mux(pkt)


async def _run_flf_job(job_id, settings):
    """시작→끝 프레임 영상.
    Fun-InP 모델이 있으면 모델이 직접 보간(권장), 없으면 역재생+크로스페이드로 근사."""
    loop = asyncio.get_event_loop()
    t_start = time.time()
    if os.path.exists(os.path.join(MODELS_DIR, "diffusion_models", FUN_INPAINT_MODEL)):
        try:
            JOBS[job_id] = {"state": "running", "note": "시작→끝 프레임 생성 중 (Fun-InP 모델)"}
            f = await _submit_and_wait(build_workflow(settings))
            out_name = f["filename"]
            stab = int(settings.get("stabilize", 2))
            if stab in (1, 2, 3):
                JOBS[job_id] = {"state": "running", "note": "떨림 제거 중"}
                await loop.run_in_executor(
                    None, _apply_stabilize, os.path.join(VIDEO_DIR, out_name), stab)
            hold = int(settings.get("frame_hold", 1))
            if hold in (2, 3):
                await loop.run_in_executor(
                    None, _apply_frame_hold, os.path.join(VIDEO_DIR, out_name), hold)
            record_video_settings([out_name], settings, duration=time.time() - t_start)
            JOBS[job_id] = {"state": "done", "files": [
                {"filename": out_name, "subfolder": "video", "type": "output"}]}
        except Exception as e:
            JOBS[job_id] = {"state": "error", "error": str(e)[:300]}
        return
    try:
        total = max(2, min(10, int(settings["seconds"])))
        half = max(1, min(5, (total + 1) // 2))
        base_seed = int(settings.get("seed", -1))
        if base_seed < 0:
            base_seed = random.randint(0, 2**48)
        JOBS[job_id] = {"state": "running", "note": "시작 이미지 구간 생성 중 (1/2)"}
        seg_a = {**settings, "seconds": half, "frame_hold": 1, "format": "mp4",
                 "filename": (settings.get("filename") or "flf") + "_a",
                 "seed": base_seed, "end_image": None}
        fa = await _submit_and_wait(build_workflow(seg_a))
        JOBS[job_id] = {"state": "running", "note": "끝 이미지 구간 생성 중 (2/2)"}
        seg_b = {**settings, "seconds": half, "frame_hold": 1, "format": "mp4",
                 "filename": (settings.get("filename") or "flf") + "_b",
                 "seed": base_seed + 1, "start_image": settings["end_image"],
                 "end_image": None}
        fb = await _submit_and_wait(build_workflow(seg_b))
        base = re.sub(r"[^\w\-가-힣]", "_", (settings.get("filename") or "flf"))
        out_name = f"{base}_연결_{job_id[-6:]}.mp4"
        dest = os.path.join(VIDEO_DIR, out_name)
        JOBS[job_id] = {"state": "running", "note": "역재생·크로스페이드 연결 중"}
        await loop.run_in_executor(None, _reverse_and_crossfade,
                                   os.path.join(VIDEO_DIR, fa["filename"]),
                                   os.path.join(VIDEO_DIR, fb["filename"]), dest)
        stab = int(settings.get("stabilize", 2))
        if stab in (1, 2, 3):
            JOBS[job_id] = {"state": "running", "note": "떨림 제거 중"}
            await loop.run_in_executor(None, _apply_stabilize, dest, stab)
        hold = int(settings.get("frame_hold", 1))
        if hold in (2, 3):
            await loop.run_in_executor(None, _apply_frame_hold, dest, hold)
        record_video_settings([out_name], settings, duration=time.time() - t_start)
        JOBS[job_id] = {"state": "done", "files": [
            {"filename": out_name, "subfolder": "video", "type": "output"}]}
    except Exception as e:
        JOBS[job_id] = {"state": "error", "error": str(e)[:300]}


async def api_generate(request):
    data = await request.json()
    settings = data.get("settings")
    if not settings or not settings.get("prompt"):
        return web.json_response({"error": "프롬프트가 비어 있습니다."}, status=400)
    if settings.get("smooth", True) and int(settings.get("seconds", 2)) >= 2:
        apply_smooth_mode(settings, int(settings.get("seconds", 2)))
    if settings.get("start_image") and settings.get("end_image"):
        job_id = "job_" + format(random.randint(0, 16**8 - 1), "08x")
        JOBS[job_id] = {"state": "running", "note": "시작→끝 연결 작업 준비 중"}
        asyncio.get_event_loop().create_task(_run_flf_job(job_id, settings))
        return web.json_response({"prompt_id": job_id})
    if int(settings.get("seconds", 3)) > 5:
        job_id = "job_" + format(random.randint(0, 16**8 - 1), "08x")
        JOBS[job_id] = {"state": "running", "note": "긴 영상 작업 준비 중"}
        asyncio.get_event_loop().create_task(_run_long_job(job_id, settings))
        return web.json_response({"prompt_id": job_id})
    workflow = build_workflow(settings)
    async with ClientSession() as sess:
        async with sess.post(COMFY_URL + "/prompt", json={"prompt": workflow}) as r:
            body = await r.json()
            if r.status != 200 or body.get("node_errors"):
                return web.json_response(
                    {"error": "ComfyUI 오류: " + json.dumps(body)[:500]}, status=500)
    PENDING_SETTINGS[body["prompt_id"]] = dict(settings)
    return web.json_response({"prompt_id": body["prompt_id"]})


async def api_status(request):
    pid = request.match_info["pid"]
    if pid.startswith("job_"):
        j = JOBS.get(pid)
        if not j:
            return web.json_response({"state": "error", "error": "작업을 찾을 수 없습니다."})
        return web.json_response(j)
    async with ClientSession() as sess:
        async with sess.get(COMFY_URL + f"/history/{pid}") as r:
            hist = await r.json()
        entry = hist.get(pid)
        if entry:
            st = entry.get("status", {})
            if st.get("completed"):
                videos = []
                for node_out in entry.get("outputs", {}).values():
                    for key in ("images", "video", "gifs"):
                        for f in node_out.get(key, []) or []:
                            videos.append(f)
                if pid in PENDING_SETTINGS:
                    record_video_settings(
                        [f.get("filename") for f in videos], PENDING_SETTINGS.pop(pid),
                        duration=duration_from_history_entry(entry))
                return web.json_response({"state": "done", "files": videos})
            if st.get("status_str") == "error":
                msgs = [m for m in entry.get("status", {}).get("messages", [])
                        if m and m[0] == "execution_error"]
                detail = msgs[-1][1].get("exception_message", "") if msgs else ""
                return web.json_response({"state": "error", "error": detail[:500]})
        async with sess.get(COMFY_URL + "/queue") as r:
            q = await r.json()
        running = len(q.get("queue_running", []))
        pending = len(q.get("queue_pending", []))
        return web.json_response({"state": "running", "running": running, "pending": pending})


async def api_comfy_ready(request):
    try:
        async with ClientSession(timeout=aiohttp.ClientTimeout(total=2)) as sess:
            async with sess.get(COMFY_URL + "/system_stats") as r:
                await r.json()
        return web.json_response({"ready": True})
    except Exception:
        return web.json_response({"ready": False})


MODELS_DIR = os.path.join(
    os.path.dirname(APP_DIR), "ComfyUI_windows_portable", "ComfyUI", "models")
FUN_INPAINT_MODEL = "wan2.2_fun_inpaint_5B_bf16.safetensors"
INTERP_MODEL = "rife_v4.26.safetensors"


async def api_save_video(request):
    """브라우저에서 녹화한 영상을 히스토리(output/video)에 저장"""
    reader = await request.multipart()
    field = await reader.next()
    if field is None or field.name != "video":
        return web.json_response({"error": "영상 데이터가 필요합니다."}, status=400)
    raw = await field.read()
    if not raw:
        return web.json_response({"error": "빈 파일입니다."}, status=400)
    base = re.sub(r"[^\w\-가-힣]", "_", str(request.query.get("name") or "뮤직비주얼"))[:40]
    ext = ".webm" if (field.filename or "").endswith(".webm") else ".mp4"
    os.makedirs(VIDEO_DIR, exist_ok=True)
    out_name = f"{base}_{int(time.time()) % 1000000}{ext}"
    with open(os.path.join(VIDEO_DIR, out_name), "wb") as f:
        f.write(raw)
    return web.json_response({"ok": True, "filename": out_name,
                              "size": len(raw)})


def _cover_frame(img, w, h, scale=1.0, ox=0.5, oy=0.5):
    from PIL import Image
    iw, ih = img.size
    base = max(w / iw, h / ih) * scale
    nw, nh = max(w, int(iw * base)), max(h, int(ih * base))
    im = img.resize((nw, nh), Image.LANCZOS)
    x = int((nw - w) * ox)
    y = int((nh - h) * oy)
    return im.crop((x, y, x + w, y + h))


def _fit_canvas(img, w, h, bg="white"):
    """이미지 전체가 보이도록 축소 후 여백 채움 (letterbox)."""
    from PIL import Image
    iw, ih = img.size
    scale = min(w / iw, h / ih)
    nw, nh = max(1, int(iw * scale)), max(1, int(ih * scale))
    canvas = Image.new("RGB", (w, h), bg)
    canvas.paste(img.resize((nw, nh), Image.LANCZOS), ((w - nw) // 2, (h - nh) // 2))
    return canvas


def _effect_frames(img, w, h, n_frames, ef, fit="crop"):
    if fit == "fit":
        img = _fit_canvas(img, w, h)
    frames = []
    for i in range(n_frames):
        t = i / max(1, n_frames - 1)
        if ef == "zoom_in":
            fr = _cover_frame(img, w, h, 1.0 + 0.10 * t)
        elif ef == "zoom_out":
            fr = _cover_frame(img, w, h, 1.10 - 0.10 * t)
        elif ef == "pan_lr":
            fr = _cover_frame(img, w, h, 1.12, ox=t)
        elif ef == "pan_rl":
            fr = _cover_frame(img, w, h, 1.12, ox=1.0 - t)
        elif ef == "pan_ud":
            fr = _cover_frame(img, w, h, 1.12, oy=t)
        else:
            fr = _cover_frame(img, w, h)
        frames.append(fr)
    return frames


def _map_rect_to_canvas(rect, iw, ih, w, h, fit):
    """원본 이미지 기준 상대 rect(0~1) → fit/crop 캔버스 픽셀 rect."""
    rx, ry, rw, rh = rect
    if fit == "fit":
        scale = min(w / iw, h / ih)
        ox, oy = (w - iw * scale) / 2, (h - ih * scale) / 2
    else:
        scale = max(w / iw, h / ih)
        ox, oy = (w - iw * scale) / 2, (h - ih * scale) / 2
    return (int(ox + rx * iw * scale), int(oy + ry * ih * scale),
            int(rw * iw * scale), int(rh * ih * scale))


def _inpaint_region(img, mask, iters=45, radius=6):
    """마스크 영역을 주변 색으로 메움 (블러 확산 — 평면 만화에 적합)."""
    import numpy as np
    from PIL import Image, ImageFilter
    a = np.asarray(img).astype(np.float32)
    m = (np.asarray(mask).astype(np.float32) / 255.0)[..., None]
    cur = a * (1 - m)
    for _ in range(iters):
        blurred = np.asarray(
            Image.fromarray(np.clip(cur, 0, 255).astype(np.uint8)).filter(
                ImageFilter.GaussianBlur(radius))).astype(np.float32)
        cur = a * (1 - m) + blurred * m
    return Image.fromarray(np.clip(cur, 0, 255).astype(np.uint8))


def _smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def _region_motion_frames(canvas, region, n_frames, fps, iw, ih, fit):
    """지정 영역만 움직이는 시네마그래프 (AI 없음).
    원래 자리를 배경으로 메운 뒤(clean plate) 변형한 조각을 얹어 잔상을 없앤다."""
    import math
    from PIL import Image, ImageDraw, ImageFilter
    w, h = canvas.size
    x0, y0, bw, bh = _map_rect_to_canvas(region["rect"], iw, ih, w, h, fit)
    x0, y0 = max(0, x0), max(0, y0)
    bw, bh = max(8, min(bw, w - x0)), max(8, min(bh, h - y0))
    mtype = region.get("type", "wiggle")
    strength = {1: 0.55, 2: 1.0, 3: 1.7}.get(int(region.get("strength", 2)), 1.0)
    period = max(0.8, min(6.0, float(region.get("period", 2.0))))

    part_mask = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(part_mask).ellipse((x0, y0, x0 + bw, y0 + bh), fill=255)
    part_mask = part_mask.filter(ImageFilter.GaussianBlur(3))

    plate = _inpaint_region(canvas, part_mask.filter(ImageFilter.MaxFilter(9)))
    part = canvas.convert("RGBA")
    part.putalpha(part_mask)

    pivot = (x0 + bw / 2, y0 + bh * 0.06)   # 붙어 있는 지점(윗변) 기준 회전
    frames = []
    for i in range(n_frames):
        t = i / max(1, n_frames)
        if mtype == "lift":
            amt = _smoothstep(t * 2) if t < 0.5 else _smoothstep((1 - t) * 2)
            piece = part.rotate(22 * strength * amt, resample=Image.BICUBIC, center=pivot)
        else:
            phase = math.sin(2 * math.pi * (i / fps) / period)
            if mtype == "wiggle":
                piece = part.rotate(8 * strength * phase, resample=Image.BICUBIC, center=pivot)
            elif mtype in ("bob", "sway"):
                dx = int(0.07 * strength * bw * phase) if mtype == "sway" else 0
                dy = int(0.07 * strength * bh * phase) if mtype == "bob" else 0
                piece = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
                piece.paste(part, (dx, dy))
            else:  # pulse
                sc = 1 + 0.06 * strength * phase
                nw2, nh2 = max(2, int(w * sc)), max(2, int(h * sc))
                big = part.resize((nw2, nh2), Image.LANCZOS)
                piece = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
                piece.paste(big, (-(nw2 - w) // 2, -(nh2 - h) // 2))
        frame = plate.convert("RGBA")
        frame.alpha_composite(piece)
        frames.append(frame.convert("RGB"))
    return frames


def _video_frames(path, w, h, fit="crop"):
    import av
    frames = []
    with av.open(path) as c:
        for fr in c.decode(video=0):
            img = fr.to_image()
            frames.append(_fit_canvas(img, w, h) if fit == "fit" else _cover_frame(img, w, h))
    return frames


FAITHFUL_NEGATIVE = (
    "redrawing, style change, added detail, different character, photorealistic, 3d render, "
    "realistic, blurry, low quality, watermark, deformed, extra limbs, flickering, jittering, "
    "morphing, transformation, background motion, extra movement, camera movement, zoom, pan")


def apply_smooth_mode(settings, want_seconds, multiplier=2):
    """부드러운 움직임 모드: 목표 길이의 1/multiplier만 생성하고 보간으로 채운다.
    실측(2026-08-10): 불균일도 7.32 → 5.96 (19% 개선), 생성 시간 290s → 185s."""
    has_model = os.path.exists(os.path.join(
        MODELS_DIR, "frame_interpolation", INTERP_MODEL))
    if not has_model or want_seconds < 2:
        settings["seconds"] = want_seconds
        settings["interpolate"] = 1
        return settings
    settings["seconds"] = max(1, round(want_seconds / multiplier))
    settings["interpolate"] = multiplier
    return settings


def faithful_i2v_settings(motion_desc, gen=None):
    """원본을 유지하며 지정 부위만 미세하게 움직이는 i2v 설정.
    검증 결과: 터보 LoRA는 그림을 붕괴시키므로 사용 금지, 1초만 생성 후 왕복 루프."""
    gen = gen or {}
    return {
        "prompt": ("The exact same still cartoon picture, unchanged. "
                   f"Motion: only {motion_desc}. Nothing else moves at all - "
                   "no redrawing, no style change, no transformation, no morphing, "
                   "the character keeps its exact original shape and colors, "
                   "the background is frozen, the camera is locked."),
        "negative": FAITHFUL_NEGATIVE,
        "seconds": 1,
        "steps": int(gen.get("steps", 20)),
        "cfg": float(gen.get("cfg", 3.0)),
        "sampler": gen.get("sampler", "uni_pc"),
        "scheduler": gen.get("scheduler", "simple"),
        "shift": float(gen.get("shift", 2.0)),
        "turbo": False,
        "seed": random.randint(0, 2**48),
        "denoise": 1.0,
        "frame_hold": 1,
        "format": "mp4",
    }


def _motion_composite(ai_frames, base, keep_pct=12, min_thresh=8, grow=7, feather=3):
    """AI가 실제로 움직인 영역(=캐릭터)만 남기고 나머지는 원본 배경으로 고정.
    가장 많이 움직인 상위 keep_pct% 픽셀만 캐릭터로 보므로, 모델이 화면 전체를
    미세하게 흔들어도 배경이 딸려 움직이지 않는다."""
    import numpy as np
    from PIL import Image, ImageFilter
    if not ai_frames:
        return ai_frames
    ref = np.asarray(ai_frames[0]).astype(np.float32)
    peak = np.zeros(ref.shape[:2], np.float32)
    for f in ai_frames[1:]:
        peak = np.maximum(peak, np.abs(np.asarray(f).astype(np.float32) - ref).mean(axis=2))
    thresh = max(float(min_thresh), float(np.percentile(peak, 100 - keep_pct)))
    if peak.max() < min_thresh:          # 움직임이 거의 없으면 원본 유지
        return [base.copy() for _ in ai_frames]
    mask = Image.fromarray(((peak >= thresh) * 255).astype(np.uint8))
    if grow > 1:
        mask = mask.filter(ImageFilter.MaxFilter(grow | 1))
    mask = mask.filter(ImageFilter.GaussianBlur(feather))
    return [Image.composite(f, base, mask) for f in ai_frames]


def _pingpong_to_length(frames, want):
    """앞부분(원본에 충실한 구간)만 쓰고 왕복 반복해 목표 길이를 채운다."""
    if not frames:
        return frames
    if len(frames) == 1:
        return frames * want
    cycle = frames + frames[-2:0:-1]  # 정방향 + 역방향(양 끝 중복 제거) = 매끄러운 루프
    out = []
    while len(out) < want:
        out.extend(cycle)
    return out[:want]


VALID_TRANSITIONS = ("cut", "crossfade", "fade_black", "fade_white", "wipe_lr", "wipe_rl",
                     "wipe_ud", "push_lr", "push_rl", "iris", "zoom_blend", "blur", "ai_morph")


def _transition_frames(a_tail, b_head, ttype, w, h):
    """한 연결부의 전환 프레임 생성. a_tail/b_head: 같은 길이 k의 PIL 프레임."""
    from PIL import Image, ImageDraw, ImageFilter
    k = len(a_tail)
    res = []
    for i in range(k):
        t = (i + 1) / (k + 1)
        A, B = a_tail[i], b_head[i]
        if ttype == "crossfade":
            comp = Image.blend(A, B, t)
        elif ttype == "wipe_lr":
            comp = A.copy()
            x = int(w * t)
            if x > 0:
                comp.paste(B.crop((0, 0, x, h)), (0, 0))
        elif ttype == "wipe_rl":
            comp = A.copy()
            x = int(w * t)
            if x > 0:
                comp.paste(B.crop((w - x, 0, w, h)), (w - x, 0))
        elif ttype == "wipe_ud":
            comp = A.copy()
            y = int(h * t)
            if y > 0:
                comp.paste(B.crop((0, 0, w, y)), (0, 0))
        elif ttype == "push_lr":
            off = int(w * t)
            comp = Image.new("RGB", (w, h))
            comp.paste(A, (off, 0))
            comp.paste(B, (off - w, 0))
        elif ttype == "push_rl":
            off = int(w * t)
            comp = Image.new("RGB", (w, h))
            comp.paste(A, (-off, 0))
            comp.paste(B, (w - off, 0))
        elif ttype == "iris":
            comp = A.copy()
            mask = Image.new("L", (w, h), 0)
            d = ImageDraw.Draw(mask)
            r = t * ((w ** 2 + h ** 2) ** 0.5) / 2
            d.ellipse((w / 2 - r, h / 2 - r, w / 2 + r, h / 2 + r), fill=255)
            comp.paste(B, (0, 0), mask)
        elif ttype == "zoom_blend":
            comp = Image.blend(_cover_frame(A, w, h, 1.0 + 0.30 * t), B, t)
        elif ttype == "blur":
            comp = Image.blend(A.filter(ImageFilter.GaussianBlur(10 * t)),
                               B.filter(ImageFilter.GaussianBlur(10 * (1 - t))), t)
        else:
            comp = B
        res.append(comp)
    return res


def _join_and_encode(segs, dest, w, h, fps, transitions):
    """segs: 프레임 리스트들, transitions: 각 연결부의 (type, frames) 리스트 (len = len(segs)-1)"""
    from PIL import Image
    import av
    out = list(segs[0])
    for si, seg in enumerate(segs[1:]):
        seg = list(seg)
        transition, trans_frames = transitions[si] if si < len(transitions) else ("crossfade", 12)
        k = max(2, min(int(trans_frames), len(out) // 2, len(seg) // 2))
        if transition == "cut":
            out.extend(seg)
        elif transition in ("fade_white", "fade_black"):
            solid = Image.new("RGB", (w, h),
                              "white" if transition == "fade_white" else "black")
            for i in range(k):
                t = (i + 1) / (k + 1)
                out[len(out) - k + i] = Image.blend(out[len(out) - k + i], solid, t)
            for i in range(k):
                t = 1.0 - (i + 1) / (k + 1)
                seg[i] = Image.blend(seg[i], solid, t)
            out.extend(seg)
        else:
            trans = _transition_frames(out[-k:], seg[:k], transition, w, h)
            out = out[:-k] + trans + seg[k:]
    with av.open(dest, "w") as o:
        vs = o.add_stream("h264", rate=int(fps))
        vs.width, vs.height = w, h
        vs.pix_fmt = "yuv420p"
        for img in out:
            for pkt in vs.encode(av.VideoFrame.from_image(img)):
                o.mux(pkt)
        for pkt in vs.encode():
            o.mux(pkt)


def _gen_size_for(w, h, src_path=None):
    """생성 해상도 결정.
    실측(2026-08-10): 소스보다 크게 생성할수록 흐려지고 느려진다.
    소스 512px 기준 640이 원본충실도 최고(4.65), 1088은 최악(7.95)이었다.
    → 소스 긴 변의 약 1.25배(704 상한)를 쓰되 16의 배수로 맞춘다."""
    long_side = 704
    if src_path:
        try:
            from PIL import Image
            with Image.open(src_path) as im:
                long_side = max(im.size)
        except Exception:
            long_side = 704
    target = max(448, min(704, int(long_side * 1.25) // 16 * 16))
    if w > h:
        return target, max(256, target * h // w // 16 * 16)
    if h > w:
        return max(256, target * w // h // 16 * 16), target
    return target, target


async def _run_slideshow_job(job_id, slides, w, h, fps, transitions, gen=None, fit="fit",
                             trans_prompts=None):
    from PIL import Image
    gen = gen or {}
    loop = asyncio.get_event_loop()
    t_start = time.time()
    try:
        segs = []
        cycle = ["zoom_in", "zoom_out"]
        gen_total = sum(1 for s in slides if s.get("motion"))
        gen_done = 0
        for idx, s in enumerate(slides):
            path = os.path.join(COMFY_INPUT_DIR, s["image"])
            sec = max(1, min(5, int(s.get("seconds", 3))))
            n_frames = int(sec * fps)
            effect = s.get("effect", "auto")
            region = s.get("region")
            if region and region.get("mode") == "ai":
                # AI 시네마그래프: 영역 안만 AI 움직임, 바깥은 원본 고정
                gen_done += 1
                JOBS[job_id] = {"state": "running",
                                "note": f"{idx + 1}번째 이미지 AI 영역 움직임 생성 중"}
                from PIL import ImageDraw, ImageFilter
                img = Image.open(path).convert("RGB")
                iw, ih = img.size
                gw, gh = _gen_size_for(iw, ih, path)
                desc = region.get("motion_desc") or "the highlighted part moves naturally and subtly"
                # Fun-InP가 있으면 시작·끝을 원본으로 고정해 드리프트 없이 되돌아오는 루프 생성
                has_flf = os.path.exists(
                    os.path.join(MODELS_DIR, "diffusion_models", FUN_INPAINT_MODEL))
                settings = {
                    **DEFAULT_SETTINGS,
                    **faithful_i2v_settings(desc, gen),
                    "width": gw, "height": gh,
                    "seconds": sec if has_flf else 1,
                    "filename": f"slide_{job_id[-6:]}_{idx + 1}",
                    "start_image": s["image"],
                    "end_image": s["image"] if has_flf else None,
                }
                f = await _submit_and_wait(build_workflow(settings))
                clip = os.path.join(VIDEO_DIR, f["filename"])
                ai_frames = await loop.run_in_executor(
                    None, lambda c=clip: _video_frames(c, w, h, fit))
                if not has_flf:   # 구형 경로: 드리프트 적은 앞부분만 쓰고 왕복 루프
                    ai_frames = _pingpong_to_length(
                        ai_frames[:max(6, min(len(ai_frames), 16))], n_frames)
                base = _fit_canvas(img, w, h) if fit == "fit" else _cover_frame(img, w, h)
                x0, y0, bw, bh = _map_rect_to_canvas(region["rect"], iw, ih, w, h, fit)
                x0, y0 = max(0, x0), max(0, y0)
                bw, bh = max(8, min(bw, w - x0)), max(8, min(bh, h - y0))
                mask = Image.new("L", (w, h), 0)
                ImageDraw.Draw(mask).ellipse((x0, y0, x0 + bw, y0 + bh), fill=255)
                mask = mask.filter(ImageFilter.GaussianBlur(max(3, min(bw, bh) // 5)))
                segs.append([Image.composite(af, base, mask) for af in ai_frames][:n_frames])
            elif s.get("motion"):
                gen_done += 1
                JOBS[job_id] = {"state": "running",
                                "note": f"{idx + 1}번째 이미지 미세 모션 생성 중 ({gen_done}/{gen_total})"}
                gw, gh = _gen_size_for(w, h, path)
                settings = {**DEFAULT_SETTINGS, **faithful_i2v_settings(s["motion"], gen),
                            "width": gw, "height": gh,
                            "filename": f"slide_{job_id[-6:]}_{idx + 1}",
                            "start_image": s["image"]}
                f = await _submit_and_wait(build_workflow(settings))
                clip = os.path.join(VIDEO_DIR, f["filename"])
                stab = int(gen.get("stabilize", 3))
                if stab in (1, 2, 3):
                    await loop.run_in_executor(None, _apply_stabilize, clip, stab)
                fr = await loop.run_in_executor(
                    None, lambda c=clip: _video_frames(c, w, h, fit))
                if s.get("lock_bg", False):
                    img0 = Image.open(path).convert("RGB")
                    base0 = (_fit_canvas(img0, w, h) if fit == "fit"
                             else _cover_frame(img0, w, h))
                    fr = await loop.run_in_executor(
                        None, lambda: _motion_composite(fr, base0))
                segs.append(_pingpong_to_length(fr[:max(6, min(len(fr), 16))], n_frames))
            elif s.get("region"):
                img = Image.open(path).convert("RGB")
                base = _fit_canvas(img, w, h) if fit == "fit" else _cover_frame(img, w, h)
                segs.append(_region_motion_frames(
                    base, s["region"], n_frames, fps, img.width, img.height, fit))
            else:
                img = Image.open(path).convert("RGB")
                ef = cycle[idx % 2] if effect == "auto" else effect
                segs.append(_effect_frames(img, w, h, n_frames, ef, fit))
        # AI 전환(ai_morph): 두 이미지 사이를 Fun-InP 모델이 직접 생성해 끼워 넣는다
        has_flf = os.path.exists(
            os.path.join(MODELS_DIR, "diffusion_models", FUN_INPAINT_MODEL))
        new_segs, new_trans = [segs[0]], []
        for si in range(len(segs) - 1):
            ttype, tframes = transitions[si] if si < len(transitions) else ("crossfade", 12)
            if ttype == "ai_morph" and has_flf:
                JOBS[job_id] = {"state": "running",
                                "note": f"{si + 1}→{si + 2} AI 전환 생성 중"}
                gw, gh = _gen_size_for(
                    w, h, os.path.join(COMFY_INPUT_DIR, slides[si]["image"]))
                sec_t = max(1, min(3, round(tframes / fps) or 1))
                # 사용자가 적은 "무슨 일이 일어나는지"가 있으면 그대로 사용 (정확도에 결정적)
                user_desc = (trans_prompts or [])[si] if si < len(trans_prompts or []) else ""
                mset = apply_smooth_mode({
                    **DEFAULT_SETTINGS,
                    "prompt": (
                        f"{user_desc.strip()} Same flat 2D cartoon style, same characters, "
                        "camera stays still, smooth natural motion."
                        if user_desc.strip() else
                        "The first picture smoothly and naturally transforms into the "
                        "second picture. Same flat 2D cartoon style throughout, "
                        "smooth continuous transition, camera locked."),
                    "negative": FAITHFUL_NEGATIVE,
                    "width": gw, "height": gh, "seconds": sec_t,
                    "steps": int(gen.get("steps", 20)),
                    "cfg": float(gen.get("cfg", 5.0)),
                    "sampler": gen.get("sampler", "uni_pc"),
                    "scheduler": gen.get("scheduler", "simple"),
                    "shift": float(gen.get("shift", 5.0)),
                    "turbo": False, "seed": random.randint(0, 2**48),
                    "frame_hold": 1, "format": "mp4",
                    "filename": f"morph_{job_id[-6:]}_{si + 1}",
                    "start_image": slides[si]["image"],
                    "end_image": slides[si + 1]["image"],
                }, sec_t)
                try:
                    mf = await _submit_and_wait(build_workflow(mset))
                    mid = await loop.run_in_executor(
                        None, lambda c=os.path.join(VIDEO_DIR, mf["filename"]):
                        _video_frames(c, w, h, fit))
                    if len(mid) > 2:
                        new_trans.append(("crossfade", 4))
                        new_segs.append(mid[1:-1])      # 양 끝은 원본과 겹치므로 제외
                        new_trans.append(("crossfade", 4))
                        new_segs.append(segs[si + 1])
                        continue
                except Exception as e:
                    JOBS[job_id] = {"state": "running",
                                    "note": f"AI 전환 실패({str(e)[:40]}) — 크로스페이드로 대체"}
                new_trans.append(("crossfade", tframes))
                new_segs.append(segs[si + 1])
            else:
                new_trans.append((ttype if ttype != "ai_morph" else "crossfade", tframes))
                new_segs.append(segs[si + 1])
        segs, transitions = new_segs, new_trans

        out_name = f"슬라이드쇼_{job_id[-6:]}.mp4"
        dest = os.path.join(VIDEO_DIR, out_name)
        JOBS[job_id] = {"state": "running", "note": "전환 효과 적용·인코딩 중"}
        await loop.run_in_executor(
            None, _join_and_encode, segs, dest, w, h, fps, transitions)
        meta = load_videos_meta()
        meta.setdefault(out_name, {})["duration"] = round(time.time() - t_start, 1)
        save_videos_meta(meta)
        JOBS[job_id] = {"state": "done", "files": [
            {"filename": out_name, "subfolder": "video", "type": "output"}]}
    except Exception as e:
        JOBS[job_id] = {"state": "error", "error": str(e)[:300]}


TRANS_PREVIEW_DIR = os.path.join(APP_DIR, "trans_previews")


def _add_audio(video_path, audio_path, dest, mode="video", a_start=0.0, a_end=0.0):
    import av
    import numpy as np
    SR = 44100
    resampler = av.AudioResampler(format="s16", layout="stereo", rate=SR)
    chunks = []
    with av.open(audio_path) as ac:
        for frame in ac.decode(audio=0):
            for rf in resampler.resample(frame):
                chunks.append(rf.to_ndarray())
    if not chunks:
        raise ValueError("오디오를 읽지 못했습니다.")
    audio = np.concatenate(chunks, axis=1)  # (1, n_samples*2) interleaved s16
    per_sec = SR * 2
    total_sec = audio.shape[1] / per_sec
    s = max(0.0, min(a_start, total_sec))
    e = a_end if 0 < a_end <= total_sec else total_sec
    if e <= s:
        raise ValueError("오디오 구간이 잘못됐습니다.")
    audio = audio[:, int(s * per_sec):int(e * per_sec)]

    frames = []
    with av.open(video_path) as vc:
        vs_in = vc.streams.video[0]
        fps = float(vs_in.average_rate) if vs_in.average_rate else 24.0
        for fr in vc.decode(video=0):
            frames.append(fr.to_image())
    if not frames:
        raise ValueError("영상 프레임이 없습니다.")
    video_dur = len(frames) / fps
    audio_dur = audio.shape[1] / per_sec
    if mode == "loop_video" and audio_dur > video_dur:
        reps = int(audio_dur / video_dur) + 1
        frames = (frames * reps)[:int(round(audio_dur * fps))]
    else:
        audio = audio[:, :int(video_dur * per_sec)]

    with av.open(dest, "w") as o:
        vs = o.add_stream("h264", rate=int(round(fps)))
        vs.width, vs.height = frames[0].width, frames[0].height
        vs.pix_fmt = "yuv420p"
        a_stream = o.add_stream("aac", rate=SR)
        for img in frames:
            for pkt in vs.encode(av.VideoFrame.from_image(img)):
                o.mux(pkt)
        for pkt in vs.encode():
            o.mux(pkt)
        step = 1024 * 2
        pts = 0
        for i in range(0, audio.shape[1], step):
            chunk = audio[:, i:i + step]
            af = av.AudioFrame.from_ndarray(np.ascontiguousarray(chunk), format="s16", layout="stereo")
            af.sample_rate = SR
            af.pts = pts
            pts += chunk.shape[1] // 2
            for pkt in a_stream.encode(af):
                o.mux(pkt)
        for pkt in a_stream.encode():
            o.mux(pkt)


def _build_transition_preview(ttype, dest):
    from PIL import Image, ImageDraw
    w, h = 200, 112
    def sample(color1, color2, label):
        img = Image.new("RGB", (w, h), color1)
        d = ImageDraw.Draw(img)
        d.ellipse((w/2-32, h/2-32, w/2+32, h/2+32), fill=color2)
        d.text((w/2-5, h/2-8), label, fill="white")
        return img
    A = sample((52, 88, 160), (90, 140, 220), "1")
    B = sample((190, 100, 40), (230, 150, 70), "2")
    hold_a = [A] * 6
    hold_b = [B] * 6
    k = 12
    if ttype == "cut":
        frames = hold_a + hold_b
    elif ttype in ("fade_white", "fade_black"):
        solid = Image.new("RGB", (w, h), "white" if ttype == "fade_white" else "black")
        fo = [Image.blend(A, solid, (i + 1) / 7) for i in range(6)]
        fi = [Image.blend(B, solid, 1 - (i + 1) / 7) for i in range(6)]
        frames = hold_a + fo + fi + hold_b
    else:
        frames = hold_a + _transition_frames([A] * k, [B] * k, ttype, w, h) + hold_b
    frames[0].save(dest, save_all=True, append_images=frames[1:],
                   duration=90, loop=0, format="WEBP", quality=80)


async def api_transition_preview(request):
    ttype = request.match_info["type"]
    if ttype not in VALID_TRANSITIONS:
        return web.json_response({"error": "unknown transition"}, status=404)
    os.makedirs(TRANS_PREVIEW_DIR, exist_ok=True)
    dest = os.path.join(TRANS_PREVIEW_DIR, ttype + ".webp")
    if not os.path.exists(dest):
        try:
            await asyncio.get_event_loop().run_in_executor(
                None, _build_transition_preview, ttype, dest)
        except Exception as e:
            return web.json_response({"error": str(e)[:100]}, status=500)
    return web.FileResponse(dest)


async def api_slideshow(request):
    from PIL import Image
    data = await request.json()
    slides_in = data.get("slides") or [{"image": n} for n in (data.get("images") or [])]
    if not slides_in:
        return web.json_response({"error": "이미지가 필요합니다."}, status=400)
    VALID_EFFECTS = ("auto", "zoom_in", "zoom_out", "pan_lr", "pan_rl", "pan_ud", "none")
    VALID_TRANS = VALID_TRANSITIONS
    slides = []
    for s in slides_in:
        nm = os.path.basename(str(s.get("image", "")))
        p = os.path.join(COMFY_INPUT_DIR, nm)
        if not nm or not os.path.exists(p):
            return web.json_response({"error": f"이미지가 없습니다: {s.get('image')}"}, status=404)
        ef = s.get("effect", data.get("effect", "auto"))
        region = None
        r = s.get("region")
        if isinstance(r, dict) and isinstance(r.get("rect"), list) and len(r["rect"]) == 4:
            try:
                region = {
                    "rect": [max(0.0, min(1.0, float(v))) for v in r["rect"]],
                    "mode": "ai" if r.get("mode") == "ai" else "proc",
                    "motion_desc": str(r.get("motion_desc") or "")[:200],
                    "type": r.get("type") if r.get("type") in ("wiggle", "bob", "sway", "pulse") else "wiggle",
                    "strength": int(r.get("strength", 2)),
                    "period": float(r.get("period", 2.0)),
                }
            except Exception:
                region = None
        slides.append({
            "image": nm,
            "seconds": max(1, min(5, int(s.get("seconds", data.get("seconds_per", 3))))),
            "motion": (str(s.get("motion") or "").strip() or None),
            "interval": max(0, min(5, int(s.get("interval", 0)))),
            "effect": ef if ef in VALID_EFFECTS else "auto",
            "region": region,
            "lock_bg": bool(s.get("lock_bg", False)),
        })
    width = max(256, min(1920, int(data.get("width", 1280)) // 2 * 2))
    height = max(256, min(1920, int(data.get("height", 720)) // 2 * 2))
    fps = 24
    # 전환: 연결부마다 개별 (type, frames)
    default_t = data.get("transition", "crossfade")
    if default_t not in VALID_TRANS:
        default_t = "crossfade"
    default_k = max(2, min(36, int(data.get("transition_frames", 12))))
    transitions, trans_prompts = [], []
    trans_in = data.get("transitions") or []
    for i in range(max(0, len(slides) - 1)):
        t = trans_in[i] if i < len(trans_in) and isinstance(trans_in[i], dict) else {}
        tt = t.get("type", default_t)
        transitions.append((
            tt if tt in VALID_TRANS else default_t,
            max(2, min(36, int(t.get("frames", default_k))))))
        trans_prompts.append(str(t.get("prompt") or "")[:400])
    has_ai_region = any(s.get("region") and s["region"].get("mode") == "ai" for s in slides)
    has_ai_morph = any(t[0] == "ai_morph" for t in transitions)
    use_gpu = ((bool(data.get("gpu")) and any(s["motion"] for s in slides))
               or has_ai_region or has_ai_morph)
    os.makedirs(VIDEO_DIR, exist_ok=True)

    g = data.get("gen") or {}
    gen = {
        "style": (str(g.get("style") or "").strip() or
                  "2D anime style illustration, cel shading, clean lineart, high quality")[:300],
        "sampler": g.get("sampler") if g.get("sampler") in SAMPLERS else "uni_pc",
        "scheduler": g.get("scheduler") if g.get("scheduler") in SCHEDULERS else "simple",
        "steps": max(4, min(30, int(g.get("steps", 20)))),
        "cfg": max(1.0, min(10.0, float(g.get("cfg", 5.0)))),
        "shift": max(1.0, min(12.0, float(g.get("shift", 4.0)))),
        "turbo": bool(g.get("turbo")),
        "stabilize": int(g.get("stabilize", 3)) if int(g.get("stabilize", 3)) in (0, 1, 2, 3) else 3,
    }

    fit = data.get("fit", "fit")
    if fit not in ("fit", "crop"):
        fit = "fit"

    if use_gpu:
        job_id = "job_" + format(random.randint(0, 16**8 - 1), "08x")
        JOBS[job_id] = {"state": "running", "note": "슬라이드쇼 작업 준비 중"}
        asyncio.get_event_loop().create_task(_run_slideshow_job(
            job_id, slides, width, height, fps, transitions, gen, fit, trans_prompts))
        return web.json_response({"job": job_id})

    def build_static():
        segs = []
        cycle = ["zoom_in", "zoom_out"]
        for idx, s in enumerate(slides):
            img = Image.open(os.path.join(COMFY_INPUT_DIR, s["image"])).convert("RGB")
            n_frames = int(s["seconds"] * fps)
            if s.get("region") and s["region"].get("mode") != "ai":
                base = _fit_canvas(img, width, height) if fit == "fit" else _cover_frame(img, width, height)
                segs.append(_region_motion_frames(
                    base, s["region"], n_frames, fps, img.width, img.height, fit))
            else:
                ef = cycle[idx % 2] if s["effect"] == "auto" else s["effect"]
                segs.append(_effect_frames(img, width, height, n_frames, ef, fit))
        _join_and_encode(segs, dest, width, height, fps, transitions)
    out_name = f"슬라이드쇼_{int(time.time())}.mp4"
    dest = os.path.join(VIDEO_DIR, out_name)
    try:
        await asyncio.get_event_loop().run_in_executor(None, build_static)
    except Exception as e:
        return web.json_response({"error": "슬라이드쇼 생성 실패: " + str(e)[:200]}, status=500)
    return web.json_response({"ok": True, "filename": out_name})


async def api_videos_concat(request):
    data = await request.json()
    names = data.get("filenames") or []
    if len(names) < 2:
        return web.json_response({"error": "이어붙일 영상이 2개 이상 필요합니다."}, status=400)
    paths = []
    for n in names:
        nm, p = safe_video_path(n)
        if not nm or not os.path.exists(p):
            return web.json_response({"error": f"파일이 없습니다: {n}"}, status=404)
        if not re.search(r"\.mp4$", nm, re.I):
            return web.json_response({"error": "mp4만 이어붙일 수 있어요."}, status=400)
        paths.append(p)
    base = re.sub(r"[^\w\-가-힣]", "_", (data.get("output") or "story")) or "story"
    out_name = f"{base}_{int(time.time())}.mp4"
    dest = os.path.join(VIDEO_DIR, out_name)
    transition = data.get("transition", "crossfade")
    if transition not in ("cut", "crossfade", "fade_white"):
        transition = "crossfade"
    trans_frames = max(2, min(24, int(data.get("transition_frames", 8))))
    try:
        await asyncio.get_event_loop().run_in_executor(
            None, lambda: _concat_videos(paths, dest, fps=None, skip_first=False,
                                         transition=transition, trans_frames=trans_frames))
    except Exception as e:
        return web.json_response({"error": "이어붙이기 실패: " + str(e)[:200]}, status=500)
    return web.json_response({"ok": True, "filename": out_name})


COMFY_TEMPLATES_DIR = os.path.join(
    os.path.dirname(APP_DIR), "ComfyUI_windows_portable", "python_embeded",
    "Lib", "site-packages", "comfyui_workflow_templates_json", "templates")


def installed_model_files():
    models_root = os.path.join(
        os.path.dirname(APP_DIR), "ComfyUI_windows_portable", "ComfyUI", "models")
    files = set()
    for sub in ("diffusion_models", "text_encoders", "vae", "checkpoints", "loras"):
        d = os.path.join(models_root, sub)
        if os.path.isdir(d):
            files.update(os.listdir(d))
    return files


def _scan_sampling(nodes):
    """어떤 샘플러 노드든 widgets_values에서 샘플러/스케줄러/스텝/cfg를 찾아낸다."""
    out = {}
    for node in nodes:
        vals = node.get("widgets_values") or []
        if not isinstance(vals, list):
            continue
        si = next((i for i, v in enumerate(vals)
                   if isinstance(v, str) and v in SAMPLERS), None)
        if si is None:
            continue
        out["sampler"] = vals[si]
        if si + 1 < len(vals) and isinstance(vals[si + 1], str) and vals[si + 1] in SCHEDULERS:
            out["scheduler"] = vals[si + 1]
        # KSampler/KSamplerAdvanced 모두 샘플러 바로 앞이 cfg, 그 앞이 steps
        if si >= 2:
            try:
                cfg = float(vals[si - 1])
                steps = int(vals[si - 2])
                if 0 < cfg <= 30 and 1 <= steps <= 150:
                    out["cfg"], out["steps"] = cfg, steps
            except (TypeError, ValueError):
                pass
        for v in vals[si + 2:]:
            if isinstance(v, (int, float)) and 0.05 <= float(v) <= 1.0:
                out["denoise"] = float(v)
                break
        break
    return out


def _scan_dimensions(nodes):
    """width/height(/length)를 가진 잠재·비디오 노드를 찾아낸다."""
    for node in nodes:
        t = str(node.get("type") or "")
        if not any(k in t for k in ("Latent", "ToVideo", "Video", "Image")):
            continue
        vals = node.get("widgets_values") or []
        if not isinstance(vals, list) or len(vals) < 2:
            continue
        try:
            w, h = int(vals[0]), int(vals[1])
        except (TypeError, ValueError):
            continue
        if not (128 <= w <= 4096 and 128 <= h <= 4096 and w % 8 == 0 and h % 8 == 0):
            continue
        out = {"width": w, "height": h}
        if len(vals) >= 3 and isinstance(vals[2], (int, float)):
            n = int(vals[2])
            if 5 <= n <= 1000:
                out["seconds"] = max(1, min(10, round((n - 1) / 24)))
        return out
    return {}


def parse_comfy_template(path):
    with open(path, "r", encoding="utf-8") as f:
        wf = json.load(f)
    if not isinstance(wf, dict) or not isinstance(wf.get("nodes"), list):
        return set(), None
    nodes = [n for n in wf["nodes"] if isinstance(n, dict)]
    required = set()
    for node in nodes:
        for m in (node.get("properties") or {}).get("models", []) or []:
            if m.get("name"):
                required.add(m["name"])

    sampling = _scan_sampling(nodes)
    if not sampling:
        return required, None   # 샘플링 설정이 없으면 가져올 게 없음

    settings = dict(DEFAULT_SETTINGS)
    settings.update(sampling)
    settings.update(_scan_dimensions(nodes))
    settings["width"] = max(256, min(1280, settings["width"] // 16 * 16))
    settings["height"] = max(256, min(704, settings["height"] // 16 * 16))
    settings["steps"] = max(4, min(30, int(settings.get("steps", 20))))
    settings["cfg"] = max(1.0, min(10.0, float(settings.get("cfg", 5.0))))
    if settings.get("sampler") not in SAMPLERS:
        settings["sampler"] = "uni_pc"
    if settings.get("scheduler") not in SCHEDULERS:
        settings["scheduler"] = "simple"

    for node in nodes:
        if node.get("type") == "ModelSamplingSD3":
            msv = node.get("widgets_values") or []
            if msv and isinstance(msv[0], (int, float)):
                settings["shift"] = max(1.0, min(12.0, float(msv[0])))
            break

    for node in nodes:
        if node.get("type") != "CLIPTextEncode":
            continue
        title = (node.get("title") or "").lower()
        vals = node.get("widgets_values") or []
        if vals and isinstance(vals[0], str) and "positive" in title:
            txt = vals[0].strip()
            # 중국어 등 비영문 프롬프트는 가져오지 않음
            if txt and sum(c.isascii() for c in txt) / len(txt) > 0.9:
                settings["prompt"] = txt[:600]
            break
    return required, settings


async def api_comfy_templates(request):
    result = []
    if os.path.isdir(COMFY_TEMPLATES_DIR):
        installed = installed_model_files()
        for fn in sorted(os.listdir(COMFY_TEMPLATES_DIR)):
            if not fn.endswith(".json") or fn.startswith("api_"):
                continue
            low = fn.lower()
            if not (low.startswith("video") or "to_video" in low or "i2v" in low
                    or "t2v" in low or low.startswith("ltxv") or "wan" in low):
                continue
            try:
                required, settings = parse_comfy_template(
                    os.path.join(COMFY_TEMPLATES_DIR, fn))
            except Exception:
                continue
            missing = sorted(m for m in required if m and m not in installed)
            result.append({
                "id": fn[:-5],
                "compatible": settings is not None,   # 설정을 가져올 수 있으면 사용 가능
                "same_models": not missing,           # 모델까지 동일하면 원본 그대로 재현
                "missing": missing,
                "has_settings": settings is not None,
            })
    return web.json_response({"templates": result})


_comfy_media_index = None


def comfy_media_index():
    global _comfy_media_index
    if _comfy_media_index is None:
        _comfy_media_index = {}
        sp = os.path.dirname(COMFY_TEMPLATES_DIR.rstrip("\\/"))
        sp = os.path.dirname(sp)  # site-packages
        for entry in os.listdir(sp):
            if not entry.startswith("comfyui_workflow_templates_media"):
                continue
            for root, _dirs, files in os.walk(os.path.join(sp, entry)):
                for fn in files:
                    m = re.match(r"(.+)-1\.(webp|mp4|jpg|jpeg|png)$", fn)
                    if m and m.group(1) not in _comfy_media_index:
                        _comfy_media_index[m.group(1)] = os.path.join(root, fn)
    return _comfy_media_index


async def api_comfy_template_preview(request):
    tid = re.sub(r"[^\w\-.]", "", request.match_info["id"])
    path = comfy_media_index().get(tid)
    if not path or not os.path.exists(path):
        return web.json_response({"error": "미리보기 없음"}, status=404)
    return web.FileResponse(path)


async def api_comfy_templates_import(request):
    data = await request.json()
    tid = re.sub(r"[^\w\-]", "", data.get("id", ""))
    path = os.path.join(COMFY_TEMPLATES_DIR, tid + ".json")
    if not os.path.exists(path):
        return web.json_response({"error": "템플릿을 찾을 수 없습니다."}, status=404)
    required, settings = parse_comfy_template(path)
    if settings is None:
        return web.json_response(
            {"error": "이 템플릿은 현재 앱 구조(Wan 2.2 5B)와 호환되지 않습니다."}, status=400)
    templates = load_templates()
    templates[f"ComfyUI 템플릿 · {tid}"] = settings
    save_templates(templates)
    return web.json_response({"ok": True, "templates": templates,
                              "imported": f"ComfyUI 템플릿 · {tid}"})


def _edit_video(src, dest, trim_start=0.0, trim_end=0.0, speed=1.0, scale=1.0):
    import av
    from PIL import Image
    frames = []
    with av.open(src) as c:
        vs = c.streams.video[0]
        rate = float(vs.average_rate) if vs.average_rate else 24.0
        for i, fr in enumerate(c.decode(video=0)):
            t = i / rate
            if t < trim_start:
                continue
            if trim_end > 0 and t > trim_end:
                break
            frames.append(fr.to_image())
    if not frames:
        raise ValueError("선택한 구간에 프레임이 없습니다.")
    if abs(scale - 1.0) > 0.01:
        w = max(2, int(frames[0].width * scale) // 2 * 2)
        h = max(2, int(frames[0].height * scale) // 2 * 2)
        frames = [f.resize((w, h), Image.LANCZOS) for f in frames]
    out_fps = max(1, min(60, int(round(rate * speed))))
    with av.open(dest, "w") as o:
        vs = o.add_stream("h264", rate=out_fps)
        vs.width, vs.height = frames[0].width, frames[0].height
        vs.pix_fmt = "yuv420p"
        for img in frames:
            for pkt in vs.encode(av.VideoFrame.from_image(img)):
                o.mux(pkt)
        for pkt in vs.encode():
            o.mux(pkt)


ANALYZE_INSTRUCTION = """Read the image file at {path} and look at it carefully.
It will be used as the start frame of an image-to-video generation (Wan 2.2, subtle idle animation).
Identify the concrete visual elements in THIS image and suggest which could move subtly and which must stay still.

Reply with ONLY a raw JSON object (no markdown fence):
{{"move": [{{"ko": "<짧은 한국어 라벨 (이모지 1개 + 5단어 이내)>", "en": "<english motion phrase like 'the puppy's tail wags gently'>"}}, ...],
  "fix": [{{"ko": "...", "en": "<english phrase like 'the wooden cabinet stays completely still'>"}}, ...]}}
Rules: 6-12 "move" suggestions (subtle, natural idle motions matched to actual elements you see),
3-6 "fix" suggestions (elements that would look wrong if they moved). Korean labels must name the actual element."""


async def api_analyze_image(request):
    data = await request.json()
    name = os.path.basename(data.get("image") or "")
    path = os.path.join(COMFY_INPUT_DIR, name)
    if not name or not os.path.exists(path):
        return web.json_response({"error": "먼저 시작 이미지를 업로드하세요."}, status=400)
    claude = shutil.which("claude") or shutil.which("claude.cmd")
    if not claude:
        return web.json_response({"error": "claude CLI를 찾을 수 없습니다."}, status=500)
    try:
        proc = await asyncio.create_subprocess_exec(
            claude, "-p", ANALYZE_INSTRUCTION.format(path=path),
            "--output-format", "text", "--allowedTools", "Read",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        out, err = await asyncio.wait_for(proc.communicate(), timeout=180)
    except asyncio.TimeoutError:
        return web.json_response({"error": "이미지 분석 시간 초과(180초)"}, status=504)
    text = out.decode("utf-8", "ignore")
    if proc.returncode != 0:
        combined = (text + " " + err.decode("utf-8", "ignore")).strip()
        if "Not logged in" in combined or "/login" in combined:
            return web.json_response({"error": (
                "Claude 로그인이 필요합니다. 터미널에서 'claude /login' 실행 후 다시 시도하세요.")}, status=401)
        return web.json_response({"error": "분석 실패: " + combined[:200]}, status=500)
    try:
        result = extract_json(text)
        assert isinstance(result.get("move"), list)
    except Exception as e:
        return web.json_response({"error": "분석 결과 해석 실패: " + str(e)[:150]}, status=500)
    return web.json_response(result)


async def api_describe_image(request):
    """로컬 이미지 인식(WD14 태거) → 태그·색감·t2v 프롬프트. 외부 LLM 불필요."""
    data = await request.json()
    name = os.path.basename(str(data.get("image") or ""))
    path = os.path.join(COMFY_INPUT_DIR, name)
    if not name or not os.path.exists(path):
        return web.json_response({"error": "이미지를 먼저 업로드하세요."}, status=400)
    try:
        import tagger
    except Exception as e:
        return web.json_response({"error": "태거 로드 실패: " + str(e)[:150]}, status=500)
    if not tagger.available():
        return web.json_response(
            {"error": "인식 모델이 없습니다 (app/tagger/model.onnx)."}, status=500)
    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None, lambda: tagger.describe(
                path, str(data.get("motion") or ""), str(data.get("style") or "")))
    except Exception as e:
        return web.json_response({"error": "인식 실패: " + str(e)[:200]}, status=500)
    return web.json_response(result)


UPSCALE_MODEL = "RealESRGAN_x4plus_anime_6B.pth"


SOURCE_LONG_SIDE = 1408      # 모든 소스를 이 크기로 통일 (생성은 704로 내려서 사용)


async def _upscale_source(name):
    """업로드 이미지를 항상 선명화 + 규격 해상도로 통일해 저장.
    실측(2026-08-10): 흐린 소스(317px)를 업스케일하면 i2v 선명도가
    255 → 1514로 6배 올라가고 원본충실도까지 개선된다 (시간 동일)."""
    from PIL import Image
    src = os.path.join(COMFY_INPUT_DIR, name)
    if not os.path.exists(src):
        return None
    with Image.open(src) as im:
        w0, h0 = im.size
    base = os.path.splitext(name)[0]
    dest_name = base + "_sharp.png"
    has_model = os.path.exists(os.path.join(MODELS_DIR, "upscale_models", UPSCALE_MODEL))

    def _normalize(path_in):
        """긴 변을 SOURCE_LONG_SIDE로 맞추고 16의 배수로 정리"""
        with Image.open(path_in) as im2:
            im2 = im2.convert("RGB")
            sc = SOURCE_LONG_SIDE / max(im2.size)
            nw = max(16, int(im2.width * sc) // 16 * 16)
            nh = max(16, int(im2.height * sc) // 16 * 16)
            im2.resize((nw, nh), Image.LANCZOS).save(
                os.path.join(COMFY_INPUT_DIR, dest_name))
        return dest_name

    # 업스케일러가 없거나 이미 충분히 큰 이미지는 리사이즈만으로 규격화
    if not has_model or max(w0, h0) >= SOURCE_LONG_SIDE:
        return _normalize(src)
    prefix = "up_" + re.sub(r"[^\w\-]", "_", base)
    wf = {
        "1": {"class_type": "LoadImage", "inputs": {"image": name}},
        "2": {"class_type": "UpscaleModelLoader", "inputs": {"model_name": UPSCALE_MODEL}},
        "3": {"class_type": "ImageUpscaleWithModel",
              "inputs": {"upscale_model": ["2", 0], "image": ["1", 0]}},
        "4": {"class_type": "SaveImage",
              "inputs": {"images": ["3", 0], "filename_prefix": prefix}},
    }
    async with ClientSession() as sess:
        async with sess.post(COMFY_URL + "/prompt", json={"prompt": wf}) as r:
            body = await r.json()
            if r.status != 200 or body.get("node_errors"):
                return None
        pid = body["prompt_id"]
        for _ in range(60):
            await asyncio.sleep(2)
            async with sess.get(COMFY_URL + f"/history/{pid}") as r:
                hist = await r.json()
            entry = hist.get(pid)
            if not entry:
                continue
            if entry.get("status", {}).get("status_str") == "error":
                return None
            if entry.get("status", {}).get("completed"):
                for node_out in entry.get("outputs", {}).values():
                    for f in node_out.get("images", []) or []:
                        out = os.path.join(
                            os.path.dirname(COMFY_INPUT_DIR), "output",
                            f.get("subfolder", ""), f["filename"])
                        if os.path.exists(out):
                            return _normalize(out)
                return _normalize(src)
    return _normalize(src)


async def api_upload_image(request):
    reader = await request.multipart()
    field = await reader.next()
    if field is None or field.name != "image":
        return web.json_response({"error": "이미지 파일이 필요합니다."}, status=400)
    data = await field.read()
    filename = field.filename or "upload.png"
    form = aiohttp.FormData()
    form.add_field("image", data, filename=filename,
                   content_type=field.headers.get("Content-Type", "image/png"))
    form.add_field("overwrite", "true")
    async with ClientSession() as sess:
        async with sess.post(COMFY_URL + "/upload/image", data=form) as r:
            if r.status != 200:
                return web.json_response({"error": "업로드 실패"}, status=500)
            body = await r.json()
    name = body.get("name", filename)
    try:                       # 선명화·해상도 통일은 항상 수행
        normalized = await _upscale_source(name)
    except Exception:
        normalized = None
    size = None
    if normalized:
        try:
            from PIL import Image
            with Image.open(os.path.join(COMFY_INPUT_DIR, normalized)) as im:
                size = list(im.size)
        except Exception:
            size = None
    return web.json_response({"name": normalized or name,
                              "original": name,
                              "upscaled": bool(normalized),
                              "size": size})


# 배경 형상 인덱스 (index.html의 SILHOUETTES 순서와 일치)
SHAPE_INDEX = {
    "뇌": 0, "얼굴": 1, "손": 2, "눈": 3, "강아지": 4, "고양이": 5, "지구": 6,
    "오리온자리": 7, "세모": 8, "북두칠성": 9, "마우스": 10, "카시오페이아": 11,
    "네모": 12, "백조자리": 13, "키보드": 14, "전갈자리": 15, "돛": 16, "필름": 17,
}
# 가사 키워드 → 형상 (앞쪽일수록 우선)


async def api_shapes_list(request):
    """app/shapes/ 에 넣어둔 로고·아이콘 파일 목록 (배경 파티클 형상으로 사용)"""
    os.makedirs(SHAPES_DIR, exist_ok=True)
    names = [f for f in sorted(os.listdir(SHAPES_DIR))
             if re.search(r"\.(png|svg|webp|jpg|jpeg)$", f, re.I)]
    return web.json_response({"shapes": names})


async def api_shapes_file(request):
    name = os.path.basename(request.match_info["name"])
    path = os.path.join(SHAPES_DIR, name)
    if not name or not os.path.exists(path):
        return web.json_response({"error": "없음"}, status=404)
    return web.FileResponse(path)


async def api_templates_list(request):
    return web.json_response(load_templates())


async def api_templates_save(request):
    data = await request.json()
    name = (data.get("name") or "").strip()
    settings = data.get("settings")
    if not name or not settings:
        return web.json_response({"error": "이름과 설정이 필요합니다."}, status=400)
    templates = load_templates()
    templates[name] = settings
    save_templates(templates)
    return web.json_response({"ok": True, "templates": templates})


async def api_templates_delete(request):
    name = request.match_info["name"]
    templates = load_templates()
    if name in templates:
        del templates[name]
        save_templates(templates)
    return web.json_response({"ok": True, "templates": templates})


async def index(request):
    return web.FileResponse(os.path.join(APP_DIR, "index.html"))


async def api_static(request):
    """app 폴더의 보조 페이지·라이브러리를 그대로 보여준다 (app 폴더 밖은 막는다)."""
    rel = request.match_info["name"].replace("\\", "/")
    if not re.search(r"\.(html|svg|png|jpg|jpeg|webp|css|js|mjs|json"
                     r"|ttf|otf|woff|woff2|mp3|ogg|wav|m4a)$", rel, re.I):
        return web.json_response({"error": "허용되지 않는 파일"}, status=400)
    path = os.path.normpath(os.path.join(APP_DIR, rel))
    if not path.startswith(APP_DIR) or not os.path.isfile(path):
        return web.json_response({"error": "없음"}, status=404)
    # 화면·스크립트를 고치면 바로 반영되도록 캐시를 쓰지 않는다
    return web.FileResponse(path, headers={"Cache-Control": "no-cache, must-revalidate"})


@web.middleware
async def 오류감싸기(request, handler):
    """예상 못 한 예외를 **뜻이 있는 답**으로 바꾼다.

    이것이 없으면 무엇이 조금만 어긋나도 브라우저는 `500 Server got itself in
    trouble` 만 받는다. 화면에는 아무 말도 못 띄우고, 무엇이 잘못됐는지도 모른다.

    자주 나는 두 가지는 따로 알려 준다.
      · 파일을 안 보내고 부른 것        → "파일이 필요합니다"
      · 몸이 JSON 이 아닌 것            → "잘못된 요청"
    나머지는 500 을 유지하되 **까닭을 실어** 보낸다 (화면이 그대로 보여 줄 수 있게).
    """
    try:
        return await handler(request)
    except web.HTTPException:
        raise                                   # 404·400 등 일부러 낸 것은 그대로
    except AssertionError as e:
        if "multipart" in str(e):
            return web.json_response(
                {"error": "파일이 필요합니다 (파일을 골라 다시 보내 주세요)."}, status=400)
        raise
    except json.JSONDecodeError:
        return web.json_response({"error": "잘못된 요청입니다 (JSON 이 아닙니다)."}, status=400)
    except FileNotFoundError as e:
        return web.json_response({"error": f"파일을 찾지 못했습니다: {e}"}, status=404)
    except Exception as e:
        traceback.print_exc()                   # 콘솔에는 그대로 남긴다
        return web.json_response(
            {"error": f"{type(e).__name__}: {e}"}, status=500)


@web.middleware
async def auth_middleware(request, handler):
    pw = os.environ.get("STUDIO_PASSWORD", "").strip()
    if not pw:
        return await handler(request)
    if request.cookies.get("studio_auth") == pw:
        return await handler(request)
    if request.query.get("key") == pw:
        resp = await handler(request)
        try:
            resp.set_cookie("studio_auth", pw, max_age=86400 * 30, httponly=True)
        except Exception:
            pass
        return resp
    return web.Response(
        status=401, content_type="text/html", charset="utf-8",
        text=("<meta charset='utf-8'><body style='background:#0f1115;color:#e8eaf0;"
              "font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh'>"
              "<form onsubmit=\"location.href='/?key='+encodeURIComponent(document.getElementById('k').value);return false\">"
              "<h2>🔒 심심 공작소</h2><p>비밀번호를 입력하세요.</p>"
              "<input id='k' type='password' style='padding:10px;border-radius:8px;border:1px solid #444;"
              "background:#1f2430;color:#fff'> <button style='padding:10px 16px;border-radius:8px;"
              "border:none;background:#6c8cff;color:#fff'>입장</button></form></body>"))


def main():
    app = web.Application(client_max_size=32 * 1024 * 1024,
                          # 오류감싸기가 바깥 — 인증 뒤에서 터진 것도 뜻있게 돌려준다
                          middlewares=[오류감싸기, auth_middleware])
    app.router.add_get("/", index)
    app.router.add_get("/p/{name:.*}", api_static)
    api.register_all(app)                      # 기능별로 나눠 둔 API 묶음 (app/api/)
    app.router.add_post("/api/chat", api_chat)
    app.router.add_post("/api/generate", api_generate)
    app.router.add_get("/api/status/{pid}", api_status)
    app.router.add_get("/api/comfy_ready", api_comfy_ready)
    app.router.add_get("/api/shapes", api_shapes_list)
    app.router.add_get("/api/shapes/{name}", api_shapes_file)
    app.router.add_get("/api/templates", api_templates_list)
    app.router.add_post("/api/templates", api_templates_save)
    app.router.add_delete("/api/templates/{name}", api_templates_delete)
    app.router.add_post("/api/upload_image", api_upload_image)
    app.router.add_post("/api/analyze_image", api_analyze_image)
    app.router.add_post("/api/describe_image", api_describe_image)
    app.router.add_post("/api/save_video", api_save_video)
    app.router.add_post("/api/videos/concat", api_videos_concat)
    app.router.add_post("/api/slideshow", api_slideshow)
    app.router.add_get("/api/transition_preview/{type}", api_transition_preview)
    app.router.add_get("/api/comfy_templates", api_comfy_templates)
    app.router.add_post("/api/comfy_templates/import", api_comfy_templates_import)
    app.router.add_get("/api/comfy_templates/preview/{id}", api_comfy_template_preview)
    host = os.environ.get("STUDIO_HOST", "127.0.0.1")
    print(f"AI 동영상 스튜디오: http://{host}:{PORT}")
    if host != "127.0.0.1":
        print("⚠ 외부 접속 모드 — 같은 네트워크의 다른 기기에서 접속할 수 있습니다.")
    web.run_app(app, host=host, port=PORT, print=None)


if __name__ == "__main__":
    main()
