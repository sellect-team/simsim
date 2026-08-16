/* 캐릭터 상태(프리셋) 관리 — "기본", "거꾸로", "작게 뒤쪽" 처럼 이름을 붙여 저장해 두고
   장면에서 골라 쓰거나, 이동 중 시작→끝 상태로 서서히 바꿀 수 있다.
   캐릭터 관리 탭의 [🎛 상태 관리] 팝업과 영상 만들기 탭이 함께 쓴다. */
import { api, escapeHtml } from "../core.js";
import { paintProject } from "./puppet.js";

let cache = null;

export async function loadPresets(force = false) {
  if (cache && !force) return cache;
  const d = await api("/api/presets");
  cache = d.presets || {};
  return cache;
}
export const keyFor = actorOrMeta =>
  actorOrMeta.type === "mesh" || actorOrMeta.meshFile
    ? "mesh:" + (actorOrMeta.meshFile || actorOrMeta.name)
    : "char:" + (actorOrMeta.charId || actorOrMeta.id);

export async function statesFor(key) {
  const all = await loadPresets();
  return all[key] || {};
}
export async function saveState(key, name, values) {
  const d = await api("/api/presets/save", { key, name, values });
  cache = cache || {};
  cache[key] = d.states;
  return d.states;
}
export async function deleteState(key, name) {
  const d = await api("/api/presets/delete", { key, name });
  cache = cache || {};
  cache[key] = d.states || {};
  return cache[key];
}

/* 상태에 담기는 항목들 (숫자는 서서히 바뀌고, 나머지는 중간에 딱 바뀐다) */
export const FIELDS = [
  { k: "scale", ko: "크기", type: "num", min: 5, max: 300, step: 1, scale: 100, unit: "%" },
  { k: "floor", ko: "바닥 높이", type: "num", min: 0, max: 130, step: 1, scale: 100, unit: "%" },
  { k: "shadow", ko: "그림자", type: "num", min: 0, max: 80, step: 1, scale: 100, unit: "%" },
  { k: "z", ko: "앞뒤 순서", type: "num", min: -20, max: 20, step: 1, scale: 1 },
  { k: "flipX", ko: "좌우 뒤집기", type: "bool" },
  { k: "upsideDown", ko: "거꾸로", type: "bool" },
  { k: "sideFacing", ko: "측면 방향", type: "sel",
    options: [["left", "왼쪽을 봄"], ["right", "오른쪽을 봄"]], spriteOnly: true },
  { k: "headMotion", ko: "머리 흔들기", type: "bool", spriteOnly: true },
  { k: "headRatio", ko: "머리 비율", type: "num", min: 10, max: 90, step: 1, scale: 100,
    unit: "%", spriteOnly: true },
  { k: "turn", ko: "3D 각도", type: "num", min: -180, max: 180, step: 5, scale: 1,
    unit: "°", meshOnly: true },
  { k: "light", ko: "3D 밝기", type: "num", min: 20, max: 200, step: 5, scale: 100,
    unit: "%", meshOnly: true },
  { k: "color", ko: "3D 색", type: "color", meshOnly: true },
];

export const pickValues = (actor, isMesh) => {
  const out = {};
  FIELDS.forEach(f => {
    if (f.spriteOnly && isMesh) return;
    if (f.meshOnly && !isMesh) return;
    if (actor[f.k] !== undefined) out[f.k] = actor[f.k];
  });
  return out;
};

/**
 * 상태 관리 팝업을 연다.
 * @param opts {key, title, isMesh, actor, puppet, onApply(values)}
 */
