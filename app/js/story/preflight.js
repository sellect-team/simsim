/* 🚦 굽기 전 마지막 점검 — 조용히 틀린 채로 구워지는 것을 막는다.
 *
 * 여기가 필요한 까닭은 겪어 봐서 안다.
 *   `음악: 산책 배경음` 이 `산책` 으로 잘려 **소리 없이** 구워졌다.
 *   `자막차림표: 유튜브` 가 편에 안 내려가 **기본 자막**으로 구워졌다.
 * 둘 다 영상은 멀쩡해 보였고, 여러 편을 구운 뒤에야 알았다.
 *
 * 대본 살펴보기(lint)와 다른 점
 *   lint  — 글이 말이 되는가 (이름 오타·따옴표)
 *   여기  — **구우면 뜻대로 나오는가** (음악이 정말 붙나·자막이 화면 안에 있나)
 *
 * 등급
 *   막음   — 이대로 구우면 헛수고다 (0초·장면 없음)
 *   놓침   — 구워지지만 시킨 것이 빠진다 (음악 못 찾음)  ← 가장 위험하다
 *   눈치   — 봐 둘 만한 것 (자막이 너무 빠름·캐릭터가 화면 밖)
 */
import { library } from "./assets.js";
import { 음악읽기, 비슷한것 } from "./lint.js";
import { FONTS, BACKINGS, PRESETS, 모양읽기 } from "./subtitle.js";
import { drawSubtitle } from "./subtitle.js";

export const 등급표 = {
  "막음": { i: "⛔", c: "#ff7a7a", ko: "이대로는 헛수고" },
  "놓침": { i: "🔇", c: "#ffcf6c", ko: "시킨 것이 빠짐" },
  "눈치": { i: "👀", c: "#8ab4f8", ko: "봐 둘 만한 것" },
};

/**
 * 한 편을 굽기 전에 살펴본다.
 * @param doc     StoryDoc (build 된 것 — 무대가 있어야 자막 자리를 잰다)
 * @param 프로젝트 {음악:{파일,소리크기,여닫이}} 작업실에서 정한 프로젝트 설정
 */
