/* ⏸ 지금은 쓰지 않습니다 — 관절(뼈대) 리깅은 나중에 따로 다시 만듭니다.
   그림 한 장에 뼈대를 얹어 팔다리를 굽히는 방식은 그림이 찢어지기 쉬워
   '캐릭터 표정' 탭에서 빠졌습니다. 표정·부위 기능은 face.js / faceedit.js 로 옮겼습니다.
   이 파일은 다시 개발할 때 참고하려고 남겨 둡니다. */
/* 🦴 2D 뼈대 리깅 — 그림 한 장에 뼈대를 얹어 팔·다리·머리를 실제로 굽힌다.

   ① 스프라이트의 불투명 영역을 삼각형 그물망으로 나누고
   ② 뼈대(몸통·머리·양팔·양다리)를 그림 비율에 맞춰 자동으로 놓은 뒤
   ③ 뼈에서 가까운 정점일수록 그 뼈를 따라가도록 가중치를 주고
   ④ 관절 각도를 시간에 따라 바꿔 삼각형을 변형해 그린다.
   (Meta AnimatedDrawings / DrawingSpinUp 이 쓰는 방식과 같은 원리) */

/* ── 보는 방향 ─────────────────────────────────────────
   정면·측면·후면은 뼈대 자리도, 보이는 부위도, 자연스러운 동작도 서로 다르다.
   그래서 방향마다 뼈대·부위·동작을 따로 들고 있는다. */
export const VIEWS = {
  front: { ko: "정면", emoji: "🙂" },
  side:  { ko: "측면", emoji: "🐕" },
  back:  { ko: "후면", emoji: "🔙" },
};
export const VIEW_KEYS = ["front", "side", "back"];

/** 좌우가 뒤집히는 짝 (후면에서는 화면상 좌우가 반대가 된다) */
export const MIRROR = {
  armL: "armR", armR: "armL", handL: "handR", handR: "handL",
  legL: "legR", legR: "legL", footL: "footR", footR: "footL",
  eyeL: "eyeR", eyeR: "eyeL", earL: "earR", earR: "earL",
  cheekL: "cheekR", cheekR: "cheekL",
};

/* ── 기본 뼈대 (0~1 상대 좌표: x는 왼쪽 0 → 오른쪽 1, y는 위 0 → 아래 1) ── */
const BASE_BONES = [
  { id: "hip",    ko: "엉덩이",   parent: null,    x: 0.50, y: 0.62 },
  { id: "chest",  ko: "가슴",     parent: "hip",   x: 0.50, y: 0.42 },
  { id: "neck",   ko: "목",       parent: "chest", x: 0.50, y: 0.30 },
  { id: "head",   ko: "머리",     parent: "neck",  x: 0.50, y: 0.12 },
  { id: "armL",   ko: "왼팔 어깨", parent: "chest", x: 0.30, y: 0.40 },
  { id: "handL",  ko: "왼손",     parent: "armL",  x: 0.20, y: 0.58 },
  { id: "armR",   ko: "오른팔 어깨", parent: "chest", x: 0.70, y: 0.40 },
  { id: "handR",  ko: "오른손",   parent: "armR",  x: 0.80, y: 0.58 },
  { id: "legL",   ko: "왼다리",   parent: "hip",   x: 0.41, y: 0.78 },
  { id: "footL",  ko: "왼발",     parent: "legL",  x: 0.40, y: 0.97 },
  { id: "legR",   ko: "오른다리", parent: "hip",   x: 0.59, y: 0.78 },
  { id: "footR",  ko: "오른발",   parent: "legR",  x: 0.60, y: 0.97 },
];

export const DEFAULT_SKELETON = (view = "front") => {
  const bones = BASE_BONES.map(b => ({ ...b }));
  const at = id => bones.find(b => b.id === id);
  if (view === "side") {
    // 옆에서 보면 좌우 팔·다리가 거의 겹친다 (가까운 쪽만 조금 앞으로)
    const x = { hip: 0.44, chest: 0.50, neck: 0.56, head: 0.60,
                armL: 0.48, handL: 0.44, armR: 0.56, handR: 0.62,
                legL: 0.40, footL: 0.36, legR: 0.50, footR: 0.54 };
    Object.entries(x).forEach(([id, v]) => { const b = at(id); if (b) b.x = v; });
  } else if (view === "back") {
    bones.forEach(b => { b.x = 1 - b.x; });      // 뒤에서 보면 좌우가 바뀐다
  }
  return { bones, view };
};

/* ── 부위 (그림 위 상대 좌표 + 크기) ──────────────────
   눈·입·귀뿐 아니라 엉덩이·꼬리까지 부위로 잡아 두면
   ① 표정을 그 자리에 얹고 ② 그 부위만 커졌다 작아졌다 흔들 수 있다. */
const BASE_PARTS = () => ({
  head:  { ko: "머리",      x: 0.50, y: 0.16, r: 0.170, on: true,  fx: "none",  amp: 1 },
  body:  { ko: "몸통",      x: 0.50, y: 0.48, r: 0.160, on: false, fx: "none",  amp: 1 },
  eyeL:  { ko: "왼쪽 눈",   x: 0.40, y: 0.22, r: 0.055, on: true,  cover: true, fx: "none", amp: 1 },
  eyeR:  { ko: "오른쪽 눈", x: 0.60, y: 0.22, r: 0.055, on: true,  cover: true, fx: "none", amp: 1 },
  mouth: { ko: "입",        x: 0.50, y: 0.30, r: 0.060, on: true,  cover: true, fx: "none", amp: 1 },
  earL:  { ko: "왼쪽 귀",   x: 0.26, y: 0.16, r: 0.075, on: true,  fx: "none",  amp: 1 },
  earR:  { ko: "오른쪽 귀", x: 0.74, y: 0.16, r: 0.075, on: true,  fx: "none",  amp: 1 },
  cheekL:{ ko: "왼쪽 볼",   x: 0.34, y: 0.28, r: 0.045, on: false, fx: "none",  amp: 1 },
  cheekR:{ ko: "오른쪽 볼", x: 0.66, y: 0.28, r: 0.045, on: false, fx: "none",  amp: 1 },
  hip:   { ko: "엉덩이",    x: 0.50, y: 0.72, r: 0.110, on: true,  fx: "none",  amp: 1 },
  tail:  { ko: "꼬리",      x: 0.50, y: 0.72, r: 0.070, on: false, fx: "none",  amp: 1 },
});

export const DEFAULT_PARTS = (view = "front") => {
  const p = BASE_PARTS();
  if (view === "side") {
    // 옆모습: 가까운 쪽 눈·귀·볼만 보이고, 꼬리는 뒤쪽에 크게 보인다
    p.eyeL.on = false; p.earL.on = false; p.cheekL.on = false;
    p.eyeR.x = 0.66; p.eyeR.y = 0.20;
    p.earR.x = 0.55; p.earR.y = 0.12;
    p.cheekR.x = 0.70; p.cheekR.y = 0.26;
    p.mouth.x = 0.80; p.mouth.y = 0.26;
    p.head.x = 0.68; p.head.y = 0.18;
    p.body.x = 0.44; p.body.y = 0.50;
    p.hip.x = 0.30; p.hip.y = 0.66;
    p.tail.x = 0.14; p.tail.y = 0.58; p.tail.r = 0.090; p.tail.on = true;
  } else if (view === "back") {
    // 뒷모습: 눈·입은 안 보이고, 꼬리가 한가운데 있다
    p.eyeL.on = false; p.eyeR.on = false; p.mouth.on = false;
    p.cheekL.on = false; p.cheekR.on = false;
    p.earL.x = 0.26; p.earR.x = 0.74;
    p.hip.x = 0.50; p.hip.y = 0.68; p.hip.r = 0.130;
    p.tail.x = 0.50; p.tail.y = 0.62; p.tail.r = 0.085; p.tail.on = true;
  } else {
    p.tail.x = 0.50; p.tail.y = 0.86; p.tail.r = 0.060;   // 정면에서는 다리 사이로 살짝
  }
  return p;
};
/** 예전 저장본과의 호환 (얼굴 부위 = 부위) */
export const DEFAULT_FACE = DEFAULT_PARTS;

/* ── 부위별 움직임 ─────────────────────────────────────
   그 부위 둘레만 커졌다 작아졌다 / 흔들리게 한다.
   보는 방향에 따라 흔들리는 방향이 달라진다 (옆에서 본 꼬리는 위아래로 크게,
   앞·뒤에서 본 꼬리는 좌우로 크게 흔들린다). */
/* 모르는 시점(포즈 이름 등)이 들어와도 죽지 않게 — face.js 와 같은 이유 */
const AXIS = { front: { x: 1, y: 0.45 }, side: { x: 0.45, y: 1 }, back: { x: 1, y: 0.45 } };
const 축 = v => AXIS[v] || AXIS.front;

