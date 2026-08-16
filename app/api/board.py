"""🎞 스토리보드 가져오기 — 칸이 나뉜 그림 한 장을 통째로 받아 쪼갠다.

콘티·기획안처럼 **여러 칸이 격자로 놓인 그림**을 올리면
칸을 하나씩 찾아 잘라 주고, 그것들을 배경 자산 + 대본으로 만들어 준다.

칸을 찾는 방법 (라이브러리 없이 PIL·numpy 만으로)
  ① 테두리 색을 보고 '바탕색'을 정한다
  ② 가로줄마다 '바탕색 비율'을 재서, 거의 다 바탕인 줄 = **가로 틈**
  ③ 틈으로 나눈 띠 안에서 세로로 같은 일을 해 **칸**을 얻는다
  ④ 너무 작거나 납작한 것은 버린다 (제목·꾸밈 줄)

글자(자막)는 읽지 않는다. 이 컴퓨터에 한국어 OCR 이 없다 —
글은 사람이 넣거나 바깥 LLM 이 읽어 준다.
"""
import base64
import io as _io
import json
import os
import re
import time

from aiohttp import web

from paths import APP_DIR, BG_DIR, names_in_dir, unique_name


def _open(durl):
    from PIL import Image
    if not isinstance(durl, str) or "," not in durl:
        raise ValueError("이미지가 없습니다.")
    raw = base64.b64decode(durl.split(",", 1)[1])
    return Image.open(_io.BytesIO(raw)).convert("RGB")


def _to_durl(img, fmt="PNG"):
    buf = _io.BytesIO()
    img.save(buf, fmt)
    return f"data:image/{fmt.lower()};base64," + base64.b64encode(buf.getvalue()).decode()


def _runs(is_gap, 최소):
    """True/False 줄에서 False(내용) 가 이어지는 구간을 찾는다"""
    out, 시작 = [], None
    for i, g in enumerate(is_gap):
        if not g and 시작 is None:
            시작 = i
        elif g and 시작 is not None:
            if i - 시작 >= 최소:
                out.append((시작, i))
            시작 = None
    if 시작 is not None and len(is_gap) - 시작 >= 최소:
        out.append((시작, len(is_gap)))
    return out


