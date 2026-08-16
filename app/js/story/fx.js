/* ✨ 효과 — 불꽃·김·입김·반짝임 …
 *
 * 규칙 하나: 모든 효과는 `그리기(ctx, box, t, 설정)` 꼴이다.
 * 자기 시계를 갖지 않고 '몇 초 시점의 그림'을 그려 준다.
 * 그래야 미리보기와 영상 굽기가 똑같은 결과를 낸다 (게임 엔진의 고정 시간 스텝과 같은 원리).
 *
 * 그림체가 크레용·사인펜이므로 선을 일부러 삐뚤빼뚤하게 그린다.
 * 무작위는 쓰지 않고 '자리와 번호로 정해지는 흔들림'을 쓴다 — 그래야 매번 같은 그림이 나온다.
 */

/* 같은 입력이면 항상 같은 값 (0~1). 프레임마다 흔들리지 않게 하는 열쇠 */
function noise(a, b = 0) {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
const lerp = (a, b, k) => a + (b - a) * k;

/** 삐뚤빼뚤한 선 (손으로 그은 느낌) */
function wobbly(ctx, pts, seed, amp = 1.5) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const dx = (noise(seed + i, 1) - 0.5) * amp * 2;
    const dy = (noise(seed + i, 2) - 0.5) * amp * 2;
    i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy);
  });
}

/** 효과가 놓일 자리와 크기 (설정의 위치:0.5,0.7 크기:1.2 를 읽는다) */
function place(box, opt) {
  const p = opt.위치 || opt.pos || [0.5, 0.7];
  const s = parseFloat(opt.크기 ?? opt.size ?? 1);
  const R = Math.min(box.w, box.h);
  return { x: box.x + (+p[0] || 0.5) * box.w, y: box.y + (+p[1] || 0.7) * box.h,
           r: R * 0.16 * s, s };
}

