/* 📜 대본 — 사람이 읽고 고칠 수 있는 글이 곧 영상이 된다.
 *
 * Claude 가 이 대본을 쓰고, 프로그램이 그대로 그린다.
 * 사용자는 틀린 줄만 고친다. 그래서 문법은 "읽으면 이해되는" 것이 최우선이다.
 *
 *   제목: 고구마 굽기
 *   비율: 9:16
 *   음악: 댕청댕청.mp3
 *
 *   장면 모닥불   전환:페이드
 *     댕댕이 등장 왼쪽 크기:0.4 표정:평온
 *     효과 불꽃 위치:0.5,0.72
 *     자막 "후~ 불어 주세요"   소리:톡
 *     댕댕이 이동 가운데 2초
 *     댕댕이 표정 놀람
 *     자막 "다 구웠다!"        효과:반짝임
 *
 * 시간 규칙 — 헷갈리지 않게 딱 하나로 정한다.
 *   ▸ 시간을 앞으로 미는 것은 `자막` 과 `대기` 뿐이다.
 *   ▸ 나머지(등장·이동·표정·효과)는 '지금 시각'에 시작해서 제 시간만큼 흐른다.
 *   즉 자막 한 줄이 컷 하나다 (뮤직비주얼의 가사 한 줄과 같다).
 */

/* ── 🎵 음악 프롬프트 ─────────────────────────────────
 * 배경음악은 Suno 같은 바깥 도구에서 뽑아 넣는다.
 * 그래서 대본에는 '어떤 음악이어야 하는가'를 글로 적어 둔다 — Claude 가 이야기를 읽고 채운다.
 *
 *   음악프롬프트: warm acoustic ukulele, cozy campfire, gentle 90bpm, no vocals
 *   음악분위기: 포근하고 느긋한
 *
 * 화면에서는 [복사] 버튼 하나로 Suno 에 붙여 넣을 수 있게 한다.
 */
export const MUSIC_FIELDS = ["음악", "음악프롬프트", "음악분위기", "음악길이"];

/** 대본의 음악 정보만 모아서 돌려준다 (복사 버튼용) */
export function musicBrief(doc) {
  const m = doc.meta || {};
  const secs = Math.round(doc.seconds || 0);
  return {
    prompt: m.음악프롬프트 || "",
    mood: m.음악분위기 || "",
    file: m.음악 || "",
    seconds: secs,
    // Suno 에 그대로 붙여 넣을 한 줄
    suno: [m.음악프롬프트, m.음악분위기 && `mood: ${m.음악분위기}`,
           secs && `about ${secs} seconds`, "instrumental"].filter(Boolean).join(", "),
  };
}

/* ── 위치 이름 → 화면 좌표 (0~1) ── */
export const SPOTS = {
  "왼쪽": [0.22, 0.72], "가운데": [0.50, 0.72], "오른쪽": [0.78, 0.72],
  "왼쪽위": [0.22, 0.40], "가운데위": [0.50, 0.38], "오른쪽위": [0.78, 0.40],
  "왼쪽끝": [0.05, 0.72], "오른쪽끝": [0.95, 0.72],
  "아래": [0.50, 0.88], "위": [0.50, 0.30], "화면밖왼쪽": [-0.15, 0.72],
  "화면밖오른쪽": [1.15, 0.72],
};

/* ── 자막이 화면에 머무는 기본 시간 ── */
export const readSeconds = text => {
  const n = (text || "").replace(/\s/g, "").length;
  return Math.max(1.4, Math.min(6, 1.0 + n * 0.13));
};

const NUM = /^(-?\d+(?:\.\d+)?)/;
/* 시간은 반드시 '초'(또는 s)를 붙여야 한다.
   그냥 숫자는 각도·크기 같은 다른 값일 수 있으므로 시간으로 읽지 않는다.
   (예: `기울이기 18 0.5초` — 18은 각도, 0.5초가 시간) */
