/* 🎨 3D 색칠 — 이미지→3D 로 만든 메시에 원본 그림 색을 자동으로 입히고, 붓으로 고친다.
   색은 꼭짓점 색(vertex color)으로 저장하므로 텍스처 파일 없이 .glb 하나로 끝난다. */
import * as THREE from "../../lib/three.module.js";
import { GLTFLoader } from "../../lib/GLTFLoader.js";
import { GLTFExporter } from "../../lib/GLTFExporter.js";
import { $, escapeHtml, statusBox, linkNum, addTips, loadImage } from "../core.js";
import { store } from "./store.js";
import { listMeshes, meshUrl } from "./mesh3d.js";
import { readCharacter, projectColors, makeSampler } from "./autopaint.js";

const TIPS = {
  pmMesh: "색을 입힐 3D 모델입니다. 캐릭터 관리에서 만든 시트를 ComfyUI 로 3D 변환한 결과가 여기 나옵니다.",
  pmChar: "색을 가져올 캐릭터입니다. 이 캐릭터의 정면·측면·후면 그림을 3D 표면에 투영합니다.",
  pmMode: "· 돌려보기: 드래그로 모델을 회전\n· 붓으로 칠하기: 클릭·드래그한 곳을 붓 색으로\n· 색 찍어오기: 모델에서 색을 집어 붓 색으로 가져옵니다",
  pmSize: "붓의 크기입니다(모델 크기 대비 %). 크게 하면 넓은 면을, 작게 하면 귀·눈 같은 부분을 칠합니다.",
  pmFlow: "한 번 칠할 때 색이 얼마나 진하게 덮이는지입니다. 낮추면 여러 번 덧칠하며 자연스럽게 섞입니다.",
  pmSoft: "붓 가장자리를 부드럽게 번지게 할지입니다.",
  pmBase: "자동 색 입히기에서 그림이 닿지 않는 곳(바닥·안쪽)에 쓸 기본 색입니다.",
  pmFront: "정면 그림을 얼마나 강하게 반영할지입니다. 정면이 가장 정확하므로 보통 100% 이상으로 둡니다.",
  pmBlend: "옆·뒤 그림이 섞이는 부드러움입니다. 값이 크면 정면/측면 경계가 뚜렷해지고, 작으면 넓게 섞입니다.",
  pmGamma: "전체 밝기입니다. 3D 조명 때문에 어두워 보이면 올리세요.",
};

