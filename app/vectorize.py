"""그림 파일(PNG/JPG) → 벡터 경로(코드)로 정확히 변환한다.

캐릭터를 '손으로 비슷하게 다시 그리는' 것이 아니라, 원본 픽셀의 색 영역 경계를
그대로 따라가 SVG 경로로 만든다. 결과는 JSON(파트 목록)이라 코드로 색·위치·회전을
바꾸거나 파트별로 움직임을 줄 수 있다. 완전히 로컬에서 동작한다.
"""
import io
import json
import math

import numpy as np
from PIL import Image
from scipy import ndimage


# ---------------------------------------------------------------- 경계 추적
def _trace_boundary(mask):
    """Moore 이웃 추적 — 연결된 영역 하나의 경계 픽셀을 순서대로 돌려준다."""
    h, w = mask.shape
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return []
    start = (int(ys[0]), int(xs[0]))
    # 8방향 (시계 방향)
    nb = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
    out = [start]
    cur = start
    back = 6                       # 직전에 들어온 방향(왼쪽에서 시작)
    for _ in range(4 * mask.sum() + 16):
        found = False
        for k in range(8):
            d = (back + 1 + k) % 8
            ny, nx = cur[0] + nb[d][0], cur[1] + nb[d][1]
            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx]:
                back = (d + 4 + 1) % 8      # 되돌아온 방향
                cur = (ny, nx)
                out.append(cur)
                found = True
                break
        if not found:
            break
        if cur == start and len(out) > 2:
            out.pop()
            break
    return out


def _rdp(pts, eps):
    """Douglas-Peucker 단순화 — 모양을 유지하면서 점 수를 줄인다."""
    if len(pts) < 3:
        return pts
    a, b = np.array(pts[0], float), np.array(pts[-1], float)
    ab = b - a
    n = np.hypot(*ab)
    P = np.array(pts, float)
    if n < 1e-9:
        d = np.hypot(*(P - a).T)
    else:                                   # 2D 외적 (numpy 2에서 np.cross는 3D 전용)
        d = np.abs(ab[0] * (P[:, 1] - a[1]) - ab[1] * (P[:, 0] - a[0])) / n
    i = int(np.argmax(d))
    if d[i] > eps:
        left = _rdp(pts[:i + 1], eps)
        right = _rdp(pts[i:], eps)
        return left[:-1] + right
    return [pts[0], pts[-1]]


def _to_path(pts, smooth=0.35, closed=True):
    """점 목록 → 부드러운 3차 베지에 경로 (Catmull-Rom 변환)."""
    n = len(pts)
    if n < 3:
        return ""
    if smooth <= 0:
        d = "M%.1f,%.1f " % pts[0] + " ".join("L%.1f,%.1f" % p for p in pts[1:])
        return d + (" Z" if closed else "")
    d = ["M%.1f,%.1f" % pts[0]]
    for i in range(n if closed else n - 1):
        p0 = pts[(i - 1) % n]
        p1 = pts[i % n]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) * smooth / 1.5,
              p1[1] + (p2[1] - p0[1]) * smooth / 1.5)
        c2 = (p2[0] - (p3[0] - p1[0]) * smooth / 1.5,
              p2[1] - (p3[1] - p1[1]) * smooth / 1.5)
        d.append("C%.1f,%.1f %.1f,%.1f %.1f,%.1f" % (c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]))
    return " ".join(d) + (" Z" if closed else "")


def _component_paths(comp, eps, smooth):
    """영역 하나 → 바깥 경계 + 구멍 경계 (evenodd로 채우면 구멍이 뚫린다)"""
    pad = np.pad(comp, 1)
    outer = _trace_boundary(pad)
    if len(outer) < 4:
        return None
    pts = [(x - 1 + 0.5, y - 1 + 0.5) for y, x in outer]     # 픽셀 중심 → 좌표
    d = _to_path(_rdp(pts, eps), smooth)
    filled = ndimage.binary_fill_holes(comp)
    holes = filled & ~comp
    if holes.any():
        lab, n = ndimage.label(holes)
        for i in range(1, n + 1):
            hm = lab == i
            if hm.sum() < 6:
                continue
            hb = _trace_boundary(np.pad(hm, 1))
            if len(hb) < 4:
                continue
            hp = [(x - 1 + 0.5, y - 1 + 0.5) for y, x in hb]
            d += " " + _to_path(_rdp(hp, eps), smooth)
    return d


