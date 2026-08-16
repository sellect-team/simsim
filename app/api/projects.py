"""🏠 프로젝트 — 만드는 일의 가장 큰 단위.

    프로젝트 (예: "댕댕이 시리즈")
      ├ 스토리 1  "고구마 굽기"     30초~3분짜리 한 편 (대본 + 구운 영상)
      ├ 스토리 2  "밤바다 산책"
      └ 이어붙이기 · 음악 · 굽기 설정        → 여러 편을 이어 20~30분짜리로

편집 프로그램(다빈치)의 짜임을 따랐다.
  ① 프로젝트를 고르고 ② 그 안에서 이야기들을 만들고 ③ 이어 붙여 ④ 굽는다.

예전 파일(대본 하나짜리)도 그대로 읽힌다 — 읽을 때 스토리 한 편으로 옮겨 준다.
"""
import base64
import json
import os
import re
import time

from aiohttp import web

from paths import APP_DIR, VIDEO_DIR, clean_name, names_in_dir, unique_name

PROJ_DIR = os.path.join(APP_DIR, "projects")

# 굽기 기본값 — 프로젝트마다 따로 저장한다
DEFAULT_ENCODE = {"비율": "9:16", "긴변": 1280, "fps": 30, "화질": "보통"}
DEFAULT_TIMELINE = {"순서": [], "사이": 0.3, "음악": {"파일": "", "소리크기": 0.7, "여닫이": 1.5}}


def _safe(pid):
    pid = str(pid or "")
    return pid if re.fullmatch(r"pj_[0-9a-z]+", pid) else None


def _safe_sid(sid):
    sid = str(sid or "")
    return sid if re.fullmatch(r"st_[0-9a-z]+", sid) else None


def _path(pid):
    """아이디가 없거나 이상하면 '없는 길' 을 돌려준다.

    예전에는 `None + ".json"` 에서 터져 **500** 이 났다.
    아이디가 안 온 것은 서버가 고장 난 것이 아니라 '그런 것이 없다' 일 뿐이라
    조용히 404 로 흘러가야 한다.
    """
    if not _safe(pid):
        return os.path.join(PROJ_DIR, "__없는것__.json")
    return os.path.join(PROJ_DIR, pid + ".json")


def _new_id(prefix, 있는것=()):
    """겹치지 않는 아이디.

    예전에는 밀리초만 썼는데, 단추를 두 번 빨리 누르면 **같은 밀리초**에 두 번 불려
    두 이야기가 아이디 하나를 나눠 갖는 일이 있었다. 그러면 목록에서 둘이 함께
    골라진 것처럼 보이고, 한쪽을 고치면 다른 쪽이 열리고, 지우면 둘 다 사라진다.
    그래서 이미 쓰는 아이디를 받아 비켜 간다.
    """
    있는것 = set(있는것 or ())
    n = int(time.time() * 1000)
    for _ in range(100000):
        아이디 = "%s_%x" % (prefix, n)
        if 아이디 not in 있는것:
            return 아이디
        n += 1
    return "%s_%x" % (prefix, n)


def _쓰는프로젝트아이디():
    """파일 이름이 곧 프로젝트 아이디다 — 열어 보지 않고 센다"""
    if not os.path.isdir(PROJ_DIR):
        return set()
    return {n[:-5] for n in os.listdir(PROJ_DIR) if n.endswith(".json")}


