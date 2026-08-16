/* 💬 자막 꾸미기 — 글꼴·자리·바탕·테두리를 한곳에서 정한다.
 *
 * 자막은 이 프로그램에서 **말을 대신하는 자리**다 (목소리를 쓰지 않으니까).
 * 그래서 읽기 쉬운지가 영상 품질을 거의 결정한다.
 *
 * 여기서 정하는 것
 *   ① 글꼴 — 이 컴퓨터에 든 한글 글꼴 8종 (전부 열린 라이선스라 유튜브에 올려도 된다)
 *   ② 자리 — 위·가운데·아래, 왼쪽·가운데·오른쪽, 그리고 미세 조정
 *   ③ 바탕 — 없음 · 띠 · 박스 · 종이 · 그림자만
 *   ④ 테두리 — 글자 둘레를 파 주면 어떤 배경에서도 읽힌다
 *
 * 낱낱이 고르기 번거로우니 **차림표(프리셋)** 를 먼저 둔다. 하나 고르고 조금만 고치면 된다.
 */

/* ── 글꼴 ──
   app/fonts 안에 있는 것만 쓴다. 인터넷에서 받아오지 않는다 (없으면 안 나오니까). */
export const FONTS = {
  "손글씨":   { file: "Gaegu-Bold.ttf",            ko: "손글씨 (개구)",     느낌: "동글동글 편안한" },
  "붓글씨":   { file: "NanumPenScript-Regular.ttf", ko: "붓글씨 (나눔펜)",   느낌: "손으로 쓴 듯" },
  "동화":     { file: "HiMelody-Regular.ttf",      ko: "동화 (하이멜로디)",느낌: "여리고 귀여운" },
  "또박":     { file: "GowunDodum-Regular.ttf",    ko: "또박 (고운돋움)",   느낌: "깔끔하고 읽기 쉬운" },
  "귀염":     { file: "Jua-Regular.ttf",           ko: "귀염 (주아)",       느낌: "통통한 제목용" },
  "굵게":     { file: "BlackHanSans-Regular.ttf",  ko: "굵게 (검은한산스)",느낌: "아주 굵은 강조용" },
  "각진":     { file: "DoHyeon-Regular.ttf",       ko: "각진 (도현)",       느낌: "또렷한 예능풍" },
  "삐뚤":     { file: "PoorStory-Regular.ttf",     ko: "삐뚤 (푸어스토리)",느낌: "장난스러운" },
};
export const FONT_NAMES = Object.keys(FONTS);

const 실린것 = new Set();
/** 글꼴을 브라우저에 실어 둔다 (한 번만). 미리보기와 굽기가 같은 글꼴을 쓰게. */
export async function loadFonts(이름들 = FONT_NAMES) {
  const 할일 = [];
  for (const n of 이름들) {
    const f = FONTS[n];
    if (!f || 실린것.has(n)) continue;
    실린것.add(n);
    할일.push((async () => {
      try {
        const ff = new FontFace(n, `url("/p/fonts/${f.file}")`);
        await ff.load();
        document.fonts.add(ff);
      } catch { 실린것.delete(n); }
    })());
  }
  await Promise.all(할일);
}

/* ── 바탕 모양 ── */
export const BACKINGS = {
  "없음":     { ko: "없음",        설명: "글씨만 (테두리로 읽힘을 지킨다)" },
  "박스":     { ko: "박스",        설명: "글줄 뒤 네모 (유튜브 자막처럼)" },
  "띠":       { ko: "띠",          설명: "화면 가로를 가로지르는 띠" },
  "종이":     { ko: "종이",        설명: "테두리 있는 둥근 종이 (기본)" },
  "그림자":   { ko: "그림자만",    설명: "바탕 없이 글자 뒤에 그늘" },
};

/* ── 차림표 ──
   낱낱이 고르지 않아도 되게. 하나 고르고 조금만 고치면 된다. */
export const PRESETS = {
  "종이":   { ko: "📜 종이", 값: { 글꼴: "손글씨", 크기: 0.062, 색: "#2b2119", 바탕: "종이",
                                 바탕색: "#fffdf6", 투명도: 0.9, 테두리: 0, 테두리색: "#000000" } },
  "유튜브": { ko: "▶ 유튜브", 값: { 글꼴: "또박", 크기: 0.055, 색: "#ffffff", 바탕: "박스",
                                 바탕색: "#000000", 투명도: 0.72, 테두리: 0, 테두리색: "#000000" } },
  "영화":   { ko: "🎬 영화", 값: { 글꼴: "또박", 크기: 0.052, 색: "#ffffff", 바탕: "없음",
                                 바탕색: "#000000", 투명도: 0, 테두리: 0.09, 테두리색: "#000000" } },
  "예능":   { ko: "🎉 예능", 값: { 글꼴: "굵게", 크기: 0.085, 색: "#ffe14d", 바탕: "없음",
                                 바탕색: "#000000", 투명도: 0, 테두리: 0.16, 테두리색: "#2a1a00" } },
  "만화":   { ko: "💬 만화", 값: { 글꼴: "귀염", 크기: 0.062, 색: "#1a1a1a", 바탕: "박스",
                                 바탕색: "#ffffff", 투명도: 1, 테두리: 0, 테두리색: "#000000" } },
  "속삭임": { ko: "🌙 속삭임", 값: { 글꼴: "붓글씨", 크기: 0.058, 색: "#e8e2d8", 바탕: "그림자",
                                 바탕색: "#000000", 투명도: 0.5, 테두리: 0, 테두리색: "#000000" } },
};

