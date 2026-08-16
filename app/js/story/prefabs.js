/* 🧩 조각 펼치기 — 대본 속 `조각 <이름>` 을 그 자리에 실제 줄들로 바꾼다.
 *
 * 왜 파서(script.js)가 아니라 그 앞에서 하는가
 *   · 조각은 **서버에 있는 것**이라 읽어 와야 한다. 파서는 글만 보고 판단하는 순수한 함수로 두어야
 *     미리보기·굽기·검사가 늘 같은 결과를 낸다.
 *   · 그래서 "글 → 글" 로 한 번 펼친 뒤 넘긴다. 파서는 조각을 몰라도 된다.
 *
 * 대본에서
 *     조각 <아침 인사>
 * 라고 쓰면 그 이름의 조각에 적힌 줄들이 통째로 들어간다. 들여쓰기는 부르는 줄을 따른다.
 */
let 표 = null;                    // 이름(공백 뺀 것) → 글
let 읽는중 = null;

/** 조각 목록 한 번 읽어 두기 (수백 편을 만들 때 매번 부르면 느려진다) */
export async function loadPrefabs(다시 = false) {
  if (표 && !다시) return 표;
  if (읽는중 && !다시) return 읽는중;
  읽는중 = (async () => {
    const m = new Map();
    try {
      const d = await (await fetch("/api/prefab/list")).json();
      for (const x of d.items || []) {
        if (x.name) m.set(String(x.name).replace(/\s/g, ""), String(x.text || ""));
      }
    } catch { /* 못 읽어도 대본은 그대로 돈다 */ }
    표 = m;
    읽는중 = null;
    return 표;
  })();
  return 읽는중;
}

export function 조각비우기() { 표 = null; }

/** 지금 알고 있는 조각 이름들 (안내서·자동완성용) */
export function prefabNames() { return 표 ? [...표.keys()] : []; }

const 부르는줄 = /^(\s*)조각\s+(?:<([^<>]+)>|(\S.*?))\s*$/;

/** 글 → 글. 조각이 없거나 못 읽었으면 **원래 글을 그대로** 돌려준다. */
export function expandPrefabs(text, 깊이 = 0) {
  if (!표 || !표.size || !text || text.indexOf("조각") < 0) return text;
  if (깊이 > 3) return text;                    // 조각이 조각을 부르는 고리를 끊는다
  let 바뀜 = false;
  const 나온것 = [];
  for (const line of String(text).split("\n")) {
    const m = line.match(부르는줄);
    const 이름 = m && (m[2] || m[3] || "").replace(/\s/g, "");
    const 글 = 이름 ? 표.get(이름) : null;
    if (글 == null) { 나온것.push(line); continue; }
    바뀜 = true;
    const 들여 = m[1] || "";
    for (const l of expandPrefabs(글, 깊이 + 1).split("\n")) 나온것.push(들여 + l);
  }
  return 바뀜 ? 나온것.join("\n") : text;
}
