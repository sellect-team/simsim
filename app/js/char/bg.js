/* 🏞 배경 관리 — 무대가 될 사진을 올리고 보관한다.
 *
 * 배경이 수십 장이 되면 **어디서 온 것인지**가 중요해진다.
 * 올린 것 / 엔진이 그린 것 / 콘티에서 자른 것 / 다듬은 것을 한눈에 갈라 본다.
 * 그림을 누르면 크게 봐서 실제로 쓸 만한지 확인한다.
 */
import { $, escapeHtml, statusBox, upload } from "../core.js";
import { store } from "./store.js";
import { openModal } from "../ui/modal.js";
import { 시리즈고르개, 붙이기 as 시리즈붙이기, 시리즈읽기,
         시리즈로가르기, 가름머리 } from "../ui/group_pick.js";

/* 출처 — 저장할 때 서버가 적어 둔다 */
const 출처표 = {
  "올림":   { i: "⬆", ko: "올린 그림", c: "#7bd88f" },
  "생성":   { i: "✨", ko: "엔진이 그림", c: "#a78bfa" },
  "다듬음": { i: "✂", ko: "다듬은 그림", c: "#6cc7ff" },
  "콘티":   { i: "🎞", ko: "콘티에서 자름", c: "#ffcf6c" },
};
const 출처보기 = b => 출처표[b.출처] || { i: "•", ko: "예전 것", c: "#8a8290" };

