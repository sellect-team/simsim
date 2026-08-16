"""로컬 이미지 인식 (WD14 ViT v3, ONNX) → 태그 → 영상 프롬프트
외부 LLM·인터넷 없이 그림의 캐릭터·색감·구도를 읽어낸다."""
import csv
import os
import threading

TAGGER_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tagger")
MODEL_PATH = os.path.join(TAGGER_DIR, "model.onnx")
TAGS_PATH = os.path.join(TAGGER_DIR, "selected_tags.csv")

_lock = threading.Lock()
_session = None
_tags = None          # (general, character, rating) 이름 리스트
_input_size = 448


def available():
    return os.path.exists(MODEL_PATH) and os.path.exists(TAGS_PATH)


def _load():
    global _session, _tags, _input_size
    if _session is not None:
        return
    import onnxruntime
    _session = onnxruntime.InferenceSession(
        MODEL_PATH, providers=["CPUExecutionProvider"])
    shape = _session.get_inputs()[0].shape
    if isinstance(shape[1], int):
        _input_size = shape[1]
    names, cats = [], []
    with open(TAGS_PATH, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            names.append(row["name"].replace("_", " "))
            cats.append(int(row["category"]))
    _tags = (names, cats)


def tag_image(path, general_thresh=0.20, char_thresh=0.75, top_k=30):
    """이미지에서 태그를 뽑는다 → {'general': [(tag, p)...], 'character': [...]}"""
    import numpy as np
    from PIL import Image
    with _lock:
        _load()
    img = Image.open(path).convert("RGBA")
    canvas = Image.new("RGBA", img.size, (255, 255, 255, 255))
    canvas.alpha_composite(img)
    img = canvas.convert("RGB")
    w, h = img.size
    m = max(w, h)
    sq = Image.new("RGB", (m, m), (255, 255, 255))
    sq.paste(img, ((m - w) // 2, (m - h) // 2))
    sq = sq.resize((_input_size, _input_size), Image.BICUBIC)
    arr = np.asarray(sq, dtype=np.float32)[:, :, ::-1]        # RGB → BGR
    arr = np.expand_dims(arr, 0)
    name = _session.get_inputs()[0].name
    probs = _session.run(None, {name: arr})[0][0]
    names, cats = _tags
    general, char = [], []
    for i, p in enumerate(probs):
        if i >= len(names):
            break
        if cats[i] == 0 and p >= general_thresh:
            general.append((names[i], float(p)))
        elif cats[i] == 4 and p >= char_thresh:
            char.append((names[i], float(p)))
    general.sort(key=lambda x: -x[1])
    char.sort(key=lambda x: -x[1])
    return {"general": general[:top_k], "character": char[:5]}


# 프롬프트 조립용 분류 (태그를 의미별로 나눠 자연스러운 문장을 만든다)
SUBJECT_HINTS = ("dog", "cat", "animal", "puppy", "kitten", "bird", "rabbit", "bear",
                 "1girl", "1boy", "girl", "boy", "no humans", "chibi")
COLOR_HINTS = ("brown", "white", "black", "red", "blue", "green", "yellow", "pink",
               "orange", "purple", "grey", "gray", "cream", "blonde", "silver")
STYLE_HINTS = ("simple background", "white background", "outline", "flat color",
               "lineart", "sketch", "monochrome", "chibi", "cartoon")
DROP = ("virtual youtuber", "commentary", "commentary request", "artist name",
        "signature", "watermark", "web address", "translation request",
        "english text", "speech bubble", "text", "korean text", "chinese text",
        "japanese text", "translated", "border", "letterboxed")

# 대표 색 이름 (RGB 기준점)
COLOR_NAMES = [
    ("white", (245, 245, 245)), ("cream", (245, 228, 196)), ("beige", (225, 205, 172)),
    ("light brown", (196, 154, 108)), ("brown", (140, 96, 60)), ("dark brown", (90, 62, 40)),
    ("black", (30, 30, 30)), ("grey", (140, 140, 140)),
    ("red", (200, 60, 60)), ("orange", (235, 150, 60)), ("yellow", (240, 215, 90)),
    ("green", (110, 175, 100)), ("blue", (85, 130, 210)), ("navy", (45, 60, 110)),
    ("purple", (150, 105, 190)), ("pink", (240, 165, 190)),
]


def dominant_colors(path, k=5):
    """이미지의 주요 색을 사람이 쓰는 색 이름으로 변환"""
    from PIL import Image
    img = Image.open(path).convert("RGB")
    img.thumbnail((160, 160))
    q = img.quantize(colors=k, method=Image.MEDIANCUT)
    pal = q.getpalette()[: k * 3]
    counts = sorted(q.getcolors(), key=lambda x: -x[0])
    out = []
    for cnt, idx in counts:
        rgb = tuple(pal[idx * 3: idx * 3 + 3])
        name = min(COLOR_NAMES,
                   key=lambda c: sum((a - b) ** 2 for a, b in zip(rgb, c[1])))[0]
        if name not in out:
            out.append(name)
    return out


SCENE_HINTS = ("indoors", "outdoors", "night", "day", "sky", "grass", "room",
               "street", "forest", "beach", "window", "door", "wall", "floor")


def build_video_prompt(tags, motion="", style_hint="", colors=None):
    """태그 + 색감 → t2v용 자연어 프롬프트 (문장형이 태그 나열보다 결과가 좋다)"""
    gen = [t for t, _ in tags.get("general", []) if t not in DROP]
    subject = [t for t in gen if any(k in t for k in SUBJECT_HINTS)
               and t not in ("no humans",)]
    scene = [t for t in gen if any(k in t for k in SCENE_HINTS)]
    styles = [t for t in gen if any(k in t for k in STYLE_HINTS)]
    used = set(subject) | set(scene) | set(styles)
    props = [t for t in gen if t not in used][:8]

    # 정체성을 결정하는 세부 특징(눈·입·색·소품)은 별도로 앞쪽에 배치
    FEATURE_HINTS = ("eyes", "mouth", "collar", "ears", "tail", "hair", "smile",
                     "closed", "solid circle", "full body", "solo", "chibi")
    features = [t for t in gen if any(k in t for k in FEATURE_HINTS)]
    props = [t for t in props if t not in features][:6]

    style = style_hint.strip() or ("2D anime style illustration, cel shading, "
                                   "clean lineart, flat colors, high quality")
    s = [style]
    if subject:
        desc = "a cute " + subject[0]
        if colors:
            desc += " in " + " and ".join(colors[:3]) + " tones"
        if features:
            desc += ", " + ", ".join(features[:6])
        s.append(desc)
    elif colors:
        s.append("scene in " + " and ".join(colors[:3]) + " tones")
    if scene:
        s.append(", ".join(scene[:3]))
    if props:
        s.append("with " + ", ".join(props))
    if styles:
        s.append(", ".join(styles[:2]))
    if motion.strip():
        s.append("Motion: " + motion.strip())
    s.append("camera stays still, smooth natural motion")
    return ". ".join(p for p in s if p)


def describe(path, motion="", style_hint=""):
    """이미지 경로 → (태그, 색, 프롬프트) 한 번에"""
    tags = tag_image(path)
    cols = dominant_colors(path)
    return {
        "tags": [t for t, _ in tags["general"]],
        "colors": cols,
        "prompt": build_video_prompt(tags, motion, style_hint, cols),
    }


if __name__ == "__main__":
    import json
    import sys
    for p in sys.argv[1:]:
        d = describe(p, motion="the character blinks and tilts its head slightly")
        print(os.path.basename(p))
        print("  태그:", ", ".join(d["tags"][:12]))
        print("  색감:", ", ".join(d["colors"]))
        print("  프롬프트:", d["prompt"])
        print()
