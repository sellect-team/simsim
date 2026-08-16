"""브라우저가 그린 프레임을 모아 mp4 로 굽는다 (실시간 재생 없이 빠르게).

캐릭터 영상·뮤직비주얼·3D 스튜디오가 모두 이 API 를 함께 쓴다.
"""
import base64
import json
import os
import re
import shutil
import threading
from fractions import Fraction
import time

from aiohttp import web

from paths import (AUDIO_DIR, FRAMES_DIR, JOBS, MUSIC_DIR, VIDEO_DIR,
                   job_id, safe_id)

SESSIONS = {}


async def start(request):
    data = await request.json()
    sid = "fr_%x" % int(time.time() * 1000)
    d = os.path.join(FRAMES_DIR, sid)
    os.makedirs(d, exist_ok=True)
    SESSIONS[sid] = {"dir": d, "n": 0,
                     "name": str(data.get("name") or "video"),
                     "fps": float(data.get("fps") or 30)}
    return web.json_response({"ok": True, "id": sid})


async def add(request):
    sid = request.query.get("id")
    s = SESSIONS.get(sid)
    if not s:
        return web.json_response({"error": "세션 없음"}, status=404)
    i = int(request.query.get("i") or s["n"])
    if request.query.get("b64"):
        # 캔버스 toDataURL 결과를 그대로 받는다 (숨겨진 탭에서도 지연 없이 동작)
        text = await request.text()
        raw = base64.b64decode(text.split(",", 1)[-1])
        ext = ".png" if text.startswith("data:image/png") else ".jpg"
        with open(os.path.join(s["dir"], "f%06d%s" % (i, ext)), "wb") as f:
            f.write(raw)
    else:
        reader = await request.multipart()
        field = await reader.next()
        ext = ".png" if (field.filename or "").endswith(".png") else ".jpg"
        with open(os.path.join(s["dir"], "f%06d%s" % (i, ext)), "wb") as f:
            while True:
                chunk = await field.read_chunk()
                if not chunk:
                    break
                f.write(chunk)
    s["n"] = max(s["n"], i + 1)
    return web.json_response({"ok": True, "n": s["n"]})


def _audio_samples(path, rate=48000):
    """오디오 파일 → (2, n) float32 배열. 형식이 무엇이든 여기서 하나로 맞춘다."""
    import av
    import numpy as np
    chunks = []
    with av.open(path) as f:
        rs = av.AudioResampler(format="fltp", layout="stereo", rate=rate)
        for fr in f.decode(audio=0):
            fr.pts = None
            for rf in rs.resample(fr):
                chunks.append(rf.to_ndarray())
        for rf in (rs.resample(None) or []):
            chunks.append(rf.to_ndarray())
    if not chunks:
        return np.zeros((2, 0), dtype="float32")
    a = np.concatenate(chunks, axis=1).astype("float32")
    if a.shape[0] == 1:                      # 혹시 모노로 나오면 좌우로 복제
        a = np.vstack([a, a])
    return a[:2]


def frames_to_mp4(folder, out_path, fps, audio_path=None, jid=None):
    """모아 둔 그림들을 mp4 로 굽는다. 소리가 있으면 함께 넣는다.

    소리는 '한 덩어리 배열'로 먼저 펼친 뒤 일정 크기로 잘라 넣는다.
    (라이브러리의 버퍼에 맡기면 표본율·채널 해석이 어긋나 소리가 겹치거나 빨라진다)
    """
    import av
    import numpy as np
    from PIL import Image

    RATE = 48000
    files = sorted(f for f in os.listdir(folder) if re.search(r"\.(png|jpg)$", f, re.I))
    if not files:
        raise RuntimeError("프레임이 없습니다.")
    first = Image.open(os.path.join(folder, files[0])).convert("RGB")

    snd = None
    if audio_path and os.path.isfile(audio_path):
        try:
            snd = _audio_samples(audio_path, RATE)
            limit = int(len(files) / max(1.0, float(fps)) * RATE)   # 영상 길이에 맞춰 자른다
            snd = snd[:, :limit]
        except Exception:
            snd = None

    with av.open(out_path, "w") as out:
        v = out.add_stream("h264", rate=int(round(fps)),
                           options={"crf": "18", "preset": "veryfast"})
        v.width, v.height, v.pix_fmt = first.width, first.height, "yuv420p"
        a = out.add_stream("aac", rate=RATE) if snd is not None and snd.shape[1] else None
        if a is not None:
            a.layout = "stereo"

        for i, name in enumerate(files):
            im = Image.open(os.path.join(folder, name)).convert("RGB")
            for p in v.encode(av.VideoFrame.from_image(im)):
                out.mux(p)
            if jid and i % 10 == 0:
                JOBS[jid] = {"state": "running",
                             "progress": max(1, min(98, int(i / len(files) * 100))),
                             "note": f"영상으로 굽는 중 {i}/{len(files)} 프레임"}
        for p in v.encode():
            out.mux(p)

        if a is not None:
            size = getattr(a.codec_context, "frame_size", 0) or 1024
            pos = 0
            pts = 0
            while pos < snd.shape[1]:
                block = snd[:, pos:pos + size]
                if block.shape[1] < size:            # 마지막 토막은 0 으로 채운다
                    block = np.pad(block, ((0, 0), (0, size - block.shape[1])))
                fr = av.AudioFrame.from_ndarray(np.ascontiguousarray(block),
                                                format="fltp", layout="stereo")
                fr.rate = RATE
                fr.pts = pts
                fr.time_base = Fraction(1, RATE)
                pts += size
                pos += size
                for p in a.encode(fr):
                    out.mux(p)
            for p in a.encode():
                out.mux(p)
    return len(files)


