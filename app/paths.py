"""폴더 위치·공용 상수·작업 상태를 한 곳에 모아 둔다.

server.py 와 api/ 아래 모듈들이 모두 여기만 바라보므로 서로를 import 하지 않는다
(순환 참조 방지).
"""
import json
import os
import re
import time

APP_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(APP_DIR)

COMFY_URL = "http://127.0.0.1:8188"
PORT = 8189

# 생성 결과·입력 (ComfyUI 쪽)
VIDEO_DIR = os.path.normpath(os.path.join(
    ROOT_DIR, "ComfyUI_windows_portable", "ComfyUI", "output", "video"))
COMFY_INPUT_DIR = os.path.normpath(os.path.join(
    ROOT_DIR, "ComfyUI_windows_portable", "ComfyUI", "input"))
TRASH_DIR = os.path.join(VIDEO_DIR, "_trash")

# 앱이 관리하는 자료
VIDEOS_META_PATH = os.path.join(APP_DIR, "videos_meta.json")
TEMPLATES_PATH = os.path.join(APP_DIR, "templates.json")
MUSIC_DIR = os.path.join(APP_DIR, "music_projects")     # 뮤직비주얼 프로젝트
AUDIO_DIR = os.path.join(APP_DIR, "audio")              # 올린 음악
SHAPES_DIR = os.path.join(APP_DIR, "shapes")            # 배경 파티클용 로고·아이콘
CHAR_DIR = os.path.join(APP_DIR, "characters")          # 캐릭터 스프라이트
BG_DIR = os.path.join(APP_DIR, "backgrounds")           # 장면 배경 사진
FRAMES_DIR = os.path.join(APP_DIR, "_frames")           # 영상 굽기용 임시 프레임

VIDEO_EXT_RE = r"\.(mp4|webm|webp|gif)$"

# 진행 중인 작업 상태 (job_xxx → {state, progress, note, ...})
JOBS = {}


def job_id(prefix="job"):
    return "%s_%x" % (prefix, int(time.time() * 1000))


def load_videos_meta():
    try:
        with open(VIDEOS_META_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_videos_meta(meta):
    with open(VIDEOS_META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)


def safe_video_path(filename):
    """영상 폴더 밖으로 나가지 못하게 막고 (이름, 전체경로) 를 돌려준다."""
    name = os.path.basename(str(filename or ""))
    if not name or name != filename:
        return None, None
    if not re.search(VIDEO_EXT_RE, name, re.IGNORECASE):
        return None, None
    return name, os.path.join(VIDEO_DIR, name)


def safe_id(value, prefix=None):
    """mv_1a2b / ch_1a2b 같은 내부 id 검증"""
    s = str(value or "")
    pattern = r"%s_[0-9a-z]+" % prefix if prefix else r"[0-9a-zA-Z_]+"
    return s if re.fullmatch(pattern, s) else None


def clean_name(value, default="이름 없음", limit=40, allow=r"\w\-가-힣 .!?()"):
    """저장할 이름 다듬기 — 좌우 공백을 없애고, 쓸 수 없는 글자를 뺀다.

    가운데 공백은 여러 칸이어도 한 칸으로 모은다 ("우리집   강아지" → "우리집 강아지").
    """
    s = re.sub(r"[^%s]" % allow, "", str(value or ""))
    s = re.sub(r"\s+", " ", s).strip()
    return s[:limit] or default


def unique_name(name, taken, default="이름 없음", limit=40):
    """이미 있는 이름이면 뒤에 (1) (2) … 를 붙여 겹치지 않게 한다.

    `taken` 은 이미 쓰이고 있는 이름들(어떤 것이든 for 로 돌 수 있으면 된다).
    비교할 때는 좌우 공백과 대소문자를 무시한다 — 사람 눈에 같아 보이면 같은 이름으로 친다.

    >>> unique_name("강아지", ["강아지", "강아지 (1)"])
    '강아지 (2)'
    """
    base = clean_name(name, default, limit)
    있음 = {str(t or "").strip().lower() for t in taken}
    if base.lower() not in 있음:
        return base
    # 이미 "이름 (3)" 꼴이면 그 앞부분을 밑동으로 삼는다
    m = re.match(r"^(.*?)\s*\((\d+)\)$", base)
    밑동 = (m.group(1).strip() if m else base) or default
    n = 1
    while True:
        후보 = f"{밑동} ({n})"
        if len(후보) > limit:                       # 길이가 넘치면 밑동을 줄인다
            밑동 = 밑동[:max(1, limit - len(f" ({n})"))]
            후보 = f"{밑동} ({n})"
        if 후보.lower() not in 있음:
            return 후보
        n += 1
        if n > 9999:
            return 후보


def names_in_dir(folder, skip_id=None):
    """폴더 안 *.json 들의 이름 모음 (같은 것을 다시 저장할 때는 자기 자신은 뺀다)"""
    out = []
    if not os.path.isdir(folder):
        return out
    for n in os.listdir(folder):
        if not n.endswith(".json"):
            continue
        try:
            with open(os.path.join(folder, n), encoding="utf-8") as f:
                m = json.load(f)
        except Exception:
            continue
        if skip_id and m.get("id") == skip_id:
            continue
        if m.get("name"):
            out.append(m["name"])
    return out
