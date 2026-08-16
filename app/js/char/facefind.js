/* 👀 얼굴 찾기 — 그림에서 눈·입 자리를 실제로 찾아낸다.
 *
 * 지금까지는 '머리는 위쪽 30%, 눈은 그 폭의 32%·68%' 처럼 비율로 짐작했다.
 * 캐릭터마다 얼굴 크기·각도가 달라 자꾸 어긋났고, 그러면 표정·눈물이 엉뚱한 자리에 그려진다.
 *
 * 이 그림체(굵은 선 + 밝은 얼굴)에서는 눈·입이 '밝은 바탕 위의 어두운 덩어리'다.
 * 그래서 이렇게 찾는다.
 *   ① 그림을 훑어 밝기를 재고, 얼굴 살색보다 뚜렷하게 어두운 점만 남긴다
 *   ② 이어진 덩어리로 묶는다 (눈동자·입·코·선)
 *   ③ 두 덩어리가 '크기가 비슷하고 · 높이가 비슷하고 · 좌우로 나란하면' 눈 한 쌍으로 본다
 *   ④ 눈 아래 가운데 있는 덩어리를 입으로 본다
 *   ⑤ 얼마나 확실한지(0~1)를 함께 돌려줘, 못 찾으면 사람이 직접 찍게 한다.
 */

const N = 128;

/** 그림을 N×N 로 훑어 밝기·불투명도를 얻는다 */
function sample(img) {
  const c = document.createElement("canvas");
  c.width = N; c.height = N;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0, N, N);
  const d = x.getImageData(0, 0, N, N).data;
  const lum = new Float32Array(N * N), alpha = new Uint8Array(N * N);
  const rgb = new Float32Array(N * N * 3);
  for (let i = 0; i < N * N; i++) {
    alpha[i] = d[i * 4 + 3] > 60 ? 1 : 0;
    lum[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114);
    rgb[i * 3] = d[i * 4]; rgb[i * 3 + 1] = d[i * 4 + 1]; rgb[i * 3 + 2] = d[i * 4 + 2];
  }
  return { lum, alpha, rgb };
}

/** 그림에서 가장 넓게 쓰인 색 = 얼굴·몸 바탕색 */
function faceColor(rgb, alpha) {
  const bins = new Map();
  for (let i = 0; i < N * N; i++) {
    if (!alpha[i]) continue;
    const k = ((rgb[i * 3] >> 5) << 10) | ((rgb[i * 3 + 1] >> 5) << 5) | (rgb[i * 3 + 2] >> 5);
    const b = bins.get(k) || [0, 0, 0, 0];
    b[0] += rgb[i * 3]; b[1] += rgb[i * 3 + 1]; b[2] += rgb[i * 3 + 2]; b[3]++;
    bins.set(k, b);
  }
  let best = null;
  for (const b of bins.values()) if (!best || b[3] > best[3]) best = b;
  return best ? [best[0] / best[3], best[1] / best[3], best[2] / best[3]] : [200, 200, 200];
}

/**
 * 덩어리가 '얼굴 안에 둘러싸여' 있는가 (0~1).
 *
 * 눈은 얼굴 한가운데 있어서 둘레가 전부 얼굴색이다.
 * 반면 귀·뿔·줄무늬 끝은 둘레에 배경(투명)이나 다른 색이 닿는다.
 * 이 하나로 '귀를 눈으로 착각하는' 문제가 거의 사라진다.
 */
function enclosure(b, dark, alpha, rgb, 얼굴색) {
  const set = new Set(b.px);
  let 둘레 = 0, 얼굴 = 0;
  for (const p of b.px) {
    const i = p % N, j = (p / N) | 0;
    for (const [di, dj] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2], [2, -2], [-2, 2]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) { 둘레++; continue; }
      const q = nj * N + ni;
      if (set.has(q) || dark[q]) continue;             // 아직 덩어리 안쪽
      둘레++;
      if (!alpha[q]) continue;                          // 배경에 닿음 → 얼굴 아님
      const dr = rgb[q * 3] - 얼굴색[0], dg = rgb[q * 3 + 1] - 얼굴색[1], db = rgb[q * 3 + 2] - 얼굴색[2];
      if (Math.sqrt(dr * dr + dg * dg + db * db) < 105) 얼굴++;
    }
  }
  return 둘레 ? 얼굴 / 둘레 : 0;
}