export async function preflight(doc, 프로젝트 = {}) {
  const 탈 = [];
  const 담기 = (등급, 글, 고침 = "") => 탈.push({ 등급, 글, 고침 });
  if (!doc) return 탈;

  /* ── ① 굽는 뜻이 있는가 ── */
  if (!doc.sceneCount) { 담기("막음", "장면이 없습니다."); return 탈; }
  /* 길이가 0이면 헛수고다. 시간을 미는 것은 `자막`·`대사`·`대기`·`멈칫` 네 가지다.
     예전에는 자막·대사만 세어 **배경 영상**(자막 없이 카메라만 도는 것)의 굽기를 막았다.
     그것도 정당한 쓰임이라, 이제는 길이가 있으면 굽는다. */
  if (!doc.seconds) {
    담기("막음", "길이가 0초입니다 — `자막`·`대사`·`대기`·`멈칫` 가운데 하나는 있어야 합니다.");
    return 탈;
  }
  const 컷수 = (doc.parsed?.scenes || []).reduce(
    (a, s) => a + (s.steps || []).filter(x => x.kind === "자막" || x.kind === "대사").length, 0);
  if (!컷수) {
    // 목소리를 안 쓰는 프로그램이라 자막이 곧 이야기다 — 다만 배경 영상이라면 이대로가 맞다
    담기("눈치", "자막도 대사도 없습니다 — 배경 영상이 아니라면 넣어 주세요.");
  }

  /* ── ② 음악이 **정말** 붙는가 ──
     이름만 맞춰 보는 것이 아니라, 올려 둔 음악 목록과 대조한다. */
  const 시킨음악 = String(doc.meta?.음악 || 프로젝트?.음악?.파일 || "").trim();
  if (시킨음악) {
    const 있는것 = await 음악읽기();
    const 씻기 = s => String(s).replace(/\.(mp3|wav|ogg|m4a|flac)$/i, "").replace(/\s/g, "");
    const 맞음 = 있는것.some(n => 씻기(n) === 씻기(시킨음악));
    if (!맞음) {
      const 닮은것 = 비슷한것(시킨음악, 있는것);
      담기("놓침",
           `음악 "${시킨음악}" 을(를) 못 찾습니다 — 소리 없이 구워집니다.` +
           (닮은것 ? ` 혹시 "${닮은것}" 인가요?` : ""),
           닮은것 ? `음악: ${닮은것}` : "");
    }
  }

  /* ── ③ 자막 꾸미기가 먹었는가 ──
     모르는 이름을 적으면 조용히 기본값이 된다. */
  const m = doc.meta || {};
  const 확인 = (적는말, 표, 뭐라고) => {
    const v = m[적는말];
    if (v && !표[v]) {
      const 닮은것 = 비슷한것(v, Object.keys(표));
      담기("놓침", `${뭐라고} "${v}" 은(는) 없는 이름이라 기본값으로 구워집니다.` +
                   (닮은것 ? ` 혹시 "${닮은것}" 인가요?` : ""),
           닮은것 ? `${적는말}: ${닮은것}` : "");
    }
  };
  확인("자막차림표", PRESETS, "자막 차림표");
  확인("자막모양", PRESETS, "자막 차림표");
  확인("자막글꼴", FONTS, "자막 글꼴");
  확인("자막바탕", BACKINGS, "자막 바탕");

  /* ── ④ 자막이 화면 안에 들어오는가 ──
     실제 그리는 함수로 재 본다. 큰 글꼴 + 긴 글은 화면 밖으로 나간다. */
  const 크기 = { w: 720, h: 1280 };
  if (/16:9|1:1|4:5/.test(String(m.비율 || ""))) {
    const [a, b] = String(m.비율).split(":").map(Number);
    if (a && b) { 크기.w = 1280; 크기.h = Math.round(1280 * b / a); }
  }
  const cv = document.createElement("canvas");
  cv.width = 크기.w; cv.height = 크기.h;
  const g = cv.getContext("2d");
  const 바탕값 = doc.stage?.subtitleDefaults?.() || 모양읽기({});
  const 넘친것 = [];
  for (const s of doc.parsed?.scenes || []) {
    for (const st of s.steps || []) {
      if (st.kind !== "자막" && st.kind !== "대사") continue;
      const 상자 = drawSubtitle(g, { x: 0, y: 0, w: 크기.w, h: 크기.h },
                                st.text, 1, st.opt || {}, 바탕값);
      if (!상자) continue;
      if (상자.x < -2 || 상자.x + 상자.w > 크기.w + 2 ||
          상자.y < -2 || 상자.y + 상자.h > 크기.h + 2) {
        넘친것.push({ line: st.line, text: st.text });
      }
    }
  }
  if (넘친것.length) {
    담기("눈치", `자막 ${넘친것.length}줄이 화면 밖으로 나갑니다 ` +
                 `(${넘친것.slice(0, 2).map(x => `${x.line}줄`).join(", ")}${
                   넘친것.length > 2 ? " 외" : ""}) — 크기를 줄이거나 짧게 쓰세요.`);
  }

  /* ── ⑤ 읽을 시간이 있는가 ──
     한글은 1초에 대략 9~11자를 읽는다. 그보다 빠르면 못 읽는다. */
  const 빠른것 = [];
  for (const s of doc.parsed?.scenes || []) {
    for (const st of s.steps || []) {
      if (st.kind !== "자막" && st.kind !== "대사") continue;
      const 글자 = String(st.text || "").replace(/\s/g, "").length;
      if (글자 >= 8 && st.dur > 0 && 글자 / st.dur > 11) 빠른것.push(st.line);
    }
  }
  if (빠른것.length) {
    담기("눈치", `자막 ${빠른것.length}줄이 읽기에 너무 빠릅니다 ` +
                 `(${빠른것.slice(0, 3).join(", ")}줄) — 뒤에 \`2초\` 처럼 시간을 적어 늘리세요.`);
  }

  /* ── ⑥ 캐릭터가 화면 안에 있는가 ── */
  const 밖에것 = new Set();
  for (const s of doc.parsed?.scenes || []) {
    for (const st of s.steps || []) {
      if (!st.spot || !st.who) continue;
      const 곳 = String(st.spot);
      const mm = 곳.match(/^(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)$/);
      if (!mm) continue;                         // 이름난 자리는 늘 화면 안이다
      const x = parseFloat(mm[1]), y = parseFloat(mm[2]);
      if (x < 0.02 || x > 0.98 || y < 0.02 || y > 0.98) 밖에것.add(`${st.who}(${st.line}줄)`);
    }
  }
  if (밖에것.size) {
    담기("눈치", `화면 밖 자리를 쓴 배우: ${[...밖에것].join(", ")}`);
  }

  /* ── ⑦ 쓰는 그림이 다 있는가 (없으면 코드가 그린다 — 나쁘진 않지만 알아야 한다) ── */
  const 필요 = doc.needs?.();
  if (필요) {
    const 있는캐릭터 = new Set((library.characters || []).map(c => c.name.replace(/\s/g, "")));
    const 있는배경 = new Set((library.backgrounds || []).map(b => b.name.replace(/\s/g, "")));
    const 코드로 = [
      ...(필요.배우 || []).filter(n => !있는캐릭터.has(String(n).replace(/\s/g, ""))),
      ...(필요.배경 || []).filter(n => !있는배경.has(String(n).replace(/\s/g, ""))),
    ];
    if (코드로.length) {
      담기("눈치", `그림이 없어 코드로 그립니다: ${코드로.slice(0, 4).join(", ")}` +
                   (코드로.length > 4 ? ` 외 ${코드로.length - 4}개` : ""));
    }
  }

  return 탈;
}

/** 여러 편을 한꺼번에 (굽기 단계에서 [전부 굽기] 앞에 부른다) */
export async function preflightMany(docs, 프로젝트 = {}) {
  const 결과 = [];
  for (const { 이름, doc } of docs) {
    결과.push({ 이름, 탈: await preflight(doc, 프로젝트) });
  }
  return 결과;
}

/** 막는 것이 하나라도 있나 */
export const 막힘 = 탈 => 탈.some(x => x.등급 === "막음");
/** 놓치는 것이 하나라도 있나 */
export const 놓침있나 = 탈 => 탈.some(x => x.등급 === "놓침");