def _resolve_audio(data):
    """뮤직비주얼 프로젝트 음악 또는 사용자가 올린 음악 파일 경로"""
    pid = safe_id(data.get("mv_id"), "mv")
    if pid:
        meta = os.path.join(MUSIC_DIR, pid + ".json")
        if os.path.isfile(meta):
            with open(meta, encoding="utf-8") as f:
                p = os.path.join(MUSIC_DIR, json.load(f).get("audio", ""))
            if os.path.isfile(p):
                return p
    for key in ("audio_name", "audio", "music"):
        name = data.get(key)
        if not name:
            continue
        base = os.path.basename(str(name))
        for d in (AUDIO_DIR, MUSIC_DIR):
            p = os.path.join(d, base)
            if os.path.isfile(p):
                return p
        # 파일 이름이 아니라 **자산 이름**으로 적었을 수도 있다 (`음악: 산책배경음`).
        # 대본을 쓰는 사람은 확장자를 모르는 것이 정상이다.
        try:
            from api.audio import all_items
            찾는말 = re.sub(r"\s", "", base).lower()
            for it in all_items():
                if re.sub(r"\s", "", it["name"]).lower() == 찾는말:
                    p = os.path.join(AUDIO_DIR, it["file"])
                    if os.path.isfile(p):
                        return p
        except Exception:
            pass
    return None


async def finish(request):
    data = await request.json()
    sid = data.get("id")
    s = SESSIONS.get(sid)
    if not s:
        return web.json_response({"error": "세션 없음"}, status=404)
    base = re.sub(r"[^\w\-가-힣]", "_", s["name"])[:40] or "video"
    out_name = f"{base}_{int(time.time()) % 1000000}.mp4"
    out_path = os.path.join(VIDEO_DIR, out_name)
    os.makedirs(VIDEO_DIR, exist_ok=True)
    jid = job_id("job_fr")
    JOBS[jid] = {"state": "running", "progress": 1, "note": "영상으로 굽는 중"}
    audio = _resolve_audio(data)
    """무엇을 넣으라고 했고, 실제로 무엇이 붙었는가.

    예전에는 음악 이름이 틀려도 조용히 소리 없이 구워졌다. 영상은 멀쩡해 보여서
    수십 편을 구운 뒤에야 알아차린다. 그래서 **실제로 붙은 것을 결과에 적어** 둔다.
    """
    시킨음악 = str(data.get("audio") or data.get("music") or "").strip()
    음악보고 = {"시킨것": 시킨음악,
                "붙은것": os.path.basename(audio) if audio else "",
                "붙었나": bool(audio)}
    fps = float(data.get("fps") or s["fps"])
    sounds = data.get("sfx") or []            # [{"name":"톡","at":3.2}]
    seconds = float(data.get("seconds") or (s["n"] / max(1, fps)))
    # 프로젝트 음악 설정 (작업실 🎵 음악 단계에서 정한 값)
    음악크기 = float(data.get("music_gain") if data.get("music_gain") is not None else 0.7)
    음악여닫이 = float(data.get("music_fade") if data.get("music_fade") is not None else 0.6)

    def work():
        mixed = None
        try:
            if sounds or audio:
                try:
                    import sfx as sfxmix
                    mixed = sfxmix.mix(seconds, audio, sounds,
                                       music_gain=음악크기, fade=음악여닫이)
                except Exception as e:
                    JOBS[jid] = {"state": "running", "progress": 2,
                                 "note": "효과음 섞기 실패(음악만 사용): " + str(e)[:80]}
            n = frames_to_mp4(s["dir"], out_path, fps, mixed or audio, jid)
            JOBS[jid] = {"state": "done", "progress": 100, "filename": out_name,
                         "frames": n, "size": os.path.getsize(out_path),
                         "음악": 음악보고,        # 시킨 음악이 정말 붙었는지
                         "효과음수": len(sounds)}
        except Exception as e:
            JOBS[jid] = {"state": "error", "error": str(e)[:300]}
        finally:
            shutil.rmtree(s["dir"], ignore_errors=True)
            SESSIONS.pop(sid, None)
            if mixed and os.path.isfile(mixed):
                try:
                    os.remove(mixed)
                except OSError:
                    pass

    threading.Thread(target=work, daemon=True).start()
    return web.json_response({"ok": True, "job": jid})


def register(app):
    app.router.add_post("/api/frames/start", start)
    app.router.add_post("/api/frames/add", add)
    app.router.add_post("/api/frames/finish", finish)
