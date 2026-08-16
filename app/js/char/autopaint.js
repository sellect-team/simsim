/* 자동 색 입히기 — 원본 그림의 색을 3D 표면에 그대로 옮긴다.

   ① 로컬 이미지 인식(WD14 태거 + 대표색 추출)으로 그 캐릭터의 색을 먼저 파악하고
   ② 정면·측면·후면 그림을 3D 표면에 투영해 꼭짓점마다 색을 정한 뒤
   ③ 그림이 닿지 않은 곳(발바닥·안쪽)은 주변 색으로 자연스럽게 메운다.
   paint.js(수동 보정)와 3D 생성 직후 자동 채색이 이 파일을 함께 쓴다. */
import * as THREE from "../../lib/three.module.js";
import { loadImage } from "../core.js";

/** 그림 한 장을 색 샘플러로 만든다 (투명 여백은 제외하고 좌표를 맞춘다) */
export function makeSampler(img) {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) for (let px = 0; px < c.width; px++) {
    if (d[(y * c.width + px) * 4 + 3] > 40) {
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = c.width - 1; y1 = c.height - 1; }

  // 줄마다 그림의 왼쪽·오른쪽 끝을 미리 찾아 둔다 (옆면을 '가장자리 색'으로 감쌀 때 씀)
  const edgeL = new Int16Array(c.height).fill(-1);
  const edgeR = new Int16Array(c.height).fill(-1);
  for (let y = 0; y < c.height; y++) {
    for (let px = 0; px < c.width; px++)
      if (d[(y * c.width + px) * 4 + 3] > 60) { edgeL[y] = px; break; }
    for (let px = c.width - 1; px >= 0; px--)
      if (d[(y * c.width + px) * 4 + 3] > 60) { edgeR[y] = px; break; }
  }
  const pick = (px, py) => {
    if (px < 0 || py < 0 || px >= c.width || py >= c.height) return null;
    const i = (py * c.width + px) * 4;
    if (d[i + 3] < 40) return null;
    return [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255];
  };
  return {
    at(u, v) {
      return pick(Math.round(x0 + u * (x1 - x0)), Math.round(y0 + v * (y1 - y0)));
    },
    /** 그 높이(v)에서 왼/오른쪽 실루엣 안쪽 색 — 옆면을 자연스럽게 감쌀 때 쓴다 */
    atEdge(side, v, inset = 0.06) {
      const py = Math.max(0, Math.min(c.height - 1, Math.round(y0 + v * (y1 - y0))));
      const l = edgeL[py], r = edgeR[py];
      if (l < 0 || r < 0) return null;
      const w = Math.max(1, r - l);
      const px = side < 0 ? Math.round(l + w * inset) : Math.round(r - w * inset);
      return pick(px, py) || pick(Math.round((l + r) / 2), py);
    },
  };
}

/** 캐릭터의 그림·색 정보를 서버에서 받아온다 */
export async function readCharacter(charId, poses) {
  const views = {};
  for (const role of ["front", "side", "back"]) {
    if (poses && !poses[role]) continue;
    try {
      views[role] = makeSampler(await loadImage(`/api/char/sprite?id=${charId}&role=${role}`));
    } catch {}
  }
  let palette = { base: "#f4dcae", colors: [], tags: [] };
  try {
    const r = await fetch(`/api/char/palette?id=${encodeURIComponent(charId)}`);
    const d = await r.json();
    if (!d.error) palette = d;
  } catch {}
  return { views, palette };
}

/**
 * 메시에 색을 입힌다.
 * @param root three.js 그룹 (GLTF scene)
 * @param views {front,side,back} 샘플러
 * @param opt {front, blend, gamma, base}
 * @returns {painted, total}
 */
