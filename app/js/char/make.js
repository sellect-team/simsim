/* 🎬 영상 만들기 — 여러 캐릭터가 여러 장면을 연기하는 한 편의 영상을 만든다.
   프로젝트(project) 하나가 { 배경, 오디오, 출연진 cast, 장면 shots } 로 이루어진다. */
import { $, escapeHtml, fmtMS, statusBox, progressBar, linkNum,
         addTips, renderVideo, loadImage, upload } from "../core.js";
import { MOTIONS, EASINGS, CAMERAS, BUBBLE_POS, BUBBLE_STYLES, FONTS, newBubble,
         paintProject, shotAt, totalSeconds, Puppet } from "./puppet.js";
import { MeshActor, listMeshes, meshUrl } from "./mesh3d.js";
import { openStateManager, statesFor, keyFor, pickValues } from "./states.js";
import { listScenes, getScene, saveScene } from "./scenes.js";
import { store } from "./store.js";

const TIPS = {
  mkBg: "장면의 배경 사진입니다. [배경 관리] 탭에서 올린 사진 중에서 고릅니다.",
  chSize: "완성 영상의 화면 크기입니다. 유튜브 가로는 1920×1080, 쇼츠·릴스는 1080×1920.",
  chFps: "1초에 몇 장을 그릴지입니다. 30이면 충분히 부드럽고, 60은 두 배 오래 걸립니다.",
  chScale: "캐릭터 크기입니다. 100%면 화면 높이의 약 55%를 차지합니다.",
  chFloor: "발이 닿는 바닥 높이입니다. 배경 사진의 지면 위치에 맞추세요 (0%=맨 위, 100%=맨 아래).",
  chShadow: "발밑 그림자의 진하기입니다.",
  chZ: "여러 캐릭터가 겹칠 때 누가 앞에 설지입니다. 값이 클수록 앞(화면 가까이)에 그려집니다.",
  chFacing: "측면 포즈 그림이 원래 어느 쪽을 보는지입니다. 맞춰두면 항상 가는 방향을 보고 걷습니다.",
  chHead: "머리와 몸을 따로 움직여 살아있는 느낌을 줍니다. 갈라져 보이면 끄세요.",
  chHeadR: "그림 위에서부터 몇 %를 머리로 볼지입니다. 머리가 큰 캐릭터는 올리세요.",
  shSecs: "이 장면의 길이입니다. 좌표 이동은 이 시간 동안 시작점에서 끝점까지 진행합니다.",
  chCam: "배경에 카메라 움직임을 줍니다. 정지 사진도 살아있는 장면처럼 보입니다.",
  chCapText: "이 장면에만 나오는 자막입니다. 장면이 바뀌면 자막도 바뀝니다.",
  chCapPos: "자막을 화면 위/아래 중 어디에 둘지입니다.",
  chCapSize: "자막 글자 크기입니다(화면 높이 대비 %). 어떤 해상도에서도 같은 비율로 보입니다.",
  chCapBox: "글자 뒤에 어두운 띠를 넣어 배경이 밝아도 잘 읽히게 합니다.",
  actVisible: "이 장면에서 이 캐릭터를 화면에 보일지입니다. 숨기면 등장하지 않습니다.",
  chMotion: "이 장면에서 취할 동작입니다. 좌우 이동은 아래 '좌표 이동'을 켜면 그 경로가 우선합니다.",
  chSpeed: "동작의 빠르기입니다(다리 놀림 등). 이동 거리와는 별개입니다.",
  chPos: "제자리 동작일 때의 좌우 위치입니다. 좌표 이동을 켜면 시작/끝 X가 대신 쓰입니다.",
  chPathOn: "켜면 캐릭터가 정해진 좌표에서 좌표로 이동합니다. 화면 밖에서 들어오려면 -10% 처럼 음수를 넣으세요.",
  chX1: "출발 지점의 좌우 위치 (0%=왼쪽 끝, 100%=오른쪽 끝).",
  chY1: "출발 지점의 바닥 높이. 끝 Y와 다르게 주면 언덕을 오르내리듯 보입니다.",
  chX2: "도착 지점의 좌우 위치. 화면 밖으로 나가려면 110% 처럼 크게 넣으세요.",
  chY2: "도착 지점의 바닥 높이.",
  chEase: "이동의 가감속입니다. '갔다가 되돌아오기'는 끝점까지 갔다가 다시 시작점으로 돌아옵니다.",
  mkAudioPick: "영상에 깔릴 음악입니다. 영상 길이에 맞춰 잘립니다.",
};

let seq = 1;
const newActor = (charId, name) => ({
  id: "a" + (seq++), type: "sprite", charId, name,
  scale: 1, floor: 0.78, shadow: 0.35, z: 0,
  sideFacing: "left", autoFace: true, headMotion: true, headRatio: 0.46,
});
const newMeshActor = (file, name) => ({
  id: "a" + (seq++), type: "mesh", meshFile: file, name,
  scale: 1, floor: 0.78, shadow: 0.35, z: 0,
  turn: 0, color: "#f4dcae", light: 1, autoFace: true,
});
const newShot = () => ({
  name: "", seconds: 3, camera: "none",
  caption: { text: "", pos: "bottom", size: 0.055, box: true, fade: true },
  acts: {}, bubbles: [],
});
const newAct = () => ({
  visible: true, motion: "idle", speed: 1, pos: 0.5,
  path: { on: false, x1: 0.15, y1: 0.78, x2: 0.85, y2: 0.78, ease: "easeInOut" },
  startName: "", endName: "", startState: null, endState: null,
  changeAt: 0, changeDur: 1,
});

