/* 🎞 후처리 — 다 그린 화면 위에 한 겹 더 입힌다.
 *
 * 게임이 같은 그림으로 훨씬 좋아 보이는 진짜 비결이 이것이다.
 * 모델을 바꾸지 않고, 다 그린 뒤에 색을 고르고·가장자리를 어둡게 하고·빛을 번지게 한다.
 *
 *   색보정  전체 색조를 한쪽으로 민다 (밤은 푸르게, 노을은 붉게)
 *   비네트  가장자리를 어둡게 — 눈이 가운데로 모인다
 *   블룸    밝은 곳이 번진다 — 빛이 있는 느낌
 *   결      아주 옅은 거친 알갱이 — 납작한 그림에 '필름' 느낌을 준다
 *   번쩍    한순간 하얗게 (타격·전환)
 *
 * 값싸게 만드는 것이 중요하다 (수백 편을 구워야 한다).
 *   · 비네트는 한 번 만든 그라디언트를 다시 쓴다
 *   · 블룸은 1/4 크기로 줄여서 흐린 뒤 다시 얹는다
 *   · 결은 미리 만든 알갱이 그림을 이어 붙인다
 */

/* ── 분위기 한 낱말 = 후처리 묶음 ──
   장면에 `분위기:밤` 이라고만 적으면 색보정·비네트·블룸이 한꺼번에 걸린다. */
export const MOODS = {
  "없음":   { ko: "없음" },
  "밤":     { ko: "밤 (푸르고 깊게)", 색: [40, 60, 120], 세기: 0.28, 비네트: 0.45, 블룸: 0.25 },
  "노을":   { ko: "노을 (따뜻한 주황)", 색: [255, 150, 80], 세기: 0.22, 비네트: 0.3, 블룸: 0.35 },
  "아침":   { ko: "아침 (맑고 옅게)", 색: [255, 245, 210], 세기: 0.14, 비네트: 0.15, 블룸: 0.3 },
  "따뜻함": { ko: "따뜻함", 색: [255, 190, 130], 세기: 0.18, 비네트: 0.22 },
  "차가움": { ko: "차가움", 색: [140, 190, 240], 세기: 0.2, 비네트: 0.25 },
  "회상":   { ko: "회상 (누렇게 바랜)", 색: [214, 190, 140], 세기: 0.34, 비네트: 0.4, 결: 0.16 },
  "꿈":     { ko: "꿈 (뽀얗게)", 색: [230, 210, 255], 세기: 0.26, 비네트: 0.2, 블룸: 0.55 },
  "무서움": { ko: "무서움 (어둡고 초록)", 색: [60, 90, 70], 세기: 0.34, 비네트: 0.6, 결: 0.2 },
  "옛날":   { ko: "옛날 (세피아)", 색: [190, 155, 110], 세기: 0.5, 비네트: 0.42, 결: 0.28 },
  "흑백":   { ko: "흑백", 흑백: 1, 비네트: 0.35, 결: 0.14 },
  "쨍하게": { ko: "쨍하게 (밝고 또렷)", 대비: 1.15, 블룸: 0.2 },
};
export const MOOD_NAMES = Object.keys(MOODS);
export const moodWords = () => Object.entries(MOODS).map(([k, v]) => `${k} (${v.ko})`);

/* ── 곳간 ── */
const 비네트곳간 = new Map();
const 결곳간 = new Map();
let 임시 = null;                     // 블룸용 작은 종이

