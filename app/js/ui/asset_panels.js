/* 🪟 자산 도우미 창들 — 필요한 그림 · 태그 정리 · 시리즈 옮기기.
 *
 * 셋 다 **가끔 하는 일**이다. 늘 펼쳐 두면 정작 자산 목록이 밀려난다.
 * 그래서 창으로 뺐다. 어느 탭에서든 부를 수 있다 (작업실에서도 같은 창을 쓴다).
 *
 *   import { openNeeds, openTags, openSeries } from "../ui/asset_panels.js";
 *   openNeeds();                       // 📦 지금 부족한 그림
 *   openTags({ 종류: "음악" });         // 🏷 태그 정리 (그 종류만)
 *   openSeries({ 바뀜: () => … });      // 📚 시리즈 소속 옮기기
 */
import { escapeHtml } from "../core.js";
import { openModal } from "./modal.js";
import { loadNeeds, drawNeeds, summarizeNeeds, promptFor, makeImage } from "../story/needs.js";
import { library } from "../story/assets.js";

export const 종류아이콘 = { 캐릭터: "🐕", 배경: "🏞", 음악: "🎵", 장면: "🎞", 조각: "🧩" };
const 아이콘 = k => 종류아이콘[k] || "•";

/* 여러 화면이 같은 숫자를 봐야 한다 — 한 번 읽어 나눠 쓴다 */
let 부족캐시 = null;
export async function 부족읽기(다시 = false) {
  if (다시 || !부족캐시) 부족캐시 = await loadNeeds();
  return 부족캐시;
}
export function 부족비우기() { 부족캐시 = null; }

/* ══════════ 📦 지금 필요한 그림 ══════════ */
export function openNeeds(opt = {}) {
  const 창 = openModal({
    제목: "📦 지금 필요한 그림",
    높이: "min(80vh, 760px)", 너비: "min(860px, 94vw)",
    안내: "대본이 부르는데 아직 그림이 없는 것들입니다. 없어도 영상은 나옵니다 " +
          "(코드로 그려 둡니다) — 채우면 그만큼 좋아집니다.",
    내용: '<div class="hint" id="npInfo">읽는 중…</div>' +
          '<div id="npList" class="vlist" style="margin-top:10px"></div>',
    단추: [{ 글: "📋 프롬프트 전부 복사", 할일: async () => {
      const 부족 = await 부족읽기();
      const 글 = 부족.전체.map(n => `# ${n.종류} · ${n.이름}\n${promptFor(n)}`).join("\n\n");
      try { await navigator.clipboard.writeText(글); 알림(`📋 ${부족.전체.length}개를 모두 복사했습니다`); }
      catch { 알림("복사하지 못했습니다"); }
    } }, { 글: "↻", 할일: () => 그리기(true) }],
  });
  const 알림 = 글 => { const el = document.getElementById("npInfo"); if (el) el.textContent = 글; };

  async function 그리기(다시 = false) {
    const 부족 = await 부족읽기(다시);
    알림(summarizeNeeds(부족));
    drawNeeds(document.getElementById("npList"), 부족, {
      프롬프트: async n => {
        try { await navigator.clipboard.writeText(promptFor(n)); 알림(`📋 "${n.이름}" 복사 완료`); }
        catch { 알림(promptFor(n)); }
      },
      올리기: n => { 창.닫기(); opt.올리기?.(n); },
      만들기: async n => {
        알림(`✨ "${n.이름}" 그리는 중… (한 장에 30초 안팎)`);
        try {
          const 만든것 = await makeImage(n, note => 알림(`✨ ${n.이름} — ${note}`));
          알림(`✅ "${만든것.name}" 를 만들었습니다.`);
          부족비우기(); library.clear();
          window.dispatchEvent(new Event("자산바뀜"));
          그리기(true);
        } catch (e) { 알림("⚠ 만들기 실패: " + e.message); }
      },
    });
  }
  그리기(true);
  return 창;
}

