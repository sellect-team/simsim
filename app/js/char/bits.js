/* 🧩 조각·장면 — 다시 쓰는 이야기 토막.
 *
 * 캐릭터·배경·음악이 '재료' 라면 이것은 '반쯤 만든 것' 이다.
 *   · 조각 = 대본 몇 줄. 대본에 `조각 <이름>` 이라고 쓰면 그 자리에 펼쳐진다.
 *   · 장면 = 예전 영상 만들기에서 저장한 무대. 이미 저장한 것이 있어 그대로 둔다.
 *
 * 장면 화면은 손대지 않고 그대로 얹는다 (scenes.js 를 그대로 부른다).
 */
import { $, escapeHtml } from "../core.js";
import { openModal } from "../ui/modal.js";
import { mount as mountScenes } from "./scenes.js";

let 조각들 = [];

async function 읽기() {
  try { 조각들 = (await (await fetch("/api/prefab/list")).json()).items || []; }
  catch { 조각들 = []; }
  그리기();
}

function 알림(글) { const el = $("pfInfo"); if (el) el.textContent = 글; }

async function 저장(m) {
  const r = await (await fetch("/api/prefab/save", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(m) })).json();
  if (r.error) throw new Error(r.error);
  await 읽기();
  window.dispatchEvent(new Event("자산바뀜"));
  return r.item;
}

/** 조각 하나 고치기 — 대본 토막을 그대로 적는다 */
function 고치기(x) {
  openModal({
    제목: `🧩 ${escapeHtml(x.name || "새 조각")}`,
    너비: "min(720px, 94vw)",
    안내: "대본 문법 그대로 적습니다. 다른 대본에서 " +
          `<code>조각 &lt;${escapeHtml(x.name || "이름")}&gt;</code> 라고 부르면 이 줄들이 들어갑니다.`,
    내용: `<div class="vlist" style="gap:10px">
      <label class="hint">이름
        <input id="pfEdName" value="${escapeHtml(x.name || "")}" style="width:100%; margin-top:4px"></label>
      <label class="hint">메모 — 언제 쓰는 토막인지
        <input id="pfEdMemo" value="${escapeHtml(x.메모 || "")}" style="width:100%; margin-top:4px"></label>
      <label class="hint">대본
        <textarea id="pfEdText" rows="12" spellcheck="false"
          style="width:100%; margin-top:4px; font-family:Consolas,monospace; font-size:13px; line-height:1.7"
          >${escapeHtml(x.text || "")}</textarea></label>
    </div>`,
    단추: [{ 글: "저장", 강조: true, 할일: async 창 => {
      try {
        await 저장({ id: x.id, name: document.getElementById("pfEdName").value,
                     메모: document.getElementById("pfEdMemo").value,
                     text: document.getElementById("pfEdText").value });
        창.닫기(); 알림("✅ 저장했습니다.");
      } catch (e) { alert("⚠ " + e.message); }
    } }],
  });
}

function 그리기() {
  알림(`조각 ${조각들.length}개`);
  const wrap = $("pfList");
  wrap.innerHTML = 조각들.length ? 조각들.map((x, i) => {
    const 줄수 = String(x.text || "").split("\n").filter(s => s.trim()).length;
    return `<div class="vitem" style="gap:8px; padding:5px 8px">
      <span class="vname" style="flex:1; font-size:13px">🧩 ${escapeHtml(x.name || "")}</span>
      <span class="vinfo" style="width:70px; font-size:11px">${줄수}줄</span>
      <span class="vinfo" style="flex:1; font-size:11px; overflow:hidden; text-overflow:ellipsis;
            white-space:nowrap">${escapeHtml(x.메모 || "")}</span>
      <button class="ghost small pfCopy" type="button" data-줄="${i}"
              title="대본에 붙여 넣을 한 줄을 복사합니다">복사</button>
      <button class="ghost small pfEdit" type="button" data-줄="${i}">고치기</button>
      <button class="danger small pfDel" type="button" data-줄="${i}">삭제</button>
    </div>`;
  }).join("")
    : '<div class="hint">아직 조각이 없습니다. 자주 쓰는 대본 몇 줄을 이름 붙여 두세요.</div>';

  wrap.querySelectorAll(".pfEdit").forEach(b =>
    b.addEventListener("click", () => 고치기(조각들[+b.dataset.줄])));
  wrap.querySelectorAll(".pfCopy").forEach(b =>
    b.addEventListener("click", async () => {
      const 글 = `조각 <${조각들[+b.dataset.줄].name}>`;
      try { await navigator.clipboard.writeText(글); 알림(`📋 ${글}`); }
      catch { 알림(글); }
    }));
  wrap.querySelectorAll(".pfDel").forEach(b =>
    b.addEventListener("click", async () => {
      const x = 조각들[+b.dataset.줄];
      if (!confirm(`'${x.name}' 조각을 삭제할까요?`)) return;
      await fetch("/api/prefab/delete", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: x.id }) });
      await 읽기(); 알림("삭제했습니다.");
    }));
}

export async function mount(root) {
  $("pfAdd").addEventListener("click", async () => {
    const 이름 = $("pfName").value.trim();
    try {
      const 새것 = await 저장({ name: 이름 || "조각", text: "자막 여기에 대본을 적으세요" });
      $("pfName").value = "";
      고치기(새것);
    } catch (e) { 알림("⚠ " + e.message); }
  });
  await 읽기();
  try { await mountScenes(root); } catch { /* 장면이 없어도 조각은 쓴다 */ }
}
