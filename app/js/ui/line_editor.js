/* 📝 줄 번호가 붙은 글칸 — 어디서든 부를 수 있는 부품.
 *
 * 대본은 **줄 번호로 이야기한다.** "17줄 따옴표를 안 닫았습니다" 라고 알려 줘 놓고
 * 정작 글칸에 번호가 없으면 사람이 손으로 세어야 한다.
 *
 * 그래서 한 군데서 만들어 두고 대본을 적는 곳마다 같은 것을 쓴다.
 *   const 편집기 = mountLineEditor(어디에, { 값: "…", 바뀜: 글 => … });
 *   편집기.문제표시(new Map([[17, "오류"]]));
 *   편집기.줄로가기(17);
 *
 * 만드는 법이 하나뿐이라, 번호와 글이 어긋나는 일이 생기지 않는다
 * (글꼴·줄높이를 번호칸과 글칸이 **같은 값**으로 나눠 쓰기 때문이다).
 */

const 글꼴 = 'Consolas, "D2Coding", monospace';
const 글자 = 12.5;      // px
const 줄높이 = 1.65;    // 배수 — 번호와 글이 반드시 같아야 한다

const 색 = { "오류": "#ff7a7a", "경고": "#ffcf6c", "알림": "#8a93a8" };

/**
 * @param host  이 요소 안을 채운다
 * @param opt   {값, 안내글, 높이, 바뀜(글), 줄눌림(번호)}
 */
export function mountLineEditor(host, opt = {}) {
  host.innerHTML = "";
  host.style.cssText = (host.style.cssText || "") +
    `;display:flex; align-items:stretch; background:#141219; border-radius:8px;
      overflow:hidden; height:${opt.높이 || "300px"}`;

  const 번호칸 = document.createElement("div");
  번호칸.style.cssText = `flex:0 0 auto; min-width:42px; padding:10px 6px 10px 0;
    text-align:right; user-select:none; overflow:hidden;
    font-family:${글꼴}; font-size:${글자}px; line-height:${줄높이};
    color:#5a5468; background:#100e15; border-right:1px solid #26222f`;

  const 글칸 = document.createElement("textarea");
  글칸.spellcheck = false;
  글칸.placeholder = opt.안내글 || "";
  글칸.value = opt.값 || "";
  글칸.style.cssText = `flex:1; min-width:0; border:0; outline:none; resize:none;
    padding:10px 12px; background:transparent; color:#e8e2d8; white-space:pre;
    overflow:auto; font-family:${글꼴}; font-size:${글자}px; line-height:${줄높이}`;

  host.append(번호칸, 글칸);

  let 문제 = new Map();          // 줄번호 → 등급

  const 번호그리기 = () => {
    const n = Math.max(1, 글칸.value.split("\n").length);
    const 조각 = [];
    for (let i = 1; i <= n; i++) {
      const g = 문제.get(i);
      조각.push(g
        ? `<div style="color:${색[g] || 색.경고}; font-weight:700">${i}</div>`
        : `<div>${i}</div>`);
    }
    번호칸.innerHTML = 조각.join("");
    번호칸.scrollTop = 글칸.scrollTop;
  };

  글칸.addEventListener("scroll", () => { 번호칸.scrollTop = 글칸.scrollTop; });
  글칸.addEventListener("input", () => { 번호그리기(); opt.바뀜?.(글칸.value); });

  /* 탭 키로 들여쓰기 — 대본은 들여쓰기가 곧 '장면 안' 이라는 뜻이라 자주 쓴다 */
  글칸.addEventListener("keydown", ev => {
    if (ev.key !== "Tab") return;
    ev.preventDefault();
    const s = 글칸.selectionStart, e = 글칸.selectionEnd;
    글칸.value = 글칸.value.slice(0, s) + "  " + 글칸.value.slice(e);
    글칸.selectionStart = 글칸.selectionEnd = s + 2;
    글칸.dispatchEvent(new Event("input"));
  });

  번호그리기();

  return {
    요소: host, 글칸,
    값: () => 글칸.value,
    값넣기(글) { 글칸.value = 글 ?? ""; 번호그리기(); opt.바뀜?.(글칸.value); },
    /** 줄번호 → "오류"|"경고"|"알림" 표를 주면 번호에 색을 입힌다 */
    문제표시(표) { 문제 = 표 instanceof Map ? 표 : new Map(Object.entries(표 || {})
                     .map(([k, v]) => [+k, v])); 번호그리기(); },
    /** 그 줄로 스크롤하고 커서를 놓는다 */
    줄로가기(번호) {
      const 줄들 = 글칸.value.split("\n");
      let 자리 = 0;
      for (let i = 0; i < Math.min(번호 - 1, 줄들.length); i++) 자리 += 줄들[i].length + 1;
      글칸.focus();
      글칸.selectionStart = 자리;
      글칸.selectionEnd = 자리 + (줄들[번호 - 1]?.length || 0);
      // 가운데쯤 오게 — 맨 위에 붙으면 앞뒤 맥락이 안 보인다
      글칸.scrollTop = Math.max(0, (번호 - 1) * 글자 * 줄높이 - 글칸.clientHeight / 2);
      번호칸.scrollTop = 글칸.scrollTop;
    },
  };
}