export async function mount() {
  const st = statusBox($("pmStatus"));
  const canvas = $("pmCanvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x17151a);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(2, 3, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd3ff, 0.35); rim.position.set(-3, 1.5, -2); scene.add(rim);
  const pivot = new THREE.Group(); scene.add(pivot);

  const loader = new GLTFLoader();
  const raycaster = new THREE.Raycaster();
  const state = { root: null, meshes: [], meshName: "", spin: true, mode: "orbit",
                  dragging: false, lastX: 0, lastY: 0, undo: [], original: null };
  const opt = { color: "#f4dcae", base: "#f4dcae", size: 0.03, flow: 1, soft: true,
                front: 1, blend: 4, gamma: 1, sideMode: "extend" };

  /* ── 조절판 ─────────────────────────── */
  linkNum($("pmSizeR"), $("pmSize"), $("pmSizeHint"), v => v + "%", v => opt.size = v / 100);
  linkNum($("pmFlowR"), $("pmFlow"), $("pmFlowHint"), v => v + "%", v => opt.flow = v / 100);
  linkNum($("pmFrontR"), $("pmFront"), $("pmFrontHint"), v => v + "%", v => opt.front = v / 100);
  linkNum($("pmBlendR"), $("pmBlend"), $("pmBlendHint"),
          v => v <= 2 ? "넓게 섞임" : v <= 6 ? "보통" : "또렷하게", v => opt.blend = v);
  linkNum($("pmGammaR"), $("pmGamma"), $("pmGammaHint"), v => (v / 100).toFixed(2), v => opt.gamma = v / 100);
  $("pmColor").addEventListener("input", e => { opt.color = e.target.value; drawBrushPreview(); });
  $("pmBase").addEventListener("input", e => opt.base = e.target.value);
  $("pmSoft").addEventListener("change", e => { opt.soft = e.target.value === "1"; drawBrushPreview(); });
  $("pmSideMode").addEventListener("change", e => opt.sideMode = e.target.value);
  $("pmMode").addEventListener("change", e => {
    state.mode = e.target.value;
    canvas.style.cursor = state.mode === "orbit" ? "grab" : "crosshair";
    if (state.mode === "orbit") $("pmCursor").style.display = "none";
  });
  $("pmSpin").addEventListener("change", e => state.spin = e.target.checked);
  addTips(TIPS);

  /* 붓 견본 — 지금 설정으로 칠했을 때의 번짐 정도를 그려 보여준다 */
  function drawBrushPreview() {
    const c = $("pmBrushPrev"); if (!c) return;
    const x = c.getContext("2d");
    x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = "#3a3340"; x.fillRect(0, 0, c.width, c.height);
    const r = Math.max(6, Math.min(c.height * 0.42, opt.size * 900));
    const cx = c.width / 2, cy = c.height / 2;
    const col = opt.color;
    if (opt.soft) {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, col); g.addColorStop(0.55, col);
      g.addColorStop(1, col + "00");
      x.globalAlpha = opt.flow; x.fillStyle = g;
    } else {
      x.globalAlpha = opt.flow; x.fillStyle = col;
    }
    x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
    x.globalAlpha = 1;
    x.fillStyle = "rgba(255,255,255,0.75)";
    x.font = "600 12px system-ui"; x.textAlign = "left";
    x.fillText(`크기 ${(opt.size * 100).toFixed(1)}%  ·  세기 ${Math.round(opt.flow * 100)}%  ·  ` +
               (opt.soft ? "부드럽게" : "또렷하게"), 10, 18);
  }

  /* ── 목록 ───────────────────────────── */
  let meshItems = [];
  async function fillMeshes() {
    const items = await listMeshes();
    meshItems = items;
    $("pmMesh").innerHTML = '<option value="">3D 모델 고르기…</option>' +
      items.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)} ` +
        `(${(m.size / 1048576).toFixed(1)}MB)</option>`).join("");
  }
  function fillChars() {
    $("pmChar").innerHTML = '<option value="">색을 가져올 캐릭터…</option>' +
      store.characters.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  }
  $("pmRefresh").addEventListener("click", fillMeshes);
  $("pmMesh").addEventListener("change", e => e.target.value && load(e.target.value));

  /* ── 모델 불러오기 ───────────────────── */
  async function load(name) {
    st("3D 모델을 불러오는 중…");
    try {
      const g = await loader.loadAsync(meshUrl(name));
      if (state.root) pivot.remove(state.root);
      state.root = g.scene;
      state.meshName = name.replace(/\.(glb|gltf)$/i, "");
      const box = new THREE.Box3().setFromObject(state.root);
      const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      const s = 1.7 / Math.max(size.x, size.y, size.z);
      state.root.scale.setScalar(s);
      state.root.position.set(-center.x * s, -center.y * s, -center.z * s);

      const meshes = [];
      state.root.traverse(o => { if (o.isMesh) meshes.push(o); });
      state.meshes = meshes;
      let verts = 0;
      for (const o of meshes) {
        const geo = o.geometry;
        if (!geo.attributes.normal) geo.computeVertexNormals();
        if (!geo.attributes.color) {                       // 꼭짓점 색 자리를 만든다
          const n = geo.attributes.position.count;
          const c = new Float32Array(n * 3);
          const base = new THREE.Color(opt.base);
          for (let i = 0; i < n; i++) { c[i*3] = base.r; c[i*3+1] = base.g; c[i*3+2] = base.b; }
          geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
        }
        verts += geo.attributes.position.count;
        o.material = new THREE.MeshStandardMaterial({
          vertexColors: true, roughness: 0.75, metalness: 0.0 });
      }
      state.original = meshes.map(o => Float32Array.from(o.geometry.attributes.color.array));
      state.undo = [];
      pivot.add(state.root);
      pivot.rotation.set(0, 0, 0);
      // 이 3D를 만든 원본 캐릭터가 기록돼 있으면 자동으로 골라 둔다
      const info = meshItems.find(x => x.name === name);
      let auto = "";
      if (info && info.src_char && store.characters.some(c => c.id === info.src_char)) {
        $("pmChar").value = info.src_char;
        const nm = (store.characters.find(c => c.id === info.src_char) || {}).name || "";
        auto = ` · 원본 그림: ${nm}`;
      }
      $("pmInfo").textContent = `${name} · 꼭짓점 ${verts.toLocaleString()}개${auto}`;
      st(auto ? "불러왔습니다. [🎨 자동으로 색 입히기]를 누르면 원본 그림 색이 그대로 입혀집니다."
              : "불러왔습니다. 색을 가져올 캐릭터를 고른 뒤 [🎨 자동으로 색 입히기]", "ok");
    } catch (e) { st("⚠ " + e.message, "err"); }
  }

  /* ── ① 최대한 자동으로 색 입히기 ──────────────
     로컬 이미지 인식으로 캐릭터 색을 먼저 파악하고, 그림을 표면에 투영한 뒤,
     그림이 닿지 않은 곳은 주변 색으로 메운다. */
  $("pmAuto").addEventListener("click", async () => {
    if (!state.meshes.length) { st("먼저 3D 모델을 고르세요.", "err"); return; }
    let cid = $("pmChar").value;
    if (!cid) {
      const info = meshItems.find(x => x.name === $("pmMesh").value);
      if (info && info.src_char) { cid = info.src_char; $("pmChar").value = cid; }
    }
    if (!cid) { st("색을 가져올 캐릭터를 고르세요.", "err"); return; }
    st("그림을 읽고 색을 분석하는 중…");
    await new Promise(r => setTimeout(r, 30));
    try {
      const meta = store.characters.find(c => c.id === cid);
      const { views, palette } = await readCharacter(cid, meta && meta.poses);
      if (!Object.keys(views).length) throw new Error("정면·측면·후면 그림이 없습니다.");
      pushUndo();
      st("3D 표면에 색을 입히는 중…");
      await new Promise(r => setTimeout(r, 30));
      const r = projectColors(state.root, views, {
        front: opt.front, blend: opt.blend, gamma: opt.gamma, sideMode: opt.sideMode,
        base: palette.base || opt.base, fillPasses: 4,
      });
      if (palette.base) { opt.base = palette.base; $("pmBase").value = palette.base; }
      state.meshes.forEach(o => { o.geometry.attributes.color.needsUpdate = true; });
      const tags = (palette.tags || []).slice(0, 6).join(", ");
      st(`✅ 자동 색 입히기 완료 — 꼭짓점 ${r.painted.toLocaleString()}/${r.total.toLocaleString()}개에 ` +
         `그림 색이 들어갔고, 나머지는 주변 색으로 메웠어요. ` +
         `(대표색 ${palette.base}${tags ? " · 인식: " + tags : ""})`, "ok");
    } catch (e) { st("⚠ " + e.message, "err"); }
  });

  /* ── ② 그림 도장 찍기 ────────────────────────
     고른 그림을 지금 보이는 각도 그대로 모델에 눌러 찍는다. */
  let stampImg = null, stampSampler = null;
  function showStampPrev(src) {
    const el = $("pmStampPrev");
    if (!src) { el.style.display = "none"; return; }
    el.src = src; el.style.display = "block";
  }
  async function setStampSource() {
    const v = $("pmStampSrc").value;
    if (v === "upload") { $("pmStampFile").click(); return; }
    const cid = $("pmChar").value;
    if (!cid) { st("먼저 색을 가져올 캐릭터를 고르세요.", "err"); return; }
    try {
      const url = `/api/char/sprite?id=${cid}&role=${v}`;
      stampImg = await loadImage(url);
      stampSampler = makeSampler(stampImg);
      showStampPrev(url);
      st(`도장 그림 준비 완료 (${v}). 모드를 '그림 도장 찍기'로 두고 모델을 클릭하세요.`, "ok");
    } catch { st("그 그림이 없습니다.", "err"); }
  }
  $("pmStampSrc").addEventListener("change", setStampSource);
  $("pmStampFile").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    stampImg = await loadImage(f);
    stampSampler = makeSampler(stampImg);
    showStampPrev(URL.createObjectURL(f));
    st("올린 그림으로 도장을 준비했어요. 모델에서 찍고 싶은 곳을 클릭하세요.", "ok");
  });
  $("pmStampMode").addEventListener("click", async () => {
    if (!stampSampler) await setStampSource();
    $("pmMode").value = "stamp"; state.mode = "stamp";
    canvas.style.cursor = "crosshair";
    st("🖼 도장 모드 — 모델을 클릭하면 그 자리에 그림 색이 찍힙니다.", "ok");
  });

  /* ── 붓으로 칠하기 ───────────────────── */
  function pushUndo() {
    state.undo.push(state.meshes.map(o => Float32Array.from(o.geometry.attributes.color.array)));
    if (state.undo.length > 12) state.undo.shift();
  }
  function applyColors(snapshot) {
    state.meshes.forEach((o, k) => {
      if (!snapshot[k]) return;
      o.geometry.attributes.color.array.set(snapshot[k]);
      o.geometry.attributes.color.needsUpdate = true;
    });
  }
  $("pmUndo").addEventListener("click", () => {
    const s = state.undo.pop();
    if (!s) { st("되돌릴 것이 없습니다."); return; }
    applyColors(s); st("되돌렸습니다.");
  });
  $("pmReset").addEventListener("click", () => {
    if (!state.original) return;
    pushUndo(); applyColors(state.original); st("처음 상태로 되돌렸습니다.");
  });

  function pointerNDC(e) {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1,
                             -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  function paintAt(e, pick = false) {
    if (!state.meshes.length) return;
    raycaster.setFromCamera(pointerNDC(e), camera);
    const hits = raycaster.intersectObjects(state.meshes, true);
    if (!hits.length) return;
    const hit = hits[0];
    const mesh = hit.object;
    const geo = mesh.geometry;
    const col = geo.attributes.color, pos = geo.attributes.position;
    const local = mesh.worldToLocal(hit.point.clone());
    const box = new THREE.Box3().setFromObject(state.root);
    const radius = opt.size * Math.max(...box.getSize(new THREE.Vector3()).toArray()) /
                   (mesh.scale.x * state.root.scale.x || 1);

    if (pick) {                                   // 스포이드
      const i = hit.face.a;
      const c = new THREE.Color(col.getX(i), col.getY(i), col.getZ(i));
      opt.color = "#" + c.getHexString();
      $("pmColor").value = opt.color;
      st("색을 가져왔습니다: " + opt.color);
      return;
    }
    const stamping = state.mode === "stamp" && stampSampler;
    const c = new THREE.Color(opt.color);
    const p = new THREE.Vector3(), world = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const d = p.distanceTo(local);
      if (d > radius) continue;
      let a = opt.flow;
      if (opt.soft) a *= 1 - (d / radius) * (d / radius);
      if (a <= 0) continue;
      let cr = c.r, cg = c.g, cb = c.b;
      if (stamping) {                       // 지금 보이는 각도로 그림을 눌러 찍는다
        world.copy(p); mesh.localToWorld(world); world.project(camera);
        const hp = hit.point.clone().project(camera);
        const rad = 0.5 * (opt.size * 4);   // 화면상 도장 크기
        const u = (world.x - hp.x) / rad * 0.5 + 0.5;
        const v = -(world.y - hp.y) / rad * 0.5 + 0.5;
        const rgb = (u >= 0 && u <= 1 && v >= 0 && v <= 1) ? stampSampler.at(u, v) : null;
        if (!rgb) continue;
        cr = rgb[0]; cg = rgb[1]; cb = rgb[2];
      }
      col.setXYZ(i,
        col.getX(i) * (1 - a) + cr * a,
        col.getY(i) * (1 - a) + cg * a,
        col.getZ(i) * (1 - a) + cb * a);
      n++;
    }
    col.needsUpdate = true;
    if (n) st(stamping ? `🖼 도장 — 꼭짓점 ${n}개` : `붓질 — 꼭짓점 ${n}개`);
  }

  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("pointerdown", e => {
    state.dragging = true; state.lastX = e.clientX; state.lastY = e.clientY;
    state.orbiting = (e.button === 2) || state.mode === "orbit";   // 오른쪽 버튼은 항상 돌려보기
    canvas.setPointerCapture(e.pointerId);
    if (state.orbiting) return;
    if (state.mode === "paint" || state.mode === "stamp") { pushUndo(); paintAt(e); }
    else if (state.mode === "pick") paintAt(e, true);
  });
  canvas.addEventListener("pointermove", e => {
    showCursor(e);
    if (!state.dragging) return;
    if (state.orbiting) {
      pivot.rotation.y += (e.clientX - state.lastX) * 0.01;
      pivot.rotation.x += (e.clientY - state.lastY) * 0.01;
      state.lastX = e.clientX; state.lastY = e.clientY;
      return;
    }
    if (state.mode === "paint") paintAt(e);
  });
  canvas.addEventListener("pointerleave", () => { $("pmCursor").style.display = "none"; });

  /* 붓 크기를 화면에서 원으로 보여준다 */
  function showCursor(e) {
    const el = $("pmCursor");
    if (!el) return;
    if (state.mode === "orbit" || !state.root) { el.style.display = "none"; return; }
    const r = canvas.getBoundingClientRect();
    // 모델 크기를 화면 픽셀로 환산해 붓 반지름을 구한다
    const box = new THREE.Box3().setFromObject(state.root);
    const size = box.getSize(new THREE.Vector3());
    const worldR = opt.size * Math.max(size.x, size.y, size.z);
    const c0 = box.getCenter(new THREE.Vector3()).project(camera);
    const c1 = box.getCenter(new THREE.Vector3()).add(new THREE.Vector3(worldR, 0, 0)).project(camera);
    const px = Math.abs(c1.x - c0.x) * r.width / 2;
    const d = Math.max(6, px * 2);
    el.style.width = d + "px"; el.style.height = d + "px";
    el.style.left = (e.clientX - r.left) + "px";
    el.style.top = (e.clientY - r.top) + "px";
    el.style.borderColor = opt.color;
    el.style.display = "block";
  }
  canvas.addEventListener("pointerup", e => {
    state.dragging = false; state.orbiting = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  });

  /* ── 저장 ───────────────────────────── */
  $("pmSave").addEventListener("click", async () => {
    if (!state.root) { st("먼저 3D 모델을 고르세요.", "err"); return; }
    st("색을 입힌 3D 파일을 만드는 중…");
    try {
      const glb = await new GLTFExporter().parseAsync(state.root, { binary: true });
      const name = (state.meshName || "painted") + "_색";
      const fd = new FormData();
      fd.append("mesh", new Blob([glb], { type: "model/gltf-binary" }), "mesh.glb");
      const src = $("pmChar").value;
      const r = await fetch("/api/mesh/save?name=" + encodeURIComponent(name) +
                            (src ? "&src=" + encodeURIComponent(src) : ""),
                            { method: "POST", body: fd });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      await fillMeshes();
      st(`✅ 저장했어요: ${d.name} (${(d.size / 1048576).toFixed(1)}MB) — ` +
         `[🎬 영상 만들기]의 3D 모델 목록에서 바로 쓸 수 있습니다.`, "ok");
    } catch (e) { st("⚠ " + e.message, "err"); }
  });

  /* ── 그리기 루프 ─────────────────────── */
  function fit() {
    const r = $("pmStage").getBoundingClientRect();
    const w = Math.max(200, Math.round(r.width)), h = Math.max(200, Math.round(r.height || r.width));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener("resize", fit); fit();
  camera.position.set(0, 0.15, 4.6); camera.lookAt(0, 0, 0);   // 전체가 보이도록 조금 멀리
  window.PaintView = {                       // 보기 각도 초기화 (정면)
    front: () => { pivot.rotation.set(0, 0, 0); },
    turn: (x, y) => { pivot.rotation.set(x, y, 0); },
  };
  canvas.style.cursor = "crosshair";
  drawBrushPreview();
  (function loop() {
    requestAnimationFrame(loop);
    if (state.spin && !state.dragging && state.mode === "orbit") pivot.rotation.y += 0.005;
    renderer.render(scene, camera);
  })();

  store.addEventListener("characters", fillChars);
  // 캐릭터 관리에서 [🎨 색칠하기]로 넘어온 3D 모델을 바로 연다
  store.addEventListener("mesh-paint", async () => {
    if (!store.pendingMesh) return;
    const name = store.pendingMesh; store.pendingMesh = null;
    await fillMeshes();
    $("pmMesh").value = name;
    await load(name);
  });
  await Promise.all([fillMeshes(), store.refreshCharacters()]);
  fillChars();
  if (store.pendingMesh) {
    const name = store.pendingMesh; store.pendingMesh = null;
    $("pmMesh").value = name; await load(name);
  }
}