const secOf = tok => {
  const m = String(tok).match(/^(-?\d+(?:\.\d+)?)\s*(?:초|s)$/);
  return m ? parseFloat(m[1]) : null;
};

/* 배우에게 내리는 동사 — 이름 뒤에 오는 말.
   이름이 여러 낱말일 수 있으므로(우리집 강아지), 어디까지가 이름인지 이걸로 가른다. */
export const ACTOR_VERBS = new Set([
  "등장", "나옴", "이동", "걸어감", "대사", "말", "표정", "표정반복", "표정번갈아",
  "점프", "폴짝", "떨기", "부들부들", "기울이기", "갸웃", "방향", "돌아보기",
  "동작", "눈물", "퇴장", "사라짐", "크기",
  "눌리기", "늘어나기", "상태",
  "붙이기", "들기", "떼기", "놓기", "돌리기",   // 들기·놓기는 붙이기·떼기의 딴 이름
  "포즈", "모습",                       // 올려 둔 그림 여러 장 중 하나로 갈아 끼운다
]);

/** `크기:0.4` `위치:0.5,0.7` 같은 꼬리표를 뽑아낸다 */
function readOptions(tokens) {
  const opt = {}, rest = [];
  for (const t of tokens) {
    const i = t.indexOf(":");
    if (i > 0 && !/^"/.test(t)) {
      const k = t.slice(0, i), v = t.slice(i + 1);
      opt[k] = v.includes(",") && NUM.test(v) ? v.split(",").map(Number) : v;
    } else rest.push(t);
  }
  return { opt, rest };
}

/** 낱말 쪼개기 — 세 가지를 알아본다.
 *    "글"      따옴표 안은 통째로 한 덩어리   → { text }
 *    <이름>    개체(배우·배경·소품)           → { obj }
 *    그 밖     그냥 낱말                      → 글자열
 *
 * 개체를 꺾쇠로 감싸는 이유: 이름이 어디서 끝나는지 **추측하지 않아도 된다.**
 * 띄어쓴 이름("우리집 강아지")도, 동사와 같은 이름("<이동> 등장")도 안전하다.
 */
function tokenize(line) {
  const out = [];
  const re = /"([^"]*)"|<([^<>]*)>|(\S+)/g;
  let m;
  while ((m = re.exec(line))) {
    if (m[1] !== undefined) out.push({ text: m[1] });
    else if (m[2] !== undefined) out.push({ obj: m[2].trim() });
    else out.push(m[3]);
  }
  return out;
}

/* 자리인가 — 이름(왼쪽·가운데)이거나 좌표(0.5,0.7)면 자리다.
   사전에 "숫자로 직접 쓸 수도 있습니다" 라고 적어 두고도 파서가 이름만 봐서
   좌표가 조용히 무시되던 것을 여기서 바로잡는다. */
export const isSpot = a => typeof a === "string" &&
  (!!SPOTS[a] || /^-?\d*\.?\d+\s*,\s*-?\d*\.?\d+$/.test(a));

/** 개체 토큰인가 */
const isObj = t => t && typeof t === "object" && typeof t.obj === "string";

/* ── 꾸밈 벗기기 ──
 *
 * 대본을 밖의 LLM(클로드·챗GPT)에게 시키면 마크다운 버릇이 그대로 딸려 온다.
 *   ───────────── 0~7초 · 비몽, 그냥 둥둥
 *   **장면 1**
 *   - 자막 "안녕"
 * 사람 눈에는 꾸밈이지만 파서에는 명령이라 "무슨 말인지 모르겠습니다" 가 쏟아졌다.
 * 뜻은 하나도 잃지 않으니, 여기서 조용히 걷어 낸다.
 *
 * 통째로 버리는 줄과 껍질만 벗기는 줄을 나눈다 —
 * 구분선은 뒤에 글이 붙어도 그 줄 전체가 사람용 머리글이지만,
 * 글머리표(`- 자막 …`)는 뒤가 진짜 명령이다.
 */
