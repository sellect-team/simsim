/* 📦 소품 — 배우가 아닌 '물건' 개체.
 *
 * 효과(fx.js)와 다른 점이 핵심이다.
 *   효과 — 그 자리에 붙박이로 피어난다 (불꽃·반짝임)
 *   소품 — **개체**다. 자리·크기·회전 트랙을 갖고, 움직이고, 배우에게 붙는다
 *
 * 그림이 없어도 이름만으로 그려 준다 (배경·캐릭터와 같은 규칙).
 * 같은 이름으로 그림을 올리면 그 그림이 대신 쓰인다.
 *
 * 그리는 규칙: 언제나 **가운데 (0,0), 크기 1** 기준으로 그린다.
 * 자리·크기·회전은 무대가 알아서 붙인다 — 그래야 붙이기(부모-자식)가 그대로 먹는다.
 */

const 색 = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const 어둡게 = (c, k) => c.map(v => Math.round(v * (1 - k)));

/** 이름 → 색 (같은 이름이면 언제나 같은 색) */
function 씨앗색(글) {
  let h = 2166136261;
  for (let i = 0; i < String(글).length; i++) { h ^= String(글).charCodeAt(i); h = Math.imul(h, 16777619); }
  const 팔레트 = [[236, 132, 118], [246, 196, 106], [138, 190, 232], [160, 206, 140],
                  [206, 160, 232], [240, 168, 196], [180, 168, 150], [120, 200, 190]];
  return 팔레트[(h >>> 8) % 팔레트.length];
}

const 선 = (g, c) => { g.strokeStyle = 색(어둡게(c, 0.55)); g.lineWidth = 0.055; };

/* ── 소품 하나하나 — 모두 (0,0) 가운데, 지름 1 안에 그린다 ── */
const 공 = (g, c) => {
  g.beginPath(); g.arc(0, 0, 0.42, 0, 7);
  g.fillStyle = 색(c); g.fill(); 선(g, c); g.stroke();
  g.beginPath(); g.moveTo(-0.42, 0); g.quadraticCurveTo(0, -0.16, 0.42, 0); g.stroke();
  g.beginPath(); g.arc(-0.14, -0.16, 0.1, 0, 7);
  g.fillStyle = "rgba(255,255,255,0.5)"; g.fill();
};
const 상자 = (g, c) => {
  g.beginPath(); g.rect(-0.4, -0.32, 0.8, 0.64);
  g.fillStyle = 색(c); g.fill(); 선(g, c); g.stroke();
  g.beginPath(); g.moveTo(-0.4, -0.1); g.lineTo(0.4, -0.1); g.stroke();
};
const 선물 = (g, c) => {
  상자(g, c);
  g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = 0.09;
  g.beginPath(); g.moveTo(0, -0.32); g.lineTo(0, 0.32); g.stroke();
  g.beginPath(); g.arc(-0.09, -0.4, 0.1, 0, 7); g.arc(0.09, -0.4, 0.1, 0, 7);
  g.fillStyle = "rgba(255,255,255,0.85)"; g.fill();
};
const 사과 = (g, c) => {
  g.beginPath(); g.arc(0, 0.04, 0.36, 0, 7);
  g.fillStyle = 색([228, 96, 88]); g.fill(); 선(g, [228, 96, 88]); g.stroke();
  g.strokeStyle = "#6b4a2a"; g.lineWidth = 0.06;
  g.beginPath(); g.moveTo(0, -0.3); g.quadraticCurveTo(0.06, -0.44, 0.16, -0.46); g.stroke();
  g.beginPath(); g.ellipse(0.2, -0.4, 0.13, 0.07, -0.5, 0, 7);
  g.fillStyle = "#6aa84f"; g.fill();
};
const 별 = (g, c) => {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.19 : 0.44;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = 색([250, 216, 110]); g.fill(); 선(g, [250, 216, 110]); g.stroke();
};
const 하트 = (g, c) => {
  g.beginPath();
  g.moveTo(0, 0.4);
  g.bezierCurveTo(-0.62, -0.06, -0.28, -0.48, 0, -0.18);
  g.bezierCurveTo(0.28, -0.48, 0.62, -0.06, 0, 0.4);
  g.fillStyle = 색([238, 110, 140]); g.fill(); 선(g, [238, 110, 140]); g.stroke();
};
const 꽃 = (g, c) => {
  for (let i = 0; i < 5; i++) {
    const a = i * 1.257;
    g.beginPath(); g.ellipse(Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.17, 0.13, a, 0, 7);
    g.fillStyle = 색(c); g.fill();
  }
  g.beginPath(); g.arc(0, 0, 0.13, 0, 7);
  g.fillStyle = 색([250, 214, 110]); g.fill();
};
const 풍선 = (g, c) => {
  g.beginPath(); g.ellipse(0, -0.12, 0.3, 0.36, 0, 0, 7);
  g.fillStyle = 색(c); g.fill(); 선(g, c); g.stroke();
  g.strokeStyle = "rgba(90,80,70,0.7)"; g.lineWidth = 0.025;
  g.beginPath(); g.moveTo(0, 0.24); g.quadraticCurveTo(0.08, 0.4, 0, 0.5); g.stroke();
};
const 책 = (g, c) => {
  g.beginPath(); g.rect(-0.34, -0.26, 0.68, 0.52);
  g.fillStyle = 색(c); g.fill(); 선(g, c); g.stroke();
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.fillRect(-0.28, -0.2, 0.24, 0.4); g.fillRect(0.04, -0.2, 0.24, 0.4);
};
const 컵 = (g, c) => {
  g.beginPath(); g.moveTo(-0.26, -0.24); g.lineTo(0.26, -0.24);
  g.lineTo(0.19, 0.3); g.lineTo(-0.19, 0.3); g.closePath();
  g.fillStyle = 색(c); g.fill(); 선(g, c); g.stroke();
  g.beginPath(); g.ellipse(0, -0.24, 0.26, 0.08, 0, 0, 7);
  g.fillStyle = "rgba(255,255,255,0.5)"; g.fill();
};
const 고구마 = (g, c) => {
  g.save(); g.rotate(-0.4);
  g.beginPath(); g.ellipse(0, 0, 0.42, 0.2, 0, 0, 7);
  g.fillStyle = 색([150, 84, 140]); g.fill(); 선(g, [150, 84, 140]); g.stroke();
  g.restore();
};
const 장작 = (g, c) => {
  for (let i = -1; i <= 1; i++) {
    g.save(); g.rotate(i * 0.5);
    g.beginPath(); g.roundRect(-0.42, -0.06, 0.84, 0.12, 0.06);
    g.fillStyle = 색([146, 106, 72]); g.fill(); 선(g, [146, 106, 72]); g.stroke();
    g.restore();
  }
};
const 돌 = (g, c) => {
  g.beginPath(); g.ellipse(0, 0.06, 0.38, 0.24, 0, 0, 7);
  g.fillStyle = 색([168, 162, 154]); g.fill(); 선(g, [168, 162, 154]); g.stroke();
};
const 가방 = (g, c) => {
  g.beginPath(); g.rect(-0.32, -0.16, 0.64, 0.46);
  g.fillStyle = 색(c); g.fill(); 선(g, c); g.stroke();
  g.beginPath(); g.arc(0, -0.16, 0.18, Math.PI, 0);
  g.stroke();
};
const 우산 = (g, c) => {
  g.beginPath(); g.arc(0, 0.02, 0.42, Math.PI, 0);
  g.fillStyle = 색(c); g.fill(); 선(g, c); g.stroke();
  g.strokeStyle = "rgba(90,80,70,0.8)"; g.lineWidth = 0.05;
  g.beginPath(); g.moveTo(0, 0.02); g.lineTo(0, 0.44); g.stroke();
};
const 네모 = (g, c) => {
  g.beginPath(); g.roundRect(-0.36, -0.36, 0.72, 0.72, 0.1);
  g.fillStyle = 색(c); g.fill(); 선(g, c); g.stroke();
};

