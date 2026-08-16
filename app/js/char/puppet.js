/* 캐릭터 퍼펫 — 그림(스프라이트)을 방향에 맞춰 골라 그리고, 머리/몸을 나눠 움직인다.
   그리기 규칙이 여기 한 곳에만 있어서 미리보기와 영상이 항상 같은 그림이 된다. */

export const ROLES = [
  ["", "사용 안 함"],
  ["front", "정면"], ["side", "측면"], ["back", "후면"],
  ["sit", "앉은 자세"], ["lie", "엎드린 자세"], ["extra", "기타"],
];
export const AUTO_ORDER = ["front", "side", "back", "sit", "lie", "extra"];
export const ROLE_KO = Object.fromEntries(ROLES);

export class Puppet {
  constructor(poses = {}) {
    this.poses = poses;          // {front: Image, side: Image, ...}
    this.headRatio = 0.46;       // 위에서부터 몇 %가 머리인지
  }
  has(role) { return !!this.poses[role]; }
  get empty() { return !Object.keys(this.poses).length; }

  /** 0°=정면, 90°=오른쪽 측면, 180°=후면, 270°=왼쪽 측면 */
  pick(angle) {
    const P = this.poses;
    const a = ((angle % 360) + 360) % 360;
    const front = P.front || P.side || P.back || P.sit || P.lie;
    const side = P.side || front, back = P.back || front;
    if (a < 45 || a >= 315) return { img: front, flip: false };
    if (a < 135) return { img: side, flip: false };
    if (a < 225) return { img: back, flip: false };
    return { img: side, flip: true };
  }
  imgFor(s) {
    return s.pose ? (this.poses[s.pose] || this.pick(0).img) : this.pick(s.angle || 0).img;
  }