/* ── 🧠 머리 찾기 ──
 *
 * 눈처럼 생긴 것은 그림 어디에나 있다 — 하트·별·단추·무늬.
 * 진짜 눈과 가르는 것은 **눈이 무엇 위에 놓였는가** 다.
 *   눈은 '넓은 살색 덩어리(=머리)' 안에 있고, 그 덩어리는 그림에서 가장 큰 살덩이다.
 *   하트·별은 배경(흰 풍선·투명) 위에 떠 있다.
 *
 * 그래서 살색으로 이어진 가장 큰 덩어리를 찾아 두고, 눈 후보가 그 안에 있는지 본다.
 * 이것 하나로 '얼굴이 아예 없는 그림' 에서 억지로 눈을 찾아내는 일이 사라진다.
 */
function 살덩이찾기(rgb, alpha, 얼굴색) {
  const 살 = new Uint8Array(N * N);
  for (let p = 0; p < N * N; p++) {
    if (!alpha[p]) continue;
    const dr = rgb[p * 3] - 얼굴색[0], dg = rgb[p * 3 + 1] - 얼굴색[1], db = rgb[p * 3 + 2] - 얼굴색[2];
    if (Math.sqrt(dr * dr + dg * dg + db * db) < 78) 살[p] = 1;
  }
  // 가장 큰 살 덩어리 하나
  const seen = new Uint8Array(N * N);
  let 제일 = null;
  for (let s = 0; s < N * N; s++) {
    if (seen[s] || !살[s]) continue;
    const stack = [s], px = [];
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop();
      px.push(p);
      const i = p % N, j = (p / N) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const q = nj * N + ni;
        if (seen[q] || !살[q]) continue;
        seen[q] = 1; stack.push(q);
      }
    }
    if (!제일 || px.length > 제일.px.length) 제일 = { px };
  }
  if (!제일) return null;

  /* 눈·코·입은 살덩이 **안에 뚫린 구멍**이라 이 덩어리에 안 들어간다.
     그래서 덩어리를 '채워' 둔다 — 네모 안에서 살덩이에 둘러싸인 칸을 모두 안쪽으로 본다. */
  const 속 = new Uint8Array(N * N);
  let x0 = N, y0 = N, x1 = 0, y1 = 0;
  for (const p of 제일.px) {
    속[p] = 1;
    const i = p % N, j = (p / N) | 0;
    if (i < x0) x0 = i; if (i > x1) x1 = i;
    if (j < y0) y0 = j; if (j > y1) y1 = j;
  }
  // 네모 바깥에서 물을 부어 닿지 않는 칸 = 살덩이 안쪽 구멍
  const 바깥 = new Uint8Array(N * N);
  const 물 = [];
  for (let i = x0; i <= x1; i++) {
    for (const j of [y0, y1]) { const p = j * N + i; if (!속[p] && !바깥[p]) { 바깥[p] = 1; 물.push(p); } }
  }
  for (let j = y0; j <= y1; j++) {
    for (const i of [x0, x1]) { const p = j * N + i; if (!속[p] && !바깥[p]) { 바깥[p] = 1; 물.push(p); } }
  }
  while (물.length) {
    const p = 물.pop();
    const i = p % N, j = (p / N) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < x0 || nj < y0 || ni > x1 || nj > y1) continue;
      const q = nj * N + ni;
      if (바깥[q] || 속[q]) continue;
      바깥[q] = 1; 물.push(q);
    }
  }
  const 채운것 = new Uint8Array(N * N);
  let 넓이 = 0;
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const p = j * N + i;
    if (!바깥[p]) { 채운것[p] = 1; 넓이++; }
  }
  return { 안쪽: 채운것, 넓이,
           x0: x0 / N, y0: y0 / N, x1: x1 / N, y1: y1 / N,
           w: (x1 - x0 + 1) / N, h: (y1 - y0 + 1) / N };
}

