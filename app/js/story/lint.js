/* 🔎 대본 살펴보기 — 굽기 전에 실수를 잡아 준다.
 *
 * 파서(script.js)는 **글만** 본다. 그래서 "그런 이름의 캐릭터가 있는가" 는 모른다.
 * 이름을 한 글자 틀리면 조용히 코드 그림이 나오고, 30초를 구운 뒤에야 알게 된다.
 *
 * 여기서는 글과 창고를 함께 본다.
 *   · 있는 이름인가 (캐릭터·배경·음악·조각·효과음)
 *   · 없으면 **혹시 이걸 뜻했나** 를 골라 준다 (글자 거리로)
 *
 * 세 등급으로 나눈다.
 *   오류   — 못 알아들었다. 그 줄은 통째로 버려진다.
 *   경고   — 알아들었지만 수상하다. 영상은 나오지만 뜻대로가 아닐 수 있다.
 *   알림   — 나쁘지 않지만 알아 두면 좋은 것 (그림이 없어 코드로 그린다 등)
 */
import { library } from "./assets.js";
import { prefabNames } from "./prefabs.js";
import { FONTS, BACKINGS, PRESETS } from "./subtitle.js";
import { EFFECTS } from "./fx.js";
import { PROPS } from "./props.js";
import { MOODS } from "./post.js";
import { STATES } from "../char/moods.js";
import { EXPRESSIONS, BODY_MOVES, TEARS } from "../char/face.js";
import { TRANSITION_NAMES } from "./stage.js";
import { SPOTS } from "./script.js";

/* ── 쓸 수 있는 낱말 표 ──
 *
 * 파서는 모르는 낱말을 **조용히** 받아 넘긴다. `동작 sway2` 라고 쓰면 아무 일도 안 일어나고,
 * 30초를 구운 뒤에야 "왜 안 움직이지?" 가 된다. 밖의 LLM 에게 대본을 시킬수록
 * 이런 '있을 법하지만 없는 낱말' 이 늘기 때문에 여기서 낱낱이 맞춰 본다.
 *
 * 한 군데 모아 두는 이유가 하나 더 있다 — 대본 설명서(guide.js)가 이 표를 그대로 읽어
 * MD 로 뽑는다. 코드에 낱말을 더하면 설명서도 저절로 따라온다.
 */
export const 낱말표 = {
  전환:   { 값: TRANSITION_NAMES,          뭐: "장면 전환" },
  분위기: { 값: Object.keys(MOODS),        뭐: "분위기" },
  자리:   { 값: Object.keys(SPOTS),        뭐: "자리" },
  효과:   { 값: Object.keys(EFFECTS),      뭐: "효과" },
  소품:   { 값: Object.keys(PROPS),        뭐: "소품 모양" },
  상태:   { 값: Object.keys(STATES),       뭐: "상태" },
  표정:   { 값: Object.keys(EXPRESSIONS),  뭐: "표정" },
  동작:   { 값: Object.keys(BODY_MOVES),   뭐: "동작" },
  눈물:   { 값: Object.keys(TEARS),        뭐: "눈물" },
  글꼴:   { 값: Object.keys(FONTS),        뭐: "자막 글꼴" },
  바탕:   { 값: Object.keys(BACKINGS),     뭐: "자막 바탕" },
  차림표: { 값: Object.keys(PRESETS),      뭐: "자막 차림표" },
  자막등장: { 값: ["팝", "올라옴", "튀어나옴", "타이핑", "한글자씩"], 뭐: "자막 등장" },
  자막가로: { 값: ["왼쪽", "가운데", "오른쪽"],  뭐: "자막 가로 자리" },
  자막세로: { 값: ["위", "가운데", "아래"],      뭐: "자막 세로 자리" },
  여닫이:   { 값: ["어둡게", "밝게", "없음"],    뭐: "여닫이" },
  비율:     { 값: ["9:16", "16:9", "1:1", "4:5"], 뭐: "비율" },
  화질:     { 값: ["빠르게", "보통", "곱게"],     뭐: "화질" },
  카메라:   { 뭐: "카메라 움직임",
             값: ["줌인", "확대", "줌아웃", "축소", "이동", "팬", "흔들기", "쿵",
                  "기울이기", "틀기", "펀치", "확대펀치", "따라가기", "따라감",
                  "레터박스", "띠", "되돌리기"] },
  화면:     { 값: ["분위기", "비네트", "블룸", "결", "번쩍"], 뭐: "화면 효과" },
};

/* ── 얼마나 닮았나 ──
   글자 하나 차이(오타)를 잡으려는 것이라 간단한 편집 거리면 넉넉하다. */