export async function mount() {
  const st = statusBox($("mkStatus"));
  const bar = progressBar($("chBarWrap"), $("chBar"));
  const canvas = $("charCanvas"), ctx = canvas.getContext("2d");

  const project = { bgId: null, audio: null, cast: [], shots: [newShot()], camera: "none" };
  const puppets = {};                        // castId → Puppet
  let curActor = null, curShot = 0, playing = false, raf = null, t0 = 0, tNow = 0, picking = null;

  $("chMotion").innerHTML = Object.entries(MOTIONS)
    .map(([k, m]) => `<option value="${k}">${m.ko}</option>`).join("");
  $("chEase").innerHTML = Object.entries(EASINGS)
    .map(([k, e]) => `<option value="${k}">${e.ko}</option>`).join("");
  $("chCam").innerHTML = Object.entries(CAMERAS)
    .map(([k, c]) => `<option value="${k}">${c.ko}</option>`).join("");
  addTips(TIPS);

  /* ── 도우미 ─────────────────────────────── */
  const shot = () => project.shots[curShot] || project.shots[0];
  const actor = () => project.cast.find(a => a.id === curActor);
  const act = () => {
    const a = actor(); if (!a) return null;
    const s = shot();
    if (!s.acts[a.id]) s.acts[a.id] = newAct();
    return s.acts[a.id];
  };
  const setVal = (id, v) => { const el = $(id); if (el) { el.value = v; } };

  /* ── 배경 / 오디오 ───────────────────────── */
  function fillBg() {
    $("mkBg").innerHTML = '<option value="">배경 없음 (검은 화면)</option>' +
      store.backgrounds.map(b =>
        `<option value="${b.id}" ${project.bgId === b.id ? "selected" : ""}>${escapeHtml(b.name)}</option>`).join("");
  }
  $("mkBg").addEventListener("change", async e => {
    project.bgId = e.target.value || null;
    await store.selectBackground(project.bgId);
    draw();
  });
  $("mkAudioPick").addEventListener("click", () => $("mkAudioFile").click());
  $("mkAudioFile").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    st("음악을 올리는 중…");
    try {
      const d = await upload("/api/upload_audio", f, "audio");
      project.audio = d.name;
      $("mkAudioInfo").textContent = `🎵 ${d.name} (${fmtMS(d.duration)})`;
      st("음악을 넣었습니다. 영상 길이에 맞춰 잘립니다.", "ok");
    } catch (err) { st("⚠ " + err.message, "err"); }
  });

  /* ── 출연진 ─────────────────────────────── */
  function fillAddChar() {
    $("mkAddChar").innerHTML = '<option value="">캐릭터 추가…</option>' +
      store.characters.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  }
  $("mkAddChar").addEventListener("change", async e => {
    const id = e.target.value; if (!id) return;
    e.target.value = "";
    const meta = store.characters.find(c => c.id === id);
    const a = newActor(id, meta ? meta.name : "캐릭터");
    const saved = await statesFor("char:" + id);        // '기본' 상태가 있으면 자동 적용
    if (saved["기본"]) { const v = { ...saved["기본"] }; delete v._tags; Object.assign(a, v); }
    st(`'${a.name}' 을(를) 불러오는 중…`);
    const poses = {};
    for (const role of Object.keys(meta.poses || {}))
      poses[role] = await loadImage(`/api/char/sprite?id=${id}&role=${role}`);
    puppets[a.id] = new Puppet(poses);
    project.cast.push(a);
    project.shots.forEach(s => s.acts[a.id] = newAct());
    curActor = a.id;
    renderCast(); renderShots(); loadActorOpt(); loadActOpt(); draw();
    st(`'${a.name}' 출연 추가 (포즈 ${Object.keys(poses).length}개)`, "ok");
  });

  /* 3D 모델 목록 */
  async function fillMeshes() {
    try {
      const items = await listMeshes();
      $("mkAddMesh").innerHTML = '<option value="">🧊 3D 모델 추가…</option>' +
        items.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)} ` +
          `(${(m.size / 1048576).toFixed(1)}MB)</option>`).join("");
    } catch {}
  }
  $("mkMeshRefresh").addEventListener("click", fillMeshes);
  $("mkAddMesh").addEventListener("change", async e => {
    const file = e.target.value; if (!file) return;
    e.target.value = "";
    st("3D 모델을 불러오는 중…");
    try {
      const a = newMeshActor(file, file.replace(/\.(glb|gltf|obj|ply)$/i, ""));
      const saved = await statesFor("mesh:" + file);
      if (saved["기본"]) { const v = { ...saved["기본"] }; delete v._tags; Object.assign(a, v); }
      const m = new MeshActor();
      await m.load(meshUrl(file));
      puppets[a.id] = m;
      project.cast.push(a);
      project.shots.forEach(s => s.acts[a.id] = newAct());
      curActor = a.id;
      renderCast(); renderShots(); loadActorOpt(); loadActOpt(); draw();
      st(`🧊 3D 모델 '${a.name}' 출연 추가 — '제자리에서 한 바퀴 돌기' 동작이 진짜 3D 회전으로 나옵니다.`, "ok");
    } catch (err) { st("⚠ 3D 모델을 불러오지 못했어요: " + err.message, "err"); }
  });

  function renderCast() {
    const wrap = $("mkCast");
    if (!project.cast.length) {
      wrap.innerHTML = '<div class="hint" style="padding:10px">위에서 캐릭터나 3D 모델을 골라 추가하세요.</div>';
      $("mkActorOpt").style.display = "none";
      return;
    }
    wrap.innerHTML = "";
    project.cast.forEach(a => {
      const d = document.createElement("div");
      d.className = "vitem" + (a.id === curActor ? " sel" : "");
      const thumb = a.type === "mesh"
        ? `<span class="vthumb" style="display:flex;align-items:center;justify-content:center;font-size:22px">🧊</span>`
        : `<img class="vthumb" style="object-fit:contain;background:#241f26"
              src="/api/char/sprite?id=${a.charId}&role=front">`;
      d.innerHTML = `${thumb}
        <span class="vname">${escapeHtml(a.name)}</span>
        <span class="vinfo">${a.type === "mesh" ? "3D 모델 · " : ""}앞뒤 ${a.z}</span>
        <span class="vactions"><button class="danger small">빼기</button></span>`;
      d.addEventListener("click", ev => {
        if (ev.target.tagName === "BUTTON") return;
        curActor = a.id; renderCast(); loadActorOpt(); loadActOpt(); draw();
      });
      d.querySelector("button").addEventListener("click", () => {
        project.cast = project.cast.filter(x => x.id !== a.id);
        delete puppets[a.id];
        project.shots.forEach(s => delete s.acts[a.id]);
        if (curActor === a.id) curActor = project.cast[0] ? project.cast[0].id : null;
        renderCast(); renderShots(); loadActorOpt(); loadActOpt(); draw();
      });
      wrap.appendChild(d);
    });
    $("mkActorOpt").style.display = curActor ? "block" : "none";
  }

  function loadActorOpt() {
    const a = actor(); if (!a) return;
    $("mkActorName").textContent = a.name;
    $("mkActInName").textContent = a.name;
    const isMesh = a.type === "mesh";
    document.querySelectorAll("#mkActorOpt .meshOnly").forEach(el =>
      el.style.display = isMesh ? "" : "none");
    ["chFacing", "chHead", "chHeadR"].forEach(id => {
      const box = $(id) && $(id).closest("div");
      if (box) box.style.display = isMesh ? "none" : "";
    });
    if (isMesh) {
      $("chMeshColor").value = a.color || "#f4dcae";
      setVal("chTurn", a.turn || 0); $("chTurn").dispatchEvent(new Event("input"));
    }
    setVal("chScale", Math.round(a.scale * 100)); $("chScale").dispatchEvent(new Event("input"));
    setVal("chFloor", Math.round(a.floor * 100)); $("chFloor").dispatchEvent(new Event("input"));
    setVal("chShadow", Math.round(a.shadow * 100)); $("chShadow").dispatchEvent(new Event("input"));
    setVal("chZ", a.z); $("chZ").dispatchEvent(new Event("input"));
    setVal("chHeadR", Math.round(a.headRatio * 100)); $("chHeadR").dispatchEvent(new Event("input"));
    $("chFacing").value = a.sideFacing;
    $("chHead").value = a.headMotion ? "1" : "0";
  }
  linkNum($("chScaleR"), $("chScale"), $("chScaleHint"), v => v + "%",
          v => { const a = actor(); if (a) { a.scale = v / 100; draw(); } });
  linkNum($("chFloorR"), $("chFloor"), $("chFloorHint"), v => v + "%",
          v => { const a = actor(); if (a) { a.floor = v / 100; draw(); } });
  linkNum($("chShadowR"), $("chShadow"), $("chShadowHint"), v => v + "%",
          v => { const a = actor(); if (a) { a.shadow = v / 100; draw(); } });
  linkNum($("chZR"), $("chZ"), $("chZHint"), v => v,
          v => { const a = actor(); if (a) { a.z = v; renderCast(); draw(); } });
  linkNum($("chHeadRR"), $("chHeadR"), $("chHeadRHint"), v => v + "%",
          v => { const a = actor(); if (a) { a.headRatio = v / 100; draw(); } });
  linkNum($("chTurnR"), $("chTurn"), $("chTurnHint"), v => v + "°",
          v => { const a = actor(); if (a) { a.turn = v; draw(); } });
  $("chMeshColor").addEventListener("input", e => {
    const a = actor(); if (!a) return;
    a.color = e.target.value;
    const m = puppets[a.id]; if (m && m.setColor) m.setColor(a.color);
    draw();
  });
  $("chFacing").addEventListener("change", e => { const a = actor(); if (a) { a.sideFacing = e.target.value; draw(); } });
  $("chHead").addEventListener("change", e => { const a = actor(); if (a) { a.headMotion = e.target.value === "1"; draw(); } });

  /* ── 장면 ───────────────────────────────── */
  function renderShots() {
    const wrap = $("mkShots");
    wrap.innerHTML = "";
    project.shots.forEach((s, i) => {
      const names = project.cast.filter(a => (s.acts[a.id] || {}).visible !== false)
        .map(a => `${a.name}: ${(MOTIONS[(s.acts[a.id] || {}).motion] || MOTIONS.idle).ko}`);
      const d = document.createElement("div");
      d.className = "vitem" + (i === curShot ? " sel" : "");
      const label = s.name ? `${i + 1}. ${escapeHtml(s.name)}` : `장면 ${i + 1}`;
      d.innerHTML = `<span class="vname">${s.fromScene ? "🎞 " : ""}${label}</span>
        <span class="vinfo">${s.seconds}초 · ${names.join(" / ") || "출연 없음"}` +
        `${s.caption.text ? ` · 자막 "${escapeHtml(s.caption.text)}"` : ""}` +
        `${(s.bubbles || []).length ? ` · 말풍선 ${s.bubbles.length}개` : ""}</span>`;
      d.addEventListener("click", () => { curShot = i; renderShots(); loadShotOpt(); loadActOpt(); draw(); });
      wrap.appendChild(d);
    });
    renderTimeline();
    const s = shot();
    $("mkShotName").textContent = s && s.name ? `${curShot + 1}. ${s.name}` : `장면 ${curShot + 1}`;
  }
  function renderTimeline() {
    const total = totalSeconds(project.shots);
    $("mkTimeline").innerHTML = "";
    project.shots.forEach((s, i) => {
      const d = document.createElement("div");
      d.style.cssText = `flex:${s.seconds}; height:12px; border-radius:4px; cursor:pointer;` +
        `background:${i === curShot ? "var(--color-electric-iris)" : "rgba(255,255,255,0.16)"}`;
      d.title = `장면 ${i + 1} · ${s.seconds}초`;
      d.addEventListener("click", () => { curShot = i; renderShots(); loadShotOpt(); loadActOpt(); draw(); });
      $("mkTimeline").appendChild(d);
    });
    $("mkTime").textContent = `${fmtMS(tNow)} / ${fmtMS(total)}`;
  }
  $("mkAddShot").addEventListener("click", () => {
    const s = newShot();
    project.cast.forEach(a => s.acts[a.id] = newAct());
    project.shots.splice(curShot + 1, 0, s);
    curShot++; renderShots(); loadShotOpt(); loadActOpt(); draw();
  });
  $("mkDupShot").addEventListener("click", () => {
    project.shots.splice(curShot + 1, 0, structuredClone(shot()));
    curShot++; renderShots(); loadShotOpt(); loadActOpt(); draw();
  });
  $("mkDelShot").addEventListener("click", () => {
    if (project.shots.length <= 1) { st("장면이 하나뿐이라 지울 수 없습니다.", "err"); return; }
    project.shots.splice(curShot, 1);
    curShot = Math.max(0, curShot - 1);
    renderShots(); loadShotOpt(); loadActOpt(); draw();
  });
  const move = dir => {
    const j = curShot + dir;
    if (j < 0 || j >= project.shots.length) return;
    const [s] = project.shots.splice(curShot, 1);
    project.shots.splice(j, 0, s);
    curShot = j; renderShots(); draw();
  };
  $("mkUpShot").addEventListener("click", () => move(-1));
  $("mkDownShot").addEventListener("click", () => move(1));

  function loadShotOpt() {
    const s = shot();
    curBubble = 0;
    renderBubbleList();
    $("shName").value = s.name || "";
    setVal("shSecs", s.seconds); $("shSecs").dispatchEvent(new Event("input"));
    $("chCam").value = s.camera;
    $("chCapText").value = s.caption.text;
    $("chCapPos").value = s.caption.pos;
    $("chCapBox").value = s.caption.box ? "1" : "0";
    setVal("chCapSize", (s.caption.size * 100).toFixed(1)); $("chCapSize").dispatchEvent(new Event("input"));
  }
  linkNum($("shSecsR"), $("shSecs"), null, v => v,
          v => { shot().seconds = v; renderShots(); draw(); });
  $("shName").addEventListener("input", e => { shot().name = e.target.value; renderShots(); });
  $("chCam").addEventListener("change", e => { shot().camera = e.target.value; draw(); });

  /* ── 장면 저장 / 불러오기 ─────────────────── */
  async function fillScenes() {
    try {
      const items = await listScenes();
      $("mkLoadScene").innerHTML = '<option value="">저장된 장면 불러오기…</option>' +
        items.map(m => `<option value="${m.id}">${escapeHtml(m.name)} (${fmtMS(m.seconds)}` +
          `${(m.tags || []).length ? " #" + m.tags.join(" #") : ""})</option>`).join("");
    } catch {}
  }
  $("mkSceneRefresh").addEventListener("click", fillScenes);

  $("mkSaveScene").addEventListener("click", async () => {
    const s = shot();
    const name = prompt("장면 이름", s.name || `장면 ${curShot + 1}`);
    if (name === null) return;
    const tags = (prompt("태그 (쉼표로 여러 개, 없으면 비워두세요)", (s.tags || []).join(", ")) || "")
      .split(/[,\s]+/).map(t => t.trim()).filter(Boolean);
    s.name = name; s.tags = tags;
    // 이 장면에 나오는 배우만 같이 저장한다 (다음에 불러올 때 자동으로 다시 세운다)
    const used = project.cast.filter(a => (s.acts[a.id] || {}).visible !== false);
    // 미리보기 그림
    const keep = tNow; tNow = Math.min(0.8, s.seconds * 0.4);
    const wasPlaying = playing; playing = false;
    draw();
    const thumb = canvas.toDataURL("image/jpeg", 0.7);
    tNow = keep; playing = wasPlaying; draw();
    try {
      await saveScene({ name, tags, data: structuredClone(s), cast: structuredClone(used), thumb });
      await fillScenes();
      store.emit("scene-saved");
      renderShots();
      st(`💾 '${name}' 장면을 보관함에 저장했어요.`, "ok");
    } catch (e) { st("⚠ " + e.message, "err"); }
  });

  /** 저장된 장면을 현재 영상 뒤에 붙인다 (필요한 배우도 자동으로 세운다) */
  async function insertScene(full) {
    st(`'${full.name}' 장면을 불러오는 중…`);
    const map = {};
    for (const c of full.castData || []) {
      let found = project.cast.find(a => a.type === c.type &&
        (c.type === "mesh" ? a.meshFile === c.meshFile : a.charId === c.charId));
      if (!found) {
        found = { ...c, id: "a" + (seq++) };
        if (c.type === "mesh") {
          const m = new MeshActor();
          await m.load(meshUrl(c.meshFile));
          if (c.color && m.setColor) m.setColor(c.color);
          puppets[found.id] = m;
        } else {
          const meta = store.characters.find(x => x.id === c.charId);
          if (!meta) continue;
          const poses = {};
          for (const role of Object.keys(meta.poses || {}))
            poses[role] = await loadImage(`/api/char/sprite?id=${c.charId}&role=${role}`);
          puppets[found.id] = new Puppet(poses);
        }
        project.cast.push(found);
        project.shots.forEach(s2 => { if (!s2.acts[found.id]) s2.acts[found.id] = newAct(); });
      }
      map[c.id] = found.id;
    }
    const s = structuredClone(full.data);
    s.name = full.name; s.tags = full.tags || []; s.fromScene = full.id;
    const acts = {};
    Object.entries(s.acts || {}).forEach(([oldId, act]) => {
      const nid = map[oldId];
      if (nid) acts[nid] = act;
    });
    project.cast.forEach(a => { if (!acts[a.id]) acts[a.id] = { ...newAct(), visible: false }; });
    s.acts = acts;
    (s.bubbles || []).forEach(b => { if (map[b.actorId]) b.actorId = map[b.actorId]; });
    project.shots.push(s);
    curShot = project.shots.length - 1;
    curActor = curActor || (project.cast[0] || {}).id;
    renderCast(); renderShots(); loadShotOpt(); loadActorOpt(); loadActOpt(); draw();
    st(`🎞 '${full.name}' 장면을 넣었습니다 (${fmtMS(s.seconds)}).`, "ok");
  }
  $("mkLoadScene").addEventListener("change", async e => {
    const id = e.target.value; if (!id) return;
    e.target.value = "";
    try { await insertScene(await getScene(id)); }
    catch (err) { st("⚠ " + err.message, "err"); }
  });
  async function addMeshActor(file) {
    $("mkAddMesh").value = file;
    $("mkAddMesh").dispatchEvent(new Event("change"));
  }
  store.addEventListener("mesh-actor", async () => {
    if (!store.pendingMeshActor) return;
    const f = store.pendingMeshActor; store.pendingMeshActor = null;
    await fillMeshes();
    await addMeshActor(f);
  });
  store.addEventListener("scene-load", async () => {
    if (!store.pendingScene) return;
    const full = store.pendingScene; store.pendingScene = null;
    try { await insertScene(full); } catch (e) { st("⚠ " + e.message, "err"); }
  });
  $("chCapText").addEventListener("input", e => { shot().caption.text = e.target.value; renderShots(); draw(); });
  $("chCapPos").addEventListener("change", e => { shot().caption.pos = e.target.value; draw(); });
  $("chCapBox").addEventListener("change", e => { shot().caption.box = e.target.value === "1"; draw(); });
  linkNum($("chCapSizeR"), $("chCapSize"), $("chCapSizeHint"), v => v + "%",
          v => { shot().caption.size = v / 100; draw(); });

  /* ── 말풍선 ────────────────────────────── */
  let curBubble = 0;
  $("bbPos").innerHTML = BUBBLE_POS.map(([v, ko]) => `<option value="${v}">${ko}</option>`).join("");
  $("bbStyle").innerHTML = BUBBLE_STYLES.map(([v, ko]) => `<option value="${v}">${ko}</option>`).join("");
  $("bbFont").innerHTML = FONTS.map(([v, ko]) => `<option value="${v}">${ko}</option>`).join("");
  const bubbles = () => (shot().bubbles = shot().bubbles || []);
  const bub = () => bubbles()[curBubble];

  function renderBubbleList() {
    const list = bubbles();
    $("bbList").innerHTML = list.length
      ? list.map((b, i) => `<option value="${i}" ${i === curBubble ? "selected" : ""}>` +
          `${i + 1}. ${escapeHtml((b.text || "").split("\n")[0].slice(0, 18))}</option>`).join("")
      : '<option value="">말풍선 없음</option>';
    $("bbActor").innerHTML = project.cast.map(a =>
      `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
    $("bbOpt").style.display = list.length ? "grid" : "none";
    if (list.length) loadBubble();
  }
  function loadBubble() {
    const b = bub(); if (!b) return;
    $("bbText").value = b.text || "";
    $("bbActor").value = b.actorId || (project.cast[0] || {}).id || "";
    $("bbPos").value = b.pos; $("bbStyle").value = b.style; $("bbFont").value = b.font;
    $("bbBold").value = b.bold ? "1" : "0";
    $("bbColor").value = b.color; $("bbBg").value = b.bg; $("bbBorder").value = b.border;
    $("bbAutoFlip").checked = b.autoFlip !== false;
    [["bbSize", b.size * 100], ["bbWide", b.maxWidth * 100], ["bbAt", b.appearAt],
     ["bbDur", b.duration], ["bbOx", (b.offsetX || 0) * 100], ["bbOy", (b.offsetY || 0) * 100]]
      .forEach(([id, v]) => { setVal(id, +(+v).toFixed(1)); $(id).dispatchEvent(new Event("input")); });
  }
  $("bbAdd").addEventListener("click", () => {
    const b = newBubble((project.cast[0] || {}).id || "");
    bubbles().push(b); curBubble = bubbles().length - 1;
    renderBubbleList(); renderShots(); draw();
  });
  $("bbDel").addEventListener("click", () => {
    if (!bubbles().length) return;
    bubbles().splice(curBubble, 1);
    curBubble = Math.max(0, curBubble - 1);
    renderBubbleList(); renderShots(); draw();
  });
  $("bbList").addEventListener("change", e => { curBubble = +e.target.value || 0; loadBubble(); draw(); });
  const bset = (id, key, conv = v => v) => $(id).addEventListener("input", e => {
    const b = bub(); if (!b) return; b[key] = conv(e.target.value); draw();
    if (key === "text") renderBubbleList();
  });
  bset("bbText", "text");
  ["bbActor", "bbPos", "bbStyle", "bbFont"].forEach(id => $(id).addEventListener("change", e => {
    const b = bub(); if (!b) return;
    b[{ bbActor: "actorId", bbPos: "pos", bbStyle: "style", bbFont: "font" }[id]] = e.target.value;
    draw();
  }));
  $("bbBold").addEventListener("change", e => { const b = bub(); if (b) { b.bold = e.target.value === "1"; draw(); } });
  ["bbColor", "bbBg", "bbBorder"].forEach(id => $(id).addEventListener("input", e => {
    const b = bub(); if (!b) return;
    b[{ bbColor: "color", bbBg: "bg", bbBorder: "border" }[id]] = e.target.value; draw();
  }));
  $("bbAutoFlip").addEventListener("change", e => { const b = bub(); if (b) { b.autoFlip = e.target.checked; draw(); } });
  linkNum($("bbSizeR"), $("bbSize"), $("bbSizeHint"), v => v + "%", v => { const b = bub(); if (b) { b.size = v / 100; draw(); } });
  linkNum($("bbWideR"), $("bbWide"), $("bbWideHint"), v => v + "%", v => { const b = bub(); if (b) { b.maxWidth = v / 100; draw(); } });
  linkNum($("bbAtR"), $("bbAt"), $("bbAtHint"), v => v + "초", v => { const b = bub(); if (b) { b.appearAt = v; draw(); } });
  linkNum($("bbDurR"), $("bbDur"), $("bbDurHint"), v => v + "초", v => { const b = bub(); if (b) { b.duration = v; draw(); } });
  linkNum($("bbOxR"), $("bbOx"), $("bbOxHint"), v => v + "%", v => { const b = bub(); if (b) { b.offsetX = v / 100; draw(); } });
  linkNum($("bbOyR"), $("bbOy"), $("bbOyHint"), v => v + "%", v => { const b = bub(); if (b) { b.offsetY = v / 100; draw(); } });

  /* ── 장면 × 배우의 움직임 ─────────────────── */
  function loadActOpt() {
    const a = act();
    const on = !!a;
    ["actVisible", "chMotion", "chSpeed", "chPos", "chPathOn"].forEach(id => {
      const el = $(id); if (el) el.disabled = !on;
    });
    if (!a) return;
    $("actVisible").value = a.visible ? "1" : "0";
    $("chMotion").value = a.motion;
    setVal("chSpeed", Math.round(a.speed * 100)); $("chSpeed").dispatchEvent(new Event("input"));
    setVal("chPos", Math.round(a.pos * 100)); $("chPos").dispatchEvent(new Event("input"));
    $("chPathOn").checked = a.path.on;
    $("chEase").value = a.path.ease;
    setVal("chChangeAt", a.changeAt ?? 0); $("chChangeAt").dispatchEvent(new Event("input"));
    setVal("chChangeDur", a.changeDur ?? 1); $("chChangeDur").dispatchEvent(new Event("input"));
    fillStates();
    [["chX1", a.path.x1], ["chY1", a.path.y1], ["chX2", a.path.x2], ["chY2", a.path.y2]]
      .forEach(([id, v]) => { setVal(id, Math.round(v * 100)); $(id).dispatchEvent(new Event("input")); });
  }
  $("actVisible").addEventListener("change", e => { const a = act(); if (a) { a.visible = e.target.value === "1"; renderShots(); draw(); } });
  $("chMotion").addEventListener("change", e => {
    const a = act(); if (!a) return;
    a.motion = e.target.value;
    const need = MOTIONS[a.motion].needs, p = puppets[curActor];
    st(need && p && !p.has(need)
      ? `※ 이 동작은 '${need}' 포즈가 있으면 더 자연스럽습니다.` : "");
    renderShots(); draw();
  });
  linkNum($("chSpeedR"), $("chSpeed"), $("chSpeedHint"), v => (v / 100).toFixed(1) + "×",
          v => { const a = act(); if (a) { a.speed = v / 100; draw(); } });
  linkNum($("chPosR"), $("chPos"), $("chPosHint"), v => v + "%",
          v => { const a = act(); if (a) { a.pos = v / 100; draw(); } });
  /* 저장해 둔 캐릭터 상태(시작 → 끝) */
  async function fillStates() {
    const a = actor();
    const sel = ['<option value="">그대로</option>'];
    if (a) {
      const states = await statesFor(keyFor(a));
      Object.keys(states).forEach(n => {
        const tags = (states[n]._tags || []).map(t => "#" + t).join(" ");
        sel.push(`<option value="${escapeHtml(n)}">${escapeHtml(n)}${tags ? " " + escapeHtml(tags) : ""}</option>`);
      });
      window._chStates = states;
    }
    const cur = act();
    $("actStart").innerHTML = sel.join("");
    $("actEnd").innerHTML = sel.join("");
    if (cur) { $("actStart").value = cur.startName || ""; $("actEnd").value = cur.endName || ""; }
  }
  const applyStateSel = which => {
    const a = act(); if (!a) return;
    const name = $(which === "start" ? "actStart" : "actEnd").value;
    const states = window._chStates || {};
    const values = name && states[name] ? { ...states[name] } : null;
    if (values) delete values._tags;
    if (which === "start") { a.startName = name; a.startState = values; }
    else { a.endName = name; a.endState = values; }
    draw();
  };
  $("actStart").addEventListener("change", () => applyStateSel("start"));
  $("actEnd").addEventListener("change", () => applyStateSel("end"));
  linkNum($("chChangeAtR"), $("chChangeAt"), $("chChangeAtHint"), v => v + "초",
          v => { const a = act(); if (a) { a.changeAt = v; draw(); } });
  linkNum($("chChangeDurR"), $("chChangeDur"), $("chChangeDurHint"), v => v + "초",
          v => { const a = act(); if (a) { a.changeDur = v; draw(); } });
  $("chStates").addEventListener("click", async () => {
    const a = actor(); if (!a) { st("먼저 캐릭터를 고르세요.", "err"); return; }
    await openStateManager({
      key: keyFor(a), title: a.name, isMesh: a.type === "mesh",
      puppet: puppets[a.id], actor: a,
      onApply: values => { Object.assign(a, values); loadActorOpt(); fillStates(); draw(); },
    });
    fillStates();
  });

  /* 동작만 골라서 잠깐 돌려보기 */
  let previewTimer = null;
  $("chMotionPreview").addEventListener("click", () => {
    const a = act(); if (!a) { st("먼저 캐릭터를 고르세요.", "err"); return; }
    if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
    const wasPlaying = playing, keepT = tNow;
    playing = true; tNow = 0; t0 = performance.now();
    if (!raf) loop(performance.now());
    st(`▶ '${MOTIONS[a.motion].ko}' 미리보기 (4초)`, "ok");
    previewTimer = setTimeout(() => {
      playing = wasPlaying; tNow = keepT; t0 = performance.now() - tNow * 1000;
      previewTimer = null; draw(); st("");
    }, 4000);
  });

  $("chPathOn").addEventListener("change", e => { const a = act(); if (a) { a.path.on = e.target.checked; draw(); } });
  $("chEase").addEventListener("change", e => { const a = act(); if (a) a.path.ease = e.target.value; });
  [["chX1R", "chX1", "chX1Hint", "x1"], ["chY1R", "chY1", "chY1Hint", "y1"],
   ["chX2R", "chX2", "chX2Hint", "x2"], ["chY2R", "chY2", "chY2Hint", "y2"]]
    .forEach(([r, n, h, key]) => linkNum($(r), $(n), $(h), v => v + "%",
      v => { const a = act(); if (a) { a.path[key] = v / 100; draw(); } }));

  /* ── 미리보기에서 좌표 찍기 ───────────────── */
  const setPick = which => {
    picking = which;
    $("chPickHint").textContent = which === 1 ? "미리보기에서 시작 지점을 클릭하세요."
                                              : "미리보기에서 끝 지점을 클릭하세요.";
    canvas.style.cursor = "crosshair";
  };
  $("chSetStart").addEventListener("click", () => setPick(1));
  $("chSetEnd").addEventListener("click", () => setPick(2));
  canvas.addEventListener("click", e => {
    if (!picking) return;
    const a = act(); if (!a) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (picking === 1) { a.path.x1 = x; a.path.y1 = y; } else { a.path.x2 = x; a.path.y2 = y; }
    a.path.on = true;
    picking = null; canvas.style.cursor = "";
    $("chPickHint").textContent = `찍은 좌표: ${Math.round(x * 100)}%, ${Math.round(y * 100)}%`;
    loadActOpt(); draw();
  });

  /* ── 그리기 ─────────────────────────────── */
  function fit() {
    const r = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.round(r.width) || 640;
    canvas.height = Math.round(r.height) || 360;
  }
  function draw() {
    if (!canvas.width) fit();
    paintProject(ctx, canvas.width, canvas.height,
                 { project, puppets, bg: store.bgImage, t: tNow });
    const a = act();
    if (a && a.path.on && !playing) {
      const W = canvas.width, H = canvas.height, p = a.path;
      ctx.save();
      ctx.strokeStyle = "rgba(128,82,255,0.9)"; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.moveTo(W * p.x1, H * p.y1); ctx.lineTo(W * p.x2, H * p.y2); ctx.stroke();
      ctx.setLineDash([]);
      [[p.x1, p.y1, "시작"], [p.x2, p.y2, "끝"]].forEach(([x, y, label]) => {
        ctx.fillStyle = "rgba(128,82,255,0.95)";
        ctx.beginPath(); ctx.arc(W * x, H * y, 6, 0, 7); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "600 12px system-ui"; ctx.textAlign = "center";
        ctx.fillText(label, W * x, H * y - 12);
      });
      ctx.restore();
    }
    renderTimeline();
  }
  addEventListener("resize", () => { fit(); draw(); });

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!playing) return;
    tNow = (now - t0) / 1000;
    const total = totalSeconds(project.shots);
    if (tNow > total) { tNow = 0; t0 = now; }
    const cur = shotAt(project.shots, tNow).index;
    if (cur !== curShot) { curShot = cur; renderShots(); loadShotOpt(); loadActOpt(); }
    draw();
  }
  $("chPlay").addEventListener("click", () => {
    if (!project.cast.length) { st("먼저 캐릭터를 추가하세요.", "err"); return; }
    fit(); playing = true; t0 = performance.now() - tNow * 1000;
    if (!raf) loop(performance.now());
    st("▶ 미리보기 중 (전체 장면 반복)", "ok");
  });
  $("chStop").addEventListener("click", () => {
    playing = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    tNow = 0; draw(); st("");
  });

  /* ── 영상 굽기 ──────────────────────────── */
  $("chMake").addEventListener("click", async () => {
    if (!project.cast.length) { st("먼저 캐릭터를 추가하세요.", "err"); return; }
    const [W, H] = $("chSize").value.split("x").map(Number);
    const fps = parseInt($("chFps").value) || 30;
    const secs = totalSeconds(project.shots);
    const frames = Math.round(secs * fps);
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const octx = off.getContext("2d");
    const name = project.cast.map(a => a.name).join("_").slice(0, 30) || "캐릭터";
    playing = false;
    $("chMake").disabled = true;
    try {
      bar(0);
      const j = await renderVideo({
        canvas: off, frames, fps, name, audioName: project.audio,
        drawFrame: (i, t) => paintProject(octx, W, H,
          { project, puppets, bg: store.bgImage, t }),
        onProgress: (i, n, eta, note, pct) => {
          bar(note ? (pct || 99) : i / n * 100);
          st(note ? `⚙ ${note}`
                  : `🎞 그리는 중… ${i}/${n} 프레임${eta ? ` · 약 ${fmtMS(eta)} 남음` : ""}`);
        },
      });
      bar(100); setTimeout(() => bar(null), 1200);
      st(`✅ 완성! 히스토리 › 🎬 동영상 탭에 "${j.filename}" 으로 저장됐어요 ` +
         `(${fmtMS(secs)} · ${(j.size / 1048576).toFixed(1)}MB)`, "ok");
    } catch (e) { bar(null); st("⚠ " + e.message, "err"); }
    $("chMake").disabled = false;
  });

  /* ── 시작 ───────────────────────────────── */
  store.addEventListener("characters", fillAddChar);
  store.addEventListener("backgrounds", fillBg);
  await Promise.all([store.refreshCharacters(), store.refreshBackgrounds(), fillMeshes(), fillScenes()]);
  fillAddChar(); fillBg();
  if (store.pendingMeshActor) {
    const f = store.pendingMeshActor; store.pendingMeshActor = null;
    setTimeout(() => addMeshActor(f), 100);
  }
  if (store.selectedBgId) { project.bgId = store.selectedBgId; fillBg(); }
  renderCast(); renderShots(); loadShotOpt(); loadActOpt();
  fit(); draw();
}
