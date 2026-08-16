/* 🔥 굽기 단계 — 비율·해상도·초당장수·화질을 정하고 영상으로 뽑는다.
 *
 * 두 가지로 뽑는다. 같은 재료로 둘 다 나온다.
 *   각각    — 편마다 한 개씩 (쇼츠·릴스용)
 *   이어서  — 전부 이어 붙여 한 개 (20~30분 긴 영상용)
 */
import { escapeHtml } from "../core.js";
import { StoryDoc } from "../story/doc.js";
import { library } from "../story/assets.js";
import { bakeVideo, waitJob, videoSize } from "../story/render.js";
import { 상태색 } from "../tabs/home.js";
import { openPlayer, 내려받기, 여러개내려받기 } from "../ui/player.js";
import { busy } from "../ui/busy.js";
import { openModal } from "../ui/modal.js";
import { openCutSheet, 시트미리만들기 } from "../ui/cutsheet.js";
import { preflight, 등급표, 막힘, 놓침있나 } from "../story/preflight.js";

const 화질표 = { "가볍게": 0.55, "보통": 0.75, "좋게": 0.9 };

export function mountBakeStep(el, S, { st, 보내기, refresh }) {
  const stories = S.열린것?.stories || [];
  const 순서 = (S.열린것?.timeline?.순서 || []).filter(sid => stories.some(s => s.sid === sid));
  const 줄 = (순서.length ? 순서.map(sid => stories.find(s => s.sid === sid)) : stories).filter(Boolean);
  const e = S.열린것?.encode || {};
  const 비율 = e.비율 || "9:16", 긴변 = e.긴변 || 1280, fps = e.fps || 30, 화질 = e.화질 || "보통";
  const 크기 = videoSize(null, { 비율, 긴변 });
  const 총초 = 줄.reduce((a, b) => a + (b.seconds || 0), 0);
  const 예상 = Math.round(총초 * fps * 0.007);

  el.innerHTML = `
    <div class="grid" style="margin-top:12px">
      <div><label>비율</label>
        <select id="bkRatio">${["9:16", "16:9", "1:1", "4:5"].map(r =>
          `<option ${r === 비율 ? "selected" : ""}>${r}</option>`).join("")}</select></div>
      <div><label>해상도 <span class="hint">(긴 변)</span></label>
        <select id="bkSize">${[720, 1080, 1280, 1920].map(n =>
          `<option value="${n}" ${n === 긴변 ? "selected" : ""}>${n}px</option>`).join("")}</select></div>
      <div><label>초당 장수</label>
        <select id="bkFps">${[24, 30, 60].map(n =>
          `<option value="${n}" ${n === fps ? "selected" : ""}>${n}fps</option>`).join("")}</select></div>
      <div><label>화질</label>
        <select id="bkQ">${Object.keys(화질표).map(q =>
          `<option ${q === 화질 ? "selected" : ""}>${q}</option>`).join("")}</select></div>
    </div>
    <div class="hint" id="bkCalc" style="margin-top:6px"></div>

    <div class="charRow" style="margin-top:12px">
      <button id="bkEach">🎬 각각 굽기 <span class="hint">(편마다 한 개)</span></button>
      <button id="bkJoin">🎞 이어서 한 편으로</button>
      <button class="ghost" id="bkBoth" type="button">둘 다</button>
      <button class="ghost small" id="bkSave" type="button">설정만 저장</button>
      <button class="ghost small danger" id="bkStop" type="button">⏹ 멈추기</button>
    </div>

    <!-- 골라 굽기 — 한 편만 손보고 다시 구울 때 전체를 다시 구울 까닭이 없다 -->
    <div class="charRow" style="align-items:center; gap:8px; margin-top:10px; padding:8px 10px;
         background:#1a1822; border-radius:10px">
      <label style="display:flex; align-items:center; gap:6px; margin:0; cursor:pointer; font-size:12px">
        <input type="checkbox" id="bkSelAll" style="width:auto; margin:0"> 전체 고르기
      </label>
      <span class="hint" id="bkSelInfo">고른 것 없음 (전체가 대상)</span>
      <span style="flex:1"></span>
      <button class="ghost small" id="bkSelBake" type="button" disabled>🔥 고른 것만 굽기</button>
      <button class="ghost small" id="bkSelDl" type="button" disabled
              title="고른 편의 구운 영상을 zip 하나로">⬇ 고른 것 내려받기</button>
    </div>

    <div id="bkList" class="vlist" style="margin-top:10px; max-height:330px; overflow-y:auto"></div>
    <div class="hint" id="bkInfo" style="margin-top:8px; white-space:pre-wrap"></div>`;

  const $$ = id => el.querySelector("#" + id);
  let 멈춤 = false;

  function 셈() {
    const c = videoSize(null, { 비율: $$("bkRatio").value, 긴변: +$$("bkSize").value });
    const f = +$$("bkFps").value;
    $$("bkCalc").textContent =
      `${c.가로}×${c.세로} · ${f}fps · 이 프로젝트 ${줄.length}편 ${Math.floor(총초 / 60)}분 ` +
      `${Math.round(총초 % 60)}초 → 굽는 데 대략 ${Math.max(1, Math.round(총초 * f * 0.007))}초`;
  }
  ["bkRatio", "bkSize", "bkFps"].forEach(id => $$(id).addEventListener("change", 셈));
  셈();

  /** 마지막으로 구운 파일 — 있으면 그 자리에서 보고 내려받는다 */
  const 구운것 = s => (s.videos || [])[(s.videos || []).length - 1] || null;

  function 목록그리기(표시 = {}) {
    $$("bkList").innerHTML = 줄.map(s => {
      const c = 상태색[s.state] || 상태색["빈대본"];
      const 파일 = 구운것(s);
      const 굽는중 = /굽는 중/.test(표시[s.sid] || "");
      return `<div class="vitem" style="gap:8px">
        <input type="checkbox" class="bkSel" data-sid="${s.sid}" style="width:auto; margin:0"
               title="고른 편만 굽습니다">
        <span class="vname">${escapeHtml(s.name)}
          <span class="hint" style="display:block; color:${c.c}">${c.i} ${c.ko}
            · ${(s.seconds || 0).toFixed(1)}초</span></span>
        <span class="vinfo" style="flex:1">${표시[s.sid] || (파일
          ? "✅ " + escapeHtml(파일) : "아직 안 구움")}</span>
        <span class="vactions">
          <button class="ghost small bkOne" type="button" data-sid="${s.sid}"
                  ${굽는중 ? "disabled" : ""} title="이 편만 굽습니다">🔥 굽기</button>
          ${파일 ? `<button class="ghost small bkPlay" type="button" data-sid="${s.sid}">▶ 보기</button>
            <button class="ghost small bkSheet" type="button" data-sid="${s.sid}"
                    title="대표 장면 8컷을 한 장으로 — 잘 나왔는지 한눈에">🎞 컷 보기</button>
            <button class="ghost small bkDl" type="button" data-sid="${s.sid}">⬇ 내려받기</button>` : ""}
        </span>
      </div>`;
    }).join("") || '<div class="hint">이야기가 없습니다.</div>';

    const 찾기 = sid => 줄.find(s => s.sid === sid);
    $$("bkList").querySelectorAll(".bkOne").forEach(b =>
      b.addEventListener("click", () => 고른것굽기([찾기(b.dataset.sid)])));
    $$("bkList").querySelectorAll(".bkPlay").forEach(b => b.addEventListener("click", () => {
      const s = 찾기(b.dataset.sid);
      openPlayer({ filename: 구운것(s), 제목: s.name, duration: s.seconds, 반복: true });
    }));
    $$("bkList").querySelectorAll(".bkSheet").forEach(b => b.addEventListener("click", () => {
      const s = 찾기(b.dataset.sid);
      openCutSheet({ filename: 구운것(s), 제목: s.name, duration: s.seconds, 반복: true });
    }));
    $$("bkList").querySelectorAll(".bkDl").forEach(b => b.addEventListener("click", () => {
      const s = 찾기(b.dataset.sid);
      내려받기(구운것(s), s.name);              // 기계가 지은 파일 이름 대신 편 이름으로
      st(`⬇ "${s.name}" 를 내려받습니다.`, "ok");
    }));
    $$("bkList").querySelectorAll(".bkSel").forEach(c =>
      c.addEventListener("change", 고른수보이기));
    고른수보이기();
  }

  const 고른편 = () => [...$$("bkList").querySelectorAll(".bkSel:checked")]
    .map(c => 줄.find(s => s.sid === c.dataset.sid)).filter(Boolean);

  function 고른수보이기() {
    const n = 고른편().length;
    $$("bkSelInfo").textContent = n ? `${n}편 고름` : "고른 것 없음 (전체가 대상)";
    $$("bkSelBake").disabled = !n;
    $$("bkSelDl").disabled = !고른편().some(구운것);
  }
  목록그리기();

  async function 설정저장() {
    return 보내기("/api/project/save", {
      id: S.열린것.id,
      encode: { 비율: $$("bkRatio").value, 긴변: +$$("bkSize").value,
                fps: +$$("bkFps").value, 화질: $$("bkQ").value },
    });
  }
  $$("bkSave").addEventListener("click", async () => {
    if (await 설정저장()) { st("굽기 설정을 저장했습니다.", "ok"); await refresh(); }
  });
  $$("bkStop").addEventListener("click", () => { 멈춤 = true; st("멈추는 중…"); });

  /** 한 편 굽기 → 파일 이름. 진행률은 목록과 덮개 양쪽에 알린다. */
  async function 한편굽기(s, 표시, 알리기 = null) {
    const d = await (await fetch(`/api/project/story?id=${S.열린것.id}&sid=${s.sid}`)).json();
    const doc = new StoryDoc(d.story?.text || "", s.name);
    await doc.build(library);
    if (!doc.sceneCount) throw new Error("장면이 없습니다");
    // 프로젝트에 깔아 둔 배경 음악을 넘긴다 (대본에 따로 적었으면 그쪽이 먼저)
    const 프음악 = S.열린것?.timeline?.음악 || {};
    const r = await bakeVideo(doc.stage, {
      이름: s.name, 비율: $$("bkRatio").value, 긴변: +$$("bkSize").value,
      fps: +$$("bkFps").value, 화질: 화질표[$$("bkQ").value] || 0.75,
      음악: doc.stage?.doc?.meta?.음악 || 프음악.파일 || null,
      음악크기: 프음악.소리크기, 음악여닫이: 프음악.여닫이,
    }, p => {
      표시[s.sid] = `굽는 중 ${p.percent}%`;
      목록그리기(표시);
      알리기?.(p.percent);
    });
    const done = await waitJob(r.job);
    if (done.state !== "done") throw new Error(done.error || "굽기 실패");
    /* 서버가 '무엇을 시켰고 무엇이 붙었는지' 알려 준다.
       음악을 시켰는데 안 붙었으면 여기서 말해 준다 — 조용히 넘어가면 영영 모른다. */
    if (done.음악?.시킨것 && !done.음악?.붙었나) {
      알리기?.(100);
      st(`⚠ "${s.name}" — 음악 "${done.음악.시킨것}" 을(를) 못 찾아 소리 없이 구웠습니다.`, "err");
      표시[s.sid + "_소리"] = "🔇 음악 빠짐";
    }
    await 보내기("/api/project/story/save", {
      id: S.열린것.id, sid: s.sid,
      videos: [...(s.videos || []), done.filename],
    });
    return done.filename;
  }

  /* ── 🚦 굽기 전 점검 ──
     굽는 데 드는 시간이 아까워서가 아니라, **조용히 틀린 채로 구워지는 것**을 막으려는 것이다.
     음악 이름이 한 글자 틀리면 소리 없이 구워지고, 여러 편을 구운 뒤에야 알게 된다. */
  async function 점검하고묻기(대상) {
    const 결과 = [];
    for (const s of 대상) {
      try {
        const d = await (await fetch(
          `/api/project/story?id=${S.열린것.id}&sid=${s.sid}`)).json();
        const doc = new StoryDoc(d.story?.text || "", s.name);
        await doc.build(library);
        결과.push({ 이름: s.name, 탈: await preflight(doc, S.열린것?.timeline || {}) });
      } catch { /* 못 읽은 편은 굽기가 알아서 실패로 남긴다 */ }
    }
    const 볼것 = 결과.filter(x => x.탈.length);
    if (!볼것.length) return true;                       // 아무 말 없으면 그냥 굽는다
    const 막는것 = 볼것.filter(x => 막힘(x.탈));
    const 놓치는것 = 볼것.filter(x => 놓침있나(x.탈));
    // 눈치 뿐이면 굳이 멈춰 세우지 않는다 (매번 창이 뜨면 그냥 넘기게 된다)
    if (!막는것.length && !놓치는것.length) return true;

    return await new Promise(정함 => {
      const 창 = openModal({
        제목: "🚦 굽기 전 점검",
        너비: "min(760px, 96vw)",
        안내: 막는것.length
          ? `${막는것.length}편은 이대로 구우면 영상이 안 나옵니다.`
          : `${놓치는것.length}편에서 <b>시킨 것이 빠진 채</b> 구워집니다 — 영상은 나오지만 뜻대로가 아닙니다.`,
        내용: `<div class="vlist">${볼것.map(x => `
          <div style="padding:8px 10px; margin-bottom:6px; background:#171520; border-radius:8px;
               border-left:3px solid ${막힘(x.탈) ? "#ff7a7a" : 놓침있나(x.탈) ? "#ffcf6c" : "#8ab4f8"}">
            <b style="font-size:13px">${escapeHtml(x.이름)}</b>
            ${x.탈.map(t => {
              const g = 등급표[t.등급] || 등급표["눈치"];
              return `<div style="font-size:12px; color:${g.c}; margin-top:3px">
                ${g.i} ${escapeHtml(t.글)}
                ${t.고침 ? `<code style="margin-left:4px; opacity:.85">${escapeHtml(t.고침)}</code>` : ""}
              </div>`;
            }).join("")}
          </div>`).join("")}</div>`,
        단추: [
          ...(막는것.length ? [] : [{ 글: "그래도 굽기", 할일: 창 => { 창.닫기(); 정함(true); } }]),
          { 글: "고치러 가기", 강조: true, 할일: 창 => { 창.닫기(); 정함(false); 단계로("story"); } },
        ],
      });
      // 창을 그냥 닫으면 굽지 않는다 (모르고 구워지는 쪽이 더 나쁘다)
      const 옛닫기 = 창.닫기;
      창.닫기 = () => { 옛닫기(); 정함(false); };
    });
  }

  /** 다른 단계로 데려가기 (작업실이 넣어 준다) */
  const 단계로 = 이름 => document.querySelector(`[data-step="${이름}"]`)?.click();

  /** 고른 편만 차례로 굽는다 (하나만 골라도 같은 길을 탄다) */
  async function 고른것굽기(대상, 점검할까 = true) {
    대상 = (대상 || []).filter(Boolean);
    if (!대상.length) { st("구울 편을 고르세요.", "err"); return 0; }
    if (점검할까 && !(await 점검하고묻기(대상))) { st("굽기를 멈췄습니다."); return 0; }
    멈춤 = false;
    await 설정저장();
    const 표시 = {};
    let 됨 = 0, 마지막 = null;

    /* 굽는 동안 화면을 덮는다 — 아무 표시가 없으면 멈춘 줄 알고 다시 누르게 되고,
       그러면 같은 일이 두 번 돌아 오히려 느려진다. [뒤에서 돌리기] 로 걷을 수 있다. */
    const 일 = busy.시작(`🔥 굽는 중 (${대상.length}편)`, {
      뒤로가능: true,
      멈추기: () => { 멈춤 = true; },
      안내: "이 탭을 닫지 마세요. 뒤에서 돌려도 됩니다.",
      진행: 0,
    });
    try {
      for (let i = 0; i < 대상.length; i++) {
        const s = 대상[i];
        if (멈춤) { st("멈췄습니다."); break; }
        일.제목바꾸기(`🔥 굽는 중 — ${s.name} (${i + 1}/${대상.length})`);
        try {
          const f = await 한편굽기(s, 표시, p => {
            // 전체에서 이 편이 차지하는 몫만큼만 채운다
            일.진행((i + (p || 0) / 100) / 대상.length * 100, `${s.name} ${p || 0}%`);
          });
          표시[s.sid] = "✅ " + f; 됨++; 마지막 = { s, f };
          s.videos = [...(s.videos || []), f];      // 다시 읽기 전에도 [보기]가 뜨게
        } catch (err) { 표시[s.sid] = "⚠ " + err.message; }
        일.진행((i + 1) / 대상.length * 100);
        목록그리기(표시);
      }
    } finally { 일.끝(); }

    $$("bkInfo").textContent = `${됨}/${대상.length}편을 구웠습니다.`;
    st(`${됨}편 완성`, 됨 ? "ok" : "err");
    // 컷 시트를 미리 만들어 둔다 — 볼 때 안 기다리게 (뒤에서 조용히 돈다)
    시트미리만들기(대상.map(구운것).filter(Boolean)).catch(() => {});
    // 한 편만 구웠으면 바로 보여 준다 — 확인하고 내려받는 데까지가 한 흐름이다
    if (됨 === 1 && 대상.length === 1 && 마지막) {
      openPlayer({ filename: 마지막.f, 제목: 마지막.s.name,
                   duration: 마지막.s.seconds, 반복: true });
    }
    await refresh();
    return 됨;
  }

  async function 각각() { return 고른것굽기(줄); }

  /** 이어서 한 편 — 안 구운 편은 먼저 굽고, 서버에서 이어 붙인다 */
  async function 이어서() {
    멈춤 = false;
    await 설정저장();
    const 표시 = {};
    const 파일 = [];
    for (const s of 줄) {
      if (멈춤) { st("멈췄습니다."); return; }
      const 있는것 = (s.videos || []);
      if (있는것.length) { 파일.push(있는것[있는것.length - 1]); 표시[s.sid] = "✅ 이미 있음"; }
      else {
        try { const f = await 한편굽기(s, 표시); 파일.push(f); 표시[s.sid] = "✅ " + f; }
        catch (err) { 표시[s.sid] = "⚠ " + err.message; }
      }
      목록그리기(표시);
    }
    if (파일.length < 2) { st("이어 붙일 영상이 두 개 이상 있어야 합니다.", "err"); return; }
    $$("bkInfo").textContent = `${파일.length}개를 이어 붙이는 중…`;
    const 잇는일 = busy.시작(`🎞 ${파일.length}편을 이어 붙이는 중`, {
      뒤로가능: true, 안내: "길수록 오래 걸립니다 (얼마나 걸릴지는 미리 알기 어렵습니다).",
    });
    try {
      const r = await (await fetch("/api/videos/concat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filenames: 파일, output: S.열린것.name,
                               transition: "crossfade", transition_frames: 10 }) })).json();
      if (r.error) throw new Error(r.error);
      잇는일.끝();
      const 이름 = r.filename || "";
      await 보내기("/api/project/save", {
        id: S.열린것.id,
        videos: [...(S.열린것.videos || []), 이름].filter(Boolean) });
      $$("bkInfo").textContent = `✅ 이어 붙였습니다: ${이름}`;
      st("이어 붙이기 완성 — 🗂 히스토리에서 볼 수 있습니다.", "ok");
      await refresh();
    } catch (err) {
      잇는일.실패(err.message);
      $$("bkInfo").textContent = "⚠ 이어 붙이기 실패: " + err.message;
      st("⚠ " + err.message, "err");
    }
  }

  $$("bkEach").addEventListener("click", 각각);
  $$("bkJoin").addEventListener("click", 이어서);
  $$("bkBoth").addEventListener("click", async () => { await 각각(); await 이어서(); });

  $$("bkSelAll").addEventListener("change", ev => {
    $$("bkList").querySelectorAll(".bkSel").forEach(c => { c.checked = ev.target.checked; });
    고른수보이기();
  });
  $$("bkSelBake").addEventListener("click", () => 고른것굽기(고른편()));
  $$("bkSelDl").addEventListener("click", async () => {
    const 파일 = 고른편().map(구운것).filter(Boolean);
    if (!파일.length) { st("고른 편에 구운 영상이 없습니다.", "err"); return; }
    if (파일.length === 1) {                    // 한 개면 굳이 묶지 않는다
      const s = 고른편().find(구운것);
      내려받기(파일[0], s.name);
      st(`⬇ "${s.name}" 를 내려받습니다.`, "ok");
      return;
    }
    const btn = $$("bkSelDl");
    btn.disabled = true;
    try {
      const 바이트 = await busy.감싸기(`⬇ ${파일.length}편을 묶는 중`,
        () => 여러개내려받기(파일, S.열린것.name || "심심공작소_영상"));
      st(`⬇ ${파일.length}편을 zip 으로 내려받았습니다 (${(바이트 / 1048576).toFixed(1)}MB).`, "ok");
    } catch (e) { st("⚠ " + e.message, "err"); }
    btn.disabled = false;
    고른수보이기();
  });

  /* 대본의 `굽기: …` 를 글에서 바로 실행할 수 있게 열어 둔다.
     화면에서 되는 일은 글로도 돼야 한다는 약속을 지키는 자리다.

         굽기: 각각            편마다 한 개
         굽기: 이어서          전부 이어 붙여 한 개
         굽기: 둘다
         굽기: 1화             그 이름의 편만 (이름 일부만 적어도 찾는다)
         굽기: 1화, 3화        고른 편만
   */
  window.__굽기실행 = async 방식 => {
    const 글 = String(방식 || "").trim();
    if (글 === "각각") return 각각();
    if (글 === "이어서") return 이어서();
    if (글 === "둘다") { await 각각(); return 이어서(); }
    // 그 밖에는 편 이름으로 본다
    const 찾을것 = 글.split(",").map(x => x.trim().replace(/\s/g, "")).filter(Boolean);
    const 고른것 = [];
    for (const 말 of 찾을것) {
      const s = 줄.find(x => (x.name || "").replace(/\s/g, "") === 말)
             || 줄.find(x => (x.name || "").replace(/\s/g, "").includes(말));
      if (s && !고른것.includes(s)) 고른것.push(s);
    }
    if (!고른것.length) { st(`"${글}" 라는 편을 찾지 못했습니다.`, "err"); return 0; }
    return 고른것굽기(고른것);
  };
}
