/* ⏸ 지금은 쓰지 않습니다 — 관절(뼈대) 리깅은 나중에 따로 다시 만듭니다.
   그림 한 장에 뼈대를 얹어 팔다리를 굽히는 방식은 그림이 찢어지기 쉬워
   '캐릭터 표정' 탭에서 빠졌습니다. 표정·부위 기능은 face.js / faceedit.js 로 옮겼습니다.
   이 파일은 다시 개발할 때 참고하려고 남겨 둡니다. */
/* 🦴 관절·부위 편집 — 캐릭터 그림 위에서 관절과 눈·입·귀·엉덩이·꼬리 위치를 맞추고 저장한다.

   정면·측면·후면은 보이는 모습이 아예 다르므로 방향마다 뼈대·부위를 따로 들고 있고,
   동작도 방향별로 다르게 움직인다 (rig.js 의 motionAngles/motionParts).
   저장한 뼈대는 영상 만들기에서 팔다리가 실제로 굽는 애니메이션에 쓰인다. */
import { $, api, escapeHtml, statusBox, linkNum, loadImage } from "../core.js";
import { store } from "./store.js";
import { DEFAULT_SKELETON, DEFAULT_PARTS, PART_EFFECTS, RIG_MOTIONS, EXPRESSIONS, TEARS,
         VIEWS, VIEW_KEYS, MIRROR, RiggedSprite, drawFace, drawTears,
         partTracker } from "./rig.js";
import { analyze, classify, vertexRegions } from "./segment.js";

const HANDLE = 9;

/* 부위마다 모양·색·이름을 다르게 그려 한눈에 구분되게 한다 */
const STYLE = {
  head:  { c: "#a3e635", shape: "circle",  label: "머리" },
  body:  { c: "#22d3ee", shape: "circle",  label: "몸통" },
  eyeL:  { c: "#facc15", shape: "circle",  label: "왼눈" },
  eyeR:  { c: "#fb923c", shape: "circle",  label: "오른눈" },
  mouth: { c: "#f472b6", shape: "mouth",   label: "입" },
  earL:  { c: "#38bdf8", shape: "tri",     label: "왼귀" },
  earR:  { c: "#818cf8", shape: "tri",     label: "오른귀" },
  cheekL:{ c: "#fb7185", shape: "diamond", label: "왼볼" },
  cheekR:{ c: "#f59e0b", shape: "diamond", label: "오른볼" },
  hip:   { c: "#c084fc", shape: "square",  label: "엉덩이" },
  tail:  { c: "#34d399", shape: "star",    label: "꼬리" },
};