/** 아무것도 안 적었을 때의 모양 */
export const 기본모양 = () => ({
  글꼴: "손글씨", 크기: 0.062, 색: "#2b2119",
  가로: "가운데", 세로: "아래", 높이: null,       // 높이를 적으면 세로를 무시한다
  바탕: "종이", 바탕색: "#fffdf6", 투명도: 0.9,
  테두리: 0, 테두리색: "#000000", 등장: "팝", 타자속도: 22,
});

/** 대본에 적은 것 → 그림에 쓸 값 (모르는 말은 조용히 버린다) */
export function 모양읽기(적은것 = {}, 바탕값 = null) {
  const o = { ...(바탕값 || 기본모양()) };
  const 차림 = 적은것.차림표 || 적은것.모양;
  if (차림 && PRESETS[차림]) Object.assign(o, PRESETS[차림].값);
  const 숫자 = v => (v == null || v === "" ? null : parseFloat(v));
  const 넣기 = (키, 값) => { if (값 != null && !Number.isNaN(값)) o[키] = 값; };

  if (적은것.글꼴 && FONTS[적은것.글꼴]) o.글꼴 = 적은것.글꼴;
  넣기("크기", 숫자(적은것.크기 ?? 적은것.글자크기));
  if (적은것.색) o.색 = 적은것.색;
  if (적은것.가로) o.가로 = 적은것.가로;
  if (적은것.세로) o.세로 = 적은것.세로;
  넣기("높이", 숫자(적은것.높이));
  if (적은것.바탕 && BACKINGS[적은것.바탕]) o.바탕 = 적은것.바탕;
  if (적은것.바탕색) o.바탕색 = 적은것.바탕색;
  넣기("투명도", 숫자(적은것.투명도));
  넣기("테두리", 숫자(적은것.테두리));
  if (적은것.테두리색) o.테두리색 = 적은것.테두리색;
  if (적은것.등장) o.등장 = 적은것.등장;
  넣기("타자속도", 숫자(적은것.타자속도));
  return o;
}

