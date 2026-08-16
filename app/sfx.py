"""🔊 소리 섞기 — 배경음악 위에 효과음을 시각에 맞춰 얹는다.

대본의 `소리 톡` 같은 지시는 '몇 초에 어떤 소리'라는 목록으로 넘어온다.
여기서 음악과 효과음을 하나의 wav 로 미리 섞어 두면,
영상 굽는 쪽(frames_to_mp4)은 그 파일 하나만 붙이면 된다.

효과음은 Kenney CC0 묶음(app/fx/sfx)을 쓴다 — 출처 표기도 필요 없다.
"""
import glob
import os
import tempfile

from paths import APP_DIR

SFX_DIR = os.path.join(APP_DIR, "fx", "sfx")
RATE = 44100

# 대본에서 쓰는 이름 → 실제 파일 이름 조각
NAMES = {
    "톡": "click", "클릭": "click", "딸깍": "click",
    "딩": "confirmation", "확인": "confirmation", "성공": "confirmation",
    "뿅": "bong", "띵": "bong",
    "툭": "drop", "떨어짐": "drop",
    "쨍": "glass", "유리": "glass",
    "삑": "error", "실패": "error",
    "쿵": "impactPlate_heavy", "쾅": "impactPlate_heavy", "충돌": "impactGeneric_light",
    "퍽": "impactPunch_medium", "펀치": "impactPunch_heavy",
    "탁": "impactWood_medium", "나무": "impactWood_light",
    "뽀글": "pluck", "띠링": "pluck",
    "스윽": "scratch", "긁": "scratch",
    "휙": "scroll", "전환": "swoosh",
    "발자국": "footstep_concrete", "풀밭": "footstep_grass", "눈밭": "footstep_snow",
    "물음표": "question", "열기": "open", "닫기": "close",
    "선택": "select", "똑딱": "tick", "스위치": "switch",
}


def find_sfx(name):
    """이름으로 효과음 파일을 찾는다 (없으면 None)"""
    if not name:
        return None
    key = NAMES.get(str(name).strip(), str(name).strip())
    hits = []
    for ext in ("ogg", "wav", "mp3"):
        hits += glob.glob(os.path.join(SFX_DIR, "**", f"*{key}*.{ext}"), recursive=True)
    if not hits:
        return None
    hits.sort()
    return hits[0]


def list_names():
    """쓸 수 있는 이름 목록 (화면에 보여 줄 때)"""
    return sorted(NAMES.keys())


def _decode(path, seconds=None):
    """오디오 파일 → 스테레오 float32 배열 (RATE 기준)"""
    import av
    import numpy as np
    out = []
    with av.open(path) as f:
        st = f.streams.audio[0]
        rs = av.AudioResampler(format="fltp", layout="stereo", rate=RATE)
        for frame in f.decode(audio=0):
            frame.pts = None
            for rf in rs.resample(frame):
                out.append(rf.to_ndarray())
        for rf in rs.resample(None) or []:
            out.append(rf.to_ndarray())
    if not out:
        return np.zeros((2, 0), dtype="float32")
    a = np.concatenate(out, axis=1).astype("float32")
    if a.shape[0] == 1:
        a = np.vstack([a, a])
    if seconds:
        need = int(seconds * RATE)
        a = a[:, :need]
    return a


def mix(seconds, music_path=None, events=None, music_gain=0.7, sfx_gain=0.9,
        fade=0.6):
    """음악 + 효과음을 하나의 wav 로 섞는다.

    @param events [{"name": "톡", "at": 3.2}]
    @param music_gain 음악 소리 크기 (0~1)
    @param fade 음악이 처음 커지고 끝에 잦아드는 시간(초)
    @return 임시 wav 경로 (없으면 None)
    """
    import numpy as np
    events = events or []
    usable = [(e, find_sfx(e.get("name"))) for e in events]
    usable = [(e, p) for e, p in usable if p]
    if not music_path and not usable:
        return None

    total = max(1, int(float(seconds) * RATE))
    buf = np.zeros((2, total), dtype="float32")

    if music_path and os.path.isfile(music_path):
        m = _decode(music_path)
        if m.shape[1]:
            # 영상보다 짧으면 이어 붙이고, 길면 자른다
            if m.shape[1] < total:
                reps = int(np.ceil(total / m.shape[1]))
                m = np.tile(m, (1, reps))
            buf += m[:, :total] * max(0.0, min(1.5, float(music_gain)))
            # 여닫이 — 처음에는 서서히 커지고 끝에서는 서서히 잦아든다
            f = min(int(max(0.0, float(fade)) * RATE), total // 2)
            if f > 0:
                buf[:, :f] *= np.linspace(0, 1, f, dtype="float32")
                buf[:, total - f:] *= np.linspace(1, 0, f, dtype="float32")

    cache = {}
    for e, path in usable:
        if path not in cache:
            cache[path] = _decode(path)
        s = cache[path]
        # 같은 소리가 이어지면 기계처럼 들린다 — 게임에서 하듯 높낮이를 아주 조금씩 흔든다.
        # (시각에 따라 정해지므로 다시 구워도 결과가 같다)
        높낮이 = 1.0 + ((int(float(e.get("at", 0)) * 1000) * 2654435761 % 1000) / 1000 - 0.5) * 0.12
        if abs(높낮이 - 1.0) > 0.005:
            n0 = s.shape[1]
            새길이 = max(1, int(n0 / 높낮이))
            자리 = np.linspace(0, n0 - 1, 새길이)
            s = np.stack([np.interp(자리, np.arange(n0), s[0]),
                          np.interp(자리, np.arange(n0), s[1])]).astype("float32")
        at = int(max(0, float(e.get("at", 0))) * RATE)
        n = min(s.shape[1], total - at)
        if n > 0:
            buf[:, at:at + n] += s[:, :n] * sfx_gain

    # 소리가 깨지지 않게 전체 크기를 눌러 준다
    peak = float(np.max(np.abs(buf))) if buf.size else 0
    if peak > 0.99:
        buf *= 0.99 / peak

    fd, out = tempfile.mkstemp(suffix=".wav", prefix="mix_")
    os.close(fd)
    # 표준 wave 모듈로 직접 쓴다 — 좌·우를 번갈아(LRLRLR…) 넣는 게 스테레오의 규칙이다.
    # (라이브러리마다 배열 해석이 달라 소리가 2배속으로 나가는 일이 있어 여기서 못 박는다.)
    import wave
    inter = (np.clip(buf, -1, 1).T * 32767).astype("<i2")      # (표본수, 2)
    with wave.open(out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(inter.tobytes())
    return out
