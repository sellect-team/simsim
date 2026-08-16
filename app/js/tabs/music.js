/* 🎵 뮤직비주얼 탭 — 음악에 맞춰 배경 입자가 두근거리고 가사대로 형상이 바뀐다.
   저장·재생(전체화면 무대)·유튜브 영상 굽기까지 이 파일 하나에 모여 있다.
   히스토리 탭의 '뮤직비주얼' 목록도 여기서 그린다 (window.MvStage 로 연결). */
import { $, escapeHtml, fmtMS, api, upload, renderVideo } from "../core.js";

export async function mount(root) {
  wire();
}

/* 이 탭이 아직 안 열렸어도 히스토리에서 목록·재생을 쓸 수 있게 미리 준비한다 */
let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  bindAll();
}

const _api = {};
function loadMvHistory(){ return _api.loadMvHistory && _api.loadMvHistory(); }
function openStage(m){ return _api.openStage && _api.openStage(m); }
function closeStage(){ return _api.closeStage && _api.closeStage(); }

function bindAll() {
  /* ---------- 뮤직비주얼: 비트 감지 + 가사 타임라인 ---------- */
  let mvCtx = null, mvAnalyser = null, mvData = null, mvSrc = null;
  let mvTimeline = [], mvRAF = null, mvLastIdx = -1, mvLastBurst = 0;
  let mvBaseline = 0;

  function mvStatus(t, cls) {
    const el = $("mvStatus");
    el.textContent = t || "";
    el.style.color = cls === "err" ? "var(--err)" : cls === "ok" ? "var(--color-saffron-spark)" : "var(--color-silver-mist)";
  }

  $("mvPick").addEventListener("click", () => $("mvFile").click());
  let mvServerName = null, mvSegments = null;
  $("mvFile").addEventListener("change", async () => {
    const f = $("mvFile").files[0];
    if (!f) return;
    const a = $("mvAudio");
    a.src = URL.createObjectURL(f);
    a.style.display = "block";
    mvSegments = null;
    a.onloadedmetadata = () => {
      $("mvInfo").textContent = `♪ ${f.name} (${fmtMS(a.duration)})`;
      mvStatus("음악 준비 완료 — [🎤 가사 자동 인식] 후 [✨ 생성하기]", "ok");
    };
    try {                                   // 가사 인식을 위해 서버에도 올려둔다
      const fd = new FormData();
      fd.append("audio", f);
      const r = await fetch("/api/upload_audio", { method: "POST", body: fd });
      const d = await r.json();
      if (!d.error) mvServerName = d.name;
    } catch {}
  });

  function mvBar(pct) {
    $("mvBarWrap").style.display = pct == null ? "none" : "block";
    if (pct != null) $("mvBar").style.width = Math.max(0, Math.min(100, pct)) + "%";
  }

  /* ---- 0~100 감도 값 → 실제 계수 (탭 재생과 히스토리 팝업 재생이 함께 사용) ---- */
  function sensMul(v) { return Math.max(0, Number(v) || 0) / 50; }   // 50 = 기본(1.0배)
  function burstCfg(v) {
    const n = Math.max(0, Math.min(100, Number(v) || 0));
    // 값이 클수록 약한 비트에도(hit 낮음) 더 자주(gap 짧음) 흩뿌린다
    return n <= 0 ? null : { hit: 1.6 - 0.012 * n, gap: 10 - 0.06 * n };
  }
  /* 슬라이더 ↔ 숫자 입력을 묶고 라벨에 현재 세기를 표시 */
  function linkNum(rangeId, numId, hintId, fmt) {
    const r = $(rangeId), n = $(numId), h = $(hintId);
    const sync = src => {
      const v = parseFloat(src.value);
      if (isNaN(v)) return;                       // 지우는 중이면 건드리지 않는다
      const cl = Math.max(parseFloat(n.min), Math.min(parseFloat(n.max), v));
      if (src !== n || cl !== v) n.value = cl;
      r.value = Math.max(parseFloat(r.min), Math.min(parseFloat(r.max), cl));
      h.textContent = fmt(cl);
    };
    r.addEventListener("input", () => sync(r));
    n.addEventListener("input", () => sync(n));
    n.addEventListener("blur", () => { if (isNaN(parseFloat(n.value))) n.value = r.value; sync(n); });
    sync(n);
  }
  linkNum("mvStepR", "mvStep", "mvStepHint", v => `${v}초마다`);
  linkNum("mvSensR", "mvSens", "mvSensHint",
          v => v === 0 ? "반응 없음" : v < 25 ? "약하게" : v < 60 ? "보통" : v < 85 ? "강하게" : "아주 강하게");
  linkNum("mvBurstR", "mvBurst", "mvBurstHint",
          v => v === 0 ? "사용 안 함" : v < 25 ? "아주 가끔" : v < 60 ? "보통" : v < 85 ? "자주" : "매우 자주");

  $("mvASR").addEventListener("click", async () => {
    if (!mvServerName) { mvStatus("먼저 음악 파일을 선택하세요.", "err"); return; }
    const btn = $("mvASR");
    btn.disabled = true;
    mvBar(1);
    const t0 = Date.now();
    try {
      const r = await fetch("/api/transcribe", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ audio: mvServerName, size: $("mvModel").value })
      });
      const d0 = await r.json();
      if (d0.error) throw new Error(d0.error);
      // 백그라운드 작업 진행률을 폴링해 로딩바에 표시
      let d = null;
      while (true) {
        await new Promise(res => setTimeout(res, 800));
        const s = await (await fetch("/api/status/" + d0.job)).json();
        if (s.state === "error") throw new Error(s.error || "인식 실패");
        const el = Math.round((Date.now() - t0) / 1000);
        mvBar(s.progress || 1);
        mvStatus(`🎤 ${s.note || "인식 중"} · ${el}초 경과`);
        if (s.state === "done") { d = s; break; }
      }
      mvSegments = d.segments || [];
      $("mvLyrics").value = mvSegments
        .map(s => `[${fmtMS(s.start)}] ${s.text}`).join("\n");
      mvBar(100);
      setTimeout(() => mvBar(null), 1200);
      mvStatus(`✅ ${mvSegments.length}줄 인식 완료 (언어: ${d.language || "?"}) — [👁 렌더링 보기] 또는 [✨ 생성하기]`, "ok");
    } catch (e) { mvBar(null); mvStatus("⚠ " + e.message, "err"); }
    btn.disabled = false;
  });

  /* 생성 전에 어떤 초에 어떤 형상이 나오는지 미리 확인 */
  async function mvBuildTimeline() {
    const a = $("mvAudio");
    if (!a.src) throw new Error("먼저 음악 파일을 선택하세요.");
    const r = await fetch("/api/lyrics_shapes", {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        lyrics: $("mvLyrics").value.replace(/^\[[\d:]+\]\s*/gm, ""),
        segments: mvSegments,
        duration: a.duration || 60,
        step: parseFloat($("mvStep").value) })
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    mvTimeline = data.timeline || [];
    mvLastIdx = -1;
    renderMvTimeline();
    return mvTimeline;
  }

  $("mvPreview").addEventListener("click", async () => {
    try {
      mvStatus("미리보기를 만드는 중…");
      const tl = await mvBuildTimeline();
      const imgs = tl.filter(r => r.icon).length;
      mvStatus(`👁 ${tl.length}개 구간 미리보기 · 이미지 ${imgs}개 / 글자 ${tl.length - imgs}개 ` +
               `(${Math.round(imgs / Math.max(1, tl.length) * 100)}% 이미지) — 목록을 스크롤해 확인하세요.`, "ok");
    } catch (e) { mvStatus("⚠ " + e.message, "err"); }
  });

  let mvStreamDest = null;
  function mvSetupAudio() {
    if (mvCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    mvCtx = new AC();
    mvAnalyser = mvCtx.createAnalyser();
    mvAnalyser.fftSize = 1024;
    mvAnalyser.smoothingTimeConstant = 0.75;
    mvData = new Uint8Array(mvAnalyser.frequencyBinCount);
    mvSrc = mvCtx.createMediaElementSource($("mvAudio"));
    mvSrc.connect(mvAnalyser);
    mvAnalyser.connect(mvCtx.destination);
    mvStreamDest = mvCtx.createMediaStreamDestination();   // 녹화용 오디오 출력
    mvAnalyser.connect(mvStreamDest);
  }

  function mvLoop() {
    mvRAF = requestAnimationFrame(mvLoop);
    if (!mvAnalyser || !window.Particles) return;
    mvAnalyser.getByteFrequencyData(mvData);
    // 저음 대역(비트) 평균
    let bass = 0, n = 0;
    for (let i = 1; i < 14; i++) { bass += mvData[i]; n++; }
    bass = bass / n / 255;
    mvBaseline = mvBaseline * 0.97 + bass * 0.03;          // 곡의 평균 저음
    const sens = sensMul($("mvSens").value);
    const hit = Math.max(0, bass - mvBaseline * 0.95) * 4.5 * sens;
    window.Particles.setPulse(hit);

    const a = $("mvAudio");
    // 강한 비트에서 흩뿌리기 (0~100 감도에 따라 문턱값과 최소 간격이 달라진다)
    const bc = burstCfg($("mvBurst").value);
    if (bc && hit > bc.hit && a.currentTime - mvLastBurst > bc.gap) {
      mvLastBurst = a.currentTime;
      window.Particles.burst();
      setTimeout(() => {
        const cur = mvTimeline[mvLastIdx];
        if (cur) window.Particles.showFor(cur.icon, cur.word, cur.emoji);
      }, 1400);
    }
    // 가사 구간에 맞춰 형상 전환
    if (mvTimeline.length) {
      let idx = 0;
      for (let i = 0; i < mvTimeline.length; i++) {
        if (a.currentTime >= mvTimeline[i].time) idx = i; else break;
      }
      if (idx !== mvLastIdx) {
        mvLastIdx = idx;
        const row = mvTimeline[idx];
        window.Particles.showFor(row.icon, row.word, row.emoji);  // 가사 단어로 형상 즉석 생성
        document.querySelectorAll(".mvRow").forEach((r, i) =>
          r.classList.toggle("now", i === idx));
      }
    }
  }

  /* 오른쪽 타임라인: 읽기 전용 — 몇 초에 어떤 형상이 나오는지 보여주기만 한다 */
  function renderMvTimeline() {
    const wrap = $("mvTimeline");
    wrap.innerHTML = "";
    mvTimeline.forEach(row => {
      const d = document.createElement("div");
      d.className = "mvRow";
      const shape = row.emoji ? row.emoji + " " + (row.word || "")
                  : row.icon ? "🔷 " + row.icon
                  : "✍ " + (row.word || "-");
      const from = row.lyric_start != null ? ` · 가사 시작 ${fmtMS(row.lyric_start)}` : "";
      d.innerHTML = `<span class="t">${fmtMS(row.time)}</span>
        <canvas class="pv" width="44" height="44"
                style="width:44px;height:44px;flex-shrink:0;background:rgba(255,255,255,0.05);border-radius:10px"></canvas>
        <span class="sh" title="${escapeHtml(shape)}">${escapeHtml(shape)}</span>
        <span class="ly" title="${escapeHtml(row.lyric || "")}">${escapeHtml(row.lyric || "(가사 없음)")}<span
          style="color:var(--color-ash-gray)">${from}</span></span>`;
      const cv = d.querySelector(".pv");
      if (window.Particles) window.Particles.drawPreview(row.icon, row.word, cv, row.emoji);
      d.addEventListener("click", () => { $("mvAudio").currentTime = row.time; });
      wrap.appendChild(d);
    });
  }

  /* 재생만 (녹화 없음) */
  async function mvStart() {
    const a = $("mvAudio");
    if (!a.src) throw new Error("먼저 음악 파일을 선택하세요.");
    if (!mvTimeline.length) await mvBuildTimeline();
    mvSetupAudio();
    if (mvCtx.state === "suspended") await mvCtx.resume();
    window.Particles.setAuto(false);            // 자동 순환 끄고 음악에 맡김
    window.Particles.setForce(true);            // 배경을 꺼놨어도 재생 중에는 움직인다
    mvLastIdx = -1;
    if (!mvRAF) mvLoop();
    a.currentTime = 0;
    await a.play();
  }

  $("mvPlay").addEventListener("click", async () => {
    try {
      mvStatus("준비 중…");
      await mvStart();
      mvStatus(`▶ 재생 중 — ${mvTimeline.length}개 구간, ${$("mvStep").value}초마다 형상 전환`, "ok");
    } catch (e) { mvStatus("⚠ " + e.message, "err"); }
  });

  /* 생성하기 = 음악 + 가사 타임라인을 히스토리(🎵 뮤직비주얼 탭)에 저장.
     영상으로 굽지 않고 원본을 그대로 두므로 재생할 때마다 화질 손실 없이 실시간 렌더링된다. */
  $("mvBuild").addEventListener("click", async () => {
    const f = $("mvFile").files[0];
    const a = $("mvAudio");
    if (!f || !a.src) { mvStatus("먼저 음악 파일을 선택하세요.", "err"); return; }
    const btn = $("mvBuild");
    btn.disabled = true;
    try {
      mvStatus("가사 타임라인을 만드는 중…");
      const tl = await mvBuildTimeline();
      mvBar(40);
      mvStatus("히스토리에 저장하는 중… (음악을 복사합니다)");
      const meta = {
        title: f.name.replace(/\.[^.]+$/, ""),
        duration: a.duration || 0,
        step: parseFloat($("mvStep").value),
        sens: parseFloat($("mvSens").value),      // 0~100
        burst: parseFloat($("mvBurst").value),    // 0~100 (예전 항목은 "0"/"1" 문자열)
        lyrics: $("mvLyrics").value,
        segments: mvSegments || null,     // 줄 단위 시간 → 자막 스크롤에 사용
        timeline: tl,
      };
      const fd = new FormData();
      fd.append("audio", f, f.name);
      fd.append("meta", JSON.stringify(meta));
      const d = await (await fetch("/api/mv/save", { method: "POST", body: fd })).json();
      mvBar(100);
      setTimeout(() => mvBar(null), 1000);
      if (d.error) throw new Error(d.error);
      mvStatus(`✅ 히스토리 › 🎵 뮤직비주얼 탭에 저장됐어요 — "${meta.title}" (${tl.length}개 구간)`, "ok");
      loadMvHistory();
    } catch (e) {
      mvBar(null);
      mvStatus("⚠ " + e.message, "err");
    }
    btn.disabled = false;
  });

  $("mvStop").addEventListener("click", () => {
    $("mvAudio").pause();
    if (mvRAF) { cancelAnimationFrame(mvRAF); mvRAF = null; }
    if (window.Particles) {
      window.Particles.setPulse(0); window.Particles.setAuto(true); window.Particles.setForce(false);
    }
    mvLastIdx = -1;
    mvStatus("정지했습니다. 배경은 자동 순환으로 돌아갑니다.");
  });

  /* ---------- 뮤직비주얼 히스토리 + 전체화면 팝업 재생 ---------- */
  let mvHist = [];
  async function loadMvHistory() {
    try {
      const d = await (await fetch("/api/mv/list")).json();
      mvHist = d.items || [];
    } catch { mvHist = []; }
    renderMvHistory();
  }
  function renderMvHistory() {
    const wrap = $("mvHistList");
    if (!wrap) return;
    $("mvHistCount").textContent = `${mvHist.length}개 뮤직비주얼`;
    if (!mvHist.length) {
      wrap.innerHTML = '<div class="hint" style="text-align:center;padding:16px">' +
        '저장된 뮤직비주얼이 없습니다. [🎵 뮤직비주얼] 탭에서 음악을 올리고 [✨ 생성하기]를 누르세요.</div>';
      return;
    }
    wrap.innerHTML = "";
    mvHist.forEach(m => {
      const d = document.createElement("div");
      d.className = "vitem";
      const n = (m.timeline || []).length;
      d.innerHTML = `
        <span class="vname">🎵 ${escapeHtml(m.title || m.id)}</span>
        <span class="vinfo">${m.date} ${m.time} · ${fmtMS(m.duration || 0)} · 구간 ${n}개 ·
          ${((m.size || 0) / 1048576).toFixed(1)}MB</span>
        <span class="vactions">
          <button class="small mvplay">▶ 재생</button>
          <button class="ghost small mvyt" title="가사 자막을 넣어 유튜브용 영상 파일로 만듭니다">🎬 유튜브 영상 만들기</button>
          <button class="ghost small mvdl">⬇ 음악</button>
          <button class="danger small mvdel">삭제</button>
        </span>`;
      d.querySelector(".mvyt").addEventListener("click", () => openExportPanel(m, d));
      d.querySelector(".vname").addEventListener("click", () => openStage(m));
      d.querySelector(".mvplay").addEventListener("click", () => openStage(m));
      d.querySelector(".mvdl").addEventListener("click", () => {
        const a2 = document.createElement("a");
        a2.href = "/api/mv/audio?id=" + encodeURIComponent(m.id);
        a2.download = (m.title || m.id) + ".mp3";
        document.body.appendChild(a2); a2.click(); a2.remove();
      });
      d.querySelector(".mvdel").addEventListener("click", async () => {
        if (!confirm(`"${m.title}" 을(를) 삭제할까요?`)) return;
        await fetch("/api/mv/delete", { method: "POST",
          headers: {"Content-Type": "application/json"}, body: JSON.stringify({ id: m.id }) });
        loadMvHistory();
      });
      wrap.appendChild(d);
    });
  }

  /* ---------- 유튜브용 영상 만들기 (가사 자막 포함) ---------- */
  function openExportPanel(m, row) {
    const old = document.getElementById("mvExportPanel");
    if (old) old.remove();
    const p = document.createElement("div");
    p.id = "mvExportPanel";
    p.innerHTML = `
      <div style="font-size:13px; font-weight:600; margin-bottom:10px">
        🎬 "${escapeHtml(m.title || "")}" → 유튜브용 영상
        <span class="hint">화면에 보이는 그대로(입자 + 가사 자막) 녹화합니다</span>
      </div>
      <div class="grid">
        <div><label>화면 크기</label><select id="mvExSize">
          <option value="1920x1080" selected>유튜브 가로 1920×1080</option>
          <option value="1280x720">유튜브 가로 1280×720 (가벼움)</option>
          <option value="1080x1920">쇼츠 세로 1080×1920</option>
          <option value="1080x1080">정사각 1080×1080</option>
        </select></div>
        <div><label>가사 자막</label><select id="mvExCap">
          <option value="1" selected>넣기 (스크롤 자막)</option>
          <option value="0">넣지 않기</option>
        </select></div>
      </div>
      <div class="hint" style="margin-top:8px">
        노래를 재생하지 않고 <b>프레임을 하나씩 그려 서버가 mp4로 굽습니다</b> (H.264 + 음악).
        곡 길이(${fmtMS(m.duration || 0)})보다 빠르게 끝나고, 소리도 나지 않습니다.
      </div>
      <div class="row">
        <button id="mvExStart">🎬 만들기 시작</button>
        <button class="ghost small" id="mvExClose" style="flex:0.4">닫기</button>
      </div>
      <div id="mvExStatus" class="hint" style="text-align:center; min-height:16px; margin-top:6px"></div>`;
    p.style.cssText = "margin:8px 0 14px; border:1px solid var(--color-electric-iris);" +
                      "border-radius:14px; padding:14px; background:rgba(0,0,0,0.3)";
    row.insertAdjacentElement("afterend", p);
    $("mvExClose").addEventListener("click", () => p.remove());
    $("mvExStart").addEventListener("click", () => exportStage(m, {
      size: $("mvExSize").value,
      caption: $("mvExCap").value === "1",
    }));
    p.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* 곡 전체의 저음(비트) 세기를 미리 계산해 둔다 — 실시간 재생 없이도 입자가 두근거리게 */
  async function bassEnvelope(url, fps, frames) {
    const ab = await (await fetch(url)).arrayBuffer();
    const AC = window.AudioContext || window.webkitAudioContext;
    const tmp = new AC();
    const buf = await tmp.decodeAudioData(ab);
    tmp.close();
    const oac = new OfflineAudioContext(1, buf.length, buf.sampleRate);
    const src = oac.createBufferSource(); src.buffer = buf;
    const lp = oac.createBiquadFilter();          // 저음만 통과 → 비트만 남는다
    lp.type = "lowpass"; lp.frequency.value = 220; lp.Q.value = 0.8;
    src.connect(lp); lp.connect(oac.destination); src.start();
    const out = await oac.startRendering();
    const d = out.getChannelData(0), sr = out.sampleRate;
    const win = Math.round(sr * 0.035);
    const env = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      const c = Math.round(i / fps * sr);
      let s = 0, n = 0;
      for (let k = Math.max(0, c - win); k < Math.min(d.length, c + win); k += 2) { s += d[k] * d[k]; n++; }
      const rms = n ? Math.sqrt(s / n) : 0;
      const db = 20 * Math.log10(Math.max(rms, 1e-6));
      env[i] = Math.max(0, Math.min(1, (db + 70) / 45));
    }
    return env;
  }

  let mvExporting = false;
  async function exportStage(m, opts) {
    if (mvExporting) return;
    const st = t => { const el = $("mvExStatus"); if (el) el.textContent = t; };
    const [w, h] = opts.size.split("x").map(Number);
    const fps = 30;
    mvExporting = true;
    $("mvExStart").disabled = true;
    const cv = document.getElementById("bgCanvas");
    try {
      const dur = m.duration || 60;
      const total = Math.round(dur * fps);
      st("음악의 비트를 분석하는 중…");
      const env = await bassEnvelope("/api/mv/audio?id=" + encodeURIComponent(m.id), fps, total);

      // 무대 화면을 만들되 소리는 재생하지 않는다 (지켜볼 필요 없음)
      stItem = m; stLastIdx = -1;
      const legacy = typeof m.burst === "string";
      stSens = legacy ? (Number(m.sens) || 1) : sensMul(m.sens != null ? m.sens : 50);
      stBurst = legacy ? (m.burst === "1" ? burstCfg(50) : null)
                       : burstCfg(m.burst != null ? m.burst : 50);
      stCap = { title: m.title || "", word: "", time: 0, lines: stageLines(m) };
      window.Particles.setCaption(opts.caption ? stCap : null);
      window.Particles.setForce(true);
      window.Particles.setAuto(false);
      window.Particles.setExport({ w, h });
      document.body.classList.add("stageOn");
      $("stage").style.display = "flex";
      $("stageTitle").textContent = (m.title || "") + " — 영상 만드는 중";
      const vw = Math.min(window.innerWidth, window.innerHeight * w / h);
      cv.style.cssText = `position:fixed; inset:auto; z-index:0; pointer-events:none; display:block;` +
        `width:${Math.round(vw)}px; height:${Math.round(vw * h / w)}px;` +
        `left:50%; top:50%; transform:translate(-50%,-50%);`;

      const s = await (await fetch("/api/frames/start", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ name: m.title || "뮤직비주얼", fps }) })).json();
      if (s.error) throw new Error(s.error);

      const tl = m.timeline || [];
      let base = 0, smooth = 0, lastBurst = -99, vnow = performance.now(), pending = null;
      const t0 = Date.now();
      for (let i = 0; i < total; i++) {
        const t = i / fps;
        smooth = smooth * 0.75 + env[i] * 0.25;
        base = base * 0.97 + smooth * 0.03;
        const hit = Math.max(0, smooth - base * 0.95) * 4.5 * stSens;
        window.Particles.setPulse(hit);
        // 가사 구간에 맞춰 형상 전환
        let idx = 0;
        for (let k = 0; k < tl.length; k++) { if (t >= tl[k].time) idx = k; else break; }
        if (tl.length && idx !== stLastIdx) {
          stLastIdx = idx;
          window.Particles.showFor(tl[idx].icon, tl[idx].word, tl[idx].emoji);
        }
        if (stBurst && hit > stBurst.hit && t - lastBurst > stBurst.gap) {
          lastBurst = t; window.Particles.burst();
        }
        stCap.time = t;
        vnow += 1000 / fps;
        window.Particles.renderOne(vnow);            // 가상 시계로 한 프레임 그리기
        // toBlob은 탭이 가려지면 콜백이 1초씩 밀린다 → 동기 방식(toDataURL)으로 뽑는다
        const durl = cv.toDataURL("image/jpeg", 0.92);
        if (pending) await pending;                  // 업로드는 다음 프레임 그리는 동안 진행
        pending = fetch(`/api/frames/add?id=${s.id}&i=${i}&b64=1`, { method: "POST", body: durl });
        if (i % 10 === 0) {
          const el = (Date.now() - t0) / 1000;
          const eta = i ? Math.round(el / i * (total - i)) : 0;
          st(`🎞 그리는 중… ${i}/${total} 프레임 (${Math.round(i / total * 100)}%` +
             `${eta ? ` · 약 ${fmtMS(eta)} 남음` : ""})`);
        }
      }
      if (pending) await pending;
      closeStage();
      st("서버에서 음악과 합쳐 mp4로 굽는 중…");
      const d = await (await fetch("/api/frames/finish", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ id: s.id, fps, mv_id: m.id }) })).json();
      if (d.error) throw new Error(d.error);
      while (true) {
        await new Promise(r => setTimeout(r, 900));
        const j = await (await fetch("/api/status/" + d.job)).json();
        if (j.state === "error") throw new Error(j.error || "변환 실패");
        st(`⚙ ${j.note || "굽는 중"} (${j.progress || 0}%)`);
        if (j.state === "done") {
          st(`✅ 완성! 히스토리 › 🎬 동영상 탭에 "${j.filename}" 으로 저장됐어요 ` +
             `(${(j.size / 1048576).toFixed(1)}MB)`);
          break;
        }
      }
      refreshVideos();
    } catch (e) {
      closeStage();
      st("⚠ " + e.message);
    }
    mvExporting = false;
    const b = $("mvExStart"); if (b) b.disabled = false;
  }

  /* 전체화면 팝업: 배경 입자 + 음악 + 하단 가사만 보인다 */
  let stCtx = null, stAnalyser = null, stData = null, stSrc = null, stRAF = null;
  let stItem = null, stLastIdx = -1, stBase = 0, stLastBurst = 0;
  let stSens = 1, stBurst = null, stCap = null, stStreamDest = null;
  const stAudio = new Audio();
  stAudio.crossOrigin = "anonymous";

  function stSetup() {
    if (stCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    stCtx = new AC();
    stAnalyser = stCtx.createAnalyser();
    stAnalyser.fftSize = 1024;
    stAnalyser.smoothingTimeConstant = 0.75;
    stData = new Uint8Array(stAnalyser.frequencyBinCount);
    stSrc = stCtx.createMediaElementSource(stAudio);
    stSrc.connect(stAnalyser);
    stAnalyser.connect(stCtx.destination);
    stStreamDest = stCtx.createMediaStreamDestination();   // 영상 녹화용 오디오 출력
    stAnalyser.connect(stStreamDest);
  }

  /* 자막은 '인식된 가사 전체'가 시간에 맞춰 흐른다 (형상 전환 주기와 무관).
     ① 음성인식 구간(줄+시간) → ② 가사창의 [분:초] 표시 → ③ 그것도 없으면 형상 구간 */
  function stageLines(m) {
    const segs = m.segments;
    if (Array.isArray(segs) && segs.length)
      return segs.filter(s => (s.text || "").trim())
                 .map(s => ({ start: Number(s.start) || 0, text: String(s.text).trim() }));

    const txt = String(m.lyrics || "");
    const stamped = [];
    txt.split("\n").forEach(line => {
      const mm = line.match(/^\s*\[(\d+):(\d+(?:\.\d+)?)\]\s*(.+)$/);
      if (mm) stamped.push({ start: parseInt(mm[1]) * 60 + parseFloat(mm[2]), text: mm[3].trim() });
    });
    if (stamped.length) return stamped;

    // 시간 정보가 전혀 없으면 곡 길이에 맞춰 줄을 고르게 배치한다
    const plain = txt.split("\n").map(s => s.trim()).filter(Boolean);
    if (plain.length && m.duration)
      return plain.map((text, i) => ({ start: m.duration * i / plain.length, text }));

    return (m.timeline || []).filter(r => (r.lyric || "").trim())
                             .map(r => ({ start: Number(r.lyric_start != null ? r.lyric_start : r.time) || 0,
                                          text: String(r.lyric).trim() }));
  }

  async function openStage(m) {
    stItem = m;
    stCap = { title: m.title || "", word: "", time: 0, lines: stageLines(m) };
    window.Particles.setCaption(stCap);
    window.Particles.setForce(true);        // 배경을 꺼놨어도 재생 중에는 움직인다
    // 예전에 저장한 항목은 sens가 배율(0.6~2.4), burst가 "0"/"1" 문자열이다
    const legacy = typeof m.burst === "string";
    stSens = legacy ? (Number(m.sens) || 1) : sensMul(m.sens != null ? m.sens : 50);
    stBurst = legacy ? (m.burst === "1" ? burstCfg(50) : null)
                     : burstCfg(m.burst != null ? m.burst : 50);
    stLastIdx = -1; stBase = 0; stLastBurst = 0;
    $("stageTitle").textContent = m.title || "";
    $("stageLyric").textContent = "";
    $("stageWord").textContent = "";
    document.body.classList.add("stageOn");
    $("stage").style.display = "flex";
    stAudio.src = "/api/mv/audio?id=" + encodeURIComponent(m.id);
    stSetup();
    if (stCtx.state === "suspended") await stCtx.resume();
    window.Particles.setAuto(false);
    stAudio.currentTime = 0;
    try { await stAudio.play(); } catch (e) { $("stageLyric").textContent = "재생하려면 화면을 클릭하세요"; }
    if (!stRAF) stLoop();
  }

  function closeStage() {
    stAudio.pause();
    if (stRAF) { cancelAnimationFrame(stRAF); stRAF = null; }
    document.body.classList.remove("stageOn");
    $("stage").style.display = "none";
    document.getElementById("bgCanvas").style.cssText = "";   // 내보내기용 레터박스 해제
    if (window.Particles) {
      window.Particles.setPulse(0);
      window.Particles.setAuto(true);
      window.Particles.setCaption(null);
      window.Particles.setExport(null);          // 화면 해상도로 복귀
      window.Particles.setForce(false);          // 배경 설정(켬/정지/끔)으로 되돌린다
    }
  }

  function stLoop() {
    stRAF = requestAnimationFrame(stLoop);
    if (!stAnalyser || !window.Particles || !stItem) return;
    stAnalyser.getByteFrequencyData(stData);
    let bass = 0;
    for (let i = 1; i < 14; i++) bass += stData[i];
    bass = bass / 13 / 255;
    stBase = stBase * 0.97 + bass * 0.03;
    const hit = Math.max(0, bass - stBase * 0.95) * 4.5 * stSens;
    window.Particles.setPulse(hit);

    const tl = stItem.timeline || [];
    const t = stAudio.currentTime;
    if (stCap) stCap.time = t;                   // 캔버스 자막이 이 시간에 맞춰 스크롤된다
    if (stBurst && hit > stBurst.hit && t - stLastBurst > stBurst.gap) {
      stLastBurst = t;
      window.Particles.burst();
      setTimeout(() => {
        const cur = tl[stLastIdx];
        if (cur && stRAF) window.Particles.showFor(cur.icon, cur.word, cur.emoji);
      }, 1400);
    }
    if (tl.length) {
      let idx = 0;
      for (let i = 0; i < tl.length; i++) { if (t >= tl[i].time) idx = i; else break; }
      if (idx !== stLastIdx) {
        stLastIdx = idx;
        const row = tl[idx];
        window.Particles.showFor(row.icon, row.word, row.emoji);
      }
    }
    const dur = stAudio.duration || stItem.duration || 1;
    $("stageBar").style.width = (t / dur * 100) + "%";
    $("stageTime").textContent = `${fmtMS(t)} / ${fmtMS(dur)}`;
  }

  $("stageClose").addEventListener("click", closeStage);
  $("stagePause").addEventListener("click", () => {
    if (stAudio.paused) { stAudio.play(); $("stagePause").textContent = "⏸"; }
    else { stAudio.pause(); $("stagePause").textContent = "▶"; }
  });
  $("stage").addEventListener("click", e => {
    if (e.target.id === "stage" && stAudio.paused) stAudio.play();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && document.body.classList.contains("stageOn")) closeStage();
  });
  stAudio.addEventListener("ended", () => { $("stagePause").textContent = "▶"; });
  // 밖에서 부를 수 있도록 참조를 올려둔다
  _api.loadMvHistory = loadMvHistory;
  _api.openStage = openStage;
  _api.closeStage = closeStage;

}

/* 히스토리 탭 등 밖에서 쓰는 창구 */
window.MvStage = {
  ensure: wire,
  loadHistory: () => { wire(); return loadMvHistory(); },
  open: m => { wire(); return openStage(m); },
  close: () => closeStage(),
};
