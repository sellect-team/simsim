"""🏷 태그 — 자산(배경·캐릭터·소품·장면·조각)에 이름표를 붙여 찾기 쉽게 한다.

수백 편을 만들면 배경만 수십 개가 된다. 이름만으로는 못 찾는다.
`밤`, `실내`, `우리집강아지`, `시즌1` 처럼 붙여 두면 골라 볼 수 있다.

설계에서 지킨 것
  · 태그는 **자산 파일 안에** 같이 저장한다 (따로 관리하는 표를 만들지 않는다 — 어긋난다)
  · 이름에서 **자동으로 제안**한다 — 사람이 매번 적게 하면 안 붙인다
  · 종류가 달라도 **같은 API** 로 다룬다 (배경·캐릭터가 따로 놀지 않게)
"""
import json
import os
import re
import time

from aiohttp import web

from paths import APP_DIR, AUDIO_DIR, BG_DIR, CHAR_DIR

SCENE_DIR = os.path.join(APP_DIR, "scenes")
PREFAB_DIR = os.path.join(APP_DIR, "prefabs")

# 종류 → (파일 찾는 법, 읽고 쓰는 법)
KINDS = {
    "캐릭터": {"dir": CHAR_DIR, "meta": lambda d, i: os.path.join(d, i, "meta.json")},
    "배경": {"dir": BG_DIR, "meta": lambda d, i: os.path.join(d, i + ".json")},
    # 음악은 파일 이름이 곧 아이디라서 `노래.wav.json` 이 설명서가 된다
    "음악": {"dir": AUDIO_DIR, "meta": lambda d, i: os.path.join(d, i + ".json")},
    "장면": {"dir": SCENE_DIR, "meta": lambda d, i: os.path.join(d, i + ".json")},
    "조각": {"dir": PREFAB_DIR, "meta": lambda d, i: os.path.join(d, i + ".json")},
}


def clean_tags(값):
    """쉼표·공백으로 나뉜 글 또는 목록 → 깔끔한 태그 목록"""
    if isinstance(값, str):
        값 = re.split(r"[,\n]", 값)
    out = []
    for t in 값 or []:
        t = re.sub(r"[^\w가-힣 \-]", "", str(t)).strip()
        t = re.sub(r"\s+", " ", t)[:20]
        if t and t not in out:
            out.append(t)
    return out[:12]


def suggest(이름, 종류="배경"):
    """이름을 보고 붙일 만한 태그를 짐작한다.

    대본이 알아듣는 낱말과 **같은 표**를 쓴다 — 그래야 태그와 대본이 따로 놀지 않는다.
    """
    글 = str(이름 or "").replace(" ", "")
    나온것 = []
    시간 = {"밤": ["밤"], "새벽": ["새벽"], "노을": ["노을"], "저녁": ["노을"],
            "아침": ["아침"], "비": ["비"], "눈": ["눈"], "흐린": ["흐림"]}
    장소 = {"바다": ["바다", "야외"], "해변": ["바다", "야외"], "들판": ["들판", "야외"],
            "공원": ["들판", "야외"], "숲": ["숲", "야외"], "산": ["산", "야외"],
            "길": ["길", "야외"], "거리": ["길", "야외"], "마을": ["마을", "야외"],
            "방": ["실내"], "부엌": ["실내"], "교실": ["실내", "학교"], "집": ["실내"],
            "사무실": ["실내", "일터"], "지하철": ["실내", "탈것"], "현관": ["실내"],
            "눈밭": ["눈", "야외"], "사막": ["사막", "야외"], "우주": ["우주"],
            "꽃밭": ["꽃", "야외"], "캠프": ["야외", "불"]}
    동물 = {"강아지": ["개"], "개": ["개"], "고양이": ["고양이"], "냥": ["고양이"],
            "곰": ["곰"], "토끼": ["토끼"], "여우": ["여우"], "돼지": ["돼지"],
            "병아리": ["새"], "새": ["새"], "쥐": ["쥐"], "호랑이": ["호랑이"],
            "아이": ["사람"], "소년": ["사람"], "소녀": ["사람"]}
    가락 = {"신남": ["신남"], "밝": ["밝음"], "잔잔": ["잔잔"], "조용": ["잔잔"],
            "슬픔": ["슬픔"], "슬픈": ["슬픔"], "무서": ["긴장"], "긴장": ["긴장"],
            "산책": ["잔잔", "일상"], "일상": ["일상"], "출근": ["일상"],
            "배경음": ["배경음"], "브금": ["배경음"], "테마": ["테마"],
            "피아노": ["피아노"], "기타": ["기타"], "드럼": ["드럼"],
            "엔딩": ["엔딩"], "오프닝": ["오프닝"], "타이틀": ["오프닝"]}
    표 = ({**동물} if 종류 == "캐릭터"
          else {**가락} if 종류 == "음악"
          else {**시간, **장소})
    for 말, 태 in 표.items():
        if 말 in 글:
            for t in 태:
                if t not in 나온것:
                    나온것.append(t)
    if not 나온것:
        나온것.append("정리안됨")
    return 나온것


