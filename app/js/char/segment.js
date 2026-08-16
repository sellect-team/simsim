/* ✂ 그림에서 팔·다리·귀·꼬리를 스스로 찾아낸다.

   그림 한 장에 뼈대를 얹을 때 가장 큰 문제는 "어느 살이 어느 뼈에 붙었는가" 이다.
   거리만 보고 정하면, 배 한가운데가 팔 뼈에 붙어 손을 들 때 몸통이 통째로 늘어난다.
   그래서 실루엣을 이렇게 나눈다.

   ① 그림의 불투명 영역(실루엣)을 만들고
   ② 각 점이 바깥까지 얼마나 두꺼운지(거리 변환)를 재서 두꺼운 곳 = 몸통·머리(몸체)로 보고
   ③ 몸체가 아닌 얇게 삐져나온 덩어리들을 따로 묶어 (귀·앞발·뒷발·꼬리)
   ④ 위치로 무엇인지 추측한다.
   이렇게 나눈 덩어리는 관절 자동 배치와 '이 살은 이 뼈만 따라간다'(가중치)에 함께 쓰인다. */

const INF = 1e9;

/** 그림을 N×N 로 훑어 실루엣·두께·덩어리를 구한다 */
export function analyze(img, N = 96) {
  const c = document.createElement("canvas");
  c.width = N; c.height = N;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0, N, N);
  const a = x.getImageData(0, 0, N, N).data;
  const mask = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) mask[i] = a[i * 4 + 3] > 30 ? 1 : 0;

  const dist = distanceTransform(mask, N);
  let maxD = 0;
  for (let i = 0; i < N * N; i++) if (dist[i] > maxD) maxD = dist[i];
  if (!maxD) return { N, mask, dist, core: mask, blobs: [], box: null };

  /* 두꺼운 곳 = 몸체, 얇게 뻗어 나온 곳 = 팔·다리·귀·꼬리.
     ① 두께가 얼마 이하인 곳을 깎아 내면 가는 팔·다리·귀는 사라지고 몸통·머리만 남고
     ② 깎은 만큼 다시 부풀리면 몸통이 원래 크기로 돌아온다 (형태학의 '열림').
     ②를 조금만 하면 몸 테두리가 껍질처럼 통째로 벗겨져 한 덩어리로 잡힌다.

     얼마나 깎을지는 그림마다 다르다 — 통통한 캐릭터는 팔다리도 두껍다.
     그래서 굵게 깎는 쪽부터 차례로 시도해, 팔·다리처럼 보이는 덩어리가
     가장 많이 나오는 두께를 고른다. */
  const total = mask.reduce((s, v) => s + v, 0);
  let best = null;
  for (const f of [0.42, 0.36, 0.30, 0.25, 0.21, 0.17, 0.14]) {
    const thr = Math.max(2, maxD * f);
    const core = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) core[i] = mask[i] && dist[i] >= thr ? 1 : 0;
    grow(core, mask, N, Math.round(thr) + 1);
    const found = components(mask, core, N)
      .filter(b => b.area > total * 0.008 && b.area < total * 0.22);
    // 몸통까지 쪼개지기 시작하면 (덩어리가 너무 많거나 하나가 너무 크면) 거기서 멈춘다
    const huge = components(mask, core, N).some(b => b.area > total * 0.3);
    const score = huge ? -1 : Math.min(found.length, 6) - Math.max(0, found.length - 6) * 0.5;
    if (!best || score > best.score) best = { score, thr, core, blobs: found };
    if (huge || found.length >= 6) break;
  }
  const { core, thr } = best;
  const blobs = best.blobs;
  blobs.forEach(b => finishBlob(b, core, dist, N));
  blobs.sort((p, q) => q.area - p.area);
  return { N, mask, dist, core, blobs, box: bbox(core, N), thr, maxD };
}

