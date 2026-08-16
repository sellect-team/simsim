"""🎞 컷 시트 — 구운 영상의 대표 장면을 한 장에 늘어놓는다.

수백 편을 구우면 하나씩 열어 볼 수 없다. 한 장으로 보면
"자막이 가려졌나 · 캐릭터가 화면 밖으로 나갔나 · 빈 컷이 있나" 를 몇 초 만에 안다.

만든 것은 파일로 남겨 두고, 영상이 더 새것이면 다시 만든다.
"""
import os

from aiohttp import web

from paths import APP_DIR, VIDEO_DIR, safe_video_path

SHEET_DIR = os.path.join(APP_DIR, "sheets")
칸수기본 = 8
칸폭기본 = 240


def _만들기(영상, 낼곳, 칸수, 칸폭):
    """영상을 **처음부터 차례로** 읽어 고르게 뽑는다.

    찾아가기(seek)는 키프레임으로 튀어 같은 장면만 여러 번 나오기 쉽다.
    짧은 영상이 대부분이라 통째로 읽는 편이 정확하고 충분히 빠르다.
    """
    import av
    from PIL import Image

    with av.open(영상) as c:
        s = c.streams.video[0]
        s.thread_type = "AUTO"
        모두 = []
        for f in c.decode(video=0):
            모두.append(f)
        if not 모두:
            raise RuntimeError("프레임이 없습니다")
        고른 = [모두[min(len(모두) - 1, round(len(모두) * (i + 0.5) / 칸수))]
                for i in range(칸수)]
        그림 = [f.to_image() for f in 고른]
        길이 = float(c.duration / av.time_base) if c.duration else 0

    높이 = max(1, round(칸폭 * 그림[0].height / 그림[0].width))
    시트 = Image.new("RGB", (칸폭 * len(그림), 높이), (12, 11, 16))
    for i, im in enumerate(그림):
        시트.paste(im.resize((칸폭, 높이), Image.LANCZOS), (i * 칸폭, 0))
    os.makedirs(os.path.dirname(낼곳), exist_ok=True)
    시트.save(낼곳, quality=86)
    return {"칸": len(그림), "초": round(길이, 1),
            "가로": 시트.width, "세로": 시트.height}


async def sheet(request):
    """`/api/videos/sheet?filename=…&n=8` → 컷 시트 그림"""
    name, path = safe_video_path(request.query.get("filename"))
    if not name or not os.path.isfile(path):
        return web.json_response({"error": "영상이 없습니다."}, status=404)
    try:
        칸수 = max(2, min(16, int(request.query.get("n") or 칸수기본)))
    except ValueError:
        칸수 = 칸수기본
    try:
        칸폭 = max(120, min(400, int(request.query.get("w") or 칸폭기본)))
    except ValueError:
        칸폭 = 칸폭기본

    낼곳 = os.path.join(SHEET_DIR, f"{name}.{칸수}x{칸폭}.jpg")
    # 영상이 더 새것이면 다시 만든다
    if not os.path.isfile(낼곳) or os.path.getmtime(낼곳) < os.path.getmtime(path):
        try:
            import asyncio
            await asyncio.get_event_loop().run_in_executor(
                None, _만들기, path, 낼곳, 칸수, 칸폭)
        except Exception as e:
            return web.json_response({"error": f"컷 시트를 못 만들었습니다: {e}"}, status=500)
    return web.FileResponse(낼곳, headers={"Cache-Control": "no-cache"})


async def sheet_many(request):
    """여러 편을 한꺼번에 만들어 둔다 (굽고 나서 미리 만들어 두면 볼 때 안 기다린다)"""
    import asyncio
    body = await request.json()
    만든것, 못한것 = [], []
    for raw in (body.get("filenames") or [])[:200]:
        name, path = safe_video_path(raw)
        if not name or not os.path.isfile(path):
            못한것.append(raw)
            continue
        낼곳 = os.path.join(SHEET_DIR, f"{name}.{칸수기본}x{칸폭기본}.jpg")
        if os.path.isfile(낼곳) and os.path.getmtime(낼곳) >= os.path.getmtime(path):
            만든것.append(name)
            continue
        try:
            await asyncio.get_event_loop().run_in_executor(
                None, _만들기, path, 낼곳, 칸수기본, 칸폭기본)
            만든것.append(name)
        except Exception:
            못한것.append(name)
    return web.json_response({"ok": True, "만든것": len(만든것), "못한것": 못한것})


def register(app):
    app.router.add_get("/api/videos/sheet", sheet)
    app.router.add_post("/api/videos/sheet_many", sheet_many)