/** 그 덩어리가 살덩이(머리·몸) 안에 얼마나 들어 있나 (0~1) */
function 살안에(b, 살) {
  if (!살) return 0;
  let 안 = 0;
  for (const p of b.px) if (살.안쪽[p]) 안++;
  return 안 / b.px.length;
}

/** 이어진 어두운 점들을 덩어리로 묶는다 */
function blobs(dark, alpha) {
  const seen = new Uint8Array(N * N);
  const out = [];
  for (let s = 0; s < N * N; s++) {
    if (seen[s] || !dark[s]) continue;
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
        if (seen[q] || !dark[q]) continue;
        seen[q] = 1; stack.push(q);
      }
    }
    let sx = 0, sy = 0, x0 = N, y0 = N, x1 = 0, y1 = 0;
    for (const p of px) {
      const i = p % N, j = (p / N) | 0;
      sx += i; sy += j;
      if (i < x0) x0 = i; if (i > x1) x1 = i;
      if (j < y0) y0 = j; if (j > y1) y1 = j;
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    out.push({ px, area: px.length, cx: sx / px.length / N, cy: sy / px.length / N,
               w: w / N, h: h / N, x0: x0 / N, y0: y0 / N, x1: x1 / N, y1: y1 / N,
               fill: px.length / (w * h) });          // 네모를 얼마나 꽉 채웠나
  }
  return out;
}


/**
 * 주둥이 덩어리를 코와 입으로 가른다.
 *
 * 만화 캐릭터는 셋 중 하나다.
 *   ① 코가 없다 (입만)            ② 코와 입이 따로 떨어져 있다
 *   ③ 코와 입이 한 덩어리로 붙어 있다  ← 강아지·고양이에 가장 흔하다
 *
 * ③은 세로로 훑어 '가장 잘록한 줄(허리)'에서 자른다.
 * 위쪽 = 코, 아래쪽 = 입. 허리가 뚜렷하지 않으면 모양으로 판단한다.
 */
function splitMuzzle(b) {
  // 줄마다 폭을 잰다
  const y0 = Math.round(b.y0 * N), y1 = Math.round(b.y1 * N);
  const H = Math.max(1, y1 - y0 + 1);
  const rows = new Array(H).fill(0);
  const minx = new Array(H).fill(N), maxx = new Array(H).fill(-1);
  for (const p of b.px) {
    const i = p % N, j = ((p / N) | 0) - y0;
    if (j < 0 || j >= H) continue;
    rows[j]++;
    if (i < minx[j]) minx[j] = i;
    if (i > maxx[j]) maxx[j] = i;
  }
  const box = (a, z) => {                       // 몇 번째 줄부터 몇 번째 줄까지의 중심·크기
    let sx = 0, sy = 0, n = 0, lo = N, hi = -1;
    for (let j = a; j <= z; j++) {
      if (rows[j] <= 0) continue;
      sx += (minx[j] + maxx[j]) / 2 * rows[j];
      sy += (y0 + j) * rows[j];
      n += rows[j];
      lo = Math.min(lo, minx[j]); hi = Math.max(hi, maxx[j]);
    }
    if (!n) return null;
    return { x: sx / n / N, y: sy / n / N,
             r: Math.max(0.018, Math.max((hi - lo + 1) / N, (z - a + 1) / N) * 0.6) };
  };

  const 세로로긴가 = b.h > b.w * 0.7;
  if (H >= 5 && 세로로긴가) {
    // 가운데쯤에서 가장 잘록한 줄을 찾는다
    let waist = -1, best = Infinity;
    for (let j = Math.floor(H * 0.25); j <= Math.floor(H * 0.75); j++) {
      if (rows[j] > 0 && rows[j] < best) { best = rows[j]; waist = j; }
    }
    const 위폭 = Math.max(...rows.slice(0, Math.max(1, waist)));
    const 아래폭 = Math.max(...rows.slice(waist + 1));
    if (waist > 0 && best < Math.min(위폭, 아래폭) * 0.72) {
      return { nose: box(0, waist - 1), mouth: box(waist + 1, H - 1), 붙음: true };
    }
    // 허리가 없으면 위 40% 를 코, 아래 45% 를 입으로 본다 (붙어 있는 ㅅ자 코+입)
    return { nose: box(0, Math.floor(H * 0.42)),
             mouth: box(Math.floor(H * 0.55), H - 1), 붙음: true };
  }
  // 납작하고 넓다 = 입 하나 (코 없음)
  return { nose: null, mouth: { x: b.cx, y: b.cy, r: Math.max(0.02, Math.max(b.w, b.h) * 0.6) },
           붙음: false };
}