# ---------------------------------------------------------------- 메인
def vectorize(data, colors=10, min_area=18, eps=0.8, smooth=0.35, max_side=420):
    """이미지 바이트 → {w, h, bg, parts:[{color, d, area, bbox}]}"""
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    if max(im.size) > max_side:                    # 너무 크면 줄여서 추적 (경로가 간결해짐)
        r = max_side / max(im.size)
        im = im.resize((max(1, int(im.width * r)), max(1, int(im.height * r))), Image.LANCZOS)

    a = np.array(im)
    alpha = a[:, :, 3]
    rgb = Image.fromarray(a[:, :, :3])
    # 투명 픽셀은 배경색으로 채워 색 양자화가 흔들리지 않게 한다
    bg_rgb = tuple(int(v) for v in a[0, 0, :3])
    flat = np.array(rgb)
    flat[alpha < 40] = bg_rgb
    rgb = Image.fromarray(flat)

    q = rgb.quantize(colors=max(2, min(32, colors)), method=Image.MEDIANCUT, dither=Image.NONE)
    pal = q.getpalette()
    idx = np.array(q)

    # 배경 색 = 네 모서리에서 가장 흔한 색
    corners = [idx[0, 0], idx[0, -1], idx[-1, 0], idx[-1, -1]]
    bg_i = max(set(corners), key=corners.count)
    bg_hex = "#%02x%02x%02x" % tuple(pal[bg_i * 3: bg_i * 3 + 3])

    parts = []
    for ci in np.unique(idx):
        color = "#%02x%02x%02x" % tuple(pal[int(ci) * 3: int(ci) * 3 + 3])
        mask = idx == ci
        if ci == bg_i:
            # 배경색이라도 캐릭터 안쪽에 섬처럼 있으면 살린다 (테두리에 닿는 것만 배경)
            edge = np.zeros_like(mask)
            edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
            lab, n = ndimage.label(mask)
            keep = np.zeros_like(mask)
            for i in range(1, n + 1):
                m = lab == i
                if not (m & edge).any():
                    keep |= m
            mask = keep
            if not mask.any():
                continue
        lab, n = ndimage.label(mask)
        for i in range(1, n + 1):
            comp = lab == i
            area = int(comp.sum())
            if area < min_area:
                continue
            d = _component_paths(comp, eps, smooth)
            if not d:
                continue
            ys, xs = np.nonzero(comp)
            parts.append({
                "color": color,
                "d": d,
                "area": area,
                "bbox": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
            })
    parts.sort(key=lambda p: -p["area"])            # 넓은 것부터 → 위에 작은 것이 얹힌다
    for i, p in enumerate(parts):
        p["id"] = "p%d" % i
        p["name"] = ""
    return {"w": im.width, "h": im.height, "bg": bg_hex, "parts": parts}


def to_svg(doc, with_bg=False):
    body = "".join(
        '<path d="%s" fill="%s" fill-rule="evenodd"/>' % (p["d"], p["color"]) for p in doc["parts"])
    bg = ('<rect width="%d" height="%d" fill="%s"/>' % (doc["w"], doc["h"], doc["bg"])
          if with_bg else "")
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">%s%s</svg>'
            % (doc["w"], doc["h"], doc["w"], doc["h"], bg, body))


if __name__ == "__main__":
    import sys
    with open(sys.argv[1], "rb") as f:
        doc = vectorize(f.read())
    print(len(doc["parts"]), "parts")
    out = sys.argv[2] if len(sys.argv) > 2 else "traced.svg"
    with open(out, "w", encoding="utf-8") as f:
        f.write(to_svg(doc, with_bg=True))
    print("saved", out)
