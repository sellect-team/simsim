/* 🐾 자동 캐릭터 — 그림이 없어도 이름만으로 배우를 세워 준다.
 *
 * 만드는 것은 **그냥 그림 한 장**이다. 그래서 올린 그림과 똑같은 길을 탄다 —
 * 얼굴 찾기가 눈·입을 잡아 주고, 표정·동작·눈물이 그대로 붙는다.
 * 나중에 진짜 그림을 올리면 자산 창고가 그쪽을 먼저 집으므로 자동으로 교체된다.
 *
 * 이름에서 동물을 알아본다: "누렁이 강아지" → 개, "냥이" → 고양이.
 * 못 알아보면 이름을 숫자로 바꿔 종류와 색을 고른다 (같은 이름이면 언제나 같은 모습).
 */

import { DEFAULT_PARTS } from "./face.js";

const KINDS = {
  개:   { 말: ["강아지", "개", "댕댕", "멍멍", "누렁", "바둑"], 귀: "처짐", 주둥이: 1, 꼬리: "짧음" },
  고양이: { 말: ["고양이", "냥이", "야옹", "냐옹", "나비"], 귀: "뾰족", 주둥이: 0.8, 꼬리: "긺", 수염: 1 },
  곰:   { 말: ["곰", "베어", "반달"], 귀: "동글", 주둥이: 0.9, 꼬리: "없음", 통통: 1.12 },
  토끼: { 말: ["토끼", "토깽", "래빗"], 귀: "긺", 주둥이: 0.7, 꼬리: "동글" },
  여우: { 말: ["여우", "폭스"], 귀: "뾰족", 주둥이: 1.15, 꼬리: "복슬" },
  돼지: { 말: ["돼지", "꿀꿀", "피그"], 귀: "삼각", 주둥이: 0.75, 꼬리: "돌돌", 통통: 1.15 },
  병아리: { 말: ["병아리", "새", "닭", "오리", "짹짹", "참새"], 귀: "없음", 부리: 1, 꼬리: "깃" },
  쥐:   { 말: ["쥐", "생쥐", "찍찍", "햄스터"], 귀: "큰동글", 주둥이: 0.9, 꼬리: "가늚", 수염: 1 },
  호랑이: { 말: ["호랑이", "범", "타이거"], 귀: "동글", 주둥이: 1, 꼬리: "긺", 줄무늬: 1 },
  사람: { 말: ["아이", "소년", "소녀", "사람", "아저씨", "아줌마", "학생"], 귀: "옆", 주둥이: 0, 머리카락: 1 },
};
const KIND_KEYS = Object.keys(KINDS);

/* 파스텔 몸 색 — 어느 것을 골라도 자막·배경과 부딪히지 않는다 */
const COATS = [
  [238, 206, 158], [244, 226, 206], [212, 226, 240], [232, 208, 226],
  [214, 232, 208], [246, 222, 174], [206, 216, 236], [240, 214, 196],
  [196, 220, 214], [236, 196, 186],
];

