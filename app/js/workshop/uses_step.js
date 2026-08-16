/* 🎭 쓰는 것 단계 — 이 프로젝트가 부르는 캐릭터·배경을 한눈에.
 *
 * 어느 편이 누구를 부르는지 보여 주고, 아직 그림이 없는 것은 채우러 갈 수 있게 한다.
 * '자산 이름 바꾸기'도 여기서 한다 — 대본 속 이름까지 같이 바뀐다.
 */
import { escapeHtml } from "../core.js";
import { library } from "../story/assets.js";
import { promptFor } from "../story/needs.js";

export function mountUsesStep(el, S, { st, 보내기, refresh }) {
  const stories = S.열린것?.stories || [];
  const 모음 = new Map();          // 이름 → {종류, 편들:[], 있음, 부족}
  const 담기 = (이름, 종류, 편) => {
    const k = 종류 + ":" + 이름;
    if (!모음.has(k)) 모음.set(k, { 이름, 종류, 편들: [], 부족: null });
    모음.get(k).편들.push(편);
  };
  for (const s of stories) {
    (s.uses.배우 || []).forEach(n => 담기(n, "캐릭터", s.name));
    (s.uses.배경 || []).forEach(n => 담기(n, "배경", s.name));
    for (const m of s.missing || []) {
      const k = m.종류 + ":" + m.이름;
      if (!모음.has(k)) 담기(m.이름, m.종류, s.name);
      모음.get(k).부족 = m;
    }
  }
  const 목록 = [...모음.values()];
  const 부족수 = 목록.filter(x => x.부족).length;

  el.innerHTML = `
    <div class="charRow" style="margin-top:12px; align-items:center">
      <b style="font-size:14px">🎭 이 프로젝트가 쓰는 것</b>
      <span class="hint">${목록.length}개 · 그림 있는 것 ${목록.length - 부족수} · 아직 없는 것 ${부족수}</span>
      <span style="flex:1"></span>
      <button class="ghost small" id="usCopy" type="button">부족한 것 프롬프트 복사</button>
      <button class="ghost small" id="usGo" type="button">🎨 자산 탭 열기</button>
    </div>
    <div id="usList" class="vlist" style="margin-top:8px; max-height:520px; overflow-y:auto"></div>
    <div class="hint" style="margin-top:8px">
      이름을 고쳐 저장하면 <b>모든 대본 속 이름도 함께</b> 바뀝니다 — 이름만 바꿔서 대본이 깨지는 일이 없습니다.
    </div>`;

  el.querySelector("#usList").innerHTML = 목록.length ? 목록.map((x, i) => {
    const 있음 = !x.부족;
    return `<div class="vitem" style="gap:8px">
      <span class="vname" style="flex:1">
        ${x.종류 === "배경" ? "🏞" : "🐕"}
        <input data-이름="${i}" value="${escapeHtml(x.이름)}"
               style="width:170px; display:inline-block; padding:3px 6px; font-size:13px">
        <span class="hint" style="display:block; color:${있음 ? "var(--ok,#7bd88f)" : "var(--warn,#e0a458)"}">
          ${있음 ? "✅ 그림 있음" : (x.부족.자동 ? `🎨 코드로 그려 둠 (${escapeHtml(x.부족.자동설명 || "")})` : "⚠ 필요")}
        </span>
      </span>
      <span class="vinfo" style="flex:1">${escapeHtml(x.편들.join(", "))}</span>
      <span class="vactions">
        <button class="ghost small" data-바꾸기="${i}">이름 바꾸기</button>
        ${있음 ? "" : `<button class="ghost small" data-복사="${i}">📋</button>`}
      </span></div>`;
  }).join("") : '<div class="hint">아직 부르는 것이 없습니다. 스토리에서 대본을 써 보세요.</div>';

  el.querySelectorAll("[data-바꾸기]").forEach(b =>
    b.addEventListener("click", async () => {
      const x = 목록[+b.dataset.바꾸기];
      const 새이름 = el.querySelector(`[data-이름="${b.dataset.바꾸기}"]`).value.trim();
      if (!새이름 || 새이름 === x.이름) { st("이름이 그대로입니다."); return; }
      if (!confirm(`'${x.이름}' → '${새이름}' 로 바꿉니다.\n모든 대본 속 이름도 함께 바뀝니다. 계속할까요?`)) return;
      const r = await 보내기("/api/project/asset/rename", { from: x.이름, to: 새이름 });
      if (r) { st(`${r.수}개 프로젝트의 대본을 함께 고쳤습니다.`, "ok"); await refresh(); }
    }));

  el.querySelectorAll("[data-복사]").forEach(b =>
    b.addEventListener("click", async () => {
      const x = 목록[+b.dataset.복사];
      const 글 = promptFor(x.부족 || { 이름: x.이름, 종류: x.종류 });
      try { await navigator.clipboard.writeText(글); st("복사했습니다.", "ok"); } catch { st(글); }
    }));

  el.querySelector("#usCopy").addEventListener("click", async () => {
    const 것들 = 목록.filter(x => x.부족);
    if (!것들.length) { st("모두 준비돼 있습니다.", "ok"); return; }
    const 글 = 것들.map(x => `# ${x.종류} · ${x.이름}\n${promptFor(x.부족)}`).join("\n\n");
    try { await navigator.clipboard.writeText(글); st(`${것들.length}개 복사했습니다.`, "ok"); } catch { st(글); }
  });

  el.querySelector("#usGo").addEventListener("click", async () => {
    document.querySelector('nav#tabs [data-tab="charTab"]')?.click();
    if (window.ensureTab) await window.ensureTab("charTab");
  });
}
