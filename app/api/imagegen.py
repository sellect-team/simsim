"""✨ 그림 만들기 — 부족한 배경·캐릭터를 ComfyUI 로 직접 뽑아 자산으로 넣는다.

지금 깔린 모델은 Wan 2.2 TI2V 5B(영상 모델) 하나뿐이다.
영상 모델이지만 **길이를 1로 두면 그림 한 장**이 나온다. 새 모델을 받지 않아도 된다.
대신 그림 전용 모델보다 느리므로(장당 수십 초) 줄을 세워 하나씩 만든다.

만든 그림은 곧바로 배경·캐릭터 자산이 된다 — 대본이 부르던 이름 그대로 저장하므로
다음에 미리보기를 열면 코드 그림 대신 이 그림이 쓰인다.
"""
import asyncio
import json
import os
import random
import re
import time

from aiohttp import ClientSession, web

from paths import (BG_DIR, CHAR_DIR, COMFY_INPUT_DIR, COMFY_URL, JOBS,
                   job_id, names_in_dir, unique_name)

COMFY_OUTPUT_DIR = os.path.join(os.path.dirname(COMFY_INPUT_DIR), "output")

# 그림 하나를 뽑는 데 쓰는 값 — 영상보다 스텝을 조금 더 준다 (한 장이라 부담이 적다)
STEPS = 24
CFG = 5.5

NEGATIVE = ("blurry, low quality, jpeg artifacts, watermark, text, signature, "
            "extra limbs, deformed, ugly, photo, realistic, 3d render")

# 만들 것에 따라 붙이는 말 — 우리 그림체(납작한 파스텔 동화책)에 맞춘다
STYLE = {
    "배경": ("children's storybook background illustration, flat pastel colors, "
             "soft shapes, gentle lighting, no characters, no people, no text"),
    "캐릭터": ("cute chibi animal character, full body, front view, standing, "
              "thick clean outline, flat pastel colors, children's storybook style, "
              "plain white background, centered, no text"),
}


def _wf(prompt, width, height, seed, prefix):
    """길이 1짜리 Wan 2.2 — 그림 한 장을 뽑는 가장 가벼운 짜임"""
    return {
        "37": {"class_type": "UNETLoader", "inputs": {
            "unet_name": "wan2.2_ti2v_5B_fp16.safetensors", "weight_dtype": "default"}},
        "38": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
            "type": "wan", "device": "default"}},
        "39": {"class_type": "VAELoader", "inputs": {"vae_name": "wan2.2_vae.safetensors"}},
        "48": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["37", 0], "shift": 8.0}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["38", 0], "text": prompt}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["38", 0], "text": NEGATIVE}},
        "55": {"class_type": "Wan22ImageToVideoLatent", "inputs": {
            "vae": ["39", 0], "width": width, "height": height,
            "length": 1, "batch_size": 1}},          # ← 길이 1 = 그림 한 장
        "3": {"class_type": "KSampler", "inputs": {
            "model": ["48", 0], "positive": ["6", 0], "negative": ["7", 0],
            "latent_image": ["55", 0], "seed": seed, "steps": STEPS, "cfg": CFG,
            "sampler_name": "uni_pc", "scheduler": "simple", "denoise": 1.0}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["39", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {
            "images": ["8", 0], "filename_prefix": prefix}},
    }


def _even(n, lo, hi):
    n = max(lo, min(hi, int(n)))
    return n - (n % 16)                     # 16의 배수여야 잠재공간이 딱 맞는다