function 씨앗(글) {
  let h = 2166136261;
  for (let i = 0; i < String(글).length; i++) {
    h ^= String(글).charCodeAt(i); h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const 어둡게 = (c, k) => c.map(v => Math.round(v * (1 - k)));
const 밝게 = (c, k) => c.map(v => Math.round(v + (255 - v) * k));
const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;

/** 이름 → 어떤 동물을 어떤 색으로 그릴지 */
export function readCharacter(name) {
  const 글 = String(name || "").replace(/\s/g, "");
  const s = 씨앗(글 || "배우");
  let 종류 = KIND_KEYS.find(k => KINDS[k].말.some(w => 글.includes(w)));
  const 알아봄 = !!종류;
  if (!종류) 종류 = KIND_KEYS[s % KIND_KEYS.length];
  return {
    종류, 알아봄, 이름: String(name || ""),
    몸: COATS[(s >>> 8) % COATS.length],
    설정: KINDS[종류],
  };
}

/**
 * 캐릭터 그림 한 장을 만든다 (배경은 투명).
 * @returns {HTMLCanvasElement} 올린 그림과 똑같이 쓸 수 있다
 */
export function drawAutoCharacter(name, size = 512) {
  const cfg = readCharacter(name);
  const K = cfg.설정;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const S = size;
  const 몸색 = cfg.몸;
  const 선 = 어둡게(몸색, 0.55);
  const 배 = 밝게(몸색, 0.45);
  const 통통 = K.통통 || 1;

  g.lineWidth = S * 0.016;
  g.strokeStyle = rgb(선);
  g.lineJoin = g.lineCap = "round";

  const cx = S * 0.5;
  const 머리r = S * 0.19;
  const 머리y = S * 0.32;
  const 몸y = S * 0.62, 몸w = S * 0.17 * 통통, 몸h = S * 0.19;

  const 칠 = (색) => { g.fillStyle = rgb(색); g.fill(); g.stroke(); };

  /* ── 꼬리 (몸 뒤) ── */
  if (K.꼬리 && K.꼬리 !== "없음") {
    g.beginPath();
    if (K.꼬리 === "복슬") {
      g.ellipse(cx + 몸w * 1.15, 몸y + 몸h * 0.2, S * 0.075, S * 0.05, -0.5, 0, 7);
    } else if (K.꼬리 === "긺") {
      g.moveTo(cx + 몸w * 0.8, 몸y + 몸h * 0.3);
      g.quadraticCurveTo(cx + 몸w * 2.1, 몸y - S * 0.02, cx + 몸w * 1.7, 몸y - S * 0.12);
      g.lineWidth = S * 0.03; g.stroke(); g.lineWidth = S * 0.016;
    } else if (K.꼬리 === "가늚") {
      g.moveTo(cx + 몸w * 0.8, 몸y + 몸h * 0.4);
      g.quadraticCurveTo(cx + 몸w * 2.3, 몸y + 몸h * 0.3, cx + 몸w * 1.9, 몸y - S * 0.05);
      g.lineWidth = S * 0.012; g.stroke(); g.lineWidth = S * 0.016;
    } else if (K.꼬리 === "돌돌") {
      g.arc(cx + 몸w * 1.1, 몸y + 몸h * 0.1, S * 0.028, 0, 5);
      g.lineWidth = S * 0.018; g.stroke(); g.lineWidth = S * 0.016;
    } else {
      g.ellipse(cx + 몸w * 1.0, 몸y + 몸h * 0.15, S * 0.045, S * 0.04, 0, 0, 7);
    }
    if (K.꼬리 === "복슬" || K.꼬리 === "짧음" || K.꼬리 === "동글" || K.꼬리 === "깃") 칠(몸색);
  }

  /* ── 다리 ── */
  for (const s of [-1, 1]) {
    g.beginPath();
    g.roundRect(cx + s * 몸w * 0.52 - S * 0.045, 몸y + 몸h * 0.6, S * 0.09, S * 0.13, S * 0.045);
    칠(몸색);
  }
  /* ── 몸통 ── */
  g.beginPath();
  g.ellipse(cx, 몸y, 몸w, 몸h, 0, 0, 7);
  칠(몸색);
  g.beginPath();                                   // 배 (밝은 부분)
  g.ellipse(cx, 몸y + 몸h * 0.18, 몸w * 0.6, 몸h * 0.62, 0, 0, 7);
  g.fillStyle = rgb(배); g.fill();

  if (K.줄무늬) {                                   // 호랑이 줄
    g.save();
    g.beginPath(); g.ellipse(cx, 몸y, 몸w, 몸h, 0, 0, 7); g.clip();
    g.strokeStyle = rgb(어둡게(몸색, 0.5));
    g.lineWidth = S * 0.02;
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(cx + i * 몸w * 0.5 - 몸w * 0.2, 몸y - 몸h);
      g.lineTo(cx + i * 몸w * 0.5 + 몸w * 0.1, 몸y + 몸h);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = rgb(선); g.lineWidth = S * 0.016;
  }

  /* ── 팔 ── */
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + s * 몸w * 0.95, 몸y - 몸h * 0.05, S * 0.045, S * 0.062, s * 0.25, 0, 7);
    칠(몸색);
  }

  /* ── 귀 (머리 뒤) ── */
  const 귀 = K.귀;
  if (귀 && 귀 !== "없음") {
    for (const s of [-1, 1]) {
      g.beginPath();
      if (귀 === "뾰족") {
        g.moveTo(cx + s * 머리r * 0.62, 머리y - 머리r * 0.72);
        g.lineTo(cx + s * 머리r * 1.02, 머리y - 머리r * 1.5);
        g.lineTo(cx + s * 머리r * 0.12, 머리y - 머리r * 1.02);
      } else if (귀 === "삼각") {
        g.moveTo(cx + s * 머리r * 0.5, 머리y - 머리r * 0.8);
        g.lineTo(cx + s * 머리r * 1.0, 머리y - 머리r * 1.15);
        g.lineTo(cx + s * 머리r * 0.95, 머리y - 머리r * 0.6);
      } else if (귀 === "긺") {
        g.ellipse(cx + s * 머리r * 0.42, 머리y - 머리r * 1.35, 머리r * 0.2, 머리r * 0.62,
                  s * 0.16, 0, 7);
      } else if (귀 === "큰동글") {
        g.ellipse(cx + s * 머리r * 0.86, 머리y - 머리r * 0.68, 머리r * 0.42, 머리r * 0.42, 0, 0, 7);
      } else if (귀 === "처짐") {
        g.ellipse(cx + s * 머리r * 1.02, 머리y - 머리r * 0.02, 머리r * 0.3, 머리r * 0.5,
                  s * 0.3, 0, 7);
      } else if (귀 === "옆") {
        g.ellipse(cx + s * 머리r * 1.0, 머리y + 머리r * 0.1, 머리r * 0.13, 머리r * 0.22, 0, 0, 7);
      } else {                                       // 동글
        g.ellipse(cx + s * 머리r * 0.9, 머리y - 머리r * 0.82, 머리r * 0.34, 머리r * 0.34, 0, 0, 7);
      }
      g.closePath();
      칠(귀 === "긺" || 귀 === "처짐" ? 몸색 : 몸색);
      if (귀 === "긺" || 귀 === "큰동글" || 귀 === "뾰족") {     // 귀 안쪽
        g.beginPath();
        if (귀 === "긺") g.ellipse(cx + s * 머리r * 0.42, 머리y - 머리r * 1.35, 머리r * 0.1,
                                    머리r * 0.42, s * 0.16, 0, 7);
        else g.ellipse(cx + s * 머리r * (귀 === "뾰족" ? 0.66 : 0.86),
                       머리y - 머리r * (귀 === "뾰족" ? 0.95 : 0.68),
                       머리r * 0.18, 머리r * 0.22, 0, 0, 7);
        g.fillStyle = "rgba(240,170,180,0.85)"; g.fill();
      }
    }
  }

  /* ── 머리 ── */
  g.beginPath();
  g.arc(cx, 머리y, 머리r, 0, 7);
  칠(몸색);

  if (K.머리카락) {
    g.beginPath();
    g.arc(cx, 머리y - 머리r * 0.16, 머리r * 1.01, Math.PI * 1.08, Math.PI * 1.92);
    g.fillStyle = rgb(어둡게(몸색, 0.62)); g.fill();
  }

  /* ── 주둥이 · 부리 ── */
  const 입y = 머리y + 머리r * 0.36;
  if (K.부리) {
    g.beginPath();
    g.moveTo(cx - 머리r * 0.2, 입y);
    g.lineTo(cx + 머리r * 0.2, 입y);
    g.lineTo(cx, 입y + 머리r * 0.24);
    g.closePath();
    g.fillStyle = "rgb(246,190,96)"; g.fill(); g.stroke();
  } else if (K.주둥이) {
    g.beginPath();
    g.ellipse(cx, 입y + 머리r * 0.06, 머리r * 0.42 * K.주둥이, 머리r * 0.3 * K.주둥이, 0, 0, 7);
    g.fillStyle = rgb(밝게(몸색, 0.5)); g.fill();
    // 코
    g.beginPath();
    g.ellipse(cx, 입y - 머리r * 0.04, 머리r * 0.11, 머리r * 0.085, 0, 0, 7);
    g.fillStyle = rgb(어둡게(몸색, 0.7)); g.fill();
    // 입 (ω)
    g.beginPath();
    g.moveTo(cx, 입y + 머리r * 0.04);
    g.quadraticCurveTo(cx - 머리r * 0.13, 입y + 머리r * 0.22, cx - 머리r * 0.2, 입y + 머리r * 0.06);
    g.moveTo(cx, 입y + 머리r * 0.04);
    g.quadraticCurveTo(cx + 머리r * 0.13, 입y + 머리r * 0.22, cx + 머리r * 0.2, 입y + 머리r * 0.06);
    g.lineWidth = S * 0.011; g.strokeStyle = rgb(어둡게(몸색, 0.7)); g.stroke();
    g.lineWidth = S * 0.016; g.strokeStyle = rgb(선);
  }

  /* ── 눈 — 얼굴 찾기가 확실히 집도록 크고 진하게 ── */
  const 눈y = 머리y - 머리r * 0.1;
  const 눈x = 머리r * 0.42;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + s * 눈x, 눈y, 머리r * 0.15, 머리r * 0.19, 0, 0, 7);
    g.fillStyle = "#241d22"; g.fill();
    g.beginPath();                                  // 눈빛
    g.arc(cx + s * 눈x + 머리r * 0.05, 눈y - 머리r * 0.07, 머리r * 0.05, 0, 7);
    g.fillStyle = "rgba(255,255,255,0.9)"; g.fill();
  }
  if (K.수염) {
    g.strokeStyle = rgb(어둡게(몸색, 0.45));
    g.lineWidth = S * 0.008;
    for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(cx + s * 머리r * 0.35, 입y + i * 머리r * 0.07);
      g.lineTo(cx + s * 머리r * 0.95, 입y + i * 머리r * 0.16 - 머리r * 0.04);
      g.stroke();
    }
  }
  /* 볼 */
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + s * 머리r * 0.72, 머리y + 머리r * 0.28, 머리r * 0.15, 머리r * 0.1, 0, 0, 7);
    g.fillStyle = "rgba(244,158,164,0.5)"; g.fill();
  }

  c.dataset && (c.dataset.auto = "1");
  return c;
}

