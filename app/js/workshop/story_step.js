/* 📜 스토리 단계 — 이 프로젝트의 이야기들.
 *
 * 왼쪽에 편 목록, 오른쪽에 고른 편의 대본과 미리보기.
 * 대본은 다 치고 잠깐 멈추면 저절로 저장된다 (편집 프로그램처럼).
 */
import { $, escapeHtml } from "../core.js";
import { StoryDoc } from "../story/doc.js";
import { library } from "../story/assets.js";
import { videoSize } from "../story/render.js";
import { 상태색 } from "../tabs/home.js";
import { openSubtitleStudio } from "../ui/subtitle_studio.js";
import { loadFonts } from "../story/subtitle.js";
import { lintScript, 등급색, 음악읽기 } from "../story/lint.js";
import { openModal } from "../ui/modal.js";
import { 자동완성붙이기 } from "../ui/autocomplete.js";
import { prefabNames, loadPrefabs } from "../story/prefabs.js";
import { sceneryWords } from "../story/scenery.js";
import { PROPS } from "../story/props.js";
import { FONTS, BACKINGS, PRESETS } from "../story/subtitle.js";

/* ＋ 새 이야기를 누르면 들어가는 글.
 *
 * 예전에는 세 줄짜리였다. 문법을 안 다치니 안전해 보였지만,
 * **이 프로그램이 뭘 할 수 있는지 아무도 몰랐다.** 대본 문법은 눈으로 보기 전에는
 * 있는 줄도 모르는 것들이라(멈칫·시간 늘이기·후처리·소품 붙이기) 아무도 안 썼다.
 *
 * 그래서 지금은 **한 번 굽기만 하면 기능을 거의 다 보게** 되어 있다.
 * 지우고 쓰기 쉬우라고 장(場)마다 `#` 로 무엇을 보여 주는지 적어 뒀다.
 * 실제로 30초 안팎이 나오며, 그림을 하나도 안 올려도 그대로 돌아간다.
 */
const 새대본 = `제목: 새 이야기
비율: 9:16
자막차림표: 종이
자막테두리: 0.1
자막높이: 0.8
여닫이: 어둡게
음악프롬프트: warm acoustic ukulele, cozy storybook, gentle 90bpm, no vocals

# ── 1장 · 등장 · 상태 · 카메라 ──
장면 <아침 공원 잔디밭>   전환:페이드   분위기:아침
  <누렁이 강아지> 등장 가운데 크기:0.7 동작:breathe
  자막 "여기에 이야기를 씁니다"   등장:타이핑
  카메라 줌인 3초 세기:1.12
  <누렁이 강아지> 상태 기쁨
  자막 "자막 한 줄이 컷 하나입니다"
  <누렁이 강아지> 대사 "말은 이렇게 시킵니다"   소리:톡

# ── 2장 · 이동 · 소품 · 효과 · 멈칫 ──
장면 <노을 지는 들판>   전환:흐림   분위기:노을
  <누렁이 강아지> 등장 왼쪽 크기:0.62
  <누렁이 강아지> 이동 오른쪽 3초
  자막 "움직임은 자막과 겹쳐 흐릅니다"
  소품 <공>
  <공> 등장 오른쪽위 크기:0.14
  <공> 점프 왼쪽 0.9초
  효과 꽃잎 위치:0.5,0.1 크기:1.1
  자막 "소품도 배우처럼 움직입니다"
  멈칫 0.2초
  <누렁이 강아지> 상태 놀람
  카메라 펀치 0.3초
  자막 "…어라?"   차림표:예능 크기:0.1 등장:튀어나옴
  소리 뿅

# ── 3장 · 시간 늘이기 · 화면 후처리 · 마무리 ──
장면 <밤하늘>   전환:어둡게   분위기:밤
  <누렁이 강아지> 등장 0.5,0.66 크기:0.7
  화면 비네트 0.45 1.2초
  느리게 0.5 1초
  자막 "느리게·빠르게로 속도를 바꿉니다"
  보통속도 0.3초
  효과 반짝임 위치:0.5,0.3 크기:1.0
  자막 "화면 전체에 분위기를 입힙니다"   차림표:속삭임
  <누렁이 강아지> 상태 졸림
  대기 0.6초
  자막 "여기까지가 30초입니다"
  카메라 줌아웃 2초
`;

let 붙임 = false;
let 지금 = { sid: null, doc: null, t: 0, 재생: false, raf: 0, t0: 0 };

/* ↶ 되돌리기 — 대본이 저절로 저장되므로 실수하면 돌아갈 길이 있어야 한다.
   글자 하나마다 쌓으면 금방 넘치므로, 조금 쉬었을 때만 한 걸음으로 친다. */
const 되돌림 = { 기록: [], 자리: -1, 최대: 60 };
function 기록하기(글) {
  if (되돌림.기록[되돌림.자리] === 글) return;
  되돌림.기록 = 되돌림.기록.slice(0, 되돌림.자리 + 1);
  되돌림.기록.push(글);
  if (되돌림.기록.length > 되돌림.최대) 되돌림.기록.shift();
  되돌림.자리 = 되돌림.기록.length - 1;
}
function 되돌리기(d) {
  const 새자리 = 되돌림.자리 + d;
  if (새자리 < 0 || 새자리 >= 되돌림.기록.length) return null;
  되돌림.자리 = 새자리;
  return 되돌림.기록[새자리];
}

export function mountStoryStep(el, S, { st, 보내기, refresh }) {
  loadFonts().catch(() => {});     // 자막 글꼴 8종 — 미리보기와 굽기가 같은 글꼴을 쓰게
  loadPrefabs().catch(() => {});   // 조각 이름 (자동완성·펼치기에 쓴다)
  음악읽기(true).then(v => { 음악이름들 = v; }).catch(() => {});
  fetch("/api/sfx/list").then(r => r.json())
    .then(d => { 효과음이름들 = d.names || []; }).catch(() => {});
  if (!붙임) { 그리기틀(el); 붙임 = true; 손붙이기(S, { st, 보내기, refresh }); }
  목록그리기(S);
  if (!지금.sid && S.상세?.stories?.length) 편열기(S, S.상세.stories[0].sid, { st, 보내기, refresh });
  else if (!S.상세?.stories?.length) 빈화면();
}

