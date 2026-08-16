/* 🎨 자산 탭 — 작업실·스토리에서 쓸 **재료**를 모아 두는 곳.
 *
 * 여기서는 영상을 만들지 않는다. 굽기는 스토리·작업실에서 한다.
 * 이 탭이 하는 일은 하나다: 대본이 부르는 이름에 맞는 재료를 채워 넣는 것.
 *
 * 화면을 이렇게 나눈 까닭
 *   · 1급은 **캐릭터 · 배경 · 음악** — 대본이 직접 부르는 것들이다.
 *   · 표정·부위와 3D 색칠은 캐릭터를 꾸미는 일이라 캐릭터 **안쪽** 곁가지로 넣었다.
 *   · 조각·장면은 재료가 아니라 '반쯤 만든 것' 이라 따로 세웠다.
 *   · 부족한 그림·태그·시리즈 옮기기는 **가끔 하는 일**이라 창(팝업)으로 뺐다
 *     (js/ui/asset_panels.js — 작업실에서도 같은 창을 쓴다).
 *
 * 하위 화면은 app/views/char_*.html, 기능은 app/js/char/*.js 에 따로 있다.
 */
import { $, escapeHtml } from "../core.js";
import { library } from "../story/assets.js";
import { openNeeds, openTags, openSeries, 부족읽기, 부족비우기 } from "../ui/asset_panels.js";
import { openBulkUpload } from "../ui/bulk_upload.js";

const SUBS = {
  manage: { view: "char_manage", mod: "../char/manage.js", 어미: "manage" },
  face:   { view: "char_face",   mod: "../char/faceedit.js", 어미: "manage" },
  paint:  { view: "char_paint",  mod: "../char/paint.js",    어미: "manage" },
  bg:     { view: "char_bg",     mod: "../char/bg.js" },
  music:  { view: "char_music",  mod: "../char/music.js" },
  bits:   { view: "char_bits",   mod: "../char/bits.js" },
  /* 코드가 그려 주는 재료들 — 파일이 없어 목록도 없던 것들을 눈으로 보는 곳 */
  fx:     { view: "char_fx",     mod: "../char/fx_gallery.js" },
};
/** 캐릭터 안쪽 곁가지 — 이것들을 열면 위 탭은 '캐릭터' 로 남는다 */
const 곁가지 = ["manage", "face", "paint"];
const loaded = new Set();
let 지금 = "manage";

async function openSub(name) {
  if (!SUBS[name]) return;
  지금 = name;
  const 어미 = SUBS[name].어미 || name;

  // 위 줄: 어느 종류를 보고 있는가 / 아래 줄: 캐릭터일 때만 보인다
  document.querySelectorAll("#chSubtabs .subtab").forEach(b =>
    b.classList.toggle("on", b.dataset.sub === 어미));
  const 곁 = document.getElementById("chKid");
  if (곁) {
    곁.style.display = 어미 === "manage" ? "" : "none";
    곁.querySelectorAll(".subtab").forEach(b => b.classList.toggle("on", b.dataset.kid === name));
  }
  Object.keys(SUBS).forEach(k => {
    const pane = document.getElementById("chPane_" + k);
    if (pane) pane.style.display = k === name ? "" : "none";
  });

  localStorage.setItem("자산갈래", name);           // 다음에 올 때 보던 갈래로

  if (loaded.has(name)) {
    window.dispatchEvent(new Event("resize"));      // 캔버스 크기 다시 맞추기
    return;
  }
  loaded.add(name);
  const pane = document.getElementById("chPane_" + name);
  const { view, mod } = SUBS[name];
  try {
    pane.innerHTML = await (await fetch(`/p/views/${view}.html?t=${Date.now()}`)).text();
    const m = await import(mod + `?t=${Date.now()}`);
    await m.mount(pane);
  } catch (e) {
    loaded.delete(name);
    pane.innerHTML = `<div class="hint" style="padding:14px">불러오지 못했습니다: ${e.message}</div>`;
  }
}
/** 다른 화면에서 "이 그림 채우러 가자" 하고 부를 수 있게 열어 둔다 */
window.자산탭열기 = openSub;

/* ══ 📚 시리즈 ══
   고른 시리즈는 자산 탭·미리보기·굽기가 **모두 같이** 따른다.
   자산은 폴더를 옮기지 않고 소속만 적어 두므로, 여기서 바꾸면 곧바로 반영된다. */