# ──────────────────────────────────────────────────────────
# 읽기 · 옮기기
# ──────────────────────────────────────────────────────────
def _아이디겹침고치기(m):
    """이야기 둘이 아이디 하나를 나눠 갖고 있으면 뒤엣것에 새 아이디를 준다.

    옛 `_new_id` 가 밀리초만 써서, 단추를 빨리 두 번 누르면 이런 일이 생겼다.
    겹치면 목록에서 둘이 함께 골라진 것처럼 보이고, 한쪽을 고치면 다른 쪽이 열리고,
    하나를 지우면 둘 다 사라진다. 읽을 때마다 조용히 바로잡는다.
    """
    본것, 고친것 = set(), []
    자리표 = {}      # 옛 아이디 → 그 아이디를 쓰던 이야기들의 **최종** 아이디 (이야기 차례대로)
    for s in m.get("stories") or []:
        옛 = s.get("sid")
        sid = 옛
        if not sid or sid in 본것:
            sid = _new_id("st", 본것)
            고친것.append((옛, sid))
            s["sid"] = sid
        본것.add(sid)
        자리표.setdefault(옛, []).append(sid)

    if 고친것:
        """이어붙이기 순서도 같이 고친다.

        겹친 아이디는 순서 목록에도 두 번 적혀 있다. 그 **n 번째 자리**가
        n 번째 이야기다 — 그래서 앞에서부터 차례로 나눠 준다.
        (첫 자리만 바꾸면 두 편의 앞뒤가 뒤집힌다.)
        """
        남은것 = {k: list(v) for k, v in 자리표.items()}
        순서 = []
        for x in (m.get("timeline") or {}).get("순서") or []:
            줄 = 남은것.get(x)
            순서.append(줄.pop(0) if 줄 else x)
        # 순서에서 빠진 편은 뒤에 붙인다 (없는 편은 굽기에서 통째로 빠진다)
        적힌것 = set(순서)
        for s in m.get("stories") or []:
            if s["sid"] not in 적힌것:
                순서.append(s["sid"])
        m.setdefault("timeline", dict(DEFAULT_TIMELINE))["순서"] = 순서
    return 고친것


def _migrate(m):
    """예전 모양(대본 하나) → 새 모양(스토리 묶음)"""
    if "stories" in m:
        m.setdefault("timeline", dict(DEFAULT_TIMELINE))
        m.setdefault("encode", dict(DEFAULT_ENCODE))
        m["_고친아이디"] = _아이디겹침고치기(m)
        return m
    story = {
        "sid": _new_id("st"),
        "name": m.get("name") or "이야기",
        "text": m.get("text", ""),
        "seconds": m.get("seconds", 0),
        "scenes": m.get("scenes", 0),
        "missing": m.get("missing", []),
        "uses": m.get("uses", {}),
        "music_prompt": m.get("music_prompt", ""),
        "videos": m.get("videos", []),
        "updated": m.get("updated") or m.get("created") or time.time(),
    }
    m["stories"] = [story] if (story["text"] or story["videos"]) else []
    m["timeline"] = dict(DEFAULT_TIMELINE)
    m["timeline"]["순서"] = [s["sid"] for s in m["stories"]]
    m["encode"] = dict(DEFAULT_ENCODE)
    for k in ("text", "seconds", "scenes", "missing", "uses", "music_prompt"):
        m.pop(k, None)
    return m


def _read(pid):
    p = _path(pid)
    if not os.path.isfile(p):
        return None
    with open(p, encoding="utf-8") as f:
        m = _migrate(json.load(f))
    # 겹친 아이디를 고쳤으면 그 자리에서 눌러 둔다 (다음에 읽을 때 또 고치지 않게)
    if m.pop("_고친아이디", None):
        try:
            _write(m, 시각갱신=False)
        except OSError:
            pass
    return m


