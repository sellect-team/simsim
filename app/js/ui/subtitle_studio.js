/* 💬 자막 꾸미기 창 — 눈으로 보면서 고른다.
 *
 * 자막 모양을 글로만 정하면 굽기 전까지 어떻게 나올지 모른다.
 * 그래서 **실제 그리는 함수 그대로** 미리 그려 보여 준다 — 본 대로 나온다.
 *
 * 고른 결과는 대본 글로 돌려준다. 화면에서 되는 일은 글로도 돼야 하기 때문이다.
 *   차림표 고르기 → 낱낱이 다듬기 → [대본에 넣기]
 *
 *   import { openSubtitleStudio } from "../ui/subtitle_studio.js";
 *   openSubtitleStudio({ 글: "안녕하세요", 값: 지금모양, 배경그리기: (ctx, box) => …,
 *                        넣기: (o, 글) => … });
 */
import { escapeHtml } from "../core.js";
import { openModal } from "./modal.js";
import { FONTS, FONT_NAMES, BACKINGS, PRESETS, 기본모양, 모양쓰기,
         drawSubtitle, loadFonts } from "../story/subtitle.js";

const 비율표 = { "9:16": [405, 720], "16:9": [720, 405], "1:1": [560, 560], "4:5": [520, 650] };

export function openSubtitleStudio(opt = {}) {
  const 값 = { ...기본모양(), ...(opt.값 || {}) };
  let 글 = opt.글 || "여기에 자막이 나옵니다";
  let 비율 = opt.비율 || "9:16";
  let 애니 = 0;                       // 등장 연출을 반복해 보여 주려고

  const 창 = openModal({
    제목: "💬 자막 꾸미기",
    너비: "min(1120px, 96vw)",
    안내: "왼쪽은 <b>실제로 구울 때 쓰는 그리기 함수</b> 그대로입니다 — 보이는 대로 나옵니다.",
    내용: `<style>
      /* 라벨과 조절기가 겹치지 않게 — 칸마다 위아래로 세운다 (두 줄로 나란히) */
      .sbGrid { display:grid !important; grid-template-columns:1fr 1fr; gap:10px }
      .sbGrid > div { display:flex; flex-direction:column; gap:4px; min-width:0 }
      .sbGrid label { font-size:12px; opacity:.85; margin:0; white-space:nowrap;
                      overflow:hidden; text-overflow:ellipsis }
      .sbGrid input[type=range] { width:100%; margin:0 }
      .sbGrid input[type=color] { width:100%; padding:2px; border-radius:6px }
      .sbGrid select { width:100% }
    </style>
    <div style="display:flex; gap:16px; flex-wrap:wrap">
      <div style="flex:0 0 auto">
        <canvas id="sbCanvas" style="border-radius:10px; background:#0d0c11; display:block"></canvas>
        <div class="charRow" style="align-items:center; gap:6px; margin-top:8px; flex-wrap:wrap">
          ${Object.keys(비율표).map(r => `<button type="button" class="ghost small sbRatio"
            data-r="${r}">${r}</button>`).join("")}
          <span style="flex:1"></span>
          <button type="button" class="ghost small" id="sbReplay">↻ 등장 다시</button>
        </div>
        <input id="sbText" value="${escapeHtml(글)}" placeholder="미리 볼 글"
               style="width:100%; margin-top:8px; padding:6px 10px; font-size:13px">
        <label class="hint" style="display:flex; align-items:center; gap:6px; margin-top:6px">
          <input type="checkbox" id="sbBg" checked style="width:auto; margin:0">
          바탕 그림 위에서 보기 (읽히는지 확인)
        </label>
      </div>

      <div style="flex:1 1 380px; min-width:320px">
        <div style="font-size:13px; font-weight:700; margin-bottom:6px">차림표 — 하나 고르고 다듬으세요</div>
        <div class="charRow" id="sbPresets" style="flex-wrap:wrap; gap:5px; margin-bottom:12px">
          ${Object.entries(PRESETS).map(([k, p]) =>
            `<button type="button" class="ghost small sbPreset" data-k="${k}">${p.ko}</button>`).join("")}
        </div>

        <div class="grid sbGrid" style="gap:10px">
          <div><label>글꼴</label>
            <select id="sbFont">${FONT_NAMES.map(n =>
              `<option value="${n}">${FONTS[n].ko} — ${FONTS[n].느낌}</option>`).join("")}</select></div>
          <div><label>글자 크기 <span class="hint" id="sbSizeV"></span></label>
            <input type="range" id="sbSize" min="0.03" max="0.14" step="0.002"></div>
          <div><label>글자 색</label><input type="color" id="sbColor" style="height:34px"></div>
          <div><label>등장</label>
            <select id="sbIn">${["팝", "타이핑", "올라옴", "튀어나옴"].map(n =>
              `<option>${n}</option>`).join("")}</select></div>
        </div>

        <div style="font-size:13px; font-weight:700; margin:12px 0 6px">자리</div>
        <div class="grid sbGrid" style="gap:10px">
          <div><label>가로</label>
            <select id="sbHalign">${["왼쪽", "가운데", "오른쪽"].map(n =>
              `<option>${n}</option>`).join("")}</select></div>
          <div><label>세로</label>
            <select id="sbValign">${["위", "가운데", "아래"].map(n =>
              `<option>${n}</option>`).join("")}</select></div>
          <div style="grid-column:1/-1"><label>세로 미세 조정
            <span class="hint" id="sbHeightV">— 안 씀 (위 '세로'를 따름)</span></label>
            <input type="range" id="sbHeight" min="0" max="1" step="0.01" value="0.86"></div>
        </div>

        <div style="font-size:13px; font-weight:700; margin:12px 0 6px">바탕</div>
        <div class="charRow" id="sbBackings" style="flex-wrap:wrap; gap:5px; margin-bottom:8px">
          ${Object.entries(BACKINGS).map(([k, b]) =>
            `<button type="button" class="ghost small sbBacking" data-k="${k}"
                     title="${b.설명}">${b.ko}</button>`).join("")}
        </div>
        <div class="grid" style="gap:8px" id="sbBackOpts">
          <div><label>바탕 색</label><input type="color" id="sbBackColor" style="height:34px"></div>
          <div><label>바탕 진하기 <span class="hint" id="sbAlphaV"></span></label>
            <input type="range" id="sbAlpha" min="0" max="1" step="0.02"></div>
        </div>

        <div style="font-size:13px; font-weight:700; margin:12px 0 6px">테두리
          <span class="hint">— 두껍게 하면 어떤 배경에서도 읽힙니다</span></div>
        <div class="grid sbGrid" style="gap:10px">
          <div><label>굵기 <span class="hint" id="sbStrokeV"></span></label>
            <input type="range" id="sbStroke" min="0" max="0.3" step="0.01"></div>
          <div><label>테두리 색</label><input type="color" id="sbStrokeColor" style="height:34px"></div>
        </div>

        <div style="margin-top:14px">
          <label>대본에 적히는 글</label>
          <div id="sbCode" style="background:#141219; border-radius:8px; padding:9px 11px;
               font-family:Consolas,monospace; font-size:12px; line-height:1.6;
               color:#a8d8b0; word-break:break-all; min-height:22px"></div>
        </div>
      </div>
    </div>`,
    단추: [
      { 글: "📋 복사", 할일: async () => {
        try { await navigator.clipboard.writeText(코드글()); 알림("복사했습니다."); }
        catch { 알림(코드글()); }
      } },
      ...(opt.넣기 ? [{ 글: "대본에 넣기", 강조: true, 할일: 창 => {
        opt.넣기(값, 코드글(), { 머리말: 머리말글() });
        창.닫기();
      } }] : []),
    ],
  });

  const $ = id => document.getElementById(id);
  const 알림 = 글자 => { const el = $("sbCode"); if (el) el.textContent = 글자; };

  /* ── 미리보기 ── */
  const canvas = $("sbCanvas");
  const ctx = canvas.getContext("2d");

  function 화면크기() {
    const [w, h] = 비율표[비율] || 비율표["9:16"];
    // 창을 넘지 않게 줄인다
    const 최대높이 = Math.min(560, window.innerHeight - 320);
    const 배 = Math.min(1, 최대높이 / h);
    canvas.width = Math.round(w * 배);
    canvas.height = Math.round(h * 배);
  }

  /** 바탕 그림 — 부르는 쪽이 준 것이 있으면 그것, 없으면 읽기 어려운 견본을 깐다.
   *  일부러 밝고 어두운 데를 섞는다. 자막이 어디서 안 읽히는지 바로 보이라고. */
  function 바탕그리기(box) {
    if (!$("sbBg").checked) {
      ctx.fillStyle = "#3a3542";
      ctx.fillRect(box.x, box.y, box.w, box.h);
      return;
    }
    if (opt.배경그리기) { try { opt.배경그리기(ctx, box); return; } catch {} }
    const g = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
    g.addColorStop(0, "#7fc8f0"); g.addColorStop(0.55, "#cfe9c8"); g.addColorStop(1, "#3b3a2e");
    ctx.fillStyle = g;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    // 밝고 어두운 얼룩 — 읽기 어려운 자리를 일부러 만든다
    for (let i = 0; i < 7; i++) {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = i % 2 ? "#ffffff" : "#101014";
      ctx.beginPath();
      ctx.arc(box.x + box.w * ((i * 0.19 + 0.1) % 1), box.y + box.h * ((i * 0.27 + 0.2) % 1),
              box.w * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  let raf = null;
  function 그리기() {
    const box = { x: 0, y: 0, w: canvas.width, h: canvas.height };
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    바탕그리기(box);
    const k = Math.min(3, (performance.now() - 애니) / 1000);
    drawSubtitle(ctx, box, $("sbText").value, k, {}, 값);
    raf = requestAnimationFrame(그리기);
  }

  /* ── 화면 ↔ 값 ── */
  function 값을화면에() {
    $("sbFont").value = 값.글꼴;
    $("sbSize").value = 값.크기;   $("sbSizeV").textContent = (+값.크기).toFixed(3);
    $("sbColor").value = 값.색;
    $("sbIn").value = 값.등장;
    $("sbHalign").value = 값.가로;
    $("sbValign").value = 값.세로;
    $("sbHeight").value = 값.높이 ?? 0.86;
    $("sbHeightV").textContent = 값.높이 == null
      ? "— 안 씀 (위 '세로'를 따름)" : (+값.높이).toFixed(2);
    $("sbBackColor").value = 값.바탕색;
    $("sbAlpha").value = 값.투명도; $("sbAlphaV").textContent = Math.round(값.투명도 * 100) + "%";
    $("sbStroke").value = 값.테두리; $("sbStrokeV").textContent = (+값.테두리).toFixed(2);
    $("sbStrokeColor").value = 값.테두리색;
    document.querySelectorAll(".sbBacking").forEach(b =>
      b.style.outline = b.dataset.k === 값.바탕 ? "2px solid var(--accent,#6c8cff)" : "");
    document.querySelectorAll(".sbRatio").forEach(b =>
      b.style.outline = b.dataset.r === 비율 ? "2px solid var(--accent,#6c8cff)" : "");
    $("sbBackOpts").style.opacity = 값.바탕 === "없음" ? "0.35" : "1";
    $("sbCode").textContent = 코드글();
  }

  const 코드글 = () => {
    const 꼬리 = 모양쓰기(값);
    return `자막 "${$("sbText").value}"${꼬리 ? "   " + 꼬리 : ""}`;
  };
  /** 편 전체에 걸 때는 머리말로 적는 편이 낫다 (한 줄마다 적지 않게) */
  const 머리말글 = () => 모양쓰기(값).split(" ")
    .map(p => { const [k, v] = p.split(":"); return `자막${k}: ${v}`; }).join("\n");

  /* ── 이어 주기 ── */
  const 바꾸기 = (키, 값읽기) => { 값[키] = 값읽기(); 애니 = performance.now(); 값을화면에(); };
  $("sbFont").addEventListener("change", () => 바꾸기("글꼴", () => $("sbFont").value));
  $("sbSize").addEventListener("input", () => 바꾸기("크기", () => +$("sbSize").value));
  $("sbColor").addEventListener("input", () => 바꾸기("색", () => $("sbColor").value));
  $("sbIn").addEventListener("change", () => 바꾸기("등장", () => $("sbIn").value));
  $("sbHalign").addEventListener("change", () => 바꾸기("가로", () => $("sbHalign").value));
  $("sbValign").addEventListener("change", () => {
    값.높이 = null;                       // 세로를 고르면 미세 조정은 손을 뗀다
    바꾸기("세로", () => $("sbValign").value);
  });
  $("sbHeight").addEventListener("input", () => 바꾸기("높이", () => +$("sbHeight").value));
  $("sbBackColor").addEventListener("input", () => 바꾸기("바탕색", () => $("sbBackColor").value));
  $("sbAlpha").addEventListener("input", () => 바꾸기("투명도", () => +$("sbAlpha").value));
  $("sbStroke").addEventListener("input", () => 바꾸기("테두리", () => +$("sbStroke").value));
  $("sbStrokeColor").addEventListener("input", () => 바꾸기("테두리색", () => $("sbStrokeColor").value));
  $("sbText").addEventListener("input", () => { 애니 = performance.now(); $("sbCode").textContent = 코드글(); });
  $("sbBg").addEventListener("change", () => {});
  $("sbReplay").addEventListener("click", () => { 애니 = performance.now(); });

  document.querySelectorAll(".sbPreset").forEach(b => b.addEventListener("click", () => {
    Object.assign(값, PRESETS[b.dataset.k].값);
    값.높이 = null;
    애니 = performance.now();
    값을화면에();
  }));
  document.querySelectorAll(".sbBacking").forEach(b => b.addEventListener("click", () =>
    바꾸기("바탕", () => b.dataset.k)));
  document.querySelectorAll(".sbRatio").forEach(b => b.addEventListener("click", () => {
    비율 = b.dataset.r; 화면크기(); 값을화면에();
  }));

  /* 창을 닫으면 그리기도 멈춘다 (안 그러면 뒤에서 계속 돈다) */
  const 옛닫기 = 창.닫기;
  창.닫기 = () => { if (raf) cancelAnimationFrame(raf); raf = null; 옛닫기(); };
  new MutationObserver((_, ob) => {
    if (!document.querySelector(".uiModal")) {
      if (raf) cancelAnimationFrame(raf);
      raf = null; ob.disconnect();
    }
  }).observe(document.body, { childList: true });

  (async () => {
    await loadFonts();
    화면크기();
    값을화면에();
    애니 = performance.now();
    그리기();
  })();

  return 창;
}
