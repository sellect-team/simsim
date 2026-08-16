/* 😊 캐릭터 표정 편집 — 그림 위에서 눈·입·귀·볼·머리·엉덩이·꼬리 자리를 잡고,
   부위마다 움직임을 주고, 표정과 눈물을 얹는다.

   정면·측면·후면은 보이는 모습이 다르므로 방향마다 따로 설정한다.
   뼈대로 팔다리를 굽히지 않으므로 그림이 찢어질 일이 없다. */
import { $, api, escapeHtml, statusBox, linkNum, loadImage } from "../core.js";
import { store } from "./store.js";
import { DEFAULT_PARTS, PART_EFFECTS, EXPRESSIONS, TEARS, BODY_MOVES,
         VIEWS, VIEW_KEYS, MIRROR, FaceSprite } from "./face.js";
import { analyze, classify, rowSpans } from "./segment.js";
import { applyFace } from "./facefind.js";

const HANDLE = 9;

/* 부위마다 모양·색·이름을 다르게 그려 한눈에 구분되게 한다 */
const STYLE = {
  head:  { c: "#a3e635", shape: "circle",  label: "머리" },
  body:  { c: "#22d3ee", shape: "circle",  label: "몸통" },
  eyeL:  { c: "#facc15", shape: "circle",  label: "왼눈" },
  eyeR:  { c: "#fb923c", shape: "circle",  label: "오른눈" },
  nose:  { c: "#f9a8d4", shape: "diamond", label: "코" },
  mouth: { c: "#f472b6", shape: "mouth",   label: "입" },
  earL:  { c: "#38bdf8", shape: "tri",     label: "왼귀" },
  earR:  { c: "#818cf8", shape: "tri",     label: "오른귀" },
  cheekL:{ c: "#fb7185", shape: "diamond", label: "왼볼" },
  cheekR:{ c: "#f59e0b", shape: "diamond", label: "오른볼" },
  hip:   { c: "#c084fc", shape: "square",  label: "엉덩이" },
  tail:  { c: "#34d399", shape: "star",    label: "꼬리" },
};

