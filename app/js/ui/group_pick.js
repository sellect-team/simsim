/* 📚 시리즈 고르개 — 자산 한 줄에 붙여 그 자리에서 소속을 바꾼다.
 *
 * 시리즈를 바꾸려고 팝업을 열고 체크하고 옮기는 것은, 하나만 바꿀 때는 너무 멀다.
 * 그래서 캐릭터·배경·음악 목록에 작은 고르개를 하나씩 붙인다.
 * 프로젝트 목록에서 쓰는 것과 같은 모양이라 익힐 것이 하나뿐이다.
 *
 *   import { 시리즈고르개, 시리즈옮기기, 시리즈읽기 } from "../ui/group_pick.js";
 *   await 시리즈읽기();                                   // 한 번 읽어 두고
 *   html += 시리즈고르개("캐릭터", m.id, m.group);         // 줄마다 심고
 *   붙이기(줄요소, { 바뀜: 다시그리기, 알림: st });         // 한 번 이어 준다
 *
 * 자산은 **폴더를 옮기지 않는다.** 소속만 적어 둔다 — 이미 저장된 대본의 참조가 깨지지 않게.
 */
import { escapeHtml } from "../core.js";
import { library } from "../story/assets.js";

let 시리즈들 = [];
let 읽은때 = 0;

/** 시리즈 목록 (10초 안에 다시 부르면 그냥 넘어간다) */
export async function 시리즈읽기(다시 = false) {
  if (!다시 && Date.now() - 읽은때 < 10000) return 시리즈들;
  try { 시리즈들 = (await (await fetch("/api/group/list")).json()).items || []; }
  catch { 시리즈들 = []; }
  읽은때 = Date.now();
  return 시리즈들;
}
export const 시리즈목록 = () => 시리즈들;
export const 시리즈이름 = gid => (시리즈들.find(g => g.id === gid) || {}).name || "";

/** 줄에 심을 고르개 한 개 (글자만 돌려준다 — 어디에 넣을지는 부르는 쪽이 정한다) */
export function 시리즈고르개(종류, id, 지금소속 = "", opt = {}) {
  return `<select class="uiGroupPick" data-종류="${escapeHtml(종류)}"
            data-자산="${escapeHtml(String(id))}" title="이 자산을 쓸 시리즈"
            style="max-width:${opt.너비 || "138px"}; padding:2px 6px; font-size:11px">
    <option value="" ${!지금소속 ? "selected" : ""}>— 공용</option>
    ${시리즈들.map(g => `<option value="${g.id}" ${g.id === 지금소속 ? "selected" : ""}
      >${escapeHtml(g.name)}</option>`).join("")}
    <option value="__new">＋ 새 시리즈…</option>
  </select>`;
}

/** 자산 하나의 소속을 바꾼다 */
export async function 시리즈옮기기(종류, id, 갈곳) {
  if (갈곳 === "__new") {
    const 이름 = prompt("새 시리즈 이름", "새 시리즈");
    if (!이름) return null;                       // 취소
    const r = await (await fetch("/api/group/save", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: 이름 }) })).json();
    if (!r.id) throw new Error(r.error || "시리즈를 만들지 못했습니다.");
    갈곳 = r.id;
    await 시리즈읽기(true);
  }
  const r = await (await fetch("/api/group/assign", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group: 갈곳, 자산: [{ kind: 종류, id }] }) })).json();
  if (r.error) throw new Error(r.error);
  if (!r.수) throw new Error("옮기지 못했습니다 (자산을 찾지 못함).");
  library.clear();                                 // 미리보기·굽기도 새 규칙을 따르게
  return { 갈곳, 이름: 갈곳 ? 시리즈이름(갈곳) : "공용" };
}

/** 목록을 '이 시리즈 것' 과 '공용' 으로 가른다.
 *
 *  섞여 있으면 "이 시리즈에서 뭘 쓸 수 있지?" 를 셀 수가 없다.
 *  시리즈를 안 골랐으면(전체 보기) 가를 것이 없으므로 그대로 돌려준다.
 */
export function 시리즈로가르기(목록, gid = null) {
  const 보는것 = gid ?? (localStorage.getItem("ws그룹") || "");
  if (!보는것 || 보는것 === "__none") return { 가름: false, 전용: 목록, 공용: [] };
  return {
    가름: true,
    이름: 시리즈이름(보는것),
    전용: 목록.filter(x => (x.group || "") === 보는것),
    공용: 목록.filter(x => !(x.group || "")),
  };
}

/** 가른 두 무리 사이에 끼울 머리글 */
export function 가름머리(글, 수, 색 = "#a78bfa", 도움말 = "") {
  return `<div class="uiGroupHead" style="grid-column:1/-1; display:flex; align-items:center;
       gap:8px; margin:10px 0 4px; padding-bottom:4px; border-bottom:1px solid #2a2733">
    <b style="font-size:12px; color:${색}">${글}</b>
    <span class="hint" style="font-size:11px">${수}개${도움말 ? " · " + 도움말 : ""}</span>
  </div>`;
}

/** 그 안에 있는 고르개들을 한 번에 이어 준다 */
export function 붙이기(뿌리, { 바뀜, 알림 } = {}) {
  (뿌리 || document).querySelectorAll(".uiGroupPick").forEach(sel => {
    // 카드를 누르면 열리는 화면이 많다 — 고르개를 만지는 것은 '열기' 가 아니다
    sel.addEventListener("click", ev => ev.stopPropagation());
    sel.addEventListener("change", async ev => {
      ev.stopPropagation();
      const { 종류, 자산 } = sel.dataset;
      try {
        const r = await 시리즈옮기기(종류, 자산, sel.value);
        if (!r) { 바뀜?.(); return; }              // 새 시리즈 만들기를 취소함
        알림?.(`📚 ${r.이름} (으)로 옮겼습니다.`, "ok");
        window.dispatchEvent(new Event("자산바뀜"));
        바뀜?.();
      } catch (e) { 알림?.("⚠ " + e.message, "err"); 바뀜?.(); }
    });
  });
}
