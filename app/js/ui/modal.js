/* 🪟 팝업 — 어느 화면에서든 부를 수 있는 창.
 *
 * 팝업을 어느 한 탭의 화면(html)에 넣어 두면 그 탭에 가야만 열 수 있다.
 * 그래서 여기서 **스스로 만들어 body 에 붙인다.** 부르는 쪽은 탭이 무엇인지 몰라도 된다.
 *
 *   import { openModal } from "../ui/modal.js";
 *   const 창 = openModal({ 제목: "📖 안내", 내용: "<p>안녕</p>",
 *                          단추: [{ 글: "복사", 할일: () => … }] });
 *   창.내용바꾸기("<p>다 읽었습니다</p>");
 *   창.닫기();
 */

import { 밀기, 빼기 } from "./nav.js";

let 열린것 = null;

/** 여는 방법 하나로 모은다 — 두 개가 겹쳐 뜨지 않게 앞의 것은 닫는다 */
export function openModal(opt = {}) {
  /* 팝업 위에 팝업을 열면 **걸음을 새로 쌓지 않고 그대로 물려받는다.**
     앞엣것을 걷어내고(history.go) 곧바로 새로 쌓으면 두 일이 엇갈려
     뒤로가기가 한 번 헛돌았다. 어차피 사람 눈에는 창 하나다. */
  const 겹쳐열기 = !!열린것;
  닫기({ 뒤로: 겹쳐열기 });

  const 덮개 = document.createElement("div");
  덮개.className = "uiModal";
  덮개.style.cssText = `position:fixed; inset:0; z-index:400; display:flex;
    align-items:center; justify-content:center; padding:24px;
    background:rgba(8,7,12,0.82)`;

  const 창 = document.createElement("div");
  창.style.cssText = `background:#17151d; border-radius:16px; display:flex; flex-direction:column;
    overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.6);
    width:${opt.너비 || "min(1000px, 96vw)"}; height:${opt.높이 || "min(88vh, 900px)"}`;

  const 머리 = document.createElement("div");
  머리.className = "charRow";
  머리.style.cssText = "align-items:center; padding:14px 18px; border-bottom:1px solid #2a2733";
  머리.innerHTML = `<b style="font-size:16px">${opt.제목 || ""}</b>
    <span class="hint" data-부제></span><span style="flex:1"></span>`;

  for (const b of opt.단추 || []) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = b.강조 ? "" : "ghost small";
    el.textContent = b.글;
    el.addEventListener("click", () => b.할일?.(창구실));
    머리.appendChild(el);
  }
  const 닫기단추 = document.createElement("button");
  닫기단추.type = "button";
  닫기단추.className = "ghost small";
  닫기단추.textContent = "✕ 닫기";
  닫기단추.addEventListener("click", 닫기);
  머리.appendChild(닫기단추);

  const 안내 = document.createElement("div");
  안내.className = "hint";
  안내.style.cssText = "padding:8px 18px 0";
  if (opt.안내) 안내.innerHTML = opt.안내;

  const 몸 = document.createElement("div");
  몸.style.cssText = "flex:1; overflow:auto; padding:14px 18px 20px; font-size:13px; line-height:1.7";
  if (opt.내용) 몸.innerHTML = opt.내용;

  창.append(머리, 안내, 몸);
  덮개.appendChild(창);
  document.body.appendChild(덮개);

  // 바깥을 누르거나 Esc 로 닫는다
  덮개.addEventListener("click", ev => { if (ev.target === 덮개) 닫기(); });
  const 키 = ev => { if (ev.key === "Escape") 닫기(); };
  addEventListener("keydown", 키);

  const 창구실 = {
    요소: 창, 몸,
    내용바꾸기: html => { 몸.innerHTML = html; },
    부제바꾸기: 글 => { 머리.querySelector("[data-부제]").textContent = 글; },
    닫기,
  };
  열린것 = { 덮개, 키 };
  /* 뒤로가기로도 닫히게 한 걸음 쌓아 둔다.
     팝업이 떠 있는데 뒤로가기가 앱을 통째로 떠나면, 적던 글이 그대로 날아간다. */
  if (!겹쳐열기) 밀기("팝업", () => 닫기({ 뒤로: true }));
  return 창구실;
}

export function 닫기(짓 = {}) {
  if (!열린것) return;
  removeEventListener("keydown", 열린것.키);
  열린것.덮개.remove();
  열린것 = null;
  // 뒤로가기가 부른 것이면 걸음은 이미 빠져 있다
  if (!짓.뒤로) 빼기("팝업");
}
export const closeModal = 닫기;

/** 아주 작은 마크다운 그리기 — 안내서·설명을 읽기 좋게 보여 주려는 것뿐이다. */
export function markdownToHtml(글) {
  const 안전 = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const 줄속 = s => 안전(s)
    .replace(/`([^`]+)`/g, '<code style="background:#241f2e; padding:1px 5px; border-radius:4px;' +
                           ' color:#a8d8b0; font-size:12px">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  const 밖 = [];
  let 코드 = null;
  for (const line of String(글 || "").split("\n")) {
    if (line.startsWith("```")) {
      if (코드 === null) 코드 = [];
      else {
        밖.push(`<pre style="background:#141219; border-radius:8px; padding:10px; overflow-x:auto;
          font-size:12px; line-height:1.6; margin:6px 0">${안전(코드.join("\n"))}</pre>`);
        코드 = null;
      }
      continue;
    }
    if (코드) { 코드.push(line); continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const 크기 = [19, 16, 14][h[1].length - 1];
      밖.push(`<div style="font-size:${크기}px; font-weight:700; margin:14px 0 6px; color:#e8e2d8;
        ${h[1].length === 1 ? "border-bottom:1px solid #2a2733; padding-bottom:6px" : ""}"
        >${줄속(h[2])}</div>`);
    } else if (/^\|/.test(line)) {
      밖.push(`<div style="font-family:Consolas,monospace; font-size:12px; color:#c9c2b8">${줄속(line)}</div>`);
    } else if (/^[-*]\s/.test(line.trim())) {
      밖.push(`<div style="margin-left:14px">• ${줄속(line.trim().slice(2))}</div>`);
    } else if (/^---+$/.test(line.trim())) {
      밖.push('<hr style="border:none; border-top:1px solid #2a2733; margin:14px 0">');
    } else if (!line.trim()) 밖.push('<div style="height:6px"></div>');
    else 밖.push(`<div>${줄속(line)}</div>`);
  }
  return 밖.join("");
}
