/* 🎬 연출 — 코드가 그려 주는 것들을 모아 보여 준다.
 *
 * 이 프로그램의 재료는 두 갈래다.
 *   ① 올리는 것  — 캐릭터·배경·음악 그림/소리 파일 (자산 탭의 나머지 갈래)
 *   ② **코드가 그리는 것** — 효과·소품·전환·분위기·상태·표정·동작·자막 모양
 *
 * ②는 파일이 없으니 목록도 없었다. 그래서 17가지 효과가 있는 줄도 모르고
 * 늘 쓰던 `반짝임` 만 쓰게 됐다. 여기서 **실제 그리는 함수 그대로** 그려 보여 준다.
 * 미리보기와 굽기와 이 화면이 언제나 같은 그림인 까닭이다.
 *
 * 칸을 누르면 **대본에 적을 글**이 복사된다 — 보는 것에서 쓰는 것까지 한 걸음이다.
 */
import { $, escapeHtml } from "../core.js";
import { EFFECTS, drawEffect } from "../story/fx.js";
import { PROPS, drawProp } from "../story/props.js";
import { MOODS, applyPost } from "../story/post.js";
import { STATES } from "./moods.js";
import { EXPRESSIONS, BODY_MOVES, TEARS } from "./face.js";
import { library } from "../story/assets.js";
import { TRANSITIONS, TRANSITION_NAMES, Stage } from "../story/stage.js";
import { SPOTS } from "../story/script.js";
import { PRESETS, BACKINGS, FONTS, drawSubtitle, loadFonts, 기본모양 } from "../story/subtitle.js";
import { drawScenery } from "../story/scenery.js";

/* 어떤 갈래를 보여 주나 — 이름·설명·몇 칸으로 나눌지 */
const 갈래들 = [
  { 키: "효과",   이름: "✨ 효과",     수: () => Object.keys(EFFECTS).length },
  { 키: "소품",   이름: "🧸 소품",     수: () => Object.keys(PROPS).length },
  { 키: "상태",   이름: "😀 상태",     수: () => Object.keys(STATES).length },
  { 키: "표정",   이름: "🙂 표정",     수: () => Object.keys(EXPRESSIONS).length },
  { 키: "동작",   이름: "🕺 동작",     수: () => Object.keys(BODY_MOVES).length },
  { 키: "눈물",   이름: "💧 눈물",     수: () => Object.keys(TEARS).length },
  { 키: "분위기", 이름: "🌗 분위기",   수: () => Object.keys(MOODS).length },
  { 키: "전환",   이름: "🎞 장면 전환", 수: () => TRANSITION_NAMES.length },
  { 키: "자리",   이름: "📍 자리",     수: () => Object.keys(SPOTS).length },
  { 키: "자막",   이름: "💬 자막 모양", 수: () => Object.keys(PRESETS).length },
  { 키: "소리",   이름: "🔊 효과음",   수: () => 효과음들.length },
];

let 지금갈래 = localStorage.getItem("연출갈래") || "효과";
let 효과음들 = [];
let 찾는말 = "";
let 움직이나 = true;
let raf = 0;
const 칸들 = [];            // {canvas, 그리기(t)}

/* ── 배경 한 장 — 효과·소품이 허공에 뜨면 뭘 보는 건지 모른다 ── */
function 바탕(ctx, box, 이름 = "노을 들판") {
  try { drawScenery(ctx, box, 이름); }
  catch { ctx.fillStyle = "#241f2e"; ctx.fillRect(box.x, box.y, box.w, box.h); }
}

/* ── 보여 줄 캐릭터 하나 ──
   올린 그림을 쓰면 사람마다 다르게 보인다. **코드가 그리는 캐릭터**를 써서
   누가 보든 같은 그림 위에서 표정·동작만 달라지게 한다. */
let 배우 = null;
/** 그리기는 한 장씩 순식간에 끝나야 하므로 **미리** 받아 둔다 (autoCharacter 는 약속을 준다) */
async function 배우받기() {
  if (배우) return 배우;
  try { 배우 = await library.autoCharacter("누렁이 강아지", "front"); }
  catch { 배우 = null; }
  return 배우;
}