export async function mount() {
  const st = statusBox($("bgStatus"));
  let 거름 = "";                                   // 출처로 거르기

  $("bgPick").addEventListener("click", () => $("bgFile").click());
  $("bgFile").addEventListener("change", async e => {
    const files = [...e.target.files];
    if (!files.length) return;
    try {
      for (let i = 0; i < files.length; i++) {
        st(`올리는 중… ${i + 1}/${files.length}`);
        await upload("/api/bg/save", files[i], "image");
      }
      await store.refreshBackgrounds();
      st(`✅ 배경 ${files.length}장을 저장했어요.`, "ok");
    } catch (err) { st("⚠ " + err.message, "err"); }
    e.target.value = "";
  });

  /** 크게 보기 — 실제 크기와 출처까지 함께 */
  function 크게보기(b) {
    const o = 출처보기(b);
    openModal({
      제목: `🏞 ${b.name}`,
      너비: "min(900px, 94vw)",
      안내: `<span style="color:${o.c}">${o.i} ${o.ko}</span>` +
            (b.콘티이름 ? ` · 콘티 “${escapeHtml(b.콘티이름)}”` : "") +
            (b.group ? " · 시리즈 전용" : " · 공용") +
            ((b.tags || []).length ? ` · 🏷 ${escapeHtml((b.tags || []).join(", "))}` : "") +
            ` · ${b.date || ""}`,
      내용: `<div style="display:flex; justify-content:center">
        <img src="/api/bg/file?id=${b.id}" id="bgBig"
             style="max-width:100%; max-height:70vh; border-radius:10px; background:#141219">
      </div>
      <div class="hint" id="bgBigInfo" style="text-align:center; margin-top:8px"></div>
      <div class="hint" style="text-align:center; margin-top:6px">
        대본에서 <code>장면 &lt;${escapeHtml(b.name)}&gt;</code> 라고 쓰면 이 그림이 쓰입니다.
      </div>`,
      단추: [{ 글: "📋 이름 복사", 할일: async () => {
        try { await navigator.clipboard.writeText(b.name); st("이름을 복사했습니다.", "ok"); }
        catch { st(b.name); }
      } }],
    });
    // 실제 크기는 다 읽힌 뒤에야 안다
    const img = document.getElementById("bgBig");
    if (img) img.addEventListener("load", () => {
      const el = document.getElementById("bgBigInfo");
      if (el) el.textContent = `${img.naturalWidth}×${img.naturalHeight}`;
    });
  }

  function render() {
    const wrap = $("bgList");
    const 전체 = store.backgrounds;
    if (!전체.length) {
      wrap.innerHTML = '<div class="hint" style="padding:12px">저장된 배경이 없습니다. ' +
        '위 버튼으로 사진을 올리세요 (여러 장 한 번에 가능).</div>';
      return;
    }
    // 출처별 개수 → 눌러서 거르기
    const 센것 = {};
    전체.forEach(b => { const k = b.출처 || "예전"; 센것[k] = (센것[k] || 0) + 1; });
    const 목록 = 거름 ? 전체.filter(b => (b.출처 || "예전") === 거름) : 전체;

    wrap.innerHTML = "";
    const 줄 = document.createElement("div");
    줄.className = "charRow";
    줄.style.cssText = "width:100%; flex-wrap:wrap; gap:6px; margin-bottom:10px";
    줄.innerHTML = Object.entries(센것).map(([k, n]) => {
      const o = 출처표[k] || { i: "•", ko: "예전 것" };
      return `<button class="ghost small" data-출처="${k}"
        style="${거름 === k ? "outline:2px solid " + (o.c || "#888") : ""}"
        >${o.i} ${o.ko} <span class="hint">${n}</span></button>`;
    }).join("") + (거름 ? `<button class="ghost small" data-출처="">✕ 모두 보기</button>` : "") +
      `<span class="hint" style="margin-left:6px">그림을 누르면 크게 봅니다</span>`;
    wrap.appendChild(줄);
    줄.querySelectorAll("[data-출처]").forEach(b =>
      b.addEventListener("click", () => { 거름 = b.dataset.출처 === 거름 ? "" : b.dataset.출처; render(); }));

    /* 시리즈를 골랐으면 '이 시리즈 것' 과 '공용' 을 갈라 놓는다 */
    const 가른것 = 시리즈로가르기(목록);
    for (const [어느것, 무리] of (가른것.가름
      ? [["전용", 가른것.전용], ["공용", 가른것.공용]] : [["전부", 목록]])) {
      if (가른것.가름) {
        const h = document.createElement("div");
        h.style.cssText = "width:100%";
        h.innerHTML = 어느것 === "전용"
          ? 가름머리(`📚 ${가른것.이름} 전용`, 무리.length, "#a78bfa", "이 시리즈에서만 씁니다")
          : 가름머리("🌐 공용", 무리.length, "#7bd88f", "모든 시리즈가 함께 씁니다");
        wrap.appendChild(h);
      }
      무리.forEach(b => 카드하나(b, wrap));
    }
    시리즈붙이기(wrap, { 바뀜: () => store.refreshBackgrounds(), 알림: st });
  }

  /** 배경 카드 한 장 */
  function 카드하나(b, wrap) {
    {
      const o = 출처보기(b);
      const card = document.createElement("div");
      card.className = "poseCard";
      card.style.width = "190px";
      card.innerHTML = `
        <img src="/api/bg/file?id=${b.id}" loading="lazy" class="bgBig"
             title="눌러서 크게 보기"
             style="height:104px; object-fit:cover; background:#241f26; cursor:zoom-in">
        <div style="font-size:12px; margin-top:6px; overflow:hidden; text-overflow:ellipsis;
                    white-space:nowrap">${escapeHtml(b.name)}</div>
        <div class="hint" style="font-size:11px; color:${o.c}">${o.i} ${o.ko}</div>
        <div class="hint" style="font-size:11px">${b.date || ""}</div>
        <div style="display:flex; align-items:center; gap:4px; margin-top:5px">
          <span class="hint" style="font-size:11px">📚</span>
          ${시리즈고르개("배경", b.id, b.group, { 너비: "100%" })}
        </div>
        <div style="display:flex; gap:5px; margin-top:6px">
          <button class="ghost small bgUse" style="flex:1">🎬 사용</button>
          <button class="danger small bgDel">삭제</button>
        </div>`;
      card.classList.toggle("used", store.selectedBgId === b.id);
      card.querySelector(".bgBig").addEventListener("click", () => 크게보기(b));
      card.querySelector(".bgUse").addEventListener("click", async () => {
        await store.selectBackground(b.id);
        st(`"${b.name}" 을(를) 골랐습니다 — 대본에 <${b.name}> 라고 쓰면 됩니다.`, "ok");
      });
      card.querySelector(".bgDel").addEventListener("click", async () => {
        if (!confirm(`'${b.name}' 배경을 삭제할까요?`)) return;
        await store.deleteBackground(b.id);
        st("삭제했습니다.");
      });
      wrap.appendChild(card);
    }
  }
  store.addEventListener("backgrounds", render);
  store.addEventListener("selection", render);
  await 시리즈읽기(true);
  await store.refreshBackgrounds();
  render();
}