/** 배경까지의 거리 (3-4 체임퍼 근사) */
function distanceTransform(mask, N) {
  const d = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) d[i] = mask[i] ? INF : 0;
  const at = (i, j) => (i < 0 || j < 0 || i >= N || j >= N) ? 0 : d[j * N + i];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!mask[j * N + i]) continue;
    d[j * N + i] = Math.min(d[j * N + i], at(i - 1, j) + 3, at(i, j - 1) + 3,
                            at(i - 1, j - 1) + 4, at(i + 1, j - 1) + 4);
  }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) {
    if (!mask[j * N + i]) continue;
    d[j * N + i] = Math.min(d[j * N + i], at(i + 1, j) + 3, at(i, j + 1) + 3,
                            at(i + 1, j + 1) + 4, at(i - 1, j + 1) + 4);
  }
  for (let i = 0; i < N * N; i++) d[i] /= 3;    // 대략 픽셀 단위로
  return d;
}

/** mask 안에서 core 를 n 칸 부풀린다 */
function grow(core, mask, N, n) {
  for (let k = 0; k < n; k++) {
    const next = core.slice();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (core[j * N + i] || !mask[j * N + i]) continue;
      if ((i > 0 && core[j * N + i - 1]) || (i < N - 1 && core[j * N + i + 1]) ||
          (j > 0 && core[(j - 1) * N + i]) || (j < N - 1 && core[(j + 1) * N + i]))
        next[j * N + i] = 1;
    }
    core.set(next);
  }
}

/** 몸체가 아닌 부분을 이어진 덩어리로 묶는다 */
function components(mask, core, N) {
  const seen = new Uint8Array(N * N);
  const out = [];
  for (let j0 = 0; j0 < N; j0++) for (let i0 = 0; i0 < N; i0++) {
    const s = j0 * N + i0;
    if (seen[s] || !mask[s] || core[s]) continue;
    const stack = [s], px = [];
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop();
      px.push(p);
      const i = p % N, j = (p / N) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const q = nj * N + ni;
        if (seen[q] || !mask[q] || core[q]) continue;
        seen[q] = 1; stack.push(q);
      }
    }
    let sx = 0, sy = 0;
    px.forEach(p => { sx += p % N; sy += (p / N) | 0; });
    out.push({ px, area: px.length, cx: sx / px.length / N, cy: sy / px.length / N });
  }
  return out;
}

/** 덩어리가 몸체에 붙은 자리(attach)와 가장 먼 끝(tip)을 찾는다 */
function finishBlob(b, core, dist, N) {
  // 몸체에 맞닿은 픽셀들의 평균 = 붙은 자리
  let ax = 0, ay = 0, n = 0;
  for (const p of b.px) {
    const i = p % N, j = (p / N) | 0;
    let touch = false;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      if (core[nj * N + ni]) { touch = true; break; }
    }
    if (touch) { ax += i; ay += j; n++; }
  }
  b.attach = n ? { x: ax / n / N, y: ay / n / N } : { x: b.cx, y: b.cy };
  let best = null, bd = -1;
  for (const p of b.px) {
    const i = p % N, j = (p / N) | 0;
    const d = Math.hypot(i / N - b.attach.x, j / N - b.attach.y);
    if (d > bd) { bd = d; best = { x: i / N, y: j / N }; }
  }
  b.tip = best || { x: b.cx, y: b.cy };
  b.len = bd;
  b.dx = b.tip.x - b.attach.x;                  // 어느 쪽으로 뻗었는가
  b.dy = b.tip.y - b.attach.y;
  b.sideways = Math.abs(b.dx) > Math.abs(b.dy);
  // 살짝 부풀린 소속 지도 (정점이 이 덩어리에 드는지 볼 때 씀)
  const set = new Set(b.px);
  b.has = (u, v) => {
    const i = Math.round(u * N), j = Math.round(v * N);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const q = (j + dj) * N + (i + di);
      if (i + di >= 0 && i + di < N && j + dj >= 0 && j + dj < N && set.has(q)) return true;
    }
    return false;
  };
}

function bbox(mask, N) {
  let x0 = N, y0 = N, x1 = -1, y1 = -1;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!mask[j * N + i]) continue;
    if (i < x0) x0 = i; if (i > x1) x1 = i;
    if (j < y0) y0 = j; if (j > y1) y1 = j;
  }
  if (x1 < 0) return null;
  return { x0: x0 / N, y0: y0 / N, x1: x1 / N, y1: y1 / N,
           mx: (x0 + x1) / 2 / N, my: (y0 + y1) / 2 / N };
}