def _read(종류, 아이디):
    k = KINDS.get(종류)
    if not k:
        return None, None
    p = k["meta"](k["dir"], 아이디)
    if not os.path.isfile(p):
        return None, None
    with open(p, encoding="utf-8") as f:
        return json.load(f), p


def _walk(종류):
    """그 종류의 모든 자산 (meta, 경로)"""
    k = KINDS.get(종류)
    if not k or not os.path.isdir(k["dir"]):
        return
    if 종류 == "캐릭터":
        for n in os.listdir(k["dir"]):
            p = os.path.join(k["dir"], n, "meta.json")
            if os.path.isfile(p):
                try:
                    with open(p, encoding="utf-8") as f:
                        yield json.load(f), p
                except Exception:
                    continue
    else:
        for n in os.listdir(k["dir"]):
            if not n.endswith(".json"):
                continue
            p = os.path.join(k["dir"], n)
            try:
                with open(p, encoding="utf-8") as f:
                    yield json.load(f), p
            except Exception:
                continue


async def listing(request):
    """모든 자산의 태그 모음 — 어떤 태그가 몇 개인지, 태그 없는 것은 몇 개인지"""
    종류들 = [request.query.get("kind")] if request.query.get("kind") else list(KINDS)
    센것, 항목 = {}, []
    for 종류 in 종류들:
        for m, _ in _walk(종류):
            태 = m.get("tags") or []
            항목.append({"종류": 종류, "id": m.get("id"), "name": m.get("name"),
                         "tags": 태, "제안": suggest(m.get("name"), 종류) if not 태 else []})
            for t in 태:
                센것[t] = 센것.get(t, 0) + 1
    태그들 = sorted(센것.items(), key=lambda x: (-x[1], x[0]))
    return web.json_response({
        "항목": 항목, "수": len(항목),
        "태그": [{"태그": t, "수": n} for t, n in 태그들],
        "태그없음": sum(1 for x in 항목 if not x["tags"]),
    })


async def update(request):
    """한 자산의 태그를 통째로 바꾼다"""
    body = await request.json()
    m, p = _read(body.get("kind"), str(body.get("id") or ""))
    if not m:
        return web.json_response({"error": "자산을 찾지 못했습니다."}, status=404)
    m["tags"] = clean_tags(body.get("tags"))
    m["tagged"] = time.time()
    with open(p, "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False)
    return web.json_response({"ok": True, "item": m})


async def bulk(request):
    """여러 자산에 태그를 한꺼번에 더하거나 뺀다 (수십 개를 정리할 때)"""
    body = await request.json()
    더할것 = clean_tags(body.get("더하기"))
    뺄것 = set(clean_tags(body.get("빼기")))
    바뀐것 = 0
    for it in body.get("대상") or []:
        m, p = _read(it.get("kind"), str(it.get("id") or ""))
        if not m:
            continue
        태 = [t for t in (m.get("tags") or []) if t not in 뺄것]
        for t in 더할것:
            if t not in 태:
                태.append(t)
        m["tags"] = 태[:12]
        m["tagged"] = time.time()
        with open(p, "w", encoding="utf-8") as f:
            json.dump(m, f, ensure_ascii=False)
        바뀐것 += 1
    return web.json_response({"ok": True, "수": 바뀐것})


async def auto(request):
    """태그가 없는 것들에 **이름을 보고 지은 태그**를 한 번에 붙인다"""
    body = await request.json() if request.can_read_body else {}
    덮어쓰기 = bool(body.get("덮어쓰기"))
    붙인것 = []
    for 종류 in KINDS:
        for m, p in _walk(종류):
            if m.get("tags") and not 덮어쓰기:
                continue
            m["tags"] = suggest(m.get("name"), 종류)
            m["tagged"] = time.time()
            with open(p, "w", encoding="utf-8") as f:
                json.dump(m, f, ensure_ascii=False)
            붙인것.append({"종류": 종류, "name": m.get("name"), "tags": m["tags"]})
    return web.json_response({"ok": True, "수": len(붙인것), "붙인것": 붙인것})


def register(app):
    app.router.add_get("/api/tags", listing)
    app.router.add_post("/api/tags/update", update)
    app.router.add_post("/api/tags/bulk", bulk)
    app.router.add_post("/api/tags/auto", auto)
