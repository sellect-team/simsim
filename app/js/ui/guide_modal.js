/* 📖 문법 안내서 팝업 — 어느 화면에서든 부른다.
 *
 *   import { openGuide } from "../ui/guide_modal.js";
 *   openGuide();
 *
 * 안내서 글은 guide.js 가 **코드에서 뽑아** 만든다. 손으로 적는 곳이 없으므로
 * 효과·상태·소품을 하나 더 만들면 여기에도 저절로 나타난다.
 */
import { openModal, markdownToHtml } from "./modal.js";
import { buildGuide, downloadGuide, GUIDE_VERSION } from "../story/guide.js";

export async function openGuide(알림 = null) {
  let 글 = "";
  const 창 = openModal({
    제목: "📖 대본 문법 안내서",
    너비: "min(1000px, 96vw)",
    안내: '이 글을 클로드·챗GPT·제미나이에 통째로 붙여 넣고 "이 문법으로 대본을 써 줘" 라고 하세요. ' +
          "낱말은 <b>이 컴퓨터에 실제로 들어 있는 것</b>에서 뽑으므로 항상 최신입니다.",
    내용: '<div class="hint">만드는 중…</div>',
    단추: [
      { 글: "📋 전체 복사", 할일: async () => {
          try { await navigator.clipboard.writeText(글 || await buildGuide());
                알림?.("문법 안내서를 통째로 복사했습니다 — LLM 에 붙여 넣으세요.", "ok"); }
          catch { 알림?.("복사하지 못했습니다."); }
        } },
      { 글: "📥 MD 파일로 내려받기", 강조: true, 할일: async () => {
          const 이름 = await downloadGuide();
          알림?.(`내려받았습니다: ${이름}`, "ok");
        } },
    ],
  });
  글 = await buildGuide();
  창.부제바꾸기(`v${GUIDE_VERSION} · ${글.length.toLocaleString()}자`);
  창.내용바꾸기(markdownToHtml(글));
  return 창;
}
