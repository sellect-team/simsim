/* 📦 부족한 그림 — 작업실과 자산 탭이 **같은 것을 같은 모습으로** 보여 주도록 한곳에 모았다.
 *
 * 두 화면이 각자 그리면 금세 어긋난다 (한쪽은 3개, 한쪽은 5개…).
 * 그래서 목록을 읽고 그리는 일을 여기서만 한다.
 *
 * '부족'은 두 가지다.
 *   자동  — 코드로 그려 둔 임시 그림. 없어도 영상이 나온다. 바꾸면 더 좋아진다.
 *   막힘  — 없으면 곤란한 것.
 */
import { escapeHtml } from "../core.js";

/** 모든 이야기에서 부족한 것을 모아 온다 */
export async function loadNeeds() {
  try {
    const d = await (await fetch("/api/project/list")).json();
    const list = d.needs || [];
    return {
      전체: list,
      자동: list.filter(n => n.자동),
      막힘: list.filter(n => !n.자동),
      이야기수: (d.items || []).length,
    };
  } catch {
    return { 전체: [], 자동: [], 막힘: [], 이야기수: 0 };
  }
}

/** 한 줄 그리기 */
function 줄(n) {
  const 배경 = n.종류 === "배경";
  const 표 = n.자동
    ? `<span class="hint" style="color:var(--ok,#7bd88f)">🎨 코드로 그려 둠${
        n.자동설명 ? ` (${escapeHtml(n.자동설명)})` : ""}</span>`
    : `<span class="hint" style="color:var(--warn,#e0a458)">⚠ 필요</span>`;
  return `<div class="vitem" data-이름="${escapeHtml(n.이름)}" data-종류="${escapeHtml(n.종류)}">
    <span class="vname">${배경 ? "🏞" : "🐕"} ${escapeHtml(n.이름)}</span>
    <span class="vinfo">${표} · 쓰는 곳 ${n.쓰는곳.length}편</span>
    <span class="vactions">
      <button class="ghost small" data-할일="만들기" title="ComfyUI 로 직접 그립니다 (한 장에 30초 안팎)">✨ 만들기</button>
      <button class="ghost small" data-할일="프롬프트">📋 프롬프트</button>
      <button class="ghost small" data-할일="올리기">⬆ 올리기</button>
    </span>
  </div>`;
}

/**
 * 목록을 칸에 그린다.
 * @param box 담을 요소
 * @param needs loadNeeds() 결과
 * @param on {프롬프트(n), 올리기(n)} 눌렀을 때 할 일
 */
export function drawNeeds(box, needs, on = {}) {
  if (!box) return;
  if (!needs.전체.length) {
    box.innerHTML = `<div class="hint">부족한 그림이 없습니다. ${
      needs.이야기수 ? "" : "먼저 스토리 탭에서 대본을 써 보세요."}</div>`;
    return;
  }
  box.innerHTML = needs.전체.map(줄).join("");
  box.querySelectorAll("[data-할일]").forEach(b =>
    b.addEventListener("click", ev => {
      ev.stopPropagation();
      const row = b.closest("[data-이름]");
      const n = needs.전체.find(x => x.이름 === row.dataset.이름
                                     && x.종류 === row.dataset.종류);
      on[b.dataset.할일]?.(n);
    }));
}

/** 한 줄 요약 ("그림 5개 중 4개는 코드로 그려 둠 · 1개는 있어야 함") */
export function summarizeNeeds(needs) {
  if (!needs.전체.length) return "부족한 그림 없음";
  const 조각 = [`그림 ${needs.전체.length}개`];
  if (needs.자동.length) 조각.push(`${needs.자동.length}개는 코드로 그려 둠`);
  if (needs.막힘.length) 조각.push(`${needs.막힘.length}개는 있어야 함`);
  return 조각.join(" · ");
}

/**
 * ✨ ComfyUI 로 그림 한 장 만들기.
 * 지금 깔린 것은 영상 모델(Wan 2.2)뿐이라 길이를 1로 두고 한 장만 뽑는다 — 30초 안팎 걸린다.
 * @param onNote 진행 알림 (글자)
 * @returns 만들어진 자산 {id, name} · 실패하면 예외
 */
export async function makeImage(n, onNote = () => {}) {
  const r = await (await fetch("/api/image/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: n.이름, kind: n.종류, 프롬프트: n.프롬프트 || "" }),
  })).json();
  if (r.error) throw new Error(r.error);
  onNote(`그리는 중… (${r.width}×${r.height})`);
  for (let i = 0; i < 180; i++) {
    await new Promise(x => setTimeout(x, 2000));
    const st = await (await fetch("/api/status/" + r.job)).json();
    if (st.state === "done") return st.item;
    if (st.state === "error") throw new Error(st.error || "만들기 실패");
    onNote(`그리는 중… ${st.progress || 0}%`);
  }
  throw new Error("너무 오래 걸립니다");
}

/** 외부 AI(클로드·챗GPT·제미나이)에 넣을 프롬프트 */
export function promptFor(n) {
  if (!n) return "";
  if (n.프롬프트) return n.프롬프트;
  return n.종류 === "배경"
    ? `${n.이름}, 어린이 그림책 배경, 크레용·사인펜 느낌, 세로 9:16, 인물 없음, 부드러운 색`
    : `${n.이름}, 귀여운 캐릭터, 정면 전신, 투명 배경, 크레용·사인펜 느낌, 굵은 외곽선`;
}