export async function mount() {
  const st = statusBox($("fcStatus"));
  const canvas = $("fcCanvas"), ctx = canvas.getContext("2d");
  const S = {
    charId: null, view: "front", img: null, sprite: null,
    parts: {},                       // 방향별 부위 {front:{…}, side:{…}, back:{…}}
    move: "breathe", amp: 1, expr: "blink", tear: "none", tearAmp: 1,
    speed: 1, cells: 20,
    playing: false, t0: 0, tNow: 0, raf: null, drag: null, sel: null,
    seg: null, groups: null,
  };
  window.FaceEdit = S;                                 // 확인용
  const P = () => S.parts[S.view] || (S.parts[S.view] = DEFAULT_PARTS(S.view));

  const fill = (id, obj, sel) => {
    $(id).innerHTML = Object.entries(obj)
      .map(([k, e]) => `<option value="${k}"${k === sel ? " selected" : ""}>${e.ko}</option>`).join("");
  };
  fill("fcMove", BODY_MOVES, "breathe");
  fill("fcExpr", EXPRESSIONS, "blink");
  fill("fcTear", TEARS, "none");
  $("fcPose").innerHTML = VIEW_KEYS
    .map(v => `<option value="${v}">${VIEWS[v].emoji} ${VIEWS[v].ko} 그림</option>`).join("");

  /* ── 캐릭터 목록 ── */
  function fillChars() {
    $("fcChar").innerHTML = '<option value="">캐릭터 고르기…</option>' +
      store.characters.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  }
  store.addEventListener("characters", fillChars);
  await store.refreshCharacters();
  fillChars();

  $("fcChar").addEventListener("change", e => e.target.value && loadChar(e.target.value));
  $("fcPose").addEventListener("change", () => switchView($("fcPose").value));

  async function loadChar(id) {
    S.charId = id;
    S.parts = {};
    st("그림과 저장해 둔 설정을 불러오는 중…");
    try {
      const d = await api(`/api/char/rig?id=${encodeURIComponent(id)}`);
      const r = d.rig || null;
      if (r && r.views) {
        VIEW_KEYS.forEach(v => {
          const saved = r.views[v] && (r.views[v].parts || r.views[v].face);
          if (saved) S.parts[v] = withDefaults(saved, v);
        });
      } else if (r && (r.face || r.parts)) {
        S.parts.front = withDefaults(r.face || r.parts, "front");
      }
      if (r) {
        if (r.cells) setNum("fcCells", r.cells);
        if (r.expr && EXPRESSIONS[r.expr]) { S.expr = r.expr; $("fcExpr").value = r.expr; }
        if (r.tear && TEARS[r.tear]) { S.tear = r.tear; $("fcTear").value = r.tear; }
        if (r.move && BODY_MOVES[r.move]) { S.move = r.move; $("fcMove").value = r.move; }
        if (r.tearAmp) setNum("fcTearAmp", Math.round(r.tearAmp * 100));
        if (r.amp) setNum("fcAmp", Math.round(r.amp * 100));
      }
      await switchView(S.view, true);
    } catch (e) { st("⚠ " + e.message, "err"); }
  }
  /** 저장본에 없는 부위(나중에 생긴 것)는 기본값으로 채운다 */
  function withDefaults(saved, view) {
    const base = DEFAULT_PARTS(view);
    Object.entries(saved || {}).forEach(([k, p]) => {
      if (p && typeof p === "object") base[k] = { ...(base[k] || {}), ...p };
    });
    return base;
  }

  async function switchView(view, quiet) {
    S.view = view;
    $("fcPose").value = view;
    S.sel = null; $("fcPick").textContent = "";
    if (!S.charId) return;
    try {
      S.img = await loadImage(`/api/char/sprite?id=${S.charId}&role=${view}`);
      S.seg = analyze(S.img);                    // 귀·꼬리가 어디 붙어 있는지 미리 찾아 둔다
      S.groups = classify(S.seg, view);
    } catch {
      S.img = null; S.seg = null; S.groups = null; S.sprite = null;
      renderList(); draw();
      st(`이 캐릭터에는 '${VIEWS[view].ko}' 그림이 없어요. [캐릭터 관리 → ➕ 포즈 추가]에서 넣어 주세요.`, "err");
      return;
    }
    const isNew = !S.parts[view];
    if (isNew) { S.parts[view] = DEFAULT_PARTS(view); autoPlace(); sampleCoverColors(); }
    rebuild(); renderList(); draw(); updateInfo();
    if (!quiet || isNew)
      st(isNew ? `'${VIEWS[view].ko}' 은(는) 처음이라 자동으로 잡았어요 (${found()}). 다듬고 [💾 저장]`
               : `'${VIEWS[view].ko}' 설정을 불러왔어요.`, "ok");
  }
  function found() {
    const g = S.groups;
    const f = S.얼굴찾기;
    const 얼굴 = f ? (f.적용됨 ? `얼굴 찾음 ${(f.확신 * 100).toFixed(0)}%`
                              : "⚠ 얼굴을 못 찾음 — 눈·입을 직접 찍어 주세요") : "";
    if (!g) return 얼굴 || "자동 인식 없음";
    const n = [["귀", (g.ear || []).length], ["꼬리", g.tail ? 1 : 0]]
      .filter(([, c]) => c).map(([k, c]) => `${k} ${c}`);
    return [얼굴, n.length ? "부위 " + n.join(" · ") : ""].filter(Boolean).join(" · ") || "못 찾음";
  }
  function updateInfo() {
    const done = VIEW_KEYS.filter(v => S.parts[v]).map(v => VIEWS[v].ko);
    $("fcInfo").textContent = done.length ? `설정된 방향: ${done.join(" · ")}` : "";
  }
  const setNum = (id, v) => { const el = $(id); el.value = v; el.dispatchEvent(new Event("input")); };

  function rebuild() {
    if (!S.img) { S.sprite = null; return; }
    S.sprite = new FaceSprite(S.img, P(), S.cells, {
      view: S.view, move: S.move, amp: S.amp, expr: S.expr,
      tear: S.tear, tearAmp: S.tearAmp, speed: S.speed });
  }
  function sync() {
    if (!S.sprite) return;
    Object.assign(S.sprite, { parts: P(), move: S.move, amp: S.amp, expr: S.expr,
                              tear: S.tear, tearAmp: S.tearAmp, speed: S.speed, view: S.view });
  }

  /* ── 그림을 보고 부위를 자동으로 잡는다 ── */
  function autoPlace() {
    if (!S.img) return;
    const N = 96;
    const c = document.createElement("canvas");
    c.width = N; c.height = N;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(S.img, 0, 0, N, N);
    const a = x.getImageData(0, 0, N, N).data;
    const rows = [];
    for (let j = 0; j < N; j++) {
      let lo = N, hi = -1, cnt = 0;
      for (let i = 0; i < N; i++)
        if (a[(j * N + i) * 4 + 3] > 30) { if (i < lo) lo = i; if (i > hi) hi = i; cnt++; }
      rows.push({ lo: lo / N, hi: hi / N, w: cnt / N, mid: cnt ? (lo + hi) / 2 / N : 0.5 });
    }
    if (!rows.some(r => r.w > 0.02)) return;
    const top = rows.findIndex(r => r.w > 0.02) / N;
    const bot = (N - 1 - [...rows].reverse().findIndex(r => r.w > 0.02)) / N;
    const H = Math.max(0.05, bot - top);
    const at = f => rows[Math.min(N - 1, Math.round((top + H * f) * N))] || rows[0];
    const lerp = (r, f) => r.lo + (r.hi - r.lo) * f;

    const p = P();
    const set = (k, fx, fy, r) => {
      const q = p[k]; if (!q) return;
      q.x = fx; q.y = top + H * fy; if (r) q.r = r;
    };
    /* 눈·입은 '귀를 뺀 얼굴 본체' 폭을 기준으로 놓아야 눈이 귀에 얹히지 않는다 */
    const core = S.seg ? rowSpans(S.seg.core, S.seg.N) : null;
    const coreAt = f => {
      if (!core) return null;
      const r = core[Math.min(core.length - 1, Math.round((top + H * f) * core.length))];
      return r && r.w > 0.02 ? r : null;
    };
    const headRow = coreAt(0.16) || at(0.16), hipRow = coreAt(0.70) || at(0.70);
    set("head", headRow.mid, 0.14, Math.max(0.08, (headRow.hi - headRow.lo) * 0.55));
    set("body", at(0.50).mid, 0.50, Math.max(0.08, (at(0.5).hi - at(0.5).lo) * 0.5));

    if (S.view === "side") {
      // 옆모습 — 가까운 쪽 눈·귀·볼만 보이고, 주둥이는 머리 바깥쪽 끝
      const side = headRow.mid > 0.5 ? 1 : -1;
      set("eyeR", lerp(headRow, side > 0 ? 0.62 : 0.38), 0.16, 0.05);
      set("earR", lerp(headRow, side > 0 ? 0.28 : 0.72), 0.07, 0.07);
      set("cheekR", lerp(headRow, side > 0 ? 0.72 : 0.28), 0.22, 0.045);
      set("mouth", lerp(headRow, side > 0 ? 0.88 : 0.12), 0.24, 0.05);
      set("hip", lerp(hipRow, side > 0 ? 0.18 : 0.82), 0.66, 0.10);
      ["eyeL", "earL", "cheekL"].forEach(k => { if (p[k]) p[k].on = false; });
      if (p.eyeR) p.eyeR.on = true;
      if (p.earR) p.earR.on = true;
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
      if (S.view === "back")
        ["eyeL", "eyeR", "mouth", "cheekL", "cheekR"].forEach(k => { if (p[k]) p[k].on = false; });
    }

    /* 눈·입은 '짐작' 대신 그림에서 실제로 찾아 맞춘다 (위에서 비율로 놓은 값을 덮어쓴다).
       못 찾으면 손대지 않고, 사람이 직접 찍도록 알린다. */
    S.얼굴찾기 = applyFace(p, S.img, S.view);

    /* 실루엣에서 찾아낸 귀·꼬리는 그 자리에 정확히 맞춘다 (흔들 뿌리까지) */
    const g = S.groups;
    if (g) {
      const fit = (blob, key) => {
        const q = p[key]; if (!blob || !q) return;
        q.x = (blob.attach.x + blob.tip.x) / 2;
        q.y = (blob.attach.y + blob.tip.y) / 2;
        q.r = Math.max(0.03, blob.len * 0.7);
        q.ax = blob.attach.x; q.ay = blob.attach.y;
        q.on = true;
      };
      if (g.ear && g.ear.length === 2) { fit(g.ear[0], "earL"); fit(g.ear[1], "earR"); }
      else if (g.ear && g.ear.length === 1) fit(g.ear[0], S.view === "side" ? "earR" : "earL");
      if (g.tail) fit(g.tail, "tail");
      else if (p.tail) p.tail.on = S.view !== "front";
    }
  }

  /** 눈·입을 덮을 '주변 살색'을 그림에서 직접 뽑는다 (표정을 갈아끼울 때 씀) */
  function sampleCoverColors() {
    if (!S.img) return;
    const N = 256;
    const c = document.createElement("canvas");
    c.width = N; c.height = N;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(S.img, 0, 0, N, N);
    const d = x.getImageData(0, 0, N, N).data;
    const p = P();
    ["eyeL", "eyeR", "mouth"].forEach(k => {
      const q = p[k];
      if (!q) return;
      const cx = q.x * N, cy = q.y * N, r0 = q.r * N * 1.5, r1 = q.r * N * 2.6;
      let br = 0, bg = 0, bb = 0, n = 0;
      for (let a = 0; a < Math.PI * 2; a += 0.15)
        for (let rr = r0; rr <= r1; rr += 1.5) {
          const px = Math.round(cx + Math.cos(a) * rr), py = Math.round(cy + Math.sin(a) * rr);
          if (px < 0 || py < 0 || px >= N || py >= N) continue;
          const i = (py * N + px) * 4;
          if (d[i + 3] < 200) continue;
          if ((d[i] + d[i + 1] + d[i + 2]) / 3 < 90) continue;   // 선·눈동자 같은 어두운 색 제외
          br += d[i]; bg += d[i + 1]; bb += d[i + 2]; n++;
        }
      if (n > 8) {
        const hex = v => Math.round(v / n).toString(16).padStart(2, "0");
        q.coverColor = "#" + hex(br) + hex(bg) + hex(bb);
      }
    });
  }

  /* ── 버튼 ── */
  $("fcAuto").addEventListener("click", () => {
    if (!S.img) { st("먼저 캐릭터를 고르세요.", "err"); return; }
    autoPlace(); sampleCoverColors(); rebuild(); renderList(); draw();
    st(`'${VIEWS[S.view].ko}' 기준으로 부위를 자동으로 잡았어요 — ${found()}.`);
  });
  $("fcReset").addEventListener("click", () => {
    S.parts[S.view] = DEFAULT_PARTS(S.view);
    rebuild(); renderList(); draw(); st(`'${VIEWS[S.view].ko}' 을(를) 기본으로 되돌렸어요.`);
  });
  $("fcCopy").addEventListener("click", () => {
    const from = S.view;
    VIEW_KEYS.filter(v => v !== from).forEach(v => {
      const flip = (from === "back") !== (v === "back");
      const out = {};
      Object.entries(P()).forEach(([k, q]) => {
        const key = flip ? (MIRROR[k] || k) : k;
        out[key] = { ...q, x: flip ? 1 - q.x : q.x };
        if (q.ax != null) out[key].ax = flip ? 1 - q.ax : q.ax;
      });
      S.parts[v] = out;
    });
    updateInfo();
    st("지금 방향의 부위를 다른 두 방향에도 복사했어요 (뒤쪽은 좌우를 뒤집었습니다).", "ok");
  });

  /* ── 조절판 ── */
  $("fcMove").addEventListener("change", e => {
    S.move = e.target.value; sync(); draw();
    st(`'${BODY_MOVES[S.move].ko}' — ▶ 미리보기로 확인하세요.`);
  });
  $("fcExpr").addEventListener("change", e => { S.expr = e.target.value; sync(); draw(); });
  $("fcTear").addEventListener("change", e => {
    S.tear = e.target.value; sync(); draw();
    st(S.tear === "none" ? "눈물을 껐어요." : `💧 ${TEARS[S.tear].ko} — ▶ 미리보기를 누르면 흘러내립니다.`);
  });
  linkNum($("fcAmpR"), $("fcAmp"), $("fcAmpHint"), v => v + "%",
          v => { S.amp = v / 100; sync(); draw(); });
  linkNum($("fcTearAmpR"), $("fcTearAmp"), $("fcTearAmpHint"), v => v + "%",
          v => { S.tearAmp = v / 100; sync(); draw(); });
  linkNum($("fcSpeedR"), $("fcSpeed"), $("fcSpeedHint"), v => (v / 100).toFixed(1) + "×",
          v => { S.speed = v / 100; sync(); draw(); });
  linkNum($("fcCellsR"), $("fcCells"), $("fcCellsHint"), v => v,
          v => { S.cells = v; if (S.sprite) { S.sprite.rebuild(S.cells); draw(); } });
  $("fcShowMarks").addEventListener("change", draw);

  /* ── 부위 목록 ── */
  function selectPart(kind, key, ko) {
    S.sel = { kind, key };
    $("fcPick").textContent = `📍 지금 지정할 부위: ${ko} — 그림에서 원하는 지점을 클릭하세요`;
    renderList(); draw();
  }
  const FX_OPTIONS = Object.entries(PART_EFFECTS)
    .map(([k, e]) => `<option value="${k}">${e.ko}</option>`).join("");

  function renderList() {
    const f = $("fcList");
    f.innerHTML = "";
    if (!S.charId) { f.innerHTML = '<div class="hint">캐릭터를 먼저 고르세요.</div>'; return; }
    Object.entries(P()).forEach(([k, p]) => {
      const on = S.sel && S.sel.kind === "part" && S.sel.key === k;
      const stl = STYLE[k] || { c: "#facc15", label: k };
      const wave = (PART_EFFECTS[p.fx || "none"] || {}).wave;
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
          ${wave ? `<button class="ghost small" data-a="root" title="흔들릴 때 축이 되는 '몸에 붙은 자리'">⚓ 뿌리 지정</button>` : ""}
          ${["eyeL", "eyeR", "mouth"].includes(k)
            ? `<button class="ghost small" data-a="cover" title="표정을 그릴 때 원래 그림을 가릴지">${p.cover === false ? "원본 유지" : "원본 가림"}</button>
               <input type="color" data-a="color" value="${p.coverColor || "#f6d5a5"}"
                      title="가릴 색" style="width:30px;height:24px;padding:0">` : ""}
        </span>
        <span class="vactions" style="flex-basis:100%; justify-content:flex-start; gap:6px">
          <span class="hint" style="min-width:56px">움직임</span>
          <select data-a="fx" style="width:auto; min-width:130px">${FX_OPTIONS}</select>
          <span class="hint">세기</span>
          <input type="range" data-a="amp" min="0" max="250" step="10" value="${Math.round((p.amp ?? 1) * 100)}" style="width:110px">
          <span class="hint" data-a="ampv">${Math.round((p.amp ?? 1) * 100)}%</span>
        </span>`;
      const q = sel => d.querySelector(`[data-a="${sel}"]`);
      q("pick").addEventListener("click", () => selectPart("part", k, p.ko || k));
      q("plus").addEventListener("click", () => { p.r = Math.min(0.4, p.r * 1.15); renderList(); draw(); });
      q("minus").addEventListener("click", () => { p.r = Math.max(0.008, p.r / 1.15); renderList(); draw(); });
      q("on").addEventListener("click", () => { p.on = p.on === false; renderList(); draw(); });
      if (q("root")) q("root").addEventListener("click", () => selectPart("root", k, (p.ko || k) + " 뿌리"));
      const fx = q("fx");
      fx.value = p.fx || "none";
      fx.addEventListener("change", e => {
        p.fx = e.target.value;
        // 흔드는 움직임인데 뿌리가 없으면 몸 안쪽으로 한 칸 들어간 자리를 뿌리로 삼는다
        if ((PART_EFFECTS[p.fx] || {}).wave && p.ax == null) {
          const len = Math.hypot(0.5 - p.x, 0.5 - p.y) || 1;
          p.ax = p.x + (0.5 - p.x) / len * p.r * 1.1;
          p.ay = p.y + (0.5 - p.y) / len * p.r * 1.1;
        }
        renderList(); draw();
        st(p.fx === "none" ? `${p.ko}: 움직임 없음.`
                           : `${p.ko} 부위만 '${PART_EFFECTS[p.fx].ko}' — ▶ 미리보기로 확인하세요.`);
      });
      q("amp").addEventListener("input", e => {
        p.amp = e.target.value / 100;
        q("ampv").textContent = e.target.value + "%";
        draw();
      });
      if (q("cover")) q("cover").addEventListener("click", () => { p.cover = p.cover === false; renderList(); draw(); });
      if (q("color")) q("color").addEventListener("input", e => { p.coverColor = e.target.value; draw(); });
      f.appendChild(d);
    });
  }

  /* ── 그리기 ── */
  function box() {
    const w = canvas.width, h = canvas.height;
    if (!S.img) return { x: 0, y: 0, w, h };
    const s = Math.min(w / S.img.width, h / S.img.height) * 0.9;
    const dw = S.img.width * s, dh = S.img.height * s;
    return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
  }
  function fit() {
    const r = $("fcStage").getBoundingClientRect();
    canvas.width = Math.max(200, Math.round(r.width));
    canvas.height = Math.max(200, Math.round(r.height));
  }
  function draw() {
    if (!canvas.width) fit();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!S.img) return;
    const B = box();
    const t = S.playing ? S.tNow : 0.4;
    if (S.sprite) { sync(); S.sprite.draw(ctx, B, t); }
    else ctx.drawImage(S.img, B.x, B.y, B.w, B.h);
    if ($("fcShowMarks").checked) drawMarks(B);
  }

  function drawMarks(B) {
    ctx.save();
    Object.entries(P()).forEach(([k, p]) => {
      const stl = STYLE[k] || { c: "#facc15", shape: "circle", label: k };
      const cx = B.x + p.x * B.w, cy = B.y + p.y * B.h;
      const rr = p.r * Math.min(B.w, B.h);
      const picked = S.sel && S.sel.kind === "part" && S.sel.key === k;
      ctx.globalAlpha = p.on === false ? 0.28 : 1;

      ctx.fillStyle = stl.c + "26"; ctx.strokeStyle = stl.c + "aa"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(4, rr), 0, 7); ctx.fill(); ctx.stroke();
      if (p.fx && p.fx !== "none") {                    // 실제로 움직이는 범위
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
  function hitTest(mx, my) {
    if (!S.charId) return null;
    const B = box();
    let best = null, bestD = HANDLE + 6;
    for (const [k, p] of Object.entries(P())) {
      const d = Math.hypot(B.x + p.x * B.w - mx, B.y + p.y * B.h - my);
      if (d < bestD) { bestD = d; best = { kind: "part", key: k, ko: p.ko || k }; }
      if (p.ax == null || !(PART_EFFECTS[p.fx || "none"] || {}).wave) continue;
      const dr = Math.hypot(B.x + p.ax * B.w - mx, B.y + p.ay * B.h - my);
      if (dr < bestD) { bestD = dr; best = { kind: "root", key: k, ko: (p.ko || k) + " 뿌리" }; }
    }
    return best;
  }
  function place(ref, u, v) {
    const p = P()[ref.key];
    if (!p) return;
    if (ref.kind === "root") { p.ax = u; p.ay = v; }
    else { p.x = u; p.y = v; sampleCoverColors(); }
  }
  canvas.addEventListener("pointerdown", e => {
    if (!S.img) return;
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * canvas.width / r.width;
    const my = (e.clientY - r.top) * canvas.height / r.height;
    const B = box();
    if (S.sel) {
      place(S.sel, (mx - B.x) / B.w, (my - B.y) / B.h);
      S.sel = null; $("fcPick").textContent = "";
      renderList(); draw();
      return;
    }
    S.drag = hitTest(mx, my);
    if (S.drag) { canvas.setPointerCapture(e.pointerId); st(`✥ ${S.drag.ko} 을(를) 옮기는 중…`); }
  });
  canvas.addEventListener("pointermove", e => {
    if (!S.drag) return;
    const r = canvas.getBoundingClientRect();
    const B = box();
    const u = ((e.clientX - r.left) * canvas.width / r.width - B.x) / B.w;
    const v = ((e.clientY - r.top) * canvas.height / r.height - B.y) / B.h;
    place(S.drag, Math.max(-0.2, Math.min(1.2, u)), Math.max(-0.2, Math.min(1.2, v)));
    draw();
  });
  canvas.addEventListener("pointerup", e => {
    if (S.drag) { renderList(); draw(); st(`✅ ${S.drag.ko} 위치를 옮겼어요.`, "ok"); }
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
  $("fcPlay").addEventListener("click", () => {
    if (!S.sprite) { st("먼저 캐릭터를 고르세요.", "err"); return; }
    S.playing = true; S.t0 = performance.now() - S.tNow * 1000;
    if (!S.raf) loop(performance.now());
    st(`▶ ${VIEWS[S.view].ko} · ${BODY_MOVES[S.move].ko}`, "ok");
  });
  $("fcStop").addEventListener("click", () => {
    S.playing = false; S.tNow = 0;
    if (S.raf) { cancelAnimationFrame(S.raf); S.raf = null; }
    draw(); st("");
  });

  /* ── 저장 ── */
  $("fcSave").addEventListener("click", async () => {
    if (!S.charId) { st("먼저 캐릭터를 고르세요.", "err"); return; }
    try {
      const views = {};
      VIEW_KEYS.forEach(v => { if (S.parts[v]) views[v] = { parts: S.parts[v] }; });
      await api("/api/char/rig", { id: S.charId,
        rig: { views, face: S.parts.front || P(),      // 예전 형식과도 맞춰 둔다
               cells: S.cells, move: S.move, amp: S.amp,
               expr: S.expr, tear: S.tear, tearAmp: S.tearAmp } });
      updateInfo();
      const names = VIEW_KEYS.filter(v => S.parts[v]).map(v => VIEWS[v].ko).join(" · ");
      st(`💾 ${names} 방향의 표정·부위를 저장했어요.`, "ok");
      store.emit("rig-saved");
    } catch (e) { st("⚠ " + e.message, "err"); }
  });

  fit(); draw();
}
