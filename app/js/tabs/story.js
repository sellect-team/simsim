/* 📜 스토리 탭 — 대본을 쓰면 그대로 영상이 된다.
   화면은 app/views/story.html.
   대본 글이 유일한 원본이고 미리보기·컷 목록은 그 위의 얇은 뷰다.
   무거운 것(캐릭터 그물망·배경 그림)은 자산 창고가 한 번만 만들어 재사용한다. */
import { $, escapeHtml, statusBox } from "../core.js";
import { StoryDoc } from "../story/doc.js";
import { library } from "../story/assets.js";
import { BakeQueue } from "../story/queue.js";
import { videoSize } from "../story/render.js";
import { loadPrefabs } from "../story/prefabs.js";
import { openPlayer, 내려받기 } from "../ui/player.js";
import { loadFonts } from "../story/subtitle.js";

const 기본대본 = `제목: 첫 이야기
비율: 9:16
음악프롬프트: warm acoustic ukulele, cozy, gentle 90bpm, children's storybook
음악분위기: 포근하고 느긋한

장면 배경1   전환:페이드
  주인공 등장 왼쪽 크기:0.7 표정:blink 동작:breathe
  카메라 줌인 2.5초 세기:1.2
  자막 "안녕하세요"   효과:반짝임
  주인공 이동 가운데 1.5초
  주인공 표정 happy
  자막 "오늘은 무슨 일이 있었냐면요"
`;

