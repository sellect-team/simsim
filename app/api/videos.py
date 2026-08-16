"""만들어진 영상 관리 — 목록·미리보기·그룹/잠금·삭제·편집(자르기/속도/크기/떨림제거/프레임홀드)
·GIF 변환·배경음악 입히기, 그리고 올린 음악 파일 보관.
"""
import asyncio
import json
import os
import re
import shutil
import subprocess
import time

from aiohttp import web

from paths import (AUDIO_DIR, COMFY_INPUT_DIR, TRASH_DIR, VIDEO_DIR, VIDEO_EXT_RE,
                   load_videos_meta, safe_video_path, save_videos_meta)
from paths import APP_DIR

THUMBS_DIR = os.path.join(APP_DIR, "thumbs")   # 히스토리 미리보기 이미지


async def api_view(request):
    """영상·이미지 보여주기.

    영상 폴더에 있는 파일은 **디스크에서 바로** 내보낸다. 이렇게 해야
    브라우저가 필요로 하는 구간 요청(Range)이 되어 재생·되감기가 된다.
    (예전에는 무조건 ComfyUI로 넘겼는데, 프록시는 파일을 통째로 메모리에 담고
     Range 를 무시해서 <video> 가 0:00 인 채 까맣게 멈춰 있었다.
     ComfyUI 를 꺼 두면 아예 안 보이기도 했다.)
    """
    params = request.rel_url.query
    if params.get("subfolder") == "video" and params.get("type", "output") == "output":
        name, path = safe_video_path(params.get("filename"))
        if name and os.path.isfile(path):
            return web.FileResponse(path, headers={"Accept-Ranges": "bytes",
                                                   "Cache-Control": "no-cache"})
    # 그 밖의 것(ComfyUI 미리보기 이미지 등)만 넘겨 준다
    try:
        async with ClientSession() as sess:
            async with sess.get(COMFY_URL + "/view", params=dict(params)) as r:
                data = await r.read()
                return web.Response(body=data, content_type=r.content_type)
    except Exception:
        return web.json_response({"error": "파일을 찾을 수 없습니다 (ComfyUI 꺼짐)"}, status=404)


async def api_videos_delete_many(request):
    """현재 필터에서 고른 영상들을 한 번에 휴지통으로 옮긴다."""
    data = await request.json()
    names = data.get("filenames") or []
    meta = load_videos_meta()
    moved, skipped = [], []
    os.makedirs(TRASH_DIR, exist_ok=True)
    for raw in names:
        name, path = safe_video_path(raw)
        if not name or not os.path.exists(path):
            skipped.append({"filename": raw, "reason": "파일 없음"})
            continue
        if meta.get(name, {}).get("locked"):
            skipped.append({"filename": name, "reason": "잠김"})
            continue
        dest = os.path.join(TRASH_DIR, name)
        if os.path.exists(dest):
            base, ext = os.path.splitext(name)
            dest = os.path.join(TRASH_DIR, f"{base}_{int(time.time())}{ext}")
        try:
            shutil.move(path, dest)
            meta.pop(name, None)
            moved.append(name)
        except Exception as e:
            skipped.append({"filename": name, "reason": str(e)})
    save_videos_meta(meta)
    return web.json_response({"ok": True, "moved": moved, "skipped": skipped})