export const PROPS = {
  "공":     { ko: "공", fn: 공 },
  "상자":   { ko: "상자", fn: 상자 },
  "선물":   { ko: "선물 상자", fn: 선물 },
  "사과":   { ko: "사과", fn: 사과 },
  "별":     { ko: "별", fn: 별 },
  "하트":   { ko: "하트", fn: 하트 },
  "꽃":     { ko: "꽃", fn: 꽃 },
  "풍선":   { ko: "풍선", fn: 풍선 },
  "책":     { ko: "책", fn: 책 },
  "컵":     { ko: "컵", fn: 컵 },
  "고구마": { ko: "고구마", fn: 고구마 },
  "장작":   { ko: "장작", fn: 장작 },
  "돌":     { ko: "돌", fn: 돌 },
  "가방":   { ko: "가방", fn: 가방 },
  "우산":   { ko: "우산", fn: 우산 },
  "네모":   { ko: "네모 (모르는 이름일 때)", fn: 네모 },
};
export const PROP_NAMES = Object.keys(PROPS);
export const propWords = () => Object.entries(PROPS).map(([k, v]) => `${k} (${v.ko})`);

/** 이름에서 어떤 소품인지 알아본다 (못 알아보면 네모) */
export function readProp(name) {
  const 글 = String(name || "").replace(/\s/g, "");
  const key = PROP_NAMES.find(k => k !== "네모" && 글.includes(k));
  return { 이름: String(name || ""), 종류: key || "네모", 알아봄: !!key, 색: 씨앗색(글) };
}

/**
 * 소품 하나를 그린다.
 * @param ctx 캔버스
 * @param box {x,y,w,h} 화면
 * @param name 소품 이름
 * @param 자리 {x, y} 0~1 화면 비율 (발밑이 아니라 **가운데**)
 * @param 크기 화면 짧은 변 대비 지름 비율
 * @param 각도 도
 */
export function drawProp(ctx, box, name, 자리, 크기 = 0.16, 각도 = 0, opt = {}) {
  const cfg = readProp(name);
  const S = Math.min(box.w, box.h) * 크기;
  ctx.save();
  ctx.translate(box.x + 자리.x * box.w, box.y + 자리.y * box.h);
  if (각도) ctx.rotate(각도 * Math.PI / 180);
  ctx.scale(S, S);
  ctx.lineJoin = ctx.lineCap = "round";
  try { (PROPS[cfg.종류] || PROPS["네모"]).fn(ctx, opt.색 || cfg.색); } catch {}
  ctx.restore();
  return cfg;
}