function 그리기틀(el) {
  el.innerHTML = `
  <div class="mkCols" style="grid-template-columns:250px 1fr; gap:14px; margin-top:12px">
    <div>
      <div class="charRow" style="margin-bottom:6px">
        <button class="ghost small" id="ssNew" type="button">＋ 새 이야기</button>
        <span class="hint" id="ssCount"></span>
      </div>
      <div id="ssList" class="vlist" style="max-height:520px; overflow-y:auto"></div>
    </div>
    <div>
      <div class="charRow" style="align-items:center">
        <input id="ssName" placeholder="이야기 이름" style="max-width:230px">
        <span class="hint" id="ssInfo"></span>
        <span style="flex:1"></span>
        <button class="ghost small" id="ssLint" type="button"
                title="이 편의 대본을 통째로 살펴봅니다">🔎 문법 검사 <span id="ssLintBadge"></span></button>
        <button class="ghost small" id="ssSubtitle" type="button"
                title="자막 글꼴·자리·바탕을 보면서 고릅니다">💬 자막 꾸미기</button>
        <button class="ghost small" id="ssUndo" type="button"
                title="대본을 되돌립니다 (Ctrl+Z 도 됩니다)">↶ 되돌리기</button>
        <button class="ghost small" id="ssRedo" type="button">↷ 다시</button>
        <button class="ghost small" id="ssDup" type="button" title="이 편을 베낍니다">⧉ 복제</button>
        <button class="ghost small danger" id="ssDel" type="button">🗑</button>
      </div>
      <div class="mkCols" style="grid-template-columns:1fr 300px; gap:12px; margin-top:8px">
        <div>
          <!-- 대본 칸 — 글자는 투명하게 두고 뒤에 색칠한 겹을 깔아 개체가 눈에 띄게 한다.
               (textarea 는 색을 못 넣으므로 흔히 쓰는 방법이다) -->
          <!-- 왼쪽 줄 번호 칸 + 색칠한 겹 + 투명한 글 칸, 셋이 겹쳐 있다.
               줄 번호는 줄바꿈된 줄까지 맞춰야 해서, 색칠한 겹의 **실제 높이를 재어** 만든다. -->
          <div style="position:relative; height:430px; background:#141219; border-radius:10px">
            <div id="ssGutter" aria-hidden="true" style="position:absolute; left:0; top:0; bottom:0;
              width:38px; overflow:hidden; padding:10px 0; box-sizing:border-box;
              font-family:Consolas,monospace; font-size:12px; line-height:1.65;
              text-align:right; color:#5c556b; background:#100e15;
              border-radius:10px 0 0 10px; border-right:1px solid #26222f;
              pointer-events:none; user-select:none"></div>
            <pre id="ssHi" aria-hidden="true" style="position:absolute; inset:0 0 0 38px; margin:0;
              font-family:Consolas,monospace; font-size:12px; line-height:1.65;
              white-space:pre-wrap; word-break:break-all; overflow:auto; pointer-events:none;
              color:#e8e2d8; padding:10px"></pre>
            <textarea id="ssText" spellcheck="false" style="position:absolute; inset:0 0 0 38px;
              width:calc(100% - 38px); height:100%; font-family:Consolas,monospace; font-size:12px;
              line-height:1.65; white-space:pre-wrap; word-break:break-all;
              background:transparent; color:transparent; caret-color:#e8e2d8;
              border-radius:0 10px 10px 0; padding:10px; resize:none"></textarea>
          </div>
          <div class="hint" id="ssErr" style="margin-top:4px; white-space:pre-wrap"></div>
        </div>
        <div>
          <div class="hint" style="margin-bottom:4px">미리보기 <span id="ssSize"></span></div>
          <div style="display:flex; justify-content:center">
            <div id="ssStage" style="position:relative; width:100%; height:330px;
                 border-radius:12px; overflow:hidden; background:#0f0d14">
              <canvas id="ssCanvas" style="position:absolute; inset:0; width:100%; height:100%;
                      display:block"></canvas>
            </div>
          </div>
          <div class="charRow" style="justify-content:center; margin-top:4px">
            <button class="ghost small" id="ssPlay" type="button">▶ 재생</button>
            <button class="ghost small" id="ssStop" type="button">⏹</button>
            <span class="hint" id="ssTime">0.0 / 0.0초</span>
          </div>
          <input id="ssSeek" type="range" min="0" max="1000" value="0" style="width:100%">
          <div id="ssCuts" class="vlist" style="max-height:120px; overflow-y:auto; margin-top:6px"></div>

          <!-- 🧱 이 편에 나오는 개체 (게임 편집기의 인스펙터) -->
          <div class="charRow" style="margin-top:8px">
            <b style="font-size:12px">🧱 개체</b>
            <span class="hint" id="ssObjInfo"></span>
          </div>
          <div id="ssObjs" class="vlist" style="max-height:150px; overflow-y:auto"></div>

          <!-- 🧩 조각 (프리팹) -->
          <div class="charRow" style="margin-top:8px">
            <b style="font-size:12px">🧩 조각</b>
            <button class="ghost small" id="ssPfSave" type="button"
                    title="고른 줄(없으면 전체)을 이름 붙여 저장합니다">＋ 저장</button>
            <span class="hint" id="ssPfInfo"></span>
          </div>
          <div id="ssPfs" class="vlist" style="max-height:150px; overflow-y:auto"></div>
        </div>
      </div>
    </div>
  </div>`;
}

function 빈화면() {
  $("ssName").value = "";
  $("ssText").value = "";
  $("ssInfo").textContent = "왼쪽에서 이야기를 고르거나 [＋ 새 이야기]를 누르세요.";
  $("ssErr").textContent = "";
  $("ssCuts").innerHTML = "";
  지금 = { sid: null, doc: null, t: 0, 재생: false, raf: 지금.raf, t0: 0 };
}