async def api_videos_list(request):
    meta = load_videos_meta()
    items = []
    if os.path.isdir(VIDEO_DIR):
        for name in os.listdir(VIDEO_DIR):
            path = os.path.join(VIDEO_DIR, name)
            if not os.path.isfile(path) or not re.search(VIDEO_EXT_RE, name, re.I):
                continue
            st = os.stat(path)
            items.append({
                "filename": name,
                "size": st.st_size,
                "mtime": st.st_mtime,
                "date": time.strftime("%Y-%m-%d", time.localtime(st.st_mtime)),
                "time": time.strftime("%H:%M", time.localtime(st.st_mtime)),
            })
    # 설정 미기록 영상은 ComfyUI 실행 기록에서 역추출
    missing = [it for it in items if "settings" not in meta.get(it["filename"], {})]
    if missing:
        try:
            async with ClientSession() as sess:
                async with sess.get(COMFY_URL + "/history?max_items=300") as r:
                    hist = await r.json()
            fname_to_wf = {}
            for entry in hist.values():
                wf = (entry.get("prompt") or [None, None, {}])[2]
                for node_out in (entry.get("outputs") or {}).values():
                    for key in ("images", "video", "gifs"):
                        for f in node_out.get(key) or []:
                            fname_to_wf[f.get("filename")] = wf
            fname_to_dur = {}
            for entry in hist.values():
                d = duration_from_history_entry(entry)
                for node_out in (entry.get("outputs") or {}).values():
                    for key in ("images", "video", "gifs"):
                        for f in node_out.get(key) or []:
                            if d:
                                fname_to_dur[f.get("filename")] = d
            changed = False
            for it in missing:
                wf = fname_to_wf.get(it["filename"])
                s = settings_from_api_workflow(wf) if wf else None
                if s:
                    entry = meta.setdefault(it["filename"], {})
                    entry["settings"] = s
                    if fname_to_dur.get(it["filename"]) and not entry.get("duration"):
                        entry["duration"] = round(fname_to_dur[it["filename"]], 1)
                    changed = True
            if changed:
                save_videos_meta(meta)
        except Exception:
            pass
    for it in items:
        m = meta.get(it["filename"], {})
        it["group"] = m.get("group") or ""
        it["locked"] = bool(m.get("locked"))
        it["settings"] = m.get("settings")
        it["has_settings"] = bool(m.get("settings"))
        it["duration"] = m.get("duration")
        s = m.get("settings")
        if s:
            try:
                it["workload"] = round(
                    int(s["width"]) * int(s["height"]) *
                    (int(s["seconds"]) * 24 + 1) * int(s["steps"]) / 1e6)
            except Exception:
                it["workload"] = None
        else:
            it["workload"] = None
    items.sort(key=lambda x: x["mtime"], reverse=True)
    return web.json_response({"videos": items, "dir": VIDEO_DIR})


async def api_videos_download(request):
    """영상 한 편 내려받기.

    두 가지 방법을 모두 받는다 — 옛 화면과 새 화면이 섞여 있어서다.
        /api/videos/download/이름.mp4
        /api/videos/download?filename=이름.mp4
    `내려받을이름=` 을 붙이면 그 이름으로 저장된다 (파일 이름은 `story_538619.mp4`
    처럼 기계가 지은 것이라, 사람이 붙인 제목으로 받게 해 준다).
    """
    from urllib.parse import quote
    raw = request.match_info.get("name") or request.query.get("filename")
    name, path = safe_video_path(raw)
    if not name or not os.path.exists(path):
        return web.json_response({"error": "파일이 없습니다."}, status=404)

    받을이름 = request.query.get("내려받을이름") or name
    받을이름 = re.sub(r'[\\/:*?"<>|\r\n]', "_", str(받을이름)).strip() or name
    if not re.search(VIDEO_EXT_RE, 받을이름, re.I):        # 확장자를 잃지 않게
        받을이름 += os.path.splitext(name)[1] or ".mp4"

    return web.FileResponse(path, headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(받을이름)}",
        "Content-Type": "video/mp4",
        "Cache-Control": "no-cache"})


async def api_videos_download_many(request):
    """여러 편을 zip 하나로 묶어 내려받는다.

    수십 편을 한 편씩 누르는 것은 일이 아니다. 다만 영상은 이미 압축된 것이라
    다시 압축해 봐야 시간만 드니 **묶기만(ZIP_STORED)** 한다.
    """
    import io
    import zipfile
    from urllib.parse import quote

    data = await request.json()
    골라온것 = data.get("filenames") or []
    가방 = io.BytesIO()
    담은것, 빠진것 = [], []
    쓴이름 = set()
    with zipfile.ZipFile(가방, "w", zipfile.ZIP_STORED) as z:
        for raw in 골라온것[:200]:                        # 한 번에 200편까지
            name, path = safe_video_path(raw)
            if not name or not os.path.exists(path):
                빠진것.append(raw)
                continue
            속이름 = name
            n = 1
            while 속이름 in 쓴이름:                        # 같은 이름이 겹치지 않게
                뿌리, 끝 = os.path.splitext(name)
                속이름 = f"{뿌리} ({n}){끝}"
                n += 1
            쓴이름.add(속이름)
            z.write(path, 속이름)
            담은것.append(속이름)
    if not 담은것:
        return web.json_response({"error": "내려받을 영상이 없습니다.", "빠진것": 빠진것},
                                 status=404)
    묶음이름 = re.sub(r'[\\/:*?"<>|]', "_", str(data.get("이름") or "심심공작소_영상"))
    묶음이름 = f"{묶음이름}_{len(담은것)}편.zip"
    return web.Response(body=가방.getvalue(), headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(묶음이름)}",
        "Content-Type": "application/zip"})