def _write(m, 시각갱신=True):
    os.makedirs(PROJ_DIR, exist_ok=True)
    m.pop("_고친아이디", None)              # 저장 파일에는 남기지 않는다
    if 시각갱신:
        m["updated"] = time.time()          # 손보기로 고친 것은 '고침' 이 아니다
    with open(_path(m["id"]), "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=1)
    return m


def _all():
    out = []
    if not os.path.isdir(PROJ_DIR):
        return out
    for n in os.listdir(PROJ_DIR):
        if not n.endswith(".json"):
            continue
        try:
            with open(os.path.join(PROJ_DIR, n), encoding="utf-8") as f:
                m = _migrate(json.load(f))
        except Exception:
            continue
        # 겹친 아이디를 고쳤으면 눌러 둔다 (목록만 봐도 저절로 낫는다)
        if m.pop("_고친아이디", None):
            try:
                _write(m, 시각갱신=False)
            except OSError:
                pass
        out.append(m)
    return out


# ──────────────────────────────────────────────────────────
# 상태 판정
# ──────────────────────────────────────────────────────────
def _videos_exist(names):
    """구운 영상이 아직 있는지 (지운 것은 빼 준다)"""
    return [n for n in (names or []) if os.path.isfile(os.path.join(VIDEO_DIR, n))]


def _mark_auto(missing):
    """배경·캐릭터는 그림이 없으면 코드로 그려 주므로 '자동'으로 친다.

    예전에 저장된 목록에는 이 표시가 없어서, 읽을 때 붙여 준다.
    """
    out = []
    for m in missing or []:
        m = dict(m)
        if "자동" not in m:
            m["자동"] = m.get("종류") in ("배경", "캐릭터")
        out.append(m)
    return out


def _story_brief(s):
    vids = _videos_exist(s.get("videos"))
    부족 = _mark_auto(s.get("missing"))
    막힘 = [x for x in 부족 if not x.get("자동")]
    if vids:
        state = "완성"
    elif not (s.get("text") or "").strip():
        state = "빈대본"
    elif 막힘:
        state = "그림부족"
    elif 부족:
        state = "임시그림"
    else:
        state = "준비됨"
    return {
        "sid": s.get("sid"), "name": s.get("name") or "이야기", "state": state,
        "seconds": s.get("seconds") or 0, "scenes": s.get("scenes") or 0,
        "missing": 부족, "막힘": len(막힘), "videos": vids,
        "uses": s.get("uses") or {}, "music_prompt": s.get("music_prompt") or "",
        "updated": s.get("updated") or 0,
    }


def _brief(m):
    """프로젝트 목록 카드에 쓸 요약"""
    stories = [_story_brief(s) for s in m.get("stories", [])]
    배우, 배경 = [], []
    for s in stories:
        for n in s["uses"].get("배우", []):
            if n not in 배우:
                배우.append(n)
        for n in s["uses"].get("배경", []):
            if n not in 배경:
                배경.append(n)
    총초 = sum(s["seconds"] for s in stories)
    상태수 = {}
    for s in stories:
        상태수[s["state"]] = 상태수.get(s["state"], 0) + 1
    if not stories:
        state = "빈프로젝트"
    elif 상태수.get("그림부족"):
        state = "그림부족"
    elif 상태수.get("완성") == len(stories):
        state = "완성"
    elif 상태수.get("빈대본") == len(stories):
        state = "빈대본"
    elif 상태수.get("임시그림"):
        state = "임시그림"
    else:
        state = "준비됨"
    when = m.get("updated") or m.get("created") or 0
    return {
        "id": m["id"], "name": m.get("name") or "이름 없음", "state": state,
        "group": m.get("group") or "",
        "stories": stories, "story_count": len(stories),
        "seconds": 총초, "배우": 배우, "배경": 배경,
        "encode": m.get("encode") or dict(DEFAULT_ENCODE),
        "timeline": m.get("timeline") or dict(DEFAULT_TIMELINE),
        "videos": _videos_exist(m.get("videos")),
        "updated": when,
        "date": time.strftime("%m/%d %H:%M", time.localtime(when)),
    }


def _save_thumb(key, durl):
    if isinstance(durl, str) and durl.startswith("data:image"):
        os.makedirs(PROJ_DIR, exist_ok=True)
        with open(os.path.join(PROJ_DIR, key + ".jpg"), "wb") as f:
            f.write(base64.b64decode(durl.split(",", 1)[1]))


# ──────────────────────────────────────────────────────────
# API — 프로젝트
# ──────────────────────────────────────────────────────────
async def listing(request):
    items = [_brief(m) for m in _all()]
    # 그룹으로 거르기 — group=gp_… 이면 그 시리즈만, group=__none 이면 아직 안 묶인 것만
    고른그룹 = request.query.get("group") or ""
    if 고른그룹 == "__none":
        items = [x for x in items if not x.get("group")]
    elif 고른그룹:
        items = [x for x in items if x.get("group") == 고른그룹]
    items.sort(key=lambda x: -x["updated"])

    # 모든 프로젝트에서 부족한 그림을 한데 모은다 (한 번에 채우려고)
    필요 = {}
    for it in items:
        for s in it["stories"]:
            for n in s["missing"]:
                key = f'{n.get("종류")}:{n.get("이름")}'
                필요.setdefault(key, {
                    "종류": n.get("종류"), "이름": n.get("이름"),
                    "프롬프트": n.get("프롬프트", ""), "자동": bool(n.get("자동")),
                    "자동설명": n.get("자동설명", ""), "쓰는곳": []})
                if it["name"] not in 필요[key]["쓰는곳"]:
                    필요[key]["쓰는곳"].append(it["name"])
    상태 = {}
    for it in items:
        상태[it["state"]] = 상태.get(it["state"], 0) + 1
    return web.json_response({"items": items, "needs": list(필요.values()), "counts": 상태})


async def get(request):
    m = _read(_safe(request.query.get("id")))
    if not m:
        return web.json_response({"error": "없음"}, status=404)
    return web.json_response({"item": m, "brief": _brief(m)})


async def save(request):
    """프로젝트 만들기 · 이름/설정 고치기 (스토리 내용은 story_save 로)"""
    body = await request.json()
    pid = _safe(body.get("id"))
    old = _read(pid) if pid else None
    if not old:
        pid = _new_id("pj", _쓰는프로젝트아이디())
        old = {"id": pid, "stories": [], "timeline": dict(DEFAULT_TIMELINE),
               "encode": dict(DEFAULT_ENCODE), "videos": [], "created": time.time(),
               "group": body.get("group") or ""}
    if "name" in body or not old.get("name"):
        # 이름 중복은 같은 그룹 안에서만 따진다 (다른 시리즈에 같은 이름이 있어도 괜찮다)
        같은그룹 = [m.get("name") for m in _all()
                    if m.get("id") != pid and (m.get("group") or "") == (old.get("group") or "")]
        old["name"] = unique_name(body.get("name") or old.get("name"),
                                  같은그룹, default="프로젝트")
    for k in ("timeline", "encode", "videos", "group"):
        if k in body:
            old[k] = body[k]
    _save_thumb(pid, body.get("thumb", ""))
    _write(old)
    return web.json_response({"ok": True, "id": pid, "item": _brief(old)})


async def delete(request):
    body = await request.json()
    pid = _safe(body.get("id"))
    if not pid:
        return web.json_response({"error": "없음"}, status=404)
    m = _read(pid)
    for p in [_path(pid), os.path.join(PROJ_DIR, pid + ".jpg")] + \
             [os.path.join(PROJ_DIR, s["sid"] + ".jpg") for s in (m or {}).get("stories", [])]:
        try:
            if os.path.isfile(p):
                os.remove(p)
        except OSError:
            pass
    return web.json_response({"ok": True})


async def thumb(request):
    """프로젝트 또는 스토리 미리보기 그림 (id=pj_… 또는 st_…)"""
    key = request.query.get("id") or ""
    if not re.fullmatch(r"(pj|st)_[0-9a-z]+", key):
        return web.json_response({"error": "없음"}, status=404)
    p = os.path.join(PROJ_DIR, key + ".jpg")
    if not os.path.isfile(p):
        return web.json_response({"error": "없음"}, status=404)
    return web.FileResponse(p, headers={"Cache-Control": "no-cache"})


# ──────────────────────────────────────────────────────────
# API — 스토리 (프로젝트 안의 한 편)
# ──────────────────────────────────────────────────────────
async def story_save(request):
    body = await request.json()
    pid = _safe(body.get("id"))
    m = _read(pid)
    if not m:
        return web.json_response({"error": "프로젝트가 없습니다."}, status=404)
    sid = _safe_sid(body.get("sid"))
    cur = next((s for s in m["stories"] if s["sid"] == sid), None)
    if not cur:
        sid = _new_id("st", [s.get("sid") for s in m["stories"]])
        cur = {"sid": sid, "videos": [], "created": time.time()}
        m["stories"].append(cur)
        m["timeline"].setdefault("순서", []).append(sid)
    if "name" in body or not cur.get("name"):
        딴것 = [s.get("name") for s in m["stories"] if s["sid"] != sid]
        cur["name"] = unique_name(body.get("name") or cur.get("name"), 딴것, default="이야기")
    for k in ("text", "seconds", "scenes", "missing", "uses", "music_prompt", "videos"):
        if k in body:
            cur[k] = body[k]
    cur["updated"] = time.time()
    _save_thumb(sid, body.get("thumb", ""))
    _write(m)
    return web.json_response({"ok": True, "id": pid, "sid": sid,
                              "story": _story_brief(cur), "item": _brief(m)})


async def story_delete(request):
    body = await request.json()
    m = _read(_safe(body.get("id")))
    sid = _safe_sid(body.get("sid"))
    if not m or not sid:
        return web.json_response({"error": "없음"}, status=404)
    m["stories"] = [s for s in m["stories"] if s["sid"] != sid]
    m["timeline"]["순서"] = [x for x in m["timeline"].get("순서", []) if x != sid]
    try:
        p = os.path.join(PROJ_DIR, sid + ".jpg")
        if os.path.isfile(p):
            os.remove(p)
    except OSError:
        pass
    _write(m)
    return web.json_response({"ok": True, "item": _brief(m)})


async def story_get(request):
    m = _read(_safe(request.query.get("id")))
    sid = _safe_sid(request.query.get("sid"))
    s = next((x for x in (m or {}).get("stories", []) if x["sid"] == sid), None)
    if not s:
        return web.json_response({"error": "없음"}, status=404)
    return web.json_response({"story": s})


async def story_order(request):
    """이어붙이기 차례 바꾸기"""
    body = await request.json()
    m = _read(_safe(body.get("id")))
    if not m:
        return web.json_response({"error": "없음"}, status=404)
    있는것 = [s["sid"] for s in m["stories"]]
    새순서 = [x for x in (body.get("순서") or []) if x in 있는것]
    for x in 있는것:                      # 빠진 것은 뒤에 붙인다
        if x not in 새순서:
            새순서.append(x)
    m["timeline"]["순서"] = 새순서
    for k in ("사이", "음악"):
        if k in body:
            m["timeline"][k] = body[k]
    _write(m)
    return web.json_response({"ok": True, "item": _brief(m)})


async def duplicate(request):
    """프로젝트 통째로 베끼기 — 시리즈물은 '지난 편 복사 → 대본만 교체'가 기본이다."""
    body = await request.json()
    m = _read(_safe(body.get("id")))
    if not m:
        return web.json_response({"error": "없음"}, status=404)
    새 = json.loads(json.dumps(m))
    새["id"] = _new_id("pj", _쓰는프로젝트아이디())
    새["name"] = unique_name(m.get("name"), names_in_dir(PROJ_DIR), default="프로젝트")
    새["created"] = time.time()
    새["videos"] = []                                   # 구운 영상은 안 물려준다
    바뀐 = {}
    for s in 새["stories"]:
        옛 = s["sid"]
        s["sid"] = 바뀐[옛] = "st_%x" % (int(time.time() * 1000) + len(바뀐))
        s["videos"] = []
    새["timeline"]["순서"] = [바뀐.get(x, x) for x in 새["timeline"].get("순서", [])]
    _write(새)
    # 미리보기 그림도 같이 베낀다
    for 옛, 신 in list(바뀐.items()) + [(m["id"], 새["id"])]:
        a = os.path.join(PROJ_DIR, 옛 + ".jpg")
        if os.path.isfile(a):
            with open(a, "rb") as f1, open(os.path.join(PROJ_DIR, 신 + ".jpg"), "wb") as f2:
                f2.write(f1.read())
    return web.json_response({"ok": True, "id": 새["id"], "item": _brief(새)})


async def story_duplicate(request):
    body = await request.json()
    m = _read(_safe(body.get("id")))
    sid = _safe_sid(body.get("sid"))
    s = next((x for x in (m or {}).get("stories", []) if x["sid"] == sid), None)
    if not s:
        return web.json_response({"error": "없음"}, status=404)
    새 = json.loads(json.dumps(s))
    새["sid"] = _new_id("st", [x.get("sid") for x in m["stories"]])
    새["name"] = unique_name(s.get("name"), [x.get("name") for x in m["stories"]], default="이야기")
    새["videos"] = []
    새["updated"] = time.time()
    자리 = m["stories"].index(s) + 1
    m["stories"].insert(자리, 새)
    순서 = m["timeline"].setdefault("순서", [])
    순서.insert(순서.index(sid) + 1 if sid in 순서 else len(순서), 새["sid"])
    _write(m)
    a = os.path.join(PROJ_DIR, sid + ".jpg")
    if os.path.isfile(a):
        with open(a, "rb") as f1, open(os.path.join(PROJ_DIR, 새["sid"] + ".jpg"), "wb") as f2:
            f2.write(f1.read())
    return web.json_response({"ok": True, "sid": 새["sid"], "item": _brief(m)})


async def asset_usage(request):
    """이 캐릭터·배경을 어느 이야기가 쓰는가.

    지우거나 이름을 바꾸기 **전에** 무엇이 깨질지 보여 주려고 있다.
    """
    이름 = clean_name(request.query.get("name"), default="")
    종류 = request.query.get("kind") or ""
    쓰는곳 = []
    for m in _all():
        for s in m.get("stories", []):
            uses = s.get("uses") or {}
            목록 = uses.get("배우", []) if 종류 != "배경" else uses.get("배경", [])
            if 종류 not in ("배경", "캐릭터"):
                목록 = list(uses.get("배우", [])) + list(uses.get("배경", []))
            if 이름 in 목록:
                쓰는곳.append({"project": m["id"], "project_name": m.get("name"),
                              "sid": s["sid"], "story_name": s.get("name")})
    return web.json_response({"이름": 이름, "쓰는곳": 쓰는곳, "수": len(쓰는곳)})


async def asset_rename(request):
    """자산 이름을 바꿀 때 **대본 속 이름까지 같이** 바꾼다.

    이걸 안 하면 이름만 바뀌고 대본은 옛 이름을 계속 불러서 조용히 깨진다.
    """
    body = await request.json()
    옛 = clean_name(body.get("from"), default="")
    새 = clean_name(body.get("to"), default="")
    if not 옛 or not 새 or 옛 == 새:
        return web.json_response({"error": "이름 두 개가 필요합니다."}, status=400)
    바뀐 = []
    낱말 = re.compile(r"(?<![\w가-힣])" + re.escape(옛) + r"(?![\w가-힣])")
    for m in _all():
        손댐 = False
        for s in m.get("stories", []):
            글 = s.get("text") or ""
            if 옛 in 글:
                s["text"] = 낱말.sub(새, 글)
                손댐 = True
            uses = s.get("uses") or {}
            for k in ("배우", "배경"):
                if 옛 in (uses.get(k) or []):
                    uses[k] = [새 if x == 옛 else x for x in uses[k]]
                    손댐 = True
        if 손댐:
            _write(m)
            바뀐.append(m.get("name"))
    return web.json_response({"ok": True, "바뀐프로젝트": 바뀐, "수": len(바뀐)})


async def video_owner(request):
    """이 영상 파일이 어느 프로젝트·어느 편의 것인가 (히스토리에서 보여 주려고)"""
    name = os.path.basename(str(request.query.get("filename") or ""))
    for m in _all():
        if name in (m.get("videos") or []):
            return web.json_response({"project": m.get("name"), "id": m["id"],
                                      "story": None, "kind": "이어붙인 것"})
        for s in m.get("stories", []):
            if name in (s.get("videos") or []):
                return web.json_response({"project": m.get("name"), "id": m["id"],
                                          "story": s.get("name"), "sid": s["sid"],
                                          "kind": "한 편"})
    return web.json_response({"project": None})


async def video_owners(request):
    """영상 이름 → 어디 것인지 를 한꺼번에 (히스토리 목록용)"""
    표 = {}
    for m in _all():
        for n in m.get("videos") or []:
            표[n] = {"project": m.get("name"), "id": m["id"], "kind": "이어붙인 것"}
        for s in m.get("stories", []):
            for n in s.get("videos") or []:
                표[n] = {"project": m.get("name"), "id": m["id"],
                         "story": s.get("name"), "sid": s["sid"], "kind": "한 편"}
    return web.json_response({"owners": 표})


# ──────────────────────────────────────────────────────────
# 🧩 조각(프리팹) — 자주 쓰는 대본 토막을 이름 붙여 두고 어디든 끼워 넣는다.
#   "누렁이가 공 들고 걷기" 처럼 한 덩어리를 만들어 두면
#   다음 편에서는 이름만 골라 넣으면 된다. 수백 편을 만들 때 이게 결정적이다.
# ──────────────────────────────────────────────────────────
PREFAB_DIR = os.path.join(APP_DIR, "prefabs")


async def prefab_list(request):
    items = []
    if os.path.isdir(PREFAB_DIR):
        for n in sorted(os.listdir(PREFAB_DIR)):
            if not n.endswith(".json"):
                continue
            try:
                with open(os.path.join(PREFAB_DIR, n), encoding="utf-8") as f:
                    items.append(json.load(f))
            except Exception:
                continue
    items.sort(key=lambda x: -(x.get("updated") or 0))
    return web.json_response({"items": items})


async def prefab_save(request):
    os.makedirs(PREFAB_DIR, exist_ok=True)
    body = await request.json()
    글 = str(body.get("text") or "").strip()
    if not 글:
        return web.json_response({"error": "저장할 글이 없습니다."}, status=400)
    pid = body.get("id") if re.fullmatch(r"pf_[0-9a-z]+", str(body.get("id") or "")) else None
    옛것 = {}
    if pid and os.path.isfile(os.path.join(PREFAB_DIR, pid + ".json")):
        with open(os.path.join(PREFAB_DIR, pid + ".json"), encoding="utf-8") as f:
            옛것 = json.load(f)
    else:
        pid = "pf_%x" % int(time.time() * 1000)
    딴것 = names_in_dir(PREFAB_DIR, skip_id=pid)      # 이름이 겹치면 (1)(2) 가 붙는다
    m = {"id": pid,
         "name": unique_name(body.get("name") or 옛것.get("name"), 딴것, default="조각", limit=30),
         "text": 글, "메모": str(body.get("메모") or "")[:120],
         # 소속 시리즈·태그는 다른 화면이 붙여 둔 것이라 여기서 지우면 안 된다
         "group": 옛것.get("group") or str(body.get("group") or ""),
         "tags": 옛것.get("tags") or [],
         "created": 옛것.get("created") or time.time(), "updated": time.time()}
    with open(os.path.join(PREFAB_DIR, pid + ".json"), "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=1)
    return web.json_response({"ok": True, "item": m})


async def prefab_delete(request):
    body = await request.json()
    pid = str(body.get("id") or "")
    if not re.fullmatch(r"pf_[0-9a-z]+", pid):
        return web.json_response({"error": "없음"}, status=404)
    try:
        os.remove(os.path.join(PREFAB_DIR, pid + ".json"))
    except OSError:
        pass
    return web.json_response({"ok": True})


async def sfx_names(request):
    """대본에 쓸 수 있는 효과음 이름 (사전 화면용)"""
    try:
        import sfx
        return web.json_response({"names": sfx.list_names()})
    except Exception as e:
        return web.json_response({"names": [], "error": str(e)[:120]})


def register(app):
    app.router.add_get("/api/sfx/list", sfx_names)
    app.router.add_get("/api/project/list", listing)
    app.router.add_get("/api/project/get", get)
    app.router.add_get("/api/project/thumb", thumb)
    app.router.add_post("/api/project/save", save)
    app.router.add_post("/api/project/delete", delete)
    app.router.add_post("/api/project/duplicate", duplicate)
    app.router.add_get("/api/project/story", story_get)
    app.router.add_post("/api/project/story/save", story_save)
    app.router.add_post("/api/project/story/delete", story_delete)
    app.router.add_post("/api/project/story/duplicate", story_duplicate)
    app.router.add_post("/api/project/story/order", story_order)
    app.router.add_get("/api/project/video/owner", video_owner)
    app.router.add_get("/api/project/video/owners", video_owners)
    app.router.add_get("/api/prefab/list", prefab_list)
    app.router.add_post("/api/prefab/save", prefab_save)
    app.router.add_post("/api/prefab/delete", prefab_delete)
    app.router.add_get("/api/project/asset/usage", asset_usage)
    app.router.add_post("/api/project/asset/rename", asset_rename)