function 목록그리기(S) {
  const list = S.상세?.stories || [];
  $("ssCount").textContent = `${list.length}편`;
  $("ssList").innerHTML = list.length ? list.map(s => {
    const b = (S.열린것?.stories || []).find(x => x.sid === s.sid) || {};
    const c = 상태색[b.state] || 상태색["빈대본"];
    return `<div class="vitem" data-sid="${s.sid}" style="cursor:pointer; gap:8px;
              ${s.sid === 지금.sid ? "outline:2px solid var(--accent,#6c8cff)" : ""}">
      <img src="/api/project/thumb?id=${s.sid}" style="width:34px;height:60px;object-fit:contain;
           border-radius:4px;background:#231f2b" onerror="this.style.visibility='hidden'">
      <span class="vname" style="flex:1">${escapeHtml(s.name || "이야기")}
        <span class="hint" style="display:block; color:${c.c}">${c.i} ${c.ko}</span>
        <span class="hint" style="display:block">${(s.seconds || 0).toFixed(1)}초 · ${s.scenes || 0}장면</span>
      </span></div>`;
  }).join("") : '<div class="hint">아직 이야기가 없습니다.</div>';
  $("ssList").querySelectorAll("[data-sid]").forEach(el =>
    el.addEventListener("click", () => window.__편열기(el.dataset.sid)));
}

/* 밀린 자동 저장을 지금 해치우는 손잡이. 손붙이기() 안에서 채워진다
   (자동 저장 타이머가 그 안에 있어서, 밖에서는 이 손잡이로만 건드린다). */
let 밀린것저장 = async () => {};

/** 작업실이 프로젝트를 나갈 때도 부른다 — 어디서 나가든 글은 지켜져야 한다 */
export const 밀린대본저장 = () => 밀린것저장();

async function 편열기(S, sid, 도구) {
  const s = (S.상세?.stories || []).find(x => x.sid === sid);
  if (!s) return;
  if (지금.sid === sid) return;                       // 보던 편을 다시 누른 것

  /* 다른 편으로 넘어가기 전에 **지금 편을 먼저 저장한다.**
     대본은 다 치고 0.9초 뒤에 저절로 저장되는데, 그 안에 다른 편을 누르면
     글 칸이 새 편의 글로 덮여 방금 친 것이 통째로 사라졌다. */
  if (지금.sid) {
    try { await 밀린것저장(S, 도구); }
    catch (e) { 도구?.st?.("⚠ 앞 편을 저장하지 못했습니다: " + e.message, "err"); }
  }

  지금.sid = sid;
  $("ssName").value = s.name || "";
  $("ssText").value = s.text || "";
  되돌림.기록 = [s.text || ""]; 되돌림.자리 = 0;      // 편을 바꾸면 되돌리기도 새로 시작
  목록그리기(S);
  색칠갱신();
  await 다시읽기(S, 도구);
}

/* ── 🔎 살펴보기 ──
   실수를 알려 주는 것만으로는 부족하다. **그 줄로 데려가고**, 오타면 고쳐 줘야 한다.
   이것이 "30초 굽고 나서야 이름이 틀린 걸 아는" 일을 없앤다. */
let 마지막살핌 = [];

/** 살펴보기가 일러 준 대로 그 줄을 고친다.
 *  고침은 두 모양이다 — 낱말만 바꾸는 것({옛,새})과 줄을 통째로 바꾸는 것(고친줄). */