async def api_videos_thumb(request):
    name, path = safe_video_path(request.match_info["name"])
    if not name or not os.path.exists(path):
        return web.json_response({"error": "파일 없음"}, status=404)
    os.makedirs(THUMBS_DIR, exist_ok=True)
    dest = os.path.join(THUMBS_DIR, name + ".jpg")
    if not os.path.exists(dest) or os.path.getmtime(dest) < os.path.getmtime(path):
        try:
            await asyncio.get_event_loop().run_in_executor(None, _make_thumb, path, dest)
        except Exception as e:
            return web.json_response({"error": str(e)[:100]}, status=500)
    return web.FileResponse(dest)


async def api_videos_meta_update(request):
    data = await request.json()
    name, path = safe_video_path(data.get("filename"))
    if not name:
        return web.json_response({"error": "잘못된 파일명"}, status=400)
    meta = load_videos_meta()
    entry = meta.get(name, {})
    if "group" in data:
        entry["group"] = str(data["group"]).strip()
    if "locked" in data:
        entry["locked"] = bool(data["locked"])
    meta[name] = entry
    save_videos_meta(meta)
    return web.json_response({"ok": True})


async def api_videos_delete(request):
    data = await request.json()
    name, path = safe_video_path(data.get("filename"))
    if not name:
        return web.json_response({"error": "잘못된 파일명"}, status=400)
    meta = load_videos_meta()
    if meta.get(name, {}).get("locked"):
        return web.json_response({"error": "잠긴 영상입니다. 먼저 잠금을 해제하세요."}, status=403)
    if not os.path.exists(path):
        return web.json_response({"error": "파일이 없습니다."}, status=404)
    os.makedirs(TRASH_DIR, exist_ok=True)
    dest = os.path.join(TRASH_DIR, name)
    if os.path.exists(dest):
        base, ext = os.path.splitext(name)
        dest = os.path.join(TRASH_DIR, f"{base}_{int(time.time())}{ext}")
    shutil.move(path, dest)
    meta.pop(name, None)
    save_videos_meta(meta)
    return web.json_response({"ok": True, "trash": dest})


def _convert_to_gif(src, dest, max_width=640):
    import av
    frames = []
    with av.open(src) as container:
        stream = container.streams.video[0]
        fps = float(stream.average_rate) if stream.average_rate else 12.0
        for frame in container.decode(video=0):
            img = frame.to_image()
            if img.width > max_width:
                img = img.resize((max_width, int(img.height * max_width / img.width)))
            frames.append(img.convert("RGB").quantize(colors=256))
    if not frames:
        raise ValueError("프레임을 읽지 못했습니다.")
    frames[0].save(dest, save_all=True, append_images=frames[1:],
                   duration=int(1000 / max(1.0, fps)), loop=0, optimize=True)


async def api_upload_audio(request):
    import av
    reader = await request.multipart()
    field = await reader.next()
    if field is None or field.name != "audio":
        return web.json_response({"error": "오디오 파일이 필요합니다."}, status=400)
    data = await field.read()
    name = re.sub(r"[^\w\-가-힣.]", "_", os.path.basename(field.filename or "audio.mp3"))
    os.makedirs(AUDIO_DIR, exist_ok=True)
    path = os.path.join(AUDIO_DIR, name)
    with open(path, "wb") as f:
        f.write(data)
    try:
        with av.open(path) as c:
            dur = float(c.duration / av.time_base) if c.duration else 0.0
    except Exception:
        os.remove(path)
        return web.json_response({"error": "재생할 수 없는 오디오 파일입니다."}, status=400)
    return web.json_response({"name": name, "duration": round(dur, 1)})


async def api_audio_file(request):
    name = re.sub(r"[^\w\-가-힣.]", "_", os.path.basename(request.match_info["name"]))
    path = os.path.join(AUDIO_DIR, name)
    if not name or not os.path.exists(path):
        return web.json_response({"error": "오디오 파일이 없습니다."}, status=404)
    return web.FileResponse(path)


async def api_videos_add_audio(request):
    data = await request.json()
    name, path = safe_video_path(data.get("filename"))
    if not name or not os.path.exists(path):
        return web.json_response({"error": "영상 파일이 없습니다."}, status=404)
    audio_name = re.sub(r"[^\w\-가-힣.]", "_", os.path.basename(str(data.get("audio") or "")))
    audio_path = os.path.join(AUDIO_DIR, audio_name)
    if not audio_name or not os.path.exists(audio_path):
        return web.json_response({"error": "음악 파일을 먼저 업로드하세요."}, status=404)
    mode = data.get("mode", "video")
    if mode not in ("video", "loop_video"):
        mode = "video"
    a_start = max(0.0, float(data.get("audio_start", 0)))
    a_end = max(0.0, float(data.get("audio_end", 0)))
    base = os.path.splitext(name)[0]
    out_name = f"{base}_음악_{int(time.time()) % 100000}.mp4"
    dest = os.path.join(VIDEO_DIR, out_name)
    try:
        await asyncio.get_event_loop().run_in_executor(
            None, _add_audio, path, audio_path, dest, mode, a_start, a_end)
    except Exception as e:
        if os.path.exists(dest):
            os.remove(dest)
        return web.json_response({"error": "음악 입히기 실패: " + str(e)[:200]}, status=500)
    return web.json_response({"ok": True, "filename": out_name})