/* ══════════ 🏷 태그 정리 ══════════ */
export function openTags(opt = {}) {
  let 자료 = { 항목: [], 태그: [], 태그없음: 0 };
  let 고른태그 = null;
  const 종류 = opt.종류 || "";

  const 창 = openModal({
    제목: "🏷 태그 정리" + (종류 ? ` — ${아이콘(종류)} ${종류}` : ""),
    안내: "이름만으로는 못 찾을 때 씁니다. 태그는 자산 파일 안에 함께 저장되므로 따로 어긋나지 않습니다.",
    내용: '<div class="hint" id="tpInfo">읽는 중…</div>' +
          '<div id="tpChips" class="charRow" style="flex-wrap:wrap; gap:5px; margin:10px 0"></div>' +
          '<div id="tpList" class="vlist"></div>',
    단추: [{ 글: "✨ 자동으로 붙이기", 할일: async () => {
      알림("이름을 보고 붙이는 중…");
      try {
        const d = await (await fetch("/api/tags/auto", { method: "POST",
          headers: { "Content-Type": "application/json" }, body: "{}" })).json();
        await 읽기(); 알림(`✨ ${d.수}개에 태그를 붙였습니다`); opt.바뀜?.();
      } catch (e) { 알림("⚠ " + e.message); }
    } }, { 글: "↻", 할일: () => 읽기() }],
  });
  const 알림 = 글 => { const el = document.getElementById("tpInfo"); if (el) el.textContent = 글; };

  async function 읽기() {
    try { 자료 = await (await fetch("/api/tags" + (종류 ? `?kind=${encodeURIComponent(종류)}` : ""))).json(); }
    catch { 자료 = { 항목: [], 태그: [], 태그없음: 0 }; }
    그리기();
  }
  function 그리기() {
    const { 항목, 태그, 태그없음 } = 자료;
    알림(`자산 ${항목.length}개 · 태그 ${태그.length}가지` +
         (태그없음 ? ` · 아직 안 붙인 것 ${태그없음}개` : " · 모두 붙었습니다"));

    const chips = document.getElementById("tpChips");
    chips.innerHTML = 태그.map(t =>
      `<button class="ghost small" type="button" data-태그="${escapeHtml(t.태그)}"
        style="${고른태그 === t.태그 ? "outline:2px solid var(--accent,#6c8cff)" : ""}"
        >${escapeHtml(t.태그)} <span class="hint">${t.수}</span></button>`).join("") +
      (고른태그 ? '<button class="ghost small" type="button" data-해제="1">✕ 모두 보기</button>' : "");
    chips.querySelectorAll("[data-태그]").forEach(b => b.addEventListener("click", () => {
      고른태그 = 고른태그 === b.dataset.태그 ? null : b.dataset.태그; 그리기();
    }));
    chips.querySelector("[data-해제]")?.addEventListener("click", () => { 고른태그 = null; 그리기(); });

    const 보일것 = 고른태그 ? 항목.filter(x => (x.tags || []).includes(고른태그)) : 항목;
    const list = document.getElementById("tpList");
    list.innerHTML = 보일것.length ? 보일것.map(x => {
      const i = 항목.indexOf(x);
      return `<div class="vitem" style="gap:8px; padding:4px 8px">
        <span class="vname" style="width:190px; font-size:12px">${아이콘(x.종류)} ${escapeHtml(x.name || "")}</span>
        <input data-줄="${i}" value="${escapeHtml((x.tags || []).join(", "))}"
               placeholder="${x.제안?.length ? "제안: " + escapeHtml(x.제안.join(", ")) : "쉼표로 나눠 적으세요"}"
               style="flex:1; padding:3px 8px; font-size:12px">
        ${x.제안?.length ? `<button class="ghost small" type="button" data-제안="${i}"
          title="이름을 보고 지은 태그를 넣습니다">✨</button>` : ""}
      </div>`;
    }).join("") : '<div class="hint">해당하는 자산이 없습니다.</div>';

    list.querySelectorAll("[data-줄]").forEach(inp =>
      inp.addEventListener("change", () => 저장(항목[+inp.dataset.줄], inp.value)));
    list.querySelectorAll("[data-제안]").forEach(b => b.addEventListener("click", () => {
      const x = 항목[+b.dataset.제안];
      const inp = list.querySelector(`[data-줄="${b.dataset.제안}"]`);
      inp.value = (x.제안 || []).join(", ");
      저장(x, inp.value);
    }));
  }
  async function 저장(x, 글) {
    if (!x) return;
    try {
      await fetch("/api/tags/update", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: x.종류, id: x.id, tags: 글 }) });
      await 읽기(); opt.바뀜?.();
    } catch (e) { 알림("⚠ " + e.message); }
  }
  읽기();
  return 창;
}

/* ══════════ 📚 시리즈 소속 옮기기 ══════════
   자산은 파일을 옮기지 않고 **소속만 적어** 둔다.
     · 비워 두면 공용 — 모든 시리즈에서 쓴다
     · 폴더를 옮기지 않는 이유: 이미 저장된 프로젝트의 참조가 깨진다 */
