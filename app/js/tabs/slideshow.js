/* 🎞 슬라이드쇼 탭 — 이미지들을 효과·전환으로 이어 붙여 영상으로 만든다.
   화면은 app/views/slideshow.html, 움직임 고르기 팝업(#motionModal)은 index.html 에 있다. */
import { $, escapeHtml, fmtMS, addZoomBar } from "../core.js";

export async function mount() {
  bindAll();
}

function bindAll() {
  addZoomBar($("slidePlayer"));                 // 미리보기 크기 조절
  /* ---------- 슬라이드쇼 ---------- */
  let slideImages = [];
  const SLIDE_EFFECTS = [
    ["auto", "효과: 자동"], ["zoom_in", "천천히 줌인"], ["zoom_out", "천천히 줌아웃"],
    ["pan_lr", "좌→우 팬"], ["pan_rl", "우→좌 팬"], ["pan_ud", "위→아래 팬"], ["none", "정지"],
  ];
  const MOTION_CATALOG = [
    ["😊 표정 · 얼굴", [
      ["the eyes blink slowly", "👁 눈 깜빡임"],
      ["the pupils glance around slowly", "👀 눈동자 움직임"],
      ["the corners of the mouth lift into a slight smile", "😊 입꼬리 미소"],
      ["the mouth moves as if talking", "💬 입 움직임"],
      ["the character yawns sleepily", "🥱 하품"],
      ["one eye winks playfully", "😉 윙크"],
      ["the eyebrows raise in surprise", "😲 놀란 표정"],
      ["cheeks blush softly", "😳 볼 붉힘"],
    ]],
    ["🐾 동물 동작", [
      ["the ears twitch subtly", "👂 귀 움찔"],
      ["the tail wags gently from side to side", "🐕 꼬리만 흔들기"],
      ["the tail wags fast and happily", "🐕 꼬리 빠르게 흔들기"],
      ["the head bobs up and down slightly", "🙆 고개만 까딱"],
      ["the head tilts slightly", "🙂 고개 갸웃"],
      ["the whole body trembles and shivers slightly", "🥶 부들부들 떨기"],
      ["the body shakes with a quick shiver", "💨 몸 부르르 털기"],
      ["the nose sniffs and wiggles", "👃 코 실룩"],
      ["the paw taps softly", "🐾 앞발 까딱"],
      ["the animal stretches lazily", "🧘 기지개"],
      ["the fur ruffles softly", "🌬 털 날림"],
    ]],
    ["🧍 사람 · 몸", [
      ["the hand waves slowly", "👋 손 흔들기"],
      ["the head nods gently", "🙆 고개 끄덕임"],
      ["the shoulders shrug lightly", "🤷 어깨 으쓱"],
      ["subtle breathing motion of the chest", "🫁 숨쉬기"],
      ["hair sways very softly", "💇 머리카락 날림"],
      ["fingers tap rhythmically", "🖐 손가락 까딱"],
    ]],
    ["🌿 자연 · 배경", [
      ["leaves sway gently", "🍃 나뭇잎 흔들림"],
      ["clouds drift very slowly", "☁ 구름 흐름"],
      ["grass sways in the breeze", "🌾 풀 흔들림"],
      ["snow falls softly", "❄ 눈 내림"],
      ["gentle rain falls", "🌧 비 내림"],
      ["water ripples calmly", "🌊 물결"],
      ["cherry blossom petals flutter down", "🌸 벚꽃 흩날림"],
      ["stars twinkle in the sky", "🌟 별 반짝임"],
    ]],
    ["💡 효과 · 소품", [
      ["sparkles twinkle softly", "✨ 반짝임"],
      ["the object glows warmly with a soft pulse", "💛 오브젝트 빛남"],
      ["steam rises gently", "♨ 김·연기"],
      ["a candle flame flickers softly", "🕯 촛불 흔들림"],
      ["dust particles float in the air", "🌫 먼지 입자"],
      ["a speech bubble bobs gently", "💬 말풍선 둥실"],
      ["small hearts float upward", "💕 하트 떠오름"],
      ["musical notes float by", "🎵 음표 떠다님"],
    ]],
  ];
  const SLIDE_TRANS = [
    ["ai_morph", "🤖 AI 전환 — 1번이 2번으로 변해감 (GPU)"],
    ["crossfade", "크로스페이드 (디졸브)"], ["fade_black", "블랙 페이드"],
    ["fade_white", "화이트 페이드"], ["wipe_lr", "와이프 →"],
    ["wipe_rl", "와이프 ←"], ["wipe_ud", "와이프 ↓"],
    ["push_lr", "푸시 → (밀어내기)"], ["push_rl", "푸시 ←"],
    ["iris", "아이리스 (원형 열림)"], ["zoom_blend", "줌 전환"],
    ["blur", "블러 (몽환적)"], ["cut", "컷 (바로 전환)"],
  ];
  const SLIDE_INTERVALS = [
    [0, "텀: 자연스럽게"], [2, "2초마다 한 번"], [3, "3초마다 한 번"], [4, "4초마다 한 번"],
  ];
  const TRANS_LENGTHS = [[6, "0.25초"], [12, "0.5초"], [18, "0.75초"], [24, "1초"], [36, "1.5초"]];
  function mkSelect(cls, options, current, title) {
    return `<select class="${cls}" title="${title}">` +
      options.map(([v, t]) => `<option value="${escapeHtml(String(v))}" ${String(v) === String(current) ? "selected" : ""}>${t}</option>`).join("") +
      "</select>";
  }
  function renderSlideList() {
    const wrap = $("slideList");
    wrap.innerHTML = "";
    if (!slideImages.length) {
      wrap.innerHTML = '<div class="hint" style="text-align:center; padding:8px">아래 [➕ 이미지 추가]로 시작하세요. 추가한 순서대로 재생됩니다.</div>';
      return;
    }
    const gpuOn = $("slideGpu").checked;
    slideImages.forEach((m, i) => {
      // 전환 줄 (두 번째 이미지부터, 이미지 줄 위에)
      if (i > 0) {
        m.transIn = m.transIn || { type: "crossfade", frames: 12 };
        const tr = document.createElement("div");
        tr.className = "transRow";
        tr.innerHTML = `<span class="hint" style="flex-shrink:0">⤵ 전환</span>
          ${mkSelect("ttype", SLIDE_TRANS, m.transIn.type, "전환 방식")}
          ${mkSelect("tframes", TRANS_LENGTHS, m.transIn.frames, "전환에 걸리는 시간")}
          <button class="ghost small tpreview" type="button" title="이 전환의 예시 보기">👁 예시</button>
          ${m.transIn.type === "ai_morph" ? `<input class="tprompt" style="flex-basis:100%; margin-top:6px; font-size:12px; padding:6px 9px" placeholder="두 그림 사이에 무슨 일이 일어나나요? (예: 사람 손이 신발을 집어 들고 강아지가 매달려 끌려간다)" value="${escapeHtml(m.transIn.prompt || "")}">` : ""}`;
        tr.querySelector(".ttype").addEventListener("change", e => { m.transIn.type = e.target.value; renderSlideList(); });
        const tp = tr.querySelector(".tprompt");
        if (tp) tp.addEventListener("input", e => { m.transIn.prompt = e.target.value; });
        tr.querySelector(".tframes").addEventListener("change", e => { m.transIn.frames = parseInt(e.target.value); });
        const pv = tr.querySelector(".tpreview");
        pv.addEventListener("mouseenter", e => {
          $("hoverPreviewImg").src = "/api/transition_preview/" + m.transIn.type + "?t=" + m.transIn.type;
          const hp = $("hoverPreview");
          hp.style.display = "block";
          const r = pv.getBoundingClientRect();
          hp.style.left = Math.min(r.right + 10, window.innerWidth - 340) + "px";
          hp.style.top = Math.max(8, r.top - 60) + "px";
        });
        pv.addEventListener("mouseleave", () => { $("hoverPreview").style.display = "none"; });
        wrap.appendChild(tr);
      }
      const d = document.createElement("div");
      d.className = "slideItem";
      d.innerHTML = `
        <img src="/api/view?filename=${encodeURIComponent(m.name)}&type=input">
        <span class="sname">${i + 1}. ${escapeHtml(m.orig)}</span>
        ${mkSelect("ssec", [[1,"1초"],[2,"2초"],[3,"3초"],[4,"4초"],[5,"5초"]], m.seconds || 3, "이 이미지가 보여지는 시간")}
        ${mkSelect("seffect", SLIDE_EFFECTS, m.effect || "auto", "카메라 효과")}
        <button class="ghost small smotionBtn" type="button" title="클릭해서 이 이미지의 움직임을 선택하세요 (영역 지정은 GPU 불필요)">🎬 ${escapeHtml(m.motionLabel || "움직임: 없음")}</button>
        <button class="ghost small sup" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="ghost small sdown" ${i === slideImages.length - 1 ? "disabled" : ""}>↓</button>
        <button class="danger small sdel">✕</button>`;
      d.querySelector(".ssec").addEventListener("change", e => { m.seconds = parseInt(e.target.value); });
      d.querySelector(".seffect").addEventListener("change", e => { m.effect = e.target.value; });
      const smb = d.querySelector(".smotionBtn");
      if (smb) smb.addEventListener("click", () => openMotionModal(m));
      d.querySelector(".sup").addEventListener("click", () => {
        [slideImages[i - 1], slideImages[i]] = [slideImages[i], slideImages[i - 1]]; renderSlideList();
      });
      d.querySelector(".sdown").addEventListener("click", () => {
        [slideImages[i + 1], slideImages[i]] = [slideImages[i], slideImages[i + 1]]; renderSlideList();
      });
      d.querySelector(".sdel").addEventListener("click", () => {
        slideImages.splice(i, 1); renderSlideList();
      });
      wrap.appendChild(d);
    });
  }
  $("slideGpu").addEventListener("change", renderSlideList);

  /* 움직임 선택 팝업 */
  let motionModalTarget = null;
  function openMotionModal(m) {
    motionModalTarget = m;
    const wrap = $("motionModalChips");
    wrap.innerHTML = "";
    const sel = new Set(m.motionSel || []);
    MOTION_CATALOG.forEach(([cat, items]) => {
      const c = document.createElement("div");
      c.className = "chipCat"; c.textContent = cat;
      wrap.appendChild(c);
      const chips = document.createElement("div");
      chips.className = "chips";
      items.forEach(([en, ko]) => {
        const s = document.createElement("span");
        s.className = "chip" + (sel.has(en) ? " on" : "");
        s.dataset.en = en; s.dataset.ko = ko; s.textContent = ko;
        s.addEventListener("click", () => s.classList.toggle("on"));
        chips.appendChild(s);
      });
      wrap.appendChild(chips);
    });
    $("motionCustom").value = m.customMotion || "";
    $("motionInterval").value = String(m.interval || 0);
    $("motionModal").style.display = "flex";
  }
  /* 정밀 영역 지정 (시네마그래프) */
  let regionImg = null, regionRect = null, regionDrag = null;
  function drawRegionCanvas() {
    const cv = $("regionCanvas"), ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (regionImg) ctx.drawImage(regionImg, 0, 0, cv.width, cv.height);
    if (regionRect) {
      const [rx, ry, rw, rh] = regionRect;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.clearRect(rx * cv.width, ry * cv.height, rw * cv.width, rh * cv.height);
      if (regionImg) {
        ctx.drawImage(regionImg,
          rx * regionImg.width, ry * regionImg.height, rw * regionImg.width, rh * regionImg.height,
          rx * cv.width, ry * cv.height, rw * cv.width, rh * cv.height);
      }
      ctx.strokeStyle = "#4ade80"; ctx.lineWidth = 2.5;
      ctx.strokeRect(rx * cv.width, ry * cv.height, rw * cv.width, rh * cv.height);
      ctx.restore();
    }
  }
  function canvasPos(e) {
    const cv = $("regionCanvas"), r = cv.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return [Math.max(0, Math.min(1, cx / r.width)), Math.max(0, Math.min(1, cy / r.height))];
  }
  ["pointerdown"].forEach(ev => $("regionCanvas").addEventListener(ev, e => {
    e.preventDefault();
    regionDrag = canvasPos(e);
    regionRect = [regionDrag[0], regionDrag[1], 0, 0];
    drawRegionCanvas();
  }));
  $("regionCanvas").addEventListener("pointermove", e => {
    if (!regionDrag) return;
    const [x, y] = canvasPos(e);
    regionRect = [Math.min(regionDrag[0], x), Math.min(regionDrag[1], y),
                  Math.abs(x - regionDrag[0]), Math.abs(y - regionDrag[1])];
    drawRegionCanvas();
  });
  window.addEventListener("pointerup", () => { regionDrag = null; });
  function openRegionModal(m) {
    const img = new Image();
    img.onload = () => {
      regionImg = img;
      const cv = $("regionCanvas");
      cv.width = 560;
      cv.height = Math.round(560 * img.height / img.width);
      regionRect = (m.region && m.region.rect) || null;
      if (m.region) {
        $("regionType").value = m.region.type || "wiggle";
        $("regionStrength").value = String(m.region.strength || 2);
        $("regionPeriod").value = String(m.region.period || 2);
      }
      drawRegionCanvas();
      $("regionModal").style.display = "flex";
    };
    img.src = "/api/view?filename=" + encodeURIComponent(m.name) + "&type=input";
  }
  $("regionMode").addEventListener("change", () => {
    const ai = $("regionMode").value === "ai";
    $("regionAiOpts").style.display = ai ? "grid" : "none";
    $("regionProcOpts").style.display = ai ? "none" : "grid";
  });
  $("regionAiMotion").addEventListener("change", () => {
    $("regionAiCustomWrap").style.display = $("regionAiMotion").value === "__custom" ? "block" : "none";
  });
  $("regionCancelBtn").addEventListener("click", () => { $("regionModal").style.display = "none"; });
  $("regionClearBtn").addEventListener("click", () => { regionRect = null; drawRegionCanvas(); });
  $("regionSaveBtn").addEventListener("click", () => {
    const m = motionModalTarget;
    if (!m) return;
    if (!regionRect || regionRect[2] < 0.02 || regionRect[3] < 0.02) {
      m.region = null;
      if (!m.motion) m.motionLabel = "";
    } else {
      const ai = $("regionMode").value === "ai";
      let desc = "", descLabel = "";
      if (ai) {
        const sel = $("regionAiMotion");
        desc = sel.value === "__custom" ? ($("regionAiCustom").value.trim() || "the highlighted part moves naturally and subtly") : sel.value;
        descLabel = sel.value === "__custom" ? "✍ " + desc.slice(0, 12) : sel.selectedOptions[0].textContent.trim();
      }
      m.region = {
        rect: regionRect.map(v => Math.round(v * 1000) / 1000),
        mode: ai ? "ai" : "proc",
        motion_desc: desc,
        type: $("regionType").value,
        strength: parseInt($("regionStrength").value),
        period: parseFloat($("regionPeriod").value),
      };
      m.motion = null; m.motionSel = []; m.customMotion = "";
      const tname = ai ? "🤖 " + descLabel
        : { wiggle: "🌀 흔들흔들", bob: "↕ 위아래", sway: "↔ 좌우", pulse: "💓 두근두근" }[$("regionType").value];
      m.motionLabel = "🎯 " + tname;
    }
    $("regionModal").style.display = "none";
    $("motionModal").style.display = "none";
    renderSlideList();
    slideStatus(m.region
      ? (m.region.mode === "ai" ? "🎯🤖 AI 영역 움직임 설정됨 — 만들기 시 GPU로 생성됩니다." : "🎯⚡ 즉시 영역 움직임 설정됨.")
      : "영역이 지워졌어요.", "ok");
  });
  $("openRegionBtn").addEventListener("click", () => {
    if (motionModalTarget) openRegionModal(motionModalTarget);
  });

  $("motionCancelBtn").addEventListener("click", () => { $("motionModal").style.display = "none"; });
  $("motionNoneBtn").addEventListener("click", () => {
    const m = motionModalTarget;
    if (m) { m.motion = null; m.motionSel = []; m.customMotion = ""; m.motionLabel = ""; m.region = null; }
    $("motionModal").style.display = "none";
    renderSlideList();
  });
  $("motionSaveBtn").addEventListener("click", () => {
    const m = motionModalTarget;
    if (!m) return;
    const chips = [...document.querySelectorAll("#motionModalChips .chip.on")];
    const ens = chips.map(c => c.dataset.en);
    const kos = chips.map(c => c.dataset.ko);
    const custom = $("motionCustom").value.trim();
    if (custom) { ens.push(custom); kos.push("✍ " + custom.slice(0, 14)); }
    m.motionSel = chips.map(c => c.dataset.en);
    m.customMotion = custom;
    m.interval = parseInt($("motionInterval").value);
    m.motion = ens.length ? ens.join(" and ") : null;
    m.motionLabel = kos.length ? kos.join(" + ") : "";
    if (ens.length) m.region = null;
    if (ens.length && !$("slideGpu").checked)
      alert("AI 생성 움직임은 상단의 [🎮 GPU 미세 모션] 체크를 켜야 적용됩니다.\n(영역 움직임은 GPU 없이도 적용돼요)");
    if (ens.length > 2) alert(`움직임을 ${ens.length}개 선택했어요 — 1~2개가 훨씬 안정적입니다.`);
    $("motionModal").style.display = "none";
    renderSlideList();
  });

  /* 슬라이드쇼 배경 음악 */
  let slideMusic = null;
  $("sMusicPick").addEventListener("click", () => $("sMusicFile").click());
  $("sMusicClear").addEventListener("click", () => {
    slideMusic = null;
    $("sMusicInfo").textContent = "";
    $("sMusicClear").style.display = "none";
  });
  function fmtMS(sec) {
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  }
  function updateMusicRangeLabel() {
    let s = parseInt($("sMusicStart").value), e = parseInt($("sMusicEnd").value);
    if (s >= e) { s = Math.max(0, e - 1); $("sMusicStart").value = s; }
    $("sMusicRangeLabel").textContent = `${fmtMS(s)} ~ ${fmtMS(e)} (${fmtMS(e - s)} 길이)`;
  }
  $("sMusicStart").addEventListener("input", updateMusicRangeLabel);
  $("sMusicEnd").addEventListener("input", updateMusicRangeLabel);
  $("sMusicFile").addEventListener("change", async () => {
    const f = $("sMusicFile").files[0];
    if (!f) return;
    $("sMusicInfo").textContent = "업로드 중…";
    try {
      const fd = new FormData();
      fd.append("audio", f);
      const r = await fetch("/api/upload_audio", { method: "POST", body: fd });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      slideMusic = data.name;
      $("sMusicInfo").textContent = `♪ ${data.name} (${fmtMS(data.duration)})`;
      $("sMusicClear").style.display = "block";
      const a = $("sMusicAudio");
      a.src = "/api/audio/" + encodeURIComponent(data.name);
      a.style.display = "block";
      const dur = Math.ceil(data.duration);
      $("sMusicStart").max = dur; $("sMusicStart").value = 0;
      $("sMusicEnd").max = dur; $("sMusicEnd").value = dur;
      updateMusicRangeLabel();
    } catch (e) { slideMusic = null; $("sMusicInfo").textContent = "⚠ " + e.message; }
    $("sMusicFile").value = "";
  });
  $("sMusicRange").addEventListener("change", () => {
    $("sMusicPartWrap").style.display = $("sMusicRange").value === "part" ? "block" : "none";
  });
  let musicPreviewTimer = null;
  $("sMusicPreviewBtn").addEventListener("click", () => {
    const a = $("sMusicAudio");
    if (!a.src) return;
    const s = parseInt($("sMusicStart").value), e = parseInt($("sMusicEnd").value);
    a.currentTime = s;
    a.play();
    if (musicPreviewTimer) clearInterval(musicPreviewTimer);
    musicPreviewTimer = setInterval(() => {
      if (a.currentTime >= e) { a.pause(); clearInterval(musicPreviewTimer); musicPreviewTimer = null; }
    }, 200);
  });
  $("sMusicStopBtn").addEventListener("click", () => {
    $("sMusicAudio").pause();
    if (musicPreviewTimer) { clearInterval(musicPreviewTimer); musicPreviewTimer = null; }
  });

  /* 고급 생성 설정 팝업 */
  let slideGenOpts = null;
  try { slideGenOpts = JSON.parse(localStorage.getItem("slideGenOpts")); } catch {}
  $("genOptsBtn").addEventListener("click", () => { $("genOptsModal").style.display = "flex"; });
  $("genOptsCloseBtn").addEventListener("click", () => { $("genOptsModal").style.display = "none"; });
  document.querySelectorAll("#styleChips .chip").forEach(c =>
    c.addEventListener("click", () => {
      document.querySelectorAll("#styleChips .chip").forEach(x => x.classList.remove("on"));
      c.classList.add("on");
    }));
  $("genOptsSaveBtn").addEventListener("click", () => {
    const styleChip = document.querySelector("#styleChips .chip.on");
    slideGenOpts = {
      style: $("genStyleCustom").value.trim() || (styleChip ? styleChip.dataset.style : ""),
      sampler: $("genSampler").value,
      scheduler: $("genScheduler").value,
      steps: parseInt($("genSteps").value) || 20,
      cfg: parseFloat($("genCfg").value) || 5,
      shift: parseFloat($("genShift").value) || 4,
      stabilize: parseInt($("genStab").value),
      turbo: $("genTurbo").checked,
    };
    localStorage.setItem("slideGenOpts", JSON.stringify(slideGenOpts));
    $("genOptsModal").style.display = "none";
    slideStatus("⚙ 고급 생성 설정이 저장됐어요 — GPU 생성 시 적용됩니다.", "ok");
  });
  function slideStatus(text, cls) {
    const el = $("slideStatus");
    el.textContent = text || "";
    el.style.color = cls === "err" ? "var(--err)" : cls === "ok" ? "var(--ok)" : "var(--muted)";
  }
  $("slideAddBtn").addEventListener("click", () => $("slideFiles").click());
  $("slideFiles").addEventListener("change", async () => {
    const files = [...$("slideFiles").files];
    if (!files.length) return;
    slideStatus("업로드 중…");
    try {
      let upCount = 0, sz = null;
      for (const f of files) {
        slideImages.push({ name: await uploadOneImage(f), orig: f.name });
        if (lastUpscaled) { upCount++; sz = lastSize; }
      }
      renderSlideList();
      slideStatus(`${files.length}장 추가됨 (총 ${slideImages.length}장)` +
                  (upCount ? ` · ✨ ${upCount}장 선명화·규격화${sz ? ` (${sz[0]}×${sz[1]})` : ""}` : ""), "ok");
    } catch (e) { slideStatus("⚠ 업로드 실패: " + e.message, "err"); }
    $("slideFiles").value = "";
  });
  $("slideMakeBtn").addEventListener("click", async () => {
    if (!slideImages.length) { slideStatus("이미지를 먼저 추가하세요.", "err"); return; }
    const [w, h] = $("slideSize").value.split("x").map(Number);
    const gpu = $("slideGpu").checked;
    $("slideMakeBtn").disabled = true;
    slideStatus(gpu ? "🎮 GPU 미세 모션 생성 시작… (장당 3~6분)" : "🎬 만드는 중… (몇 초 걸립니다)");
    try {
      const r = await fetch("/api/slideshow", { method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          slides: slideImages.map(m => ({ image: m.name, seconds: m.seconds || 3, effect: m.effect || "auto",
            motion: gpu ? (m.motion || null) : null,
            interval: m.interval || 0,
            region: m.region || null,
            lock_bg: $("slideLockBg").checked })),
          fit: $("slideFit").value,
          transitions: slideImages.slice(1).map(m => ({ type: (m.transIn || {}).type || "crossfade", frames: (m.transIn || {}).frames || 12, prompt: (m.transIn || {}).prompt || "" })),
          gpu,
          gen: slideGenOpts || undefined,
          width: w, height: h,
        }) });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      let filename = data.filename;
      if (data.job) {
        const t0 = Date.now();
        while (true) {
          await new Promise(res => setTimeout(res, 4000));
          const st = await (await fetch("/api/status/" + data.job)).json();
          const sec = Math.round((Date.now() - t0) / 1000);
          if (st.state === "done") { filename = st.files[0].filename; break; }
          if (st.state === "error") throw new Error(st.error || "생성 실패");
          slideStatus(`🎮 ${st.note || "생성 중"} — ${sec}초 경과`);
        }
      }
      if (slideMusic) {
        slideStatus("🎵 배경 음악 입히는 중…");
        const part = $("sMusicRange").value === "part";
        const mr = await fetch("/api/videos/add_audio", { method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            filename, audio: slideMusic, mode: $("sMusicMode").value,
            audio_start: part ? (parseFloat($("sMusicStart").value) || 0) : 0,
            audio_end: part ? (parseFloat($("sMusicEnd").value) || 0) : 0,
          }) });
        const md = await mr.json();
        if (md.error) throw new Error("음악 입히기 실패: " + md.error);
        filename = md.filename;
      }
      const p = $("slidePlayer");
      p.src = `/api/view?filename=${encodeURIComponent(filename)}&subfolder=video&type=output`;
      p.style.display = "block";
      p.play().catch(() => {});
      slideStatus(`✅ 완성${slideMusic ? " (음악 포함)" : ""}: ${filename} (히스토리 탭에도 저장됨)`, "ok");
    } catch (e) { slideStatus("⚠ " + e.message, "err"); }
    $("slideMakeBtn").disabled = false;
  });
  renderSlideList();
  window.SlideshowTab = { refresh: () => renderSlides && renderSlides() };
}