/** #rrggbb + 투명도 → rgba() */
function 색투명(색, a) {
  const m = String(색 || "").match(/^#?([0-9a-f]{6})$/i);
  if (!m) return 색;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 값 → 대본에 적을 글 (기본과 같은 것은 안 적는다 — 대본이 지저분해지지 않게) */
export function 모양쓰기(o, 바탕값 = null) {
  const 기본 = 바탕값 || 기본모양();
  const 조각 = [];
  const 넣기 = (이름, 값, 기본값) => {
    if (값 == null || 값 === "" || String(값) === String(기본값)) return;
    조각.push(`${이름}:${값}`);
  };
  넣기("글꼴", o.글꼴, 기본.글꼴);
  넣기("크기", o.크기, 기본.크기);
  넣기("색", o.색, 기본.색);
  넣기("가로", o.가로, 기본.가로);
  넣기("세로", o.세로, 기본.세로);
  넣기("높이", o.높이, 기본.높이);
  넣기("바탕", o.바탕, 기본.바탕);
  if (o.바탕 !== "없음") {
    넣기("바탕색", o.바탕색, 기본.바탕색);
    넣기("투명도", o.투명도, 기본.투명도);
  }
  넣기("테두리", o.테두리, 기본.테두리);
  if (+o.테두리 > 0) 넣기("테두리색", o.테두리색, 기본.테두리색);
  넣기("등장", o.등장, 기본.등장);
  return 조각.join(" ");
}

/* ── 그리기 ──
   미리보기와 굽기가 **같은 함수**를 쓴다. 그래야 본 대로 나온다. */
export function drawSubtitle(ctx, box, text, k, 적은것 = {}, 바탕값 = null) {
  if (!text) return null;
  const o = 모양읽기(적은것, 바탕값);
  const S = Math.min(box.w, box.h);
  const size = (o.크기 || 0.062) * S;

  ctx.save();
  ctx.font = `700 ${size}px "${o.글꼴}", "Gaegu", system-ui, sans-serif`;
  ctx.textBaseline = "middle";

  /* 줄바꿈 — 화면 폭의 86% 안에 들어오게 */
  const maxW = box.w * 0.86;
  const 낱말 = String(text).split(/(\s+)/);
  let lines = [], cur = "";
  for (const w of 낱말) {
    if (ctx.measureText(cur + w).width > maxW && cur.trim()) { lines.push(cur.trim()); cur = w; }
    else cur += w;
  }
  if (cur.trim()) lines.push(cur.trim());

  /* 등장 연출 */
  const mode = o.등장 || "팝";
  const kk = Math.min(1, k * 6);
  let pop = 0.85 + kk * 0.15, slide = 0;
  if (mode === "올라옴") { pop = 1; slide = (1 - kk) * size * 1.2; }
  else if (mode === "튀어나옴") {
    const c = 2.70158, q = Math.min(1, k * 3.5);
    pop = 0.5 + (1 + c * Math.pow(q - 1, 3) + 1.70158 * Math.pow(q - 1, 2)) * 0.5;
  }
  if (mode === "타이핑" || mode === "한글자씩") {
    let 남은 = Math.max(0, Math.floor(k * (o.타자속도 || 22)));
    for (let i = 0; i < lines.length; i++) {
      if (남은 >= lines[i].length) { 남은 -= lines[i].length; continue; }
      lines[i] = lines[i].slice(0, 남은);
      lines.length = i + 1;
      break;
    }
  }

  const lineH = size * 1.24;
  const totalH = lines.length * lineH;

  /* 세로 자리 — `높이:` 를 적었으면 그것이 이긴다 (0=맨 위, 1=맨 아래) */
  const 세로영상 = box.h / box.w > 1.4;
  const 세로표 = { "위": 0.16, "가운데": 0.5, "아래": 세로영상 ? 0.80 : 0.86 };
  const 높이비 = o.높이 != null ? o.높이 : (세로표[o.세로] ?? 세로표["아래"]);
  const cy = box.y + box.h * 높이비 - totalH / 2;

  /* 가로 자리 — 가장자리는 화면 끝에서 7% 띄운다 */
  const 여백 = box.w * 0.07;
  const 가로표 = {
    "왼쪽":   { x: box.x + 여백, align: "left" },
    "가운데": { x: box.x + box.w / 2, align: "center" },
    "오른쪽": { x: box.x + box.w - 여백, align: "right" },
  };
  const { x: cx, align } = 가로표[o.가로] || 가로표["가운데"];
  ctx.textAlign = align;

  ctx.globalAlpha = Math.min(1, k * 8);
  ctx.translate(cx, cy + slide); ctx.scale(pop, pop); ctx.translate(-cx, -cy);

  /* 글줄 상자 — 바탕을 그릴 때 쓴다 */
  const wMax = Math.max(0, ...lines.map(l => ctx.measureText(l).width));
  const padX = size * 0.55, padY = size * 0.38;
  const 왼 = align === "left" ? cx - padX
           : align === "right" ? cx - wMax - padX
           : cx - wMax / 2 - padX;
  const 상자 = { x: 왼, y: cy - padY, w: wMax + padX * 2, h: totalH + padY * 2 - lineH * 0.1 };

  /* ① 바탕 */
  const a = o.투명도 == null ? 0.9 : +o.투명도;
  if (o.바탕 === "종이") {
    ctx.fillStyle = 색투명(o.바탕색, a);
    ctx.strokeStyle = "rgba(60,45,30,0.5)";
    ctx.lineWidth = Math.max(1.5, size * 0.045);
    ctx.beginPath();
    ctx.roundRect(상자.x, 상자.y, 상자.w, 상자.h, size * 0.4);
    ctx.fill(); ctx.stroke();
  } else if (o.바탕 === "박스") {
    ctx.fillStyle = 색투명(o.바탕색, a);
    ctx.beginPath();
    ctx.roundRect(상자.x, 상자.y, 상자.w, 상자.h, size * 0.12);
    ctx.fill();
  } else if (o.바탕 === "띠") {
    ctx.fillStyle = 색투명(o.바탕색, a);
    ctx.fillRect(box.x, 상자.y, box.w, 상자.h);
  } else if (o.바탕 === "그림자") {
    ctx.shadowColor = 색투명(o.바탕색, Math.min(1, a + 0.2));
    ctx.shadowBlur = size * 0.5;
    ctx.shadowOffsetY = size * 0.06;
  }

  /* ② 테두리 — 굵게 파 주면 어떤 배경에서도 읽힌다 */
  const 테 = (+o.테두리 || 0) * size;
  if (테 > 0) {
    ctx.strokeStyle = o.테두리색 || "#000";
    ctx.lineWidth = 테;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    lines.forEach((l, i) => ctx.strokeText(l, cx, cy + lineH * (i + 0.5)));
  }

  /* ③ 글자 */
  ctx.fillStyle = o.색 || "#2b2119";
  lines.forEach((l, i) => ctx.fillText(l, cx, cy + lineH * (i + 0.5)));
  ctx.restore();
  return 상자;              // 어디에 그렸는지 (미리보기에서 테두리를 보여 주려고)
}