/**
 * 눈·입을 찾는다.
 *
 * @param img   찾을 그림
 * @param view  "front" | "side" | "back" | null — **어느 쪽을 보는 그림인가**.
 *              정면이라고 알려 주면 '눈 하나' 를 얼굴로 받아들이지 않는다.
 *              정면 얼굴에는 눈이 둘 있기 때문이다. 이걸 몰랐을 때는
 *              얼굴이 아예 없는 그림(생각 풍선 속 하트)에서도 눈을 찾아냈다.
 * @returns {eyeL,eyeR,mouth,head,확신,후보} — 좌표는 그림 기준 0~1
 */
export function findFace(img, view = null) {
  const { lum, alpha, rgb } = sample(img);

  // 그림(불투명) 영역의 크기와 밝기 분포
  let x0 = N, y0 = N, x1 = 0, y1 = 0, n = 0;
  const vals = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const p = j * N + i;
    if (!alpha[p]) continue;
    n++; vals.push(lum[p]);
    if (i < x0) x0 = i; if (i > x1) x1 = i;
    if (j < y0) y0 = j; if (j > y1) y1 = j;
  }
  if (n < 50) return { 확신: 0, 후보: [] };
  vals.sort((a, b) => a - b);
  const 밝은쪽 = vals[Math.floor(vals.length * 0.65)];        // 얼굴 살색 대표값
  const 문턱 = Math.max(36, 밝은쪽 - 58);                      // 이보다 어두우면 '선·눈'

  /* 눈이 늘 '어두운' 것은 아니다 — 하트 눈·별 눈처럼 색만 다른 경우가 있다.
     그래서 ①어둡거나 ②얼굴 대표색과 색이 뚜렷이 다르면 눈 후보로 본다. */
  const 얼굴색 = faceColor(rgb, alpha);
  const dark = new Uint8Array(N * N);
  for (let p = 0; p < N * N; p++) {
    if (!alpha[p]) continue;
    if (lum[p] < 문턱) { dark[p] = 1; continue; }
    const dr = rgb[p * 3] - 얼굴색[0], dg = rgb[p * 3 + 1] - 얼굴색[1], db = rgb[p * 3 + 2] - 얼굴색[2];
    if (Math.sqrt(dr * dr + dg * dg + db * db) > 128) dark[p] = 1;
  }

  const bodyW = (x1 - x0 + 1) / N, bodyH = (y1 - y0 + 1) / N;
  const top = y0 / N;
  const all = blobs(dark, alpha);

  /* 머리(가장 큰 살덩이) — 눈은 반드시 이 안에 있다.
     하트·별·단추는 이 밖에 있으므로 여기서 갈린다. */
  const 살 = 살덩이찾기(rgb, alpha, 얼굴색);

  /* 눈 후보 — 작고, 동글동글하고, 위쪽 절반에 있고, **살덩이 안에** 있는 덩어리 */
  all.forEach(b => {
    b.속 = enclosure(b, dark, alpha, rgb, 얼굴색);
    b.살속 = 살안에(b, 살);
  });
  /* ── 눈 후보 거르기 ──
   *
   * 크기를 **그림 전체**에 대고 재면 그림마다 어긋난다.
   * 전신 그림은 얼굴이 작고, 얼굴만 크게 그린 그림은 눈이 크다.
   * 그래서 '머리 크기' 를 기준으로 잰다 — 눈은 머리에 대해 늘 비슷한 비율이다.
   *
   * 걸림돌마다 이름을 붙여 둔다. 왜 떨어졌는지 알 수 있어야 고칠 수 있다.
   */
  const 머리폭 = 살 ? Math.min(살.w, bodyW) : bodyW;
  const 머리넓이 = 살 ? 살.넓이 : n;

  const 걸림 = {};
  const 거른다 = (b) => {
    const 탈 =
      b.속 <= 0.55 ? "얼굴 안에 안 둘러싸임"
      /* 살덩이는 '가장 큰 살 뭉치' 라서, 전신 그림에서 머리와 몸이 목으로 끊기면
         머리가 그 뭉치에서 빠질 수 있다. 그래서 살덩이 밖이어도
         **둘레가 살색으로 둘러싸여 있으면**(속) 눈으로 인정한다. */
      : (b.살속 <= 0.75 && b.속 <= 0.82) ? "머리·몸 위에 없음"
      : b.area <= n * 0.0004 ? "너무 작음"
      // 판다 눈은 머리의 1/6 까지도 된다 — 머리를 기준으로 재야 놓치지 않는다
      : b.area >= 머리넓이 * 0.18 ? "너무 큼"
      : (b.cy - top) >= bodyH * 0.68 ? "너무 아래"
      : b.w >= 머리폭 * 0.5 ? "너무 넓음"
      : b.h >= bodyH * 0.34 ? "너무 높음"
      : b.fill <= 0.30 ? "네모를 덜 채움"
      : b.w / b.h <= 0.2 ? "너무 홀쭉"
      // 감은 눈(─)은 아주 납작하다. 선 하나가 눈일 수 있으므로 넉넉히 둔다
      : b.w / b.h >= 12 ? "너무 납작"
      : null;
    if (탈) 걸림[탈] = (걸림[탈] || 0) + 1;
    return !탈;
  };
  const cand = all.filter(거른다);

  /** 짝 하나를 재 본다 — 눈 한 쌍이 될 수 있으면 점수를, 아니면 null 을 준다.
   *  @param 기울기한도  두 눈을 이은 선이 얼마나 기울어도 되는가 (tan 값)
   */
  const 짝재기 = (a, b, 기울기한도) => {
    const L = a.cx < b.cx ? a : b, R = a.cx < b.cx ? b : a;
    const 간격 = R.cx - L.cx;
    if (간격 < bodyW * 0.06 || 간격 > bodyW * 0.62) return null;
    const 기울기 = Math.abs(R.cy - L.cy) / Math.max(1e-6, 간격);
    if (기울기 > 기울기한도) return null;
    const 크기비 = Math.min(L.area, R.area) / Math.max(L.area, R.area);
    if (크기비 < 0.45) return null;                    // 두 눈은 크기가 비슷하다
    if (Math.max(L.w, R.w) > 간격 * 1.05) return null; // 눈이 간격보다 크면 눈이 아니다

    // 점수: 나란할수록 · 크기가 같을수록 · 얼굴 중앙에 대칭일수록 · 클수록
    const 중앙 = (L.cx + R.cx) / 2;
    const 대칭 = 1 - Math.min(1, Math.abs(중앙 - (x0 / N + bodyW / 2)) / (bodyW * 0.35));
    /* 눈은 머리 '꼭대기'가 아니라 '중간 위쪽'에 있다.
       꼭대기를 좋아하게 두면 귀·뿔을 눈으로 고른다. */
    const 상대높이 = ((L.cy + R.cy) / 2 - top) / bodyH;
    const 높이 = Math.exp(-Math.pow((상대높이 - 0.32) / 0.22, 2));
    // 동글동글할수록 눈답다 (줄무늬·반점은 삐뚤빼뚤하다)
    const 동글 = (L.fill + R.fill) / 2;
    /* 두 눈은 얼굴 폭의 1/4~1/2 쯤 벌어져 있다.
       귀·뿔은 얼굴 양 끝에 있어 훨씬 넓게 벌어진다 — 그걸로 갈라낸다. */
    const 벌어짐 = Math.exp(-Math.pow((간격 / bodyW - 0.29) / 0.16, 2));
    const score = (1 - Math.min(1, 기울기 / Math.max(1e-6, 기울기한도))) * 1.4
                + 크기비 * 1.3 + 대칭 * 1.2
                + Math.min(1, (L.area + R.area) / (n * 0.02)) * 0.6 + 높이 * 1.6
                + (L.속 + R.속) / 2 * 1.1 + 동글 * 0.9 + 벌어짐 * 1.5;
    return { L, R, score, 중앙, 간격, 기울기 };
  };

  /* 두 번 훑는다.
   *
   *   ① 먼저 **나란한** 짝만 본다 (7도 안쪽). 똑바로 선 얼굴은 여기서 끝난다.
   *   ② 나란한 짝이 하나도 없을 때만 **기운** 짝까지 본다 (20도까지 — 고개를 갸웃한 얼굴).
   *
   * 한 번에 느슨하게 훑으면, 갸웃하지도 않은 얼굴에서 '귀 + 눈' 같은
   * 기운 짝이 진짜 눈 한 쌍을 이기는 일이 생긴다. 그래서 순서를 둔다.
   */
  let best = null;
  for (const 한도 of [0.12, 0.36]) {                    // tan(7°) → tan(20°)
    for (let i = 0; i < cand.length; i++) {
      for (let k = i + 1; k < cand.length; k++) {
        const r = 짝재기(cand[i], cand[k], 한도);
        if (r && (!best || r.score > best.score)) best = r;
      }
    }
    if (best) break;                                   // 나란한 짝을 찾았으면 그것으로 끝
  }
  /* 짝을 못 찾았으면 — 옆모습처럼 눈이 **하나만 보이는** 경우를 살펴본다.
   *
   * 여기가 예전에 헛발질하던 자리다. 눈처럼 생긴 것 하나만 있으면 무조건 눈이라 우겨서,
   * 얼굴이 아예 없는 그림(생각 풍선 속 하트)에서도 확신 50% 를 줬다.
   * 그래서 **주둥이가 아래에 있는가** 를 함께 본다 — 눈 하나로는 얼굴이라 할 수 없다.
   */
  if (!best) {
    /* 정면 그림에는 눈이 둘 있다. 짝을 못 찾았다면 얼굴이 아니거나,
       얼굴이라도 근거가 모자란 것이다 — 어느 쪽이든 손대지 않는 편이 낫다. */
    if (view === "front" || view === "back") {
      return { 확신: 0, 후보: cand.length,
               사유: "정면인데 눈 한 쌍을 못 찾음 (얼굴이 아닐 수 있습니다)", 걸림 };
    }
    const 하나 = cand
      .filter(b => (b.cy - top) < bodyH * 0.55 && b.fill > 0.42 &&
                   b.w / b.h > 0.35 && b.w / b.h < 3 && b.area > n * 0.0005)
      .sort((p, q) => (q.fill * Math.sqrt(q.area)) - (p.fill * Math.sqrt(p.area)))[0];
    if (!하나) return { 확신: 0, 후보: cand, 사유: "눈다운 것이 없음" };

    // 주둥이(입)는 눈보다 바깥쪽 아래에 있다 — 얼굴이 향한 쪽으로 찾는다
    const 얼굴방향 = 하나.cx > (x0 / N + bodyW / 2) ? 1 : -1;
    const m = all
      .filter(b => b.살속 > 0.7 &&                       // 주둥이도 머리 위에 있어야 한다
                   b.cy > 하나.cy && b.cy < 하나.cy + bodyH * 0.28 &&
                   (b.cx - 하나.cx) * 얼굴방향 > -bodyW * 0.05 &&
                   b.area > n * 0.0004 && b.area < n * 0.05)
      .sort((p, q) => Math.abs(p.cy - (하나.cy + bodyH * 0.09))
                    - Math.abs(q.cy - (하나.cy + bodyH * 0.09)))[0];

    /* 주둥이가 없으면 얼굴이라 볼 근거가 없다.
       눈 하나 + 아무것도 없음 = 그냥 동그란 무늬일 뿐이다. */
    if (!m) return { 확신: 0, 후보: cand, 사유: "눈 하나뿐이고 주둥이가 없음" };

    const rr = b => Math.max(0.022, Math.max(b.w, b.h) * 0.62);
    return {
      한쪽눈: true,
      eyeR: { x: 하나.cx, y: 하나.cy, r: rr(하나) },
      eyeL: null,
      mouth: { x: m.cx, y: m.cy, r: rr(m) },
      head: { x: 하나.cx - 얼굴방향 * bodyW * 0.08, y: 하나.cy - bodyH * 0.04,
              r: Math.max(bodyW * 0.22, bodyH * 0.13) },
      확신: 0.5, 후보: cand.length,
    };
  }

  /* 코·입 — 두 눈 아래, 눈 사이 가운데쯤에 있는 덩어리들.
   *
   * 크기를 **눈을 기준으로** 잰다. 그림 전체로 재면 몸이 큰 캐릭터에서
   * 몸 가장자리·물방울 같은 큰 덩어리를 입으로 집는다 (구름 캐릭터에서 실제로 그랬다).
   * 입은 눈보다 크게 벌어져도 두 눈 사이 간격을 넘지 않고, 눈 넓이의 몇 배 안이다.
   */
  const 눈아래 = Math.max(best.L.cy, best.R.cy);
  const 눈넓이 = (best.L.area + best.R.area) / 2;
  const 주둥이 = all.filter(b =>
    b.cy > 눈아래 + bodyH * 0.01 && b.cy < 눈아래 + best.간격 * 1.6 &&
    Math.abs(b.cx - best.중앙) < best.간격 * 0.95 &&
    b.w < best.간격 * 1.25 &&                     // 두 눈 사이보다 넓으면 입이 아니다
    b.h < best.간격 * 0.9 &&
    b.area > n * 0.0003 && b.area < 눈넓이 * 8)
    .sort((p, q) => p.cy - q.cy);

  let nose = null, mouth = null, 붙음 = false;
  if (주둥이.length >= 2) {
    /* 코와 입이 따로 있다 — 위가 코, 아래가 입.
       (가운데에 가까운 것들만 남겨 수염·볼점을 걸러낸다) */
    const 가운데것 = 주둥이.filter(b => Math.abs(b.cx - best.중앙) < best.간격 * 0.6);
    const 목록 = 가운데것.length >= 2 ? 가운데것 : 주둥이;
    const r = b => Math.max(0.02, Math.max(b.w, b.h) * 0.6);
    nose = { x: 목록[0].cx, y: 목록[0].cy, r: r(목록[0]) };
    const last = 목록[목록.length - 1];
    mouth = { x: last.cx, y: last.cy, r: r(last) };
  } else if (주둥이.length === 1) {
    const 갈라 = splitMuzzle(주둥이[0]);        // 한 덩어리 — 코+입인지 입만인지 본다
    nose = 갈라.nose; mouth = 갈라.mouth; 붙음 = 갈라.붙음;
  }

  const r = b => Math.max(0.022, Math.max(b.w, b.h) * 0.62);

  /* 코·입의 크기를 눈 사이 간격에 묶는다.
     덩어리를 잘못 집어도 화면 절반을 덮는 동그라미가 되지는 않게 한다. */
  const 최대반지름 = Math.max(0.03, best.간격 * 0.75);
  for (const o of [nose, mouth]) {
    if (o && o.r > 최대반지름) o.r = 최대반지름;
  }

  const 확신 = Math.min(1, best.score / 7.4) * (mouth ? 1 : 0.85);
  return {
    eyeL: { x: best.L.cx, y: best.L.cy, r: r(best.L) },
    eyeR: { x: best.R.cx, y: best.R.cy, r: r(best.R) },
    nose, 코입붙음: 붙음,
    /* 입을 못 찾았으면 눈 바로 아래에 작게 둔다.
       입이 없는 그림체(구름 캐릭터 등)가 흔하다 — 몸 크기로 어림잡으면
       엉뚱하게 멀리 떨어지므로, **눈 사이 간격**을 자로 삼는다. */
    mouth: mouth || { x: best.중앙, y: 눈아래 + best.간격 * 0.55,
                      r: Math.max(0.02, best.간격 * 0.22) },
    head: { x: best.중앙, y: (best.L.cy + best.R.cy) / 2 - bodyH * 0.04,
            r: Math.max(best.간격 * 1.15, bodyH * 0.14) },
    확신, 후보: cand.length,
  };
}