/* ── 🔥 불꽃 — 길쭉한 혀 여러 갈래가 각자 다른 속도로 일렁인다 ── */
function 불꽃(ctx, box, t, opt = {}) {
  const { x, y, r } = place(box, opt);
  const n = 4;
  ctx.save();
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  // 바닥 잉걸불
  ctx.fillStyle = "rgba(255,120,40,0.35)";
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.95, r * 0.24, 0, 0, 7);
  ctx.fill();

  const 색 = ["#e8571e", "#ff8b2e", "#ffc23d", "#fff0a8"];
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);                             // 0=바깥, 1=속불꽃
    const wob = Math.sin(t * (4.2 + i * 1.3) + i * 2.1);
    const h = r * (2.5 - k * 1.15) * (0.9 + wob * 0.14);   // 위로 길게
    const w = r * (0.72 - k * 0.16);
    const lean = wob * r * (0.3 - k * 0.14);           // 위로 갈수록 휘어짐
    const pts = [];
    const side = dir => {
      for (let j = 0; j <= 12; j++) {
        const u = j / 12;
        // 아래는 통통, 위는 뾰족 — 끝이 살짝 휘도록
        const spread = Math.pow(Math.sin((1 - u) * Math.PI * 0.62 + 0.15), 1.3) * w;
        const cx = x + lean * u * u + Math.sin(t * 6 + u * 5 + i) * r * 0.06 * u;
        pts.push([cx + dir * spread, y - h * u]);
      }
    };
    side(-1);
    for (let j = 12; j >= 0; j--) {                    // 오른쪽은 거꾸로 담아 닫는다
      const u = j / 12;
      const spread = Math.pow(Math.sin((1 - u) * Math.PI * 0.62 + 0.15), 1.3) * w;
      const cx = x + lean * u * u + Math.sin(t * 6 + u * 5 + i) * r * 0.06 * u;
      pts.push([cx + spread, y - h * u]);
    }
    ctx.fillStyle = 색[i];
    wobbly(ctx, pts, i * 17 + Math.floor(t * 10), r * 0.035);
    ctx.closePath();
    ctx.fill();
    if (i === 0) {                                     // 바깥쪽만 테두리 (손그림 느낌)
      ctx.strokeStyle = "rgba(120,52,10,0.5)";
      ctx.lineWidth = Math.max(1.3, r * 0.055);
      ctx.stroke();
    }
  }
  // 튀는 불티
  ctx.fillStyle = "#ffd36b";
  for (let i = 0; i < 6; i++) {
    const p = (t * 0.8 + i / 6) % 1;
    const px = x + (noise(i, 3) - 0.5) * r * 1.5 + Math.sin(t * 3 + i) * r * 0.25;
    const py = y - r * 2.2 - p * r * 1.8;
    ctx.globalAlpha = (1 - p) * 0.9;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.07 * (1 - p * 0.5), 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

/* ── 💨 김 (모락모락) — 구불구불 올라가며 옅어진다 ── */
function 김(ctx, box, t, opt = {}) {
  const { x, y, r } = place(box, opt);
  const n = Math.round(opt.갈래 ? +opt.갈래 : 3);
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = opt.색 || "rgba(206,206,206,0.95)";
  for (let i = 0; i < n; i++) {
    const p = ((t * 0.42 + i / n) % 1);
    const rise = p * r * 3.2;
    const spread = r * 0.34 * (i - (n - 1) / 2);
    const pts = [];
    for (let j = 0; j <= 12; j++) {
      const u = j / 12;
      const curl = Math.sin(u * 4.5 + t * 2.2 + i * 1.7) * r * 0.3 * (0.25 + u);
      pts.push([x + spread + curl, y - rise * u - r * 0.1]);
    }
    ctx.globalAlpha = Math.sin(p * Math.PI) * 0.95;
    ctx.lineWidth = Math.max(2.5, r * 0.22 * (1 - p * 0.35));
    wobbly(ctx, pts, i * 31, r * 0.02);
    ctx.stroke();
  }
  ctx.restore();
}

/* ── 🌬 입김 (후~) — 입에서 뭉게뭉게 뿜어 나가 퍼지며 사라진다 ── */
function 입김(ctx, box, t, opt = {}) {
  const { x, y, r } = place(box, opt);
  const dir = (opt.방향 === "왼쪽" ? -1 : 1);
  const period = parseFloat(opt.주기 ?? 2.0);
  ctx.save();
  ctx.fillStyle = opt.색 || "rgba(206,232,255,0.9)";
  ctx.strokeStyle = "rgba(120,170,215,0.55)";
  for (let i = 0; i < 4; i++) {
    const p = ((t / period + i * 0.2) % 1);
    if (p > 0.95) continue;
    const dist = p * r * 2.6;
    const puff = r * (0.22 + p * 0.62);                 // 나아갈수록 커진다
    const cx = x + dir * (r * 0.22 + dist);
    const cy = y + Math.sin(t * 2 + i) * r * 0.12 + dist * 0.12;
    ctx.globalAlpha = Math.sin(Math.min(1, p * 1.4) * Math.PI) * 0.8;
    // 동글동글 세 덩이를 겹쳐 구름처럼
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * 6.283 + t * 1.2 + i;
      const bx = cx + Math.cos(a) * puff * 0.42;
      const by = cy + Math.sin(a) * puff * 0.3;
      ctx.moveTo(bx + puff * 0.62, by);
      ctx.arc(bx, by, puff * 0.62, 0, 7);
    }
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.035);
    ctx.stroke();
  }
  ctx.restore();
}