/** 배우 한 마리를 그린다 — 무대(stage.js)와 같은 방식으로 */
function 배우그리기(ctx, box, t, 짓 = {}) {
  const a = 배우;
  if (!a || !a.draw) return;
  const 높이 = box.h * (짓.크기 ?? 0.66);
  const 자리 = { x: box.w * (짓.x ?? 0.5) - 높이 / 2,
                 y: box.h * (짓.y ?? 0.72) - 높이,
                 w: 높이, h: 높이 };
  a.move = 짓.동작 || "breathe";
  a.expr = 짓.표정 || "blink";
  a.tear = 짓.눈물 || "none";
  try { a.draw(ctx, 자리, t); } catch {}
}

/** 한 칸 만들기 */
function 칸만들기(이름, 설명, 대본글, 그리기) {
  const el = document.createElement("div");
  el.className = "fxCell";
  el.style.cssText = `background:#1a1822; border-radius:10px; overflow:hidden; cursor:pointer;
    border:1px solid #262232; transition:border-color .12s`;
  el.title = "눌러서 대본 글 복사: " + 대본글;

  const cv = document.createElement("canvas");
  cv.width = 260; cv.height = 260;
  cv.style.cssText = "width:100%; height:auto; display:block; background:#0f0d14";

  const 밑 = document.createElement("div");
  밑.style.cssText = "padding:5px 8px 7px";
  밑.innerHTML = `<div style="font-size:12px; font-weight:700">${escapeHtml(이름)}</div>` +
    (설명 ? `<div class="hint" style="font-size:11px; line-height:1.35">${escapeHtml(설명)}</div>` : "");

  el.append(cv, 밑);
  el.addEventListener("mouseenter", () => { el.style.borderColor = "#5b4bb8"; });
  el.addEventListener("mouseleave", () => { el.style.borderColor = "#262232"; });
  el.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(대본글);
      $("fxInfo").textContent = `📋 복사했습니다 — ${대본글}`;
    } catch { $("fxInfo").textContent = 대본글; }
  });

  const ctx = cv.getContext("2d");
  const box = { x: 0, y: 0, w: cv.width, h: cv.height };
  칸들.push({ 그리기: t => { ctx.clearRect(0, 0, cv.width, cv.height); 그리기(ctx, box, t); } });
  return el;
}