# 한국어 → 영어 — 대본에서 실제로 쓰는 낱말만 담았다.
# (scenery.js · autochar.js 가 알아듣는 낱말과 같은 것들)
KO_EN = [
    # 시간대
    (("한밤", "밤", "야간", "달밤", "별밤"), "at night, moonlight, starry sky"),
    (("새벽", "동틀", "여명"), "at dawn, soft purple light"),
    (("노을", "저녁", "석양", "해질", "황혼"), "at sunset, golden orange sky"),
    (("아침", "이른"), "early morning, soft warm light"),
    (("흐림", "흐린", "먹구름"), "overcast cloudy sky"),
    (("비", "빗속", "장마", "소나기"), "rainy, wet ground, rain drops"),
    (("눈오는", "함박눈", "설원", "눈밭", "겨울"), "snowy winter, snow falling"),
    # 장소
    (("바다", "해변", "백사장", "바닷가", "파도"), "a calm sea and beach, gentle waves"),
    (("강", "개울", "시냇", "호수", "연못"), "a quiet stream and pond"),
    (("숲", "수풀", "정글", "나무숲"), "a green forest with tall trees"),
    (("산", "언덕", "고개", "봉우리"), "rolling hills and distant mountains"),
    (("길", "거리", "도로", "골목"), "a quiet small town street"),
    (("마을", "동네", "시골"), "a cozy little village with small houses"),
    (("부엌", "주방", "식탁"), "a warm kitchen interior"),
    (("교실", "학교"), "a bright classroom interior"),
    (("방", "실내", "거실", "집안", "안방"), "a cozy room interior with a window"),
    (("사막", "모래벌", "오아시스"), "a desert with sand dunes and cactus"),
    (("우주", "은하", "행성", "별나라"), "outer space with stars and planets"),
    (("꽃밭", "화단", "꽃"), "a flower field in bloom"),
    (("모닥불", "캠프", "야영", "캠핑"), "a campfire with firewood"),
    (("들판", "잔디", "공원", "초원", "풀밭", "마당", "운동장"),
     "a wide green grass field under a blue sky"),
    # 동물 (캐릭터)
    (("강아지", "개", "댕댕", "멍멍", "누렁", "바둑"), "a cute puppy"),
    (("고양이", "냥이", "야옹", "냐옹", "나비"), "a cute kitten"),
    (("곰", "베어", "반달"), "a cute bear cub"),
    (("토끼", "토깽", "래빗"), "a cute rabbit"),
    (("여우", "폭스"), "a cute fox"),
    (("돼지", "꿀꿀", "피그"), "a cute piglet"),
    (("병아리", "닭", "오리", "짹짹", "참새", "새"), "a cute chick"),
    (("쥐", "생쥐", "찍찍", "햄스터"), "a cute mouse"),
    (("호랑이", "범", "타이거"), "a cute tiger cub"),
    (("아이", "소년", "소녀", "사람", "학생"), "a cute child"),
]


def ko_to_en(name):
    """이름에서 아는 낱말을 뽑아 영어로. 하나도 못 찾으면 이름을 그대로 쓴다."""
    글 = str(name or "").replace(" ", "")
    찾음 = []
    for keys, en in KO_EN:
        if any(k in 글 for k in keys) and en not in 찾음:
            찾음.append(en)
    return ", ".join(찾음) if 찾음 else str(name or "illustration")


def build_prompt(name, kind, extra=""):
    """이름 → 영어 프롬프트. 이미 영어로 적어 준 게 있으면 그것을 쓴다."""
    바탕 = extra.strip() if (extra and re.search(r"[A-Za-z]{4}", extra)) else ko_to_en(name)
    꾸밈 = STYLE.get(kind, STYLE["배경"])
    return f"{바탕}, {꾸밈}"


async def _run(job, prompt, width, height, seed, kind, name):
    JOBS[job] = {"state": "running", "progress": 5, "note": "ComfyUI 에 넣는 중"}
    prefix = "made/" + re.sub(r"[^\w\-]", "_", f"{kind}_{int(time.time())}")
    wf = _wf(prompt, width, height, seed, prefix)
    try:
        async with ClientSession() as sess:
            async with sess.post(COMFY_URL + "/prompt", json={"prompt": wf}) as r:
                body = await r.json()
                if r.status != 200 or body.get("node_errors"):
                    raise RuntimeError(json.dumps(body.get("node_errors") or body)[:300])
            pid = body["prompt_id"]
            JOBS[job].update(progress=15, note="그리는 중… (한 장에 30초 안팎)")
            for i in range(150):
                await asyncio.sleep(2)
                async with sess.get(COMFY_URL + f"/history/{pid}") as r:
                    hist = await r.json()
                entry = hist.get(pid)
                if not entry:
                    JOBS[job]["progress"] = min(85, 15 + i)
                    continue
                if entry.get("status", {}).get("status_str") == "error":
                    raise RuntimeError("ComfyUI 오류: " + str(entry.get("status"))[:300])
                if entry.get("status", {}).get("completed"):
                    for node_out in entry.get("outputs", {}).values():
                        for f in node_out.get("images", []) or []:
                            src = os.path.join(COMFY_OUTPUT_DIR,
                                               f.get("subfolder", ""), f["filename"])
                            if os.path.exists(src):
                                saved = _register(src, kind, name)
                                JOBS[job] = {"state": "done", "progress": 100,
                                             "note": "완성", "item": saved}
                                return
                    raise RuntimeError("그림이 안 나왔습니다.")
            raise RuntimeError("너무 오래 걸립니다 (5분 넘김).")
    except Exception as e:
        JOBS[job] = {"state": "error", "progress": 100, "error": str(e)[:300]}