function 한줄고치기(x, st) {
  const 줄들 = $("ssText").value.split("\n");
  const i = (x.line | 0) - 1;
  if (i < 0 || i >= 줄들.length) { st?.("그 줄이 없습니다.", "err"); return false; }
  if (x.고친줄 != null) {
    줄들[i] = x.고친줄;
  } else if (x.고침 && 줄들[i].includes(x.고침.옛)) {
    줄들[i] = 줄들[i].split(x.고침.옛).join(x.고침.새);
  } else {
    st?.("그 줄에서 못 찾았습니다 (글이 바뀌었나요?)", "err");
    return false;
  }
  $("ssText").value = 줄들.join("\n");
  $("ssText").dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
const 고칠수있나 = x => !!(x.고침 || x.고친줄 != null);
const 고침설명 = x => x.고침
  ? `"${x.고침.옛}" 를 "${x.고침.새}" 로 바꾸면 됩니다`
  : `이렇게 고치면 됩니다:  ${x.고친줄}`;

/** 자동완성이 보여 줄 이름들 — 지금 창고에 있는 것만 */
function 쓸수있는이름() {
  return {
    캐릭터: (library.characters || []).map(c => c.name),
    // sceneryWords() 는 {시간:[], 장소:[]} 를 돌려준다 — 펼쳐서 한 줄로 만든다
    배경: [...(library.backgrounds || []).map(b => b.name),
           ...Object.values(sceneryWords() || {}).flat()],
    소품: Object.keys(PROPS || {}),
    음악: 음악이름들,
    조각: prefabNames(),
    소리: 효과음이름들,
    글꼴: Object.keys(FONTS),
    바탕: Object.keys(BACKINGS),
    차림표: Object.keys(PRESETS),
    말: 대본낱말,
  };
}
let 음악이름들 = [], 효과음이름들 = [];
const 대본낱말 = [
  "장면", "자막", "대사", "대기", "멈칫", "카메라", "화면", "소리", "효과", "소품", "조각",
  "제목:", "비율:", "음악:", "음악프롬프트:", "자막차림표:", "자막글꼴:", "자막색:",
  "자막가로:", "자막세로:", "자막바탕:", "자막테두리:", "굽기:",
];

/* ── 🔎 문법 검사 창 ──
   줄 옆의 작은 알림만으로는 여러 개일 때 다 못 본다.
   창으로 한 번에 펼쳐 놓고, 눌러서 그 줄로 간다. */
async function 검사창열기(st) {
  const doc = 지금.doc;
  if (!doc) { st?.("먼저 이야기를 여세요.", "err"); return; }
  let 살핌 = [];
  try { 살핌 = await lintScript(doc.parsed); } catch (e) { 살핌 = []; }
  const 센것 = { 오류: 0, 경고: 0, 알림: 0 };
  살핌.forEach(x => { 센것[x.등급]++; });

  const 줄글 = 번호 => (doc.text || "").split("\n")[번호 - 1] || "";

  const 창 = openModal({
    제목: "🔎 문법 검사",
    너비: "min(880px, 96vw)",
    안내: 살핌.length
      ? `⛔ 오류 ${센것.오류} · ⚠ 경고 ${센것.경고} · 💡 알림 ${센것.알림}` +
        "　(줄을 누르면 대본의 그 자리로 갑니다)"
      : "이상 없습니다. 그대로 구우면 됩니다.",
    내용: 살핌.length
      ? `<div class="vlist" id="lintList">${살핌.map((x, i) => {
          const g = 등급색[x.등급] || 등급색["경고"];
          return `<div class="vitem lintItem" data-i="${i}" data-줄="${x.line || 1}"
                    style="cursor:pointer; align-items:flex-start; gap:9px; padding:7px 9px">
            <span style="width:26px; flex:none; text-align:center">${g.i}</span>
            <span style="width:46px; flex:none; color:${g.c}; font-weight:700;
                  font-family:Consolas,monospace">${x.line || 1}줄</span>
            <span style="flex:1; min-width:0">
              <span style="color:${g.c}">${escapeHtml(x.msg)}</span>
              <div style="font-family:Consolas,monospace; font-size:11px; color:#8a8290;
                   margin-top:3px; white-space:pre-wrap; word-break:break-all"
                   >${escapeHtml(줄글(x.line || 1).trim() || "(빈 줄)")}</div>
              ${고칠수있나(x) ? `<div style="font-size:11px; color:#7bd88f; margin-top:3px">
                → ${escapeHtml(고침설명(x))}</div>` : ""}
            </span>
            ${고칠수있나(x) ? `<button type="button" class="ghost small lintFix2" data-i="${i}"
              style="flex:none">고치기</button>` : ""}
          </div>`;
        }).join("")}</div>`
      : '<div style="padding:26px; text-align:center; font-size:15px; color:#7bd88f">✅ 이상 없습니다</div>',
    단추: 살핌.some(고칠수있나) ? [{ 글: "✨ 고칠 수 있는 것 모두 고치기", 할일: 창 => {
      // 아래에서 위로 고친다 — 줄 번호가 밀리지 않게
      let 됨 = 0;
      for (const x of [...살핌].filter(고칠수있나).sort((a, b) => b.line - a.line)) {
        if (한줄고치기(x, null)) 됨++;
      }
      창.닫기();
      st?.(`${됨}곳을 고쳤습니다.`, "ok");
    } }] : [],
  });

  document.querySelectorAll(".lintItem").forEach(el => el.addEventListener("click", ev => {
    if (ev.target.classList.contains("lintFix2")) return;
    창.닫기();
    줄로가기(+el.dataset.줄);
  }));
  document.querySelectorAll(".lintFix2").forEach(b => b.addEventListener("click", ev => {
    ev.stopPropagation();
    const x = 살핌[+b.dataset.i];
    if (한줄고치기(x, st)) { 창.닫기(); st?.(`${x.line}줄을 고쳤습니다.`, "ok"); }
  }));
}

async function 살펴보기그리기(doc, st) {
  const 칸 = $("ssErr");
  if (!칸) return;
  let 살핌 = [];
  try { 살핌 = await lintScript(doc.parsed); } catch { 살핌 = []; }
  마지막살핌 = 살핌;

  const 센것 = { 오류: 0, 경고: 0, 알림: 0 };
  살핌.forEach(x => { 센것[x.등급] = (센것[x.등급] || 0) + 1; });

  /* 줄 번호에 색을 입힌다 — 어느 줄이 문제인지 눈으로 바로 찾게 */
  문제줄 = new Map();
  for (const x of 살핌) {
    if (x.등급 === "알림") continue;
    const 이전 = 문제줄.get(x.line);
    if (이전 !== "오류") 문제줄.set(x.line, x.등급);
  }
  줄번호갱신();

  /* [🔎 문법 검사] 단추 위 배지 */
  const 배지 = $("ssLintBadge");
  if (배지) {
    const n = 센것.오류 + 센것.경고;
    배지.textContent = n || "";
    배지.style.cssText = n
      ? `background:${센것.오류 ? "#c8483f" : "#c8842f"}; color:#fff; border-radius:9px;
         padding:0 6px; font-size:11px; margin-left:3px` : "";
  }

  if (!살핌.length) {
    칸.innerHTML = '<span style="color:#7bd88f">✅ 이상 없습니다</span>';
    return;
  }
  /* 알림(코드로 그림)은 늘 여러 개라 접어 둔다 — 진짜 문제가 묻히지 않게 */
  const 보일것 = 살핌.filter(x => x.등급 !== "알림").slice(0, 6);
  const 숨은알림 = 센것.알림;

  칸.innerHTML = 보일것.map(x => {
    const g = 등급색[x.등급] || 등급색["경고"];
    return `<div class="lintRow" data-줄="${x.line || 1}" style="cursor:pointer; padding:2px 0;
             color:${g.c}" title="눌러서 그 줄로 갑니다">
      ${g.i} <b>${x.line || 1}줄</b> ${escapeHtml(x.msg)}
      ${고칠수있나(x) ? `<button type="button" class="ghost small lintFix"
        data-i="${살핌.indexOf(x)}" style="padding:0 6px; margin-left:4px"
        >고치기</button>` : ""}
    </div>`;
  }).join("") +
    (살핌.filter(x => x.등급 !== "알림").length > 6
      ? `<div class="hint">…그 밖에 ${살핌.filter(x => x.등급 !== "알림").length - 6}개 더</div>` : "") +
    /* 알림은 접어 두되 **있다는 사실은 늘 보이게** 한다.
       예전에는 흐린 글씨라 "그림이 없어 코드로 그린다" 를 아무도 못 보고 지나쳤다. */
    (숨은알림 ? `<div style="margin-top:4px; padding:3px 8px; border-radius:7px;
      background:#221d2c; color:#b9a7d6; font-size:12px; display:inline-block">
      💡 올린 그림이 없어 <b>코드로 그리는 것 ${숨은알림}개</b>
      <button type="button" class="ghost small" id="lintShowInfo"
              style="padding:0 6px; margin-left:4px">무엇인지 보기</button></div>` : "");

  칸.querySelectorAll(".lintRow").forEach(el => el.addEventListener("click", ev => {
    if (ev.target.classList.contains("lintFix")) return;
    줄로가기(+el.dataset.줄);
  }));
  칸.querySelectorAll(".lintFix").forEach(b => b.addEventListener("click", ev => {
    ev.stopPropagation();
    const x = 살핌[+b.dataset.i];
    if (x && 한줄고치기(x, st)) st?.(`${x.line}줄을 고쳤습니다.`, "ok");
  }));
  document.getElementById("lintShowInfo")?.addEventListener("click", () => {
    openModal({
      제목: "💡 코드로 그리는 것들", 너비: "min(620px,94vw)", 높이: "auto",
      안내: "올린 그림이 없어 프로그램이 대신 그립니다. 영상은 그대로 나옵니다 — " +
            "마음에 안 드는 것만 🎨 자산에서 채우면 됩니다.",
      내용: `<div class="vlist">${살핌.filter(x => x.등급 === "알림").map(x =>
        `<div class="vitem" style="padding:3px 8px; font-size:12px">
           <span class="vname">${x.line}줄</span>
           <span class="vinfo" style="flex:1">${escapeHtml(x.msg)}</span></div>`).join("")}</div>`,
    });
  });
}

async function 다시읽기(S, { st } = {}) {
  const doc = new StoryDoc($("ssText").value, $("ssName").value || "이야기");
  await doc.build(library);
  지금.doc = doc;
  $("ssInfo").textContent = `${doc.sceneCount}장면 · ${doc.seconds.toFixed(1)}초`;
  await 살펴보기그리기(doc, st);
  const { 가로, 세로, 이름 } = videoSize(doc.stage, { 긴변: 1280 });
  $("ssSize").textContent = `${가로}×${세로} · ${이름}`;
  칸맞추기(가로, 세로);
  컷그리기(doc);
  개체그리기(doc);
  그리기();
}

function 칸맞추기(VW, VH) {
  const 칸 = $("ssStage"), 바깥 = 칸.parentElement;
  const MAX_H = 330;
  let w = Math.max(120, (바깥.clientWidth || 280) - 2), h = w * VH / VW;
  if (h > MAX_H) { h = MAX_H; w = h * VW / VH; }
  칸.style.width = Math.round(w) + "px";
  칸.style.height = Math.round(h) + "px";
  const cv = $("ssCanvas");
  const dpr = Math.min(window.devicePixelRatio || 1, VW / w, 2.5);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
}

/* 대본 색칠 — 무엇이 개체이고 무엇이 화면에 나올 글인지 한눈에 보이게 한다.
   <개체>=파랑 · "글"=노랑 · 꼬리표:값=연보라 · #주석=회색

   반드시 **한 번에** 훑어야 한다.
   규칙을 차례로 돌리면 앞 규칙이 넣은 `style="color:#7fb0ff"` 를
   뒷 규칙이 '꼬리표:값' 으로 다시 잡아먹어 태그가 글로 새어 나온다. */
const 칠 = (색, 글, 굵게) =>
  `<span style="color:${색}${굵게 ? "; font-weight:600" : ""}">${글}</span>`;
const 안전하게 = 글 => String(글).replace(/[&<>]/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const 색칠규칙 = /(#[^\n]*)|(<[^<>\n]*>)|("[^"\n]*")|((?:^|(?<=\s))[가-힣A-Za-z]+:[^\s]*)/g;

function 색칠(글) {
  const 원본 = String(글 || "");
  let 결과 = "", 끝 = 0, m;
  색칠규칙.lastIndex = 0;
  while ((m = 색칠규칙.exec(원본))) {
    결과 += 안전하게(원본.slice(끝, m.index));      // 규칙에 안 걸린 틈새도 반드시 감싼다
    const [전체, 주석, 개체, 말, 꼬리] = m;
    if (주석) 결과 += 칠("#6b6478", 안전하게(주석));
    else if (개체) 결과 += 칠("#7fb0ff", 안전하게(개체), true);
    else if (말) 결과 += 칠("#f0c674", 안전하게(말));
    else if (꼬리) {
      const i = 꼬리.indexOf(":");
      결과 += 칠("#c9a8f0", 안전하게(꼬리.slice(0, i + 1))) +
              칠("#a8d8b0", 안전하게(꼬리.slice(i + 1)));
    } else 결과 += 안전하게(전체);
    끝 = m.index + 전체.length;
  }
  return 결과 + 안전하게(원본.slice(끝));
}

/** 살펴보기가 찾은 줄 — 줄 번호에 색을 입혀 어디가 문제인지 바로 보이게 */
let 문제줄 = new Map();          // 줄번호 → "오류" | "경고"

function 색칠갱신() {
  const ta = $("ssText"), hi = $("ssHi");
  if (!ta || !hi) return;
  /* 줄마다 감싼다 — 이래야 줄바꿈된 줄의 **실제 높이**를 잴 수 있고,
     그 높이만큼 줄 번호를 띄워 언제나 나란히 놓인다. */
  hi.innerHTML = ta.value.split("\n")
    .map(l => `<span class="ssLn" style="display:block">${색칠(l) || "&nbsp;"}</span>`)
    .join("") + '<span class="ssLn" style="display:block">&nbsp;</span>';
  hi.scrollTop = ta.scrollTop;
  줄번호갱신();
}

/** 색칠한 겹의 줄 높이를 그대로 베껴 줄 번호를 만든다 */
function 줄번호갱신() {
  const hi = $("ssHi"), g = $("ssGutter"), ta = $("ssText");
  if (!hi || !g) return;
  const 줄들 = [...hi.querySelectorAll(".ssLn")];
  g.innerHTML = 줄들.slice(0, -1).map((el, i) => {
    const 등급 = 문제줄.get(i + 1);
    const 색 = 등급 === "오류" ? "#ff7a7a" : 등급 === "경고" ? "#ffcf6c" : "";
    return `<div style="height:${el.offsetHeight}px; padding-right:7px; box-sizing:border-box;
      ${색 ? `color:${색}; font-weight:700` : ""}">${i + 1}</div>`;
  }).join("");
  g.scrollTop = ta ? ta.scrollTop : 0;
}

function 그리기() {
  const cv = $("ssCanvas"); if (!cv) return;
  const g = cv.getContext("2d");
  g.fillStyle = "#0f0d14"; g.fillRect(0, 0, cv.width, cv.height);
  const stage = 지금.doc?.stage;
  if (!stage || !stage.scenes.length) return;
  stage.drawAt(g, { x: 0, y: 0, w: cv.width, h: cv.height }, 지금.t);
  $("ssTime").textContent = `${지금.t.toFixed(1)} / ${(지금.doc.seconds || 0).toFixed(1)}초`;
  const q = $("ssSeek");
  if (q && document.activeElement !== q)
    q.value = Math.round(1000 * 지금.t / Math.max(0.001, 지금.doc.seconds));
}

/* 🧱 개체 목록 — 이 편에 무엇이 몇 번 나오는지.
   대본을 눈으로 훑지 않아도 되고, 눌러서 그 줄로 갈 수 있다. */
function 개체그리기(doc) {
  const 표 = new Map();
  const 담기 = (종류, 이름, 줄, 짓) => {
    if (!이름) return;
    const k = 종류 + ":" + 이름;
    if (!표.has(k)) 표.set(k, { 종류, 이름, 줄, 짓: new Set(), 수: 0 });
    const v = 표.get(k);
    v.수++; if (짓) v.짓.add(짓);
    if (줄 < v.줄) v.줄 = 줄;
  };
  const 소품 = new Set();
  for (const sc of doc.parsed?.scenes || []) {
    담기("배경", sc.bg, sc.line, "무대");
    for (const st of sc.steps) {
      if (st.kind === "소품선언") { 소품.add(st.who); 담기("소품", st.who, st.line, "선언"); }
      else if (st.who) 담기(소품.has(st.who) ? "소품" : "배우", st.who, st.line, st.kind);
      else if (st.kind === "효과") 담기("효과", st.name, st.line, "효과");
    }
  }
  const 목록 = [...표.values()].sort((a, b) => a.줄 - b.줄);
  const 아이콘 = { 배경: "🏞", 배우: "🐕", 소품: "📦", 효과: "✨" };
  $("ssObjInfo").textContent = `${목록.length}개`;
  $("ssObjs").innerHTML = 목록.length ? 목록.map(o =>
    `<div class="vitem" data-줄="${o.줄}" style="cursor:pointer; padding:4px 8px">
      <span class="vname" style="font-size:12px">${아이콘[o.종류] || "•"} ${escapeHtml(o.이름)}</span>
      <span class="vinfo" style="font-size:11px">${escapeHtml([...o.짓].slice(0, 4).join("·"))}
        · ${o.수}번</span></div>`).join("")
    : '<div class="hint">개체가 없습니다.</div>';
  $("ssObjs").querySelectorAll("[data-줄]").forEach(el =>
    el.addEventListener("click", () => 줄로가기(+el.dataset.줄)));
}

/** 대본 칸에서 그 줄로 커서를 옮기고 보이게 한다 */
function 줄로가기(줄) {
  const ta = $("ssText");
  if (!ta) return;
  const 줄들 = ta.value.split("\n");
  let 자리 = 0;
  for (let i = 0; i < Math.min(줄 - 1, 줄들.length); i++) 자리 += 줄들[i].length + 1;
  ta.focus();
  ta.setSelectionRange(자리, 자리 + (줄들[줄 - 1] || "").length);
  const 한줄 = ta.scrollHeight / Math.max(1, 줄들.length);
  ta.scrollTop = Math.max(0, (줄 - 4) * 한줄);
  $("ssHi").scrollTop = ta.scrollTop;
  $("ssGutter").scrollTop = ta.scrollTop;      // 줄 번호도 같이
}

function 컷그리기(doc) {
  const 컷 = [];
  (doc.stage?.scenes || []).forEach(sc => sc.subtitles.forEach(s =>
    컷.push({ t: sc.start + s.t0, text: s.text, bg: sc.bg })));
  컷.sort((a, b) => a.t - b.t);
  $("ssCuts").innerHTML = 컷.length ? 컷.map(c =>
    `<div class="vitem" data-t="${c.t}" style="cursor:pointer">
      <span class="vname" style="font-size:12px"><b>${c.t.toFixed(1)}초</b> ${escapeHtml(c.text)}</span>
      <span class="vinfo">${escapeHtml(c.bg || "")}</span></div>`).join("")
    : '<div class="hint">자막이 없습니다.</div>';
  $("ssCuts").querySelectorAll("[data-t]").forEach(el =>
    el.addEventListener("click", () => { 지금.t = parseFloat(el.dataset.t); 지금.재생 = false; 그리기(); }));
}

/* 🧩 조각(프리팹) — 자주 쓰는 대본 토막을 이름 붙여 두고 어디든 끼워 넣는다.
   "누렁이가 공 들고 걷기" 같은 덩어리를 만들어 두면 다음 편은 고르기만 하면 된다. */
async function 조각그리기() {
  let 목록 = [];
  try { 목록 = (await (await fetch("/api/prefab/list")).json()).items || []; } catch {}
  $("ssPfInfo").textContent = 목록.length ? `${목록.length}개` : "아직 없음";
  $("ssPfs").innerHTML = 목록.length ? 목록.map(p =>
    `<div class="vitem" data-끼움="${p.id}" style="cursor:pointer; padding:4px 8px"
          title="${escapeHtml((p.text || "").slice(0, 200))}">
      <span class="vname" style="font-size:12px">🧩 ${escapeHtml(p.name)}</span>
      <span class="vinfo" style="font-size:11px">${(p.text || "").split("\n").length}줄</span>
      <span class="vactions"><button class="ghost small" data-조각지움="${p.id}">✕</button></span>
    </div>`).join("")
    : '<div class="hint">고른 줄을 [＋ 저장] 으로 조각으로 만들어 두세요.</div>';
  $("ssPfs").querySelectorAll("[data-끼움]").forEach(el =>
    el.addEventListener("click", () => 조각끼우기(목록.find(x => x.id === el.dataset.끼움))));
  $("ssPfs").querySelectorAll("[data-조각지움]").forEach(b =>
    b.addEventListener("click", async ev => {
      ev.stopPropagation();
      if (!confirm("이 조각을 지울까요?")) return;
      await fetch("/api/prefab/delete", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.dataset.조각지움 }) });
      조각그리기();
    }));
}

