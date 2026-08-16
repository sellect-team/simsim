/* 📥 글로 한 번에 만들기 — 대본 한 덩어리를 프로젝트로.
 *
 * 이것이 이 프로그램의 **가장 중요한 입구**다.
 * 밖의 LLM 이 써 온 글을 붙여 넣으면 프로젝트와 여러 편이 통째로 만들어진다.
 *
 * 예전에는 여기가 그냥 글칸 하나였다. 그래서 이런 일이 있었다.
 *   · 틀린 줄이 어디인지 몰라 통째로 다시 시켰다 (줄 번호가 없었다)
 *   · 편이 몇 개로 쪼개지는지 만들고 나서야 알았다
 *   · 없는 캐릭터를 불러도 조용히 코드 그림이 나왔다 — 만들어야 할 그림을 놓쳤다
 *   · 콘티 그림칸이 붙어 있어 '그림이 있어야 하나' 싶게 만들었다 (그림 올리기는 따로다)
 *
 * 그래서 셋을 한 화면에 놓는다.
 *   왼쪽  줄 번호가 붙은 글칸
 *   오른쪽 ① 편으로 쪼갠 모습 ② 줄마다 무엇이 잘못됐나 ③ 새로 그려야 할 자산
 */
import { openModal } from "./modal.js";
import { mountLineEditor } from "./line_editor.js";
import { parseProject, inspectProject } from "../story/project.js";
import { parseScript } from "../story/script.js";
import { StoryDoc } from "../story/doc.js";
import { library } from "../story/assets.js";
import { lintScript, 등급색 } from "../story/lint.js";