/* 흔들리는 부위(꼬리·귀)는 뿌리는 거의 안 움직이고 끝으로 갈수록 크게,
   게다가 조금 늦게 따라 움직여야 채찍처럼 자연스럽다.
   그래서 `wave` 효과는 정점마다 '뿌리에서 얼마나 멀리 있는지(s)'를 받아 각도를 달리 준다. */
export const PART_EFFECTS = {
  none:   { ko: "없음", fn: () => null },
  pulse:  { ko: "커졌다 작아졌다",
            fn: (t, a) => ({ scale: 1 + Math.sin(t * 3) * 0.18 * a }) },
  grow:   { ko: "점점 커지기",
            fn: (t, a) => ({ scale: 1 + (1 - Math.cos(Math.min(Math.PI, t * 1.2))) / 2 * 0.45 * a }) },
  heart:  { ko: "두근두근",
            fn: (t, a) => { const p = (t * 1.6) % 1;
                            const beat = Math.exp(-p * 9) + Math.exp(-Math.abs(p - 0.22) * 14);
                            return { scale: 1 + beat * 0.16 * a }; } },
  wag:    { ko: "살랑살랑 흔들기", wave: true,
            fn: (t, a, v, s) => ({ rot: Math.sin(t * 7 - s * 1.5) * 34 * a * s * (v === "side" ? 0.6 : 1),
                                   dy: v === "side" ? Math.sin(t * 7 - s * 1.5) * 0.022 * a * s : 0 }) },
  swish:  { ko: "신나서 세게 흔들기", wave: true,
            fn: (t, a, v, s) => ({ rot: Math.sin(t * 12 - s * 2.2) * 52 * a * s,
                                   dy: v === "side" ? Math.sin(t * 12 - s * 2.2) * 0.03 * a * s : 0,
                                   scale: 1 + Math.abs(Math.sin(t * 12)) * 0.04 * a * s }) },
  curl:   { ko: "말았다 폈다", wave: true,
            fn: (t, a, v, s) => ({ rot: (0.5 - Math.cos(t * 2) / 2) * 90 * a * s * s }) },
  droop:  { ko: "축 처지기", wave: true,
            fn: (t, a, v, s) => ({ rot: -8 * a * s + Math.sin(t * 1.6 - s) * 4 * a * s,
                                   dy: 0.03 * a * s }) },
  flop:   { ko: "펄럭이기", wave: true,
            fn: (t, a, v, s) => ({ rot: Math.sin(t * 2.6 - s * 1.2) * 18 * a * s * (v === "side" ? 0.6 : 1),
                                   dy: Math.sin(t * 2.6 - s * 1.2) * 0.012 * a * s }) },
  perk:   { ko: "쫑긋 세우기", wave: true,
            fn: (t, a, v, s) => { const up = 0.5 - Math.cos(Math.min(Math.PI, t * 3)) / 2;
                                  return { rot: -up * 22 * a * s, dy: -up * 0.02 * a * s }; } },
  wiggle: { ko: "씰룩씰룩",
            fn: (t, a, v) => ({ dx: Math.sin(t * 4) * 0.016 * a * 축(v).x,
                                dy: Math.cos(t * 4) * 0.010 * a * 축(v).y,
                                scale: 1 + Math.sin(t * 8) * 0.05 * a }) },
  bounce: { ko: "통통 튀기",
            fn: (t, a) => ({ dy: -Math.abs(Math.sin(t * 5)) * 0.035 * a }) },
  shiver: { ko: "부들부들",
            fn: (t, a) => ({ dx: Math.sin(t * 30) * 0.005 * a,
                             dy: Math.cos(t * 26) * 0.005 * a }) },
  squash: { ko: "납작·길쭉",
            fn: (t, a) => ({ sx: 1 + Math.sin(t * 3) * 0.14 * a,
                             sy: 1 - Math.sin(t * 3) * 0.14 * a }) },
};

/**
 * 부위 움직임을 뼈대로 변형된 정점 위에 덧입힌다.
 *  - '어느 정점이 그 부위인지'는 원래 그림(mesh.verts)으로 판단하고
 *  - 실제 이동량은 변형된 좌표(dst)에 더한다 → 팔다리가 움직여도 부위가 따라간다.
 * @param mesh buildMesh 결과, @param dst deform 결과(제자리에서 고침)
 * @param parts 부위 목록, @param t 초, @param view front|side|back
 * @param extra 동작이 지정한 부위 효과 {tail:"wag"} — 부위 설정보다 우선
 */
export function applyPartEffects(mesh, dst, parts, t, view = "front", extra) {
  if (!parts) return dst;
  for (const [k, p] of Object.entries(parts)) {
    if (!p || p.on === false) continue;
    // 부위에 직접 고른 움직임이 있으면 그게 우선, 없으면 동작이 정해 준 움직임
    const kind = (p.fx && p.fx !== "none") ? p.fx : ((extra && extra[k]) || "none");
    const eff = PART_EFFECTS[kind];
    if (!eff || kind === "none") continue;
    const amp = p.amp ?? 1;
    const R = Math.max(0.02, p.r * 2.4);         // 부위 반지름보다 조금 넓게 번지게
    /* 흔드는 효과는 '뿌리'를 축으로 돈다. 뿌리는 자동 인식이 찾아 둔 몸에 붙은 자리(ax,ay),
       없으면 부위 중심에서 반대편으로 잡는다. */
    const ax = eff.wave ? (p.ax ?? p.x) : p.x;
    const ay = eff.wave ? (p.ay ?? p.y) : p.y;
    const axis = Math.max(0.02, eff.wave ? Math.hypot(p.x - ax, p.y - ay) * 2 || R : R);
    const flat = eff.wave ? null : (eff.fn(t, amp, view) || null);
    if (!eff.wave && !flat) continue;

    for (let i = 0; i < mesh.verts.length; i++) {
      const s = mesh.verts[i];
      if (Math.hypot(s.u - p.x, s.v - p.y) > R) continue;
      const dx = s.u - ax, dy = s.v - ay;
      const d = Math.hypot(s.u - p.x, s.v - p.y);
      const q = d / R;
      const w = (1 - q * q) * (1 - q * q);       // 가운데는 세게, 가장자리는 0으로 부드럽게
      // 뿌리에서 얼마나 멀리 있는 살인가 (0=뿌리, 1=끝) → 끝일수록 크게, 조금 늦게 움직인다
      const e = eff.wave ? eff.fn(t, amp, view, Math.min(1, Math.hypot(dx, dy) / axis)) : flat;
      if (!e) continue;
      const sx = e.sx ?? e.scale ?? 1, sy = e.sy ?? e.scale ?? 1;
      const rot = (e.rot || 0) * Math.PI / 180;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      // 원래 그림 기준으로 '얼마나 움직여야 하는지'를 구해 변형된 좌표에 더한다
      const nx = (dx * sx) * cos - (dy * sy) * sin;
      const ny = (dx * sx) * sin + (dy * sy) * cos;
      dst[i].u += w * (nx - dx + (e.dx || 0));
      dst[i].v += w * (ny - dy + (e.dy || 0));
    }
  }
  return dst;
}

/* ── 표정 — 눈·입 위에 덧그리는 그림 (그림 파일 없이 코드로 그린다) ── */
export const EXPRESSIONS = {
  none:     { ko: "그대로", eye: null, mouth: null },
  blink:    { ko: "눈 깜빡임", eye: "closed", blink: true },
  closed:   { ko: "눈 감기", eye: "closed" },
  happy:    { ko: "웃는 눈 (^^)", eye: "arc" },
  heart:    { ko: "하트 눈 (♥♥)", eye: "heart" },
  star:     { ko: "반짝 눈 (★★)", eye: "star" },
  surprised:{ ko: "놀란 눈 (◉◉)", eye: "big", mouth: "o" },
  angry:    { ko: "화난 눈", eye: "angry", mouth: "frown" },
  sad:      { ko: "슬픈 눈", eye: "sad", mouth: "frown" },
  cry:      { ko: "눈물 흘리기", eye: "closed", tear: true, mouth: "frown" },
  cryOpen:  { ko: "펑펑 울기", eye: "sad", tear: true, tearBig: true, mouth: "o" },
  wink:     { ko: "윙크", eye: "wink" },
  dizzy:    { ko: "어질어질 (@@)", eye: "dizzy" },
  smile:    { ko: "활짝 웃기", mouth: "smile" },
  talk:     { ko: "말하기", mouth: "talk" },
  blush:    { ko: "볼 빨개짐", cheek: true },
};