export function projectColors(root, views, opt = {}) {
  const front = opt.front ?? 1, blend = opt.blend ?? 4, gamma = opt.gamma ?? 1;
  const sideMode = opt.sideMode || "extend";   // extend | image | flip
  const sideW = opt.sideW ?? 1;
  const base = new THREE.Color(opt.base || "#f4dcae");
  const meshes = [];
  root.traverse(o => { if (o.isMesh) meshes.push(o); });

  /* 중요: 화면에서 모델이 돌아가고 있어도 색은 늘 같은 자리에 입혀져야 한다.
     그래서 '보이는 각도(월드 좌표)'가 아니라 모델 자체 좌표(root 기준)로 계산한다. */
  root.updateWorldMatrix(true, true);
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4(), nmat = new THREE.Matrix3();
  const local = meshes.map(o => {
    o.updateWorldMatrix(true, false);
    return rel.copy(invRoot).multiply(o.matrixWorld).clone();
  });

  // 모델 자체 좌표에서의 크기 상자를 먼저 구한다
  const v = new THREE.Vector3(), nrm = new THREE.Vector3();
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  meshes.forEach((o, k) => {
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(local[k]);
      min.min(v); max.max(v);
    }
  });
  const spanX = Math.max(1e-6, max.x - min.x), spanY = Math.max(1e-6, max.y - min.y),
        spanZ = Math.max(1e-6, max.z - min.z);
  let painted = 0, total = 0;

  for (let k = 0; k < meshes.length; k++) {
    const o = meshes[k];
    const geo = o.geometry;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.color) {
      const n = geo.attributes.position.count;
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    }
    const pos = geo.attributes.position, nor = geo.attributes.normal, col = geo.attributes.color;
    const known = new Uint8Array(pos.count);        // 그림 색이 들어간 꼭짓점 표시
    nmat.getNormalMatrix(local[k]);
    for (let i = 0; i < pos.count; i++) {
      total++;
      v.fromBufferAttribute(pos, i).applyMatrix4(local[k]);
      nrm.fromBufferAttribute(nor, i).applyMatrix3(nmat).normalize();
      const uy = 1 - (v.y - min.y) / spanY;
      const ux = (v.x - min.x) / spanX;
      const uz = (v.z - min.z) / spanZ;
      const cands = [];
      if (sideMode === "extend") {
        // 옆면은 '그 높이에서 그림의 가장자리 색'을 그대로 감싸 준다 → 앞뒤 평균보다 훨씬 선명
        const sideness = Math.max(0, 1 - Math.abs(nrm.z));         // 옆을 볼수록 1
        if (views.front) cands.push([Math.max(0, nrm.z), views.front.at(ux, uy), front]);
        if (views.back) cands.push([Math.max(0, -nrm.z), views.back.at(1 - ux, uy), 1]);
        const src = views.front || views.back;
        if (src && sideness > 0.02) {
          const edge = src.atEdge(nrm.x >= 0 ? 1 : -1, uy);
          if (edge) cands.push([sideness, edge, 1.15]);
        }
      } else {
        if (views.front) cands.push([Math.max(0, nrm.z), views.front.at(ux, uy), front]);
        if (views.back) cands.push([Math.max(0, -nrm.z), views.back.at(1 - ux, uy), 1]);
        if (views.side) {
          const flip = sideMode === "flip";
          cands.push([Math.max(0, nrm.x), views.side.at(flip ? uz : 1 - uz, uy), sideW]);
          cands.push([Math.max(0, -nrm.x), views.side.at(flip ? 1 - uz : uz, uy), sideW]);
        }
      }
      let r = 0, g = 0, b = 0, w = 0;
      for (const [w0, rgb, mul] of cands) {
        if (!rgb || w0 <= 0) continue;
        const weight = Math.pow(w0, blend) * (mul ?? 1);
        r += rgb[0] * weight; g += rgb[1] * weight; b += rgb[2] * weight; w += weight;
      }
      if (w > 1e-4) {
        painted++; known[i] = 1;
        col.setXYZ(i, Math.min(1, r / w * gamma), Math.min(1, g / w * gamma), Math.min(1, b / w * gamma));
      } else {
        col.setXYZ(i, base.r, base.g, base.b);
      }
    }
    fillHoles(geo, known, opt.fillPasses ?? 3);
    col.needsUpdate = true;
  }
  return { painted, total };
}

/** 그림이 닿지 않은 곳을 주변 색으로 메운다 (삼각형 이웃을 따라 번지게 한다) */
function fillHoles(geo, known, passes = 3) {
  const idx = geo.index ? geo.index.array : null;
  if (!idx) return;
  const col = geo.attributes.color;
  const n = col.count;
  for (let p = 0; p < passes; p++) {
    const sumR = new Float32Array(n), sumG = new Float32Array(n),
          sumB = new Float32Array(n), cnt = new Float32Array(n);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const tri = [a, b, c];
      for (const i of tri) {
        if (known[i]) continue;
        for (const j of tri) {
          if (j === i || !known[j]) continue;
          sumR[i] += col.getX(j); sumG[i] += col.getY(j); sumB[i] += col.getZ(j); cnt[i]++;
        }
      }
    }
    let filled = 0;
    for (let i = 0; i < n; i++) {
      if (known[i] || !cnt[i]) continue;
      col.setXYZ(i, sumR[i] / cnt[i], sumG[i] / cnt[i], sumB[i] / cnt[i]);
      known[i] = 1; filled++;
    }
    if (!filled) break;
  }
}

/** 메시에 꼭짓점 색을 쓰는 재질을 입힌다 */
export function useVertexColors(root) {
  const meshes = [];
  root.traverse(o => { if (o.isMesh) meshes.push(o); });
  meshes.forEach(o => {
    o.material = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.75, metalness: 0 });
  });
  return meshes;
}