def find_panels(img, 허용=26, 틈비율=0.965, 최소칸=0.045):
    """칸 찾기 → [(x0,y0,x1,y1)] (픽셀)"""
    import numpy as np
    a = np.asarray(img, dtype=np.int16)
    H, W = a.shape[:2]

    # ① 바탕색 — 가장자리 띠의 가운데값 (테두리는 거의 바탕이다)
    가장자리 = np.concatenate([
        a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3),
        a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    바탕 = np.median(가장자리, axis=0)

    같음 = (np.abs(a - 바탕).sum(axis=2) < 허용)      # 바탕과 비슷한 픽셀
    가로틈 = 같음.mean(axis=1) > 틈비율               # 거의 다 바탕인 가로줄
    띠 = _runs(가로틈, max(8, int(H * 최소칸)))

    칸 = []
    for y0, y1 in 띠:
        세로틈 = 같음[y0:y1].mean(axis=0) > 틈비율
        for x0, x1 in _runs(세로틈, max(8, int(W * 최소칸))):
            w, h = x1 - x0, y1 - y0
            if w < W * 0.05 or h < H * 0.05:          # 너무 작은 것은 꾸밈이다
                continue
            칸.append((int(x0), int(y0), int(x1), int(y1)))
    return 칸


async def detect(request):
    body = await request.json()
    try:
        img = _open(body.get("image"))
    except Exception as e:
        return web.json_response({"error": str(e)[:120]}, status=400)
    허용 = int(body.get("허용") or 26)
    틈 = float(body.get("틈") or 0.965)
    최소 = float(body.get("최소") or 0.045)
    try:
        칸 = find_panels(img, 허용, 틈, 최소)
    except Exception as e:
        return web.json_response({"error": "칸을 찾다 실패: " + str(e)[:160]}, status=500)

    W, H = img.size
    나온것 = []
    for i, (x0, y0, x1, y1) in enumerate(칸):
        조각 = img.crop((x0, y0, x1, y1))
        미리 = 조각.copy()
        미리.thumbnail((260, 260))
        나온것.append({
            "번호": i + 1,
            "자리": {"x": round(x0 / W, 4), "y": round(y0 / H, 4),
                     "w": round((x1 - x0) / W, 4), "h": round((y1 - y0) / H, 4)},
            "가로": x1 - x0, "세로": y1 - y0,
            "미리보기": _to_durl(미리, "JPEG" if 조각.mode == "RGB" else "PNG"),
        })
    return web.json_response({"ok": True, "원본크기": [W, H], "칸": 나온것,
                              "수": len(나온것)})


async def crop(request):
    """고른 자리 하나를 원본에서 잘라 돌려준다 (자산으로 넣기 전에 확인용)"""
    body = await request.json()
    try:
        img = _open(body.get("image"))
    except Exception as e:
        return web.json_response({"error": str(e)[:120]}, status=400)
    z = body.get("자리") or {}
    W, H = img.size
    x0 = int(max(0, min(1, float(z.get("x", 0)))) * W)
    y0 = int(max(0, min(1, float(z.get("y", 0)))) * H)
    x1 = int(min(W, x0 + max(0.01, float(z.get("w", 1))) * W))
    y1 = int(min(H, y0 + max(0.01, float(z.get("h", 1))) * H))
    조각 = img.crop((x0, y0, x1, y1))
    return web.json_response({"ok": True, "image": _to_durl(조각),
                              "가로": 조각.width, "세로": 조각.height})


def _signature(img, box):
    """칸 하나의 '배경 지문'.

    가운데는 캐릭터가 있고 아래는 자막 상자가 있으므로 **가장자리 띠만** 본다.
    같은 장소에서 찍은 칸끼리는 이 지문이 비슷하다.
    """
    import numpy as np
    x0, y0, x1, y1 = box
    a = np.asarray(img.crop((x0, y0, x1, y1)).resize((48, 64)), dtype=np.float32)
    h, w = a.shape[:2]
    띠 = np.concatenate([
        a[:int(h * 0.30)].reshape(-1, 3),          # 위쪽 (하늘·천장)
        a[:, :int(w * 0.18)].reshape(-1, 3),       # 왼쪽
        a[:, -int(w * 0.18):].reshape(-1, 3),      # 오른쪽
    ])
    return 띠.mean(axis=0)


def _text_boxes(img, box, 밝기=232):
    """칸 안에서 '글상자로 보이는 밝은 네모'를 찾는다.

    글자를 읽지는 못하지만 **자막이 있는지, 몇 줄인지, 어디에 있는지**는 알 수 있다.
    """
    import numpy as np
    x0, y0, x1, y1 = box
    a = np.asarray(img.crop((x0, y0, x1, y1)), dtype=np.int16)
    밝음 = a.mean(axis=2) > 밝기
    h, w = 밝음.shape
    아래 = 밝음[int(h * 0.55):]                     # 자막은 보통 아래쪽에 있다
    줄 = 아래.mean(axis=1) > 0.45
    상자, 시작 = [], None
    for i, v in enumerate(list(줄) + [False]):
        if v and 시작 is None:
            시작 = i
        elif not v and 시작 is not None:
            if i - 시작 >= max(4, h * 0.03):
                상자.append({"y": round((int(h * 0.55) + 시작) / h, 3),
                             "h": round((i - 시작) / h, 3)})
            시작 = None
    return 상자


async def analyze(request):
    """그림 한 장 → **대본 초안**까지 스스로 만들어 본다.

    ① 칸을 찾고
    ② 칸끼리 배경을 견주어 **배경이 바뀌는 곳에서 장면을 나누고**
    ③ 칸 안의 글상자를 세어 자막이 몇 줄인지 알아내고
    ④ 그걸로 대본 뼈대를 쓴다 (자막 글자는 빈칸으로 둔다)

    글자는 못 읽는다 — 이 컴퓨터에 한국어 OCR 이 없다.
    그래서 자막은 사람이나 바깥 LLM 이 채워 넣어야 한다.
    """
    import numpy as np
    body = await request.json()
    try:
        img = _open(body.get("image"))
    except Exception as e:
        return web.json_response({"error": str(e)[:120]}, status=400)

    칸 = find_panels(img, int(body.get("허용") or 26),
                     float(body.get("틈") or 0.965), float(body.get("최소") or 0.045))
    if not 칸:
        return web.json_response({"error": "칸을 찾지 못했습니다."}, status=422)

    W, H = img.size
    # 읽는 차례 — 위에서 아래로, 같은 줄이면 왼쪽에서 오른쪽으로
    칸.sort(key=lambda b: (round(b[1] / max(1, H) * 20), b[0]))

    지문 = [_signature(img, b) for b in 칸]
    문턱 = float(body.get("배경문턱") or 26)          # 이만큼 벌어지면 다른 배경으로 본다
    묶음, 지금 = [], [0]
    for i in range(1, len(칸)):
        차이 = float(np.abs(지문[i] - 지문[지금[0]]).mean())
        if 차이 > 문턱:
            묶음.append(지금); 지금 = [i]
        else:
            지금.append(i)
    묶음.append(지금)

    장면 = []
    for gi, 무리 in enumerate(묶음):
        x0 = min(칸[i][0] for i in 무리); y0 = min(칸[i][1] for i in 무리)
        첫 = 칸[무리[0]]
        자막수 = sum(len(_text_boxes(img, 칸[i])) for i in 무리)
        장면.append({
            "번호": gi + 1,
            "칸번호": [i + 1 for i in 무리],
            "이름": f"{gi + 1}번 장소",
            # 장면 배경은 **그 무리의 첫 칸**을 쓴다
            "자리": {"x": round(첫[0] / W, 4), "y": round(첫[1] / H, 4),
                     "w": round((첫[2] - 첫[0]) / W, 4), "h": round((첫[3] - 첫[1]) / H, 4)},
            "자막칸수": 자막수 or len(무리),
            "밝기": round(float(지문[무리[0]].mean()), 1),
        })

    # 대본 뼈대
    줄 = [f"제목: {body.get('이름') or '스토리보드'}",
          f"비율: {body.get('비율') or '9:16'}", ""]
    for s in 장면:
        분위기 = "밤" if s["밝기"] < 110 else ("흐림" if s["밝기"] < 175 else "아침")
        z = s["자리"]
        줄.append(f"장면 <{s['이름']}>   그림자리:{z['x']},{z['y']},{z['w']},{z['h']}"
                  f"   분위기:{분위기}" + ("" if s["번호"] == 1 else "   전환:페이드"))
        줄.append(f"  카메라 줌인 3초 세기:1.12")
        for k in range(s["자막칸수"]):
            줄.append(f'  자막 "여기에 {s["칸번호"][min(k, len(s["칸번호"]) - 1)]}번 칸의 글"')
        줄.append("")
    return web.json_response({
        "ok": True, "원본크기": [W, H],
        "칸수": len(칸), "장면수": len(장면), "장면": 장면,
        "대본초안": "\n".join(줄),
        "못하는것": ["칸 안의 글자를 읽지 못합니다 (한국어 OCR 없음)"],
    })


async def slice_register(request):
    """그림 한 장 + 자리 목록 → 그 자리들을 잘라 **배경 자산**으로 등록한다.

    작업실의 [📥 글로 한 번에 만들기] 가 쓴다.
    대본에 `장면 <현관>  그림자리:0.02,0.42,0.24,0.28` 이라고 적어 두면
    올린 그림에서 그 네모를 잘라 '현관' 이라는 배경으로 넣는다.

    좌표는 0~1 비율이라 그림 크기가 달라져도 그대로 쓸 수 있다.
    """
    body = await request.json()
    try:
        img = _open(body.get("image"))
    except Exception as e:
        return web.json_response({"error": str(e)[:120]}, status=400)
    자리들 = body.get("칸") or []
    if not 자리들:
        return web.json_response({"error": "자를 자리가 없습니다."}, status=400)

    os.makedirs(BG_DIR, exist_ok=True)
    W, H = img.size
    넣은것 = []
    for i, c in enumerate(자리들):
        z = c.get("자리") or {}
        try:
            x0 = int(max(0, min(1, float(z.get("x", 0)))) * W)
            y0 = int(max(0, min(1, float(z.get("y", 0)))) * H)
            x1 = int(min(W, x0 + max(0.01, float(z.get("w", 1))) * W))
            y1 = int(min(H, y0 + max(0.01, float(z.get("h", 1))) * H))
        except Exception:
            continue
        if x1 - x0 < 8 or y1 - y0 < 8:
            continue
        조각 = img.crop((x0, y0, x1, y1))
        이름 = str(c.get("이름") or f"{i + 1}컷").strip()

        # 같은 이름이 이미 있으면 **덮어쓴다** — 대본이 그 이름을 부르고 있기 때문이다
        기존 = None
        for n in os.listdir(BG_DIR):
            if not n.endswith(".json"):
                continue
            try:
                with open(os.path.join(BG_DIR, n), encoding="utf-8") as f:
                    m = json.load(f)
                if m.get("name") == 이름:
                    기존 = m
                    break
            except Exception:
                continue
        bid = 기존["id"] if 기존 else "bg_%x%02x" % (int(time.time() * 1000), i)
        조각.save(os.path.join(BG_DIR, bid + ".png"))
        from api.tags import suggest
        출처 = body.get("출처") or "스토리보드"
        m = {"id": bid, "name": 이름, "file": bid + ".png",
             "created": (기존 or {}).get("created") or time.time(),
             "made": True, "출처": "콘티", "콘티이름": 출처,
             "tags": (기존 or {}).get("tags") or (suggest(이름, "배경") + [출처])[:12]}
        with open(os.path.join(BG_DIR, bid + ".json"), "w", encoding="utf-8") as f:
            json.dump(m, f, ensure_ascii=False)
        넣은것.append({**m, "가로": 조각.width, "세로": 조각.height,
                       "덮어씀": bool(기존)})
    return web.json_response({"ok": True, "넣은것": 넣은것, "수": len(넣은것)})


async def make_project(request):
    """칸들을 배경 자산으로 넣고, 칸마다 한 장면인 대본을 만들어 프로젝트로 저장한다."""
    body = await request.json()
    칸들 = body.get("칸") or []
    if not 칸들:
        return web.json_response({"error": "가져올 칸이 없습니다."}, status=400)
    이름 = str(body.get("이름") or "스토리보드").strip()
    비율 = str(body.get("비율") or "9:16")

    # ① 칸 그림을 배경 자산으로
    os.makedirs(BG_DIR, exist_ok=True)
    자산 = []
    for i, c in enumerate(칸들):
        durl = c.get("image")
        if not isinstance(durl, str) or "," not in durl:
            continue
        bid = "bg_%x%02x" % (int(time.time() * 1000), i)
        with open(os.path.join(BG_DIR, bid + ".png"), "wb") as f:
            f.write(base64.b64decode(durl.split(",", 1)[1]))
        칸이름 = unique_name(c.get("이름") or f"{이름} {i + 1}컷",
                             names_in_dir(BG_DIR), default="칸")
        m = {"id": bid, "name": 칸이름, "file": bid + ".png",
             "created": time.time(), "made": True, "출처": 이름}
        with open(os.path.join(BG_DIR, bid + ".json"), "w", encoding="utf-8") as f:
            json.dump(m, f, ensure_ascii=False)
        자산.append({**m, "자막": c.get("자막") or ""})

    if not 자산:
        return web.json_response({"error": "그림을 하나도 못 넣었습니다."}, status=400)

    # ② 칸마다 한 장면인 대본
    줄 = [f"제목: {이름}", f"비율: {비율}", ""]
    for i, a in enumerate(자산):
        줄.append(f"장면 <{a['name']}>{'' if i == 0 else '   전환:페이드'}")
        자막 = (a["자막"] or "").strip()
        if 자막:
            for s in 자막.split("\n"):
                if s.strip():
                    줄.append(f'  자막 "{s.strip()}"')
        else:
            줄.append("  대기 2초        # 여기에 자막을 넣으세요")
        줄.append("")
    대본 = "\n".join(줄)

    # ③ 프로젝트 + 이야기 한 편으로 저장
    from api.projects import (DEFAULT_ENCODE, DEFAULT_TIMELINE, PROJ_DIR, _brief,
                              _new_id, _write, _쓰는프로젝트아이디)
    pid = _new_id("pj", _쓰는프로젝트아이디())
    sid = _new_id("st")                 # 새 프로젝트라 이야기는 이 한 편뿐이다
    m = {"id": pid,
         "name": unique_name(이름, names_in_dir(PROJ_DIR), default="스토리보드"),
         "stories": [{"sid": sid, "name": 이름, "text": 대본,
                      "seconds": 0, "scenes": len(자산), "missing": [],
                      "uses": {"배우": [], "배경": [a["name"] for a in 자산]},
                      "videos": [], "updated": time.time()}],
         "timeline": {**DEFAULT_TIMELINE, "순서": [sid]},
         "encode": {**DEFAULT_ENCODE, "비율": 비율},
         "videos": [], "created": time.time()}
    _write(m)
    return web.json_response({"ok": True, "id": pid, "sid": sid,
                              "칸수": len(자산), "대본": 대본, "item": _brief(m)})


def register(app):
    app.router.add_post("/api/board/detect", detect)
    app.router.add_post("/api/board/analyze", analyze)
    app.router.add_post("/api/board/slice", slice_register)
    app.router.add_post("/api/board/crop", crop)
    app.router.add_post("/api/board/project", make_project)