function eyeShape(ctx, kind, x, y, r, t, side) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "#2b2119"; ctx.fillStyle = "#2b2119";
  ctx.lineWidth = Math.max(1.5, r * 0.34);
  const R = r;
  if (kind === "closed" || (kind === "wink" && side < 0)) {
    ctx.beginPath(); ctx.arc(0, 0, R * 0.9, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  } else if (kind === "arc") {
    ctx.beginPath(); ctx.arc(0, R * 0.5, R * 0.95, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  } else if (kind === "heart") {
    ctx.fillStyle = "#e8556d";
    ctx.beginPath();
    ctx.moveTo(0, R * 0.85);
    ctx.bezierCurveTo(-R * 1.5, -R * 0.2, -R * 0.6, -R * 1.2, 0, -R * 0.35);
    ctx.bezierCurveTo(R * 0.6, -R * 1.2, R * 1.5, -R * 0.2, 0, R * 0.85);
    ctx.fill();
  } else if (kind === "star") {
    ctx.fillStyle = "#f2c530";
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.42 : R;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  } else if (kind === "big") {
    ctx.beginPath(); ctx.arc(0, 0, R * 1.15, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(R * 0.3, -R * 0.35, R * 0.34, 0, 7); ctx.fill();
  } else if (kind === "angry") {
    ctx.beginPath(); ctx.arc(0, R * 0.15, R * 0.8, 0, 7); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(side * -R * 1.2, -R * 1.15); ctx.lineTo(side * R * 0.9, -R * 0.45);
    ctx.stroke();
  } else if (kind === "sad") {
    ctx.beginPath(); ctx.arc(0, R * 0.1, R * 0.85, 0, 7); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(side * -R * 1.1, -R * 0.6); ctx.lineTo(side * R * 1.0, -R * 1.15);
    ctx.stroke();
  } else if (kind === "dizzy") {
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 4; a += 0.25) {
      const rr = R * (a / (Math.PI * 4));
      ctx.lineTo(Math.cos(a + t * 3) * rr, Math.sin(a + t * 3) * rr);
    }
    ctx.lineWidth = Math.max(1.2, r * 0.22); ctx.stroke();
  }
  ctx.restore();
}

function mouthShape(ctx, kind, x, y, r, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#2b2119"; ctx.fillStyle = "#8c3b3b";
  ctx.lineWidth = Math.max(1.5, r * 0.3);
  ctx.lineCap = "round";
  if (kind === "smile") {
    ctx.beginPath(); ctx.arc(0, -r * 0.2, r, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  } else if (kind === "frown") {
    ctx.beginPath(); ctx.arc(0, r * 0.9, r, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
  } else if (kind === "o") {
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.6, r * 0.85, 0, 0, 7); ctx.fill(); ctx.stroke();
  } else if (kind === "talk") {
    const open = (Math.sin(t * 11) + 1) / 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.62, r * (0.18 + open * 0.75), 0, 0, 7);
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

/* ── 💧 눈물 — 표정과 따로 켜고 끄는 애니메이션 ──────────
   눈에서 맺혀 → 흘러내리고 → 떨어져 → 튀는 것까지 시간에 따라 그린다.
   중력을 흉내 내 아래로 갈수록 빨라지고, 빨라질수록 방울이 길쭉해진다. */
export const TEARS = {
  none:   { ko: "없음" },
  well:   { ko: "글썽글썽 (고이기)" },
  roll:   { ko: "또르르 (한 방울씩)" },
  stream: { ko: "주르륵 (줄줄)" },
  burst:  { ko: "펑펑 울기 (분수처럼)" },
  drip:   { ko: "뚝뚝 (큰 방울)" },
};

/** 물방울 하나 — 위가 뾰족하고 아래가 둥근 모양, 빠를수록 길쭉해진다 */
function drop(ctx, x, y, s, stretch = 1) {
  const h = s * stretch;
  ctx.beginPath();
  ctx.moveTo(x, y - h * 1.6);
  ctx.bezierCurveTo(x + s * 1.05, y - h * 0.1, x + s * 0.78, y + s, x, y + s);
  ctx.bezierCurveTo(x - s * 0.78, y + s, x - s * 1.05, y - h * 0.1, x, y - h * 1.6);
  ctx.fill();
  // 반짝이는 점 하나
  ctx.save();
  ctx.globalAlpha *= 0.75;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(x - s * 0.3, y - h * 0.2, s * 0.22, s * 0.3, 0, 0, 7);
  ctx.fill();
  ctx.restore();
}

/** 바닥에 떨어져 튀는 물방울 */
function splash(ctx, x, y, s, p) {
  ctx.save();
  ctx.globalAlpha *= Math.max(0, 1 - p) * 0.9;
  for (let i = -1; i <= 1; i += 2) {
    const k = p * s * 3;
    ctx.beginPath();
    ctx.ellipse(x + i * k, y - k * 0.5, s * 0.28 * (1 - p), s * 0.28 * (1 - p), 0, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 눈물을 그린다 (표정과 따로 동작).
 * @param box 그릴 자리, @param parts 부위(눈 위치를 씀), @param kind TEARS 의 열쇠
 * @param t 초, @param amp 세기(1 = 보통), @param track partTracker (움직이는 눈을 따라가게)
 */
export function drawTears(ctx, box, parts, kind, t, amp = 1, track) {
  const style = TEARS[kind];
  if (!style || kind === "none" || !parts) return;
  const S = Math.min(box.w, box.h);
  const eyes = ["eyeL", "eyeR"]
    .map(k => parts[k])
    .filter(p => p && p.on !== false)
    .map(p => (track ? track(p) : p));
  if (!eyes.length) return;

  ctx.save();
  ctx.fillStyle = "rgba(126,196,255,0.92)";
  for (const p of eyes) {
    const x = box.x + p.x * box.w;
    const y = box.y + p.y * box.h + p.r * S * 0.75;   // 눈 아래에서 시작
    const r = Math.max(2, p.r * S);
    const fall = box.y + box.h - y;                   // 발밑까지의 거리

    if (kind === "well") {
      // 눈가에 물이 차오르며 파르르 떨린다 (아직 안 흐름)
      const g = (Math.sin(t * 2.2) + 1) / 2;
      const s = r * (0.3 + g * 0.28) * amp;
      ctx.globalAlpha = 0.5 + g * 0.45;
      ctx.beginPath();                              // 아래 눈꺼풀에 고이는 물
      ctx.ellipse(x + Math.sin(t * 22) * r * 0.05, y + r * 0.3, s * 1.5, s * 0.72, 0, 0, 7);
      ctx.fill();
      ctx.save();                                   // 물빛 반짝임
      ctx.globalAlpha *= 0.8; ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(x - s * 0.5, y + r * 0.2, s * 0.3, s * 0.16, 0, 0, 7);
      ctx.fill();
      ctx.restore();
      if (g > 0.93) drop(ctx, x, y + r * 0.9, s * 0.5, 1.4);   // 가끔 한 방울 넘친다
      continue;
    }
    if (kind === "stream") {
      // 볼을 타고 끊이지 않는 물줄기 + 끝에서 방울이 떨어진다
      const wob = v => Math.sin(t * 3 + v * 9) * r * 0.14;
      const len = Math.min(fall * 0.75, r * 9) * (0.7 + amp * 0.3);
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.26, y);
      for (let v = 0; v <= 1.001; v += 0.1) ctx.lineTo(x - r * 0.26 + wob(v), y + len * v);
      for (let v = 1; v >= -0.001; v -= 0.1) ctx.lineTo(x + r * 0.26 + wob(v), y + len * v);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.95;
      for (let i = 0; i < 2; i++) {
        const q = (t * 1.5 + i * 0.5) % 1;
        drop(ctx, x + wob(1), y + len + q * q * fall * 0.5, r * 0.34 * amp, 1 + q * 2.2);
      }
      continue;
    }
    if (kind === "burst") {
      // 만화처럼 양옆으로 뿜어져 나가는 눈물
      const n = 6;
      const side = p.x < 0.5 ? -1 : 1;
      for (let i = 0; i < n; i++) {
        const q = (t * 1.5 + i / n) % 1;
        const spread = 0.55 + (i % 3) * 0.4;        // 방울마다 튀는 각도가 조금씩 다르다
        const dx = side * r * 6 * q * spread * amp;
        const dy = (-r * 3.2 * q + r * 12 * q * q) * amp;   // 위로 솟았다 포물선으로 떨어진다
        ctx.globalAlpha = Math.max(0, 1 - q * 0.85);
        drop(ctx, x + dx, y + dy, r * (0.5 - (i % 3) * 0.07) * amp, 1 + q * 1.5);
      }
      continue;
    }
    // roll(또르르) · drip(뚝뚝) — 한 방울씩 맺혔다 떨어지고 마지막에 톡 튄다
    const big = kind === "drip";
    const n = big ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const q = (t * (big ? 0.8 : 1.15) + i / n) % 1;
      const hold = 0.22;                              // 처음엔 눈가에 맺혀 있는다
      const s = r * (big ? 0.5 : 0.34) * amp;
      if (q < hold) {
        ctx.globalAlpha = q / hold;
        drop(ctx, x, y, s * (0.5 + q / hold * 0.5), 1);
        continue;
      }
      const f = (q - hold) / (1 - hold);              // 0→1 떨어지는 동안
      const dy = f * f * fall * (big ? 0.9 : 0.72);
      ctx.globalAlpha = 1;
      if (f > 0.92) { splash(ctx, x, y + dy, s, (f - 0.92) / 0.08); continue; }
      drop(ctx, x + Math.sin(t * 4 + i) * r * 0.08, y + dy, s * (1 - f * 0.2), 1 + f * 2.4);
    }
  }
  ctx.restore();
}

/** 원래 그려져 있던 눈·입을 주변 살색으로 덮는다 (표정을 갈아끼우기 위해) */
function coverPart(ctx, p, x, y, r, scale) {
  const col = p.coverColor || "#f6d5a5";
  ctx.save();
  const rr = r * (p.coverScale || 1.35);
  // 가운데는 진하게, 가장자리는 투명하게 → 경계가 티나지 않는다
  const g = ctx.createRadialGradient(x, y, rr * 0.25, x, y, rr);
  g.addColorStop(0, col);
  g.addColorStop(0.72, col);
  g.addColorStop(1, col + "00");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rr * 1.25, rr, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 부위가 실제로 어디로 옮겨졌는지 따라가는 자 (표정이 움직이는 몸을 따라가게) */
export function partTracker(mesh, dst) {
  if (!mesh || !dst) return null;
  return p => {
    const R = Math.max(0.03, p.r * 2);
    const near = [];
    let dx = 0, dy = 0, r0 = 0;
    for (let i = 0; i < mesh.verts.length; i++) {
      const s = mesh.verts[i];
      const d = Math.hypot(s.u - p.x, s.v - p.y);
      if (d > R) continue;
      near.push(i);
      dx += dst[i].u - s.u; dy += dst[i].v - s.v; r0 += d;
    }
    const n = near.length;
    if (!n) return p;
    dx /= n; dy /= n; r0 /= n;
    const cx = p.x + dx, cy = p.y + dy;
    let r1 = 0;
    for (const i of near) r1 += Math.hypot(dst[i].u - cx, dst[i].v - cy);
    r1 /= n;
    const scale = r0 > 1e-4 ? Math.max(0.4, Math.min(2.5, r1 / r0)) : 1;
    return { ...p, x: cx, y: cy, r: p.r * scale };
  };
}

/** 얼굴 표정을 그림 위에 덧그린다. box = {x,y,w,h}, track = partTracker(선택) */
export function drawFace(ctx, box, face, exprName, t, track) {
  const e = EXPRESSIONS[exprName];
  if (!e || !face) return;
  const moved = new Map();
  const at = p => {
    if (!track) return p;
    if (!moved.has(p)) moved.set(p, track(p));
    return moved.get(p);
  };
  const P = k => face[k] && face[k].on !== false ? at(face[k]) : null;
  const px = p => box.x + p.x * box.w, py = p => box.y + p.y * box.h;
  const pr = p => p.r * Math.min(box.w, box.h);

  let eyeKind = e.eye;
  if (e.blink) eyeKind = (t % 3.2) < 0.14 ? "closed" : null;   // 가끔 깜빡

  // 표정으로 눈·입을 바꿀 때는 원래 그림을 먼저 가린다
  if (eyeKind) {
    [["eyeL"], ["eyeR"]].forEach(([k]) => {
      const p = P(k);
      if (p && p.cover !== false) coverPart(ctx, p, px(p), py(p), pr(p));
    });
  }
  if (e.mouth) {
    const p = P("mouth");
    if (p && p.cover !== false) coverPart(ctx, p, px(p), py(p), pr(p));
  }

  if (eyeKind) {
    [["eyeL", -1], ["eyeR", 1]].forEach(([k, side]) => {
      const p = P(k); if (!p) return;
      eyeShape(ctx, eyeKind, px(p), py(p), pr(p), t, side);
    });
  }
  // 우는 표정은 눈물 애니메이션을 함께 켠다 (눈물만 따로 켜고 싶으면 drawTears 를 직접 쓴다)
  if (e.tear) drawTears(ctx, box, face, e.tearBig ? "burst" : "stream", t, 1, track);
  if (e.mouth) {
    const p = P("mouth");
    if (p) mouthShape(ctx, e.mouth, px(p), py(p), pr(p), t);
  }
  if (e.cheek) {
    ctx.save();
    ctx.fillStyle = "rgba(240,120,120,0.45)";
    ["cheekL", "cheekR"].forEach(k => {
      const p = face[k] ? at(face[k]) : null; if (!p) return;
      ctx.beginPath();
      ctx.ellipse(px(p), py(p), pr(p) * 1.2, pr(p) * 0.8, 0, 0, 7);
      ctx.fill();
    });
    ctx.restore();
  }
}

/* ── 관절 애니메이션 ───────────────────────────────────
   각 동작은 뼈 각도를 도(°) 단위로 돌려 준다.
   `_x`, `_y` 는 몸 전체를 옮기는 값(0~1 그림 크기 기준) — 점프·통통 튀기에 쓴다.

   같은 '손 흔들기'라도 정면·측면·후면에서 보이는 모습이 전혀 다르므로
   동작마다 방향별 함수를 따로 둔다. 따로 적지 않은 방향은
   후면 = 정면의 좌우 대칭, 측면 = 팔다리를 앞뒤로 크게 (몸통 기울기는 줄여서) 로 자동 변환한다. */
const LIMBS = new Set(["armL", "armR", "handL", "handR", "legL", "legR", "footL", "footR"]);

/* 각도 부호 약속 — 화면 기준으로 시계 방향이 +.
   그래서 화면 오른쪽 팔·다리는 음수(−)가 '위로', 화면 왼쪽은 양수(+)가 '위로' 다.
   (부호를 반대로 쓰면 팔이 몸 안으로 파고들어 그림이 접히며 깨진다) */

/** 후면: 좌우가 뒤집히므로 짝을 바꾸고 도는 방향도 반대로 */
function mirrorAngles(a) {
  const o = {};
  for (const k in a) {
    if (k === "_y") { o._y = a._y; continue; }
    if (k === "_x") { o._x = -a._x; continue; }
    o[MIRROR[k] || k] = -a[k];
  }
  return o;
}
/** 측면: 팔다리는 앞뒤로 크게 흔들리고, 좌우로 기우는 몸통은 덜 보인다 */
function profileAngles(a) {
  const o = {};
  for (const k in a) {
    if (k === "_x" || k === "_y") { o[k] = a[k]; continue; }
    o[k] = a[k] * (LIMBS.has(k) ? 1.45 : 0.5);
  }
  return o;
}

const sin = (t, f) => Math.sin(t * f);
const cos = (t, f) => Math.cos(t * f);
/** 0~1 을 오갔다 돌아오는 값 (한 번씩 하는 동작에 쓴다) */
const pulse01 = (t, period, up = 0.35, hold = 0.25) => {
  const p = (t % period) / period;
  if (p < up) return 0.5 - Math.cos(Math.PI * (p / up)) / 2;
  if (p < up + hold) return 1;
  const d = Math.min(1, (p - up - hold) / up);
  return 0.5 + Math.cos(Math.PI * d) / 2;
};

export const RIG_MOTIONS = {
  idle: { ko: "가만히 (숨쉬기)", f: {
    front: t => ({ chest: sin(t, 1.6) * 1.5, head: sin(t, 0.9) * 2.5,
                   armL: sin(t, 1.6) * 3, armR: -sin(t, 1.6) * 3,
                   _y: -Math.abs(sin(t, 1.6)) * 0.006 }),
    side:  t => ({ chest: sin(t, 1.6) * 1.2, neck: sin(t, 1.6) * 1.5,
                   head: sin(t, 0.9) * 2, _y: -Math.abs(sin(t, 1.6)) * 0.008 }),
    back:  t => ({ chest: -sin(t, 1.6) * 1.5, head: -sin(t, 0.9) * 2.5,
                   _y: -Math.abs(sin(t, 1.6)) * 0.006 }),
  }, fx: { tail: "wag", earL: "flop", earR: "flop" } },

  wave: { ko: "손 흔들기", f: {
    // 정면: 오른손을 들어 좌우로 / 측면: 앞발 하나를 앞으로 들어 / 후면: 자동 대칭
    front: t => ({ armR: -10, handR: -95 - sin(t, 9) * 26,
                   head: sin(t, 3) * 5, chest: sin(t, 1.6) * 1.5 }),
    side:  t => ({ armR: -8, handR: -85 - sin(t, 9) * 30,
                   chest: -4, neck: -3, head: sin(t, 3) * 4,
                   _y: -Math.abs(sin(t, 1.6)) * 0.006 }),
  } },

  walk: { ko: "걷기", f: {
    // 정면: 이쪽으로 걸어오는 모습 — 다리는 조금, 몸이 위아래로 흔들린다
    front: t => ({ legL: sin(t, 6) * 12, legR: -sin(t, 6) * 12,
                   armL: -sin(t, 6) * 10, armR: sin(t, 6) * 10,
                   hip: sin(t, 6) * 3, chest: -sin(t, 6) * 2, head: sin(t, 6) * 2,
                   _x: sin(t, 6) * 0.010, _y: -Math.abs(sin(t, 6)) * 0.018 }),
    // 측면: 걸음이 가장 잘 보인다 — 앞뒤로 크게
    side:  t => ({ legL: sin(t, 6) * 30, footL: Math.max(0, -sin(t, 6)) * 26,
                   legR: -sin(t, 6) * 30, footR: Math.max(0, sin(t, 6)) * 26,
                   armL: -sin(t, 6) * 26, armR: sin(t, 6) * 26,
                   chest: 3 + cos(t, 6) * 2, head: -3,
                   _y: -Math.abs(sin(t, 6)) * 0.014 }),
    back:  t => ({ legL: -sin(t, 6) * 12, legR: sin(t, 6) * 12,
                   armL: sin(t, 6) * 10, armR: -sin(t, 6) * 10,
                   hip: -sin(t, 6) * 4, _x: -sin(t, 6) * 0.010,
                   _y: -Math.abs(sin(t, 6)) * 0.018 }),
  }, fx: { hip: "wiggle", tail: "wag" } },

  run: { ko: "달리기", f: {
    front: t => ({ legL: sin(t, 10) * 18, legR: -sin(t, 10) * 18,
                   armL: -sin(t, 10) * 20, armR: sin(t, 10) * 20,
                   chest: 5, head: -4, _x: sin(t, 10) * 0.012,
                   _y: -Math.abs(sin(t, 10)) * 0.030 }),
    side:  t => ({ legL: sin(t, 10) * 46, legR: -sin(t, 10) * 46,
                   footL: Math.max(0, -sin(t, 10)) * 34, footR: Math.max(0, sin(t, 10)) * 34,
                   armL: -sin(t, 10) * 44, armR: sin(t, 10) * 44,
                   chest: 10 + Math.abs(sin(t, 10)) * 3, head: -8,
                   _x: sin(t, 20) * 0.006, _y: -Math.abs(sin(t, 10)) * 0.034 }),
  }, fx: { tail: "swish" } },

  jump: { ko: "점프", f: {
    front: t => { const p = (t * 1.4) % 1, up = Math.sin(p * Math.PI);
      return { legL: -up * 22, legR: -up * 22, footL: up * 26, footR: up * 26,
               armL: up * 12, armR: -up * 12, handL: up * 70, handR: -up * 70,
               chest: -up * 6, _y: -up * 0.20 }; },
    side:  t => { const p = (t * 1.4) % 1, up = Math.sin(p * Math.PI);
      return { legL: -up * 26, legR: -up * 22, footL: up * 30, footR: up * 26,
               armL: -up * 10, armR: -up * 12, handL: -up * 55, handR: -up * 62,
               chest: -up * 10, head: -up * 8, _x: up * 0.05, _y: -up * 0.22 }; },
  }, fx: { tail: "wag" } },

  dance: { ko: "춤추기", f: {
    front: t => ({ hip: sin(t, 3) * 8, chest: -sin(t, 3) * 6, head: sin(t, 6) * 8,
                   armL: 10, armR: -10,
                   handL: 55 - sin(t, 6) * 40, handR: -55 + Math.sin(t * 6 + 1) * 40,
                   legL: sin(t, 3) * 12, legR: -sin(t, 3) * 12,
                   _x: sin(t, 3) * 0.02, _y: -Math.abs(sin(t, 6)) * 0.02 }),
    side:  t => ({ chest: sin(t, 3) * 10, head: -sin(t, 6) * 10, armL: -8, armR: -10,
                   handL: -60 + sin(t, 6) * 38, handR: -70 - sin(t, 6) * 38,
                   legL: sin(t, 6) * 18, legR: -sin(t, 6) * 18,
                   _y: -Math.abs(sin(t, 6)) * 0.035 }),
  }, fx: { hip: "wiggle", tail: "swish" } },

  nod: { ko: "고개 끄덕이기", f: {
    // 앞에서는 끄덕임이 잘 안 보이므로 머리를 위아래로도 조금 움직인다
    front: t => ({ head: sin(t, 3.2) * 6, neck: sin(t, 3.2) * 4,
                   _y: Math.abs(sin(t, 3.2)) * 0.012 }),
    side:  t => ({ head: sin(t, 3.2) * 20, neck: sin(t, 3.2) * 9 }),
  } },

  shake: { ko: "고개 젓기", f: {
    // 좌우로 젓는 건 정면·후면에서 잘 보인다
    front: t => ({ head: sin(t, 5) * 14, neck: sin(t, 5) * 5, _x: sin(t, 5) * 0.008 }),
    side:  t => ({ head: sin(t, 5) * 6, neck: sin(t, 5) * 3 }),
  } },

  bow: { ko: "인사(꾸벅)", f: {
    front: t => { const a = pulse01(t, 3, 0.2, 0.15);
      return { chest: a * 14, neck: a * 10, head: a * 8, _y: a * 0.05 }; },
    side:  t => { const a = pulse01(t, 3, 0.2, 0.15);
      return { chest: a * 34, neck: a * 16, head: a * 12, hip: a * 5, _y: a * 0.03 }; },
  } },

  cheer: { ko: "만세", f: {
    front: t => ({ armL: 14, armR: -14,
                   handL: 135 - sin(t, 6) * 14, handR: -135 + sin(t, 6) * 14,
                   head: sin(t, 6) * 4, chest: -Math.abs(sin(t, 3)) * 3,
                   _y: -Math.abs(sin(t, 6)) * 0.02 }),
    side:  t => ({ armL: -12, armR: -14,
                   handL: -125 + sin(t, 6) * 16, handR: -140 - sin(t, 6) * 16,
                   head: -8, chest: -6, _y: -Math.abs(sin(t, 6)) * 0.03 }),
  }, fx: { tail: "wag" } },

  stretch: { ko: "기지개", f: {
    front: t => { const a = (sin(t, 1.2) + 1) / 2;
      return { armL: a * 14, armR: -a * 14, handL: a * 115, handR: -a * 115,
               chest: -a * 8, head: -a * 6, _y: -a * 0.02 }; },
    side:  t => { const a = (sin(t, 1.2) + 1) / 2;
      return { armL: -a * 12, armR: -a * 14, handL: -a * 105, handR: -a * 120,
               chest: a * 22, hip: -a * 8, neck: -a * 20, head: -a * 10, _x: -a * 0.03 }; },
  } },

  limp: { ko: "절뚝이며 걷기", f: {
    front: t => ({ legL: sin(t, 5) * 14, legR: -sin(t, 5) * 5,
                   chest: Math.abs(sin(t, 5)) * 4, armR: sin(t, 5) * 10,
                   _y: -Math.abs(sin(t, 5)) * 0.022 }),
    side:  t => ({ legL: sin(t, 5) * 34, legR: -sin(t, 5) * 12,
                   footL: Math.max(0, -sin(t, 5)) * 20,
                   chest: Math.abs(sin(t, 5)) * 8, armL: -sin(t, 5) * 12, armR: sin(t, 5) * 20,
                   head: Math.abs(sin(t, 5)) * 5, _y: -Math.abs(sin(t, 5)) * 0.026 }),
  } },

  /* ── 새로 넣은 동작들 ── */
  sit: { ko: "앉기", f: {
    front: t => { const a = pulse01(t, 5, 0.18, 0.55);
      return { legL: a * 12, legR: -a * 12, hip: 0, chest: -a * 3,
               armL: -a * 12, armR: a * 12, _y: a * 0.08 }; },
    side:  t => { const a = pulse01(t, 5, 0.18, 0.55);
      return { legL: -a * 55, footL: a * 70, legR: -a * 50, footR: a * 66,
               hip: -a * 12, chest: a * 10, neck: -a * 6, _y: a * 0.10, _x: -a * 0.02 }; },
  }, fx: { hip: "none", tail: "flop" } },

  beg: { ko: "두 발 들고 서기", f: {
    front: t => { const a = pulse01(t, 4, 0.25, 0.4);
      return { armL: a * 10, armR: -a * 10,
               handL: a * 75 - sin(t, 5) * 6, handR: -a * 75 + sin(t, 5) * 6,
               chest: -a * 6, head: -a * 4, _y: -a * 0.02 }; },
    side:  t => { const a = pulse01(t, 4, 0.25, 0.4);
      return { armL: -a * 10, armR: -a * 12,
               handL: -a * 85 + sin(t, 5) * 7, handR: -a * 95 - sin(t, 5) * 7,
               chest: -a * 26, neck: a * 10, hip: -a * 6,
               legL: a * 20, legR: a * 18, _y: -a * 0.03 }; },
  }, fx: { tail: "wag" } },

  sniff: { ko: "킁킁 냄새 맡기", f: {
    front: t => ({ head: sin(t, 8) * 4, neck: 6 + sin(t, 8) * 2, _y: 0.02 }),
    side:  t => ({ neck: 22 + sin(t, 9) * 4, head: 14 + sin(t, 9) * 5,
                   chest: 6, _y: 0.03, _x: sin(t, 1.5) * 0.02 }),
  }, fx: { tail: "wag", earL: "flop", earR: "flop" } },

  sleep: { ko: "잠자기", f: {
    front: t => ({ head: 8, neck: 6, chest: 3, _y: 0.05 }),
    side:  t => ({ head: 20, neck: 16, chest: 10, hip: -4,
                   legL: -30, footL: 40, legR: -28, footR: 38, _y: 0.12 }),
  }, fx: { tail: "droop", earL: "droop", earR: "droop" } },

  scratch: { ko: "긁적긁적", f: {
    front: t => ({ legR: -35 - Math.abs(sin(t, 12)) * 10, footR: 40 + sin(t, 12) * 18,
                   head: 6, chest: -4, _y: 0.03 }),
    side:  t => ({ legR: -50 - Math.abs(sin(t, 12)) * 12, footR: 55 + sin(t, 12) * 22,
                   neck: 10, head: 12, chest: 6, _y: 0.04 }),
  } },

  shakeOff: { ko: "부르르 털기", f: {
    front: t => ({ head: sin(t, 22) * 10, neck: -sin(t, 22) * 6, chest: sin(t, 20) * 6,
                   hip: -sin(t, 20) * 6, armL: sin(t, 22) * 12, armR: -sin(t, 22) * 12,
                   _x: sin(t, 26) * 0.006 }),
    side:  t => ({ head: sin(t, 22) * 6, chest: sin(t, 20) * 8, hip: -sin(t, 20) * 8,
                   _x: sin(t, 26) * 0.008, _y: sin(t, 24) * 0.005 }),
  }, fx: { earL: "shiver", earR: "shiver", tail: "shiver", hip: "shiver" } },

  pounce: { ko: "폴짝 뛰어들기", f: {
    front: t => { const p = (t * 0.8) % 1;
      const crouch = p < 0.35 ? p / 0.35 : 0, fly = p >= 0.35 ? Math.sin((p - 0.35) / 0.65 * Math.PI) : 0;
      return { legL: crouch * 20 - fly * 30, legR: -crouch * 20 + fly * 30,
               armL: fly * 12, armR: -fly * 12, handL: fly * 75, handR: -fly * 75,
               chest: -fly * 10, _y: crouch * 0.05 - fly * 0.22 }; },
    side:  t => { const p = (t * 0.8) % 1;
      const crouch = p < 0.35 ? p / 0.35 : 0, fly = p >= 0.35 ? Math.sin((p - 0.35) / 0.65 * Math.PI) : 0;
      return { legL: crouch * 40 - fly * 55, legR: crouch * 36 - fly * 50,
               footL: crouch * 30, footR: crouch * 28,
               armL: -fly * 10, armR: -fly * 12, handL: -fly * 60, handR: -fly * 70,
               chest: crouch * 12 - fly * 24,
               neck: -fly * 10, _y: crouch * 0.06 - fly * 0.24, _x: fly * 0.10 }; },
  }, fx: { tail: "swish" } },

  tailWag: { ko: "꼬리 흔들기", f: {
    front: t => ({ hip: sin(t, 6) * 4, chest: -sin(t, 6) * 2, head: sin(t, 3) * 3,
                   _x: sin(t, 6) * 0.006 }),
    side:  t => ({ hip: sin(t, 6) * 3, chest: -sin(t, 6) * 2, head: sin(t, 3) * 3,
                   _y: -Math.abs(sin(t, 6)) * 0.004 }),
  }, fx: { tail: "swish", hip: "wiggle", earL: "flop", earR: "flop" } },

  bigSmall: { ko: "부위 커졌다 작아졌다", f: {
    front: t => ({ head: sin(t, 1.5) * 3, _y: -Math.abs(sin(t, 3)) * 0.006 }),
  }, fx: { head: "pulse", eyeL: "pulse", eyeR: "pulse", earL: "pulse", earR: "pulse",
           hip: "pulse", tail: "pulse", mouth: "pulse" } },

  heartBeat: { ko: "두근두근 (심쿵)", f: {
    front: t => ({ chest: sin(t, 1.6) * 2, head: -Math.abs(sin(t, 1.6)) * 3,
                   _y: -Math.abs(sin(t, 1.6)) * 0.010 }),
  }, fx: { body: "heart", eyeL: "heart", eyeR: "heart", cheekL: "pulse", cheekR: "pulse" } },

  bigHead: { ko: "머리만 커지기 (２등신)", f: {
    front: t => ({ head: sin(t, 1.2) * 3, chest: sin(t, 1.6) * 1.5 }),
    side:  t => ({ neck: sin(t, 1.2) * 3, head: sin(t, 1.2) * 4 }),
  }, fx: { head: "grow" } },
};

/** 그 동작이 그 방향에서 쓰는 뼈 각도 */
export function motionAngles(name, t, view = "front") {
  const m = RIG_MOTIONS[name] || RIG_MOTIONS.idle;
  const f = m.f || {};
  if (typeof f === "function") return f(t);                     // 옛 방식 호환
  if (f[view]) return f[view](t);
  if (view === "back") return mirrorAngles((f.front || f.side)(t));
  if (view === "side") return profileAngles((f.front || f.back)(t));
  return (f.front || f.side || f.back)(t);
}
/** 그 동작이 켜는 부위 움직임 (예: 걷기 → 꼬리 살랑) */
export function motionParts(name, view = "front") {
  const m = RIG_MOTIONS[name] || RIG_MOTIONS.idle;
  const fx = m.fx || null;
  if (!fx) return null;
  if (view !== "back") return fx;
  const o = {};                                    // 후면에서는 좌우 짝을 바꾼다
  for (const k in fx) o[MIRROR[k] || k] = fx[k];
  return o;
}

/* ── 삼각형 그물망 만들기 ─────────────────────────────
   불투명 픽셀을 격자로 훑어 사각형을 두 삼각형으로 나눈다. */
export function buildMesh(img, cells = 16) {
  const c = document.createElement("canvas");
  const S = 256;
  c.width = S; c.height = S;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0, S, S);
  const alpha = x.getImageData(0, 0, S, S).data;
  const solid = (u, v) => {
    const px = Math.min(S - 1, Math.max(0, Math.round(u * S)));
    const py = Math.min(S - 1, Math.max(0, Math.round(v * S)));
    return alpha[(py * S + px) * 4 + 3] > 25;
  };

  const verts = [];                       // {u,v} 0~1
  const index = new Map();
  const key = (i, j) => i + "," + j;
  const step = 1 / cells;
  const vertAt = (i, j) => {
    const k = key(i, j);
    if (index.has(k)) return index.get(k);
    const id = verts.length;
    verts.push({ u: i * step, v: j * step });
    index.set(k, id);
    return id;
  };
  const tris = [];
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      // 칸 안에 그림이 조금이라도 있으면 삼각형 두 개를 만든다
      let any = false;
      for (let a = 0; a <= 2 && !any; a++)
        for (let b = 0; b <= 2 && !any; b++)
          if (solid((i + a / 2) * step, (j + b / 2) * step)) any = true;
      if (!any) continue;
      const a = vertAt(i, j), b = vertAt(i + 1, j),
            d = vertAt(i, j + 1), e = vertAt(i + 1, j + 1);
      tris.push([a, b, e], [a, e, d]);
    }
  }
  // 이웃한 정점 쌍(변)과 원래 길이 — 그림이 찢어지지 않게 잡아 줄 때 쓴다
  const seen = new Set(), edges = [];
  for (const [a, b, c] of tris) {
    for (const [i, j] of [[a, b], [b, c], [c, a]]) {
      const k = i < j ? i + "_" + j : j + "_" + i;
      if (seen.has(k)) continue;
      seen.add(k);
      edges.push({ a: i, b: j, L0: Math.hypot(verts[i].u - verts[j].u, verts[i].v - verts[j].v) });
    }
  }
  return { verts, tris, edges, cells };
}

/**
 * 그림이 찢어지지 않게 잡아 준다.
 *
 * 뼈를 크게 돌리면 이웃한 삼각형끼리 늘어나는 정도가 크게 달라져 그림이 쭉쭉 늘어나거나
 * 접혀서 깨져 보인다. 그래서 '원래보다 너무 늘어나거나 너무 줄어든 변'만 골라
 * 여러 번 조금씩 되돌린다 (고무판을 펴는 것과 같다).
 * 움직임은 조금 작아지지만 그림은 절대 찢어지지 않는다.
 *
 * @param stiff 0=그대로, 1=단단하게 (기본 1)
 */
export function relaxMesh(mesh, dst, stiff = 1, iters = 6) {
  const edges = mesh.edges;
  if (!edges || stiff <= 0) return dst;
  const n = dst.length;
  const hi = 1 + 0.42 / Math.max(0.2, stiff);      // 이만큼까지는 늘어나도 봐준다
  const lo = 1 - 0.30 * Math.min(1, stiff);
  const cx = new Float32Array(n), cy = new Float32Array(n), cnt = new Float32Array(n);
  for (let it = 0; it < iters; it++) {
    cx.fill(0); cy.fill(0); cnt.fill(0);
    let worst = 0;
    for (const e of edges) {
      if (e.L0 < 1e-6) continue;
      const dx = dst[e.b].u - dst[e.a].u, dy = dst[e.b].v - dst[e.a].v;
      const L = Math.hypot(dx, dy);
      if (L < 1e-9) continue;
      const target = L > e.L0 * hi ? e.L0 * hi : (L < e.L0 * lo ? e.L0 * lo : 0);
      if (!target) continue;
      worst = Math.max(worst, Math.abs(L - target) / e.L0);
      const k = (L - target) / L * 0.5;
      cx[e.a] += dx * k; cy[e.a] += dy * k; cnt[e.a]++;
      cx[e.b] -= dx * k; cy[e.b] -= dy * k; cnt[e.b]++;
    }
    if (worst < 0.01) break;
    for (let i = 0; i < n; i++) {
      if (!cnt[i]) continue;
      dst[i].u += cx[i] / cnt[i] * 0.9;
      dst[i].v += cy[i] / cnt[i] * 0.9;
    }
  }
  return dst;
}

/* ── 뼈-정점 가중치 ───────────────────────────────── */
function segDist(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const wx = p.u - a.x, wy = p.v - a.y;
  const len2 = vx * vx + vy * vy || 1e-6;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const cx = a.x + vx * t, cy = a.y + vy * t;
  return Math.hypot(p.u - cx, p.v - cy);
}

/**
 * 정점마다 어느 뼈를 얼마나 따라갈지 정한다.
 * @param regions segment.js 가 정해 준 '이 살은 이 뼈' 지정 (없으면 거리로만)
 */
export function computeWeights(mesh, skel, falloff = 2.2, regions = null) {
  const bones = skel.bones;
  const byId = Object.fromEntries(bones.map(b => [b.id, b]));
  // 짧은 뼈(어깨·앞발 같은 작은 마디)가 몸통 살까지 끌고 가지 않도록
  // '뼈 길이'에 비례한 영향 범위를 준다 → 팔을 들 때 배까지 딸려 늘어나지 않는다.
  const segs = bones.filter(b => b.parent).map(b => {
    const a = byId[b.parent];
    return { id: b.id, a, b, len: Math.hypot(b.x - a.x, b.y - a.y),
             reach: Math.max(0.05, Math.hypot(b.x - a.x, b.y - a.y) * 1.5) };
  });
  if (!segs.length) return mesh.verts.map(() => []);

  const ids = new Set(bones.map(b => b.id));
  let W = mesh.verts.map((p, i) => {
    const m = new Map();
    // 팔·다리·귀처럼 몸에서 삐져나온 살은 그 뼈만 따라가게 못 박는다
    const fixed = regions && regions[i];
    if (fixed && ids.has(fixed)) { m.set(fixed, 1); return m; }
    // 뼈에 '흔들 범위(grip)'가 정해져 있으면 그 안쪽 살만 그 뼈를 따라간다.
    // 팔을 크게 흔들어도 몸통까지 딸려 가지 않게 하는 가장 확실한 방법이다.
    for (const s of segs) {
      if (!s.b.grip) continue;
      if (segDist(p, s.a, s.b) < s.b.grip * 0.7) { m.set(s.id, 1); return m; }
    }
    for (const s of segs) {
      const d = Math.max(0.015, segDist(p, s.a, s.b));
      m.set(s.id, Math.pow(s.reach / d, falloff));
    }
    return m;
  });

  // 이웃끼리 가중치를 섞어 경계에서 살이 찢어지지 않게 한다
  const nbr = mesh.verts.map(() => new Set());
  for (const [a, b, c] of mesh.tris || []) {
    nbr[a].add(b); nbr[a].add(c); nbr[b].add(a); nbr[b].add(c); nbr[c].add(a); nbr[c].add(b);
  }
  for (let pass = 0; pass < 3; pass++) {
    W = W.map((m, i) => {
      const o = new Map();
      const add = (src, k) => src.forEach((v, id) => o.set(id, (o.get(id) || 0) + v * k));
      add(m, 2);
      nbr[i].forEach(j => add(W[j], 1));
      return o;
    });
  }

  // 상위 3개 뼈만 남겨 자연스럽게 (너무 많은 뼈에 끌리면 흐물거린다)
  return W.map(m => {
    const top = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3);
    const sum = top.reduce((a, b) => a + b[1], 0) || 1;
    return top.map(([id, v]) => [id, v / sum]);
  });
}

/** 뼈가 뿌리(엉덩이)에서 몇 마디 떨어져 있는지 — 따라 흔들림(관성)에 쓴다 */
export function boneDepth(skel) {
  const byId = Object.fromEntries(skel.bones.map(b => [b.id, b]));
  const d = {};
  const solve = b => {
    if (!b) return 0;
    if (d[b.id] != null) return d[b.id];
    d[b.id] = b.parent ? solve(byId[b.parent]) + 1 : 0;
    return d[b.id];
  };
  skel.bones.forEach(solve);
  return d;
}

/** 뼈마다 그림의 몇 %를 데리고 다니는지 */
export function boneMass(weights) {
  const m = {};
  const n = weights.length || 1;
  for (const w of weights) for (const [id, v] of w) m[id] = (m[id] || 0) + v / n;
  return m;
}

/** 뼈마다, 그 뼈를 따라가는 살이 관절에서 평균 얼마나 멀리 있는지 */
export function boneSpan(mesh, weights, skel) {
  const byId = Object.fromEntries(skel.bones.map(b => [b.id, b]));
  const acc = {}, sum = {};
  weights.forEach((w, i) => {
    const p = mesh.verts[i];
    for (const [id, v] of w) {
      const b = byId[id];
      if (!b) continue;
      const par = byId[b.parent] || b;                 // 이 마디가 도는 축
      acc[id] = (acc[id] || 0) + v * Math.hypot(p.u - par.x, p.v - par.y);
      sum[id] = (sum[id] || 0) + v;
    }
  });
  const out = {};
  for (const id in acc) out[id] = acc[id] / Math.max(1e-6, sum[id]);
  return out;
}

/**
 * 팔다리다움 — 작은 부분만 데리고 있는 뼈는 마음껏 돌리고,
 * 몸통처럼 그림 대부분을 데리고 있는 뼈는 살짝만 돌린다.
 * (통통해서 팔다리가 몸에 붙어 있는 그림에서 몸이 엿가락처럼 늘어나는 걸 막는다)
 */
export function limbFactor(mass) {
  if (mass <= 0.06) return 1;                 // 그림의 6% 이하 = 진짜 팔다리 → 마음껏
  return Math.max(0.08, 1 - (mass - 0.06) * 5);
}

/* ── 포즈 계산: 뼈 각도 → 각 뼈의 변환 ────────────────
   뼈 하나 = '부모 관절 → 자기 관절' 마디.
   각도는 그 마디를 부모 관절을 중심으로 돌린다 →
   자기 관절 자리도 그 각도만큼 같이 돌아야 살(그림)과 관절이 어긋나지 않는다. */
export function poseBones(skel, angles) {
  const byId = Object.fromEntries(skel.bones.map(b => [b.id, b]));
  const out = {};
  const solve = b => {
    if (!b) return null;
    if (out[b.id]) return out[b.id];
    const rest = { x: b.x, y: b.y };
    const a = (angles[b.id] || 0) * Math.PI / 180;
    const par = b.parent ? solve(byId[b.parent]) : null;
    if (!par) { out[b.id] = { rest, pos: { ...rest }, rot: a }; return out[b.id]; }
    const pb = byId[b.parent];
    const dx = b.x - pb.x, dy = b.y - pb.y;
    const rot = par.rot + a;                       // 위 뼈가 돈 만큼 + 내 각도
    const c = Math.cos(rot), s = Math.sin(rot);    // 마디 자체의 방향으로 뻗는다
    out[b.id] = { rest, rot, parent: b.parent,
                  pos: { x: par.pos.x + dx * c - dy * s,
                         y: par.pos.y + dx * s + dy * c } };
    return out[b.id];
  };
  skel.bones.forEach(solve);
  return out;
}

/** 변형된 정점 위치 (0~1 좌표). angles 의 `_x`,`_y` 는 몸 전체 이동 */
export function deform(mesh, weights, skel, angles) {
  const pose = poseBones(skel, angles);
  const byId = Object.fromEntries(skel.bones.map(b => [b.id, b]));
  const ox = angles._x || 0, oy = angles._y || 0;
  return mesh.verts.map((p, i) => {
    let ux = 0, uy = 0, sw = 0;
    for (const [id, w] of weights[i]) {
      const b = byId[id], P = pose[id];
      if (!b || !P) continue;
      // 이 마디는 '부모 관절'을 축으로 P.rot 만큼 돌아 있다
      const par = byId[b.parent] || b;
      const pp = pose[b.parent] || P;
      const dx = p.u - par.x, dy = p.v - par.y;
      const c = Math.cos(P.rot), s = Math.sin(P.rot);
      ux += w * (pp.pos.x + dx * c - dy * s);
      uy += w * (pp.pos.y + dx * s + dy * c);
      sw += w;
    }
    if (sw < 1e-6) return { u: p.u + ox, v: p.v + oy };
    return { u: ux / sw + ox, v: uy / sw + oy };
  });
}

/* ── 그리기: 삼각형마다 원본 그림을 어파인 변환해 붙인다 ── */
export function drawRigged(ctx, img, mesh, src, dst, box) {
  const { x, y, w, h } = box;
  const sw = img.width, sh = img.height;
  for (const [i0, i1, i2] of mesh.tris) {
    const s0 = src[i0], s1 = src[i1], s2 = src[i2];
    const d0 = dst[i0], d1 = dst[i1], d2 = dst[i2];
    const sx0 = s0.u * sw, sy0 = s0.v * sh;
    const sx1 = s1.u * sw, sy1 = s1.v * sh;
    const sx2 = s2.u * sw, sy2 = s2.v * sh;
    const dx0 = x + d0.u * w, dy0 = y + d0.v * h;
    const dx1 = x + d1.u * w, dy1 = y + d1.v * h;
    const dx2 = x + d2.u * w, dy2 = y + d2.v * h;

    const denom = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
    if (Math.abs(denom) < 1e-6) continue;

    /* 접혀서 뒤집힌 삼각형은 그리지 않는다.
       뒤집힌 채로 그리면 그림이 거울처럼 뒤집혀 붙어 '검은 날개'처럼 튀어나온다.
       너무 심하게 늘어난 삼각형도 빼 준다 (쭉 늘어난 줄무늬가 생긴다). */
    const dArea = (dx1 - dx0) * (dy2 - dy0) - (dx2 - dx0) * (dy1 - dy0);
    const sArea = denom * (w / sw) * (h / sh);
    if (dArea * sArea <= 0) continue;                       // 앞뒤가 뒤집힘
    if (Math.abs(dArea) > Math.abs(sArea) * 6) continue;    // 6배 넘게 늘어남
    const a = ((dx1 - dx0) * (sy2 - sy0) - (dx2 - dx0) * (sy1 - sy0)) / denom;
    const b = ((dy1 - dy0) * (sy2 - sy0) - (dy2 - dy0) * (sy1 - sy0)) / denom;
    const cA = ((dx2 - dx0) * (sx1 - sx0) - (dx1 - dx0) * (sx2 - sx0)) / denom;
    const d = ((dy2 - dy0) * (sx1 - sx0) - (dy1 - dy0) * (sx2 - sx0)) / denom;

    // 삼각형을 아주 조금 부풀려 잘라낸다 → 조각 사이에 실금(흰 줄)이 안 생긴다
    const cx = (dx0 + dx1 + dx2) / 3, cy = (dy0 + dy1 + dy2) / 3;
    const grow = (px, py) => {
      const l = Math.hypot(px - cx, py - cy) || 1;
      const k = (l + 0.75) / l;
      return [cx + (px - cx) * k, cy + (py - cy) * k];
    };
    const g0 = grow(dx0, dy0), g1 = grow(dx1, dy1), g2 = grow(dx2, dy2);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.lineTo(g2[0], g2[1]);
    ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, cA, d, dx0 - a * sx0 - cA * sy0, dy0 - b * sx0 - d * sy0);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
}

/** 스프라이트 + 뼈대 + 부위 한 벌을 들고 있다가 시간을 주면 그려 주는 객체 */
export class RiggedSprite {
  constructor(img, skel = DEFAULT_SKELETON(), cells = 16, opt = {}) {
    this.img = img;
    this.skel = skel;
    this.view = opt.view || skel.view || "front";
    this.parts = opt.parts || DEFAULT_PARTS(this.view);
    this.mesh = buildMesh(img, cells);
    this.regions = opt.regions || null;         // segment.js 가 나눠 준 팔·다리 구역
    this.falloff = opt.falloff;
    this.weights = computeWeights(this.mesh, this.skel, this.falloff, this.regions);
    this.mass = boneMass(this.weights);
    this.span = boneSpan(this.mesh, this.weights, this.skel);
    this.depth = boneDepth(this.skel);
    this.lag = opt.lag ?? 0.4;                  // 관절이 따라 흔들리는 정도 (관성)
    this.stiff = opt.stiff ?? 1;                // 그림이 안 깨지게 잡아 주는 정도
    this.motion = "idle";
    this.speed = 1;
  }
  rebuild(cells, falloff, regions) {
    if (cells) this.mesh = buildMesh(this.img, cells);
    if (falloff) this.falloff = falloff;
    if (regions !== undefined) this.regions = regions;
    this.weights = computeWeights(this.mesh, this.skel, this.falloff, this.regions);
    this.mass = boneMass(this.weights);
    this.span = boneSpan(this.mesh, this.weights, this.skel);
  }
  /**
   * 그 뼈가 실제로 살을 얼마나 멀리 옮기는지로 각도를 제한한다.
   *
   * 같은 30° 라도 작은 앞발은 조금 움직이지만, 몸통 절반을 붙들고 있는 뼈는
   * 그림을 한참 끌고 가 찢어 놓는다. 그래서 '옮기는 거리'가 그림 크기의 일정 비율을
   * 넘지 않도록 각도를 깎는다 — 움직임은 작아져도 절대 깨지지 않는다.
   */
  dampen(angles) {
    const o = {};
    const maxMove = this.maxMove ?? 0.11;         // 그림 크기의 11% 까지만 옮긴다
    for (const k in angles) {
      if (k[0] === "_") { o[k] = angles[k]; continue; }
      const soft = angles[k] * limbFactor(this.mass[k] || 0);
      const span = Math.max(0.02, this.span[k] || 0.1);
      const cap = Math.min(120, maxMove / span * 180 / Math.PI);
      o[k] = Math.max(-cap, Math.min(cap, soft));
    }
    return o;
  }
  /**
   * 그 순간의 뼈 각도.
   * 몸통이 먼저 움직이고 손끝이 조금 늦게 따라오도록, 뿌리에서 먼 뼈일수록
   * '조금 전 동작'을 쓴다 → 채찍처럼 이어지는 자연스러운 움직임(관성)이 생긴다.
   */
  anglesAt(t) {
    const base = motionAngles(this.motion, t, this.view);
    if (!this.lag) return this.dampen(base);
    const out = { _x: base._x, _y: base._y };
    const cache = new Map();
    for (const b of this.skel.bones) {
      const back = (this.depth[b.id] || 0) * 0.05 * this.lag;
      let a = cache.get(back);
      if (!a) { a = back ? motionAngles(this.motion, t - back, this.view) : base; cache.set(back, a); }
      if (a[b.id] != null) out[b.id] = a[b.id];
    }
    return this.dampen(out);
  }
  /** box = {x,y,w,h} 화면 위 그릴 자리 */
  draw(ctx, box, t, extraAngles) {
    const tt = t * (this.speed || 1);
    const angles = { ...this.anglesAt(tt), ...(extraAngles || {}) };
    const dst = deform(this.mesh, this.weights, this.skel, angles);
    applyPartEffects(this.mesh, dst, this.parts, tt, this.view,
                     motionParts(this.motion, this.view));
    relaxMesh(this.mesh, dst, this.stiff ?? 1);      // 찢어진 곳을 펴 준다
    drawRigged(ctx, this.img, this.mesh, this.mesh.verts, dst, box);
    return dst;
  }
}