/**
 * 찾아낸 덩어리가 무엇인지 자리로 추측한다.
 * @returns {ear:[], arm:[], leg:[], tail} — 각 항목은 덩어리 그대로 (attach/tip/has 포함)
 */
export function classify(seg, view = "front") {
  const { blobs, box } = seg;
  if (!box || !blobs.length) return { ear: [], arm: [], leg: [], tail: null };
  const H = Math.max(0.05, box.y1 - box.y0);
  const rel = b => (b.cy - box.y0) / H;                 // 몸체 안에서의 높이 0~1
  const left = b => b.cx < box.mx;

  const rest = [...blobs];
  const take = (test, n, order) => {
    const pool = order ? [...rest].sort(order) : rest;
    const got = pool.filter(test).slice(0, n);
    got.forEach(b => rest.splice(rest.indexOf(b), 1));
    return got.sort((p, q) => p.cx - q.cx);          // 화면 왼쪽부터
  };
  // ① 귀 — 위쪽에 붙어 위로 뻗은 것
  const ear = take(b => rel(b) < 0.38 && b.dy < 0.04, 2, (p, q) => p.cy - q.cy);
  // ② 꼬리 — 몸 중간~아래 높이에서 옆(또는 위)으로 뻗은 것. 다리보다 먼저 골라야
  //    옆모습에서 꼬리를 뒷다리로 착각하지 않는다.
  let tail = null;
  const tailPick = take(b => rel(b) > 0.25 && rel(b) < 0.85 && b.sideways && b.dy < b.len * 0.55,
                        1, (p, q) => q.len - p.len);
  if (tailPick.length) tail = tailPick[0];
  // ③ 다리 — 아래로 뻗은 것 중 가장 아래 둘
  const leg = take(b => b.dy > 0 && rel(b) > 0.5, 2, (p, q) => q.cy - p.cy);
  // ④ 앞발(팔) — 머리보다 아래, 몸 옆으로 붙은 둘 (주둥이·귀 끝을 팔로 잘못 잡지 않게)
  const arm = take(b => rel(b) > 0.35 && rel(b) < 0.9 && b.dy > -0.03, 2,
                   (p, q) => Math.abs(q.cx - box.mx) - Math.abs(p.cx - box.mx));
  return { ear, arm, leg, tail, rest, box, left };
}

/** 옆모습처럼 한쪽만 보일 때는 오른쪽 뼈에 몰아 준다 (동작이 주로 오른쪽을 쓴다) */
export const limbBones = (blobs, l, r) => (blobs || []).length === 1 ? [r] : [l, r];

/**
 * 정점마다 '이 살은 이 뼈만 따라간다'를 정한다 (몸통은 null → 거리로 계산).
 * @param verts mesh.verts, @param groups classify 결과
 */
export function vertexRegions(verts, groups) {
  const bind = [];
  const rules = [];
  const add = (blob, bone) => { if (blob && bone) rules.push([blob, bone]); };
  const armB = limbBones(groups.arm, "handL", "handR");
  const legB = limbBones(groups.leg, "footL", "footR");
  (groups.arm || []).forEach((b, i) => add(b, armB[i]));
  (groups.leg || []).forEach((b, i) => add(b, legB[i]));
  (groups.ear || []).forEach(b => add(b, "head"));
  add(groups.tail, "hip");
  for (let i = 0; i < verts.length; i++) {
    bind[i] = null;
    for (const [blob, bone] of rules) {
      if (blob.has(verts[i].u, verts[i].v)) { bind[i] = bone; break; }
    }
  }
  return bind;
}

/** 줄마다 왼쪽·오른쪽 끝을 재 준다 (몸체 core 로 재면 귀·꼬리가 빠진 '얼굴 본체'가 나온다) */
export function rowSpans(mask, N) {
  const out = [];
  for (let j = 0; j < N; j++) {
    let lo = N, hi = -1, cnt = 0;
    for (let i = 0; i < N; i++)
      if (mask[j * N + i]) { if (i < lo) lo = i; if (i > hi) hi = i; cnt++; }
    out.push(cnt ? { lo: lo / N, hi: hi / N, mid: (lo + hi) / 2 / N, w: cnt / N }
                 : { lo: 0, hi: 0, mid: 0.5, w: 0 });
  }
  return out;
}