function 거리(a, b) {
  a = String(a).replace(/\s/g, ""); b = String(b).replace(/\s/g, "");
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let 앞 = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const 이번 = [i];
    for (let j = 1; j <= n; j++) {
      이번[j] = Math.min(앞[j] + 1, 이번[j - 1] + 1,
                         앞[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    앞 = 이번;
  }
  return 앞[n];
}

/** 있는 이름들 중 가장 닮은 것 (너무 다르면 안 고른다) */
export function 비슷한것(이름, 후보들) {
  const n = String(이름 || "").replace(/\s/g, "");
  if (!n || !후보들?.length) return null;
  const 씻은후보 = 후보들.map(c => ({ 원래: c, 씻음: String(c).replace(/\s/g, "") }));

  /* 이름이 **잘린** 경우를 먼저 본다.
     `산책 배경음` 이 `산책` 으로 잘리는 일이 실제로 있었다 (띄어쓰기에서 끊김).
     글자 거리로는 3이나 되어 '딴 이름' 으로 보이지만, 앞이 그대로 겹치면 그것이 맞다.
     단, 그렇게 겹치는 것이 **하나뿐일 때만** 고른다 — 여럿이면 어느 것인지 모른다. */
  if (n.length >= 2) {
    const 앞이같은것 = 씻은후보.filter(c => c.씻음.startsWith(n) || n.startsWith(c.씻음));
    if (앞이같은것.length === 1) return 앞이같은것[0].원래;
  }

  let 제일 = null, 제일거리 = Infinity;
  for (const c of 씻은후보) {
    const d = 거리(n, c.씻음);
    if (d < 제일거리) { 제일거리 = d; 제일 = c.원래; }
  }
  // 이름이 짧을수록 엄격하게 — 두 글자짜리는 한 글자만 달라도 딴 것이다
  const 봐줄것 = Math.max(1, Math.floor(n.length / 3));
  return 제일거리 <= 봐줄것 ? 제일 : null;
}

/* 음악 목록은 자주 안 바뀌니 한 번 읽어 둔다 */
let 음악들 = null;
export async function 음악읽기(다시 = false) {
  if (음악들 && !다시) return 음악들;
  try {
    const d = await (await fetch("/api/audio/list")).json();
    음악들 = (d.items || []).map(x => x.name);
  } catch { 음악들 = []; }
  return 음악들;
}
let 효과음들 = null;
async function 효과음읽기() {
  if (효과음들) return 효과음들;
  try { 효과음들 = (await (await fetch("/api/sfx/list")).json()).names || []; }
  catch { 효과음들 = []; }
  return 효과음들;
}

/**
 * 대본 하나를 살펴본다.
 * @param parsed  parseScript 결과
 * @returns [{line, 등급:"오류"|"경고"|"알림", msg, 고침?}]
 */
export async function lintScript(parsed, opt = {}) {
  const 나온것 = [];
  if (!parsed) return 나온것;

  const 캐릭터 = (library.characters || []).map(c => c.name);
  const 배경 = (library.backgrounds || []).map(b => b.name);
  const 음악 = await 음악읽기();
  const 소리 = await 효과음읽기();
  const 조각 = prefabNames();

  /* ① 파서가 못 알아들은 것 */
  for (const e of parsed.errors || []) 나온것.push({ ...e, 등급: "오류" });
  /* ② 파서가 수상하다고 본 것 */
  for (const w of parsed.warnings || []) 나온것.push({ ...w, 등급: "경고" });

  /** 이름 하나 확인 */
  const 이름확인 = (이름, 있는것, 뭐라고, line, 등급 = "경고") => {
    const n = String(이름 || "").trim();
    if (!n) return;
    const 있나 = 있는것.some(x => x.replace(/\s/g, "") === n.replace(/\s/g, ""));
    if (있나) return;
    const 닮은것 = 비슷한것(n, 있는것);
    나온것.push({
      line, 등급,
      msg: `${뭐라고} "${n}" 이(가) 없습니다.` +
           (닮은것 ? ` 혹시 "${닮은것}" 인가요?` : ""),
      고침: 닮은것 ? { 옛: n, 새: 닮은것 } : null,
    });
  };

  /* 낱말 하나가 표 안에 있나 — 없으면 그 지시는 **아무 일도 안 하고 사라진다**.
     그래서 등급이 경고다 (알림이 아니라). 쓸 수 있는 것을 전부 붙여 준다:
     밖의 LLM 이 이 글을 그대로 받아 고쳐 오게 하려는 것이다. */
  const 값확인 = (갈래, 값, line, 등급 = "경고") => {
    const t = 낱말표[갈래];
    const v = String(값 ?? "").trim();
    if (!t || !v) return;
    if (t.값.includes(v)) return;
    const 닮은것 = 비슷한것(v, t.값);
    나온것.push({
      line, 등급,
      msg: `${t.뭐} "${v}" 은(는) 없는 말이라 그냥 무시됩니다.` +
           (닮은것 ? ` 혹시 "${닮은것}" 인가요?` : ` 쓸 수 있는 것: ${t.값.join(" · ")}`),
      고침: 닮은것 ? { 옛: v, 새: 닮은것 } : null,
    });
  };

  /* ③ 머리말에 적은 것 */
  const m = parsed.meta || {};
  if (m.음악) 이름확인(m.음악.replace(/\.(mp3|wav|ogg|m4a|flac)$/i, ""), 음악, "음악", 1);
  if (m.자막글꼴 && !FONTS[m.자막글꼴]) {
    나온것.push({ line: 1, 등급: "경고",
      msg: `글꼴 "${m.자막글꼴}" 이(가) 없습니다.` +
           (비슷한것(m.자막글꼴, Object.keys(FONTS))
             ? ` 혹시 "${비슷한것(m.자막글꼴, Object.keys(FONTS))}" 인가요?` : ""),
      고침: null });
  }
  /* 머리말에 적는 낱말 — 왼쪽이 대본에 쓰는 말, 오른쪽이 맞춰 볼 표 */
  for (const [적는말, 갈래] of [["자막바탕", "바탕"], ["자막차림표", "차림표"],
                                ["자막모양", "차림표"], ["자막등장", "자막등장"],
                                ["자막가로", "자막가로"], ["자막세로", "자막세로"],
                                ["여닫이", "여닫이"], ["비율", "비율"], ["화질", "화질"],
                                ["분위기", "분위기"]]) {
    if (m[적는말]) 값확인(갈래, m[적는말], 1);
  }

  /* ④ 장면마다 */
  /* 이 대본에서 `소품 <이름>` 으로 선언한 것들.
     소품은 그림이 없는 것이 정상이라 "그림이 없어 코드로 그립니다" 를 띄우면 안 된다. */
  const 소품이름 = new Set();
  for (const s of parsed.scenes || [])
    for (const st of s.steps || [])
      if (st.kind === "소품선언" && st.who) 소품이름.add(String(st.who).trim());

  for (const s of parsed.scenes || []) {
    값확인("전환", s.opt?.전환, s.line);
    값확인("분위기", s.opt?.분위기, s.line);
    // 배경 — 코드로 그릴 수 있는 이름이나 색이면 없어도 괜찮다
    const bg = String(s.bg || "").trim();
    if (bg && !배경.some(x => x.replace(/\s/g, "") === bg.replace(/\s/g, ""))) {
      const 닮은것 = 비슷한것(bg, 배경);
      if (닮은것) {
        나온것.push({ line: s.line, 등급: "경고",
          msg: `배경 "${bg}" 이(가) 없습니다. 혹시 "${닮은것}" 인가요?`,
          고침: { 옛: bg, 새: 닮은것 } });
      } else if (!opt.코드로그릴수있나 || !opt.코드로그릴수있나(bg)) {
        나온것.push({ line: s.line, 등급: "알림",
          msg: `배경 "${bg}" 은(는) 올린 그림이 없어 코드로 그립니다.`, 고침: null });
      }
    }

    for (const st of s.steps || []) {
      /* ── 낱말이 실재하는가 ──
         여기 걸리는 것들은 **오류가 아니라 무음(無音) 실패**다. 영상은 멀쩡히 나오고
         그 지시만 없던 일이 된다. 눈으로는 절대 못 잡으니 여기서 잡는다. */
      if (st.kind === "효과") 값확인("효과", st.name, st.line);
      if (st.kind === "소품선언") 값확인("소품", st.opt?.모양 || st.모양, st.line);
      if (st.kind === "상태") 값확인("상태", st.name, st.line);
      if (st.kind === "동작") 값확인("동작", st.name, st.line);
      if (st.kind === "눈물") 값확인("눈물", st.name, st.line);
      if (st.kind === "표정") 값확인("표정", st.name, st.line);
      if (st.kind === "표정반복") (st.list || []).forEach(x => 값확인("표정", x, st.line));
      if (st.kind === "카메라") 값확인("카메라", st.move, st.line);
      if (st.kind === "화면" && !MOODS[st.종류]) 값확인("화면", st.종류, st.line);
      if (st.opt?.동작) 값확인("동작", st.opt.동작, st.line);
      if (st.opt?.표정) 값확인("표정", st.opt.표정, st.line);
      /* 자리 — 이름이거나 좌표(0.5,0.7)다. 좌표는 표에 없으니 걸러 낸다. */
      if (st.spot && !/^-?\d*\.?\d+\s*,\s*-?\d*\.?\d+$/.test(st.spot) && st.spot !== "제자리")
        값확인("자리", st.spot, st.line);
      (st.spots || []).forEach(x => {
        const v = String(x).trim();
        if (v && !/^-?\d*\.?\d+\s*,\s*-?\d*\.?\d+$/.test(v)) 값확인("자리", v, st.line);
      });

      // 배우 이름 (소품은 개체이긴 해도 코드로 그리는 것이 정상이라 뺀다)
      if (st.who && st.kind !== "소품" && st.kind !== "소품선언" &&
          !소품이름.has(String(st.who).trim())) {
        const a = String(st.who).trim();
        if (!캐릭터.some(x => x.replace(/\s/g, "") === a.replace(/\s/g, ""))) {
          const 닮은것 = 비슷한것(a, 캐릭터);
          if (닮은것) {
            나온것.push({ line: st.line, 등급: "경고",
              msg: `캐릭터 "${a}" 이(가) 없습니다. 혹시 "${닮은것}" 인가요?`,
              고침: { 옛: a, 새: 닮은것 } });
          } else {
            나온것.push({ line: st.line, 등급: "알림",
              msg: `캐릭터 "${a}" 은(는) 올린 그림이 없어 코드로 그립니다.`, 고침: null });
          }
        }
      }
      // 효과음 — 목록에 없으면 그 소리는 아예 안 난다
      const 소리이름 = st.opt?.소리 || (st.kind === "소리" ? st.name : null);
      if (소리이름 && 소리.length) 이름확인(소리이름, 소리, "효과음", st.line);
      /* 자막 꾸미기 낱말 — 한 줄에만 따로 입히는 것들.
         `자막 "…" 차림표:예능` 처럼 뒤에 붙인다. */
      if (st.opt) {
        값확인("글꼴", st.opt.글꼴, st.line);
        값확인("바탕", st.opt.바탕, st.line);
        /* `모양:` 은 자막 차림표의 딴 이름이지만 소품에서는 **소품 모양**을 뜻한다.
           같은 낱말이 두 뜻이라 소품 줄에서는 여기서 보지 않는다. */
        값확인("차림표", st.kind === "소품선언" ? st.opt.차림표
                                               : (st.opt.차림표 || st.opt.모양), st.line);
        값확인("자막등장", st.opt.등장, st.line);
        값확인("자막가로", st.opt.가로, st.line);
        값확인("자막세로", st.opt.세로, st.line);
      }
    }
  }

  /* ⑤ 포즈 — 그 캐릭터가 정말 가진 포즈인가.
     없는 포즈를 적으면 기본 그림이 그대로 나온다. 그림이 안 바뀌는 것이 전부라
     "썼는데 왜 그대로지?" 가 되기 딱 좋다. */
  for (const s of parsed.scenes || []) {
    for (const st of s.steps || []) {
      if (st.kind !== "포즈" || !st.who || !st.role) continue;
      const c = (library.characters || []).find(
        x => x.name.replace(/\s/g, "") === String(st.who).replace(/\s/g, "").trim());
      if (!c) continue;                                   // 캐릭터 자체가 없는 건 위에서 말했다
      const 있는포즈 = Object.keys(c.poses || {});
      if (!있는포즈.length) {
        나온것.push({ line: st.line, 등급: "경고",
          msg: `"${c.name}" 은(는) 포즈가 없는 캐릭터라 \`포즈 ${st.role}\` 은 무시됩니다.`,
          고침: null });
      } else if (!있는포즈.includes(st.role)) {
        const 닮은것 = 비슷한것(st.role, 있는포즈);
        나온것.push({ line: st.line, 등급: "경고",
          msg: `"${c.name}" 에 포즈 "${st.role}" 이(가) 없어 기본 그림이 나옵니다.` +
               (닮은것 ? ` 혹시 "${닮은것}" 인가요?` : ` 있는 포즈: ${있는포즈.join(" · ")}`),
          고침: 닮은것 ? { 옛: st.role, 새: 닮은것 } : null });
      }
    }
  }

  /* ⑤ 아무 자막도 없으면 0초짜리가 된다 — 굽기 전에 알아야 한다 */
  const 컷수 = (parsed.scenes || []).reduce(
    (a, s) => a + (s.steps || []).filter(x => x.kind === "자막" || x.kind === "대사").length, 0);
  if ((parsed.scenes || []).length && !컷수) {
    나온것.push({ line: 1, 등급: "경고",
      msg: "자막(또는 대사)이 하나도 없어 길이가 0초입니다 — 영상이 안 나옵니다.", 고침: null });
  }

  나온것.sort((a, b) => (a.line || 0) - (b.line || 0));
  return 나온것;
}

export const 등급색 = {
  "오류": { c: "#ff7a7a", i: "⛔" },
  "경고": { c: "#ffcf6c", i: "⚠" },
  "알림": { c: "#8a93a8", i: "💡" },
};