export async function openStateManager(opts) {
  const { key, title, isMesh, actor, puppet } = opts;
  const states = { ...(await statesFor(key)) };
  let current = { ...pickValues(actor, isMesh) };
  let selected = null;

  const back = document.createElement("div");
  back.className = "modalBack";
  back.innerHTML = `
    <div class="modalBox">
      <div class="modalHead">🎛 ${escapeHtml(title)} — 상태 관리
        <button class="ghost small" data-x="close" style="margin-left:auto">닫기</button></div>
      <div class="stCols">
        <div>
          <canvas id="stPreview" width="300" height="300"
                  style="width:100%; background:#17151a; border-radius:12px"></canvas>
          <div class="hint" style="margin-top:6px">지금 값으로 미리 보기</div>
          <div id="stTagBar" class="tagBar"></div>
          <div id="stList" class="vlist" style="margin-top:6px"></div>
          <div class="row" style="margin-top:8px">
            <input id="stName" type="text" placeholder="상태 이름 (예: 거꾸로)" style="flex:1">
          </div>
          <div class="row" style="margin-top:6px">
            <input id="stTags" type="text" placeholder="태그 (쉼표로 여러 개: 점프, 귀여움, 밤장면)" style="flex:1">
            <button data-x="save">💾 저장</button>
          </div>
        </div>
        <div id="stForm" class="grid"></div>
      </div>
      <div class="hint" style="margin-top:10px">
        저장한 상태는 [🎬 영상 만들기]에서 캐릭터에 바로 적용하거나,
        이동 중 <b>시작 상태 → 끝 상태</b>로 서서히 바뀌게 할 수 있습니다.
        "<b>기본</b>"이라는 이름으로 저장하면 그 캐릭터를 출연시킬 때 자동으로 적용됩니다.
      </div>
    </div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.addEventListener("click", e => { if (e.target === back) close(); });
  back.querySelector('[data-x="close"]').addEventListener("click", close);

  /* --- 값 편집 폼 --- */
  const form = back.querySelector("#stForm");
  function buildForm() {
    form.innerHTML = "";
    FIELDS.forEach(f => {
      if (f.spriteOnly && isMesh) return;
      if (f.meshOnly && !isMesh) return;
      const box = document.createElement("div");
      const val = current[f.k] ?? actor[f.k];
      if (f.type === "bool") {
        box.innerHTML = `<label>${f.ko}</label>`;
        const c = document.createElement("input"); c.type = "checkbox"; c.checked = !!val;
        c.style.width = "auto";
        c.addEventListener("change", () => { current[f.k] = c.checked; preview(); });
        box.appendChild(c);
      } else if (f.type === "sel") {
        box.innerHTML = `<label>${f.ko}</label><select>${f.options.map(([v, ko]) =>
          `<option value="${v}" ${val === v ? "selected" : ""}>${ko}</option>`).join("")}</select>`;
        box.querySelector("select").addEventListener("change", e => {
          current[f.k] = e.target.value; preview();
        });
      } else if (f.type === "color") {
        box.innerHTML = `<label>${f.ko}</label>`;
        const c = document.createElement("input"); c.type = "color";
        c.value = val || "#f4dcae"; c.style.cssText = "width:100%;height:34px;padding:2px";
        c.addEventListener("input", () => {
          current[f.k] = c.value;
          if (puppet && puppet.setColor) puppet.setColor(c.value);
          preview();
        });
        box.appendChild(c);
      } else {
        const shown = Math.round((val ?? 0) * (f.scale || 1));
        box.innerHTML = `<label>${f.ko} <span class="hint">${shown}${f.unit || ""}</span></label>
          <div class="numRow">
            <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${shown}">
            <input type="number" min="${f.min}" max="${f.max}" step="${f.step}" value="${shown}">
            ${f.unit ? `<span class="unit">${f.unit}</span>` : ""}
          </div>`;
        const [rg, nb] = box.querySelectorAll("input");
        const set = v => {
          rg.value = nb.value = v;
          box.querySelector(".hint").textContent = v + (f.unit || "");
          current[f.k] = Number(v) / (f.scale || 1);
          preview();
        };
        rg.addEventListener("input", () => set(rg.value));
        nb.addEventListener("input", () => set(nb.value));
      }
      form.appendChild(box);
    });
  }

  /* --- 미리보기 --- */
  const pv = back.querySelector("#stPreview");
  const pctx = pv.getContext("2d");
  function preview() {
    const a = { ...actor, ...current, id: "prev" };
    const project = {
      cast: [a], camera: "none",
      shots: [{ seconds: 3, camera: "none", caption: { text: "" },
                acts: { prev: { visible: true, motion: "idle", speed: 1, pos: 0.5,
                                path: { on: false } } } }],
    };
    paintProject(pctx, pv.width, pv.height, { project, puppets: { prev: puppet }, bg: null, t: 0.7 });
  }

  /* --- 저장된 상태 목록 (태그로 걸러 보기) --- */
  let tagFilter = null;
  function allTags() {
    const set = new Set();
    Object.values(states).forEach(v => (v._tags || []).forEach(t => set.add(t)));
    return [...set].sort();
  }
  function renderTagBar() {
    const bar = back.querySelector("#stTagBar");
    const tags = allTags();
    bar.innerHTML = tags.length
      ? `<span class="tagChip ${tagFilter ? "" : "on"}" data-t="">전체</span>` +
        tags.map(t => `<span class="tagChip ${tagFilter === t ? "on" : ""}" data-t="${escapeHtml(t)}">#${escapeHtml(t)}</span>`).join("")
      : '<span class="hint">태그를 달면 여기서 골라 볼 수 있어요.</span>';
    bar.querySelectorAll(".tagChip").forEach(c => c.addEventListener("click", () => {
      tagFilter = c.dataset.t || null;
      renderTagBar(); renderList();
    }));
  }
  function renderList() {
    const list = back.querySelector("#stList");
    let names = Object.keys(states);
    if (tagFilter) names = names.filter(n => (states[n]._tags || []).includes(tagFilter));
    if (!names.length) {
      list.innerHTML = `<div class="hint" style="padding:8px">${
        tagFilter ? `#${escapeHtml(tagFilter)} 태그의 상태가 없습니다.` : "저장된 상태가 없습니다."}</div>`;
      return;
    }
    list.innerHTML = "";
    names.forEach(n => {
      const tags = states[n]._tags || [];
      const d = document.createElement("div");
      d.className = "vitem" + (selected === n ? " sel" : "");
      d.innerHTML = `<span class="vname">${n === "기본" ? "⭐ " : "🎛 "}${escapeHtml(n)}</span>
        <span class="vinfo">${tags.map(t => `#${escapeHtml(t)}`).join(" ")}</span>
        <span class="vactions">
          <button class="ghost small" data-a="load">불러오기</button>
          <button class="danger small" data-a="del">삭제</button>
        </span>`;
      d.querySelector('[data-a="load"]').addEventListener("click", () => {
        current = { ...current, ...states[n] };
        selected = n;
        back.querySelector("#stName").value = n;
        back.querySelector("#stTags").value = (states[n]._tags || []).join(", ");
        if (puppet && puppet.setColor && current.color) puppet.setColor(current.color);
        buildForm(); renderList(); preview();
      });
      d.querySelector('[data-a="del"]').addEventListener("click", async () => {
        if (!confirm(`'${n}' 상태를 지울까요?`)) return;
        const s = await deleteState(key, n);
        Object.keys(states).forEach(k => delete states[k]);
        Object.assign(states, s);
        renderTagBar(); renderList();
      });
      list.appendChild(d);
    });
  }

  back.querySelector('[data-x="save"]').addEventListener("click", async () => {
    const name = back.querySelector("#stName").value.trim();
    if (!name) { back.querySelector("#stName").focus(); return; }
    const tags = back.querySelector("#stTags").value
      .split(/[,\s]+/).map(t => t.trim()).filter(Boolean);
    const s = await saveState(key, name, { ...current, _tags: tags });
    Object.keys(states).forEach(k => delete states[k]);
    Object.assign(states, s);
    selected = name;
    renderTagBar(); renderList();
    if (opts.onApply) opts.onApply(current, states);
  });

  buildForm(); renderTagBar(); renderList(); preview();
  return { close };
}