/* ── 갈래마다 무엇을 그리나 ────────────────────────────────── */
const 그리는법 = {
  효과: () => Object.entries(EFFECTS).map(([이름, e]) =>
    칸만들기(이름, e.ko || "", `효과 ${이름} 위치:0.5,0.5 크기:1`, (ctx, box, t) => {
      바탕(ctx, box, "한밤 들판");
      try { drawEffect(ctx, box, 이름, t % 4, {}); } catch {}
    })),

  소품: () => Object.keys(PROPS).map(이름 =>
    칸만들기(이름, "", `소품 <내 것> 모양:${이름}`, (ctx, box, t) => {
      바탕(ctx, box, "흰색");
      try { drawProp(ctx, box, 이름, { x: 0.5, y: 0.55 }, 0.42,
                     Math.sin(t * 1.6) * 10); } catch {}
    })),

  상태: () => Object.entries(STATES).map(([이름, s]) =>
    칸만들기(이름, s.ko || "", `<이름> 상태 ${이름}`, (ctx, box, t) => {
      바탕(ctx, box, "아침 들판");
      /* 상태가 정한 표정·동작·효과를 그대로 입혀 본다 —
         대본에서 한 줄 쓰면 정말 이렇게 나온다는 것을 보여야 뜻이 있다. */
      배우그리기(ctx, box, t % 3, { 표정: s.표정, 동작: s.동작, 눈물: s.눈물, 크기: 0.78, y: 0.86 });
      if (s.효과) { try { drawEffect(ctx, box, s.효과, t % 3, {}); } catch {} }
    })),

  표정: () => Object.entries(EXPRESSIONS).map(([이름, e]) =>
    칸만들기(이름, e.ko || "", `<이름> 표정 ${이름} 팝`, (ctx, box, t) => {
      바탕(ctx, box, "흰색");
      배우그리기(ctx, box, t % 3, { 표정: 이름, 동작: "none", 크기: 0.9, y: 0.9 });
    })),

  동작: () => Object.entries(BODY_MOVES).map(([이름, m]) =>
    칸만들기(이름, m.ko || "", `<이름> 동작 ${이름}`, (ctx, box, t) => {
      바탕(ctx, box, "아침 들판");
      배우그리기(ctx, box, t % 4, { 동작: 이름, 크기: 0.72, y: 0.86 });
    })),

  눈물: () => Object.entries(TEARS).map(([이름, x]) =>
    칸만들기(이름, x.ko || "", `<이름> 눈물 ${이름}`, (ctx, box, t) => {
      바탕(ctx, box, "흐림 들판");
      배우그리기(ctx, box, t % 3, { 표정: "sad", 동작: "none", 눈물: 이름, 크기: 0.9, y: 0.9 });
    })),

  분위기: () => Object.keys(MOODS).map(이름 =>
    칸만들기(이름, "", `장면 <…>   분위기:${이름}`, (ctx, box) => {
      바탕(ctx, box, "노을 들판");
      배우그리기(ctx, box, 0.5, { 크기: 0.4 });
      const M = MOODS[이름] || {};
      try {
        applyPost(ctx, box, { 분위기: 이름, 비네트: M.비네트 ?? 0,
                              블룸: M.블룸 ?? 0, 결: M.결 ?? 0, 번쩍: 0 });
      } catch {}
    })),

  전환: () => TRANSITION_NAMES.map(이름 =>
    칸만들기(이름, "", `장면 <…>   전환:${이름}`, (ctx, box, t) => {
      /* 앞 장면 위에 뒷 장면이 어떻게 덮이는가 — 0→1 을 되풀이한다 */
      const k = (t % 2.4) / 2.4;
      바탕(ctx, box, "한밤 들판");
      const 전 = TRANSITIONS[이름];
      ctx.save();
      try { 전?.(ctx, box, k); } catch {}
      바탕(ctx, box, "노을 들판");
      ctx.restore();
    })),

  자리: () => Object.entries(SPOTS).map(([이름, p]) =>
    칸만들기(이름, `${p.x?.toFixed?.(2)}, ${p.y?.toFixed?.(2)}`,
             `<이름> 등장 ${이름}`, (ctx, box) => {
      바탕(ctx, box, "아침 들판");
      배우그리기(ctx, box, 0.5, { x: p.x ?? 0.5, y: p.y ?? 0.7, 크기: 0.34 });
      // 화면 밖 자리는 어디로 나가는지 화살표로
      if (/화면밖/.test(이름)) {
        ctx.fillStyle = "#ffcf6c"; ctx.font = "700 22px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(/왼쪽/.test(이름) ? "←" : "→", box.w * (p.x ?? 0.5) < 0 ? 20 : box.w - 20,
                     box.h * 0.7);
      }
    })),

  자막: () => [
    ...Object.entries(PRESETS).map(([이름, p]) =>
      칸만들기(p.ko || 이름, `차림표 — ${p.값.글꼴} · ${p.값.바탕}`,
               `자막차림표: ${이름}`, (ctx, box) => {
        바탕(ctx, box, "한밤 바다");
        try { drawSubtitle(ctx, box, "여기 자막이 나옵니다", 1, { 차림표: 이름 }); } catch {}
      })),
    ...Object.entries(FONTS).map(([이름, f]) =>
      칸만들기(이름, `글꼴 — ${f.느낌}`, `자막글꼴: ${이름}`, (ctx, box) => {
        바탕(ctx, box, "흰색");
        try { drawSubtitle(ctx, box, "가나다 ABC", 1,
                           { 글꼴: 이름, 크기: 0.11, 세로: "가운데", 바탕: "없음",
                             색: "#2b2119", 테두리: 0 }); } catch {}
      })),
    ...Object.entries(BACKINGS).map(([이름, b]) =>
      칸만들기(이름, `바탕 — ${b.설명}`, `자막바탕: ${이름}`, (ctx, box) => {
        바탕(ctx, box, "노을 들판");
        try { drawSubtitle(ctx, box, "읽히나요?", 1,
                           { 바탕: 이름, 크기: 0.09, 세로: "가운데" }); } catch {}
      })),
  ],

  소리: () => 효과음들.map(이름 => {
    const el = 칸만들기(이름, "눌러 들어 보기", `소리 ${이름}`, (ctx, box) => {
      바탕(ctx, box, "#1a1822");
      ctx.fillStyle = "#8a7fd0"; ctx.font = "600 54px system-ui";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🔊", box.w / 2, box.h / 2);
    });
    // 소리는 보는 것보다 **들어 보는** 것이 낫다 — 누르면 재생하고 글도 복사한다
    el.addEventListener("click", () => {
      try { new Audio(`/p/sfx/${encodeURIComponent(이름)}.mp3`).play().catch(() => {}); } catch {}
    });
    return el;
  }),
};

