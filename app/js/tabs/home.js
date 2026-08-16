/* 🏠 작업실 — 만드는 일이 모두 여기서 일어난다.
 *
 *   [프로젝트 목록]  →  [프로젝트 안]  →  📜 스토리 · 🎭 쓰는 것 · 🎵 음악 · 🎞 이어붙이기 · 🔥 굽기
 *
 * 편집 프로그램(다빈치)의 짜임을 빌렸다. 다만 트랙을 여러 겹 쌓지 않는다 —
 * 우리가 만드는 것은 '이야기를 순서대로 잇는' 것이라 한 줄이면 충분하다.
 *
 * 가장 중요한 약속: **화면에서 되는 일은 전부 글(문법)로도 된다.**
 * [📥 글로 한 번에 만들기] 가 그 입구다. LLM 이 써 준 글 한 덩어리로 수백 편을 만든다.
 */
import { $, escapeHtml, statusBox } from "../core.js";
import { StoryDoc } from "../story/doc.js";
import { library } from "../story/assets.js";
import { BakeQueue } from "../story/queue.js";
import { videoSize, bakeVideo, waitJob } from "../story/render.js";
import { drawNeeds, summarizeNeeds, promptFor, makeImage } from "../story/needs.js";
import { buildLexicon } from "../story/lexicon.js";
import { openGuide } from "../ui/guide_modal.js";
import { buildGuide, downloadGuide, GUIDE_VERSION } from "../story/guide.js";
import { openModal } from "../ui/modal.js";
import { parseProject, inspectProject, projectToText, writeProject } from "../story/project.js";
import { mountStoryStep, 밀린대본저장 } from "../workshop/story_step.js";
import { mountUsesStep } from "../workshop/uses_step.js";
import { mountMusicStep } from "../workshop/music_step.js";
import { mountJoinStep } from "../workshop/join_step.js";
import { mountBakeStep } from "../workshop/bake_step.js";
import { lintScript } from "../story/lint.js";
import { openBulkUpload } from "../ui/bulk_upload.js";
import { openPasteProject } from "../ui/paste_project.js";
import { 밀기, 빼기 } from "../ui/nav.js";

export const 상태색 = {
  /* 이 색은 점(●)이자 **글씨 색**으로도 쓰인다. 예전 #7a7166 은 줄 바탕 위에서
     4.4:1 밖에 안 돼 "비어 있음" 이 잘 안 읽혔다. 회갈색 느낌은 그대로 두고 밝기만 올렸다. */
  "빈프로젝트": { c: "#9c9184", ko: "비어 있음",   i: "📁" },
  "빈대본":    { c: "#9c9184", ko: "대본 비었음", i: "📝" },
  "그림부족":  { c: "#d97706", ko: "그림 부족",   i: "⚠" },
  "임시그림":  { c: "#0891b2", ko: "임시 그림",   i: "🎨" },
  "준비됨":    { c: "#2563eb", ko: "구울 준비됨", i: "🎬" },
  "굽는중":    { c: "#7c3aed", ko: "굽는 중",     i: "⏳" },
  "완성":      { c: "#16a34a", ko: "완성",        i: "✅" },
};

const 보기글 = `프로젝트: 댕댕이 시리즈
비율: 9:16
해상도: 1280
초당장수: 30
음악프롬프트: warm acoustic ukulele, cozy, gentle 90bpm
이어붙이기: 사이 0.4초

== 이야기 첫 만남
장면 <공원 잔디밭>   전환:페이드   분위기:아침
  <누렁이 강아지> 등장 가운데 크기:0.7 동작:breathe
  자막 "안녕! 나는 누렁이야"   등장:타이핑   소리:톡
  <누렁이 강아지> 상태 기쁨
  자막 "오늘은 뭘 해 볼까?"

== 이야기 밤바다 산책
장면 <밤바다>   전환:흐림   분위기:밤
  <누렁이 강아지> 등장 왼쪽 크기:0.6
  카메라 따라가기 누렁이 강아지
  자막 "파도 소리가 좋아"   효과:반짝임
  <누렁이 강아지> 이동 오른쪽 2초
  <누렁이 강아지> 상태 사랑
  자막 "내일 또 오자"
`;