  draw(ctx, s, opt) {
    const chosen = s.pose ? { img: this.poses[s.pose] || this.pick(0).img, flip: false }
                          : this.pick(s.angle);
    const img = chosen.img;
    if (!img) return;
    const flip = chosen.flip !== !!s.flip;
    const w = img.width * s.scale, h = img.height * s.scale;
    const sq = s.squash || 1;
    const dw = w * sq, dh = h / sq;

    if (opt.shadow > 0) {                       // 발밑 그림자
      ctx.save();
      ctx.globalAlpha = opt.shadow * (s.shadowFade ?? 1);
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(s.x, s.footY, dw * 0.34, dw * 0.085, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const band = (sy, sh, dy, dh2, tilt, pivotY) => {
      ctx.save();
      ctx.translate(s.x, s.footY);
      if (opt.upsideDown) { ctx.scale(1, -1); ctx.translate(0, 0); }   // 거꾸로 세우기
      if (s.bodyLean) ctx.rotate(s.bodyLean * Math.PI / 180);
      ctx.translate(0, pivotY);
      if (tilt) ctx.rotate(tilt * Math.PI / 180);
      ctx.translate(0, -pivotY);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(img, 0, sy, img.width, sh, -dw / 2, dy, dw, dh2);
      ctx.restore();
    };

    const top = -dh;                            // 발이 footY 에 닿게
    if (opt.headMotion && s.headTilt) {
      const cut = Math.round(img.height * this.headRatio);
      const cutD = dh * this.headRatio;
      const ov = 3, ovD = ov * s.scale;         // 이음매가 보이지 않도록 겹쳐 그린다
      band(cut, img.height - cut, top + cutD, dh - cutD, 0, 0);
      band(0, cut + ov, top, cutD + ovD, s.headTilt, top + cutD);
    } else {
      band(0, img.height, top, dh, 0, 0);
    }
  }
}

/* 동작 — 시간 t(초) → 그 순간의 상태. 새 동작은 여기 한 줄만 추가하면 된다. */
export const MOTIONS = {
  idle: { ko: "가만히 (숨쉬기)", needs: null, fn: (t, c) => ({
    x: c.x, angle: 0, squash: 1 + Math.sin(t * 1.7) * 0.02,
    headTilt: Math.sin(t * 0.9) * 2.5, dy: 0 }) },
  walk: { ko: "걸어가기 (좌 → 우)", needs: "side", fn: (t, c) => {
    const step = Math.sin(t * 5.5);
    return { x: c.x - 0.35 + ((t * 0.16) % 0.9), angle: 90,
             dy: -Math.abs(step) * 0.035, squash: 1 + step * 0.02,
             headTilt: step * 3, bodyLean: step * 1.6 }; } },
  walkBack: { ko: "걸어오기 (우 → 좌)", needs: "side", fn: (t, c) => {
    const s = MOTIONS.walk.fn(t, c);
    return { ...s, x: c.x + 0.55 - ((t * 0.16) % 0.9), flip: true }; } },
  hop: { ko: "깡충깡충 뛰기", needs: null, fn: (t, c) => {
    const p = (t * 1.7) % 1, up = Math.sin(p * Math.PI);
    return { x: c.x, angle: 0, dy: -up * 0.22,
             squash: 1 + (p < 0.12 || p > 0.88 ? 0.12 : -up * 0.06),
             headTilt: up * 5, shadowFade: 1 - up * 0.55 }; } },
  turn: { ko: "제자리에서 한 바퀴 돌기", needs: "back", fn: (t, c) => ({
    x: c.x, angle: (t * 95) % 360, squash: 1 + Math.sin(t * 1.7) * 0.02, dy: 0 }) },
  lookAround: { ko: "두리번거리기", needs: "side", fn: (t, c) => {
    const a = Math.sin(t * 0.8);
    return { x: c.x, angle: a > 0.55 ? 90 : a < -0.55 ? 270 : 0,
             headTilt: a * 5, squash: 1 + Math.sin(t * 1.7) * 0.02, dy: 0 }; } },
  sit: { ko: "앉기", needs: "sit", fn: (t, c) => ({
    x: c.x, pose: "sit", squash: 1 + Math.sin(t * 1.6) * 0.018,
    headTilt: Math.sin(t * 0.9) * 3, dy: 0 }) },
  lie: { ko: "엎드리기", needs: "lie", fn: (t, c) => ({
    x: c.x, pose: "lie", squash: 1 + Math.sin(t * 1.3) * 0.015, dy: 0 }) },
  enterSit: { ko: "걸어와서 앉기", needs: "sit", fn: (t, c) => {
    const walkT = 3.2;
    if (t < walkT) {
      const s = MOTIONS.walk.fn(t, c);
      return { ...s, x: c.x - 0.42 + (t / walkT) * 0.42 };
    }
    return { ...MOTIONS.sit.fn(t - walkT, c), x: c.x }; } },

  /* ── 아래는 3D 모델에서 특히 잘 어울리는 동작들 (그림 캐릭터도 동작함) ── */
  spinFast: { ko: "빠르게 팽이처럼 돌기", fn: (t, c) => ({
    x: c.x, spin: t * 420, squash: 1 + Math.sin(t * 8) * 0.03, dy: 0 }) },
  spinJump: { ko: "돌면서 점프", fn: (t, c) => {
    const p = (t * 1.2) % 1, up = Math.sin(p * Math.PI);
    return { x: c.x, spin: p * 360, dy: -up * 0.3, shadowFade: 1 - up * 0.6,
             squash: 1 + (p < 0.1 ? 0.15 : -up * 0.05) }; } },
  wobble: { ko: "좌우로 갸우뚱거리기", fn: (t, c) => ({
    x: c.x, bodyLean: Math.sin(t * 2.4) * 9, headTilt: Math.sin(t * 2.4) * 6,
    squash: 1 + Math.sin(t * 1.6) * 0.02, dy: 0 }) },
  shiver: { ko: "부들부들 떨기", fn: (t, c) => ({
    x: c.x + Math.sin(t * 34) * 0.004, bodyLean: Math.sin(t * 30) * 1.6,
    squash: 1 + Math.sin(t * 24) * 0.012, dy: 0 }) },
  nod: { ko: "고개 끄덕이기", fn: (t, c) => ({
    x: c.x, headTilt: 0, tilt: Math.sin(t * 3.2) * 10,
    squash: 1 + Math.sin(t * 3.2) * 0.02, dy: 0 }) },
  grow: { ko: "점점 커지기", fn: (t, c) => ({
    x: c.x, sizeMul: 0.35 + Math.min(1, t / 2.2) * 0.9,
    squash: 1 + Math.sin(t * 3) * 0.02, dy: 0 }) },
  shrink: { ko: "점점 작아지기", fn: (t, c) => ({
    x: c.x, sizeMul: Math.max(0.15, 1.25 - Math.min(1, t / 2.2) * 1.0), dy: 0 }) },
  riseUp: { ko: "아래에서 솟아오르기", fn: (t, c) => {
    const p = Math.min(1, t / 1.4);
    return { x: c.x, dy: (1 - p) * 0.35, sizeMul: 0.6 + p * 0.4,
             squash: 1 + (1 - p) * 0.15 }; } },
  fallIn: { ko: "위에서 떨어지기", fn: (t, c) => {
    const p = Math.min(1, t / 1.1), land = p >= 1;
    const bounce = land ? Math.abs(Math.sin((t - 1.1) * 9)) * Math.max(0, 1 - (t - 1.1) * 1.6) : 0;
    return { x: c.x, dy: -(1 - p) * (1 - p) * 0.9 - bounce * 0.06,
             squash: land ? 1 + bounce * 0.12 : 1, spin: (1 - p) * 90 }; } },
  backflip: { ko: "공중제비", fn: (t, c) => {
    const p = (t * 0.7) % 1, up = Math.sin(p * Math.PI);
    return { x: c.x, dy: -up * 0.4, tilt: p * 360, shadowFade: 1 - up * 0.7 }; } },
  peek: { ko: "빼꼼 나타났다 숨기", fn: (t, c) => {
    const p = (t * 0.5) % 1;
    const hide = p < 0.25 ? 1 - p / 0.25 : p > 0.75 ? (p - 0.75) / 0.25 : 0;
    return { x: c.x - 0.12 * hide, dy: 0, sizeMul: 1, squash: 1,
             bodyLean: hide * 12, shadowFade: 1 - hide }; } },
  dance: { ko: "신나게 춤추기", fn: (t, c) => ({
    x: c.x + Math.sin(t * 3) * 0.03, dy: -Math.abs(Math.sin(t * 6)) * 0.06,
    bodyLean: Math.sin(t * 3) * 12, spin: Math.sin(t * 1.5) * 30,
    headTilt: Math.sin(t * 6) * 6, squash: 1 + Math.sin(t * 6) * 0.04 }) },
  breatheBig: { ko: "크게 숨쉬기", fn: (t, c) => ({
    x: c.x, squash: 1 + Math.sin(t * 1.1) * 0.06, sizeMul: 1 + Math.sin(t * 1.1) * 0.03, dy: 0 }) },
};

/* 가감속 곡선 */
export const EASINGS = {
  linear: { ko: "일정한 속도", fn: p => p },
  easeInOut: { ko: "부드럽게 (출발·도착 느리게)", fn: p => p * p * (3 - 2 * p) },
  easeIn: { ko: "천천히 출발", fn: p => p * p },
  easeOut: { ko: "천천히 도착", fn: p => 1 - (1 - p) * (1 - p) },
  pingpong: { ko: "갔다가 되돌아오기", fn: p => 1 - Math.abs(1 - 2 * p) },
};

/* 배경 카메라 움직임 */
export const CAMERAS = {
  none: { ko: "고정", fn: () => ({ zoom: 1, px: 0.5, py: 0.5 }) },
  zoomIn: { ko: "천천히 확대", fn: p => ({ zoom: 1 + 0.14 * p, px: 0.5, py: 0.5 }) },
  zoomOut: { ko: "천천히 축소", fn: p => ({ zoom: 1.14 - 0.14 * p, px: 0.5, py: 0.5 }) },
  panRight: { ko: "왼쪽 → 오른쪽 이동", fn: p => ({ zoom: 1.16, px: 0.32 + 0.36 * p, py: 0.5 }) },
  panLeft: { ko: "오른쪽 → 왼쪽 이동", fn: p => ({ zoom: 1.16, px: 0.68 - 0.36 * p, py: 0.5 }) },
};

/** 한 프레임을 그린다 — 미리보기·영상이 공유하는 단 하나의 그리기 경로 */
export function paintScene(ctx, W, H, { puppet, bg, opt, t }) {
  const dur = Math.max(0.1, opt.duration || 6);
  const prog = Math.min(1, Math.max(0, t / dur));

  ctx.fillStyle = "#17151a";
  ctx.fillRect(0, 0, W, H);
  if (bg) {
    const cam = (CAMERAS[opt.camera] || CAMERAS.none).fn(prog);
    const sc = Math.max(W / bg.width, H / bg.height) * cam.zoom;
    const dw = bg.width * sc, dh = bg.height * sc;
    ctx.drawImage(bg, (W - dw) * cam.px, (H - dh) * cam.py, dw, dh);
  }
  if (!puppet || puppet.empty) return;
  const m = MOTIONS[opt.motion] || MOTIONS.idle;
  const s = m.fn(t * opt.speed, { x: opt.pos });

  // 이동 경로: 정해진 좌표에서 좌표로 영상 길이에 맞춰 움직인다
  let x = s.x ?? opt.pos, floor = opt.floor, flip = s.flip;
  const path = opt.path;
  let dir = opt.motion === "walkBack" ? -1 : 1;          // 1=오른쪽, -1=왼쪽
  if (path && path.on) {
    const p = (EASINGS[path.ease] || EASINGS.easeInOut).fn(prog);
    x = path.x1 + (path.x2 - path.x1) * p;
    floor = path.y1 + (path.y2 - path.y1) * p;
    dir = path.x2 >= path.x1 ? 1 : -1;
    if (path.ease === "pingpong" && prog > 0.5) dir = -dir;
  }
  // 걷는 방향을 보게 한다 (측면 그림이 원래 어느 쪽을 보는지에 맞춰 뒤집음)
  const moving = (path && path.on) || opt.motion === "walk" || opt.motion === "walkBack";
  const sideView = !s.pose && (((s.angle || 0) % 360) >= 45 && ((s.angle || 0) % 360) < 315);
  if (moving && sideView && opt.autoFace !== false) {
    const artRight = opt.sideFacing === "right";
    if (artRight !== (dir > 0)) flip = !flip;
  }

  const img = puppet.imgFor(s);
  if (!img) return;
  const scale = H * 0.55 / img.height * opt.scale;
  puppet.draw(ctx, {
    x: W * x,
    footY: H * floor + (s.dy || 0) * H,
    scale, angle: s.angle || 0, flip, squash: s.squash || 1,
    headTilt: s.headTilt || 0, bodyLean: s.bodyLean || 0, pose: s.pose,
    shadowFade: s.shadowFade,
  }, opt);

  if (opt.caption && opt.caption.text) drawCaption(ctx, W, H, opt.caption);
}

/* ── 여러 장면(shot) × 여러 캐릭터(actor) 를 한 편의 영상으로 ───────────── */

/** 장면 목록에서 시각 t가 어느 장면인지 찾는다 */
export function shotAt(shots, t) {
  let acc = 0;
  for (let i = 0; i < shots.length; i++) {
    const d = Math.max(0.2, shots[i].seconds || 3);
    if (t < acc + d || i === shots.length - 1)
      return { index: i, shot: shots[i], local: Math.max(0, t - acc), dur: d, start: acc };
    acc += d;
  }
  return { index: 0, shot: shots[0], local: 0, dur: 3, start: 0 };
}
export const totalSeconds = shots =>
  shots.reduce((s, x) => s + Math.max(0.2, x.seconds || 3), 0);

/* 저장해 둔 '캐릭터 상태'를 이번 프레임에 맞춰 섞는다.
   act.startState / act.endState 가 있으면 changeAt 초부터 changeDur 초 동안 서서히 바뀐다. */
const LERP_KEYS = ["scale", "floor", "shadow", "z", "headRatio", "turn", "light", "tilt"];
const SWAP_KEYS = ["sideFacing", "flipX", "upsideDown", "headMotion", "color", "autoFace"];

export function blendActor(actor, act, local) {
  const A = act && act.startState, B = act && act.endState;
  if (!A && !B) return actor;
  const at = act.changeAt ?? 0, len = Math.max(0.01, act.changeDur ?? 1);
  const p = Math.min(1, Math.max(0, (local - at) / len));
  const from = { ...actor, ...(A || {}) };
  const to = { ...actor, ...(B || A || {}) };
  const out = { ...from };
  for (const k of LERP_KEYS) {
    const a = Number(from[k]), b = Number(to[k]);
    if (Number.isFinite(a) && Number.isFinite(b)) out[k] = a + (b - a) * p;
  }
  for (const k of SWAP_KEYS) out[k] = p >= 0.5 ? to[k] : from[k];
  return out;
}

/** 한 배우의 이번 프레임 상태 (동작 + 경로) */
function actorState(actor, act, local, dur) {
  const m = MOTIONS[act.motion] || MOTIONS.idle;
  const s = m.fn(local * (act.speed ?? 1), { x: act.pos ?? 0.5 });
  let x = s.x ?? act.pos ?? 0.5, floor = actor.floor, flip = s.flip;
  let dir = act.motion === "walkBack" ? -1 : 1;
  const path = act.path;
  if (path && path.on) {
    const p = (EASINGS[path.ease] || EASINGS.easeInOut).fn(Math.min(1, Math.max(0, local / dur)));
    x = path.x1 + (path.x2 - path.x1) * p;
    floor = path.y1 + (path.y2 - path.y1) * p;
    dir = path.x2 >= path.x1 ? 1 : -1;
    if (path.ease === "pingpong" && local / dur > 0.5) dir = -dir;
  }
  const moving = (path && path.on) || act.motion === "walk" || act.motion === "walkBack";
  const sideView = !s.pose && (((s.angle || 0) % 360) >= 45 && ((s.angle || 0) % 360) < 315);
  if (moving && sideView && actor.autoFace !== false) {
    if ((actor.sideFacing === "right") !== (dir > 0)) flip = !flip;
  }
  if (actor.flipX) flip = !flip;                 // 항상 좌우 반전
  return { ...s, x, floor, flip };
}

/**
 * 프로젝트 전체를 한 프레임 그린다 (미리보기·영상이 공유하는 유일한 경로)
 * @param puppets { [castId]: Puppet }
 */
export function paintProject(ctx, W, H, { project, puppets, bg, t }) {
  const shots = project.shots.length ? project.shots : [{ seconds: 3, acts: {} }];
  const { shot, local, dur } = shotAt(shots, t);
  const prog = Math.min(1, local / dur);

  ctx.fillStyle = project.bgColor || "#17151a";
  ctx.fillRect(0, 0, W, H);
  if (bg) {
    const cam = (CAMERAS[shot.camera || project.camera || "none"] || CAMERAS.none).fn(prog);
    const sc = Math.max(W / bg.width, H / bg.height) * cam.zoom;
    const dw = bg.width * sc, dh = bg.height * sc;
    ctx.drawImage(bg, (W - dw) * cam.px, (H - dh) * cam.py, dw, dh);
  }

  const anchors = {};                          // 말풍선이 붙을 자리 (캐릭터가 차지한 영역)
  const cast = [...project.cast].sort((a, b) => (a.z || 0) - (b.z || 0));
  for (const actor0 of cast) {
    const act = (shot.acts && shot.acts[actor0.id]) || {};
    if (act.visible === false) continue;
    const actor = blendActor(actor0, act, local);   // 저장한 상태(시작→끝)를 섞어 적용
    const puppet = puppets[actor0.id];

    if (actor.type === "mesh") {                 // 3D 메시 배우
      if (!puppet || !puppet.ready) continue;
      const s = actorState(actor, act, local, dur);
      const px = H * 0.55 * (actor.scale ?? 1) * (s.sizeMul || 1);
      const img = puppet.render(px, {
        angle: (s.angle || 0) + (actor.turn || 0) + (s.spin || 0) + (s.flip ? 180 : 0),
        tiltX: (s.tilt || 0) + (actor.upsideDown ? 180 : 0),
        lean: (s.bodyLean || 0), light: actor.light ?? 1,
      });
      if (!img) continue;
      const sq = s.squash || 1;
      const dw = img.width * sq, dh = img.height / sq;
      const x = W * s.x, footY = H * s.floor + (s.dy || 0) * H;
      if ((actor.shadow ?? 0.35) > 0) {
        ctx.save();
        ctx.globalAlpha = (actor.shadow ?? 0.35) * (s.shadowFade ?? 1);
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.ellipse(x, footY, dw * 0.30, dw * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.drawImage(img, x - dw / 2, footY - dh, dw, dh);
      anchors[actor0.id] = { x, top: footY - dh, bottom: footY, w: dw };
      continue;
    }

    if (!puppet || puppet.empty) continue;
    puppet.headRatio = actor.headRatio ?? 0.46;
    const s = actorState(actor, act, local, dur);
    const img = puppet.imgFor(s);
    if (!img) continue;
    const scale = H * 0.55 / img.height * (actor.scale ?? 1) * (s.sizeMul || 1);
    const sq = s.squash || 1;
    const fx = W * s.x, fy = H * s.floor + (s.dy || 0) * H;
    anchors[actor0.id] = { x: fx, top: fy - img.height * scale / sq,
                           bottom: fy, w: img.width * scale * sq };
    puppet.draw(ctx, {
      x: fx, footY: fy,
      scale, angle: s.angle || 0, flip: s.flip, squash: sq,
      headTilt: s.headTilt || 0, bodyLean: s.bodyLean || 0, pose: s.pose,
      shadowFade: s.shadowFade,
    }, { shadow: actor.shadow ?? 0.35, headMotion: actor.headMotion !== false,
         upsideDown: !!actor.upsideDown });
  }

  const cap = shot.caption;
  if (cap && cap.text) {
    let a = 1;                                   // 장면 시작·끝에서 부드럽게
    if (cap.fade !== false) a = Math.min(1, local / 0.35, (dur - local) / 0.35);
    drawCaption(ctx, W, H, { ...cap, alpha: Math.max(0, a) });
  }

  // 말풍선은 캐릭터 위에 그린다
  (shot.bubbles || []).forEach(b => {
    const anchor = anchors[b.actorId] || Object.values(anchors)[0];
    drawBubble(ctx, W, H, b, anchor, local);
  });
}

/* ── 말풍선 ─────────────────────────────────────────────
   캐릭터에 붙어 다니고, 글자 길이에 따라 크기가 저절로 늘어난다.
   화면 밖으로 잘리면 반대쪽으로 자동으로 넘어간다. */

export const BUBBLE_POS = [
  ["top", "위"], ["bottom", "아래"], ["left", "왼쪽"], ["right", "오른쪽"],
  ["topLeft", "위-왼쪽"], ["topRight", "위-오른쪽"],
  ["bottomLeft", "아래-왼쪽"], ["bottomRight", "아래-오른쪽"],
];
export const BUBBLE_STYLES = [
  ["speech", "말풍선 (뾰족한 꼬리)"], ["thought", "생각 풍선 (동글동글)"],
  ["shout", "외침 (뾰족뾰족)"], ["plain", "꼬리 없는 상자"],
];
export const FONTS = [
  ["system-ui", "기본"], ["Pretendard", "프리텐다드"], ["Malgun Gothic", "맑은 고딕"],
  ["Batang", "바탕(명조)"], ["Gungsuh", "궁서"], ["Consolas", "고정폭"],
];

export const newBubble = (actorId = "") => ({
  actorId, text: "안녕!", pos: "topRight", style: "speech",
  font: "system-ui", size: 0.045, bold: true, color: "#2b2119",
  bg: "#ffffff", border: "#2b2119", maxWidth: 0.34, pad: 0.4,
  offsetX: 0, offsetY: 0, autoFlip: true, appearAt: 0, duration: 0, fade: true,
});

function wrapLines(ctx, text, maxW) {
  const out = [];
  String(text).split("\n").forEach(para => {
    let line = "";
    for (const word of para.split(" ")) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; }
      else line = test;
    }
    out.push(line);
  });
  return out;
}

function roundBox(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function cloudBox(ctx, x, y, w, h) {          // 생각 풍선: 동글동글한 테두리
  const r = Math.min(w, h) * 0.28;
  const n = Math.max(6, Math.round(w / (r * 1.1)));
  ctx.beginPath();
  for (let i = 0; i < n; i++) {                // 위·아래 물결
    const t = i / (n - 1);
    ctx.arc(x + r * 0.8 + t * (w - r * 1.6), y + r * 0.75, r * 0.75, Math.PI, 0);
  }
  for (let i = 0; i < n; i++) {
    const t = 1 - i / (n - 1);
    ctx.arc(x + r * 0.8 + t * (w - r * 1.6), y + h - r * 0.75, r * 0.75, 0, Math.PI);
  }
  ctx.closePath();
}

function shoutBox(ctx, x, y, w, h) {          // 외침: 뾰족뾰족
  const cx = x + w / 2, cy = y + h / 2, n = 16;
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const k = i % 2 ? 0.82 : 1.06;
    ctx.lineTo(cx + Math.cos(a) * w / 2 * k, cy + Math.sin(a) * h / 2 * k);
  }
  ctx.closePath();
}

/** 말풍선 하나를 그린다. anchor = {x, top, bottom, w} (캐릭터가 차지한 자리) */
export function drawBubble(ctx, W, H, b, anchor, local) {
  if (!b.text || !anchor) return;
  let alpha = 1;
  const at = b.appearAt || 0, dur = b.duration || 0;
  if (local < at) return;
  if (dur > 0 && local > at + dur) return;
  if (b.fade !== false) {
    alpha = Math.min(1, (local - at) / 0.25);
    if (dur > 0) alpha = Math.min(alpha, (at + dur - local) / 0.25);
    if (alpha <= 0) return;
  }

  const fs = Math.max(11, H * (b.size || 0.045));
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.font = `${b.bold ? 700 : 400} ${Math.round(fs)}px "${b.font || "system-ui"}", system-ui, sans-serif`;
  ctx.textBaseline = "top";

  const maxW = W * (b.maxWidth || 0.34);
  const lines = wrapLines(ctx, b.text, maxW);
  const lineH = fs * 1.32;
  const pad = fs * (b.pad ?? 0.4) + fs * 0.25;
  const tw = Math.max(...lines.map(l => ctx.measureText(l).width));
  const bw = tw + pad * 2, bh = lines.length * lineH + pad * 1.6;

  // 위치 계산 (캐릭터 기준)
  const gap = fs * 0.7;
  let side = b.pos || "topRight";
  const place = s => {
    let x, y;
    const cx = anchor.x, top = anchor.top, bottom = anchor.bottom, half = anchor.w / 2;
    if (s.startsWith("top")) y = top - bh - gap;
    else if (s.startsWith("bottom")) y = bottom + gap;
    else y = top + (bottom - top) * 0.25 - bh / 2;
    if (s === "left") x = cx - half - bw - gap;
    else if (s === "right") x = cx + half + gap;
    else if (s.endsWith("Left")) x = cx - half * 0.2 - bw;
    else if (s.endsWith("Right")) x = cx + half * 0.2;
    else x = cx - bw / 2;
    return { x, y };
  };
  let { x, y } = place(side);
  if (b.autoFlip !== false) {                       // 화면 밖이면 반대쪽으로
    const flipMap = { top: "bottom", bottom: "top", left: "right", right: "left",
                      topLeft: "topRight", topRight: "topLeft",
                      bottomLeft: "bottomRight", bottomRight: "bottomLeft" };
    if (y < 4 || y + bh > H - 4) {
      const s2 = side.startsWith("top") ? side.replace("top", "bottom")
               : side.startsWith("bottom") ? side.replace("bottom", "top") : side;
      const p2 = place(s2);
      if (p2.y >= 4 && p2.y + bh <= H - 4) { side = s2; y = p2.y; x = p2.x; }
    }
    if (x < 4 || x + bw > W - 4) {
      const s3 = flipMap[side] || side;
      const p3 = place(s3);
      if (p3.x >= 4 && p3.x + bw <= W - 4) { side = s3; x = p3.x; y = p3.y; }
    }
    x = Math.max(4, Math.min(W - bw - 4, x));       // 그래도 넘치면 화면 안으로 밀어 넣기
    y = Math.max(4, Math.min(H - bh - 4, y));
  }
  x += (b.offsetX || 0) * W;
  y += (b.offsetY || 0) * H;

  // 풍선 몸통
  ctx.fillStyle = b.bg || "#fff";
  ctx.strokeStyle = b.border || "#2b2119";
  ctx.lineWidth = Math.max(1.5, fs * 0.09);
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = fs * 0.5;
  ctx.shadowOffsetY = fs * 0.12;
  if (b.style === "thought") cloudBox(ctx, x, y, bw, bh);
  else if (b.style === "shout") shoutBox(ctx, x, y, bw, bh);
  else roundBox(ctx, x, y, bw, bh, fs * 0.7);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.stroke();

  // 꼬리 (캐릭터 쪽을 향한다)
  if (b.style === "speech" || b.style === "shout") {
    const tx = Math.max(x + bw * 0.18, Math.min(x + bw * 0.82, anchor.x));
    const ty = y + bh / 2 < anchor.top ? y + bh : y;   // 풍선이 위면 아래쪽에 꼬리
    const dir = ty === y ? -1 : 1;
    const tip = ty + dir * fs * 0.95;
    ctx.beginPath();
    ctx.moveTo(tx - fs * 0.32, ty);
    ctx.lineTo(tx + fs * 0.32, ty);
    ctx.lineTo(tx + (anchor.x > tx ? fs * 0.25 : -fs * 0.25), tip);
    ctx.closePath();
    ctx.fillStyle = b.bg || "#fff";
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();                                   // 꼬리 안쪽 테두리 지우기
    ctx.moveTo(tx - fs * 0.3, ty); ctx.lineTo(tx + fs * 0.3, ty);
    ctx.strokeStyle = b.bg || "#fff";
    ctx.lineWidth = Math.max(2, fs * 0.14);
    ctx.stroke();
  } else if (b.style === "thought") {                  // 생각 풍선: 동그라미 꼬리
    const up = y + bh / 2 < anchor.top;
    let cy = up ? y + bh : y;
    for (let i = 1; i <= 2; i++) {
      const r = fs * (0.22 - i * 0.05);
      cy += (up ? 1 : -1) * fs * 0.45;
      ctx.beginPath();
      ctx.arc(anchor.x + (i % 2 ? fs * 0.2 : -fs * 0.1), cy, r, 0, 7);
      ctx.fillStyle = b.bg || "#fff"; ctx.fill();
      ctx.strokeStyle = b.border || "#2b2119"; ctx.lineWidth = Math.max(1.2, fs * 0.07);
      ctx.stroke();
    }
  }

  // 글자
  ctx.fillStyle = b.color || "#2b2119";
  ctx.textAlign = "center";
  lines.forEach((l, i) => ctx.fillText(l, x + bw / 2, y + pad * 0.8 + i * lineH));
  ctx.restore();
}

/** 영상에 자막 한 줄 (제목·대사) */
function drawCaption(ctx, W, H, cap) {
  const size = Math.max(16, H * (cap.size || 0.055));
  const y = cap.pos === "top" ? size * 1.6 : H - size * 0.9;
  ctx.save();
  ctx.globalAlpha = cap.alpha ?? 1;
  ctx.textAlign = "center";
  ctx.font = `700 ${Math.round(size)}px "Pretendard", "Malgun Gothic", system-ui, sans-serif`;
  if (cap.box) {
    const w = ctx.measureText(cap.text).width + size * 1.2;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.roundRect((W - w) / 2, y - size * 1.05, w, size * 1.5, size * 0.4);
    ctx.fill();
  }
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = cap.color || "#ffffff";
  ctx.fillText(cap.text, W / 2, y);
  ctx.restore();
}