/* ── ✨ 반짝임 — 네 갈래 별이 톡톡 떴다 사라진다 ── */
function 반짝임(ctx, box, t, opt = {}) {
  const { x, y, r } = place(box, opt);
  const n = Math.round(opt.개수 ? +opt.개수 : 6);
  const spread = r * (parseFloat(opt.범위 ?? 2.2));
  ctx.save();
  ctx.fillStyle = opt.색 || "#ffe66b";
  for (let i = 0; i < n; i++) {
    const p = ((t * 0.75 + noise(i, 5)) % 1);
    const px = x + (noise(i, 6) - 0.5) * spread;
    const py = y + (noise(i, 7) - 0.5) * spread - p * r * 0.5;
    const k = Math.sin(p * Math.PI);                    // 떴다 사라짐
    const s = r * 0.26 * k * (0.6 + noise(i, 8) * 0.8);
    if (s < 0.4) continue;
    ctx.globalAlpha = k;
    ctx.beginPath();
    for (let j = 0; j < 8; j++) {                       // 네 갈래 별
      const a = -Math.PI / 2 + j * Math.PI / 4;
      const rr = j % 2 ? s * 0.28 : s;
      ctx.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/* ── 💗 하트 — 둥실둥실 떠오른다 ── */
function 하트(ctx, box, t, opt = {}) {
  const { x, y, r } = place(box, opt);
  const n = Math.round(opt.개수 ? +opt.개수 : 4);
  ctx.save();
  ctx.fillStyle = opt.색 || "#ff7b95";
  for (let i = 0; i < n; i++) {
    const p = ((t * 0.42 + i / n) % 1);
    const s = r * 0.3 * (0.7 + noise(i, 9) * 0.6);
    const px = x + (noise(i, 10) - 0.5) * r * 1.4 + Math.sin(t * 1.8 + i * 2) * r * 0.22;
    const py = y - p * r * 2.4;
    ctx.globalAlpha = Math.sin(p * Math.PI) * 0.95;
    ctx.beginPath();
    ctx.moveTo(px, py + s * 0.85);
    ctx.bezierCurveTo(px - s * 1.5, py - s * 0.2, px - s * 0.6, py - s * 1.2, px, py - s * 0.35);
    ctx.bezierCurveTo(px + s * 0.6, py - s * 1.2, px + s * 1.5, py - s * 0.2, px, py + s * 0.85);
    ctx.fill();
  }
  ctx.restore();
}

/* ── 💦 땀방울 — 놀라거나 당황할 때 ── */
function 땀(ctx, box, t, opt = {}) {
  const { x, y, r } = place(box, opt);
  ctx.save();
  ctx.fillStyle = "rgba(130,195,255,0.92)";
  for (let i = 0; i < 2; i++) {
    const p = ((t * 0.8 + i * 0.5) % 1);
    const px = x + (i ? r * 0.7 : -r * 0.7);
    const py = y + p * p * r * 1.6;
    const s = r * 0.2;
    ctx.globalAlpha = 1 - p * 0.6;
    ctx.beginPath();
    ctx.moveTo(px, py - s * 1.5);
    ctx.bezierCurveTo(px + s, py, px + s * 0.7, py + s, px, py + s);
    ctx.bezierCurveTo(px - s * 0.7, py + s, px - s, py, px, py - s * 1.5);
    ctx.fill();
  }
  ctx.restore();
}

/* ── 🌟 집중선 — 놀람·강조 (화면 가장자리에서 안쪽으로) ── */
function 집중선(ctx, box, t, opt = {}) {
  ctx.save();
  ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const R = Math.hypot(box.w, box.h) / 2;
  const n = 26;
  ctx.save();
  ctx.strokeStyle = opt.색 || "rgba(40,30,20,0.5)";
  ctx.lineCap = "round";
  const pulse = 0.72 + Math.sin(t * 8) * 0.06;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + noise(i, 11) * 0.1;
    const inner = R * (pulse + noise(i, 12) * 0.12);
    ctx.lineWidth = 1 + noise(i, 13) * 3;
    ctx.globalAlpha = 0.5 + noise(i, 14) * 0.4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

/* ── ⚡ 번쩍 — 놀람·전환 순간 화면 전체가 번쩍인다 ── */
function 번쩍(ctx, box, t, opt = {}) {
  const dur = parseFloat(opt.길이 ?? 0.35);
  const k = Math.max(0, 1 - t / dur);
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha = k * (parseFloat(opt.세기 ?? 0.85));
  ctx.fillStyle = opt.색 || "#ffffff";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.restore();
}

/* ── 🎨 색덮기 — 화면 전체에 색을 얹는다 (밤·석양·회상) ── */
function 색덮기(ctx, box, t, opt = {}) {
  ctx.save();
  ctx.globalAlpha = parseFloat(opt.세기 ?? 0.3);
  ctx.fillStyle = opt.색 || "#2b3a67";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.restore();
}

/* ── 💥 뿅 — 한 점에서 터지듯 퍼지는 만화 표시 ── */
function 뿅(ctx, box, t, opt = {}) {
  const { x, y, r } = place(box, opt);
  const dur = parseFloat(opt.길이 ?? 0.6);
  const p = Math.min(1, t / dur);
  if (p >= 1) return;
  ctx.save();
  ctx.globalAlpha = 1 - p;
  ctx.strokeStyle = opt.색 || "#ffd36b";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2, r * 0.14 * (1 - p));
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + noise(i, 21) * 0.3;
    const r0 = r * (0.3 + p * 1.2), r1 = r0 + r * 0.5 * (1 - p);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();
}

/* ── ❄ 눈 · 🌧 비 · 🌸 꽃잎 — 화면 전체에 계속 내리는 것 ── */
function 내리는것(ctx, box, t, opt, kind) {
  const n = Math.round(opt.개수 ? +opt.개수 : (kind === "비" ? 40 : 26));
  const S = Math.min(box.w, box.h);
  const speed = parseFloat(opt.속도 ?? 1);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const sx = noise(i, 31), phase = noise(i, 32);
    const fall = kind === "비" ? 1.7 : (kind === "눈" ? 0.32 : 0.24);
    const p = (t * fall * speed + phase) % 1;
    const drift = kind === "비" ? 0 : Math.sin(t * (0.9 + sx) + i) * S * 0.05;
    const x = box.x + sx * box.w + drift;
    const y = box.y + p * (box.h + S * 0.1) - S * 0.05;
    const s = S * (kind === "비" ? 0.02 : 0.016) * (0.6 + noise(i, 33) * 0.9);
    ctx.globalAlpha = kind === "비" ? 0.5 : 0.85;
    if (kind === "비") {
      ctx.strokeStyle = opt.색 || "rgba(170,205,235,0.8)";
      ctx.lineWidth = Math.max(1, s * 0.5);
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x - S * 0.012, y + S * 0.05);
      ctx.stroke();
    } else if (kind === "눈") {
      ctx.fillStyle = opt.색 || "#ffffff";
      ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill();
    } else {                                   // 꽃잎
      ctx.fillStyle = opt.색 || "#ffc0d4";
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * (1 + sx) + i);
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 1.6, s * 0.85, 0, 0, 7);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

/* ── 💭 물음표·느낌표 — 머리 위에 톡 뜨는 만화 기호 ── */
function 기호(ctx, box, t, opt, mark) {
  const { x, y, r } = place(box, opt);
  const p = Math.min(1, t / 0.35);
  const bob = Math.sin(t * 4) * r * 0.12;
  ctx.save();
  ctx.globalAlpha = Math.min(1, p * 1.5);
  ctx.translate(x, y + bob - r * 0.2);
  ctx.scale(0.6 + p * 0.4, 0.6 + p * 0.4);
  ctx.font = `700 ${r * 2.2}px "Gaegu", system-ui`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = r * 0.22; ctx.strokeStyle = "#fff";
  ctx.strokeText(mark, 0, 0);
  ctx.fillStyle = opt.색 || (mark === "?" ? "#5b8def" : "#e8556d");
  ctx.fillText(mark, 0, 0);
  ctx.restore();
}

/* ── 🍠 고구마 — 구워질수록 김이 오르고 색이 진해진다 ── */
function 고구마(ctx, box, t, opt = {}) {
  const { x, y, r } = place(box, opt);
  const n = Math.round(opt.개수 ? +opt.개수 : 3);
  const 익음 = Math.min(1, (parseFloat(opt.익힘 ?? 0)) || 0);   // 0=날것 1=다 구움
  ctx.save();
  for (let i = 0; i < n; i++) {
    const a = -0.5 + (i - (n - 1) / 2) * 0.55;
    const px = x + (i - (n - 1) / 2) * r * 0.85;
    const py = y + Math.abs(i - (n - 1) / 2) * r * 0.12;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a * 0.5);
    // 몸통 — 익을수록 자주빛이 진해진다
    const c0 = [214, 150, 106], c1 = [140, 74, 132];
    const col = c0.map((v, k) => Math.round(v + (c1[k] - v) * (0.35 + 익음 * 0.65)));
    ctx.fillStyle = `rgb(${col.join(",")})`;
    ctx.strokeStyle = "rgba(70,40,25,0.8)";
    ctx.lineWidth = Math.max(1.4, r * 0.055);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.62, r * 0.3, 0, 0, 7);
    ctx.fill(); ctx.stroke();
    // 끝이 뾰족한 느낌 (양끝 살짝)
    ctx.fillStyle = `rgba(${col.map(v => Math.max(0, v - 30)).join(",")},0.7)`;
    ctx.beginPath(); ctx.ellipse(r * 0.5, 0, r * 0.12, r * 0.1, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-r * 0.5, 0, r * 0.12, r * 0.1, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // 다 익으면 김이 모락모락
  if (익음 > 0.55) {
    김(ctx, box, t, { ...opt, 위치: [(x - box.x) / box.w, (y - box.y) / box.h - 0.05],
                      갈래: 2, 크기: (parseFloat(opt.크기) || 1) * 0.7 });
  }
}

/* ── 🪵 장작 — 엇갈려 쌓은 나무 ── */
function 장작(ctx, box, t, opt = {}) {
  const { x, y, r } = place(box, opt);
  ctx.save();
  ctx.strokeStyle = "rgba(70,40,25,0.85)";
  ctx.lineCap = "round";
  const 나무 = [[-0.9, 0.15, 0.18], [0.9, -0.1, -0.22], [-0.5, -0.3, 0.55],
                [0.4, 0.25, -0.6], [0, -0.05, 0.05]];
  나무.forEach(([dx, dy, a], i) => {
    ctx.save();
    ctx.translate(x + dx * r * 0.55, y + dy * r * 0.5);
    ctx.rotate(a);
    ctx.fillStyle = i % 2 ? "#c08a52" : "#a9743f";
    ctx.lineWidth = Math.max(1.3, r * 0.05);
    ctx.beginPath();
    ctx.roundRect(-r * 0.62, -r * 0.11, r * 1.24, r * 0.22, r * 0.1);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  });
  ctx.restore();
}

export const EFFECTS = {
  "고구마": { fn: 고구마, ko: "고구마", 기본위치: [0.5, 0.78] },
  "장작": { fn: 장작, ko: "장작 (모닥불 나무)", 기본위치: [0.5, 0.8] },
  "번쩍": { fn: 번쩍, ko: "번쩍 (섬광)", 기본위치: [0.5, 0.5] },
  "색덮기": { fn: 색덮기, ko: "색 덮기 (밤·회상)", 기본위치: [0.5, 0.5] },
  "뿅": { fn: 뿅, ko: "뿅 (터짐)", 기본위치: [0.5, 0.45] },
  "눈": { fn: (c, b, t, o) => 내리는것(c, b, t, o, "눈"), ko: "눈 내림", 기본위치: [0.5, 0.5] },
  "비": { fn: (c, b, t, o) => 내리는것(c, b, t, o, "비"), ko: "비 내림", 기본위치: [0.5, 0.5] },
  "꽃잎": { fn: (c, b, t, o) => 내리는것(c, b, t, o, "꽃잎"), ko: "꽃잎 날림", 기본위치: [0.5, 0.5] },
  "물음표": { fn: (c, b, t, o) => 기호(c, b, t, o, "?"), ko: "물음표", 기본위치: [0.5, 0.3] },
  "느낌표": { fn: (c, b, t, o) => 기호(c, b, t, o, "!"), ko: "느낌표", 기본위치: [0.5, 0.3] },
  "불꽃": { fn: 불꽃, ko: "불꽃", 기본위치: [0.5, 0.72] },
  "김":   { fn: 김,   ko: "김 (모락모락)", 기본위치: [0.5, 0.6] },
  "입김": { fn: 입김, ko: "입김 (후~)", 기본위치: [0.5, 0.45] },
  "반짝임": { fn: 반짝임, ko: "반짝임", 기본위치: [0.5, 0.45] },
  "하트": { fn: 하트, ko: "하트", 기본위치: [0.5, 0.45] },
  "땀":   { fn: 땀,   ko: "땀방울", 기본위치: [0.5, 0.35] },
  "집중선": { fn: 집중선, ko: "집중선 (강조)", 기본위치: [0.5, 0.5] },
};

/** 효과 하나를 그린다 */
export function drawEffect(ctx, box, name, t, opt = {}) {
  const e = EFFECTS[name];
  if (!e) return false;
  e.fn(ctx, box, t, opt);
  return true;
}
