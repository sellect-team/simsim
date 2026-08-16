/* ⌨ 이름 자동완성 — 대본에서 `<` 를 치면 쓸 수 있는 이름이 뜬다.
 *
 * 캐릭터 8개·배경 11개·음악 6개가 되면 이름을 외울 수 없다.
 * 문법서를 열어 확인하고 돌아오는 것은 흐름을 끊는다.
 *
 * 무엇이 뜨는가 — 지금 치고 있는 자리에 맞춰 고른다.
 *   `<` 뒤        → 캐릭터 · 배경 · 소품 (개체 이름)
 *   `장면 ` 뒤    → 배경
 *   `음악: ` 뒤   → 음악
 *   `소리:` 뒤    → 효과음
 *   `조각 <` 뒤   → 조각
 *   그 밖의 낱말  → 대본 낱말(동사·꼬리표)
 *
 *   import { 자동완성붙이기 } from "../ui/autocomplete.js";
 *   자동완성붙이기(textarea, { 목록: () => ({캐릭터:[], 배경:[], …}) });
 */
const 아이콘 = { 캐릭터: "🐕", 배경: "🏞", 음악: "🎵", 조각: "🧩", 소리: "🔊", 소품: "📦", 말: "✏" };

export function 자동완성붙이기(칸, opt = {}) {
  if (!칸 || 칸._자동완성) return;
  칸._자동완성 = true;

  const 판 = document.createElement("div");
  판.style.cssText = `position:fixed; z-index:500; display:none; max-height:230px;
    overflow-y:auto; background:#1b1824; border:1px solid #332e40; border-radius:10px;
    box-shadow:0 12px 32px rgba(0,0,0,.55); min-width:190px; padding:4px`;
  document.body.appendChild(판);

  let 것들 = [], 고른것 = 0, 바꿀자리 = null;

  const 닫기 = () => { 판.style.display = "none"; 것들 = []; 바꿀자리 = null; };

  /** 커서 앞의 글을 보고 무엇을 채워야 하는지 알아낸다 */
  function 지금무엇() {
    const 끝 = 칸.selectionStart;
    const 앞 = 칸.value.slice(0, 끝);
    const 줄 = 앞.slice(앞.lastIndexOf("\n") + 1);

    // `<이름` — 아직 안 닫은 꺾쇠
    const 꺾 = 줄.match(/<([^<>]*)$/);
    if (꺾) {
      const 조각인가 = /조각\s*<[^<>]*$/.test(줄);
      const 종류들 = 조각인가 ? ["조각"]
        : /^\s*장면\s*<[^<>]*$/.test(줄) ? ["배경"]
        : ["캐릭터", "배경", "소품"];
      return { 글: 꺾[1], 시작: 끝 - 꺾[1].length, 종류들, 감쌈: false };
    }
    // `음악: 이름` / `소리:이름` 같은 꼬리표
    const 꼬리 = 줄.match(/(음악|소리|글꼴|바탕|차림표)\s*:\s*([^\s:]*)$/);
    if (꼬리) {
      const 표이름 = { 음악: "음악", 소리: "소리", 글꼴: "글꼴", 바탕: "바탕", 차림표: "차림표" }[꼬리[1]];
      return { 글: 꼬리[2], 시작: 끝 - 꼬리[2].length, 종류들: [표이름], 감쌈: false };
    }
    // `장면 이름` (꺾쇠 없이)
    const 장면 = 줄.match(/^\s*장면\s+([^<>]*)$/);
    if (장면) return { 글: 장면[1], 시작: 끝 - 장면[1].length, 종류들: ["배경"], 감쌈: true };

    // 줄 맨 앞의 낱말 — 동사·설정 이름을 알려 준다
    const 첫말 = 줄.match(/^(\s*)(\S*)$/);
    if (첫말 && 첫말[2].length >= 1) {
      return { 글: 첫말[2], 시작: 끝 - 첫말[2].length, 종류들: ["말"], 감쌈: false };
    }
    return null;
  }

  /** 이름 목록 — 어느 한 갈래가 터져도 자동완성 전체가 죽지 않게 감싼다 */
  function 목록읽기() {
    try { return opt.목록?.() || {}; }
    catch (e) { console.warn("자동완성 목록을 못 읽었습니다:", e); return {}; }
  }

  function 그리기() {
    let 자리 = null;
    try { 자리 = 지금무엇(); } catch { 자리 = null; }
    if (!자리) return 닫기();
    const 표 = 목록읽기();
    const 말 = 자리.글.replace(/\s/g, "").toLowerCase();

    것들 = [];
    for (const 종류 of 자리.종류들) {
      for (const 이름 of (표[종류] || [])) {
        const n = String(이름).replace(/\s/g, "").toLowerCase();
        if (!말 || n.includes(말)) 것들.push({ 종류, 이름: String(이름) });
      }
    }
    // 앞에서부터 맞는 것을 위로
    것들.sort((a, b) => {
      const A = a.이름.replace(/\s/g, "").toLowerCase().indexOf(말);
      const B = b.이름.replace(/\s/g, "").toLowerCase().indexOf(말);
      return (A < 0 ? 99 : A) - (B < 0 ? 99 : B) || a.이름.localeCompare(b.이름, "ko");
    });
    것들 = 것들.slice(0, 12);
    if (!것들.length) return 닫기();

    바꿀자리 = 자리;
    고른것 = 0;
    칠하기();
    자리잡기();
    판.style.display = "block";
  }

  function 칠하기() {
    판.innerHTML = 것들.map((x, i) =>
      `<div data-i="${i}" style="padding:5px 9px; border-radius:6px; font-size:13px;
            cursor:pointer; white-space:nowrap;
            background:${i === 고른것 ? "var(--accent,#6c8cff)" : "transparent"};
            color:${i === 고른것 ? "#fff" : "#e8e2d8"}">
        ${아이콘[x.종류] || "•"} ${x.이름}
      </div>`).join("") +
      `<div style="padding:4px 9px; font-size:11px; opacity:.55">
         ↑↓ 고르기 · Tab/Enter 넣기 · Esc 닫기</div>`;
    판.querySelectorAll("[data-i]").forEach(el => {
      el.addEventListener("mousedown", ev => { ev.preventDefault(); 넣기(+el.dataset.i); });
      el.addEventListener("mouseenter", () => { 고른것 = +el.dataset.i; 칠하기(); });
    });
  }

  /** 커서가 있는 자리 근처에 판을 띄운다 (글자 크기로 어림잡는다) */
  function 자리잡기() {
    const r = 칸.getBoundingClientRect();
    const 줄들 = 칸.value.slice(0, 칸.selectionStart).split("\n");
    const 스타일 = getComputedStyle(칸);
    const 줄높이 = parseFloat(스타일.lineHeight) || 20;
    const 글너비 = parseFloat(스타일.fontSize) * 0.55;
    const y = r.top + (줄들.length * 줄높이) - 칸.scrollTop + 4;
    const x = r.left + (줄들[줄들.length - 1].length * 글너비) - 칸.scrollLeft;
    판.style.left = Math.min(Math.max(8, x), window.innerWidth - 230) + "px";
    // 아래로 넘치면 위에 띄운다
    판.style.top = (y + 240 > window.innerHeight ? Math.max(8, y - 250 - 줄높이) : y) + "px";
  }

  function 넣기(i) {
    const x = 것들[i];
    if (!x || !바꿀자리) return 닫기();
    const 값 = 바꿀자리.감쌈 ? `<${x.이름}>` : x.이름;
    const 앞 = 칸.value.slice(0, 바꿀자리.시작);
    let 뒤 = 칸.value.slice(바꿀자리.시작 + 바꿀자리.글.length);
    let 커서 = 바꿀자리.시작 + 값.length;
    // `<이름` 을 채웠으면 닫는 꺾쇠까지 붙여 준다 (이미 있으면 건너뛴다)
    if (!바꿀자리.감쌈 && 바꿀자리.종류들.some(k => ["캐릭터", "배경", "소품", "조각"].includes(k))) {
      if (뒤.startsWith(">")) { 뒤 = 뒤.slice(1); }
      칸.value = 앞 + 값 + "> " + 뒤;
      커서 += 2;
    } else {
      칸.value = 앞 + 값 + 뒤;
    }
    칸.setSelectionRange(커서, 커서);
    닫기();
    칸.dispatchEvent(new Event("input", { bubbles: true }));
  }

  칸.addEventListener("keydown", ev => {
    if (판.style.display === "none") {
      // Ctrl+Space 로 언제든 부를 수 있다
      if ((ev.ctrlKey || ev.metaKey) && ev.key === " ") { ev.preventDefault(); 그리기(); }
      return;
    }
    if (ev.key === "ArrowDown") { ev.preventDefault(); 고른것 = (고른것 + 1) % 것들.length; 칠하기(); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); 고른것 = (고른것 - 1 + 것들.length) % 것들.length; 칠하기(); }
    else if (ev.key === "Enter" || ev.key === "Tab") { ev.preventDefault(); 넣기(고른것); }
    else if (ev.key === "Escape") { ev.preventDefault(); 닫기(); }
  });
  칸.addEventListener("input", () => setTimeout(그리기, 0));
  칸.addEventListener("blur", () => setTimeout(닫기, 120));
  칸.addEventListener("scroll", () => { if (판.style.display !== "none") 자리잡기(); });
}