const 버릴줄 = [
  /^\s*(?:[─━═╌╍—–~]{2,}|[-=*_]{3,})/,   // 구분선으로 시작 (뒤에 글이 붙어도 머리글)
  /^\s*\/\//,                              // // 주석
  /^\s*[[(【〔]\s*\d+\s*[~-]/,             // [0~7초] 처럼 구간 표시로 시작
];
function 꾸밈벗기기(s) {
  if (!s.trim()) return s;
  if (버릴줄.some(re => re.test(s))) return "";
  if (!/[\p{L}\p{N}]/u.test(s)) return "";             // 글자·숫자가 하나도 없는 줄
  const 들여 = s.match(/^\s*/)[0];
  let t = s.slice(들여.length)
    .replace(/^(?:[-*+•‣▪▶]\s+|\d+[.)]\s+)/, "")        // 글머리표 · 번호 매기기
    .replace(/\*\*/g, "")                               // **굵게**
    .replace(/^`+|`+$/g, "");                           // `코드`
  return 들여 + t;
}

/**
 * 대본 글 → 구조
 * @returns {meta, scenes:[{bg, opt, seconds, steps:[…], line}], errors:[]}
 */
export function parseScript(src) {
  const meta = {}, scenes = [], errors = [], warnings = [];
  let scene = null, at = 0;                 // at = 지금 시각(초)

  /* 경고 — 못 알아들은 것(errors)이 아니라 **알아들었지만 수상한 것**.
     예전에는 이런 것들이 조용히 넘어가서, 30초를 굽고 나서야 틀린 줄 알았다.
     `고친줄` 은 그 줄을 통째로 바꿀 글이다 (이름 오타처럼 낱말만 바꾸는 것과 다르다). */
  const 경고 = (line, msg, 고친줄 = null) => warnings.push({ line, msg, 고친줄 });

  const push = step => {
    if (!scene) {
      errors.push({ line: step.line, msg: "'장면' 을 먼저 써야 합니다." });
      return null;
    }
    scene.steps.push(step);
    return step;
  };

  (src || "").split(/\r?\n/).forEach((raw, i) => {
    const lineNo = i + 1;
    /* 주석(`# 설명`) 자르기.
       색 코드(`#ffcc00`)는 주석이 아니다 — `#` 뒤에 16진수 3·6자리만 오고 끝나면 색이다.
       (예전에는 통째로 잘라서 `색:#ffffff` 가 조용히 사라졌다.) */
    const line = 꾸밈벗기기(
      raw.replace(/\s*#(?![0-9a-fA-F]{3}\b)(?![0-9a-fA-F]{6}\b).*$/, "").trimEnd());
    if (!line.trim()) return;

    // 들여쓰기가 없고 `키:값` 이면 프로젝트 설정
    const head = line.match(/^(\S+)\s*:\s*(.+)$/);
    if (!/^\s/.test(line) && head && head[1] !== "장면") {
      meta[head[1]] = head[2].trim();
      return;
    }

    /* ── 짝이 안 맞는 따옴표·꺾쇠 ──
       tokenize 는 짝이 맞는 것만 집는다. 안 닫은 따옴표는 통째로 사라져
       "자막을 썼는데 왜 안 나오지?" 가 된다. 그래서 세어 본다. */
    const 따옴표수 = (line.match(/"/g) || []).length;
    if (따옴표수 % 2) {
      경고(lineNo, '따옴표(")를 안 닫았습니다 — 이 글은 자막으로 안 나옵니다.',
           line.trimEnd() + '"');
    }
    const 연꺾쇠 = (line.match(/</g) || []).length;
    const 닫꺾쇠 = (line.match(/>/g) || []).length;
    if (연꺾쇠 !== 닫꺾쇠) {
      경고(lineNo, "꺾쇠(< >)의 짝이 안 맞습니다 — 이름을 못 알아봅니다.");
    }

    const tk = tokenize(line.trim());
    if (!tk.length) return;
    // 첫 낱말이 개체(<이름>)면 first 는 비어 있고, 아래 배우 지시로 흘러간다
    const first = typeof tk[0] === "string" ? tk[0] : "";

    /* ── 장면 시작 ── */
    if (first === "장면") {
      const { opt, rest } = readOptions(tk.slice(1).filter(t => typeof t === "string"));
      // 배경 이름은 `장면 <밤바다>` 처럼 감싸는 것이 확실하다.
      // 안 감싸도 되게 남겨 둔다 — 이때는 남은 낱말을 이어 붙인다.
      const 감쌈 = tk.slice(1).find(isObj);
      scene = { bg: 감쌈 ? 감쌈.obj : rest.join(" "),
                opt, steps: [], seconds: 0, line: lineNo };
      scenes.push(scene);
      at = 0;
      return;
    }

    const { opt, rest } = readOptions(tk.slice(1).filter(t => typeof t === "string"));
    // 따옴표 글만 찾는다 — 개체(<이름>)도 객체라서 그냥 찾으면 잘못 집는다
    const quoted = tk.find(t => t && typeof t === "object" && typeof t.text === "string");

    /* ── 자막 — 화면 아래 띠. 시간을 앞으로 민다 ── */
    if (first === "자막") {
      const text = quoted ? quoted.text : rest.join(" ");
      const dur = rest.map(secOf).find(v => v != null) ?? secOf(opt.길이) ?? readSeconds(text);
      const step = push({ kind: "자막", text, t: at, dur, opt, line: lineNo });
      if (step) at += dur;
      return;
    }

    /* 시간만 받는 낱말에서 `초` 를 빠뜨렸는가.
       `대기 3` 은 3초를 뜻한 것이 뻔한데 예전에는 조용히 1초가 됐다.
       (각도도 함께 받는 `기울이기 18` 같은 것은 18이 각도라 맞으므로 건드리지 않는다.) */
    const 초빠짐 = (말들, 뭐라고) => {
      if (말들.some(a => secOf(a) != null)) return;
      const 맨숫자 = 말들.find(a => /^\d+(\.\d+)?$/.test(a));
      if (맨숫자) {
        // 들여쓰기는 그대로 둔다 — 대본에서 들여쓰기가 곧 '장면 안' 이라는 뜻이다
        경고(lineNo, `${뭐라고} 시간에 '초' 를 안 붙였습니다 — ${맨숫자}는 무시됩니다.`,
             line.replace(new RegExp(`(\\s)${맨숫자}(\\s|$)`), `$1${맨숫자}초$2`).trimEnd());
      }
    };

    /* ── 멈칫 — 그 순간 화면을 잠깐 얼린다 (만화의 타격감) ── */
    if (first === "멈칫") {
      초빠짐(rest, "멈칫");
      const d = rest.map(secOf).find(v => v != null) ?? 0.18;
      push({ kind: "멈칫", t: at, dur: d, line: lineNo });
      at += d;
      return;
    }

    /* ── 대기 — 시간만 민다 ── */
    if (first === "대기" || first === "쉼") {
      초빠짐(rest, first);
      const d = rest.map(secOf).find(v => v != null) ?? 1;
      push({ kind: "대기", t: at, dur: d, line: lineNo });
      at += d;
      return;
    }

    /* ── 소품 선언 — 이 개체는 '물건'이다 ──
         소품 <공>
         소품 <내 공> 모양:공          (이름과 모양이 다를 때)
       선언한 뒤에는 배우와 똑같은 지시를 쓴다 (등장·이동·점프·붙이기…). */
    if (first === "소품" || first === "물건") {
      const 감쌈 = tk.slice(1).find(isObj);
      const 이름 = 감쌈 ? 감쌈.obj : rest[0];
      if (!이름) {
        errors.push({ line: lineNo, msg: "소품 이름이 없습니다: `소품 <공>` 처럼 씁니다." });
        return;
      }
      push({ kind: "소품선언", who: 이름, 모양: opt.모양 || 이름, opt, line: lineNo });
      return;
    }

    /* ── 효과 ── */
    if (first === "효과") {
      push({ kind: "효과", name: rest[0] || "반짝임", t: at,
             dur: secOf(opt.길이) ?? null, opt, line: lineNo });
      return;
    }

    /* ── 카메라 — 정지 그림을 살리는 가장 값싼 연출 ──
       카메라 줌인 2초 세기:1.25 / 카메라 이동 오른쪽 2초 / 카메라 흔들기 0.4초 / 카메라 되돌리기 1초 */
    if (first === "카메라") {
      const move = rest[0] || "되돌리기";
      초빠짐(rest.slice(1), "카메라");     // 첫 낱말은 동작 이름이라 뺀다
      const d = rest.map(secOf).find(v => v != null) ?? (move === "흔들기" ? 0.4 : 1.5);
      push({ kind: "카메라", move, t: at, dur: d, args: rest.slice(1),
             spot: rest.find(isSpot) || null, opt, line: lineNo });
      return;
    }

    /* ── 화면 (후처리) — 게임의 포스트 프로세싱 ──
       화면 분위기 밤 / 화면 비네트 0.4 / 화면 블룸 0.5 1.2초 / 화면 번쩍 0.2초 */
    if (first === "화면" || first === "화면효과") {
      const 종류 = rest[0] || "분위기";
      const d = rest.map(secOf).find(v => v != null);
      const 값 = rest.slice(1).find(a => secOf(a) == null);
      push({ kind: "화면", 종류, 값, t: at, dur: d ?? (종류 === "번쩍" ? 0.25 : 0.8),
             opt, line: lineNo });
      return;
    }

    /* ── 시간 흐름 바꾸기 — 게임의 슬로모션 ──
       느리게 0.4 1초  (0.4배 속도로) / 빠르게 2 0.6초 / 보통속도 0.3초 */
    if (first === "느리게" || first === "빠르게" || first === "보통속도") {
      const d = rest.map(secOf).find(v => v != null) ?? 0.8;
      const 배 = parseFloat(rest.find(a => secOf(a) == null && /^[\d.]+$/.test(a)))
                 || (first === "느리게" ? 0.4 : first === "빠르게" ? 2 : 1);
      push({ kind: "시간", 배: first === "보통속도" ? 1 : 배, t: at, dur: d, opt, line: lineNo });
      return;
    }

    /* ── 소리 ── */
    if (first === "소리") {
      push({ kind: "소리", name: rest[0] || "", t: at, opt, line: lineNo });
      return;
    }

    /* ── 배우에게 내리는 지시 ──
         <누렁이> 등장 가운데        ← 권함. 이름이 어디서 끝나는지 확실하다
         누렁이 등장 가운데          ← 예전 방식도 그대로 된다
       감싸지 않았을 때는 **아는 동사**를 찾아 그 앞을 통째로 이름으로 삼는다
       (띄어쓴 이름 "우리집 강아지" 를 살리기 위해서다). */
    let who, verb, args;
    if (isObj(tk[0])) {
      who = tk[0].obj;
      const 남은 = readOptions(tk.slice(1).filter(t => typeof t === "string")).rest;
      verb = 남은[0];
      args = 남은.slice(1);
    } else {
      const vi = rest.findIndex(w => ACTOR_VERBS.has(w));
      who = vi < 0 ? first : [first, ...rest.slice(0, vi)].join(" ");
      verb = vi < 0 ? rest[0] : rest[vi];
      args = rest.slice(vi < 0 ? 1 : vi + 1);
    }
    const dur = args.map(secOf).find(v => v != null);
    const spot = args.find(isSpot) || null;

    /* 자리를 적었는데 그런 자리가 없을 때.
       `등장 한가운데` 는 자리로 안 읽혀 조용히 `가운데` 가 된다 — 뜻은 맞아서 티가 안 나지만
       `등장 왼쪽위쪽` 처럼 어긋나면 배우가 엉뚱한 데 선다. 그래서 말해 준다. */
    const 딴말 = ["부드럽게", "빠르게", "천천히", "제자리"];
    const 자리아님 = (뭐라고) => {
      if (spot) return;
      const w = args.find(a => secOf(a) == null && !딴말.includes(a) &&
                               !/^[\d.]+$/.test(a) && !a.includes(":"));
      if (w) 경고(lineNo, `"${w}" 은(는) 없는 자리라 ${뭐라고} 기본 자리로 갑니다.`);
    };

    if (verb === "등장" || verb === "나옴") {
      자리아님("가운데");
      push({ kind: "등장", who, t: at, spot: spot || "가운데",
             dur: dur ?? 0.4, opt, line: lineNo });
      return;
    }
    if (verb === "이동" || verb === "걸어감") {
      const 여러곳 = args.find(a => a.includes(",") && a.split(",").every(x => SPOTS[x]));
      if (여러곳) {
        push({ kind: "경로", who, t: at, spots: 여러곳.split(","),
               dur: dur ?? 2, opt, line: lineNo });
        return;
      }
      자리아님("가운데");
      push({ kind: "이동", who, t: at, spot: spot || "가운데",
             dur: dur ?? 1.5, ease: args.includes("부드럽게") ? "ease" : (opt.방식 || "ease"),
             opt, line: lineNo });
      return;
    }
    if (verb === "대사" || verb === "말") {
      const text = quoted ? quoted.text : args.filter(a => !secOf(a)).join(" ");
      const dur = args.map(secOf).find(v => v != null) ?? readSeconds(text);
      const step = push({ kind: "대사", who, text, t: at, dur, opt, line: lineNo });
      if (step) at += dur;                       // 대사도 시간을 민다
      return;
    }
    /* ── 표정 바꾸기 — 여러 방법 ──
       개 표정 happy            즉시
       개 표정 happy 팝          톡 하고 바뀜 (머리가 살짝 커졌다 작아짐)
       개 표정 happy 서서히 0.5초  앞 표정과 겹치며 천천히 바뀜
       개 표정반복 happy,sad 0.6초 두 표정을 번갈아 */
    if (verb === "표정") {
      const words = args.filter(a => !secOf(a));
      const 방식 = words.find(w => ["팝", "서서히", "즉시"].includes(w)) || "즉시";
      const name = words.find(w => !["팝", "서서히", "즉시"].includes(w)) || "평온";
      push({ kind: "표정", who, t: at, name, 방식,
             dur: dur ?? (방식 === "서서히" ? 0.45 : 0.25), opt, line: lineNo });
      return;
    }
    if (verb === "표정반복" || verb === "표정번갈아") {
      const list = (args.find(a => a.includes(",")) || args[0] || "").split(",").filter(Boolean);
      push({ kind: "표정반복", who, t: at, list, dur: dur ?? 0.6, opt, line: lineNo });
      return;
    }

    /* ── 움직임 여러 가지 ── */
    if (verb === "점프" || verb === "폴짝") {
      push({ kind: "점프", who, t: at, spot: spot || "제자리",
             dur: dur ?? 0.7, height: parseFloat(opt.높이) || 0.18, opt, line: lineNo });
      return;
    }
    /* 눌리기·늘어나기 — 부피를 지키며 납작해지거나 홀쭉해진다.
       착지·놀람에는 눌리기, 뛰어오를 때는 늘어나기. */
    if (verb === "눌리기" || verb === "늘어나기") {
      push({ kind: verb, who, t: at, dur: dur ?? 0.3, opt, line: lineNo });
      return;
    }
    /* 붙이기 — 다른 개체에 매단다 (게임 엔진의 부모-자식).
         <공> 붙이기 <누렁이> 손
       부모가 움직이면 같이 간다. 자리는 손·머리·등·입·발 중에서 고른다. */
    if (verb === "붙이기" || verb === "들기") {
      const 부모 = tk.slice(1).find(isObj);
      push({ kind: "붙이기", who, t: at,
             부모: 부모 ? 부모.obj : args.find(a => !isSpot(a) && !secOf(a)),
             자리: args.find(a => ["손", "머리", "등", "입", "발", "가운데"].includes(a)) || "손",
             opt, line: lineNo });
      return;
    }
    if (verb === "떼기" || verb === "놓기") {
      push({ kind: "떼기", who, t: at, opt, line: lineNo });
      return;
    }
    /* 돌리기 — 계속 빙글빙글 (공·별처럼 굴러가는 물건에) */
    if (verb === "돌리기") {
      push({ kind: "돌리기", who, t: at, dur: dur ?? 1,
             바퀴: parseFloat(args.find(a => /^-?[\d.]+$/.test(a))) || 1, opt, line: lineNo });
      return;
    }

    /* 상태 — 표정·동작·효과를 한 낱말로 묶어 바꾼다 (게임의 상태 기계).
       `누렁이 상태 놀람` 한 줄이 표정·움찔·효과를 한꺼번에 건다. */
    if (verb === "상태") {
      push({ kind: "상태", who, t: at, name: args.find(a => !secOf(a)) || "평온",
             dur: dur ?? 0.3, opt, line: lineNo });
      return;
    }
    if (verb === "떨기" || verb === "부들부들") {
      push({ kind: "떨기", who, t: at, dur: dur ?? 0.6,
             amp: parseFloat(opt.세기) || 1, opt, line: lineNo });
      return;
    }
    if (verb === "기울이기" || verb === "갸웃") {
      const deg = parseFloat(args.find(a => /^-?\d/.test(a))) || 12;
      push({ kind: "기울이기", who, t: at, deg, dur: dur ?? 0.5, opt, line: lineNo });
      return;
    }
    if (verb === "방향" || verb === "돌아보기") {
      push({ kind: "방향", who, t: at,
             dir: args.includes("왼쪽") ? -1 : 1, opt, line: lineNo });
      return;
    }
    /* 포즈 — 한 캐릭터에 그림이 여러 장 있을 때 그중 하나로 갈아 끼운다.
       `<비몽> 포즈 sleep` · `<비몽> 모습 angry`
       (그림이 한 장뿐이면 아무 일도 안 일어난다 — 대본은 그대로 돌아간다) */
    if (verb === "포즈" || verb === "모습") {
      const 이름 = args.find(a => !secOf(a));
      if (!이름) {
        errors.push({ line: lineNo, msg: "어느 포즈인지 적어야 합니다: `<이름> 포즈 sleep`" });
        return;
      }
      push({ kind: "포즈", who, t: at, role: 이름, opt, line: lineNo });
      return;
    }
    if (verb === "동작") {
      push({ kind: "동작", who, t: at, name: args.find(a => !secOf(a)) || "숨쉬기",
             opt, line: lineNo });
      return;
    }
    if (verb === "눈물") {
      push({ kind: "눈물", who, t: at, name: args.find(a => !secOf(a)) || "또르르",
             opt, line: lineNo });
      return;
    }
    if (verb === "퇴장" || verb === "사라짐") {
      push({ kind: "퇴장", who, t: at, dur: dur ?? 0.4, opt, line: lineNo });
      return;
    }
    if (verb === "크기") {
      push({ kind: "크기", who, t: at, value: parseFloat(args[0]) || 1,
             dur: dur ?? 0.5, opt, line: lineNo });
      return;
    }

    errors.push({ line: lineNo, msg: `무슨 말인지 모르겠습니다: "${line.trim()}"` });
  });

  // 장면 길이 = 시간을 민 것들의 합 (또는 길이: 로 못 박은 값)
  scenes.forEach(s => {
    const end = s.steps.reduce((m, st) => Math.max(m, (st.t || 0) + (st.dur || 0)), 0);
    s.seconds = parseFloat(s.opt.길이) || Math.max(1, end);
  });
  return { meta, scenes, errors, warnings,
           seconds: scenes.reduce((a, s) => a + s.seconds, 0) };
}

/** 구조 → 대본 글 (설정을 화면에서 고쳤을 때 대본에 되쓰기) */
export function writeScript(doc) {
  const out = [];
  // 개체는 언제나 꺾쇠로 감싸 내보낸다 — 다시 읽을 때 추측이 필요 없다
  const 개 = n => `<${n}>`;
  Object.entries(doc.meta || {}).forEach(([k, v]) => out.push(`${k}: ${v}`));
  if (out.length) out.push("");
  const optStr = o => Object.entries(o || {})
    .map(([k, v]) => `${k}:${Array.isArray(v) ? v.join(",") : v}`).join(" ");
  for (const s of doc.scenes || []) {
    out.push(`장면 ${개(s.bg)}${s.opt && Object.keys(s.opt).length ? " " + optStr(s.opt) : ""}`);
    for (const st of s.steps) {
      const o = optStr(st.opt);
      const tail = o ? " " + o : "";
      if (st.kind === "자막") out.push(`  자막 "${st.text}"${tail}`);
      else if (st.kind === "대사") out.push(`  ${개(st.who)} 대사 "${st.text}"${tail}`);
      else if (st.kind === "멈칫") out.push(`  멈칫 ${st.dur}초`);
      else if (st.kind === "대기") out.push(`  대기 ${st.dur}초`);
      else if (st.kind === "효과") out.push(`  효과 ${st.name}${tail}`);
      else if (st.kind === "카메라")
        out.push(`  카메라 ${st.move}${st.spot ? " " + st.spot : ""} ${st.dur}초${tail}`);
      else if (st.kind === "소리") out.push(`  소리 ${st.name}${tail}`);
      else if (st.kind === "등장") out.push(`  ${개(st.who)} 등장 ${st.spot}${tail}`);
      else if (st.kind === "이동") out.push(`  ${개(st.who)} 이동 ${st.spot} ${st.dur}초${tail}`);
      else if (st.kind === "표정")
        out.push(`  ${개(st.who)} 표정 ${st.name}${st.방식 && st.방식 !== "즉시" ? " " + st.방식 : ""}${tail}`);
      else if (st.kind === "표정반복") out.push(`  ${개(st.who)} 표정반복 ${(st.list||[]).join(",")} ${st.dur}초${tail}`);
      else if (st.kind === "점프") out.push(`  ${개(st.who)} 점프 ${st.spot} ${st.dur}초${tail}`);
      else if (st.kind === "떨기") out.push(`  ${개(st.who)} 떨기 ${st.dur}초${tail}`);
      else if (st.kind === "기울이기") out.push(`  ${개(st.who)} 기울이기 ${st.deg} ${st.dur}초${tail}`);
      else if (st.kind === "방향") out.push(`  ${개(st.who)} 방향 ${st.dir < 0 ? "왼쪽" : "오른쪽"}${tail}`);
      else if (st.kind === "경로") out.push(`  ${개(st.who)} 이동 ${(st.spots||[]).join(",")} ${st.dur}초${tail}`);
      else if (st.kind === "동작") out.push(`  ${개(st.who)} 동작 ${st.name}${tail}`);
      else if (st.kind === "눈물") out.push(`  ${개(st.who)} 눈물 ${st.name}${tail}`);
      else if (st.kind === "크기") out.push(`  ${개(st.who)} 크기 ${st.value}${tail}`);
      else if (st.kind === "퇴장") out.push(`  ${개(st.who)} 퇴장${tail}`);
    }
    out.push("");
  }
  return out.join("\n");
}
