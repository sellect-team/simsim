/* 🗂 히스토리 탭 — 만들어진 영상 목록·미리보기·그룹/잠금·삭제·편집·GIF·음악 입히기.
   화면(app/views/history.html)과 짝을 이루며, 탭을 처음 열 때만 불러온다.
   뮤직비주얼 목록은 js/tabs/music.js(window.MvStage)가 그린다. */
import { $, escapeHtml, fmtMS, addZoomBar } from "../core.js";
import { openPlayer, 내려받기, 여러개내려받기 } from "../ui/player.js";
import { busy } from "../ui/busy.js";
import { openModal } from "../ui/modal.js";
import { openCutSheet } from "../ui/cutsheet.js";

export async function mount() {
  bindAll();
  if (window.HistoryTab) window.HistoryTab.refresh();
}

/* 뮤직비주얼 하위 탭은 music.js 가 담당한다 */
async function openMvHistory() {
  if (window.ensureTab) await window.ensureTab("musicTab");
  if (window.MvStage) window.MvStage.loadHistory();
}

function bindAll() {
  addZoomBar($("histPlayer"), $("histPlayerImg"));   // 미리보기 크기 조절
  /* ---------- 히스토리 관리 ---------- */
  let videosCache = [];
  function histStatus(text, cls) {
    const el = $("histStatus");
    el.textContent = text || "";
    el.style.color = cls === "err" ? "var(--err)" : cls === "ok" ? "var(--ok)" : "var(--muted)";
  }
  async function refreshVideos() {
    try {
      const data = await (await fetch("/api/videos")).json();
      videosCache = data.videos || [];
      await 주인읽기();          // 어느 프로젝트 것인지 함께 읽는다
      renderVideos();
    } catch (e) { histStatus("목록을 불러오지 못했어요: " + e.message, "err"); }
  }
  function allGroups() {
    const set = new Set();
    videosCache.forEach(v => { if (v.group) set.add(v.group); });
    return [...set].sort();
  }
  /* ── 목록 그리기 ──
     영상이 수백 개가 되면 한 번에 다 그릴 수 없다. 그래서
       ① 찾기·정렬·거르기로 줄이고 ② 한 뭉치씩 보여 주고 ③ 격자로도 볼 수 있게 한다.
     격자 보기가 기본이다 — 영상은 이름보다 **그림으로 훑는 것**이 훨씬 빠르다. */
  const 한뭉치 = 60;
  let 보인수 = 한뭉치;
  let 격자 = localStorage.getItem("hist보기") !== "줄";

  function 고른목록() {
    let list = videosCache;
    const filter = $("histGroupFilter").value;
    if (filter === "__ungrouped") list = list.filter(v => !v.group);
    else if (filter) list = list.filter(v => v.group === filter);

    const 프 = $("histProject").value;
    if (프 === "__none") list = list.filter(v => !주인표[v.filename]);
    else if (프) list = list.filter(v => 주인표[v.filename]?.project === 프);

    const 말 = ($("histFind").value || "").trim().toLowerCase();
    if (말) list = list.filter(v =>
      v.filename.toLowerCase().includes(말) ||
      (v.group || "").toLowerCase().includes(말) ||
      (주인표[v.filename]?.project || "").toLowerCase().includes(말));

    const 정렬 = {
      "최근": (a, b) => b.mtime - a.mtime,
      "오래된": (a, b) => a.mtime - b.mtime,
      "이름": (a, b) => a.filename.localeCompare(b.filename, "ko"),
      "큰것": (a, b) => (b.size || 0) - (a.size || 0),
      "긴것": (a, b) => (b.duration || 0) - (a.duration || 0),
    }[$("histSort").value];
    return 정렬 ? [...list].sort(정렬) : list;
  }

  function renderVideos() {
    // 그룹·프로젝트 고르개를 지금 자료에 맞춰 다시 채운다
    const gf = $("histGroupFilter"), cur = gf.value;
    gf.innerHTML = '<option value="">전체 보기</option>' +
      allGroups().map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("") +
      '<option value="__ungrouped">미분류</option>';
    gf.value = cur && [...gf.options].some(o => o.value === cur) ? cur : "";

    const pf = $("histProject"), pcur = pf.value;
    const 프목록 = [...new Set(Object.values(주인표).map(o => o.project).filter(Boolean))].sort();
    pf.innerHTML = '<option value="">모든 프로젝트</option>' +
      프목록.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("") +
      `<option value="__none">🧹 주인 없는 것만 (${
        videosCache.filter(v => !주인표[v.filename]).length}개)</option>`;
    pf.value = pcur && [...pf.options].some(o => o.value === pcur) ? pcur : "";

    const list = 고른목록();
    const 총크기 = list.reduce((a, b) => a + (b.size || 0), 0);
    $("histCount").textContent =
      `${list.length}개${list.length !== videosCache.length ? ` / ${videosCache.length}개` : ""}` +
      ` · ${(총크기 / 1048576).toFixed(0)}MB`;
    $("histView").textContent = 격자 ? "☰ 줄로 보기" : "▦ 격자로 보기";

    const wrap = $("histList");
    wrap.innerHTML = "";
    if (!list.length) {
      wrap.innerHTML = '<div class="hint" style="text-align:center;padding:16px">' +
        (videosCache.length ? "찾는 것이 없습니다." : "영상이 없습니다.") + "</div>";
      $("histMore").style.display = "none";
      return;
    }

    const 보일것 = list.slice(0, 보인수);
    if (격자) {
      const g = document.createElement("div");
      g.style.cssText = "display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px";
      보일것.forEach(v => g.appendChild(videoCard(v)));
      wrap.appendChild(g);
    } else {
      // 줄 보기는 날짜·그룹으로 묶어 준다
      const byKey = {};
      보일것.forEach(v => { const k = v.group || v.date; (byKey[k] = byKey[k] || []).push(v); });
      Object.keys(byKey).forEach(key => {
        const g = document.createElement("div");
        g.className = "vgroup";
        const isGroup = videosCache.some(v => v.group === key);
        g.innerHTML = `<h3>${isGroup ? "🗂 " : "📅 "}${escapeHtml(key)}</h3><div class="vlist"></div>`;
        const vl = g.querySelector(".vlist");
        byKey[key].forEach(v => vl.appendChild(videoRow(v)));
        wrap.appendChild(g);
      });
    }
    const 남음 = list.length - 보일것.length;
    $("histMore").style.display = 남음 > 0 ? "" : "none";
    $("histMore").textContent = `더 보기 (${남음}개 남음)`;
    $("histSelAll").checked = false;
    updateSelCount();
  }

  /** 격자 한 칸 — 그림으로 훑고, 눌러서 재생한다 */
  function videoCard(v) {
    const d = document.createElement("div");
    d.className = "vitem";
    d.style.cssText = "flex-direction:column; align-items:stretch; gap:5px; padding:8px; cursor:pointer";
    const 주 = 주인표[v.filename];
    d.innerHTML = `
      <div style="position:relative; height:110px; border-radius:8px; overflow:hidden; background:#231f2b">
        <img loading="lazy" src="${thumbUrl(v)}"
             style="width:100%; height:100%; object-fit:cover"
             onerror="this.style.visibility='hidden'">
        <input type="checkbox" class="vsel" data-file="${escapeHtml(v.filename)}"
               ${v.locked ? "disabled" : ""} title="고르기"
               style="position:absolute; left:6px; top:6px; width:auto; margin:0">
        ${v.duration ? `<span style="position:absolute; right:5px; bottom:5px; font-size:10px;
          background:rgba(0,0,0,.6); padding:1px 5px; border-radius:4px">${fmtDuration(v.duration)}</span>` : ""}
        <button type="button" class="gdl" title="이 기기로 내려받기"
          style="position:absolute; right:5px; top:5px; padding:2px 7px; font-size:12px;
                 border:none; border-radius:6px; background:rgba(0,0,0,.62); color:#e8e2d8;
                 cursor:pointer">⬇</button>
      </div>
      <span style="font-size:12px; word-break:break-all">${v.locked ? "🔒 " : ""}${escapeHtml(v.filename)}</span>
      <span class="hint" style="font-size:11px">${v.date} · ${(v.size / 1048576).toFixed(1)}MB</span>
      ${주 ? `<span class="hint vowner" style="font-size:11px; color:var(--accent,#6c8cff); cursor:pointer"
        title="작업실에서 이 프로젝트 열기">📁 ${escapeHtml(주.project)}${
          주.story ? " › " + escapeHtml(주.story) : ""}</span>` : ""}`;
    d.addEventListener("click", ev => {
      if (ev.target.classList.contains("vsel") || ev.target.classList.contains("vowner")
          || ev.target.classList.contains("gdl")) return;
      playInline(v, d);
    });
    d.querySelector(".gdl").addEventListener("click", ev => {
      ev.stopPropagation();
      내려받기(v.filename);
      histStatus(`⬇ "${v.filename}" 를 내려받습니다.`, "ok");
    });
    d.querySelector(".vsel")?.addEventListener("change", updateSelCount);
    d.querySelector(".vowner")?.addEventListener("click", ev => { ev.stopPropagation(); 주인에게가기(주); });
    return d;
  }

  async function 주인에게가기(주) {
    if (!주) return;
    document.querySelector('nav#tabs [data-tab="homeTab"]')?.click();
    if (window.ensureTab) await window.ensureTab("homeTab");
    for (let i = 0; i < 15; i++) {
      if (window.Workshop?.프로젝트열기) { window.Workshop.프로젝트열기(주.id); return; }
      await new Promise(r => setTimeout(r, 150));
    }
  }

  /* ---- 현재 필터 목록에서 일괄 선택 → 한 번에 삭제 ---- */
  function selectedFiles() {
    return [...document.querySelectorAll("#histList .vsel:checked")].map(c => c.dataset.file);
  }
  function updateSelCount() {
    const n = selectedFiles().length;
    $("histSelCount").textContent = n ? `${n}개 선택됨` : "선택 없음";
    $("histDelSel").disabled = !n;
    $("histDlSel").disabled = !n;
  }

  /* 여러 편을 zip 하나로 — 한 편씩 누르는 것이 일이 되지 않게 */
  $("histDlSel").addEventListener("click", async () => {
    const files = selectedFiles();
    if (!files.length) return;
    const btn = $("histDlSel");
    btn.disabled = true;
    try {
      const 바이트 = await busy.감싸기(`⬇ ${files.length}개를 묶는 중`,
        () => 여러개내려받기(files, "심심공작소_영상"),
        { 안내: "영상이 크면 조금 걸립니다." });
      histStatus(`⬇ ${files.length}개를 zip 으로 내려받았습니다 (${(바이트 / 1048576).toFixed(1)}MB).`, "ok");
    } catch (e) {
      histStatus("⚠ " + e.message, "err");
    }
    btn.disabled = false;
  });
  $("histList").addEventListener("change", e => {
    if (e.target.classList.contains("vsel")) updateSelCount();
  });
  $("histSelAll").addEventListener("change", e => {
    document.querySelectorAll("#histList .vsel:not([disabled])")
      .forEach(c => { c.checked = e.target.checked; });
    updateSelCount();
  });
  $("histDelSel").addEventListener("click", async () => {
    const files = selectedFiles();
    if (!files.length) return;
    if (!confirm(`선택한 ${files.length}개 영상을 휴지통(_trash)으로 옮길까요?\n(복구 가능합니다)`)) return;
    const btn = $("histDelSel");
    btn.disabled = true;
    histStatus(`${files.length}개 삭제 중…`);
    try {
      const d = await (await fetch("/api/videos/delete_many", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ filenames: files })
      })).json();
      if (d.error) throw new Error(d.error);
      const skip = (d.skipped || []).length;
      histStatus(`🗑 ${d.moved.length}개를 휴지통으로 옮겼어요` +
                 (skip ? ` (${skip}개는 건너뜀: ${d.skipped.map(s => s.reason).join(", ")})` : ""), "ok");
      await refreshVideos();
    } catch (e) { histStatus("삭제 실패: " + e.message, "err"); }
    btn.disabled = false;
  });

  /* ---- 히스토리 하위 탭 (동영상 / 뮤직비주얼) ---- */
  document.querySelectorAll("#histSubtabs .subtab").forEach(b => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#histSubtabs .subtab").forEach(x => x.classList.remove("on"));
      b.classList.add("on");
      const music = b.dataset.hist === "music";
      $("histVideoPane").style.display = music ? "none" : "block";
      $("histMusicPane").style.display = music ? "block" : "none";
      $("histHelpCard").style.display = music ? "none" : "";
      if (music) openMvHistory(); else refreshVideos();
    });
  });
  $("mvHistRefresh").addEventListener("click", openMvHistory);
  /* 뮤직비주얼 목록·재생은 app/js/tabs/music.js 가 담당한다 (필요할 때 불러옴) */
  async function openMvHistory() {
    await ensureTab("musicTab");
    if (window.MvStage) window.MvStage.loadHistory();
  }
  /* 누르면 창으로 크게 본다.
     예전에는 목록 사이에 끼워 넣어 재생했는데, 목록이 밀려 어디를 보던 중이었는지
     놓치기 일쑤였다. 창은 목록을 건드리지 않고, 크기도 골라 볼 수 있다. */
  function playInline(v) {
    // 그 아래에서 재생하던 옛 판은 걷어 둔다 (음악 입히기 등이 아직 쓴다)
    const wrap = $("histPlayerWrap");
    if (wrap) { wrap.style.display = "none"; $("histPlayer")?.pause(); }
    openPlayer({
      filename: v.filename, 제목: v.filename, date: v.date, size: v.size,
      duration: v.duration, 반복: true,
      주인: 주인표[v.filename]
        ? 주인표[v.filename].project + (주인표[v.filename].story ? " › " + 주인표[v.filename].story : "")
        : "",
    });
  }

  function fmtDuration(sec) {
    if (!sec) return null;
    const m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m ? `${m}분 ${s}초` : `${s}초`;
  }
  function thumbUrl(v) {
    return /\.(webp|gif)$/i.test(v.filename)
      ? `/api/view?filename=${encodeURIComponent(v.filename)}&subfolder=video&type=output`
      : "/api/videos/thumb/" + encodeURIComponent(v.filename);
  }
  /* 이 영상이 어느 프로젝트 어느 편의 것인지 (작업실과 이어 주려고) */
  let 주인표 = {};
  async function 주인읽기() {
    try { 주인표 = (await (await fetch("/api/project/video/owners")).json()).owners || {}; }
    catch { 주인표 = {}; }
  }

  function videoRow(v) {
    const d = document.createElement("div");
    d.className = "vitem";
    const sizeMB = (v.size / 1048576).toFixed(1);
    const groups = allGroups();
    const extra = [fmtDuration(v.duration) ? "⏱ " + fmtDuration(v.duration) : null,
                   v.workload ? "연산량 " + v.workload + "M" : null].filter(Boolean).join(" · ");
    d.innerHTML = `
      <input type="checkbox" class="vsel" data-file="${escapeHtml(v.filename)}" ${v.locked ? "disabled" : ""}
             title="${v.locked ? "잠긴 영상은 선택할 수 없어요" : "선택 삭제용"}">
      <img class="vthumb" loading="lazy" src="${thumbUrl(v)}" onerror="this.style.visibility='hidden'">
      <span class="vname">${v.locked ? "🔒 " : "🎬 "}${escapeHtml(v.filename)}</span>
      <span class="vinfo">${v.date} ${v.time} · ${sizeMB}MB${extra ? " · " + extra : ""}${
        주인표[v.filename] ? `<span style="display:block; color:var(--accent,#6c8cff); cursor:pointer"
          class="vowner" title="작업실에서 이 프로젝트 열기"
          >📁 ${escapeHtml(주인표[v.filename].project)}${
            주인표[v.filename].story ? " › " + escapeHtml(주인표[v.filename].story) : " (이어붙인 것)"}</span>` : ""}</span>
      <span class="vactions">
        <select class="vgroupsel">
          <option value="">미분류</option>
          ${groups.map(g => `<option value="${escapeHtml(g)}" ${v.group === g ? "selected" : ""}>${escapeHtml(g)}</option>`).join("")}
          <option value="__new">＋ 새 그룹…</option>
        </select>
        ${/\.(mp4|webm)$/i.test(v.filename) ? '<button class="ghost small vedit" title="자르기·속도·크기 등 편집">✂ 편집</button><button class="ghost small vmusic" title="배경음악 입히기">🎵 음악</button>' : ""}
        ${v.has_settings ? '<button class="ghost small vremake" title="이 영상의 설정을 스튜디오로 불러와 다시 만들기">♻ 리메이크</button>' : ""}
        <button class="lockbtn ${v.locked ? "locked" : ""}" title="잠금/해제">${v.locked ? "🔒" : "🔓"}</button>
        ${/\.(mp4|webm)$/i.test(v.filename) ? '<button class="ghost small vgif" title="움직이는 이미지(GIF)로 변환">GIF</button>' : ""}
        ${/\.(mp4|webm)$/i.test(v.filename)
          ? '<button class="ghost small vsheet" title="대표 장면 8컷을 한 장으로">🎞 컷</button>' : ""}
        <button class="ghost small vdl" title="이 기기로 다운로드">⬇ 저장</button>
        <button class="ghost small vopen" title="탐색기에서 보기">📍 위치</button>
        <button class="danger small vdel" ${v.locked ? "disabled" : ""}>삭제</button>
      </span>`;
    d.querySelector(".vname").addEventListener("click", () => playInline(v, d));
    // 마우스오버 미리보기
    d.addEventListener("mouseenter", () => {
      $("hoverPreviewImg").src = thumbUrl(v);
      $("hoverPreview").style.display = "block";
    });
    d.addEventListener("mousemove", e => {
      const hp = $("hoverPreview");
      const x = Math.min(e.clientX + 18, window.innerWidth - 340);
      const y = Math.min(e.clientY + 14, window.innerHeight - 220);
      hp.style.left = x + "px"; hp.style.top = y + "px";
    });
    d.addEventListener("mouseleave", () => { $("hoverPreview").style.display = "none"; });
    const editBtn = d.querySelector(".vedit");
    if (editBtn) editBtn.addEventListener("click", () => {
      $("editPanel").style.display = "block";
      $("editTarget").textContent = v.filename;
      $("editPanel").dataset.file = v.filename;
      playInline(v, d);
      d.insertAdjacentElement("afterend", $("editPanel"));
    });
    const musicBtn = d.querySelector(".vmusic");
    if (musicBtn) musicBtn.addEventListener("click", () => {
      $("musicPanel").style.display = "block";
      $("musicTarget").textContent = v.filename;
      $("musicPanel").dataset.file = v.filename;
      d.insertAdjacentElement("afterend", $("musicPanel"));   // 누른 항목 바로 아래
      $("musicPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    /* ♻ 리메이크 — 옛 영상의 설정을 스튜디오로 실어 보낸다.
       스튜디오를 새로 만들면서 이 다리가 끊겨 눌러도 아무 일이 없었다.
       탭을 먼저 켜고(그래야 스튜디오가 불려 창구가 생긴다) 그 다음 설정을 넘긴다. */
    const remakeBtn = d.querySelector(".vremake");
    if (remakeBtn) remakeBtn.addEventListener("click", async () => {
      document.querySelector('[data-tab="studioTab"]')?.click();
      if (window.ensureTab) await window.ensureTab("studioTab");
      for (let i = 0; i < 20 && !window.StudioTab; i++) await new Promise(r => setTimeout(r, 120));
      if (!window.StudioTab?.setSettings) {
        histStatus("⚠ 스튜디오를 열지 못했습니다.", "err");
        return;
      }
      window.StudioTab.setSettings(v.settings || {});
      window.StudioTab.setStatus(`♻ "${v.filename}" 설정을 불러왔습니다 — 고쳐서 다시 만드세요.`, "ok");
    });
    const gifBtn = d.querySelector(".vgif");
    if (gifBtn) gifBtn.addEventListener("click", async () => {
      gifBtn.disabled = true; gifBtn.textContent = "변환 중…";
      histStatus("GIF로 변환하는 중… (영상 길이에 따라 수십 초 걸릴 수 있어요)");
      try {
        const r = await fetch("/api/videos/gif", { method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ filename: v.filename }) });
        const data = await r.json();
        if (data.error) throw new Error(data.error);
        histStatus(`✅ GIF 생성 완료: ${data.gif}`, "ok");
        refreshVideos();
      } catch (e) {
        histStatus("⚠ " + e.message, "err");
        gifBtn.disabled = false; gifBtn.textContent = "GIF";
      }
    });
    d.querySelector(".vgroupsel").addEventListener("change", async e => {
      let group = e.target.value;
      if (group === "__new") {
        group = (prompt("새 그룹 이름을 입력하세요:") || "").trim();
        if (!group) { renderVideos(); return; }
      }
      await fetch("/api/videos/meta", { method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ filename: v.filename, group }) });
      histStatus(`'${v.filename}' → ${group || "미분류"}`, "ok");
      refreshVideos();
    });
    d.querySelector(".lockbtn").addEventListener("click", async () => {
      await fetch("/api/videos/meta", { method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ filename: v.filename, locked: !v.locked }) });
      histStatus(v.locked ? "잠금 해제됨" : "🔒 잠김 — 삭제로부터 보호됩니다", "ok");
      refreshVideos();
    });
    d.querySelector(".vsheet")?.addEventListener("click", () =>
      openCutSheet({ filename: v.filename, 제목: v.filename, duration: v.duration, 반복: true }));
    d.querySelector(".vdl").addEventListener("click", () => {
      내려받기(v.filename);
      histStatus(`⬇ "${v.filename}" 를 내려받습니다 (브라우저 다운로드 폴더).`, "ok");
    });
    d.querySelector(".vopen").addEventListener("click", () => {
      fetch("/api/videos/open", { method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ filename: v.filename }) });
    });
    d.querySelector(".vdel").addEventListener("click", async () => {
      if (!confirm(`'${v.filename}'을(를) 삭제할까요?\n(_trash 폴더로 이동하며 복구 가능합니다)`)) return;
      const r = await fetch("/api/videos/delete", { method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ filename: v.filename }) });
      const data = await r.json();
      if (data.error) { histStatus("⚠ " + data.error, "err"); return; }
      histStatus("휴지통(_trash)으로 이동했어요.", "ok");
      refreshVideos();
    });
    const 주인 = 주인표[v.filename];
    if (주인) d.querySelector(".vowner")?.addEventListener("click", ev => {
      ev.stopPropagation(); 주인에게가기(주인);
    });
    return d;
  }
  /* 음악 입히기 */
  let musicAudio = null;
  $("musicPickBtn").addEventListener("click", () => $("musicFile").click());
  $("musicFile").addEventListener("change", async () => {
    const f = $("musicFile").files[0];
    if (!f) return;
    $("musicInfo").textContent = "업로드 중…";
    try {
      const fd = new FormData();
      fd.append("audio", f);
      const r = await fetch("/api/upload_audio", { method: "POST", body: fd });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      musicAudio = data.name;
      $("musicInfo").textContent = `♪ ${data.name} (${data.duration}초)`;
      $("musicEnd").value = data.duration;
    } catch (e) { musicAudio = null; $("musicInfo").textContent = "⚠ " + e.message; }
    $("musicFile").value = "";
  });
  $("musicRange").addEventListener("change", () => {
    const part = $("musicRange").value === "part";
    $("musicPartWrap").style.display = part ? "block" : "none";
    $("musicPartWrap2").style.display = part ? "block" : "none";
  });
  $("musicCloseBtn").addEventListener("click", () => { $("musicPanel").style.display = "none"; });
  $("musicApplyBtn").addEventListener("click", async () => {
    const file = $("musicPanel").dataset.file;
    if (!file) return;
    if (!musicAudio) { histStatus("먼저 음악 파일을 선택하세요.", "err"); return; }
    const part = $("musicRange").value === "part";
    $("musicApplyBtn").disabled = true;
    histStatus("🎵 음악 입히는 중… (영상 길이에 따라 수십 초)");
    try {
      const r = await fetch("/api/videos/add_audio", { method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          filename: file, audio: musicAudio,
          mode: $("musicMode").value,
          audio_start: part ? (parseFloat($("musicStart").value) || 0) : 0,
          audio_end: part ? (parseFloat($("musicEnd").value) || 0) : 0,
        }) });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      histStatus(`✅ 음악 입힌 새 파일: ${data.filename}`, "ok");
      $("histPlayerWrap").style.display = "block";
      $("histPlayerImg").style.display = "none";
      $("histPlayer").style.display = "block";
      $("histPlayer").src = `/api/view?filename=${encodeURIComponent(data.filename)}&subfolder=video&type=output`;
      $("histPlayer").play().catch(() => {});
      refreshVideos();
    } catch (e) { histStatus("⚠ " + e.message, "err"); }
    $("musicApplyBtn").disabled = false;
  });

  $("editCloseBtn").addEventListener("click", () => { $("editPanel").style.display = "none"; });
  $("editApplyBtn").addEventListener("click", async () => {
    const file = $("editPanel").dataset.file;
    if (!file) return;
    $("editApplyBtn").disabled = true;
    histStatus("✂ 편집 적용 중… (영상 길이에 따라 수십 초)");
    try {
      const r = await fetch("/api/videos/edit", { method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          filename: file,
          trim_start: parseFloat($("editStart").value) || 0,
          trim_end: parseFloat($("editEnd").value) || 0,
          speed: parseFloat($("editSpeed").value) || 1,
          scale: parseFloat($("editScale").value) || 1,
          stabilize: parseInt($("editStab").value) || 0,
          frame_hold: parseInt($("editHold").value) || 1,
        }) });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      histStatus(`✅ 편집본 저장: ${data.filename}`, "ok");
      $("histPlayer").src = `/api/view?filename=${encodeURIComponent(data.filename)}&subfolder=video&type=output`;
      $("histPlayer").play().catch(() => {});
      refreshVideos();
    } catch (e) { histStatus("⚠ " + e.message, "err"); }
    $("editApplyBtn").disabled = false;
  });
  /* 찾기·정렬·거르기·보기 — 바꾸면 처음부터 다시 센다 */
  const 다시세기 = () => { 보인수 = 한뭉치; renderVideos(); };
  let 찾기타이머 = null;
  $("histFind").addEventListener("input", () => {
    clearTimeout(찾기타이머);
    찾기타이머 = setTimeout(다시세기, 200);
  });
  $("histSort").addEventListener("change", 다시세기);
  $("histProject").addEventListener("change", 다시세기);
  $("histMore").addEventListener("click", () => { 보인수 += 한뭉치; renderVideos(); });
  $("histView").addEventListener("click", () => {
    격자 = !격자;
    localStorage.setItem("hist보기", 격자 ? "격자" : "줄");
    다시세기();
  });
  $("histRefreshBtn").addEventListener("click", refreshVideos);
  $("histOpenDirBtn").addEventListener("click", () => {
    fetch("/api/videos/open", { method: "POST", headers: {"Content-Type": "application/json"}, body: "{}" });
  });
  $("histGroupFilter").addEventListener("change", 다시세기);

  /* 🧹 주인 없는 것 정리 — 시험하며 나온 영상이 쌓여 목록을 덮는다.
     지우기 전에 **무엇을 잃는지** 보여 주고, 잠긴 것은 건드리지 않는다.
     휴지통(_trash)으로 옮기는 것이라 되살릴 수 있다. */
  $("histTidy").addEventListener("click", () => {
    const 주인없는것 = videosCache.filter(v => !주인표[v.filename]);
    const 지울것 = 주인없는것.filter(v => !v.locked);
    const 잠긴것 = 주인없는것.length - 지울것.length;
    const 크기 = 지울것.reduce((a, b) => a + (b.size || 0), 0) / 1048576;

    if (!지울것.length) {
      histStatus(주인없는것.length ? "주인 없는 것이 모두 잠겨 있습니다." : "정리할 것이 없습니다.", "ok");
      return;
    }
    const 창 = openModal({
      제목: "🧹 주인 없는 영상 정리",
      너비: "min(720px, 94vw)",
      안내: "어느 프로젝트도 쓰지 않는 영상입니다. " +
            "<b>휴지통(_trash)으로 옮기므로 되살릴 수 있습니다.</b>",
      내용: `<div style="font-size:14px; line-height:2; margin-bottom:10px">
          정리할 것 <b style="color:var(--warn,#ffcf6c)">${지울것.length}개</b>
          · ${크기.toFixed(0)}MB 를 비웁니다
          ${잠긴것 ? `<br><span class="hint">🔒 잠긴 ${잠긴것}개는 그대로 둡니다</span>` : ""}
          <br><span class="hint">프로젝트가 쓰는 ${videosCache.length - 주인없는것.length}개는 손대지 않습니다</span>
        </div>
        <div class="vlist" style="max-height:300px; overflow-y:auto">${지울것.slice(0, 200).map(v =>
          `<div class="vitem" style="padding:3px 8px; font-size:12px">
             <span class="vname">🎬 ${escapeHtml(v.filename)}</span>
             <span class="vinfo" style="width:150px">${v.date} · ${(v.size / 1048576).toFixed(1)}MB</span>
           </div>`).join("")}</div>`,
      단추: [{ 글: `🗑 ${지울것.length}개 정리하기`, 강조: true, 할일: async 창 => {
        창.닫기();
        try {
          const r = await busy.감싸기(`🧹 ${지울것.length}개를 휴지통으로`, async () =>
            (await (await fetch("/api/videos/delete_many", { method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filenames: 지울것.map(v => v.filename) }) })).json()));
          if (r.error) throw new Error(r.error);
          histStatus(`🧹 ${(r.moved || []).length}개를 휴지통으로 옮겼습니다 (${크기.toFixed(0)}MB).`, "ok");
          refreshVideos();
        } catch (e) { histStatus("⚠ " + e.message, "err"); }
      } }],
    });
  });
  // 스튜디오와 연결되는 부분 (리메이크 등)
  window.HistoryTab = { refresh: refreshVideos };
}