/** 자동 캐릭터는 어디에 눈·입을 그렸는지 **우리가 안다.**
    그래서 얼굴 찾기를 돌릴 필요 없이 자리를 그대로 알려 준다 (더 정확하고 더 빠르다). */
export function autoParts(name) {
  const K = readCharacter(name).설정;
  const p = DEFAULT_PARTS("front");
  const 머리r = 0.19, 머리y = 0.32, cx = 0.5;
  const 눈y = 머리y - 머리r * 0.1, 눈x = 머리r * 0.42;
  const 입y = 머리y + 머리r * 0.36;
  const 놓기 = (k, x, y, r, on = true) => {
    if (!p[k]) return;
    p[k].x = x; p[k].y = y; p[k].r = r; p[k].on = on;
  };
  놓기("head", cx, 머리y, 머리r * 1.02);
  놓기("eyeL", cx - 눈x, 눈y, 머리r * 0.2);
  놓기("eyeR", cx + 눈x, 눈y, 머리r * 0.2);
  놓기("nose", cx, 입y - 머리r * 0.04, 머리r * 0.13, !!K.주둥이);
  놓기("mouth", cx, 입y + 머리r * 0.12, 머리r * 0.24);
  놓기("cheekL", cx - 머리r * 0.72, 머리y + 머리r * 0.28, 머리r * 0.16, false);
  놓기("cheekR", cx + 머리r * 0.72, 머리y + 머리r * 0.28, 머리r * 0.16, false);
  놓기("body", cx, 0.62, 0.19);
  놓기("hip", cx, 0.72, 0.12);
  // 귀 — 종류마다 자리가 다르다
  const 귀자리 = { 긺: [0.42, -1.35, 0.62], 처짐: [1.02, -0.02, 0.42], 큰동글: [0.86, -0.68, 0.42],
                   뾰족: [0.6, -1.05, 0.4], 삼각: [0.75, -0.9, 0.35], 옆: [1.0, 0.1, 0.18] };
  const [ex, ey, er] = 귀자리[K.귀] || [0.78, -0.74, 0.34];
  놓기("earL", cx - 머리r * ex, 머리y + 머리r * ey, 머리r * er, K.귀 !== "없음");
  놓기("earR", cx + 머리r * ex, 머리y + 머리r * ey, 머리r * er, K.귀 !== "없음");
  놓기("tail", cx + 0.11, 0.6, 0.05, !!(K.꼬리 && K.꼬리 !== "없음"));
  return p;
}

/** 사전 화면용 — 어떤 동물 낱말을 알아듣는가 */
export const CHARACTER_WORDS = () =>
  Object.entries(KINDS).map(([k, v]) => `${k} (${v.말.slice(0, 3).join("·")})`);