export async function mount() {
  const st = statusBox($("wsStatus"));
  const S = {
    items: [], needs: [], counts: {},
    열린것: null,            // 지금 들어가 있는 프로젝트 (요약)
    상세: null,              // 그 프로젝트의 원본 (스토리 글까지)
    단계: "story",
    queue: null,
  };
  window.Workshop = S;                       // 다른 화면에서 들여다볼 수 있게
  S.queue = new BakeQueue({ onChange: drawQueue });

  /* ══ 📚 시리즈 (프로젝트 그룹) ══
     시리즈물은 캐릭터를 여러 편이 함께 쓴다. 그래서 '그룹 안에서 공유' 가 맞다.
     자산은 폴더를 옮기지 않고 소속만 적어 두며, 비워 두면 **공용**이라 모든 시리즈에서 보인다. */
  S.그룹 = localStorage.getItem("ws그룹") || "";
  S.그룹들 = [];

  async function 그룹읽기() {
    try {
      const d = await (await fetch("/api/group/list")).json();
      S.그룹들 = d.items || [];
      S.공용자산 = d.공용자산 || {};
      S.묶이지않은 = d.묶이지않은프로젝트 || 0;
    } catch { S.그룹들 = []; }
    if (S.그룹 && !S.그룹들.some(g => g.id === S.그룹) && S.그룹 !== "__none") S.그룹 = "";
    그룹그리기();
  }

  function 그룹그리기() {
    const 지금 = S.그룹들.find(g => g.id === S.그룹);
    $("wsGroup").innerHTML =
      `<option value="">전체 보기</option>` +
      S.그룹들.map(g => `<option value="${g.id}" ${g.id === S.그룹 ? "selected" : ""}
        >${escapeHtml(g.name)} (${g.프로젝트}편묶음)</option>`).join("") +
      (S.묶이지않은 ? `<option value="__none" ${S.그룹 === "__none" ? "selected" : ""}
        >— 아직 안 묶인 것 (${S.묶이지않은})</option>` : "");
    const 공 = S.공용자산 || {};
    $("wsGroupInfo").textContent = 지금
      ? `${지금.프로젝트}개 프로젝트 · ${지금.편}편 · 자산 배경 ${지금.자산.배경} · 캐릭터 ${지금.자산.캐릭터}` +
        `　(공용 배경 ${공.배경 || 0} · 캐릭터 ${공.캐릭터 || 0} 도 함께 씁니다)`
      : `시리즈를 고르면 그 안의 프로젝트와 자산만 봅니다. 공용 자산은 어느 시리즈에서나 보입니다.`;
  }

  $("wsGroup").addEventListener("change", async () => {
    S.그룹 = $("wsGroup").value;
    localStorage.setItem("ws그룹", S.그룹);
    library.setGroup(S.그룹);        // 미리보기·굽기도 이 시리즈 자산만 쓴다
    보인수 = 한뭉치;
    그룹그리기();
    md정보();                    // 어느 시리즈 자산이 담기는지 다시 알려 준다
    await refresh();
  });
  $("wsGroupNew").addEventListener("click", async () => {
    const 이름 = prompt("새 시리즈 이름", "새 시리즈");
    if (!이름) return;
    const r = await 보내기("/api/group/save", { name: 이름 });
    if (r?.id) {
      S.그룹 = r.id; localStorage.setItem("ws그룹", S.그룹);
      library.setGroup(S.그룹);
      await 그룹읽기(); await refresh();
      st(`"${r.item.name}" 시리즈를 만들었습니다.`, "ok");
    }
  });
  /** 프로젝트 하나를 다른 시리즈로 옮긴다 (목록에서 바로).
   *  자산과 달리 프로젝트는 '소속' 이 곧 자기 것이라 그냥 바꿔 적으면 된다.
   *  다만 보고 있는 시리즈 **밖으로** 내보내면 목록에서 사라지므로 그렇다고 말해 준다. */
  async function 시리즈옮기기(pid, 갈곳) {
    const 그것 = S.items.find(x => x.id === pid);
    if (!그것) return;
    if (갈곳 === "__new") {
      const 이름 = prompt("새 시리즈 이름", "새 시리즈");
      if (!이름) { drawCards(); return; }             // 취소하면 고르개를 되돌린다
      const r = await 보내기("/api/group/save", { name: 이름 });
      if (!r?.id) { st("시리즈를 만들지 못했습니다.", "err"); drawCards(); return; }
      갈곳 = r.id;
      await 그룹읽기();
    }
    const 이름 = 갈곳 ? (S.그룹들.find(g => g.id === 갈곳) || {}).name : "안 묶임";
    try {
      const r = await 보내기("/api/group/assign", { group: 갈곳, 프로젝트: [pid] });
      if (!r) throw new Error("옮기지 못했습니다.");
      그것.group = 갈곳;                               // 다시 읽기 전에 화면부터 맞춘다
      const 사라지나 = S.그룹 && S.그룹 !== "__none" && 갈곳 !== S.그룹;
      library.clear();
      await 그룹읽기();
      await refresh();
      st(`📚 "${그것.name}" → ${이름}` +
         (사라지나 ? " (보고 있는 시리즈 밖이라 목록에서 빠집니다)" : ""), "ok");
    } catch (e) { st("⚠ " + e.message, "err"); drawCards(); }
  }

  /* ══ 📄 이 시리즈로 대본 쓰기 ══
     문법 + **지금 이 시리즈에서 쓸 수 있는 자산**을 한 글에 담아 내보낸다.
     밖의 LLM 에 통째로 주면 없는 캐릭터를 부르는 대본이 오지 않는다. */
  const 글만들기 = () => buildGuide({ group: S.그룹 && S.그룹 !== "__none" ? S.그룹 : "" });

  async function md정보() {
    try {
      const 글 = await 글만들기();
      const 시 = S.그룹들.find(g => g.id === S.그룹);
      $("wsMdInfo").textContent =
        `v${GUIDE_VERSION} · ${글.length.toLocaleString()}자` +
        (시 ? ` · "${시.name}" 자산만 담깁니다` : " · 모든 자산이 담깁니다");
    } catch { $("wsMdInfo").textContent = "문법 + 지금 쓸 수 있는 자산을 한 글에 담습니다"; }
  }

  $("wsMdView")?.addEventListener("click", () => openGuide(st));
  $("wsMdCopy")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(await 글만들기());
      st("📋 복사했습니다 — LLM 채팅창에 붙여 넣고 \"이 문법으로 대본 써 줘\" 하세요.", "ok");
    } catch { st("복사하지 못했습니다.", "err"); }
  });
  $("wsMdDown")?.addEventListener("click", async () => {
    try {
      const 이름 = await downloadGuide({ group: S.그룹 && S.그룹 !== "__none" ? S.그룹 : "" });
      st(`📥 내려받았습니다: ${이름}`, "ok");
    } catch (e) { st("⚠ " + e.message, "err"); }
  });

  /* 📥 자산 한 번에 올리기 — 지금 보고 있는 시리즈로 곧장 들어간다 */
  $("wsBulk").addEventListener("click", () => openBulkUpload({
    group: S.그룹 && S.그룹 !== "__none" ? S.그룹 : "",
    끝나면: async ({ 됨, 안됨 }) => {
      await 그룹읽기();
      await refresh();
      st(`📥 자산 ${됨}개를 올렸습니다.` + (안됨 ? ` (${안됨}개 실패)` : ""), 안됨 ? "err" : "ok");
    },
  }));

  $("wsGroupEdit").addEventListener("click", async () => {
    const g = S.그룹들.find(x => x.id === S.그룹);
    if (!g) { st("먼저 시리즈를 고르세요.", "err"); return; }
    const 이름 = prompt("시리즈 이름", g.name);
    if (!이름) return;
    const r = await 보내기("/api/group/save", { id: g.id, name: 이름 });
    if (r) { await 그룹읽기(); st("이름을 바꿨습니다.", "ok"); }
  });
  $("wsGroupDel").addEventListener("click", async () => {
    const g = S.그룹들.find(x => x.id === S.그룹);
    if (!g) { st("먼저 시리즈를 고르세요.", "err"); return; }
    const 창 = openModal({
      제목: "🗑 시리즈를 지울까요?", 너비: "min(440px,94vw)", 높이: "auto",
      내용: `<div style="line-height:1.9"><b style="font-size:15px">${escapeHtml(g.name)}</b>
        <div class="hint" style="margin-top:8px">
          프로젝트 ${g.프로젝트}개 · 편 ${g.편}개 · 자산 배경 ${g.자산.배경} · 캐릭터 ${g.자산.캐릭터}<br>
          <b style="color:var(--ok,#7bd88f)">아무것도 사라지지 않습니다.</b>
          묶음만 풀려서 모두 '공용'이 됩니다.</div></div>`,
      단추: [{ 글: "🗑 묶음 풀기", 강조: true, 할일: async () => {
        창.닫기();
        const r = await 보내기("/api/group/delete", { id: g.id });
        S.그룹 = ""; localStorage.setItem("ws그룹", "");
        await 그룹읽기(); await refresh();
        st(`${r?.푼것 || 0}개를 공용으로 풀었습니다.`, "ok");
      } }],
    });
  });

  /* ── 서버에서 읽기 ── */
  async function refresh() {
    try {
      const 쿼리 = S.그룹 ? `?group=${encodeURIComponent(S.그룹)}` : "";
      const d = await (await fetch("/api/project/list" + 쿼리)).json();
      S.items = d.items || [];
      S.needs = d.needs || [];
      S.counts = d.counts || {};
      await library.refresh(true);
      if (S.열린것) {
        const 새것 = S.items.find(x => x.id === S.열린것.id);
        if (새것) S.열린것 = 새것; else 목록으로();
      }
      drawStats(); drawCards(); drawNeedList(); drawAssets();
      // 대본까지 훑는 일이라 화면이 다 그려진 뒤에 뒤따라 돈다 (목록이 늦지 않게)
      if (!S.열린것) setTimeout(() => 문제살펴보기().catch(() => {}), 60);
      if (S.열린것) 단계그리기();
      $("wsWhen").textContent = new Date().toLocaleTimeString("ko-KR",
        { hour: "2-digit", minute: "2-digit" }) + " 기준";
    } catch (e) { st("⚠ " + e.message, "err"); }
  }
  S.refresh = refresh;

  /* ══════════ 프로젝트 목록 ══════════ */
  function drawStats() {
    const 순서 = ["그림부족", "임시그림", "준비됨", "완성", "빈대본", "빈프로젝트"];
    const 총초 = S.items.reduce((a, b) => a + (b.seconds || 0), 0);
    const 편수 = S.items.reduce((a, b) => a + (b.story_count || 0), 0);
    // 상태 숫자는 누르면 그 상태만 걸러 준다 (한 번 더 누르면 해제)
    $("wsStats").innerHTML =
      순서.filter(k => S.counts[k]).map(k => {
        const s = 상태색[k] || 상태색["빈대본"];
        const 켬 = 상태거르기 === k;
        return `<span class="vitem" data-상태="${k}" title="눌러서 이 상태만 보기"
             style="padding:8px 14px; border-left:4px solid ${s.c}; cursor:pointer;
                    ${켬 ? `outline:2px solid ${s.c}; background:#2a2533` : ""}">
          <b style="font-size:19px; color:${s.c}">${S.counts[k]}</b>
          <span class="hint" style="margin-left:6px">${s.i} ${s.ko}</span></span>`;
      }).join("") +
      `<span class="vitem" style="padding:8px 14px">
        <b style="font-size:19px">${S.items.length}</b><span class="hint" style="margin-left:6px">프로젝트</span>
        <b style="font-size:19px; margin-left:12px">${편수}</b><span class="hint" style="margin-left:6px">편</span>
        <span class="hint" style="margin-left:10px">모두 ${Math.floor(총초 / 60)}분 ${Math.round(총초 % 60)}초</span></span>` +
      (상태거르기 ? `<button class="ghost small" id="wsClearFilter" type="button">✕ 거르기 해제</button>` : "");

    $("wsStats").querySelectorAll("[data-상태]").forEach(el =>
      el.addEventListener("click", () => {
        상태거르기 = 상태거르기 === el.dataset.상태 ? null : el.dataset.상태;
        보인수 = 한뭉치;
        drawStats(); drawCards();
      }));
    $("wsClearFilter")?.addEventListener("click", () => {
      상태거르기 = null; 보인수 = 한뭉치; drawStats(); drawCards();
    });
  }

  /* ── 프로젝트 목록 ──
     수백 개가 되어도 버티도록 세 가지를 지킨다.
       ① 한 번에 다 그리지 않는다 (한 뭉치씩 · [더 보기])
       ② 그림은 보일 때 받는다 (loading="lazy") — 안 그러면 썸네일 수백 장을 한꺼번에 부른다
       ③ 찾을 길을 준다 (찾기 · 정렬 · 상태 거르기 · 줄로 보기)  */
  const 한뭉치 = 48;
  let 보인수 = 한뭉치;
  let 줄보기 = localStorage.getItem("ws보기") === "줄";
  let 상태거르기 = null;             // 상태 칩을 누르면 그 상태만

  function 고른목록() {
    let list = S.items;
    if (상태거르기) list = list.filter(x => x.state === 상태거르기);
    if ($("wsOnlyTodo").checked) list = list.filter(x => x.state !== "완성");
    const 말 = ($("wsFind").value || "").trim().toLowerCase();
    if (말) {
      list = list.filter(p =>
        (p.name || "").toLowerCase().includes(말) ||
        (p.배우 || []).some(n => n.toLowerCase().includes(말)) ||
        (p.배경 || []).some(n => n.toLowerCase().includes(말)));
    }
    const 방식 = $("wsSort").value;
    const 정렬 = {
      "최근": (a, b) => b.updated - a.updated,
      "오래된": (a, b) => a.updated - b.updated,
      "이름": (a, b) => (a.name || "").localeCompare(b.name || "", "ko"),
      "긴것": (a, b) => b.seconds - a.seconds,
      "편많은": (a, b) => b.story_count - a.story_count,
    }[방식];
    return 정렬 ? [...list].sort(정렬) : list;
  }

  /** 이 프로젝트가 어느 시리즈에 있나 — 목록에서 바로 바꾼다.
   *  들어갔다 나오지 않고 옮길 수 있어야 여러 편을 정리할 때 손이 덜 간다. */
  function 시리즈고르개(p) {
    return `<select class="wsPjGroup" data-그룹바꿈="${p.id}" title="이 프로젝트가 속한 시리즈"
              style="max-width:150px; padding:2px 6px; font-size:11px">
      <option value="" ${!p.group ? "selected" : ""}>— 안 묶임</option>
      ${S.그룹들.map(g => `<option value="${g.id}" ${g.id === p.group ? "selected" : ""}
        >${escapeHtml(g.name)}</option>`).join("")}
      <option value="__new">＋ 새 시리즈…</option>
    </select>`;
  }

  function 카드하나(p) {
    const s = 상태색[p.state] || 상태색["빈대본"];
    const 배우 = (p.배우 || []).slice(0, 4);
    const 길이 = `${Math.floor(p.seconds / 60)}분 ${Math.round(p.seconds % 60)}초`;
    /* 0초는 영상이 안 나온다 — 이름을 붉게 해서 목록에서 바로 보이게 */
    const 빈것 = !p.seconds;
    const 이름색 = 빈것 ? ' style="color:#ff7a7a"' : "";
    const 빈표 = 빈것 ? ' <span style="color:#ff7a7a; font-size:11px">0초</span>' : "";
    if (줄보기) {
      /* 줄 보기는 **촘촘한 표**여야 한다 — 많을 때 훑어보려고 쓰는 것이다.
         그림은 작은 색점으로 줄이고 한 줄을 낮게 눌러 한 화면에 많이 담는다. */
      return `<div class="vitem" data-open="${p.id}" style="cursor:pointer; gap:8px;
                   padding:3px 10px; min-height:0; border-left:3px solid ${s.c}">
        <span style="width:9px; height:9px; border-radius:50%; background:${s.c};
                     flex:none" title="${s.ko}"></span>
        <span class="vname" style="flex:1; font-size:12px"${이름색}>${escapeHtml(p.name)}${빈표}</span>
        <span class="vinfo" style="width:88px; font-size:11px; color:${s.c}">${s.ko}</span>
        <span class="vinfo" style="width:128px; font-size:11px">${p.story_count}편 · ${길이}</span>
        <span class="vinfo" style="flex:1; font-size:11px">${
          배우.length ? "🐕 " + escapeHtml(배우.join(", ")) : ""}</span>
        <span class="vinfo" style="width:84px; font-size:11px; opacity:.6">${p.date}</span>
        ${시리즈고르개(p)}
        <button class="ghost small danger" data-지움="${p.id}" title="이 프로젝트 지우기"
                style="padding:1px 7px">✕</button>
      </div>`;
    }
    return `<div class="vitem" data-open="${p.id}" style="flex-direction:column; align-items:stretch;
               gap:6px; cursor:pointer; border-top:3px solid ${s.c}; padding:10px">
      <div style="height:118px; border-radius:8px; overflow:hidden; background:#231f2b;
                  display:flex; align-items:center; justify-content:center">
        <img loading="lazy" src="/api/project/thumb?id=${p.id}"
             style="max-width:100%;max-height:100%;object-fit:contain"
             onerror="this.style.display='none';this.parentNode.textContent='${s.i}'">
      </div>
      <b style="font-size:13px${빈것 ? "; color:#ff7a7a" : ""}">${escapeHtml(p.name)}${빈표}</b>
      <span class="hint" style="color:${s.c}">${s.i} ${s.ko}</span>
      <span class="hint">${p.story_count}편 · ${길이}</span>
      <span class="hint" style="opacity:.85">${배우.length ? "🐕 " + escapeHtml(배우.join(", ")) : "배우 없음"}${
        (p.배우 || []).length > 4 ? " 외" : ""}</span>
      <div class="charRow" style="align-items:center; gap:5px">
        <span style="font-size:11px">📚</span>${시리즈고르개(p)}
      </div>
      <span class="hint" style="opacity:.6">${p.date}
        <button class="ghost small danger" data-지움="${p.id}" title="이 프로젝트 지우기"
                style="float:right; padding:1px 7px">✕</button></span>
    </div>`;
  }

  function drawCards() {
    const list = 고른목록();
    const 전체 = S.items.length;
    $("wsCount").textContent = list.length === 전체
      ? `${전체}개` : `${list.length} / ${전체}개`;
    $("wsView").textContent = 줄보기 ? "▦ 카드로 보기" : "☰ 줄로 보기";
    const 칸 = $("wsCards");
    칸.style.display = 줄보기 ? "block" : "grid";
    칸.className = 줄보기 ? "vlist" : "";

    if (!list.length) {
      칸.innerHTML = `<div class="hint" style="padding:14px">${전체
        ? "찾는 것이 없습니다. 검색어나 거르기를 지워 보세요."
        : "아직 프로젝트가 없습니다. [＋ 새 프로젝트] 또는 [📥 글로 한 번에 만들기]로 시작하세요."}</div>`;
      $("wsMore").style.display = "none";
      return;
    }
    const 보일것 = list.slice(0, 보인수);
    칸.innerHTML = 보일것.map(카드하나).join("");
    칸.querySelectorAll("[data-open]").forEach(el =>
      el.addEventListener("click", ev => {
        // 고르개를 만지는 것은 '열기' 가 아니다
        if (ev.target.closest("select, button")) return;
        프로젝트열기(el.dataset.open);
      }));
    칸.querySelectorAll("[data-지움]").forEach(b =>
      b.addEventListener("click", ev => { ev.stopPropagation(); 지우기물어보기(b.dataset.지움); }));
    칸.querySelectorAll("[data-그룹바꿈]").forEach(sel => {
      sel.addEventListener("click", ev => ev.stopPropagation());
      sel.addEventListener("change", ev => {
        ev.stopPropagation();
        시리즈옮기기(sel.dataset.그룹바꿈, sel.value);
      });
    });

    const 남음 = list.length - 보일것.length;
    $("wsMore").style.display = 남음 > 0 ? "" : "none";
    $("wsMore").textContent = `더 보기 (${남음}개 남음)`;
  }

  /* 프로젝트 지우기 — 되돌릴 수 없으므로 무엇을 잃는지 보여 주고 한 번 더 묻는다 */
  function 지우기물어보기(id) {
    const p = S.items.find(x => x.id === id);
    if (!p) return;
    const 편 = p.story_count || 0;
    const 구운것 = (p.videos || []).length +
      (p.stories || []).reduce((a, b) => a + (b.videos || []).length, 0);
    const 창 = openModal({
      제목: "🗑 프로젝트를 지울까요?",
      너비: "min(460px, 94vw)", 높이: "auto",
      내용: `<div style="line-height:1.9">
        <b style="font-size:15px">${escapeHtml(p.name)}</b>
        <div class="hint" style="margin-top:8px">
          이야기 <b>${편}편</b> · 길이 ${Math.floor(p.seconds / 60)}분 ${Math.round(p.seconds % 60)}초<br>
          ${(p.배우 || []).length ? "배우 " + escapeHtml((p.배우 || []).join(", ")) + "<br>" : ""}
          대본과 설정이 <b style="color:var(--warn,#e0a458)">모두 사라지고 되돌릴 수 없습니다.</b><br>
          ${구운것 ? `이미 구운 영상 ${구운것}개는 히스토리에 그대로 남습니다.`
                   : "구운 영상은 없습니다."}
        </div></div>`,
      단추: [{
        글: "🗑 정말 지우기", 강조: true,
        할일: async () => {
          창.닫기();
          await 보내기("/api/project/delete", { id });
          st(`"${p.name}" 을(를) 지웠습니다.`, "ok");
          await refresh();
        },
      }],
    });
  }

  /* 찾기·정렬·보기 방식을 바꾸면 처음부터 다시 센다 */
  const 다시세기 = () => { 보인수 = 한뭉치; drawCards(); };
  let 찾기타이머 = null;
  $("wsFind").addEventListener("input", () => {
    clearTimeout(찾기타이머);
    찾기타이머 = setTimeout(다시세기, 200);      // 글자마다 다시 그리면 느리다
  });
  $("wsSort").addEventListener("change", 다시세기);
  $("wsMore").addEventListener("click", () => { 보인수 += 한뭉치; drawCards(); });
  $("wsView").addEventListener("click", () => {
    줄보기 = !줄보기;
    localStorage.setItem("ws보기", 줄보기 ? "줄" : "카드");
    다시세기();
  });

  function drawNeedList() {
    const 묶음 = { 전체: S.needs, 자동: S.needs.filter(n => n.자동),
                   막힘: S.needs.filter(n => !n.자동), 이야기수: S.items.length };
    $("wsNeedInfo").textContent = summarizeNeeds(묶음);
    drawNeeds($("wsNeeds"), 묶음, {
      프롬프트: async n => {
        try {
          await navigator.clipboard.writeText(promptFor(n));
          st(`"${n.이름}" 프롬프트를 복사했습니다.`, "ok");
        } catch { st(promptFor(n)); }
      },
      올리기: async n => 자산탭으로(n.종류 === "배경" ? "bg" : "manage"),
      만들기: async n => {
        st(`✨ "${n.이름}" 그리는 중… (한 장에 30초 안팎)`);
        try {
          const 만든것 = await makeImage(n, note => st(`✨ ${n.이름} — ${note}`));
          st(`✅ "${만든것.name}" 를 만들어 자산에 넣었습니다.`, "ok");
          await refresh();
        } catch (e) { st("⚠ 만들기 실패: " + e.message, "err"); }
      },
    });
  }

  async function 자산탭으로(하위) {
    document.querySelector('nav#tabs [data-tab="charTab"]')?.click();
    if (window.ensureTab) await window.ensureTab("charTab");
    for (let i = 0; i < 12; i++) {
      if (window.자산탭열기) { window.자산탭열기(하위); return; }
      await new Promise(r => setTimeout(r, 120));
    }
  }

  function drawAssets() {
    const 칸 = (icon, 이름, n, sub) =>
      `<button class="ghost small" data-가기하위="${sub}"
        style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 12px">
        <b>${icon} ${n}</b><span class="hint">${이름}</span></button>`;
    $("wsAssets").innerHTML =
      칸("🐕", "캐릭터", library.characters.length, "manage") +
      칸("🏞", "배경", library.backgrounds.length, "bg") +
      칸("😊", "표정·부위", "설정", "face") +
      `<button class="ghost small" data-히스토리="1"
        style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 12px">
        <b>🗂 보기</b><span class="hint">만든 영상</span></button>`;
    $("wsAssets").querySelectorAll("[data-가기하위]").forEach(b =>
      b.addEventListener("click", () => 자산탭으로(b.dataset.가기하위)));
    $("wsAssets").querySelector("[data-히스토리]")?.addEventListener("click", () =>
      document.querySelector('nav#tabs [data-tab="historyTab"]')?.click());
  }

  function drawQueue() {
    const q = S.queue, s = q.summary;
    $("wsQueueInfo").textContent = q.items.length
      ? `${s.완료}/${s.전체} 완료${s.실패 ? ` · 실패 ${s.실패}` : ""}` : "";
    $("wsQueue").innerHTML = q.items.length
      ? q.items.map(it => {
          const mark = { 대기: "⏳", 굽는중: "🎬", 완료: "✅", 실패: "⚠", 중단: "⏹" }[it.state] || "";
          return `<div class="vitem"><span class="vname">${mark} ${escapeHtml(it.doc.title)}</span>
            <span class="vinfo">${escapeHtml(it.note || it.state)}</span></div>`;
        }).join("")
      : '<div class="hint">비어 있습니다.</div>';
  }
  $("wsBakeStop").addEventListener("click", () => { S.queue.stop(); st("굽기를 멈췄습니다."); });

  /* 🌙 준비된 것 전부 굽기 — 여러 프로젝트의 안 구운 편을 모아 줄 세운다.
     화면을 켜 둔 채 자리를 비워도 하나씩 굽는다. */
  $("wsBakeAll").addEventListener("click", async () => {
    const 대상 = [];
    for (const p of S.items) {
      for (const s of p.stories || []) {
        if ((s.videos || []).length) continue;          // 이미 구운 것은 건너뛴다
        if (!(s.seconds > 0)) continue;                 // 빈 대본은 건너뛴다
        대상.push({ p, s });
      }
    }
    if (!대상.length) { st("구울 것이 없습니다 (모두 구웠거나 대본이 비었습니다).", "ok"); return; }
    if (!confirm(`${대상.length}편을 차례로 굽습니다. 시간이 걸립니다. 시작할까요?`)) return;
    st(`${대상.length}편을 줄 세웠습니다.`);
    let 됨 = 0, 실패 = 0;
    for (const { p, s } of 대상) {
      if (S.queue.stopped) break;
      S.queue.mark?.(s.name, "굽는중");
      $("wsQueueInfo").textContent = `${됨 + 실패 + 1}/${대상.length} · ${p.name} › ${s.name}`;
      try {
        const d = await (await fetch(`/api/project/story?id=${p.id}&sid=${s.sid}`)).json();
        const doc = new StoryDoc(d.story?.text || "", s.name);
        await doc.build(library);
        if (!doc.sceneCount) throw new Error("장면 없음");
        const e = p.encode || {}, 음 = p.timeline?.음악 || {};
        const r = await bakeVideo(doc.stage, {
          이름: s.name, 비율: e.비율, 긴변: e.긴변, fps: e.fps,
          화질: { 가볍게: 0.55, 보통: 0.75, 좋게: 0.9 }[e.화질] || 0.75,
          음악: doc.stage?.doc?.meta?.음악 || 음.파일 || null,
          음악크기: 음.소리크기, 음악여닫이: 음.여닫이,
        }, prog => {
          $("wsQueueInfo").textContent =
            `${됨 + 실패 + 1}/${대상.length} · ${p.name} › ${s.name} · ${prog.percent}%`;
        });
        const done = await waitJob(r.job);
        if (done.state !== "done") throw new Error(done.error || "굽기 실패");
        await 보내기("/api/project/story/save",
          { id: p.id, sid: s.sid, videos: [...(s.videos || []), done.filename] });
        됨++;
      } catch (err) { 실패++; }
      줄그리기(대상, 됨, 실패);
    }
    st(`밤샘 굽기 끝 — 완성 ${됨}편${실패 ? ` · 실패 ${실패}편` : ""}`, 실패 ? "err" : "ok");
    await refresh();
  });

  function 줄그리기(대상, 됨, 실패) {
    $("wsQueue").innerHTML = 대상.slice(0, 40).map((x, i) => {
      const 표 = i < 됨 + 실패 ? "✅" : (i === 됨 + 실패 ? "🎬" : "⏳");
      return `<div class="vitem"><span class="vname">${표} ${escapeHtml(x.s.name)}</span>
        <span class="vinfo">${escapeHtml(x.p.name)}</span></div>`;
    }).join("");
  }

  $("wsCopyAll").addEventListener("click", async () => {
    if (!S.needs.length) { st("부족한 그림이 없습니다.", "ok"); return; }
    const 글 = S.needs.map(n => `# ${n.종류} · ${n.이름}\n${promptFor(n)}`).join("\n\n");
    try { await navigator.clipboard.writeText(글); st(`${S.needs.length}개 프롬프트를 복사했습니다.`, "ok"); }
    catch { st(글); }
  });
  $("wsOnlyTodo").addEventListener("change", () => { 보인수 = 한뭉치; drawCards(); });
  $("wsRefresh").addEventListener("click", refresh);
  $("wsHome").addEventListener("click", () => { if (S.열린것) 목록으로(); });

  /* ══ 🚨 손봐야 할 것 ══
     프로젝트를 하나씩 열어 보지 않고도 어디가 막혔는지 알게 한다.
     각 편의 대본을 실제로 살펴보므로(lint) 이름 오타까지 잡힌다. */
  async function 문제살펴보기() {
    const 알림 = $("wsTroubleInfo"), 칸 = $("wsTrouble");
    if (!알림 || !칸) return;
    알림.textContent = "살펴보는 중…";
    await library.refresh(true);

    const 모은것 = [];
    for (const p of S.items) {
      const 탈 = [];
      if (!p.story_count) 탈.push({ 등급: "경고", 글: "이야기가 하나도 없습니다" });
      else if (!p.seconds) 탈.push({ 등급: "경고", 글: "길이가 0초입니다 — 자막이 없습니다" });

      // 대본을 실제로 살펴본다 (편이 있는 것만)
      if (p.story_count) {
        try {
          const d = await (await fetch(`/api/project/get?id=${encodeURIComponent(p.id)}`)).json();
          for (const s of d.item?.stories || []) {
            if (!String(s.text || "").trim()) {
              탈.push({ 등급: "경고", 글: `"${s.name}" 대본이 비었습니다`, sid: s.sid });
              continue;
            }
            const 살핌 = await lintScript(new StoryDoc(s.text).parsed);
            const 오류 = 살핌.filter(x => x.등급 === "오류");
            const 경고 = 살핌.filter(x => x.등급 === "경고");
            for (const x of [...오류, ...경고].slice(0, 4)) {
              탈.push({ 등급: x.등급, 글: `"${s.name}" ${x.line}줄 — ${x.msg}`, sid: s.sid });
            }
            const 남음 = 오류.length + 경고.length - 4;
            if (남음 > 0) 탈.push({ 등급: "경고", 글: `"${s.name}" 그 밖에 ${남음}개 더`, sid: s.sid });
          }
        } catch { /* 못 읽으면 그 프로젝트는 건너뛴다 */ }
      }
      if (탈.length) 모은것.push({ p, 탈 });
    }

    const 오류수 = 모은것.reduce((a, x) => a + x.탈.filter(t => t.등급 === "오류").length, 0);
    const 경고수 = 모은것.reduce((a, x) => a + x.탈.filter(t => t.등급 === "경고").length, 0);
    알림.textContent = 모은것.length
      ? `프로젝트 ${모은것.length}개 · ⛔ ${오류수} · ⚠ ${경고수}`
      : `프로젝트 ${S.items.length}개 모두 이상 없습니다`;

    if (!모은것.length) {
      칸.innerHTML = '<div class="hint" style="padding:10px; color:#7bd88f">' +
        '✅ 손볼 것이 없습니다. 그대로 구우면 됩니다.</div>';
      return;
    }
    칸.innerHTML = 모은것.map(({ p, 탈 }) => `
      <div style="border-left:3px solid ${탈.some(t => t.등급 === "오류") ? "#ff7a7a" : "#ffcf6c"};
           padding:6px 10px; margin-bottom:6px; background:#171520; border-radius:0 8px 8px 0">
        <div class="charRow" style="align-items:center">
          <b style="font-size:13px; cursor:pointer" data-열기="${p.id}"
             title="이 프로젝트 열기">${escapeHtml(p.name)}</b>
          <span class="hint">${p.story_count}편 · ${p.seconds.toFixed(0)}초</span>
          <span style="flex:1"></span>
          <button class="ghost small" data-고치러="${p.id}"
                  style="padding:1px 8px">고치러 가기</button>
        </div>
        ${탈.map(t => `<div style="font-size:12px; color:${
          t.등급 === "오류" ? "#ff7a7a" : "#ffcf6c"}; margin-top:2px">
          ${t.등급 === "오류" ? "⛔" : "⚠"} ${escapeHtml(t.글)}</div>`).join("")}
      </div>`).join("");

    칸.querySelectorAll("[data-열기],[data-고치러]").forEach(el =>
      el.addEventListener("click", () => 프로젝트열기(el.dataset.열기 || el.dataset.고치러)));
  }
  $("wsTroubleRefresh")?.addEventListener("click", 문제살펴보기);

  /* ── 새 프로젝트 ── */
  $("wsNew").addEventListener("click", async () => {
    const r = await 보내기("/api/project/save",
      { name: "새 프로젝트", group: S.그룹 && S.그룹 !== "__none" ? S.그룹 : "" });
    if (r?.id) { await refresh(); 프로젝트열기(r.id); }
  });

  /* ══════════ 📥 글로 한 번에 만들기 ══════════
     창은 ui/paste_project.js 가 통째로 맡는다 — 줄 번호·문법 검사·편 쪼개기까지.
     여기는 **만들어 달라는 부탁만** 한다 (어떻게 보여 줄지는 창이 안다). */
  $("wsPaste").addEventListener("click", () => {
    openPasteProject({
      보기글, 문법보기: () => openGuide(st),
      만들기: 한번에만들기,
    });
  });

  async function 한번에만들기(설정, 이야기들, 알림) {
    알림("프로젝트를 만드는 중…");
    const pj = await 보내기("/api/project/save", {
      name: 설정.이름 || "새 프로젝트",
      group: S.그룹 && S.그룹 !== "__none" ? S.그룹 : "",
      encode: { 비율: 설정.비율, 긴변: 설정.해상도, fps: 설정.fps, 화질: 설정.화질 },
      timeline: { 순서: [], 사이: 설정.이어붙이기.사이, 음악: 설정.음악 },
    });
    if (!pj?.id) throw new Error("프로젝트를 만들지 못했습니다.");

    let 만듦 = 0;
    for (const s of 이야기들) {
      const doc = new StoryDoc(s.글, s.이름);
      await doc.build(library);
      const 쓰는것 = doc.needs();
      await 보내기("/api/project/story/save", {
        id: pj.id, name: s.이름, text: s.글,
        seconds: doc.seconds, scenes: doc.sceneCount,
        missing: doc.missingWithPrompts(),
        uses: { 배우: 쓰는것.배우, 배경: 쓰는것.배경 },
        music_prompt: doc.music.suno, thumb: 미리보기그림(doc),
      });
      만듦++;
      알림(`${만듦}/${이야기들.length}편 만드는 중…`);
    }
    st(`✅ "${pj.item.name}" 에 ${만듦}편을 만들었습니다.`, "ok");
    await refresh();
    await 프로젝트열기(pj.id);

    /* 글에 `굽기: 각각|이어서|둘다` 라고 적었으면 그대로 굽는다.
       이것이 "글 한 덩어리 → 영상"을 끝까지 잇는 마지막 고리다. */
    const 굽기 = 설정.굽기;
    if (굽기 && 굽기 !== "안함") {
      단계열기("bake");
      st(`글에 적힌 대로 '${굽기}' 굽기를 시작합니다…`);
      for (let i = 0; i < 20 && !window.__굽기실행; i++) await new Promise(x => setTimeout(x, 150));
      if (window.__굽기실행) await window.__굽기실행(굽기);
      else st("굽기 화면을 못 열었습니다. 🔥 굽기 단계에서 눌러 주세요.", "err");
    }
  }

  function 미리보기그림(doc) {
    try {
      const { 가로, 세로 } = videoSize(doc.stage, { 긴변: 320 });
      const c = document.createElement("canvas");
      c.width = 가로; c.height = 세로;
      const g = c.getContext("2d");
      g.fillStyle = "#0f0d14"; g.fillRect(0, 0, c.width, c.height);
      if (doc.stage) doc.stage.drawAt(g, { x: 0, y: 0, w: c.width, h: c.height },
                                      Math.min(1.2, doc.seconds * 0.25));
      return c.toDataURL("image/jpeg", 0.72);
    } catch { return ""; }
  }
  S.미리보기그림 = 미리보기그림;

  /* ══════════ 프로젝트 안 ══════════ */
  /** @param 짓 {걸음:false} 뒤로가기가 부른 것이라 새 걸음을 안 쌓는다 */
  async function 프로젝트열기(id, 짓 = {}) {
    const brief = S.items.find(x => x.id === id);
    if (!brief) return;
    const 처음들어감 = !S.열린것;
    S.열린것 = brief;
    try {
      const d = await (await fetch(`/api/project/get?id=${id}`)).json();
      S.상세 = d.item;
    } catch { S.상세 = null; }
    $("wsList").style.display = "none";
    $("wsDetail").style.display = "";
    $("wsCrumb").textContent = "› " + brief.name;
    $("wsPjName").value = brief.name;
    단계열기(S.단계, { 걸음: false });
    /* 뒤로가기 한 번에 목록으로 돌아오게. 이미 프로젝트 안에서 딴 것으로 옮겨 간 것이면
       걸음을 겹쳐 쌓지 않는다 — 그러면 목록까지 나가는 데 두 번을 눌러야 한다. */
    if (짓.걸음 !== false && 처음들어감) 밀기("작업실:프로젝트", () => 목록으로({ 걸음: false }));
  }
  S.프로젝트열기 = 프로젝트열기;

  async function 목록으로(짓 = {}) {
    // 나가기 전에 밀린 자동 저장을 해치운다 — 방금 친 글이 사라지지 않게
    try { await 밀린대본저장(); } catch { /* 못 저장해도 나가기는 막지 않는다 */ }
    S.열린것 = null; S.상세 = null;
    $("wsList").style.display = "";
    $("wsDetail").style.display = "none";
    $("wsCrumb").textContent = "";
    문제살펴보기().catch(() => {});      // 나가면 곧바로 다시 훑는다
    /* 프로젝트 안에서 단계를 옮겨 다녔다면 그 걸음들도 함께 걷어낸다
       (제일 아래 걸음을 빼면 위엣것이 딸려 나온다) */
    if (짓.걸음 !== false) 빼기("작업실:프로젝트");
  }
  S.목록으로 = 목록으로;

  $("wsSteps").querySelectorAll("[data-step]").forEach(b =>
    b.addEventListener("click", () => 단계열기(b.dataset.step)));

  function 단계열기(name, 짓 = {}) {
    const 이전단계 = S.단계;
    S.단계 = name;
    $("wsSteps").querySelectorAll("[data-step]").forEach(b =>
      b.classList.toggle("on", b.dataset.step === name));
    ["story", "uses", "music", "join", "bake"].forEach(k => {
      const el = $("wsStep_" + k);
      if (el) el.style.display = k === name ? "" : "none";
    });
    단계그리기();
    // 단계를 옮긴 것도 한 걸음 — 🔥 굽기에서 뒤로 누르면 📜 스토리로 돌아온다
    if (짓.걸음 !== false && 이전단계 && 이전단계 !== name)
      밀기("작업실:단계:" + name, () => 단계열기(이전단계, { 걸음: false }));
  }
  S.단계열기 = 단계열기;

  const 단계함수 = { story: mountStoryStep, uses: mountUsesStep, music: mountMusicStep,
                     join: mountJoinStep, bake: mountBakeStep };
  function 단계그리기() {
    if (!S.열린것) return;
    const el = $("wsStep_" + S.단계);
    const fn = 단계함수[S.단계];
    $("wsPjInfo").textContent =
      `${S.열린것.story_count}편 · ${Math.floor(S.열린것.seconds / 60)}분 ${Math.round(S.열린것.seconds % 60)}초`;
    if (el && fn) fn(el, S, { st, 보내기, refresh });
  }
  S.단계그리기 = 단계그리기;

  /* 이름 고치기 — 다 치고 잠깐 멈추면 저장 (자동 저장) */
  let 이름타이머 = null;
  $("wsPjName").addEventListener("input", () => {
    clearTimeout(이름타이머);
    이름타이머 = setTimeout(async () => {
      if (!S.열린것) return;
      const r = await 보내기("/api/project/save", { id: S.열린것.id, name: $("wsPjName").value });
      if (r?.item) { $("wsCrumb").textContent = "› " + r.item.name; await refresh(); }
    }, 800);
  });

  $("wsPjDup").addEventListener("click", async () => {
    if (!S.열린것) return;
    const r = await 보내기("/api/project/duplicate", { id: S.열린것.id });
    if (r?.id) { st(`"${r.item.name}" 으로 베꼈습니다.`, "ok"); await refresh(); 프로젝트열기(r.id); }
  });

  $("wsPjDel").addEventListener("click", async () => {
    if (!S.열린것) return;
    if (!confirm(`'${S.열린것.name}' 프로젝트를 지울까요? (구운 영상은 남습니다)`)) return;
    await 보내기("/api/project/delete", { id: S.열린것.id });
    목록으로(); st("지웠습니다."); refresh();
  });

  $("wsPjCopyText").addEventListener("click", async () => {
    if (!S.상세) return;
    const 글 = projectToText(
      { name: S.상세.name, encode: S.상세.encode, timeline: S.상세.timeline },
      S.상세.stories);
    try { await navigator.clipboard.writeText(글); st("프로젝트를 문법 글로 복사했습니다.", "ok"); }
    catch { st(글); }
  });

  /* ── 📖 우리말 사전 ── */
  let 사전 = null;
  $("wsLex").addEventListener("click", async () => {
    const box = $("wsLexBox");
    if (box.style.display !== "none") { box.style.display = "none"; return; }
    box.style.display = "";
    if (!사전) {
      box.innerHTML = '<div class="hint">읽는 중…</div>';
      사전 = await buildLexicon();
    }
    box.innerHTML = `<div style="margin-bottom:10px; background:#141219; border-radius:8px; padding:10px">
        <b style="font-size:13px">📦 프로젝트 문법 — 이 글 한 덩어리로 프로젝트를 통째로 만듭니다</b>
        <div class="hint" style="margin-top:4px; white-space:pre-wrap; font-family:Consolas,monospace">${
          escapeHtml(writeProject({ 이름: "댕댕이 시리즈", 비율: "9:16", 해상도: 1280, fps: 30,
            음악: { 파일: "포근한밤.mp3", 소리크기: 0.7, 여닫이: 1.5 },
            이어붙이기: { 함: true, 사이: 0.4 }, 굽기: "둘다" },
            [{ 이름: "첫 편", 글: "장면 공원 잔디밭\n  누렁이 강아지 등장 가운데" }]))}</div>
      </div>` +
      사전.map(g => `<div style="margin-bottom:12px">
        <b style="font-size:13px">${g.제목}</b>
        <div class="hint" style="margin:2px 0 6px">${escapeHtml(g.설명 || "")}</div>
        ${g.낱말 ? `<div class="charRow" style="flex-wrap:wrap; gap:5px">${
          g.낱말.map(w => `<span class="vitem" style="padding:3px 8px; font-size:12px">${escapeHtml(w)}</span>`).join("")
        }</div>` : ""}
        ${g.항목 ? `<div class="vlist">${g.항목.map(it => `<div class="vitem">
          <span class="vname" style="font-family:Consolas,monospace; font-size:12px">${escapeHtml(it.말)}</span>
          <span class="vinfo">${escapeHtml(it.뜻)}</span>
          <span class="vinfo" style="opacity:.7; font-family:Consolas,monospace">${escapeHtml(it.보기 || "")}</span>
        </div>`).join("")}</div>` : ""}
      </div>`).join("");
  });

  /* ── 공통 보내기 ── */
  async function 보내기(url, body) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify(body) });
      const d = await r.json();
      if (d.error) { st("⚠ " + d.error, "err"); return null; }
      return d;
    } catch (e) { st("⚠ " + e.message, "err"); return null; }
  }
  S.보내기 = 보내기;

  await 그룹읽기();
  await refresh();
  md정보();                      // 문법 글이 몇 자인지·어느 시리즈 것인지 알려 준다
}
