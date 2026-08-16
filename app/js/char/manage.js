/* 🐕 캐릭터 관리 — 시트 올리기, 배경 제거 옵션, 포즈 역할 지정, 저장/삭제 */
import { $, escapeHtml, statusBox, linkNum, loadImage, addTips, foldSection, api } from "../core.js";
import { ROLES, AUTO_ORDER, Puppet } from "./puppet.js";
import { openStateManager } from "./states.js";
import { MeshActor, listMeshes, meshUrl } from "./mesh3d.js";
import { store } from "./store.js";
import { loadImage as loadImg } from "../core.js";
import { 시리즈고르개, 붙이기 as 시리즈붙이기, 시리즈읽기,
         시리즈로가르기, 가름머리 } from "../ui/group_pick.js";

const TIPS = {
  chBgMode: "그림에서 무엇을 '배경'으로 보고 지울지 정합니다.\n" +
    "· 자동: 그림 네 변에서 가장 많은 색을 배경으로 봅니다 (대부분 이걸로 충분)\n" +
    "· 흰색 계열: 배경이 흰색인 스캔 그림에 좋습니다\n" +
    "· 직접 고른 색: 아래 '배경 색'에서 고른 색을 지웁니다 (배경이 하늘색 등일 때)\n" +
    "· 지우지 않음: 이미 배경이 투명한 PNG를 그대로 씁니다",
  chTol: "배경으로 볼 색의 허용 범위입니다.\n" +
    "· 낮추면: 배경과 아주 비슷한 색만 지웁니다 → 캐릭터의 밝은 부분이 안전하지만 배경 얼룩이 남을 수 있어요\n" +
    "· 올리면: 더 과감하게 지웁니다 → 배경은 깨끗해지지만 캐릭터의 연한 색(흰 운동화 등)이 뚫릴 수 있어요\n" +
    "권장 20~40. 결과를 보고 [🔄 다시 분리]로 조정하세요.",
  chBgColor: "'직접 고른 색'을 선택했을 때 지울 색입니다. 그림에서 배경으로 쓰인 색을 골라주세요.",
  chFeather: "잘라낸 가장자리를 어떻게 처리할지입니다.\n" +
    "· 부드럽게: 원본 그림의 매끄러운 외곽선을 그대로 살립니다 (권장)\n" +
    "· 깔끔하게: 픽셀 단위로 딱 자릅니다. 계단처럼 보일 수 있지만 배경 잔상이 전혀 없습니다",
  chGap: "선이 끊긴 곳을 이어 붙이는 정도입니다.\n" +
    "한 캐릭터가 여러 조각으로 쪼개져 나오면 값을 올리세요.\n" +
    "너무 올리면 가까이 붙은 다른 포즈끼리 한 덩어리로 합쳐집니다.",
  chMin: "이 픽셀 수보다 작은 덩어리는 무시합니다.\n" +
    "글자·먼지 같은 잔조각이 포즈로 잡히면 올리고, 작은 소품까지 살리고 싶으면 내리세요.",
  chPad: "잘라낸 그림 둘레에 남길 여백(픽셀)입니다. 외곽선이 잘려 보이면 조금 올리세요.",
};