async def api_videos_gif(request):
    data = await request.json()
    name, path = safe_video_path(data.get("filename"))
    if not name or not os.path.exists(path):
        return web.json_response({"error": "파일이 없습니다."}, status=404)
    if not re.search(r"\.(mp4|webm)$", name, re.I):
        return web.json_response({"error": "mp4/webm만 GIF로 변환할 수 있어요."}, status=400)
    gif_name = os.path.splitext(name)[0] + ".gif"
    gif_path = os.path.join(VIDEO_DIR, gif_name)
    try:
        await asyncio.get_event_loop().run_in_executor(None, _convert_to_gif, path, gif_path)
    except Exception as e:
        return web.json_response({"error": "GIF 변환 실패: " + str(e)[:200]}, status=500)
    return web.json_response({"ok": True, "gif": gif_name})


STABILIZE_THRESHOLDS = {1: 8, 2: 14, 3: 22}


def _apply_stabilize(path, level=2):
    """정지 영역 고정(디플리커): 프레임 간 미세 변화 픽셀을 이전 프레임으로 고정."""
    import av
    import numpy as np
    thr = STABILIZE_THRESHOLDS.get(int(level), 14)
    frames = []
    with av.open(path) as c:
        stream = c.streams.video[0]
        rate = float(stream.average_rate) if stream.average_rate else 24.0
        for fr in c.decode(video=0):
            frames.append(fr.to_ndarray(format="rgb24"))
    if not frames:
        raise ValueError("프레임 없음")
    out = [frames[0]]
    prev = frames[0].astype(np.int16)
    for f in frames[1:]:
        cur = f.astype(np.int16)
        diff = np.abs(cur - prev).max(axis=2, keepdims=True)
        merged = np.where(diff < thr, prev, cur).astype(np.uint8)
        out.append(merged)
        prev = merged.astype(np.int16)
    tmp = path + ".tmp.mp4"
    with av.open(tmp, "w") as o:
        vs = o.add_stream("h264", rate=int(round(rate)))
        vs.height, vs.width = out[0].shape[0], out[0].shape[1]
        vs.pix_fmt = "yuv420p"
        for arr in out:
            frame = av.VideoFrame.from_ndarray(arr, format="rgb24")
            for pkt in vs.encode(frame):
                o.mux(pkt)
        for pkt in vs.encode():
            o.mux(pkt)
    os.replace(tmp, path)


async def api_videos_stabilize(request):
    data = await request.json()
    name, path = safe_video_path(data.get("filename"))
    level = int(data.get("level", 2))
    if not name or not os.path.exists(path):
        return web.json_response({"error": "파일이 없습니다."}, status=404)
    if level not in (1, 2, 3):
        return web.json_response({"ok": True, "skipped": True})
    if not name.lower().endswith(".mp4"):
        return web.json_response({"ok": True, "skipped": True, "reason": "mp4만 지원"})
    try:
        await asyncio.get_event_loop().run_in_executor(None, _apply_stabilize, path, level)
    except Exception as e:
        return web.json_response({"error": "떨림 제거 실패: " + str(e)[:200]}, status=500)
    return web.json_response({"ok": True})


def _apply_frame_hold(path, hold):
    import av
    tmp = path + ".tmp.mp4"
    with av.open(path) as container:
        stream = container.streams.video[0]
        rate = float(stream.average_rate) if stream.average_rate else 24.0
        frames = [f.to_image() for i, f in enumerate(container.decode(video=0)) if i % hold == 0]
    if not frames:
        raise ValueError("프레임을 읽지 못했습니다.")
    out_fps = max(1, round(rate / hold))
    with av.open(tmp, "w") as out:
        vs = out.add_stream("h264", rate=out_fps)
        vs.width, vs.height = frames[0].width, frames[0].height
        vs.pix_fmt = "yuv420p"
        for img in frames:
            for pkt in vs.encode(av.VideoFrame.from_image(img)):
                out.mux(pkt)
        for pkt in vs.encode():
            out.mux(pkt)
    os.replace(tmp, path)


