/* 🎞 장면 보관함 — 저장한 장면을 미리보고, 영상 만들기로 보낸다. */
import { $, api, escapeHtml, fmtMS, statusBox } from "../core.js";
import { store } from "./store.js";

export async function listScenes() {
  const d = await api("/api/scene/list");
  return d.items || [];
}
export const sceneThumb = id => "/api/scene/thumb?id=" + encodeURIComponent(id);
export async function getScene(id) { return api("/api/scene/get?id=" + encodeURIComponent(id)); }
export async function saveScene(payload) { return api("/api/scene/save", payload); }
export async function deleteScene(id) { return api("/api/scene/delete", { id }); }

export async function mount() {
  const st = statusBox($("scStatus"));
  let items = [], tagFilter = null;

  async function refresh() {
    items = await listScenes();
    renderTags();
    render();
  }
  function renderTags() {
    const set = new Set();
    items.forEach(i => (i.tags || []).forEach(t => set.add(t)));
    const tags = [...set].sort();
    const bar = $("scTagBar");
    bar.innerHTML = tags.length
      ? `<span class="tagChip ${tagFilter ? "" : "on"}" data-t="">전체</span>` +
        tags.map(t => `<span class="tagChip ${tagFilter === t ? "on" : ""}" data-t="${escapeHtml(t)}">#${escapeHtml(t)}</span>`).join("")
      : '<span class="hint">장면에 태그를 달면 여기서 골라 볼 수 있어요.</span>';
    bar.querySelectorAll(".tagChip").forEach(c => c.addEventListener("click", () => {
      tagFilter = c.dataset.t || null; renderTags(); render();
    }));
  }
  function render() {
    const wrap = $("scList");
    let list = items;
    if (tagFilter) list = list.filter(i => (i.tags || []).includes(tagFilter));
    $("scCount").textContent = `${list.length}개 장면`;
    if (!list.length) {
      wrap.innerHTML = '<div class="hint" style="padding:14px">저장된 장면이 없습니다.</div>';
      return;
    }
    wrap.innerHTML = "";
    list.forEach(m => {
      const card = document.createElement("div");
      card.className = "poseCard";
      card.style.width = "210px";
      card.innerHTML = `
        <img src="${sceneThumb(m.id)}" style="height:118px; object-fit:cover; background:#241f26"
             onerror="this.style.visibility='hidden'">
        <div style="font-size:12.5px; font-weight:600; margin-top:6px; overflow:hidden;
                    text-overflow:ellipsis; white-space:nowrap">${escapeHtml(m.name)}</div>
        <div class="hint" style="font-size:11px">${fmtMS(m.seconds)} · ${escapeHtml((m.cast || []).join(", ") || "출연 없음")}</div>
        <div class="hint" style="font-size:11px">${(m.tags || []).map(t => "#" + escapeHtml(t)).join(" ")}</div>
        <div style="display:flex; gap:5px; margin-top:6px">
          <button class="ghost small scUse" style="flex:1">🎬 영상에 넣기</button>
          <button class="danger small scDel">삭제</button>
        </div>`;
      card.querySelector(".scUse").addEventListener("click", async () => {
        st("장면을 불러오는 중…");
        const full = await getScene(m.id);
        store.pendingScene = full;                     // 영상 만들기 탭이 받아 간다
        store.emit("scene-load");
        document.querySelector('#chSubtabs .subtab[data-sub="make"]').click();
        st(`'${m.name}' 장면을 영상에 넣었습니다.`, "ok");
      });
      card.querySelector(".scDel").addEventListener("click", async () => {
        if (!confirm(`'${m.name}' 장면을 삭제할까요?`)) return;
        await deleteScene(m.id);
        await refresh();
        st("삭제했습니다.");
      });
      wrap.appendChild(card);
    });
  }
  $("scRefresh").addEventListener("click", refresh);
  store.addEventListener("scene-saved", refresh);
  await refresh();
}