/* ── 그리기 돌리기 ── */
function 돌리기() {
  cancelAnimationFrame(raf);
  const t0 = performance.now();
  const 한장 = () => {
    const t = (performance.now() - t0) / 1000;
    for (const c of 칸들) { try { c.그리기(움직이나 ? t : 0.6); } catch {} }
    if (움직이나) raf = requestAnimationFrame(한장);
  };
  한장();
}

function 그리기() {
  cancelAnimationFrame(raf);
  칸들.length = 0;
  const 몸 = $("fxBody");
  const 만들기 = 그리는법[지금갈래];
  if (!만들기) { 몸.innerHTML = ""; return; }

  let 칸 = [];
  try { 칸 = 만들기(); } catch (e) {
    몸.innerHTML = `<div class="hint" style="padding:14px">그리지 못했습니다: ${e.message}</div>`;
    return;
  }
  const 걸러낸것 = 찾는말
    ? 칸.filter(el => el.textContent.toLowerCase().includes(찾는말.toLowerCase()))
    : 칸;

  몸.innerHTML = "";
  const 판 = document.createElement("div");
  판.style.cssText = `display:grid; gap:10px; margin-top:6px;
    grid-template-columns:repeat(auto-fill, minmax(196px, 1fr))`;
  걸러낸것.forEach(el => 판.appendChild(el));
  몸.appendChild(판);

  if (!걸러낸것.length) {
    몸.innerHTML = `<div class="hint" style="padding:16px">"${escapeHtml(찾는말)}" 로 찾은 것이 없습니다.</div>`;
    return;
  }
  /* 걸러내면서 칸들 배열에는 안 보이는 것까지 들어 있다 — 보이는 것만 그린다 */
  const 보이는수 = 걸러낸것.length;
  칸들.length = Math.min(칸들.length, 칸.length);
  if (찾는말) {
    const 남길것 = new Set(걸러낸것.map(el => 칸.indexOf(el)));
    for (let i = 칸들.length - 1; i >= 0; i--) if (!남길것.has(i)) 칸들.splice(i, 1);
  }
  $("fxInfo").textContent = `${보이는수}개`;
  돌리기();
}

function 갈래그리기() {
  $("fxKinds").innerHTML = 갈래들.map(g =>
    `<button class="subtab ${g.키 === 지금갈래 ? "on" : ""}" type="button" data-갈래="${g.키}"
     >${g.이름} <span class="hint">${g.수()}</span></button>`).join("");
  $("fxKinds").querySelectorAll("[data-갈래]").forEach(b =>
    b.addEventListener("click", () => {
      지금갈래 = b.dataset.갈래;
      localStorage.setItem("연출갈래", 지금갈래);
      갈래그리기(); 그리기();
    }));
}

export async function mount(root) {
  try { 효과음들 = (await (await fetch("/api/sfx/list")).json()).names || []; }
  catch { 효과음들 = []; }
  try { await loadFonts(); } catch {}
  await 배우받기();          // 표정·동작·상태 칸이 그릴 배우를 미리 세워 둔다

  $("fxFind").addEventListener("input", () => { 찾는말 = $("fxFind").value.trim(); 그리기(); });
  $("fxPlay").addEventListener("change", () => {
    움직이나 = $("fxPlay").checked;
    돌리기();
  });

  갈래그리기();
  그리기();

  /* 이 화면을 떠나면 그리기를 멈춘다 — 안 그러면 뒤에서 계속 돌아 느려진다 */
  const 멈춤보기 = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) cancelAnimationFrame(raf);
    else if (움직이나) 돌리기();
  });
  멈춤보기.observe(root);
}
