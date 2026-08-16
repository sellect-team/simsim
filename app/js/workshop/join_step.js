/* 🎞 이어붙이기 단계 — 짧은 이야기 여러 편을 순서대로 이어 20~30분짜리로.
 *
 * 트랙을 여러 겹 쌓지 않는다. 우리가 만드는 것은 '차례로 잇는' 것이라 한 줄이면 충분하고,
 * 겹치는 느낌은 장면 전환이 대신한다.
 */
import { escapeHtml } from "../core.js";
import { 상태색 } from "../tabs/home.js";

export function mountJoinStep(el, S, { st, 보내기, refresh }) {
  const stories = S.열린것?.stories || [];
  const 저장순서 = (S.열린것?.timeline?.순서 || []).filter(sid => stories.some(s => s.sid === sid));
  const 순서 = 저장순서.length ? 저장순서 : stories.map(s => s.sid);
  for (const s of stories) if (!순서.includes(s.sid)) 순서.push(s.sid);
  const 사이 = S.열린것?.timeline?.사이 ?? 0.3;
  const 줄 = 순서.map(sid => stories.find(s => s.sid === sid)).filter(Boolean);
  const 총초 = 줄.reduce((a, b) => a + (b.seconds || 0), 0) + Math.max(0, 줄.length - 1) * 사이;
  const 구운것 = 줄.filter(s => (s.videos || []).length).length;

  el.innerHTML = `
    <div class="charRow" style="margin-top:12px; align-items:center">
      <b style="font-size:14px">🎞 이어붙이기 차례</b>
      <span class="hint">${줄.length}편 · 모두 ${Math.floor(총초 / 60)}분 ${Math.round(총초 % 60)}초
        · 구운 편 ${구운것}/${줄.length}</span>
      <span style="flex:1"></span>
      <label class="hint" style="display:inline-flex; align-items:center; gap:6px; margin:0">
        사이 <input id="joGap" type="number" min="0" max="3" step="0.1" value="${사이}"
                   style="width:70px"> 초</label>
      <button class="ghost small" id="joSave" type="button">차례 저장</button>
    </div>

    <div id="joList" class="vlist" style="margin-top:8px"></div>

    <div style="margin-top:14px">
      <div class="hint" style="margin-bottom:4px">이어 붙인 모습</div>
      <div id="joBar" style="position:relative; height:34px; background:#141219;
           border-radius:8px; overflow:hidden"></div>
    </div>

    <div class="hint" style="margin-top:10px">
      실제로 하나로 합치는 것은 <b>🔥 굽기</b> 단계에서 [이어서 한 편] 을 고르면 됩니다.
      아직 안 구운 편이 있으면 굽기 단계가 먼저 구워 줍니다.
    </div>`;

  function 목록그리기() {
    el.querySelector("#joList").innerHTML = 줄.length ? 줄.map((s, i) => {
      const c = 상태색[s.state] || 상태색["빈대본"];
      return `<div class="vitem" style="gap:8px">
        <span class="hint" style="width:22px; text-align:right">${i + 1}</span>
        <img src="/api/project/thumb?id=${s.sid}" style="width:30px;height:52px;object-fit:contain;
             border-radius:4px;background:#231f2b" onerror="this.style.visibility='hidden'">
        <span class="vname" style="flex:1">${escapeHtml(s.name)}
          <span class="hint" style="display:block; color:${c.c}">${c.i} ${c.ko}
            · ${(s.seconds || 0).toFixed(1)}초</span></span>
        <span class="vactions">
          <button class="ghost small" data-위="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="ghost small" data-아래="${i}" ${i === 줄.length - 1 ? "disabled" : ""}>↓</button>
        </span></div>`;
    }).join("") : '<div class="hint">이야기가 없습니다.</div>';

    el.querySelectorAll("[data-위]").forEach(b => b.addEventListener("click", () => 옮기기(+b.dataset.위, -1)));
    el.querySelectorAll("[data-아래]").forEach(b => b.addEventListener("click", () => 옮기기(+b.dataset.아래, 1)));
    띠그리기();
  }

  function 옮기기(i, d) {
    const j = i + d;
    if (j < 0 || j >= 줄.length) return;
    [줄[i], 줄[j]] = [줄[j], 줄[i]];
    목록그리기();
  }

  function 띠그리기() {
    const 사이값 = parseFloat(el.querySelector("#joGap").value) || 0;
    const 합 = 줄.reduce((a, b) => a + (b.seconds || 0), 0) + Math.max(0, 줄.length - 1) * 사이값;
    let x = 0;
    el.querySelector("#joBar").innerHTML = 줄.map((s, i) => {
      const w = (s.seconds || 0) / Math.max(0.001, 합) * 100;
      const left = x; x += w + (i < 줄.length - 1 ? 사이값 / Math.max(0.001, 합) * 100 : 0);
      const 색 = (상태색[s.state] || 상태색["빈대본"]).c;
      return `<div title="${escapeHtml(s.name)}" style="position:absolute; left:${left}%; width:${w}%;
        top:5px; height:24px; background:${색}44; border:1px solid ${색}; border-radius:5px;
        font-size:10px; color:#e8e2d8; padding:3px 5px; white-space:nowrap; overflow:hidden">
        ${escapeHtml(s.name)}</div>`;
    }).join("");
  }

  el.querySelector("#joGap").addEventListener("input", 띠그리기);
  el.querySelector("#joSave").addEventListener("click", async () => {
    const r = await 보내기("/api/project/story/order", {
      id: S.열린것.id,
      순서: 줄.map(s => s.sid),
      사이: parseFloat(el.querySelector("#joGap").value) || 0,
    });
    if (r) { st("차례를 저장했습니다.", "ok"); await refresh(); }
  });

  목록그리기();
}