export function openSeries(opt = {}) {
  let 시리즈들 = [], 자산목록 = [];
  const 보는것 = opt.group ?? (localStorage.getItem("ws그룹") || "");

  const 창 = openModal({
    제목: "📚 시리즈 소속 옮기기",
    안내: "소속을 비우면 <b>공용</b> — 모든 시리즈에서 쓸 수 있습니다. " +
          "파일은 그대로 있고 소속만 바뀝니다.",
    내용: `<div class="charRow" style="align-items:center; flex-wrap:wrap; gap:6px">
        <button class="ghost small" type="button" id="spAll">전체 고르기</button>
        <select id="spKind" style="max-width:130px">
          <option value="">모든 종류</option>
          ${Object.keys(종류아이콘).map(k => `<option value="${k}">${아이콘(k)} ${k}</option>`).join("")}
        </select>
        <span style="flex:1"></span>
        <span class="hint">보낼 곳</span>
        <select id="spTo" style="max-width:210px"></select>
        <button type="button" id="spMove">📚 고른 것 옮기기</button>
      </div>
      <div class="hint" id="spInfo" style="margin-top:8px">읽는 중…</div>
      <div id="spList" class="vlist" style="margin-top:8px"></div>`,
  });
  const 알림 = 글 => { const el = document.getElementById("spInfo"); if (el) el.textContent = 글; };

  async function 읽기() {
    try { 시리즈들 = (await (await fetch("/api/group/list")).json()).items || []; }
    catch { 시리즈들 = []; }
    try { 자산목록 = (await (await fetch("/api/group/assets")).json()).items || []; }
    catch { 자산목록 = []; }
    document.getElementById("spTo").innerHTML =
      '<option value="">— 공용으로 (소속 없음)</option>' +
      시리즈들.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join("");
    그리기();
  }
  function 그리기() {
    const 거를것 = document.getElementById("spKind").value;
    const 보일것 = 거를것 ? 자산목록.filter(x => x.종류 === 거를것) : 자산목록;
    알림(`모두 ${자산목록.length}개` + (거를것 ? ` · ${거를것} ${보일것.length}개` : "") +
         (보는것 ? ` · 지금 보는 시리즈: ${(시리즈들.find(g => g.id === 보는것) || {}).name || "?"}` : ""));
    document.getElementById("spList").innerHTML = 보일것.length ? 보일것.map(x =>
      `<div class="vitem" style="gap:8px; padding:4px 8px">
        <input type="checkbox" class="spSel" data-id="${escapeHtml(String(x.id))}"
               data-종류="${x.종류}" style="width:auto; margin:0">
        <span class="vname" style="flex:1; font-size:12px">${아이콘(x.종류)} ${escapeHtml(x.name || "")}</span>
        <span class="vinfo" style="width:130px; font-size:11px; color:${x.공용 ? "#7bd88f" : "#a78bfa"}">
          ${x.공용 ? "공용" : escapeHtml((시리즈들.find(g => g.id === x.group) || {}).name || "시리즈")}</span>
        <span class="vinfo" style="width:150px; font-size:11px">${escapeHtml((x.tags || []).join(", "))}</span>
      </div>`).join("") : '<div class="hint">자산이 없습니다.</div>';
  }

  document.getElementById("spKind").addEventListener("change", 그리기);
  document.getElementById("spAll").addEventListener("click", () => {
    const 것들 = [...document.querySelectorAll("#spList .spSel")];
    const 켤까 = 것들.some(c => !c.checked);
    것들.forEach(c => { c.checked = 켤까; });
  });
  document.getElementById("spMove").addEventListener("click", async () => {
    const 고른것 = [...document.querySelectorAll("#spList .spSel:checked")]
      .map(c => ({ kind: c.dataset.종류, id: c.dataset.id }));
    if (!고른것.length) { 알림("먼저 옮길 것을 고르세요."); return; }
    const 갈곳 = document.getElementById("spTo").value;
    const 이름 = 갈곳 ? (시리즈들.find(g => g.id === 갈곳) || {}).name : "공용";
    알림(`${고른것.length}개를 "${이름}" (으)로 옮기는 중…`);
    try {
      const r = await (await fetch("/api/group/assign", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group: 갈곳, 자산: 고른것 }) })).json();
      library.clear();
      await 읽기();
      알림(`✅ ${r.수}개를 "${이름}" (으)로 옮겼습니다`);
      opt.바뀜?.();
    } catch (e) { 알림("⚠ " + e.message); }
  });
  읽기();
  return 창;
}