function 비네트그림(w, h, 세기) {
  const key = `${Math.round(w)}x${Math.round(h)}|${세기.toFixed(2)}`;
  let c = 비네트곳간.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
  const g = c.getContext("2d");
  const r = Math.hypot(c.width, c.height) / 2;
  const grad = g.createRadialGradient(c.width / 2, c.height / 2, r * 0.42,
                                      c.width / 2, c.height / 2, r);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, `rgba(0,0,0,${Math.min(0.85, 세기).toFixed(3)})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  if (비네트곳간.size > 12) 비네트곳간.delete(비네트곳간.keys().next().value);
  비네트곳간.set(key, c);
  return c;
}

function 결그림(크기 = 128) {
  let c = 결곳간.get(크기);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 크기;
  const g = c.getContext("2d");
  const img = g.createImageData(크기, 크기);
  // 흔들리지 않는 알갱이 — 매번 같은 무늬여야 미리보기와 구운 것이 같다
  let x = 123456789;
  for (let i = 0; i < img.data.length; i += 4) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    const v = 128 + ((x % 255) - 127) * 0.55;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  결곳간.set(크기, c);
  return c;
}

/**
 * 다 그린 화면 위에 후처리를 입힌다.
 * @param ctx 그리던 캔버스
 * @param box {x,y,w,h}
 * @param opt {분위기, 색, 세기, 비네트, 블룸, 결, 흑백, 대비, 번쩍}
 */
export function applyPost(ctx, box, opt = {}) {
  const M = MOODS[opt.분위기] || {};
  const 색 = opt.색 ?? M.색;
  const 세기 = opt.세기 ?? M.세기 ?? 0;
  const 비네트 = opt.비네트 ?? M.비네트 ?? 0;
  const 블룸 = opt.블룸 ?? M.블룸 ?? 0;
  const 결 = opt.결 ?? M.결 ?? 0;
  const 흑백 = opt.흑백 ?? M.흑백 ?? 0;
  const 대비 = opt.대비 ?? M.대비 ?? 1;
  const 번쩍 = opt.번쩍 ?? 0;
  if (!색 && !비네트 && !블룸 && !결 && !흑백 && 대비 === 1 && !번쩍) return;

  const W = Math.max(1, Math.round(box.w)), H = Math.max(1, Math.round(box.h));

  /* ── 블룸 — 밝은 곳이 번진다.
        1/4 로 줄여 흐린 뒤 'screen' 으로 얹는다. 줄여서 하니까 값이 싸다. */
  if (블룸 > 0.01) {
    if (!임시) 임시 = document.createElement("canvas");
    const w2 = Math.max(2, Math.round(W / 4)), h2 = Math.max(2, Math.round(H / 4));
    if (임시.width !== w2 || 임시.height !== h2) { 임시.width = w2; 임시.height = h2; }
    const t = 임시.getContext("2d");
    t.clearRect(0, 0, w2, h2);
    t.drawImage(ctx.canvas, box.x, box.y, W, H, 0, 0, w2, h2);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = Math.min(0.8, 블룸 * 0.6);
    ctx.filter = "blur(3px)";
    ctx.drawImage(임시, 0, 0, w2, h2, box.x, box.y, W, H);
    ctx.restore();
  }

  /* ── 흑백 · 색보정 ── */
  if (흑백 > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "saturation";
    ctx.globalAlpha = Math.min(1, 흑백);
    ctx.fillStyle = "hsl(0,0%,50%)";
    ctx.fillRect(box.x, box.y, W, H);
    ctx.restore();
  }
  if (색 && 세기 > 0.005) {
    ctx.save();
    // 곱하기로 어둡게 물들이고, 살짝 덮어 밝은 쪽도 물들인다
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = Math.min(0.9, 세기);
    ctx.fillStyle = `rgb(${색[0]},${색[1]},${색[2]})`;
    ctx.fillRect(box.x, box.y, W, H);
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = Math.min(0.5, 세기 * 0.55);
    ctx.fillRect(box.x, box.y, W, H);
    ctx.restore();
  }
  if (대비 !== 1) {
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = Math.min(0.6, Math.abs(대비 - 1) * 2.5);
    ctx.fillStyle = 대비 > 1 ? "#808080" : "#9a9a9a";
    ctx.fillRect(box.x, box.y, W, H);
    ctx.restore();
  }

  /* ── 비네트 ── */
  if (비네트 > 0.01) {
    ctx.save();
    ctx.drawImage(비네트그림(W, H, 비네트), box.x, box.y, W, H);
    ctx.restore();
  }

  /* ── 결 (필름 알갱이) ── */
  if (결 > 0.01) {
    const g = 결그림();
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = Math.min(0.4, 결);
    const p = ctx.createPattern(g, "repeat");
    if (p) { ctx.fillStyle = p; ctx.fillRect(box.x, box.y, W, H); }
    ctx.restore();
  }

  /* ── 번쩍 ── */
  if (번쩍 > 0.004) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, 번쩍);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(box.x, box.y, W, H);
    ctx.restore();
  }
}

/** 곳간 비우기 (크기가 바뀌었을 때) */
export function clearPostCache() { 비네트곳간.clear(); 결곳간.clear(); 임시 = null; }