def _register(src, kind, name):
    """만든 그림을 자산으로 넣는다 — 대본이 부르던 이름 그대로."""
    if kind == "캐릭터":
        os.makedirs(CHAR_DIR, exist_ok=True)
        cid = "ch_%x" % int(time.time() * 1000)
        d = os.path.join(CHAR_DIR, cid)
        os.makedirs(d, exist_ok=True)
        import shutil
        shutil.copyfile(src, os.path.join(d, "front.png"))
        from api.characters import _char_names
        m = {"id": cid, "name": unique_name(name, _char_names(), default="캐릭터", limit=30),
             "poses": ["front"], "created": time.time(), "made": True,
             "출처": "생성"}          # ComfyUI 가 그린 것
        with open(os.path.join(d, "meta.json"), "w", encoding="utf-8") as f:
            json.dump(m, f, ensure_ascii=False)
        return m
    os.makedirs(BG_DIR, exist_ok=True)
    bid = "bg_%x" % int(time.time() * 1000)
    import shutil
    shutil.copyfile(src, os.path.join(BG_DIR, bid + ".png"))
    m = {"id": bid, "name": unique_name(name, names_in_dir(BG_DIR), default="배경"),
         "file": bid + ".png", "created": time.time(), "made": True, "출처": "생성"}
    with open(os.path.join(BG_DIR, bid + ".json"), "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False)
    return m


async def generate(request):
    """그림 한 장 만들기 시작 → 작업 번호를 준다 (진행은 /api/status/<job>)"""
    body = await request.json()
    name = str(body.get("name") or "").strip()
    kind = "캐릭터" if body.get("kind") == "캐릭터" else "배경"
    if not name:
        return web.json_response({"error": "이름이 필요합니다."}, status=400)
    비율 = str(body.get("비율") or "9:16")
    try:
        a, b = [float(x) for x in 비율.split(":")]
    except Exception:
        a, b = 9, 16
    긴변 = _even(body.get("긴변") or 704, 320, 1024)
    if kind == "캐릭터":                       # 캐릭터는 정사각이 잘 나온다
        w = h = _even(긴변, 320, 1024)
    elif a >= b:
        w, h = 긴변, _even(긴변 * b / a, 320, 1024)
    else:
        w, h = _even(긴변 * a / b, 320, 1024), 긴변
    prompt = build_prompt(name, kind, body.get("프롬프트") or "")
    seed = int(body.get("seed") or random.randint(1, 2 ** 31 - 1))
    job = job_id("img")
    JOBS[job] = {"state": "queued", "progress": 0, "note": "차례를 기다리는 중"}
    asyncio.create_task(_run(job, prompt, w, h, seed, kind, name))
    return web.json_response({"ok": True, "job": job, "prompt": prompt,
                              "width": w, "height": h, "seed": seed})


async def preview_prompt(request):
    """무엇으로 그릴지 미리 보여 준다 (만들기 전에 확인용)"""
    name = request.query.get("name") or ""
    kind = "캐릭터" if request.query.get("kind") == "캐릭터" else "배경"
    return web.json_response({"prompt": build_prompt(name, kind, request.query.get("extra") or "")})


def register(app):
    app.router.add_post("/api/image/generate", generate)
    app.router.add_get("/api/image/prompt", preview_prompt)
