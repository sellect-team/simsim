/* ⬅ 뒤로가기 길잡이 — 브라우저 뒤로가기를 **앱 안의 한 걸음**으로 만든다.
 *
 * 이 프로그램은 주소가 하나뿐인 한 장짜리 화면이다. 그래서 예전에는
 * 뒤로가기를 누르면 팝업이 닫히거나 프로젝트에서 나오는 대신
 * **앱을 통째로 떠나** 이전 주소로 가 버렸다. 굽던 것도 적던 것도 함께 사라졌다.
 *
 * 여기서 하는 일은 하나다 — 화면이 바뀔 때마다 **되돌아갈 방법을 한 걸음 쌓아 둔다.**
 *
 *   nav.밀기("팝업", () => 창닫기());     // 열 때
 *   nav.빼기("팝업");                     // ✕ 를 눌러 스스로 닫았을 때
 *
 * 뒤로가기를 누르면 맨 위 걸음의 `되돌리기` 가 불린다.
 * 걸음이 하나도 없을 때만 진짜로 앱을 떠난다.
 *
 * ── 왜 이렇게 만드나 ──
 * 브라우저 히스토리는 우리가 직접 못 읽는다(보안). 그래서 `pushState` 로 넣어 둔
 * **깊이 숫자**만 믿고, 우리 쪽 걸음 배열과 견주어 몇 걸음 물러났는지 계산한다.
 * 뒤로를 여러 번 빨리 눌러도 (깊이 차이만큼) 한꺼번에 되돌아간다.
 */

/** 쌓인 걸음 [{키, 되돌리기}] — 맨 뒤가 지금 화면 */
const 층 = [];

/** 우리가 스스로 닫아서 history.go 를 부른 상태 — 그때 오는 popstate 는 흘려 보낸다 */
let 스스로되감는중 = false;

/** 되돌리는 동안 새 걸음이 쌓이지 않게 (되돌리기 안에서 화면을 바꾸므로) */
let 되돌리는중 = false;

const 깊이읽기 = () => (history.state && typeof history.state.공작소깊이 === "number")
  ? history.state.공작소깊이 : 0;

/** 맨 처음 한 번 — 지금 자리를 0층으로 못 박는다 */
export function navInit() {
  if (history.state?.공작소깊이 == null) {
    try { history.replaceState({ ...(history.state || {}), 공작소깊이: 0 }, ""); } catch {}
  }
  addEventListener("popstate", () => {
    if (스스로되감는중) { 스스로되감는중 = false; return; }
    const 갈곳 = 깊이읽기();
    /* 앞으로 가기(forward)를 눌렀거나 우리가 모르는 자리면 아무 것도 안 한다.
       억지로 맞추려다 화면이 엉키느니 가만있는 편이 낫다. */
    if (갈곳 >= 층.length) return;
    되돌리는중 = true;
    try {
      while (층.length > 갈곳) {
        const 걸음 = 층.pop();
        try { 걸음.되돌리기?.(); } catch (e) { console.warn("뒤로가기:", e); }
      }
    } finally { 되돌리는중 = false; }
  });
}

/**
 * 한 걸음 쌓는다 (화면을 **바꾼 뒤에** 부른다).
 * @param 키        나중에 빼기 위해 쓰는 이름
 * @param 되돌리기  뒤로가기를 눌렀을 때 할 일 (이 안에서 다시 밀기를 부르면 안 된다)
 * @param 주소      주소창에 남길 것 (없으면 그대로 둔다)
 */
export function 밀기(키, 되돌리기, 주소 = null) {
  if (되돌리는중) return;                 // 되돌리는 중에 쌓으면 무한히 오간다
  층.push({ 키, 되돌리기 });
  try {
    history.pushState({ 공작소깊이: 층.length }, "", 주소 ?? location.href);
  } catch {}
}

/**
 * 스스로 닫혔을 때 그 걸음을 걷어낸다 (✕ 를 눌렀을 때 등).
 * 브라우저 히스토리도 함께 물러나야 뒤로가기가 한 번 헛돌지 않는다.
 */
export function 빼기(키) {
  if (되돌리는중) return;                 // 뒤로가기가 부른 것이면 이미 빠져 있다
  const i = 층.findIndex(x => x.키 === 키);
  if (i < 0) return;
  const 뺄개수 = 층.length - i;
  층.length = i;
  스스로되감는중 = true;                  // history.go 는 popstate 를 한 번만 부른다
  try { history.go(-뺄개수); }
  catch { 스스로되감는중 = false; }
}

/** 지금 쌓인 걸음 수 (검사용) */
export const 깊이 = () => 층.length;
/** 그 이름의 걸음이 쌓여 있나 */
export const 있나 = 키 => 층.some(x => x.키 === 키);

export const nav = { 밀기, 빼기, 깊이, 있나, navInit };
export default nav;