/** 커서가 있는 줄 다음에 조각을 끼워 넣는다 */
function 조각끼우기(p) {
  if (!p) return;
  const ta = $("ssText");
  const 자리 = ta.selectionStart ?? ta.value.length;
  const 줄끝 = ta.value.indexOf("\n", 자리);
  const 넣을곳 = 줄끝 < 0 ? ta.value.length : 줄끝;
  const 글 = "\n" + p.text.replace(/\n$/, "");
  ta.value = ta.value.slice(0, 넣을곳) + 글 + ta.value.slice(넣을곳);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  ta.focus();
  ta.setSelectionRange(넣을곳 + 글.length, 넣을곳 + 글.length);
}

function 손붙이기(S, { st, 보내기, refresh }) {
  window.__편열기 = sid => 편열기(S, sid, { st, 보내기, refresh });

  $("ssPfSave").addEventListener("click", async () => {
    const ta = $("ssText");
    const 고름 = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
    const 글 = 고름 || ta.value.trim();
    if (!글) { st("저장할 글이 없습니다.", "err"); return; }
    const 이름 = prompt("조각 이름", 고름 ? "새 조각" : ($("ssName").value || "조각"));
    if (!이름) return;
    const r = await 보내기("/api/prefab/save", { name: 이름, text: 글 });
    if (r) { st(`조각 "${r.item.name}" 저장 (${글.split("\n").length}줄)`, "ok"); 조각그리기(); }
  });
  조각그리기();

  /* 대본 자동 저장 — 다 치고 잠깐 멈추면 저장한다.
     `밀린것있나` 는 "아직 저장 안 된 글이 있다" 는 뜻이다 — 편을 바꾸거나 탭을 떠날 때 쓴다. */
  let 타이머 = null;
  let 밀린것있나 = false;
  const 저장예약 = () => {
    밀린것있나 = true;
    clearTimeout(타이머);
    타이머 = setTimeout(async () => {
      타이머 = null;
      await 저장하기(S, { st, 보내기, refresh });
      밀린것있나 = false;
    }, 900);
  };

  /** 밀린 저장을 **지금 당장** 해치운다 (편 바꾸기·탭 떠나기 앞에서 부른다) */
  밀린것저장 = async (S2 = S, 도구 = { st, 보내기, refresh }) => {
    if (!밀린것있나 && !타이머) return;
    clearTimeout(타이머);
    타이머 = null;
    await 저장하기(S2, 도구);
    밀린것있나 = false;
  };

  /* 창을 닫거나 새로 고쳐도 방금 친 글이 날아가지 않게 */
  window.addEventListener("beforeunload", ev => {
    if (!밀린것있나) return;
    저장하기(S, { st, 보내기, refresh });       // 보내 두기만 한다 (기다릴 수는 없다)
    ev.preventDefault();
    ev.returnValue = "";
  });
  let 기록타이머 = null;
  $("ssText").addEventListener("scroll", () => {
    const y = $("ssText").scrollTop;
    $("ssHi").scrollTop = y;
    $("ssGutter").scrollTop = y;          // 줄 번호도 같이 굴러야 나란히 있다
  });
  $("ssText").addEventListener("input", async () => {
    색칠갱신();
    await 다시읽기(S, { st });
    clearTimeout(기록타이머);
    기록타이머 = setTimeout(() => 기록하기($("ssText").value), 500);
    저장예약();
  });

  const 되돌리기적용 = async d => {
    const 글 = 되돌리기(d);
    if (글 == null) { st(d < 0 ? "더 되돌릴 것이 없습니다." : "더 갈 곳이 없습니다."); return; }
    $("ssText").value = 글;
    색칠갱신();
    await 다시읽기(S, { st });
    저장예약();
    st(d < 0 ? "되돌렸습니다." : "다시 했습니다.", "ok");
  };
  $("ssUndo").addEventListener("click", () => 되돌리기적용(-1));
  $("ssRedo").addEventListener("click", () => 되돌리기적용(1));
  $("ssText").addEventListener("keydown", ev => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    if (ev.key === "z" && !ev.shiftKey) { ev.preventDefault(); 되돌리기적용(-1); }
    else if (ev.key === "y" || (ev.key === "z" && ev.shiftKey)) { ev.preventDefault(); 되돌리기적용(1); }
  });
  $("ssName").addEventListener("input", 저장예약);

  /* ⌨ 이름 자동완성 — `<` 를 치면 쓸 수 있는 이름이 뜬다.
     이름을 외우거나 문법서를 열어 보러 가지 않아도 되게. */
  자동완성붙이기($("ssText"), { 목록: 쓸수있는이름 });

  /* 🔎 문법 검사 — 지금 편을 통째로 살펴 창으로 보여 준다 */
  $("ssLint").addEventListener("click", () => 검사창열기(st));

  /* 💬 자막 꾸미기 — 지금 대본의 모양을 그대로 들고 열고, 고친 것을 다시 글로 돌려받는다 */
  $("ssSubtitle").addEventListener("click", () => {
    const 지금모양 = 지금.doc?.stage?.subtitleDefaults?.() || undefined;
    // 미리보기에 지금 장면을 깔아 준다 — 실제 배경 위에서 읽히는지 봐야 뜻이 있다
    const 무대 = 지금.doc?.stage;
    openSubtitleStudio({
      값: 지금모양,
      글: 첫자막() || "여기에 자막이 나옵니다",
      비율: (지금.doc?.meta?.비율) || "9:16",
      /* 원래 자막은 빼고 배경만 깐다 — 고치는 중인 자막 하나만 보여야 비교가 된다 */
      배경그리기: 무대 ? (ctx, box) =>
        무대.drawAt(ctx, box, 지금.t || 0.3, { 자막빼고: true }) : null,
      넣기: (o, 한줄, { 머리말 }) => {
        // 편 전체에 걸리게 머리말로 넣는다 (줄마다 적으면 대본이 지저분해진다)
        const 글 = $("ssText").value;
        const 씻은것 = 글.split("\n").filter(l => !/^자막[가-힣]*\s*:/.test(l.trim()));
        const 첫빈줄 = 씻은것.findIndex(l => !l.trim());
        const 넣을자리 = 첫빈줄 < 0 ? 0 : 첫빈줄;
        씻은것.splice(넣을자리, 0, ...머리말.split("\n").filter(Boolean));
        $("ssText").value = 씻은것.join("\n");
        $("ssText").dispatchEvent(new Event("input", { bubbles: true }));
        st("자막 모양을 대본 머리말에 넣었습니다.", "ok");
      },
    });
  });

  /** 대본에 이미 있는 첫 자막 — 미리보기에 진짜 글을 띄우려고 */
  function 첫자막() {
    const m = ($("ssText").value || "").match(/^\s*자막\s+"([^"]*)"/m);
    return m ? m[1] : "";
  }

  $("ssNew").addEventListener("click", async () => {
    if (!S.열린것) return;
    const r = await 보내기("/api/project/story/save", {
      id: S.열린것.id, name: "새 이야기", text: 새대본 });
    if (r?.sid) { await 다시불러오기(S); 편열기(S, r.sid, { st, 보내기, refresh }); st("새 이야기를 만들었습니다.", "ok"); }
  });

  $("ssDup").addEventListener("click", async () => {
    if (!지금.sid) return;
    const r = await 보내기("/api/project/story/duplicate", { id: S.열린것.id, sid: 지금.sid });
    if (r?.sid) { await 다시불러오기(S); 편열기(S, r.sid, { st, 보내기, refresh }); st("베꼈습니다.", "ok"); }
  });

  $("ssDel").addEventListener("click", async () => {
    if (!지금.sid) return;
    const s = (S.상세?.stories || []).find(x => x.sid === 지금.sid);
    if (!confirm(`'${s?.name}' 이야기를 지울까요?`)) return;
    await 보내기("/api/project/story/delete", { id: S.열린것.id, sid: 지금.sid });
    지금.sid = null;
    await 다시불러오기(S);
    if (S.상세?.stories?.length) 편열기(S, S.상세.stories[0].sid, { st, 보내기, refresh });
    else 빈화면();
    st("지웠습니다.");
  });

  $("ssPlay").addEventListener("click", () => {
    지금.재생 = true; 지금.t0 = performance.now() - 지금.t * 1000;
  });
  $("ssStop").addEventListener("click", () => { 지금.재생 = false; 지금.t = 0; 그리기(); });
  $("ssSeek").addEventListener("input", () => {
    지금.재생 = false;
    지금.t = (지금.doc?.seconds || 0) * $("ssSeek").value / 1000;
    그리기();
  });
  addEventListener("resize", () => {
    if (!지금.doc) return;
    const { 가로, 세로 } = videoSize(지금.doc.stage, { 긴변: 1280 });
    칸맞추기(가로, 세로); 그리기();
  });

  const 돌기 = now => {
    지금.raf = requestAnimationFrame(돌기);
    if (!지금.재생 || !지금.doc?.seconds) return;
    지금.t = (now - 지금.t0) / 1000;
    if (지금.t >= 지금.doc.seconds) { 지금.t = 0; 지금.t0 = now; }
    그리기();
  };
  지금.raf = requestAnimationFrame(돌기);
}

/** 지금 편을 서버에 저장 (미리보기 그림까지) */
async function 저장하기(S, { st, 보내기, refresh }) {
  if (!지금.sid || !S.열린것) return;
  const doc = 지금.doc;
  if (!doc) return;
  const 쓰는것 = doc.needs();
  const r = await 보내기("/api/project/story/save", {
    id: S.열린것.id, sid: 지금.sid,
    name: $("ssName").value, text: $("ssText").value,
    seconds: doc.seconds, scenes: doc.sceneCount,
    missing: doc.missingWithPrompts(),
    uses: { 배우: 쓰는것.배우, 배경: 쓰는것.배경 },
    music_prompt: doc.music.suno,
    thumb: S.미리보기그림 ? S.미리보기그림(doc) : "",
  });
  if (r) { await 다시불러오기(S); await refresh(); st("저장했습니다.", "ok"); }
}

/** 프로젝트 원본을 다시 읽어 목록을 새로 그린다 */
async function 다시불러오기(S) {
  try {
    const d = await (await fetch(`/api/project/get?id=${S.열린것.id}`)).json();
    S.상세 = d.item;
    S.열린것 = d.brief || S.열린것;
  } catch {}
  목록그리기(S);
}