export async function mount() {
  const st = statusBox($("stStatus"));
  const canvas = $("stCanvas"), ctx = canvas.getContext("2d");

  // 조각(대본 토막) 표를 미리 읽어 둔다 — 글을 칠 때마다 서버에 묻지 않으려고
  loadPrefabs(true).catch(() => {});

  /* 화면 상태 — 대본 한 편(StoryDoc)과 굽기 줄(BakeQueue)을 들고 있다 */
  const S = { doc: new StoryDoc(기본대본), playing: false, t: 0, t0: 0, raf: null,
              docs: [], queue: null, busy: false };
  window.StoryTab = S;

  S.queue = new BakeQueue({ onChange: renderQueue });

  /* ── 대본 → 무대 (자산은 창고에서 꺼내 쓰므로 다시 만들지 않는다) ── */
  let timer = null, pending = false;
  async function rebuild(quiet) {
    if (S.busy) { pending = true; return; }
    S.busy = true;
    try {
      S.doc.setText($("stText").value);
      $("stErr").textContent = S.doc.errors.length
        ? S.doc.errors.map(e => `${e.line}줄: ${e.msg}`).join("   /   ") : "";
      await S.doc.build(library);
      const miss = S.doc.missingWithPrompts();
      $("stInfo").textContent =
        `${S.doc.sceneCount}장면 · ${S.doc.seconds.toFixed(1)}초` +
        (miss.length ? ` · ⚠ 없는 그림 ${miss.length}개` : " · 그림 다 있음");
      if (!S.t) S.t = Math.min(0.8, S.doc.seconds * 0.18);   // 0초는 등장 전이라 안 보인다
      syncSeek();
      renderShots();
      draw();
      if (!quiet && miss.length)
        st(`⚠ ${miss.map(m => `${m.종류} '${m.이름}'`).join(", ")} — [📦 필요한 그림]을 누르세요`, "err");
    } catch (e) {
      st("⚠ " + e.message, "err");
    } finally {
      S.busy = false;
      if (pending) { pending = false; rebuild(true); }
    }
  }
  const rebuildSoon = () => { clearTimeout(timer); timer = setTimeout(() => rebuild(true), 400); };
  const syncSeek = () => { $("stSeek").value = S.doc.seconds ? S.t / S.doc.seconds * 1000 : 0; };

  /* ── 컷 목록 ── */
  function renderShots() {
    const box = $("stShots");
    box.innerHTML = "";
    const stage = S.doc.stage;
    if (!stage) return;
    const 있는배경 = stage.assets.배경 || {};
    stage.scenes.forEach(sc => {
      sc.subtitles.forEach(sub => {
        const at = sc.start + sub.t0;
        const d = document.createElement("div");
        d.className = "vitem";
        d.style.cursor = "pointer";
        d.innerHTML = `<span class="vname">${at.toFixed(1)}초</span>
          <span class="vinfo">${escapeHtml(sub.text)}</span>
          <span class="vactions"><span class="hint">${있는배경[sc.bg] ? "" : "⚠ "}${escapeHtml(sc.bg || "-")}</span></span>`;
        d.addEventListener("click", () => {
          S.playing = false; S.t = at + 0.15; syncSeek(); draw();
        });
        box.appendChild(d);
      });
    });
  }

  /* ── 그리기 ──
     미리보기 칸은 **굽는 영상과 똑같은 비율**로 맞춘다.
     (예전에는 칸이 늘 가로로 넓어서, 세로 영상인데도 옆으로 퍼져 보였다) */
  const MAX_H = 460;                     // 화면에서 차지할 최대 높이
  function fit() {
    const { 가로: VW, 세로: VH, 이름 } = videoSize(S.doc.stage, { 세로: 1280 });
    const 칸 = $("stStage"), 바깥 = 칸.parentElement;
    const 여유 = Math.max(160, (바깥.clientWidth || 320) - 2);
    let w = 여유, h = w * VH / VW;
    if (h > MAX_H) { h = MAX_H; w = h * VW / VH; }   // 넣어 맞추기 (잘리지 않게)
    칸.style.width = Math.round(w) + "px";
    칸.style.height = Math.round(h) + "px";
    // 화면 밀도만큼 촘촘히 그려 흐릿하지 않게 (영상 해상도를 넘지는 않는다)
    const dpr = Math.min(window.devicePixelRatio || 1, VW / w, 2.5);
    canvas.width = Math.max(120, Math.round(w * dpr));
    canvas.height = Math.max(120, Math.round(h * dpr));
    const 라벨 = $("stSize");
    if (라벨) 라벨.textContent = `${VW}×${VH} · ${이름}`;
  }
  let 마지막비율 = "";
  function draw() {
    // 대본에서 `비율` 을 바꾸면 미리보기 칸도 곧바로 따라간다
    const 지금비율 = videoSize(S.doc.stage, { 세로: 1280 }).이름;
    if (!canvas.width || 지금비율 !== 마지막비율) { 마지막비율 = 지금비율; fit(); }
    ctx.fillStyle = "#0f0d14";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const stage = S.doc.stage;
    if (!stage || !stage.scenes.length) return;
    stage.drawAt(ctx, { x: 0, y: 0, w: canvas.width, h: canvas.height }, S.t);
    $("stTime").textContent = `${S.t.toFixed(1)} / ${S.doc.seconds.toFixed(1)}초`;
  }
  addEventListener("resize", () => { fit(); draw(); });

  function loop(now) {
    S.raf = requestAnimationFrame(loop);
    if (!S.playing || !S.doc.seconds) return;
    S.t = (now - S.t0) / 1000;
    if (S.t >= S.doc.seconds) { S.t = 0; S.t0 = now; }
    syncSeek();
    draw();
  }
  $("stPlay").addEventListener("click", () => {
    if (!S.doc.stage) return;
    S.playing = true; S.t0 = performance.now() - S.t * 1000;
    if (!S.raf) loop(performance.now());
  });
  $("stStop").addEventListener("click", () => { S.playing = false; draw(); });
  $("stSeek").addEventListener("input", e => {
    S.playing = false;
    S.t = e.target.value / 1000 * (S.doc.seconds || 1);
    draw();
  });
  $("stText").addEventListener("input", rebuildSoon);

  /* ── 음악 프롬프트 ── */
  $("stMusic").addEventListener("click", async () => {
    const m = S.doc.music;
    if (!m.suno.trim()) { st("대본 맨 위에 '음악프롬프트: …' 를 적어 주세요.", "err"); return; }
    try { await navigator.clipboard.writeText(m.suno); st("🎵 복사했습니다 → Suno에 붙여넣기\n" + m.suno, "ok"); }
    catch { st("복사가 막혀 있습니다. 직접 쓰세요:\n" + m.suno); }
  });

  /* ── 필요한 그림 ── */
  $("stAssets").addEventListener("click", async () => {
    const miss = S.doc.missingWithPrompts();
    if (!miss.length) { st("필요한 그림이 다 있습니다. 바로 구우셔도 됩니다.", "ok"); return; }
    const text = miss.map(m => `[${m.종류}] ${m.이름}\n${m.프롬프트}`).join("\n\n");
    try { await navigator.clipboard.writeText(text); } catch {}
    st(`📦 ${miss.length}개 부족 — 프롬프트를 복사했습니다.\n${text}`, "err");
  });

  /* ── 저장·불러오기 ── */
  async function refreshDocs() {
    try {
      const d = await (await fetch("/api/project/list")).json();
      S.docs = d.items || [];
      const cur = $("stDoc").value;
      $("stDoc").innerHTML = '<option value="">새 대본</option>' +
        S.docs.map(x => `<option value="${x.id}">${escapeHtml(x.name)}</option>`).join("");
      $("stDoc").value = cur;
      renderQueuePicker();
    } catch {}
  }
  /** 지금 화면을 그대로 작은 그림으로 (작업실 카드에 쓴다) */
  function thumbNow() {
    try {
      const t = document.createElement("canvas");
      const { 가로, 세로 } = videoSize(S.doc.stage, { 세로: 320 });   // 영상과 같은 비율로
      t.width = 가로; t.height = 세로;
      const g = t.getContext("2d");
      g.fillStyle = "#0f0d14"; g.fillRect(0, 0, t.width, t.height);
      if (S.doc.stage) S.doc.stage.drawAt(g, { x: 0, y: 0, w: t.width, h: t.height },
                                          Math.min(0.8, S.doc.seconds * 0.2));
      return t.toDataURL("image/jpeg", 0.7);
    } catch { return ""; }
  }

  $("stSave").addEventListener("click", async () => {
    const name = ($("stName").value || S.doc.title).trim();
    try {
      const need = S.doc.missingWithPrompts();
      const 쓰는것 = S.doc.needs();
      const r = await (await fetch("/api/project/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: S.projectId || null, name, text: $("stText").value,
          seconds: S.doc.seconds, scenes: S.doc.sceneCount, missing: need,
          uses: { 배우: 쓰는것.배우, 배경: 쓰는것.배경 },
          music_prompt: S.doc.music.suno, thumb: thumbNow() }) })).json();
      if (r.id) S.projectId = r.id;
      st(`💾 '${name}' 저장했습니다.${need.length ? ` (그림 ${need.length}개 부족 — 작업실에서 한 번에 받으세요)` : ""}`, "ok");
      refreshDocs();
    } catch (e) { st("⚠ " + e.message, "err"); }
  });
  $("stDoc").addEventListener("change", async e => {
    const id = e.target.value;
    if (!id) { $("stText").value = 기본대본; S.t = 0; rebuild(); return; }
    try {
      const d = await (await fetch(`/api/project/get?id=${encodeURIComponent(id)}`)).json();
      const item = d.item || {};
      if (!item.text) throw new Error("대본 내용이 없습니다.");
      $("stText").value = item.text;
      $("stName").value = item.name || "";
      S.projectId = item.id;
      S.t = 0;
      rebuild();
    } catch (e2) { st("⚠ " + e2.message, "err"); }
  });

  /* ── 굽기 (한 편) ── */
  $("stBake").addEventListener("click", async () => {
    if (!S.doc.stage || !S.doc.seconds) { st("대본에 자막이 한 줄은 있어야 합니다.", "err"); return; }
    S.playing = false;
    const btn = $("stBake");
    btn.disabled = true;
    S.queue.clear().add(S.doc, { 세로: 1280, fps: 30 });
    const 일 = busy.시작(`🔥 "${S.doc.title}" 굽는 중`, {
      뒤로가능: true, 멈추기: () => S.queue.stop(), 진행: 0,
      안내: `${S.doc.seconds.toFixed(1)}초 · 대략 ${Math.max(1, Math.round(S.doc.seconds * 30 * 0.007))}초 걸립니다`,
    });
    const 옛알림 = S.queue.onProgress;
    S.queue.onProgress = p => { 일.진행(p?.percent ?? null); 옛알림?.(p); };
    try { await S.queue.run(); } finally { S.queue.onProgress = 옛알림; 일.끝(); }
    const last = S.queue.items[0];
    if (last.state === "완료") {
      st(`✅ 완성: ${last.filename} (${last.note})`, "ok");
      // 다 구우면 바로 보여 준다 — 창에서 크기를 고르고 그 자리에서 내려받는다
      openPlayer({ filename: last.filename, 제목: S.doc.title,
                   duration: S.doc.seconds, 반복: true });
    } else st(`⚠ ${last.error}`, "err");
    btn.disabled = false;
  });

  /* ── 일괄 굽기 ── */
  function renderQueuePicker() {
    const box = $("stBatchList");
    if (!box) return;
    box.innerHTML = S.docs.length
      ? S.docs.map(x => `<label class="vitem" style="cursor:pointer">
           <input type="checkbox" value="${x.id}" style="width:auto;margin:0 8px 0 0">
           <span class="vinfo">${escapeHtml(x.name)}</span></label>`).join("")
      : '<div class="hint">저장된 대본이 없습니다. 먼저 [💾 저장] 하세요.</div>';
  }
  function renderQueue() {
    const box = $("stQueue");
    if (!box) return;
    const s = S.queue.summary;
    $("stQueueInfo").textContent = S.queue.items.length
      ? `전체 ${s.전체} · 완료 ${s.완료} · 실패 ${s.실패} · 남음 ${s.대기}` : "";
    box.innerHTML = S.queue.items.map((it, i) => {
      const mark = { 대기: "⏳", 굽는중: "🎬", 완료: "✅", 실패: "⚠", 중단: "⏹" }[it.state] || "";
      // 다 구운 것은 그 자리에서 보고 내려받을 수 있어야 한다 — 히스토리까지 찾아가지 않게
      const 끝난것 = it.state === "완료" && it.filename;
      return `<div class="vitem"><span class="vname">${mark} ${escapeHtml(it.doc.title)}</span>
        <span class="vinfo">${escapeHtml(it.note || it.state)}</span>
        ${끝난것 ? `<span class="vactions">
          <button class="ghost small qPlay" type="button" data-줄="${i}">▶ 보기</button>
          <button class="ghost small qDl" type="button" data-줄="${i}">⬇ 내려받기</button>
        </span>` : ""}</div>`;
    }).join("");

    box.querySelectorAll(".qPlay").forEach(b => b.addEventListener("click", () => {
      const it = S.queue.items[+b.dataset.줄];
      openPlayer({ filename: it.filename, 제목: it.doc.title, duration: it.doc.seconds, 반복: true });
    }));
    box.querySelectorAll(".qDl").forEach(b => b.addEventListener("click", () => {
      const it = S.queue.items[+b.dataset.줄];
      내려받기(it.filename, it.doc.title);      // 기계가 지은 파일 이름 대신 대본 제목으로
      st(`⬇ "${it.doc.title}" 를 내려받습니다.`, "ok");
    }));
  }
  $("stBatchRun")?.addEventListener("click", async () => {
    const ids = [...document.querySelectorAll("#stBatchList input:checked")].map(x => x.value);
    if (!ids.length) { st("구울 대본을 고르세요.", "err"); return; }
    S.queue.clear();
    for (const id of ids) {
      try {
        const d = await (await fetch(`/api/project/get?id=${encodeURIComponent(id)}`)).json();
        if (d.item?.text) S.queue.add(new StoryDoc(d.item.text, d.item.name));
      } catch {}
    }
    st(`🌙 ${S.queue.items.length}편을 차례로 굽습니다. 이 탭을 열어 두세요.`);
    await S.queue.run();
    const s = S.queue.summary;
    st(`끝났습니다 — 완료 ${s.완료}편, 실패 ${s.실패}편`, s.실패 ? "err" : "ok");
  });
  $("stBatchStop")?.addEventListener("click", () => { S.queue.stop(); st("다음 편부터 멈춥니다."); });

  /* ── 시작 ── */
  await loadFonts();          // 자막 글꼴 — 다 실은 뒤에 그려야 첫 장이 안 어긋난다
  await library.refresh(true);
  await refreshDocs();
  // 작업실에서 카드를 눌러 들어온 경우 그 이야기를 연다
  const 요청 = sessionStorage.getItem("열_프로젝트");
  sessionStorage.removeItem("열_프로젝트");
  if (요청 && 요청 !== "새로") {
    $("stDoc").value = 요청;
    $("stDoc").dispatchEvent(new Event("change"));
    return;
  }
  // 첫 대본이 바로 보이도록 실제 가진 자산 이름으로 바꿔 준다
  let text = 기본대본;
  if (library.characters[0]) text = text.replaceAll("주인공", library.characters[0].name);
  if (library.backgrounds[0]) text = text.replaceAll("배경1", library.backgrounds[0].name);
  $("stText").value = text;
  fit();
  await rebuild(true);
}