const esc = s => String(s ?? "").replace(/[&<>"]/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * 창을 연다.
 * @param opt.값       처음 채워 둘 글
 * @param opt.보기글   [보기글 넣기] 가 넣을 글
 * @param opt.문법보기 [문법 보기] 를 눌렀을 때
 * @param opt.만들기   async (설정, 이야기[], 알림(글)) => void   실제로 만드는 일
 */
export function openPasteProject(opt = {}) {
  const 창 = openModal({
    제목: "📥 글로 한 번에 만들기",
    너비: "min(1240px, 97vw)", 높이: "min(90vh, 940px)",
    안내: "프로젝트 설정과 이야기 여러 편을 한 덩어리로 붙여 넣습니다. " +
          "<b>편은 <code>== 이야기 이름</code> 으로 나눕니다.</b> " +
          "그림은 여기서 올리지 않습니다 — 🎨 자산에서 따로 올리세요.",
    단추: [
      ...(opt.문법보기 ? [{ 글: "📖 문법 보기", 할일: () => opt.문법보기() }] : []),
      ...(opt.보기글 ? [{ 글: "보기글 넣기", 할일: () => 편집기.값넣기(opt.보기글) }] : []),
    ],
    내용: `
<div style="display:grid; grid-template-columns:1.15fr 1fr; gap:12px; align-items:start">
  <div>
    <div class="charRow" style="align-items:center; margin-bottom:5px">
      <b style="font-size:13px">대본</b>
      <span class="hint" id="ppCount"></span>
      <span style="flex:1"></span>
      <button class="ghost small" type="button" id="ppCheck">🔎 문법 검사</button>
    </div>
    <div id="ppEditor"></div>
    <div class="charRow" style="margin-top:8px; align-items:center">
      <button id="ppRun" type="button">▶ 한 번에 만들기</button>
      <span class="hint" id="ppInfo"></span>
    </div>
  </div>
  <div id="ppRight" style="max-height:70vh; overflow-y:auto"></div>
</div>`,
  });

  const $ = id => 창.몸.querySelector("#" + id);
  const 알림 = 글 => { const el = $("ppInfo"); if (el) el.innerHTML = 글; };

  let 마지막 = null;                       // 마지막 검사 결과
  let 검사중 = 0;

  const 편집기 = mountLineEditor($("ppEditor"), {
    값: opt.값 || "",
    높이: "min(62vh, 620px)",
    안내글: "프로젝트: 댕댕이 시리즈\n비율: 9:16\n\n== 이야기 첫 편\n장면 <공원 잔디밭>\n  <누렁이> 등장 가운데\n  자막 \"안녕하세요\"",
    바뀜: () => 늦게검사(),
  });

  /* 글자를 칠 때마다 전부 살펴보면 느리다 — 손을 멈추면 한다 */
  let 타이머 = null;
  const 늦게검사 = () => { clearTimeout(타이머); 타이머 = setTimeout(검사, 260); };

  async function 검사() {
    const 글 = 편집기.값();
    const 나 = ++검사중;
    if (!글.trim()) {
      마지막 = null;
      편집기.문제표시(new Map());
      $("ppCount").textContent = "";
      $("ppRight").innerHTML = `<div class="hint" style="padding:20px 4px">
        붙여 넣으면 여기에 <b>편으로 쪼갠 모습</b>과 <b>고쳐야 할 줄</b>이 나옵니다.</div>`;
      return;
    }

    const p = parseProject(글);
    const 훑음 = inspectProject(글);

    /* 편마다 따로 살펴본다.
       lint 는 **편 안에서의 줄 번호**를 주므로 편이 시작한 줄을 더해 전체 줄 번호로 옮긴다.
       이것을 안 하면 3편의 5줄이 5줄로 표시돼 엉뚱한 데를 보게 된다. */
    const 편들 = [];
    for (const s of p.이야기) {
      const parsed = parseScript(s.글);
      let 살핌 = [];
      try { 살핌 = await lintScript(parsed); } catch {}
      if (나 !== 검사중) return;                     // 그새 또 쳤으면 버린다
      const doc = new StoryDoc(s.글, s.이름);
      try { await doc.build(library); } catch {}
      if (나 !== 검사중) return;
      편들.push({
        이름: s.이름, 시작줄: s.line,
        초: doc.seconds || 0, 장면수: parsed.scenes.length,
        자막수: parsed.scenes.reduce(
          (a, x) => a + x.steps.filter(y => y.kind === "자막" || y.kind === "대사").length, 0),
        살핌: 살핌.map(x => ({ ...x, 전체줄: (x.line || 1) + s.line })),
        없는것: (() => { try { return doc.missingWithPrompts(); } catch { return []; } })(),
      });
    }

    마지막 = { 설정: p.설정, 이야기: p.이야기, 편들, 프로젝트오류: p.오류 || [] };
    그리기();
  }

  function 그리기() {
    const m = 마지막;
    if (!m) return;
    const 모든살핌 = [
      ...m.프로젝트오류.map(e => ({ 등급: "오류", 전체줄: e.line, msg: e.msg, 편: "" })),
      ...m.편들.flatMap(e => e.살핌.map(x => ({ ...x, 편: e.이름 }))),
    ];
    const 센것 = { 오류: 0, 경고: 0, 알림: 0 };
    모든살핌.forEach(x => { 센것[x.등급] = (센것[x.등급] || 0) + 1; });

    /* 글칸 번호에 색 입히기 */
    const 표 = new Map();
    for (const x of 모든살핌) {
      const 이전 = 표.get(x.전체줄);
      if (이전 === "오류") continue;
      if (이전 === "경고" && x.등급 === "알림") continue;
      표.set(x.전체줄, x.등급);
    }
    편집기.문제표시(표);

    const 총초 = m.편들.reduce((a, b) => a + b.초, 0);
    $("ppCount").textContent =
      `${m.설정.이름 || "(이름 없음)"} · ${m.편들.length}편 · ` +
      `${Math.floor(총초 / 60)}분 ${Math.round(총초 % 60)}초`;

    /* ── 오른쪽: ① 편 쪼갠 모습 ② 고칠 줄 ③ 새로 그려야 할 것 ── */
    const 없는것모음 = new Map();          // 이름 → {종류, 프롬프트, 편들}
    for (const e of m.편들) {
      for (const n of e.없는것) {
        const k = `${n.종류}:${n.이름}`;
        if (!없는것모음.has(k)) 없는것모음.set(k, { ...n, 편: new Set() });
        없는것모음.get(k).편.add(e.이름);
      }
    }

    const 편칸 = m.편들.length ? m.편들.map((e, i) => {
      const 오 = e.살핌.filter(x => x.등급 === "오류").length;
      const 경 = e.살핌.filter(x => x.등급 === "경고").length;
      const 색 = 오 ? "#ff7a7a" : 경 ? "#ffcf6c" : "#7bd88f";
      return `<div class="vitem ppJump" data-줄="${e.시작줄 + 1}"
        style="cursor:pointer; align-items:center; padding:5px 9px; border-left:3px solid ${색}">
        <span class="vname" style="flex:1">${i + 1}. ${esc(e.이름)}</span>
        <span class="vinfo" style="font-size:11px; color:#8a93a8">
          ${e.초.toFixed(1)}초 · 장면 ${e.장면수} · 자막 ${e.자막수}</span>
        ${오 ? `<span style="color:#ff7a7a; font-size:11px">⛔${오}</span>` : ""}
        ${경 ? `<span style="color:#ffcf6c; font-size:11px">⚠${경}</span>` : ""}
      </div>`;
    }).join("") : `<div class="hint">이야기가 없습니다 — <code>== 이야기 이름</code> 으로 나눠 주세요.</div>`;

    const 고칠것 = 모든살핌.filter(x => x.등급 !== "알림");
    const 고칠칸 = 고칠것.length ? 고칠것.slice(0, 40).map(x => {
      const g = 등급색[x.등급] || 등급색["경고"];
      return `<div class="ppJump" data-줄="${x.전체줄}" style="cursor:pointer; padding:3px 2px;
        color:${g.c}; font-size:12px; line-height:1.5">
        ${g.i} <b>${x.전체줄}줄</b>${x.편 ? ` <span style="color:#6b6478">(${esc(x.편)})</span>` : ""}
        ${esc(x.msg)}</div>`;
    }).join("") + (고칠것.length > 40 ? `<div class="hint">…그 밖에 ${고칠것.length - 40}개 더</div>` : "")
      : `<div style="color:#7bd88f; font-size:12px">✅ 고칠 곳이 없습니다</div>`;

    const 없는칸 = 없는것모음.size ? [...없는것모음.values()].map(n =>
      `<div class="vitem" style="padding:5px 9px; align-items:flex-start; flex-wrap:wrap">
        <span class="vname" style="flex:1">
          ${n.종류 === "배경" ? "🏞" : "🐕"} ${esc(n.이름)}</span>
        <span class="vinfo" style="font-size:11px; color:#8a93a8">${[...n.편].length}편에서 씀</span>
        <button class="ghost small ppPrompt" type="button" data-p="${esc(n.프롬프트)}"
                style="padding:0 6px">📋 프롬프트</button>
      </div>`).join("") : `<div class="hint">모두 올려 둔 그림이 있습니다.</div>`;

    $("ppRight").innerHTML = `
      <h3 class="mkHead" style="margin:0 0 5px">📜 이야기 ${m.편들.length}편
        <span class="hint">— 눌러서 그 줄로</span></h3>
      <div class="vlist">${편칸}</div>

      <h3 class="mkHead" style="margin:14px 0 5px">🔎 문법 검사
        <span class="hint">⛔ ${센것.오류} · ⚠ ${센것.경고} · 💡 ${센것.알림}</span></h3>
      <div>${고칠칸}</div>

      <h3 class="mkHead" style="margin:14px 0 5px">🎨 새로 그려야 할 것
        <span class="hint">— ${없는것모음.size}개</span></h3>
      <div class="hint" style="margin-bottom:4px; font-size:11px">
        지금은 코드가 대신 그립니다. 같은 이름으로 그림을 올리면 그것이 쓰입니다 —
        프롬프트를 복사해 밖의 AI 나 🎬 스튜디오에서 뽑으세요.</div>
      <div class="vlist">${없는칸}</div>`;

    $("ppRight").querySelectorAll(".ppJump").forEach(el =>
      el.addEventListener("click", () => 편집기.줄로가기(+el.dataset.줄)));
    $("ppRight").querySelectorAll(".ppPrompt").forEach(el =>
      el.addEventListener("click", async ev => {
        ev.stopPropagation();
        try { await navigator.clipboard.writeText(el.dataset.p); 알림("📋 프롬프트를 복사했습니다"); }
        catch { 알림("복사하지 못했습니다"); }
      }));

    /* 만들기 단추 — 오류가 있으면 막지는 않되 분명히 말해 준다.
       (틀린 줄이 있어도 나머지는 만들어지는 편이 낫다. 다 지우고 다시 시키는 것보다.) */
    const 단추 = $("ppRun");
    단추.textContent = 센것.오류
      ? `▶ 그래도 만들기 (⛔ ${센것.오류}줄 무시)` : "▶ 한 번에 만들기";
    단추.disabled = !m.편들.length;
  }

  $("ppCheck").addEventListener("click", () => { clearTimeout(타이머); 검사(); });

  $("ppRun").addEventListener("click", async () => {
    if (!마지막?.편들.length) { 알림("⚠ 이야기가 없습니다."); return; }
    $("ppRun").disabled = true;
    try {
      await opt.만들기?.(마지막.설정, 마지막.이야기, 알림);
      창.닫기();
    } catch (e) {
      알림(`<span style="color:#ff7a7a">⚠ ${esc(e.message)}</span>`);
      $("ppRun").disabled = false;
    }
  });

  검사();
  return { 창, 편집기 };
}