export async function mount() {
  const st = statusBox($("rgStatus"));
  const canvas = $("rgCanvas"), ctx = canvas.getContext("2d");
  const S = {
    charId: null, view: "front", img: null, rigged: null,
    rigs: {},                       // {front:{skel,parts}, side:{…}, back:{…}}
    motion: "idle", expr: "blink", tear: "none", tearAmp: 1, lag: 0.4, maxMove: 0.11,
    speed: 1, cells: 16, falloff: 2.2,
    playing: false, t0: 0, tNow: 0, raf: null, drag: null, sel: null,
  };
  window.RigEdit = S;                       // 문제 확인용 (콘솔에서 현재 설정을 들여다볼 때)
  const cur = () => S.rigs[S.view] || (S.rigs[S.view] = freshRig(S.view));
  const skel = () => cur().skel;
  const parts = () => cur().parts;
  const freshRig = v => ({ skel: DEFAULT_SKELETON(v), parts: DEFAULT_PARTS(v), auto: true });

  $("rgMotion").innerHTML = Object.entries(RIG_MOTIONS)
    .map(([k, m]) => `<option value="${k}">${m.ko}</option>`).join("");
  $("rgExpr").innerHTML = Object.entries(EXPRESSIONS)
    .map(([k, e]) => `<option value="${k}" ${k === "blink" ? "selected" : ""}>${e.ko}</option>`).join("");
  $("rgTear").innerHTML = Object.entries(TEARS)
    .map(([k, e]) => `<option value="${k}">${e.ko}</option>`).join("");
  $("rgPose").innerHTML = VIEW_KEYS
    .map(v => `<option value="${v}">${VIEWS[v].emoji} ${VIEWS[v].ko} 그림</option>`).join("");

  /* ── 목록 ── */
  function fillChars() {
    $("rgChar").innerHTML = '<option value="">캐릭터 고르기…</option>' +
      store.characters.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  }
  store.addEventListener("characters", fillChars);
  await store.refreshCharacters();
  fillChars();

  $("rgChar").addEventListener("change", e => e.target.value && loadChar(e.target.value));
  $("rgPose").addEventListener("change", () => switchView($("rgPose").value));

  /** 캐릭터를 고르면 세 방향 설정을 한꺼번에 읽어 둔다 */
  async function loadChar(id) {
    S.charId = id;
    S.rigs = {};
    st("그림과 저장해 둔 설정을 불러오는 중…");
    try {
      const d = await api(`/api/char/rig?id=${encodeURIComponent(id)}`);
      const r = d.rig || null;
      if (r && r.views) {                       // 새 형식 (방향별)
        VIEW_KEYS.forEach(v => {
          if (r.views[v] && r.views[v].skel)
            S.rigs[v] = { skel: r.views[v].skel,
                          parts: withDefaults(r.views[v].parts, v) };
        });
      } else if (r && r.skel) {                 // 예전 형식 (정면 하나만 저장돼 있던 것)
        S.rigs.front = { skel: r.skel, parts: withDefaults(r.face || r.parts, "front") };
      }
      if (r) {
        if (r.cells) setNum("rgCells", r.cells);
        if (r.falloff) setNum("rgFall", Math.round(r.falloff * 10));
        if (r.motion && RIG_MOTIONS[r.motion]) { S.motion = r.motion; $("rgMotion").value = r.motion; }
        if (r.expr && EXPRESSIONS[r.expr]) { S.expr = r.expr; $("rgExpr").value = r.expr; }
        if (r.tear && TEARS[r.tear]) { S.tear = r.tear; $("rgTear").value = r.tear; }
        if (r.tearAmp) setNum("rgTearAmp", Math.round(r.tearAmp * 100));
        if (r.lag != null) setNum("rgLag", Math.round(r.lag * 100));
        if (r.maxMove) setNum("rgMove", Math.round(r.maxMove * 100));
      }
      await switchView(S.view, true);
    } catch (e) { st("⚠ " + e.message, "err"); }
  }
  /** 저장본에 없는 부위(엉덩이·꼬리처럼 나중에 생긴 것)를 기본값으로 채운다 */
  function withDefaults(saved, view) {
    const base = DEFAULT_PARTS(view);
    if (!saved) return base;
    Object.entries(saved).forEach(([k, p]) => {
      if (p && typeof p === "object") base[k] = { ...(base[k] || {}), ...p };
    });
    return base;
  }

  /** 방향 바꾸기 — 그 방향 그림을 불러오고, 설정이 없으면 자동 배치한다 */
  async function switchView(view, quiet) {
    S.view = view;
    $("rgPose").value = view;
    S.sel = null; $("rgPick").textContent = "";
    if (!S.charId) return;
    try {
      S.img = await loadImage(`/api/char/sprite?id=${S.charId}&role=${view}`);
      // 이 그림에서 팔·다리·귀·꼬리 덩어리를 미리 찾아 둔다
      S.seg = analyze(S.img);
      S.groups = classify(S.seg, view);
    } catch {
      S.img = null; S.seg = null; S.groups = null;
      renderLists(); draw();
      st(`이 캐릭터에는 '${VIEWS[view].ko}' 그림이 없어요. [캐릭터 관리 → ➕ 포즈 추가]에서 넣어 주세요.`, "err");
      return;
    }
    const isNew = !S.rigs[view];
    if (isNew) {
      S.rigs[view] = freshRig(view);
      autoPlace();
      sampleCoverColors();
    }
    rebuild(); renderLists(); draw(); updateInfo();
    if (!quiet || isNew)
      st(isNew ? `'${VIEWS[view].ko}' 은(는) 처음이라 자동으로 배치했어요 (${found()}). 위치를 다듬고 [💾 저장]`
               : `'${VIEWS[view].ko}' 설정을 불러왔어요.`, "ok");
  }
  /** 그림에서 무엇을 찾아냈는지 한 줄로 */
  function found() {
    const g = S.groups;
    if (!g) return "자동 인식 없음";
    const n = [["귀", (g.ear || []).length], ["앞발", (g.arm || []).length],
               ["뒷발", (g.leg || []).length], ["꼬리", g.tail ? 1 : 0]]
      .filter(([, c]) => c).map(([k, c]) => `${k} ${c}`);
    return n.length ? "찾은 부위: " + n.join(" · ") : "삐져나온 부위를 못 찾음";
  }
  function updateInfo() {
    const done = VIEW_KEYS.filter(v => S.rigs[v]).map(v => VIEWS[v].ko);
    $("rgInfo").textContent = done.length ? `설정된 방향: ${done.join(" · ")}` : "";
  }
  const setNum = (id, v) => { const el = $(id); el.value = v; el.dispatchEvent(new Event("input")); };

  function rebuild() {
    if (!S.img) { S.rigged = null; return; }
    S.rigged = new RiggedSprite(S.img, skel(), S.cells,
                                { view: S.view, parts: parts(), falloff: S.falloff,
                                  lag: S.lag, maxMove: S.maxMove });
    // 팔·다리·귀 덩어리를 찾아 그 살은 그 뼈만 따라가게 한다 (몸통이 딸려 늘어나지 않게)
    if (S.groups) S.rigged.rebuild(0, S.falloff, vertexRegions(S.rigged.mesh.verts, S.groups));
    S.rigged.motion = S.motion;
    S.rigged.speed = S.speed;
  }

  /* ── 그림 비율로 관절 자동 배치 (방향에 따라 다르게) ── */
  function autoPlace() {
    if (!S.img) return;
    // 불투명 영역의 가로 폭을 세로 구간별로 재서 머리/몸/다리 위치를 추정한다
    const c = document.createElement("canvas");
    const N = 96; c.width = N; c.height = N;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(S.img, 0, 0, N, N);
    const a = x.getImageData(0, 0, N, N).data;
    const rows = [];
    for (let j = 0; j < N; j++) {
      let lo = N, hi = -1, cnt = 0;
      for (let i = 0; i < N; i++) {
        if (a[(j * N + i) * 4 + 3] > 30) { if (i < lo) lo = i; if (i > hi) hi = i; cnt++; }
      }
      rows.push({ lo: lo / N, hi: hi / N, w: cnt / N, mid: cnt ? (lo + hi) / 2 / N : 0.5 });
    }
    const body = rows.filter(r => r.w > 0.02);
    if (!body.length) return;
    const top = rows.findIndex(r => r.w > 0.02) / N;
    const bot = (N - 1 - [...rows].reverse().findIndex(r => r.w > 0.02)) / N;
    const H = Math.max(0.05, bot - top);
    const at = f => rows[Math.min(N - 1, Math.round((top + H * f) * N))] || rows[0];
    const lerp = (r, f) => r.lo + (r.hi - r.lo) * f;

    const K = skel();
    const put = (id, fx, fy) => {
      const b = K.bones.find(v => v.id === id);
      if (b) { b.x = fx; b.y = top + H * fy; }
    };
    // 캐릭터 그림은 대개 머리가 크므로 위 30%를 머리로 본다
    put("head", at(0.12).mid, 0.12);
    put("neck", at(0.30).mid, 0.30);
    put("chest", at(0.45).mid, 0.45);
    put("hip", at(0.62).mid, 0.62);
    const shoulder = at(0.45), hips = at(0.66), feet = at(0.96);

    /* 실루엣에서 찾아낸 팔·다리 덩어리가 있으면 그 자리에 그대로 뼈를 놓는다.
       (거리로만 어림잡으면 배 한가운데가 팔 뼈에 붙어 손을 들 때 몸이 늘어난다) */
    const G = S.groups;
    const putAt = (id, p) => {
      const b = K.bones.find(v => v.id === id);
      if (b && p) { b.x = p.x; b.y = p.y; }
    };
    const useBlobs = (blobs, joints, tips) => {
      if (!blobs || !blobs.length) return false;
      const one = blobs.length === 1;
      blobs.forEach((blob, i) => {
        const j = one ? joints[1] : joints[i], t = one ? tips[1] : tips[i];
        putAt(j, blob.attach);
        putAt(t, blob.tip);
        if (one) {                       // 한쪽만 보이면 반대쪽 뼈도 같은 자리에 겹쳐 둔다
          putAt(joints[0], blob.attach);
          putAt(tips[0], { x: blob.tip.x, y: blob.tip.y });
        }
      });
      return true;
    };
    const gotArms = G && useBlobs(G.arm, ["armL", "armR"], ["handL", "handR"]);
    const gotLegs = G && useBlobs(G.leg, ["legL", "legR"], ["footL", "footR"]);

    if (S.view === "side" && !(gotArms && gotLegs)) {
      // 옆모습: 앞다리·뒷다리가 앞뒤로 놓인다 (겹쳐 보이는 반대쪽은 살짝 안쪽)
      const headSide = at(0.12).mid > 0.5 ? 1 : -1;           // 머리가 오른쪽이면 +1
      const fwd = f => headSide > 0 ? f : 1 - f;              // 머리 쪽이 '앞'
      if (!gotArms) {
        put("armL", lerp(shoulder, fwd(0.55)), 0.46);
        put("handL", lerp(shoulder, fwd(0.50)), 0.70);
        put("armR", lerp(shoulder, fwd(0.75)), 0.46);
        put("handR", lerp(shoulder, fwd(0.80)), 0.72);
      }
      if (!gotLegs) {
        put("legL", lerp(hips, fwd(0.20)), 0.72);
        put("footL", lerp(feet, fwd(0.16)), 0.98);
        put("legR", lerp(hips, fwd(0.34)), 0.74);
        put("footR", lerp(feet, fwd(0.30)), 0.98);
      }
    } else if (S.view !== "side" && !(gotArms && gotLegs)) {
      const m = S.view === "back" ? f => 1 - f : f => f;      // 뒷모습은 좌우 반대
      put("armL", lerp(shoulder, m(0.15)), 0.45);
      put("handL", lerp(shoulder, m(0.02)), 0.66);
      put("armR", lerp(shoulder, m(0.85)), 0.45);
      put("handR", lerp(shoulder, m(0.98)), 0.66);
      put("legL", lerp(hips, m(0.30)), 0.78);
      put("footL", lerp(feet, m(0.28)), 0.99);
      put("legR", lerp(hips, m(0.70)), 0.78);
      put("footR", lerp(feet, m(0.72)), 0.99);
    }

    /* 부위: 머리 영역 안에 눈·입·귀를, 몸 아래쪽에 엉덩이·꼬리를 놓는다 */
    const P = parts();
    const headRow = at(0.16), hipRow = at(0.70);
    const set = (k, fx, fy, r) => {
      const p = P[k]; if (!p) return;
      p.x = fx; p.y = top + H * fy; if (r) p.r = r;
    };
    set("head", headRow.mid, 0.14, Math.max(0.08, (headRow.hi - headRow.lo) * 0.55));
    set("body", at(0.50).mid, 0.50, Math.max(0.08, (at(0.5).hi - at(0.5).lo) * 0.5));

    if (S.view === "side") {
      const headSide = headRow.mid > 0.5 ? 1 : -1;
      const snout = headSide > 0 ? 0.88 : 0.12;              // 주둥이는 머리 바깥쪽 끝
      set("eyeR", lerp(headRow, headSide > 0 ? 0.62 : 0.38), 0.16, 0.05);
      set("earR", lerp(headRow, headSide > 0 ? 0.28 : 0.72), 0.07, 0.07);
      set("cheekR", lerp(headRow, headSide > 0 ? 0.72 : 0.28), 0.22, 0.045);
      set("mouth", lerp(headRow, snout), 0.24, 0.05);
      set("hip", lerp(hipRow, headSide > 0 ? 0.18 : 0.82), 0.66, 0.10);
      set("tail", headSide > 0 ? Math.max(0.02, hipRow.lo - 0.03) : Math.min(0.98, hipRow.hi + 0.03),
          0.58, 0.085);
      ["eyeL", "earL", "cheekL"].forEach(k => { if (P[k]) P[k].on = false; });
      if (P.eyeR) P.eyeR.on = true;
      if (P.earR) P.earR.on = true;
      if (P.tail) P.tail.on = true;
    } else {
      const m = S.view === "back" ? f => 1 - f : f => f;
      set("eyeL", lerp(headRow, m(0.32)), 0.16, 0.05);
      set("eyeR", lerp(headRow, m(0.68)), 0.16, 0.05);
      set("mouth", headRow.mid, 0.24, 0.055);
      set("earL", lerp(headRow, m(0.05)), 0.07, 0.07);
      set("earR", lerp(headRow, m(0.95)), 0.07, 0.07);
      set("cheekL", lerp(headRow, m(0.18)), 0.22, 0.045);
      set("cheekR", lerp(headRow, m(0.82)), 0.22, 0.045);
      set("hip", hipRow.mid, 0.70, Math.max(0.07, (hipRow.hi - hipRow.lo) * 0.45));
      if (S.view === "back") {
        set("tail", hipRow.mid, 0.62, 0.085);
        ["eyeL", "eyeR", "mouth", "cheekL", "cheekR"].forEach(k => { if (P[k]) P[k].on = false; });
        if (P.tail) P.tail.on = true;
      } else {
        set("tail", at(0.88).mid, 0.88, 0.06);
      }
    }

    /* 찾아낸 귀·꼬리 덩어리가 있으면 부위를 그 자리로 정확히 옮긴다 */
    if (G) {
      const fit = (blob, key) => {
        const p = P[key]; if (!blob || !p) return;
        p.x = (blob.attach.x + blob.tip.x) / 2;
        p.y = (blob.attach.y + blob.tip.y) / 2;
        p.r = Math.max(0.03, blob.len * 0.7);
        p.ax = blob.attach.x;                  // 몸에 붙은 뿌리 — 여기를 축으로 흔들린다
        p.ay = blob.attach.y;
        p.on = true;
      };
      if (G.ear && G.ear.length === 2) { fit(G.ear[0], "earL"); fit(G.ear[1], "earR"); }
      else if (G.ear && G.ear.length === 1) fit(G.ear[0], S.view === "side" ? "earR" : "earL");
      fit(G.tail, "tail");
    }
  }

  /* 눈·입을 덮을 '주변 살색'을 그림에서 직접 뽑는다 */
  function sampleCoverColors() {
    if (!S.img) return;
    const N = 256;
    const c = document.createElement("canvas");
    c.width = N; c.height = N;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(S.img, 0, 0, N, N);
    const d = x.getImageData(0, 0, N, N).data;
    const P = parts();
    ["eyeL", "eyeR", "mouth"].forEach(k => {
      const p = P[k];
      if (!p) return;
      const cx = p.x * N, cy = p.y * N, r0 = p.r * N * 1.5, r1 = p.r * N * 2.6;
      let br = 0, bg = 0, bb = 0, n = 0;
      for (let a = 0; a < Math.PI * 2; a += 0.15) {
        for (let rr = r0; rr <= r1; rr += 1.5) {
          const px = Math.round(cx + Math.cos(a) * rr), py = Math.round(cy + Math.sin(a) * rr);
          if (px < 0 || py < 0 || px >= N || py >= N) continue;
          const i = (py * N + px) * 4;
          if (d[i + 3] < 200) continue;
          const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
          if (lum < 90) continue;                    // 선·눈동자 같은 어두운 색은 뺀다
          br += d[i]; bg += d[i + 1]; bb += d[i + 2]; n++;
        }
      }
      if (n > 8) {
        const hex = v => Math.round(v / n).toString(16).padStart(2, "0");
        p.coverColor = "#" + hex(br) + hex(bg) + hex(bb);
      }
    });
  }

  $("rgAuto").addEventListener("click", () => {
    if (!S.img) { st("먼저 캐릭터를 고르세요.", "err"); return; }
    autoPlace(); sampleCoverColors(); rebuild(); renderLists(); draw();
    st(`'${VIEWS[S.view].ko}' 기준으로 관절·부위를 자동 배치했어요 — ${found()}.`);
  });
  $("rgReset").addEventListener("click", () => {
    S.rigs[S.view] = freshRig(S.view);
    rebuild(); renderLists(); draw(); st(`'${VIEWS[S.view].ko}' 을(를) 기본 배치로 되돌렸어요.`);
  });
  /* 지금 방향 설정을 다른 방향에 복사 (후면은 좌우를 뒤집어 준다) */
  $("rgCopy").addEventListener("click", () => {
    const from = S.view;
    VIEW_KEYS.filter(v => v !== from).forEach(v => {
      const flip = (from === "back") !== (v === "back");     // 앞↔뒤 사이면 좌우 반전
      const K = { bones: skel().bones.map(b => ({ ...b, x: flip ? 1 - b.x : b.x })), view: v };
      const P = {};
      Object.entries(parts()).forEach(([k, p]) => {
        const key = flip ? (MIRROR[k] || k) : k;
        P[key] = { ...p, x: flip ? 1 - p.x : p.x };
      });
      S.rigs[v] = { skel: K, parts: P };
    });
    updateInfo();
    st("지금 방향의 관절·부위를 다른 두 방향에도 복사했어요 (뒤쪽은 좌우를 뒤집었습니다).", "ok");
  });

  /* ── 조절판 ── */
  linkNum($("rgSpeedR"), $("rgSpeed"), $("rgSpeedHint"), v => (v / 100).toFixed(1) + "×",
          v => { S.speed = v / 100; if (S.rigged) S.rigged.speed = S.speed; });
  linkNum($("rgCellsR"), $("rgCells"), $("rgCellsHint"), v => v,
          v => { S.cells = v; if (S.rigged) { S.rigged.rebuild(S.cells, S.falloff); draw(); } });
  linkNum($("rgFallR"), $("rgFall"), $("rgFallHint"), v => (v / 10).toFixed(1),
          v => { S.falloff = v / 10; if (S.rigged) { S.rigged.rebuild(0, S.falloff); draw(); } });
  $("rgMotion").addEventListener("change", e => {
    S.motion = e.target.value;
    if (S.rigged) S.rigged.motion = S.motion;
    draw();
    st(`'${RIG_MOTIONS[S.motion].ko}' — ${VIEWS[S.view].ko}에서는 이렇게 움직입니다.`);
  });
  $("rgExpr").addEventListener("change", e => { S.expr = e.target.value; draw(); });
  $("rgTear").addEventListener("change", e => {
    S.tear = e.target.value; draw();
    st(S.tear === "none" ? "눈물을 껐어요."
       : `💧 ${TEARS[S.tear].ko} — ▶ 미리보기를 누르면 흘러내립니다.`);
  });
  linkNum($("rgTearAmpR"), $("rgTearAmp"), $("rgTearAmpHint"), v => v + "%",
          v => { S.tearAmp = v / 100; draw(); });
  linkNum($("rgLagR"), $("rgLag"), $("rgLagHint"), v => v + "%",
          v => { S.lag = v / 100; if (S.rigged) S.rigged.lag = S.lag; draw(); });
  linkNum($("rgMoveR"), $("rgMove"), $("rgMoveHint"), v => v + "%",
          v => { S.maxMove = v / 100; if (S.rigged) S.rigged.maxMove = S.maxMove; draw(); });
  $("rgShowBones").addEventListener("change", draw);
  $("rgShowMesh").addEventListener("change", draw);

  /* ── 목록: 부위를 고른 뒤 그림을 클릭하면 그 자리로 옮겨진다 ── */
  function selectPart(kind, key, ko) {
    S.sel = { kind, key };
    $("rgPick").textContent = `📍 지금 지정할 부위: ${ko} — 그림에서 원하는 지점을 클릭하세요`;
    renderLists(); draw();
  }
  const FX_OPTIONS = Object.entries(PART_EFFECTS)
    .map(([k, e]) => `<option value="${k}">${e.ko}</option>`).join("");

  function renderLists() {
    const f = $("rgFaceList");
    f.innerHTML = "";
    if (!S.charId) { f.innerHTML = '<div class="hint">캐릭터를 먼저 고르세요.</div>'; }
    Object.entries(S.charId ? parts() : {}).forEach(([k, p]) => {
      const on = S.sel && S.sel.kind === "part" && S.sel.key === k;
      const stl = STYLE[k] || { c: "#facc15", label: k };
      const d = document.createElement("div");
      d.className = "vitem" + (on ? " sel" : "");
      d.style.flexWrap = "wrap";
      d.innerHTML = `<span class="vname" style="color:${stl.c}">● ${escapeHtml(p.ko || k)}</span>
        <span class="vinfo">가로 ${Math.round(p.x * 100)}% · 세로 ${Math.round(p.y * 100)}% · 크기 ${(p.r * 100).toFixed(1)}</span>
        <span class="vactions">
          <button class="ghost small" data-a="pick">${on ? "클릭해서 지정 중…" : "📍 위치 지정"}</button>
          <button class="ghost small" data-a="minus" title="이 부위만 작게">－</button>
          <button class="ghost small" data-a="plus" title="이 부위만 크게">＋</button>
          <button class="ghost small" data-a="on">${p.on === false ? "숨김" : "보임"}</button>
          ${PART_EFFECTS[p.fx || "none"] && PART_EFFECTS[p.fx || "none"].wave
            ? `<button class="ghost small" data-a="root" title="흔들릴 때 축이 되는 '몸에 붙은 자리'">⚓ 뿌리 지정</button>` : ""}
          ${["eyeL", "eyeR", "mouth"].includes(k)
            ? `<button class="ghost small" data-a="cover" title="표정을 그릴 때 원래 그림을 가릴지">${p.cover === false ? "원본 유지" : "원본 가림"}</button>
               <input type="color" data-a="color" value="${p.coverColor || "#f6d5a5"}"
                      title="가릴 색" style="width:30px;height:24px;padding:0">` : ""}
        </span>
        <span class="vactions" style="flex-basis:100%; justify-content:flex-start; gap:6px">
          <span class="hint" style="min-width:56px">움직임</span>
          <select data-a="fx" style="width:auto; min-width:130px">${FX_OPTIONS}</select>
          <span class="hint">세기</span>
          <input type="range" data-a="amp" min="0" max="250" step="10" value="${Math.round((p.amp ?? 1) * 100)}"
                 style="width:110px">
          <span class="hint" data-a="ampv">${Math.round((p.amp ?? 1) * 100)}%</span>
        </span>`;
      d.querySelector('[data-a="pick"]').addEventListener("click", () => selectPart("part", k, p.ko || k));
      d.querySelector('[data-a="plus"]').addEventListener("click", () => { p.r = Math.min(0.4, p.r * 1.15); renderLists(); draw(); });
      d.querySelector('[data-a="minus"]').addEventListener("click", () => { p.r = Math.max(0.008, p.r / 1.15); renderLists(); draw(); });
      d.querySelector('[data-a="on"]').addEventListener("click", () => { p.on = p.on === false; renderLists(); draw(); });
      const rootBtn = d.querySelector('[data-a="root"]');
      if (rootBtn) rootBtn.addEventListener("click", () => selectPart("root", k, (p.ko || k) + " 뿌리"));
      const fx = d.querySelector('[data-a="fx"]');
      fx.value = p.fx || "none";
      fx.addEventListener("change", e => {
        p.fx = e.target.value;
        // 흔들 축(뿌리)이 아직 없으면 몸 안쪽으로 한 칸 들어간 자리를 뿌리로 삼는다
        if (PART_EFFECTS[p.fx] && PART_EFFECTS[p.fx].wave && p.ax == null) {
          const len = Math.hypot(0.5 - p.x, 0.5 - p.y) || 1;
          p.ax = p.x + (0.5 - p.x) / len * p.r * 1.1;
          p.ay = p.y + (0.5 - p.y) / len * p.r * 1.1;
        }
        renderLists(); draw();
        st(p.fx === "none" ? `${p.ko}: 동작이 정한 대로 움직입니다.`
                           : `${p.ko} 부위만 '${PART_EFFECTS[p.fx].ko}' — ▶ 미리보기로 확인하세요.`);
      });
      const amp = d.querySelector('[data-a="amp"]');
      amp.addEventListener("input", e => {
        p.amp = e.target.value / 100;
        d.querySelector('[data-a="ampv"]').textContent = e.target.value + "%";
        draw();
      });
      const cov = d.querySelector('[data-a="cover"]');
      if (cov) cov.addEventListener("click", () => { p.cover = p.cover === false; renderLists(); draw(); });
      const col = d.querySelector('[data-a="color"]');
      if (col) col.addEventListener("input", e => { p.coverColor = e.target.value; draw(); });
      f.appendChild(d);
    });

    const b = $("rgBoneList");
    b.innerHTML = "";
    if (!S.charId) return;
    skel().bones.forEach(v => {
      const on = S.sel && S.sel.kind === "bone" && S.sel.key === v.id;
      const d = document.createElement("div");
      d.className = "vitem" + (on ? " sel" : "");
      d.innerHTML = `<span class="vname">🟢 ${escapeHtml(v.ko)}</span>
        <span class="vinfo">가로 ${Math.round(v.x * 100)}% · 세로 ${Math.round(v.y * 100)}%</span>
        <span class="vactions"><button class="ghost small" data-a="pick">${on ? "클릭해서 지정 중…" : "📍 위치 지정"}</button></span>`;
      d.querySelector('[data-a="pick"]').addEventListener("click", () => selectPart("bone", v.id, v.ko));
      b.appendChild(d);
    });
  }

  /* ── 그리기 ── */
  function box() {
    const w = canvas.width, h = canvas.height;
    if (!S.img) return { x: 0, y: 0, w, h };
    const s = Math.min(w / S.img.width, h / S.img.height) * 0.92;
    const dw = S.img.width * s, dh = S.img.height * s;
    return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
  }
  function fit() {
    const r = $("rgStage").getBoundingClientRect();
    canvas.width = Math.max(200, Math.round(r.width));
    canvas.height = Math.max(200, Math.round(r.height));
  }
  function draw() {
    if (!canvas.width) fit();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!S.img) return;
    const B = box();
    const t = S.playing ? S.tNow : 0;
    let track = null;
    if (S.rigged && S.rigged.weights) {
      S.rigged.motion = S.motion; S.rigged.speed = S.speed; S.rigged.parts = parts();
      const dst = S.rigged.draw(ctx, B, t);
      track = partTracker(S.rigged.mesh, dst);       // 표정·표식이 움직인 몸을 따라가게
      if ($("rgShowMesh").checked) {
        ctx.save(); ctx.strokeStyle = "rgba(128,82,255,0.35)"; ctx.lineWidth = 1;
        for (const [a, b2, c] of S.rigged.mesh.tris) {
          ctx.beginPath();
          ctx.moveTo(B.x + dst[a].u * B.w, B.y + dst[a].v * B.h);
          ctx.lineTo(B.x + dst[b2].u * B.w, B.y + dst[b2].v * B.h);
          ctx.lineTo(B.x + dst[c].u * B.w, B.y + dst[c].v * B.h);
          ctx.closePath(); ctx.stroke();
        }
        ctx.restore();
      }
    } else {
      ctx.drawImage(S.img, B.x, B.y, B.w, B.h);
    }
    drawFace(ctx, B, parts(), S.expr, S.playing ? S.tNow : 0.6, track);
    drawTears(ctx, B, parts(), S.tear, S.playing ? S.tNow : 0.5, S.tearAmp, track);

    if ($("rgShowBones").checked) drawHandles(B, track);
  }

  function drawHandles(B, track) {
    const K = skel();
    const byId = Object.fromEntries(K.bones.map(b => [b.id, b]));
    ctx.save();
    ctx.strokeStyle = "rgba(80,220,140,0.8)"; ctx.lineWidth = 2.5;
    K.bones.forEach(b => {
      if (!b.parent) return;
      const p = byId[b.parent];
      ctx.beginPath();
      ctx.moveTo(B.x + p.x * B.w, B.y + p.y * B.h);
      ctx.lineTo(B.x + b.x * B.w, B.y + b.y * B.h);
      ctx.stroke();
    });
    K.bones.forEach(b => {
      const cx = B.x + b.x * B.w, cy = B.y + b.y * B.h;
      const picked = S.sel && S.sel.kind === "bone" && S.sel.key === b.id;
      ctx.fillStyle = "#4ade80";
      ctx.beginPath(); ctx.arc(cx, cy, HANDLE, 0, 7); ctx.fill();
      ctx.strokeStyle = "#0d3a22"; ctx.lineWidth = 2; ctx.stroke();
      if (picked) {
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, HANDLE + 5, 0, 7); ctx.stroke();
        label(b.ko, cx, cy - HANDLE - 6);
      }
    });
    Object.entries(parts()).forEach(([k, p]) => {
      const stl = STYLE[k] || { c: "#facc15", shape: "circle", label: k };
      const cx = B.x + p.x * B.w, cy = B.y + p.y * B.h;
      const rr = p.r * Math.min(B.w, B.h);
      const picked = S.sel && S.sel.kind === "part" && S.sel.key === k;
      ctx.globalAlpha = p.on === false ? 0.28 : 1;

      // 실제 크기를 옅은 원으로 보여준다 (＋/－ 로 이 크기를 바꾼다)
      ctx.fillStyle = stl.c + "26"; ctx.strokeStyle = stl.c + "aa"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(4, rr), 0, 7); ctx.fill(); ctx.stroke();
      // 움직임이 걸린 부위는 실제로 움직이는 범위를 점선으로
      if (p.fx && p.fx !== "none") {
        ctx.setLineDash([4, 4]); ctx.strokeStyle = stl.c + "66";
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(6, rr * 2.4), 0, 7); ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.fillStyle = stl.c; ctx.strokeStyle = "#1a1508"; ctx.lineWidth = 2;
      const h = HANDLE;
      ctx.beginPath();
      if (stl.shape === "tri") {
        ctx.moveTo(cx, cy - h); ctx.lineTo(cx + h, cy + h * 0.8); ctx.lineTo(cx - h, cy + h * 0.8);
        ctx.closePath();
      } else if (stl.shape === "diamond") {
        ctx.moveTo(cx, cy - h); ctx.lineTo(cx + h, cy); ctx.lineTo(cx, cy + h); ctx.lineTo(cx - h, cy);
        ctx.closePath();
      } else if (stl.shape === "square") {
        ctx.rect(cx - h * 0.85, cy - h * 0.85, h * 1.7, h * 1.7);
      } else if (stl.shape === "star") {
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 5, r2 = i % 2 ? h * 0.45 : h * 1.1;
          ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        }
        ctx.closePath();
      } else if (stl.shape === "mouth") {
        ctx.roundRect(cx - h * 1.4, cy - h * 0.62, h * 2.8, h * 1.24, h * 0.6);
      } else {
        ctx.arc(cx, cy, h - 1, 0, 7);
      }
      ctx.fill(); ctx.stroke();
      if (picked) {
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, h + 5, 0, 7); ctx.stroke();
      }
      label(stl.label + (p.fx && p.fx !== "none" ? " ✨" : ""), cx, cy - h - 6);
      // 흔들리는 부위는 축이 되는 뿌리를 ◇ 로 보여 준다
      if (p.ax != null && (PART_EFFECTS[p.fx || "none"] || {}).wave) {
        const rx = B.x + p.ax * B.w, ry = B.y + p.ay * B.h;
        ctx.strokeStyle = stl.c + "cc"; ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(cx, cy); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#0f0d14"; ctx.strokeStyle = stl.c; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rx, ry - 6); ctx.lineTo(rx + 6, ry); ctx.lineTo(rx, ry + 6); ctx.lineTo(rx - 6, ry);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        if (S.sel && S.sel.kind === "root" && S.sel.key === k) {
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(rx, ry, 10, 0, 7); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }
  function label(text, x, y) {
    ctx.font = "700 11px system-ui"; ctx.textAlign = "center";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = "#fff"; ctx.fillText(text, x, y);
  }
  addEventListener("resize", () => { fit(); draw(); });

  /* ── 끌어서 맞추기 ── */
  /** 겹쳐 있어도 '가장 가까운' 손잡이를 잡는다 (관절이 부위 표식에 가려지지 않게) */
  function hitTest(mx, my) {
    if (!S.charId) return null;
    const B = box();
    let best = null, bestD = HANDLE + 6;
    for (const b of skel().bones) {
      const d = Math.hypot(B.x + b.x * B.w - mx, B.y + b.y * B.h - my);
      if (d < bestD) { bestD = d; best = { kind: "bone", key: b.id, ko: b.ko }; }
    }
    for (const [k, p] of Object.entries(parts())) {
      const d = Math.hypot(B.x + p.x * B.w - mx, B.y + p.y * B.h - my);
      if (d < bestD) { bestD = d; best = { kind: "part", key: k, ko: p.ko || k }; }
      if (p.ax == null || !(PART_EFFECTS[p.fx || "none"] || {}).wave) continue;
      const dr = Math.hypot(B.x + p.ax * B.w - mx, B.y + p.ay * B.h - my);
      if (dr < bestD) { bestD = dr; best = { kind: "root", key: k, ko: (p.ko || k) + " 뿌리" }; }
    }
    return best;
  }
  /** 끌어 옮길 대상 — 뿌리(root)는 부위의 ax/ay 를 x/y 처럼 다룬다 */
  const target = ref => {
    if (ref.kind === "bone") return skel().bones.find(b => b.id === ref.key);
    const p = parts()[ref.key];
    if (!p) return null;
    if (ref.kind !== "root") return p;
    return { get x() { return p.ax; }, set x(v) { p.ax = v; },
             get y() { return p.ay; }, set y(v) { p.ay = v; } };
  };
  canvas.addEventListener("pointerdown", e => {
    if (!S.img) return;
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * canvas.width / r.width;
    const my = (e.clientY - r.top) * canvas.height / r.height;
    // 목록에서 '위치 지정'을 눌러 둔 상태면 클릭한 자리로 바로 옮긴다
    if (S.sel) {
      const B = box();
      if (S.sel.kind === "root") {
        const p = parts()[S.sel.key];
        if (p) { p.ax = (mx - B.x) / B.w; p.ay = (my - B.y) / B.h; }
      } else {
        const t = target(S.sel);
        if (t) {
          t.x = (mx - B.x) / B.w;
          t.y = (my - B.y) / B.h;
          if (S.sel.kind === "bone") rebuild();
          else sampleCoverColors();
        }
      }
      S.sel = null;
      $("rgPick").textContent = "";
      renderLists(); draw();
      return;
    }
    S.drag = hitTest(mx, my);
    if (S.drag) {
      canvas.setPointerCapture(e.pointerId);
      st(`✥ ${S.drag.ko} 을(를) 옮기는 중…`);
    }
  });
  canvas.addEventListener("pointermove", e => {
    if (!S.drag) return;
    const r = canvas.getBoundingClientRect();
    const B = box();
    const u = ((e.clientX - r.left) * canvas.width / r.width - B.x) / B.w;
    const v = ((e.clientY - r.top) * canvas.height / r.height - B.y) / B.h;
    const t = target(S.drag);
    if (!t) return;
    t.x = Math.max(-0.2, Math.min(1.2, u));
    t.y = Math.max(-0.2, Math.min(1.2, v));
    draw();
  });
  canvas.addEventListener("pointerup", e => {
    if (S.drag) {
      renderLists();
      if (S.drag.kind === "bone") { rebuild(); st(`✅ ${S.drag.ko} 위치를 옮겼어요 — 움직임에 바로 반영됩니다.`, "ok"); }
      else { sampleCoverColors(); st(`✅ ${S.drag.ko} 위치를 옮겼어요.`, "ok"); }
      draw();
    }
    S.drag = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  });

  /* ── 미리보기 ── */
  function loop(now) {
    S.raf = requestAnimationFrame(loop);
    if (!S.playing) return;
    S.tNow = (now - S.t0) / 1000;
    draw();
  }
  $("rgPlay").addEventListener("click", () => {
    if (!S.rigged) { st("먼저 캐릭터를 고르세요.", "err"); return; }
    S.playing = true; S.t0 = performance.now() - S.tNow * 1000;
    if (!S.raf) loop(performance.now());
    st(`▶ ${VIEWS[S.view].ko} · '${RIG_MOTIONS[S.motion].ko}' 미리보기`, "ok");
  });
  $("rgStop").addEventListener("click", () => {
    S.playing = false; S.tNow = 0;
    if (S.raf) { cancelAnimationFrame(S.raf); S.raf = null; }
    draw(); st("");
  });

  /* ── 저장 (세 방향을 한꺼번에) ── */
  $("rgSave").addEventListener("click", async () => {
    if (!S.charId) { st("먼저 캐릭터를 고르세요.", "err"); return; }
    try {
      const views = {};
      VIEW_KEYS.forEach(v => { if (S.rigs[v]) views[v] = { skel: S.rigs[v].skel, parts: S.rigs[v].parts }; });
      await api("/api/char/rig", { id: S.charId,
        rig: { views, skel: (S.rigs.front || cur()).skel,       // 예전 형식과도 맞춰 둔다
               face: (S.rigs.front || cur()).parts,
               cells: S.cells, falloff: S.falloff, lag: S.lag, maxMove: S.maxMove,
               motion: S.motion, expr: S.expr, tear: S.tear, tearAmp: S.tearAmp } });
      updateInfo();
      const names = VIEW_KEYS.filter(v => S.rigs[v]).map(v => VIEWS[v].ko).join(" · ");
      st(`💾 ${names} 방향의 관절·부위를 저장했어요.`, "ok");
      store.emit("rig-saved");
    } catch (e) { st("⚠ " + e.message, "err"); }
  });

  fit(); draw();
}
