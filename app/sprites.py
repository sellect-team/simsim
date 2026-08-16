"""캐릭터 시트(여러 포즈가 한 장에 그려진 그림) → 포즈별 투명 배경 스프라이트로 자동 분리.

배경을 지우는 방식(모서리 색 자동 / 흰색 / 지정한 색 / 지우지 않음)과 세기를 고를 수 있고,
가장자리는 원본의 부드러운 경계를 살릴 수 있다. 완전히 로컬(PIL + scipy)에서 동작한다.
"""
import base64
import io

import numpy as np
from PIL import Image
from scipy import ndimage

MODES = ("auto", "white", "color", "keep")


def _hex_rgb(s):
    s = (s or "").lstrip("#")
    if len(s) != 6:
        return None
    try:
        return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.int16)
    except ValueError:
        return None


def background_alpha(a, mode="auto", key=None, tol=26, feather=True):
    """이미지 → (지울지 판단한 마스크 fg, 0~1 부드러운 알파 soft)"""
    rgb = a[:, :, :3].astype(np.int16)
    alpha0 = a[:, :, 3]
    had_alpha = (alpha0 < 250).mean() > 0.15

    if mode == "keep" or (had_alpha and mode == "auto"):
        soft = alpha0.astype(np.float32) / 255.0
        return alpha0 > 40, soft

    if mode == "white":
        bg = np.array([255, 255, 255], dtype=np.int16)
    elif mode == "color":
        bg = _hex_rgb(key)
        if bg is None:
            bg = np.array([255, 255, 255], dtype=np.int16)
    else:                                    # auto — 네 변에서 가장 흔한 색
        h, w = alpha0.shape
        edge = np.concatenate([rgb[0, :], rgb[h - 1, :], rgb[:, 0], rgb[:, w - 1]])
        bg = np.median(edge, axis=0).astype(np.int16)

    d = np.abs(rgb - bg).sum(axis=2)
    fg = d > tol
    if feather:                              # 원본의 매끄러운 외곽선을 살린다
        lo, hi = tol * 0.55, tol * 2.0
        soft = np.clip((d - lo) / max(1.0, hi - lo), 0, 1).astype(np.float32)
    else:
        soft = fg.astype(np.float32)
    if had_alpha:
        fg &= alpha0 > 40
        soft *= alpha0.astype(np.float32) / 255.0
    return fg, soft


def split_sheet(data, min_area=1200, pad=8, tol=26, gap=5,
                mode="auto", key=None, feather=True):
    """시트 → {w,h,parts:[{x,y,w,h,area,png,looks_label}]}. 큰 것부터 정렬."""
    if mode not in MODES:
        mode = "auto"
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    a = np.array(im)
    fg, soft = background_alpha(a, mode, key, tol, feather)

    # 선이 끊긴 곳을 메워 캐릭터 하나가 한 덩어리가 되게 한다 (분리 판단에만 사용)
    solid = fg
    if gap > 1:
        solid = ndimage.binary_closing(solid, np.ones((gap, gap), bool))
    solid = ndimage.binary_fill_holes(solid)
    solid = ndimage.binary_opening(solid, np.ones((3, 3), bool))

    lab, n = ndimage.label(solid, structure=np.ones((3, 3), bool))
    out = []
    for i in range(1, n + 1):
        comp = lab == i
        area = int(comp.sum())
        if area < min_area:
            continue
        region = ndimage.binary_dilation(comp, np.ones((3, 3), bool), iterations=2)
        ys, xs = np.nonzero(comp)
        x0 = max(0, int(xs.min()) - pad); y0 = max(0, int(ys.min()) - pad)
        x1 = min(a.shape[1], int(xs.max()) + 1 + pad)
        y1 = min(a.shape[0], int(ys.max()) + 1 + pad)
        crop = a[y0:y1, x0:x1].copy()
        alpha = (soft[y0:y1, x0:x1] * region[y0:y1, x0:x1]) * 255.0
        crop[:, :, 3] = np.clip(alpha, 0, 255).astype(np.uint8)
        buf = io.BytesIO()
        Image.fromarray(crop, "RGBA").save(buf, "PNG")
        w, h = x1 - x0, y1 - y0
        out.append({
            "x": x0, "y": y0, "w": w, "h": h, "area": area,
            # 납작하고 작은 덩어리는 대개 제목표(라벨)라서 표시만 해 둔다
            "looks_label": bool(h < 80 and area < 20000),
            "png": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode(),
        })
    out.sort(key=lambda p: -p["area"])
    return {"w": im.width, "h": im.height, "parts": out,
            "options": {"mode": mode, "tol": tol, "gap": gap, "feather": bool(feather),
                        "min_area": min_area}}


if __name__ == "__main__":
    import sys
    with open(sys.argv[1], "rb") as f:
        d = split_sheet(f.read())
    for p in d["parts"]:
        print(p["x"], p["y"], p["w"], p["h"], p["area"], "label" if p["looks_label"] else "")
    print(len(d["parts"]), "parts")