let 시리즈들 = [];
let 보는시리즈 = localStorage.getItem("ws그룹") || "";

async function 머리읽기() {
  try { 시리즈들 = (await (await fetch("/api/group/list")).json()).items || []; }
  catch { 시리즈들 = []; }
  $("agGroup").innerHTML = '<option value="">전체 보기</option>' +
    시리즈들.map(g => `<option value="${g.id}" ${g.id === 보는시리즈 ? "selected" : ""}
      >${escapeHtml(g.name)}</option>`).join("");
  await 세기();
}

/** 종류별 개수 — 탭 옆에 붙어서 "지금 뭐가 몇 개인지" 를 늘 보여 준다 */
async function 세기() {
  const q = 보는시리즈 ? `?group=${encodeURIComponent(보는시리즈)}` : "";
  let 목록 = [];
  try { 목록 = (await (await fetch("/api/group/assets" + q)).json()).items || []; }
  catch { 목록 = []; }
  const 센것 = {};
  목록.forEach(x => { 센것[x.종류] = (센것[x.종류] || 0) + 1; });
  센것["조각"] = (센것["조각"] || 0) + (센것["장면"] || 0);   // 조각·장면은 한 탭이다
  document.querySelectorAll("#chSubtabs [data-수]").forEach(el => {
    el.textContent = 센것[el.dataset.수] || 0;
  });
  const 공용 = 목록.filter(x => x.공용).length;
  $("agInfo").textContent = 보는시리즈
    ? `이 시리즈 ${목록.length - 공용}개 + 공용 ${공용}개 = 쓸 수 있는 것 ${목록.length}개`
    : `모두 ${목록.length}개 (공용 ${공용}개)`;

  // 부족한 그림 개수는 단추 위에 작게 — 굳이 판을 펼치지 않아도 알 수 있게
  try {
    const 부족 = await 부족읽기();
    const 뱃지 = $("needBadge");
    뱃지.textContent = 부족.전체.length ? String(부족.전체.length) : "";
    // 주황이 밝아 흰 글씨가 4:1 밖에 안 됐다 — 바탕을 한 단계 어둡게 해 숫자가 또렷하게
    뱃지.style.cssText = 부족.전체.length
      ? "background:#a8481c; color:#fff; border-radius:9px; padding:0 6px; font-size:11px" : "";
  } catch { /* 대본이 없으면 부족한 것도 없다 */ }
}

export async function mount(root) {
  root.querySelectorAll("#chSubtabs .subtab").forEach(btn =>
    btn.addEventListener("click", () => openSub(btn.dataset.sub)));
  root.querySelectorAll("#chKid .subtab").forEach(btn =>
    btn.addEventListener("click", () => openSub(btn.dataset.kid)));

  $("agGroup").addEventListener("change", async () => {
    보는시리즈 = $("agGroup").value;
    localStorage.setItem("ws그룹", 보는시리즈);
    library.setGroup(보는시리즈);          // 미리보기·굽기도 같은 규칙을 지킨다
    부족비우기();
    window.dispatchEvent(new Event("시리즈바뀜"));
    await 세기();
  });

  $("btnBulk").addEventListener("click", () => openBulkUpload({
    group: 보는시리즈,
    끝나면: async () => { await 머리읽기(); window.dispatchEvent(new Event("시리즈바뀜")); },
  }));

  $("btnNeeds").addEventListener("click", () => openNeeds({
    올리기: n => openSub(n.종류 === "배경" ? "bg" : "manage"),
  }));
  $("btnTags").addEventListener("click", () => openTags({ 바뀜: 세기 }));
  $("btnSeries").addEventListener("click", () => openSeries({ 바뀜: 세기 }));

  /* 어느 갈래로 열까 — 주소(`?sub=music`) > 지난번에 보던 것 > 캐릭터 */
  const 주소가정한것 = new URLSearchParams(location.search).get("sub");
  await openSub(SUBS[주소가정한것] ? 주소가정한것
              : SUBS[localStorage.getItem("자산갈래")] ? localStorage.getItem("자산갈래")
              : "manage");
  await 머리읽기();
  // 그림·소리를 새로 저장하면 개수를 다시 읽는다
  window.addEventListener("자산바뀜", () => { 부족비우기(); 세기(); });
}