async def api_videos_posthold(request):
    data = await request.json()
    name, path = safe_video_path(data.get("filename"))
    hold = int(data.get("hold", 1))
    if not name or not os.path.exists(path):
        return web.json_response({"error": "파일이 없습니다."}, status=404)
    if hold not in (2, 3):
        return web.json_response({"ok": True, "skipped": True})
    if not name.lower().endswith(".mp4"):
        return web.json_response({"ok": True, "skipped": True, "reason": "mp4만 지원"})
    try:
        await asyncio.get_event_loop().run_in_executor(None, _apply_frame_hold, path, hold)
    except Exception as e:
        return web.json_response({"error": "프레임 홀드 실패: " + str(e)[:200]}, status=500)
    return web.json_response({"ok": True})


async def api_videos_edit(request):
    data = await request.json()
    name, path = safe_video_path(data.get("filename"))
    if not name or not os.path.exists(path):
        return web.json_response({"error": "파일이 없습니다."}, status=404)
    if not name.lower().endswith((".mp4", ".webm")):
        return web.json_response({"error": "mp4/webm만 편집할 수 있어요."}, status=400)
    trim_start = max(0.0, float(data.get("trim_start", 0)))
    trim_end = max(0.0, float(data.get("trim_end", 0)))
    speed = max(0.25, min(3.0, float(data.get("speed", 1.0))))
    scale = max(0.25, min(2.0, float(data.get("scale", 1.0))))
    stab = int(data.get("stabilize", 0))
    hold = int(data.get("frame_hold", 1))
    base = os.path.splitext(name)[0]
    out_name = f"{base}_편집_{int(time.time()) % 100000}.mp4"
    dest = os.path.join(VIDEO_DIR, out_name)
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(
            None, _edit_video, path, dest, trim_start, trim_end, speed, scale)
        if stab in (1, 2, 3):
            await loop.run_in_executor(None, _apply_stabilize, dest, stab)
        if hold in (2, 3):
            await loop.run_in_executor(None, _apply_frame_hold, dest, hold)
    except Exception as e:
        if os.path.exists(dest):
            os.remove(dest)
        return web.json_response({"error": "편집 실패: " + str(e)[:200]}, status=500)
    meta = load_videos_meta()
    src_meta = meta.get(name, {})
    if src_meta.get("settings"):
        meta[out_name] = {"settings": src_meta["settings"], "group": src_meta.get("group", "")}
        save_videos_meta(meta)
    return web.json_response({"ok": True, "filename": out_name})


async def api_videos_open(request):
    data = await request.json()
    filename = data.get("filename")
    os.makedirs(VIDEO_DIR, exist_ok=True)
    if filename:
        name, path = safe_video_path(filename)
        if name and os.path.exists(path):
            subprocess.Popen(["explorer", "/select,", path])
            return web.json_response({"ok": True})
    subprocess.Popen(["explorer", VIDEO_DIR])
    return web.json_response({"ok": True})


def _make_thumb(src, dest):
    import av
    img = None
    with av.open(src) as c:
        stream = c.streams.video[0]
        total = stream.frames or 0
        target = (total // 2) if total else 12
        for i, fr in enumerate(c.decode(video=0)):
            img = fr.to_image()
            if i >= target:
                break
    if img is None:
        raise ValueError("프레임 없음")
    img.thumbnail((320, 320))
    img.convert("RGB").save(dest, "JPEG", quality=82)


def register(app):
    app.router.add_get("/api/view", api_view)
    app.router.add_get("/api/videos", api_videos_list)
    # 두 모양을 다 받는다 — `?filename=` 쪽이 없어서 내려받기가 404 였다
    app.router.add_get("/api/videos/download", api_videos_download)
    app.router.add_get("/api/videos/download/{name}", api_videos_download)
    app.router.add_post("/api/videos/download_many", api_videos_download_many)
    app.router.add_get("/api/videos/thumb/{name}", api_videos_thumb)
    app.router.add_post("/api/videos/meta", api_videos_meta_update)
    app.router.add_post("/api/videos/delete", api_videos_delete)
    app.router.add_post("/api/videos/delete_many", api_videos_delete_many)
    app.router.add_post("/api/videos/edit", api_videos_edit)
    app.router.add_post("/api/videos/add_audio", api_videos_add_audio)
    app.router.add_post("/api/videos/open", api_videos_open)
    app.router.add_post("/api/videos/gif", api_videos_gif)
    app.router.add_post("/api/videos/posthold", api_videos_posthold)
    app.router.add_post("/api/videos/stabilize", api_videos_stabilize)
    app.router.add_post("/api/upload_audio", api_upload_audio)
    app.router.add_get("/api/audio/{name}", api_audio_file)
