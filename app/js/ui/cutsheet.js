/* 🎞 컷 보기 — 구운 영상의 대표 장면을 한 장으로 펼쳐 본다.
 *
 * 영상을 하나씩 열어 보는 것은 네 편만 돼도 번거롭고, 백 편이면 불가능하다.
 * 컷 시트 한 장이면 "자막이 가려졌나 · 캐릭터가 빠졌나 · 빈 컷이 있나" 를 몇 초에 안다.
 *
 *   import { openCutSheet } from "../ui/cutsheet.js";
 *   openCutSheet({ filename: "1화_아침_594529.mp4", 제목: "1화 아침" });
 *
 * 시트는 서버가 만들어 파일로 남긴다 — 두 번째부터는 곧바로 뜬다.
 */
import { escapeHtml } from "../core.js";
import { openModal } from "./modal.js";
import { openPlayer } from "./player.js";

const 시트URL = (파일, 칸, 폭) =>
  `/api/videos/sheet?filename=${encodeURIComponent(파일)}&n=${칸}&w=${폭}`;

export function openCutSheet(v = {}) {
  const 파일 = v.filename || v.file;
  if (!파일) return null;
  let 칸 = +(localStorage.getItem("컷시트칸") || 8);

  const 창 = openModal({
    제목: `🎞 ${v.제목 || 파일}`,
    너비: "min(1280px, 96vw)",
    높이: "auto",
    안내: "영상을 처음부터 훑어 고르게 뽑은 대표 장면입니다 — 실제로 구워진 그림입니다.",
    내용: `<div class="charRow" style="align-items:center; gap:6px; margin-bottom:10px">
        <span class="hint">칸 수</span>
        ${[4, 8, 12, 16].map(n => `<button type="button" class="ghost small csN"
          data-n="${n}">${n}</button>`).join("")}
        <span style="flex:1"></span>
        <span class="hint" id="csInfo">만드는 중…</span>
      </div>
      <div id="csBox" style="background:#0d0c11; border-radius:10px; padding:8px;
           overflow-x:auto"></div>
      <div class="hint" style="margin-top:8px">그림을 누르면 그 자리부터 영상으로 봅니다.</div>`,
    단추: [
      { 글: "▶ 영상으로 보기", 할일: 창 => { 창.닫기(); openPlayer(v); } },
      { 글: "📋 그림 복사", 할일: async () => {
        try {
          const r = await fetch(시트URL(파일, 칸, 240));
          const b = await r.blob();
          await navigator.clipboard.write([new ClipboardItem({ [b.type]: b })]);
          알림("복사했습니다.");
        } catch { 알림("복사하지 못했습니다 (그림을 눌러 저장하세요)."); }
      } },
    ],
  });
  const 알림 = 글 => { const el = document.getElementById("csInfo"); if (el) el.textContent = 글; };

  function 그리기() {
    localStorage.setItem("컷시트칸", 칸);
    document.querySelectorAll(".csN").forEach(b =>
      b.style.outline = +b.dataset.n === 칸 ? "2px solid var(--accent,#6c8cff)" : "");
    const box = document.getElementById("csBox");
    box.innerHTML = '<div class="hint" style="padding:20px; text-align:center">만드는 중…</div>';
    const img = new Image();
    img.onload = () => {
      box.innerHTML = "";
      img.style.cssText = "display:block; max-width:100%; border-radius:6px; cursor:pointer";
      img.title = "눌러서 그 자리부터 영상으로 보기";
      box.appendChild(img);
      알림(`${칸}칸 · ${img.naturalWidth}×${img.naturalHeight}`);
      /* 어느 칸을 눌렀는지로 시각을 셈해 그 자리부터 튼다 */
      img.addEventListener("click", ev => {
        const r = img.getBoundingClientRect();
        const 몇번째 = Math.min(칸 - 1, Math.floor((ev.clientX - r.left) / r.width * 칸));
        창.닫기();
        openPlayer({ ...v, 시작: (몇번째 + 0.5) / 칸 });
      });
    };
    img.onerror = () => {
      box.innerHTML = '<div class="hint" style="padding:20px; text-align:center">' +
        '컷 시트를 만들지 못했습니다 (영상이 없거나 너무 짧습니다).</div>';
      알림("");
    };
    img.src = 시트URL(파일, 칸, 240) + "&t=" + Date.now();
  }

  document.querySelectorAll(".csN").forEach(b =>
    b.addEventListener("click", () => { 칸 = +b.dataset.n; 그리기(); }));
  그리기();
  return 창;
}

/** 여러 편의 시트를 미리 만들어 둔다 (굽고 나서 부르면 볼 때 안 기다린다) */
export async function 시트미리만들기(파일들) {
  if (!파일들?.length) return 0;
  try {
    const r = await (await fetch("/api/videos/sheet_many", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filenames: 파일들 }) })).json();
    return r.만든것 || 0;
  } catch { return 0; }
}