/**
 * 찾은 결과를 부위 설정에 넣는다 (못 찾으면 손대지 않는다).
 * @returns {적용됨, 확신}
 */
export function applyFace(parts, img, view = "front") {
  // 뒷모습에는 얼굴이 없다 — 무엇을 찾든 눈이 아니므로 아예 손대지 않는다
  if (view === "back") {
    ["eyeL", "eyeR", "mouth", "cheekL", "cheekR"].forEach(k => { if (parts[k]) parts[k].on = false; });
    return { 적용됨: false, 확신: 0, 사유: "뒷모습" };
  }
  const f = findFace(img, view);            // 어느 쪽을 보는 그림인지 함께 알려 준다
  // 한쪽 눈만 찾은 것은 근거가 약하다 — 옆모습일 때만 받아들인다
  if (f && f.한쪽눈 && view !== "side") return { 적용됨: false, 확신: f.확신, 사유: "한쪽만 찾음" };
  if (!f || f.확신 < 0.35) {
    return { 적용됨: false, 확신: f ? f.확신 : 0, 사유: f?.사유 || "얼굴을 못 찾음" };
  }
  const put = (k, v) => {
    const p = parts[k];
    if (!p || !v) return;
    p.x = v.x; p.y = v.y; p.r = v.r; p.on = true;
  };
  if (view === "side" || f.한쪽눈) {
    // 옆모습은 눈이 하나만 보인다 — 가까운 쪽만 켜고 반대쪽은 끈다
    const near = f.한쪽눈 ? f.eyeR : (f.eyeR.r >= f.eyeL.r ? f.eyeR : f.eyeL);
    put("eyeR", near);
    if (parts.eyeL) parts.eyeL.on = false;
    if (parts.cheekL) parts.cheekL.on = false;
    if (parts.earL) parts.earL.on = false;
  } else {
    put("eyeL", f.eyeL);
    put("eyeR", f.eyeR);
  }
  put("mouth", f.mouth);
  if (f.nose && parts.nose) { parts.nose.x = f.nose.x; parts.nose.y = f.nose.y;
                              parts.nose.r = f.nose.r; parts.nose.on = true; }
  else if (parts.nose) parts.nose.on = false;
  if (parts.head) { parts.head.x = f.head.x; parts.head.y = f.head.y; parts.head.r = f.head.r; }
  // 볼은 눈 바로 바깥·조금 아래
  if (f.eyeL && f.eyeR) {
    const 폭 = Math.abs(f.eyeR.x - f.eyeL.x) || 0.2;
    if (parts.cheekL) { parts.cheekL.x = f.eyeL.x - 폭 * 0.28; parts.cheekL.y = f.eyeL.y + 폭 * 0.32; }
    if (parts.cheekR) { parts.cheekR.x = f.eyeR.x + 폭 * 0.28; parts.cheekR.y = f.eyeR.y + 폭 * 0.32; }
  } else if (parts.cheekR && f.eyeR) {
    parts.cheekR.x = f.eyeR.x; parts.cheekR.y = f.eyeR.y + f.eyeR.r * 2.2;
  }
  return { 적용됨: true, 확신: f.확신, 결과: f };
}