export async function mount() {
  const st = statusBox($("chStatus"));
  const state = { file: null, parts: [], roles: [], name: "" };

  const opts = { mode: "auto", key: "#faf6ee", tol: 26, gap: 5, feather: 1,
                 min_area: 1200, pad: 8 };
  linkNum($("chTolR"), $("chTol"), $("chTolHint"), v => v, v => opts.tol = v);
  linkNum($("chGapR"), $("chGap"), $("chGapHint"), v => v, v => opts.gap = v);
  linkNum($("chMinR"), $("chMin"), $("chMinHint"), v => v, v => opts.min_area = v);
  linkNum($("chPadR"), $("chPad"), null, v => v, v => opts.pad = v);
  $("chBgMode").addEventListener("change", e => opts.mode = e.target.value);
  $("chBgColor").addEventListener("input", e => opts.key = e.target.value);
  $("chFeather").addEventListener("change", e => opts.feather = +e.target.value);
  foldSection($("chAdvBtn"), $("chAdv"));
  addTips(TIPS);

  $("chPick").addEventListener("click", () => $("chFile").click());
  $("chFile").addEventListener("change", e => {
    const f = e.target.files[0];
    if (!f) return;
    state.file = f;
    state.name = f.name.replace(/\.[^.]+$/, "");
    $("chOptWrap").style.display = "block";
    split();
  });
  $("chReSplit").addEventListener("click", () => split());

  async function split() {
    if (!state.file) { st("먼저 캐릭터 시트를 올리세요.", "err"); return; }
    st("배경을 지우고 포즈를 분리하는 중…");
    try {
      const q = new URLSearchParams({
        mode: opts.mode, key: opts.key, tol: opts.tol, gap: opts.gap,
        feather: opts.feather, min_area: opts.min_area, pad: opts.pad,
      });
      const fd = new FormData();
      fd.append("image", state.file, state.file.name);
      const r = await fetch("/api/char/split?" + q, { method: "POST", body: fd });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      state.parts = (d.parts || []).filter(p => !p.looks_label);
      // 시트에 그려진 순서(위→아래, 왼쪽→오른쪽)대로 역할을 추측한다
      state.parts.sort((a, b) => (a.y > b.y + 60 ? 1 : b.y > a.y + 60 ? -1 : a.x - b.x));
      state.roles = state.parts.map((_, i) => AUTO_ORDER[i] || "extra");
      await renderPoses();
      st(`✅ 포즈 ${state.parts.length}개를 잘라냈어요. 역할을 확인하고 [💾 캐릭터로 저장]`, "ok");
    } catch (err) { st("⚠ " + err.message, "err"); }
  }

  async function renderPoses() {
    const wrap = $("chPoses");
    wrap.innerHTML = "";
    state.parts.forEach((p, i) => {
      const card = document.createElement("div");
      card.className = "poseCard";
      card.innerHTML = `<img src="${p.png}">
        <select>${ROLES.map(([v, ko]) =>
          `<option value="${v}" ${state.roles[i] === v ? "selected" : ""}>${ko}</option>`).join("")}</select>`;
      card.querySelector("select").addEventListener("change", e => {
        state.roles[i] = e.target.value;
        markUsed();
        preview();
      });
      wrap.appendChild(card);
    });
    markUsed();
    await preview();
  }
  function markUsed() {
    document.querySelectorAll("#chPoses .poseCard").forEach((c, i) =>
      c.classList.toggle("used", !!state.roles[i] && state.roles[i] !== "extra"));
  }
  /** 작업 중인 시트를 바로 '영상 만들기'에서 쓸 수 있게 저장소에 올려둔다 */
  async function preview() {
    const poses = {};
    for (let i = 0; i < state.parts.length; i++) {
      const role = state.roles[i];
      if (!role || role === "extra" || poses[role]) continue;
      poses[role] = await loadImage(state.parts[i].png);
    }
    $("chInfo").textContent = state.parts.length
      ? `${state.name} — 포즈 ${Object.keys(poses).length}개 (${Object.keys(poses).join(", ")})` : "";
    store.setPuppet(new Puppet(poses));
  }

  $("chSave").addEventListener("click", async () => {
    if (!state.parts.length) { st("먼저 캐릭터 시트를 올리세요.", "err"); return; }
    const poses = {};
    state.parts.forEach((p, i) => {
      const r = state.roles[i];
      if (r && r !== "extra" && !poses[r]) poses[r] = p.png;
    });
    if (!Object.keys(poses).length) { st("역할이 지정된 포즈가 없습니다.", "err"); return; }
    try {
      const name = prompt("캐릭터 이름", state.name || "캐릭터");
      if (name === null) return;
      await store.saveCharacter(name, poses);
      st(`💾 '${name}' 캐릭터를 저장했어요. [🎬 영상 만들기] 탭에서 고를 수 있습니다.`, "ok");
    } catch (e) { st("⚠ " + e.message, "err"); }
  });

  /* --- 이미 만든 캐릭터에 포즈 더 넣기 (측면·앉기·엎드리기…) --- */
  function openAddPosePopup(m) {
    const have = Object.keys(m.poses || {});
    const back = document.createElement("div");
    back.className = "modalBack";
    back.innerHTML = `
      <div class="modalBox" style="width:min(900px,96vw)">
        <div class="modalHead">➕ '${escapeHtml(m.name)}' 에 포즈 추가
          <button class="ghost small" data-x="close" style="margin-left:auto">닫기</button></div>
        <div class="hint" style="margin-bottom:10px">
          지금 있는 포즈: <b>${have.join(", ") || "없음"}</b>.
          측면·후면·앉기·엎드리기 그림을 올리면 배경을 지워 같은 캐릭터에 더해 줍니다.
          (여러 포즈가 한 장에 있어도 자동으로 나눕니다)
        </div>
        <div class="charRow">
          <button class="ghost" id="apPick" type="button">🖼 그림 올리기</button>
          <button class="ghost small" id="apReSplit" type="button">🔄 이 설정으로 다시 분리</button>
          <span class="hint" id="apInfo" style="align-self:center"></span>
        </div>
        <input type="file" id="apFile" accept="image/*" style="display:none">
        <div class="grid">
          <div><label>지울 배경</label><select id="apMode">
            <option value="auto" selected>자동 (그림 가장자리 색)</option>
            <option value="white">흰색 계열</option>
            <option value="color">직접 고른 색</option>
            <option value="keep">지우지 않음</option>
          </select></div>
          <div><label>지우는 세기 <span class="hint" id="apTolHint">26</span></label>
            <div class="numRow"><input type="range" id="apTolR" min="4" max="120" step="1" value="26">
              <input type="number" id="apTol" min="2" max="200" step="1" value="26"></div></div>
          <div><label>배경 색</label><input type="color" id="apColor" value="#faf6ee"
               style="width:100%;height:34px;padding:2px"></div>
          <div><label>가장자리</label><select id="apFeather">
            <option value="1" selected>부드럽게</option><option value="0">깔끔하게</option></select></div>
          <div><label>끊긴 선 잇기 <span class="hint" id="apGapHint">5</span></label>
            <div class="numRow"><input type="range" id="apGapR" min="1" max="21" step="2" value="5">
              <input type="number" id="apGap" min="1" max="25" step="1" value="5"></div></div>
          <div><label>최소 크기 <span class="hint" id="apMinHint">1200</span></label>
            <div class="numRow"><input type="range" id="apMinR" min="100" max="20000" step="100" value="1200">
              <input type="number" id="apMin" min="50" max="200000" step="100" value="1200"></div></div>
        </div>
        <div class="poseGrid" id="apPoses"></div>
        <div class="row"><button id="apSave" style="flex:1">💾 이 포즈들을 캐릭터에 추가</button></div>
        <div id="apStatus" class="hint" style="text-align:center; min-height:18px; margin-top:6px"></div>
      </div>`;
    document.body.appendChild(back);
    const g = id => back.querySelector("#" + id);
    const close = () => back.remove();
    back.querySelector('[data-x="close"]').addEventListener("click", close);
    back.addEventListener("click", e => { if (e.target === back) close(); });
    const ast = statusBox(g("apStatus"));
    const o = { mode: "auto", key: "#faf6ee", tol: 26, gap: 5, feather: 1, min_area: 1200 };
    linkNum(g("apTolR"), g("apTol"), g("apTolHint"), v => v, v => o.tol = v);
    linkNum(g("apGapR"), g("apGap"), g("apGapHint"), v => v, v => o.gap = v);
    linkNum(g("apMinR"), g("apMin"), g("apMinHint"), v => v, v => o.min_area = v);
    g("apMode").addEventListener("change", e => o.mode = e.target.value);
    g("apColor").addEventListener("input", e => o.key = e.target.value);
    g("apFeather").addEventListener("change", e => o.feather = +e.target.value);

    let file = null, parts = [], roles = [];
    g("apPick").addEventListener("click", () => g("apFile").click());
    g("apFile").addEventListener("change", e => { file = e.target.files[0]; if (file) split2(); });
    g("apReSplit").addEventListener("click", () => split2());

    async function split2() {
      if (!file) { ast("먼저 그림을 올리세요.", "err"); return; }
      ast("배경을 지우고 포즈를 나누는 중…");
      try {
        const q = new URLSearchParams({ mode: o.mode, key: o.key, tol: o.tol, gap: o.gap,
                                        feather: o.feather, min_area: o.min_area });
        const fd = new FormData();
        fd.append("image", file, file.name);
        const d = await (await fetch("/api/char/split?" + q, { method: "POST", body: fd })).json();
        if (d.error) throw new Error(d.error);
        parts = (d.parts || []).filter(p => !p.looks_label);
        parts.sort((a, b) => (a.y > b.y + 60 ? 1 : b.y > a.y + 60 ? -1 : a.x - b.x));
        // 아직 없는 역할부터 채워 준다
        const free = AUTO_ORDER.filter(r => !have.includes(r));
        roles = parts.map((_, i) => free[i] || "extra");
        renderCards();
        ast(`✅ ${parts.length}개를 나눴어요. 역할을 확인하고 [💾 추가]`, "ok");
      } catch (err) { ast("⚠ " + err.message, "err"); }
    }
    function renderCards() {
      const wrap = g("apPoses");
      wrap.innerHTML = "";
      parts.forEach((p, i) => {
        const card = document.createElement("div");
        card.className = "poseCard" + (roles[i] && roles[i] !== "extra" ? " used" : "");
        card.innerHTML = `<img src="${p.png}">
          <select>${ROLES.map(([v, ko]) =>
            `<option value="${v}" ${roles[i] === v ? "selected" : ""}>${ko}` +
            `${have.includes(v) ? " (덮어쓰기)" : ""}</option>`).join("")}</select>`;
        card.querySelector("select").addEventListener("change", e => {
          roles[i] = e.target.value; renderCards();
        });
        wrap.appendChild(card);
      });
    }
    g("apSave").addEventListener("click", async () => {
      const poses = {};
      parts.forEach((p, i) => {
        const r = roles[i];
        if (r && r !== "extra" && !poses[r]) poses[r] = p.png;
      });
      if (!Object.keys(poses).length) { ast("역할이 지정된 포즈가 없습니다.", "err"); return; }
      try {
        const d = await api("/api/char/addposes", { id: m.id, poses });
        await store.refreshCharacters();
        ast(`✅ ${d.added.join(", ")} 포즈를 추가했어요.`, "ok");
        st(`'${m.name}' 에 포즈 ${d.added.length}개를 더했습니다 (${d.added.join(", ")}).`, "ok");
      } catch (e) { ast("⚠ " + e.message, "err"); }
    });
  }

  /* --- 3D 생성 직후 자동 색칠 ---
     3D를 만들 때 쓴 정면·측면·후면 그림이 모델과 같은 방향으로 맞춰져 있으므로,
     그 위치 그대로 표면에 투영하면 색이 정확히 들어간다. */
  async function autoPaintMesh(meshFile, charMeta, baseName) {
    const [{ GLTFLoader }, { GLTFExporter }, THREE] = await Promise.all([
      import("../../lib/GLTFLoader.js"),
      import("../../lib/GLTFExporter.js"),
      import("../../lib/three.module.js"),
    ]);
    const { readCharacter, projectColors, useVertexColors } = await import("./autopaint.js");
    const g = await new GLTFLoader().loadAsync("/api/mesh/file?name=" + encodeURIComponent(meshFile));
    const root = g.scene;
    const { views, palette } = await readCharacter(charMeta.id, charMeta.poses);
    if (!Object.keys(views).length) throw new Error("색을 가져올 그림이 없습니다.");
    useVertexColors(root);
    projectColors(root, views, { front: 1, blend: 4, gamma: 1, sideMode: "extend",
                                 base: palette.base || "#f4dcae", fillPasses: 5 });
    const glb = await new GLTFExporter().parseAsync(root, { binary: true });
    const fd = new FormData();
    fd.append("mesh", new Blob([glb], { type: "model/gltf-binary" }), "mesh.glb");
    const r = await fetch("/api/mesh/save?name=" + encodeURIComponent(baseName + "_색") +
                          "&src=" + encodeURIComponent(charMeta.id),
                          { method: "POST", body: fd });
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    // 색 없는 원본은 지워 목록을 깔끔하게 유지한다
    try { await api("/api/mesh/delete", { name: meshFile }); } catch {}
    return d.name;
  }

  /* --- 그림 → 3D 캐릭터 만들기 --- */
  function open3dPopup(m, roles) {
    const back = document.createElement("div");
    back.className = "modalBack";
    back.innerHTML = `
      <div class="modalBox" style="width:min(680px,96vw)">
        <div class="modalHead">🧊 '${escapeHtml(m.name)}' → 3D 캐릭터 만들기
          <button class="ghost small" data-x="close" style="margin-left:auto">닫기</button></div>
        <div class="hint" style="margin-bottom:10px">
          이 캐릭터의 <b>${roles.filter(r => ["front","side","back"].includes(r)).join(" · ")}</b>
          그림을 3D로 만듭니다. 정면·측면·후면이 다 있을수록 정확합니다.
          만들어진 3D는 <b>[🎨 3D 색칠]</b>에서 색을 입히고 <b>[🎬 영상 만들기]</b>에서 바로 쓸 수 있어요.
        </div>
        <div class="grid">
          <div><label>품질</label><select id="g3Model">
            <option value="turbo" selected>빠르게 (터보 · 약 1분)</option>
            <option value="standard">정밀하게 (정품 · 2~3배 느림)</option>
          </select></div>
          <div><label>스텝 <span class="hint" id="g3StepsHint">20</span></label>
            <div class="numRow"><input type="range" id="g3StepsR" min="8" max="50" step="1" value="20">
              <input type="number" id="g3Steps" min="5" max="80" step="1" value="20"></div></div>
          <div><label>형태 해상도</label><select id="g3Octree">
            <option value="192">낮음 (가벼움)</option>
            <option value="256" selected>보통 (권장)</option>
            <option value="320">높음 (오래 걸림)</option>
            <option value="384">아주 높음</option>
          </select></div>
          <div><label>표면 다듬기 <span class="hint" id="g3ThrHint">0.60</span></label>
            <div class="numRow"><input type="range" id="g3ThrR" min="30" max="80" step="1" value="60">
              <input type="number" id="g3Thr" min="10" max="95" step="1" value="60"></div></div>
          <div><label>모양 강조 <span class="hint" id="g3CfgHint">4.0</span></label>
            <div class="numRow"><input type="range" id="g3CfgR" min="10" max="90" step="1" value="40">
              <input type="number" id="g3Cfg" min="10" max="120" step="1" value="40"></div></div>
          <div><label>이름</label><input id="g3Name" type="text" value="${escapeHtml(m.name)}"></div>
          <div><label>만든 뒤 색 입히기</label><select id="g3Paint">
            <option value="1" selected>자동으로 원본 그림 색 입히기 (권장)</option>
            <option value="0">색 없이 형태만</option>
          </select></div>
        </div>
        <div class="row"><button id="g3Go" style="flex:1">🧊 3D 만들기 시작</button></div>
        <div id="g3Bar" style="display:none; height:10px; background:rgba(255,255,255,0.08);
             border-radius:6px; overflow:hidden; margin-top:10px">
          <div id="g3BarIn" style="height:100%; width:0%; background:var(--color-electric-iris);
               transition:width .3s"></div></div>
        <div id="g3Status" class="hint" style="text-align:center; min-height:18px; margin-top:8px"></div>
      </div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.querySelector('[data-x="close"]').addEventListener("click", close);
    back.addEventListener("click", e => { if (e.target === back) close(); });
    const g = id => back.querySelector("#" + id);
    linkNum(g("g3StepsR"), g("g3Steps"), g("g3StepsHint"), v => v);
    linkNum(g("g3ThrR"), g("g3Thr"), g("g3ThrHint"), v => (v / 100).toFixed(2));
    linkNum(g("g3CfgR"), g("g3Cfg"), g("g3CfgHint"), v => (v / 10).toFixed(1));
    addTips({
      g3Model: "터보는 빠르고, 정품은 형태가 더 정확합니다. 먼저 터보로 확인한 뒤 마음에 들면 정품으로 다시 만드세요.",
      g3Steps: "다듬는 횟수입니다. 20이면 충분하고, 올릴수록 조금 더 매끈해지지만 오래 걸립니다.",
      g3Octree: "3D 모양을 얼마나 촘촘하게 깎을지입니다. 높이면 디테일이 살지만 파일이 커지고 느려집니다.",
      g3Thr: "표면을 잡는 기준값입니다. 낮추면 통통해지고 올리면 홀쭉해집니다. 얇은 부분(귀·꼬리)이 끊기면 낮춰보세요.",
      g3Cfg: "그림을 얼마나 그대로 따를지입니다. 낮으면 부드럽고, 높으면 그림 형태를 강하게 따릅니다.",
    });

    g("g3Go").addEventListener("click", async () => {
      g("g3Go").disabled = true;
      g("g3Bar").style.display = "block";
      const set = (p, t) => { g("g3BarIn").style.width = p + "%"; g("g3Status").textContent = t; };
      set(3, "3D 생성을 시작합니다…");
      try {
        const d = await api("/api/mesh/generate", {
          char_id: m.id, name: g("g3Name").value || m.name,
          model: g("g3Model").value,
          steps: +g("g3Steps").value,
          octree: +g("g3Octree").value,
          threshold: +g("g3Thr").value / 100,
          cfg: +g("g3Cfg").value / 10,
        });
        while (true) {
          await new Promise(r => setTimeout(r, 1500));
          const j = await (await fetch("/api/status/" + d.job)).json();
          if (j.state === "error") throw new Error(j.error || "생성 실패");
          set(j.progress || 5, "⚙ " + (j.note || "만드는 중"));
          if (j.state === "done") {
            let finalName = j.filename;
            if (g("g3Paint").value === "1" && j.filename) {
              set(97, "🎨 원본 그림 색을 입히는 중…");
              try {
                finalName = await autoPaintMesh(j.filename, m, g("g3Name").value || m.name);
              } catch (err) {
                set(99, "형태는 완성됐지만 색 입히기에 실패했어요: " + err.message);
              }
            }
            set(100, `✅ 완성! '${finalName}' — [🎬 영상 만들기]에서 바로 쓸 수 있어요.`);
            st(`🧊 3D 캐릭터 '${finalName}' 생성 완료`, "ok");
            store.emit("mesh-changed");
            break;
          }
        }
      } catch (e) {
        set(0, "⚠ " + e.message);
      }
      g("g3Go").disabled = false;
    });
  }

  /* --- 저장된 캐릭터 목록 --- */
  const filter = { q: "", pose: "", sort: "new" };
  ["chSearch", "chPoseFilter", "chSort"].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", () => {
      filter.q = $("chSearch").value.trim().toLowerCase();
      filter.pose = $("chPoseFilter").value;
      filter.sort = $("chSort").value;
      renderList();
    });
    el.addEventListener("change", () => el.dispatchEvent(new Event("input")));
  });

  function filtered() {
    let list = [...store.characters];
    if (filter.q) list = list.filter(m => (m.name || "").toLowerCase().includes(filter.q));
    if (filter.pose === "3d")
      list = list.filter(m => ["front", "side", "back"].every(r => (m.poses || {})[r]));
    else if (filter.pose)
      list = list.filter(m => (m.poses || {})[filter.pose]);
    const n = m => Object.keys(m.poses || {}).length;
    if (filter.sort === "old") list.sort((a, b) => (a.created || 0) - (b.created || 0));
    else if (filter.sort === "name") list.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));
    else if (filter.sort === "poses") list.sort((a, b) => n(b) - n(a));
    else list.sort((a, b) => (b.created || 0) - (a.created || 0));
    return list;
  }

  function renderList() {
    const wrap = $("chList");
    const list = filtered();
    if ($("chCount")) $("chCount").textContent =
      `${list.length}개${list.length !== store.characters.length ? ` / 전체 ${store.characters.length}개` : ""}`;
    if (!list.length) {
      wrap.innerHTML = `<div class="hint" style="padding:10px">${
        store.characters.length ? "조건에 맞는 캐릭터가 없습니다." : "저장된 캐릭터가 없습니다."}</div>`;
      return;
    }
    wrap.innerHTML = "";
    /* 시리즈를 골랐으면 '이 시리즈 것' 과 '공용' 을 갈라 놓는다 —
       섞여 있으면 이 시리즈에서 뭘 쓸 수 있는지 셀 수가 없다. */
    const 가른것 = 시리즈로가르기(list);
    const 그릴것 = 가른것.가름
      ? [["전용", 가른것.전용], ["공용", 가른것.공용]]
      : [["전부", list]];

    for (const [어느것, 무리] of 그릴것) {
      if (가른것.가름) {
        const h = document.createElement("div");
        h.innerHTML = 어느것 === "전용"
          ? 가름머리(`📚 ${가른것.이름} 전용`, 무리.length, "#a78bfa", "이 시리즈에서만 씁니다")
          : 가름머리("🌐 공용", 무리.length, "#7bd88f", "모든 시리즈가 함께 씁니다");
        wrap.appendChild(h.firstElementChild);
        if (!무리.length) {
          const e = document.createElement("div");
          e.className = "hint";
          e.style.cssText = "padding:4px 10px; font-size:11px";
          e.textContent = 어느것 === "전용"
            ? "이 시리즈만 쓰는 캐릭터가 아직 없습니다 (오른쪽 고르개로 옮기세요)"
            : "공용 캐릭터가 없습니다";
          wrap.appendChild(e);
          continue;
        }
      }
      무리.forEach(m => 줄하나(m, wrap));
    }
    시리즈붙이기(wrap, { 바뀜: () => store.refreshCharacters(), 알림: st });
  }

  /** 캐릭터 한 줄 */
  function 줄하나(m, wrap) {
    {
      const roles = Object.keys(m.poses || {});
      const d = document.createElement("div");
      d.className = "vitem";
      d.innerHTML = `
        <img class="vthumb" style="object-fit:contain;background:#241f26"
             src="/api/char/sprite?id=${m.id}&role=${roles[0] || "front"}">
        <span class="vname">🐕 ${escapeHtml(m.name)}</span>
        <span class="vinfo">${m.date} · 포즈 ${roles.length}개 (${roles.join(", ")})</span>
        <span class="vactions">
          ${시리즈고르개("캐릭터", m.id, m.group)}
          <button class="ghost small chAddPose">➕ 포즈 추가</button>
          <button class="ghost small ch3d" ${roles.includes("front") ? "" : "disabled"}
                  title="이 그림으로 3D 캐릭터를 만듭니다">🧊 3D로 만들기</button>
          <button class="ghost small chStates">🎛 상태 관리</button>
          <button class="ghost small chUse">🎬 이 캐릭터로 만들기</button>
          <button class="danger small chDel">삭제</button>
        </span>`;
      d.querySelector(".chAddPose").addEventListener("click", () => openAddPosePopup(m));
      d.querySelector(".ch3d").addEventListener("click", () => open3dPopup(m, roles));
      d.querySelector(".vname").style.cursor = "pointer";
      d.querySelector(".vname").addEventListener("click", () => openAddPosePopup(m));
      d.querySelector(".chStates").addEventListener("click", async () => {
        st(`'${m.name}' 상태를 여는 중…`);
        const poses = {};
        for (const role of Object.keys(m.poses || {}))
          poses[role] = await loadImg(`/api/char/sprite?id=${m.id}&role=${role}`);
        const puppet = new Puppet(poses);
        await openStateManager({
          key: "char:" + m.id, title: m.name, isMesh: false, puppet,
          actor: { id: "prev", type: "sprite", charId: m.id, name: m.name,
                   scale: 1, floor: 0.78, shadow: 0.35, z: 0, sideFacing: "left",
                   headMotion: true, headRatio: 0.46, flipX: false, upsideDown: false },
        });
        st("");
      });
      d.querySelector(".chUse").addEventListener("click", async () => {
        await store.selectCharacter(m.id);
        document.querySelector('#chSubtabs .subtab[data-sub="make"]').click();
      });
      d.querySelector(".chDel").addEventListener("click", async () => {
        if (!confirm(`'${m.name}' 을(를) 삭제할까요?`)) return;
        await store.deleteCharacter(m.id);
        st("삭제했습니다.");
      });
      wrap.appendChild(d);
    }
  }
  /* --- 3D 캐릭터 목록 (그림 캐릭터와 같은 자리에서 관리) --- */
  async function render3dList() {
    const wrap = $("ch3dList");
    let items = [];
    try { items = await listMeshes(); } catch {}
    $("ch3dCount").textContent = `${items.length}개`;
    if (!items.length) {
      wrap.innerHTML = '<div class="hint" style="padding:10px">아직 3D 캐릭터가 없습니다. ' +
        '위 그림 캐릭터에서 [🧊 3D로 만들기]를 눌러보세요.</div>';
      return;
    }
    wrap.innerHTML = "";
    items.forEach(m => {
      const d = document.createElement("div");
      d.className = "vitem";
      d.innerHTML = `
        <span class="vthumb" style="display:flex;align-items:center;justify-content:center;font-size:22px">🧊</span>
        <span class="vname">${escapeHtml(m.name.replace(/\.glb$/i, ""))}</span>
        <span class="vinfo">${m.date} · ${(m.size / 1048576).toFixed(1)}MB</span>
        <span class="vactions">
          <button class="ghost small m3paint">🎨 색칠하기</button>
          <button class="ghost small m3states">🎛 상태 관리</button>
          <button class="ghost small m3use">🎬 영상에 넣기</button>
          <button class="danger small m3del">삭제</button>
        </span>`;
      d.querySelector(".m3paint").addEventListener("click", () => {
        store.pendingMesh = m.name;
        store.emit("mesh-paint");
        document.querySelector('#chSubtabs .subtab[data-sub="paint"]').click();
      });
      d.querySelector(".m3use").addEventListener("click", () => {
        store.pendingMeshActor = m.name;
        store.emit("mesh-actor");
        document.querySelector('#chSubtabs .subtab[data-sub="make"]').click();
      });
      d.querySelector(".m3states").addEventListener("click", async () => {
        st(`'${m.name}' 3D 모델을 여는 중…`);
        try {
          const puppet = new MeshActor();
          await puppet.load(meshUrl(m.name));
          await openStateManager({
            key: "mesh:" + m.name, title: m.name.replace(/\.glb$/i, ""), isMesh: true, puppet,
            actor: { id: "prev", type: "mesh", meshFile: m.name, name: m.name,
                     scale: 1, floor: 0.78, shadow: 0.35, z: 0, turn: 0,
                     color: "#f4dcae", light: 1, flipX: false, upsideDown: false },
          });
          st("");
        } catch (e) { st("⚠ " + e.message, "err"); }
      });
      d.querySelector(".m3del").addEventListener("click", async () => {
        if (!confirm(`'${m.name}' 3D 모델을 삭제할까요?`)) return;
        await api("/api/mesh/delete", { name: m.name });
        await render3dList();
        st("삭제했습니다.");
      });
      wrap.appendChild(d);
    });
  }
  $("ch3dRefresh").addEventListener("click", render3dList);
  store.addEventListener("mesh-changed", render3dList);

  store.addEventListener("characters", renderList);
  await 시리즈읽기(true);              // 줄마다 붙일 시리즈 고르개에 넣을 목록
  await store.refreshCharacters();
  renderList();
  await render3dList();
}
