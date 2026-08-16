/* 🏞 코드로 그리는 배경 — 그림이 없어도 대본만으로 볼만한 영상이 나오게 한다.
 *
 * 규칙은 무대와 같다: 자기 시계를 갖지 않고 **'시각 t 의 화면'** 을 그린다.
 * 그래야 미리보기와 구운 영상이 똑같다.
 *
 * 속도가 생명이라 두 겹으로 나눈다.
 *   ① 안 움직이는 것(하늘·땅·나무·집)은 딴 종이에 **한 번만** 그려 두고 그대로 붙인다.
 *   ② 움직이는 것(구름·파도·별빛·비·눈)만 매 장면 새로 그린다.
 * 덕분에 배경 하나에 0.1ms 안팎이면 끝난다.
 *
 * 배경 이름은 사람이 쓰던 대로 적으면 된다 — "밤바다", "노을 지는 들판", "눈 오는 마을".
 * 낱말을 찾아 시간대 + 장소로 조합한다.
 */

/* ── 흔들리지 않는 난수 — 같은 이름이면 언제나 같은 그림 ── */
function 씨앗(글) {
  let h = 2166136261;
  for (let i = 0; i < 글.length; i++) { h ^= 글.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function 난수기(s) {
  let x = s || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
const 섞기 = (a, b, k) => a + (b - a) * k;
const 색 = (r, g, b, a = 1) => `rgba(${r|0},${g|0},${b|0},${a})`;
const 섞색 = (A, B, k) => A.map((v, i) => Math.round(섞기(v, B[i], k)));

/* ── 단색 배경 ──
   그림도 풍경도 필요 없이 그냥 흰 바탕·검은 바탕에 세우고 싶을 때가 많다.
   (자막만 띄우는 화면, 캐릭터 소개, 유튜브 인트로 …)
   대본에 `장면 흰색` 또는 `장면 어디든 배경색:검정` 이라고 쓴다. */
const COLORS = {
  "흰색": [255, 255, 255], "하양": [255, 255, 255], "흰": [255, 255, 255], "화이트": [255, 255, 255],
  "검정": [17, 17, 20], "검은색": [17, 17, 20], "까망": [17, 17, 20], "블랙": [17, 17, 20],
  "회색": [148, 150, 156], "쥐색": [120, 122, 130], "은색": [206, 210, 216],
  "크림": [252, 246, 232], "베이지": [240, 230, 210], "미색": [248, 242, 228],
  "하늘색": [176, 216, 244], "파랑": [92, 150, 220], "남색": [42, 58, 110],
  "초록": [118, 188, 118], "연두": [190, 224, 150], "청록": [96, 190, 184],
  "노랑": [250, 220, 110], "주황": [246, 168, 92], "빨강": [230, 106, 100],
  "분홍": [246, 186, 200], "연분홍": [250, 214, 222], "보라": [162, 130, 216],
  "연보라": [212, 196, 244], "갈색": [154, 118, 88], "살구": [250, 208, 178],
};

/** 낱말·#rrggbb → 색. 색이 아니면 null */
export function readColor(word) {
  const w = String(word || "").trim().replace(/\s/g, "");
  if (!w) return null;
  if (COLORS[w]) return COLORS[w];
  const h = w.match(/^#?([0-9a-f]{6})$/i);
  if (h) return [0, 2, 4].map(i => parseInt(h[1].slice(i, i + 2), 16));
  const h3 = w.match(/^#([0-9a-f]{3})$/i);
  if (h3) return [0, 1, 2].map(i => parseInt(h3[1][i] + h3[1][i], 16));
  // "흰색바탕", "검정배경" 처럼 붙여 쓴 경우
  const 꼬리 = w.replace(/(바탕|배경|색깔)$/, "");
  return COLORS[꼬리] || null;
}

/** 사전 화면용 색 이름 */
export const colorWords = () => Object.keys(COLORS);

/* ── 시간대 ── */
const TIMES = [
  { 말: ["한밤", "밤", "야간", "달밤", "별밤"], 이름: "밤",
    하늘: [[14, 20, 52], [46, 62, 116]], 땅어둠: 0.42, 별: 1, 달: 1, 빛: [188, 202, 255] },
  { 말: ["새벽", "동틀", "여명"], 이름: "새벽",
    하늘: [[64, 72, 122], [232, 176, 168]], 땅어둠: 0.24, 별: 0.4, 빛: [255, 214, 196] },
  { 말: ["노을", "저녁", "석양", "해질", "황혼"], 이름: "노을",
    하늘: [[86, 108, 176], [255, 186, 128]], 땅어둠: 0.16, 해: 1, 빛: [255, 196, 140] },
  { 말: ["아침", "새벽녘", "이른"], 이름: "아침",
    하늘: [[150, 205, 240], [236, 242, 226]], 땅어둠: 0.02, 빛: [255, 248, 214] },
  { 말: ["흐림", "흐린", "구름낀", "먹구름"], 이름: "흐림",
    하늘: [[168, 178, 190], [214, 218, 222]], 땅어둠: 0.12, 구름: 1.6 },
  { 말: ["비", "빗속", "장마", "소나기"], 이름: "비",
    하늘: [[128, 140, 156], [186, 194, 202]], 땅어둠: 0.2, 구름: 1.8, 비: 1 },
  { 말: ["눈", "눈오는", "함박눈"], 이름: "눈",
    하늘: [[186, 198, 214], [230, 236, 244]], 땅어둠: 0.05, 구름: 1.2, 눈발: 1 },
];
const 낮 = { 이름: "낮", 하늘: [[126, 194, 238], [206, 232, 246]], 땅어둠: 0, 구름: 1 };

/* ── 장소 ── */
const PLACES = [
  { 말: ["바다", "해변", "백사장", "바닷가", "파도", "섬"], 이름: "바다",
    바닥: "바다", 지평: 0.56, 소품: ["갈매기"] },
  { 말: ["강", "개울", "시냇", "호수", "연못"], 이름: "물가",
    바닥: "잔디", 지평: 0.58, 소품: ["물줄기", "나무", "돌"] },
  { 말: ["숲", "수풀", "정글", "나무숲"], 이름: "숲",
    바닥: "흙", 지평: 0.6, 소품: ["숲나무"] },
  { 말: ["산", "언덕", "고개", "봉우리"], 이름: "산",
    바닥: "잔디", 지평: 0.62, 소품: ["산", "나무"] },
  { 말: ["길", "거리", "도로", "골목", "횡단"], 이름: "길",
    바닥: "길", 지평: 0.58, 소품: ["집", "전봇대"] },
  { 말: ["마을", "동네", "집앞", "시골", "골목길"], 이름: "마을",
    바닥: "잔디", 지평: 0.6, 소품: ["집", "울타리", "나무"] },
  { 말: ["방", "실내", "거실", "집안", "안방", "교실", "학교"], 이름: "실내",
    실내: true, 바닥: "마루", 지평: 0.62, 소품: ["창문", "액자"] },
  { 말: ["부엌", "주방", "식탁"], 이름: "부엌",
    실내: true, 바닥: "마루", 지평: 0.6, 소품: ["창문", "조리대"] },
  { 말: ["설원", "눈밭", "겨울", "빙판"], 이름: "눈밭",
    바닥: "눈", 지평: 0.6, 소품: ["눈나무"], 시간: "눈" },
  { 말: ["사막", "모래벌", "오아시스"], 이름: "사막",
    바닥: "모래", 지평: 0.6, 소품: ["선인장", "언덕"] },
  { 말: ["우주", "은하", "행성", "별나라"], 이름: "우주",
    우주: true, 지평: 1.2, 소품: [], 시간: "밤" },
  { 말: ["꽃밭", "꽃", "화단"], 이름: "꽃밭",
    바닥: "잔디", 지평: 0.58, 소품: ["꽃", "나무"] },
  { 말: ["캠프", "모닥불", "야영", "캠핑"], 이름: "캠프",
    바닥: "흙", 지평: 0.6, 소품: ["나무", "돌", "산"] },
  { 말: ["들판", "잔디", "공원", "초원", "풀밭", "마당", "운동장", "언덕배기"], 이름: "들판",
    바닥: "잔디", 지평: 0.58, 소품: ["나무", "구름덤불"] },
];
const 기본장소 = PLACES[PLACES.length - 1];        // 들판

/** 이름에서 낱말을 찾아 어떤 배경인지 정한다 */
export function readScenery(name) {
  const 글 = String(name || "").replace(/\s+/g, "");

  // ① 이름 자체가 색이면 단색 배경 ("장면 흰색", "장면 #202030")
  const 색값 = readColor(글);
  if (색값) {
    return { 단색: 색값, 장소: 기본장소, 시간: 낮, 알아봄: true, 이름: String(name || "") };
  }
  // ② 아무것도 안 적었으면 흰 바탕 (빈 무대)
  if (!글 || 글 === "없음" || 글 === "빈" || 글 === "빈화면") {
    return { 단색: [255, 255, 255], 장소: 기본장소, 시간: 낮, 알아봄: true, 이름: "빈 화면" };
  }

  const 장소 = PLACES.find(p => p.말.some(w => 글.includes(w))) || null;
  let 시간 = TIMES.find(t => t.말.some(w => 글.includes(w))) || null;
  if (!시간 && 장소 && 장소.시간) 시간 = TIMES.find(t => t.이름 === 장소.시간);
  return {
    장소: 장소 || 기본장소,
    시간: 시간 || 낮,
    알아봄: !!(장소 || 시간),                       // 낱말을 하나라도 알아들었는가
    이름: String(name || ""),
  };
}

/** 대본에 쓸 수 있는 배경 낱말 (사전 화면용) */
export function sceneryWords() {
  return {
    시간: TIMES.map(t => t.말[0]),
    장소: PLACES.map(p => p.말[0]),
  };
}

/* ══════════ 안 움직이는 것 — 딴 종이에 한 번만 ══════════ */

function 하늘칠(ctx, box, cfg) {
  const g = ctx.createLinearGradient(0, box.y, 0, box.y + box.h * 0.75);
  const [a, b] = cfg.시간.하늘;
  g.addColorStop(0, 색(...a)); g.addColorStop(1, 색(...b));
  ctx.fillStyle = g;
  ctx.fillRect(box.x, box.y, box.w, box.h);
}

function 실내칠(ctx, box, cfg, R) {
  const 벽 = 섞색([238, 226, 208], [96, 92, 110], cfg.시간.땅어둠);
  ctx.fillStyle = 색(...벽);
  ctx.fillRect(box.x, box.y, box.w, box.h);
  const y = box.y + box.h * cfg.장소.지평;
  ctx.fillStyle = 색(...섞색([196, 158, 112], [88, 74, 78], cfg.시간.땅어둠));
  ctx.fillRect(box.x, y, box.w, box.h - (y - box.y));
  // 마루 결
  ctx.strokeStyle = "rgba(0,0,0,0.06)";
  ctx.lineWidth = Math.max(1, box.h * 0.002);
  for (let i = 1; i < 7; i++) {
    const yy = y + (box.h - (y - box.y)) * i / 7;
    ctx.beginPath(); ctx.moveTo(box.x, yy); ctx.lineTo(box.x + box.w, yy); ctx.stroke();
  }
  // 굽도리
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  ctx.fillRect(box.x, y - box.h * 0.012, box.w, box.h * 0.012);
}

function 바닥칠(ctx, box, cfg, R) {
  const y = box.y + box.h * cfg.장소.지평;
  const h = box.y + box.h - y;
  const 어둠 = cfg.시간.땅어둠;
  const 팔레트 = {
    잔디: [[126, 190, 96], [88, 154, 74]],
    바다: [[86, 166, 208], [44, 108, 158]],
    모래: [[236, 214, 164], [212, 186, 132]],
    눈: [[244, 248, 252], [214, 226, 240]],
    흙: [[176, 146, 110], [140, 114, 84]],
    길: [[186, 182, 176], [150, 146, 142]],
  }[cfg.장소.바닥] || [[126, 190, 96], [88, 154, 74]];
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 색(...섞색(팔레트[0], [24, 26, 48], 어둠)));
  g.addColorStop(1, 색(...섞색(팔레트[1], [16, 18, 38], 어둠)));
  ctx.fillStyle = g;
  ctx.fillRect(box.x, y, box.w, h);

  if (cfg.장소.바닥 === "잔디") {                    // 풀 무늬 몇 점
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    for (let i = 0; i < 40; i++) {
      const px = box.x + R() * box.w, py = y + R() * h;
      const s = box.w * (0.004 + R() * 0.008);
      ctx.beginPath(); ctx.ellipse(px, py, s * 1.8, s, 0, 0, 7); ctx.fill();
    }
  }
  if (cfg.장소.바닥 === "길") {                      // 가운데 선
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = Math.max(2, box.w * 0.008);
    ctx.setLineDash([box.w * 0.05, box.w * 0.045]);
    ctx.beginPath(); ctx.moveTo(box.x, y + h * 0.45); ctx.lineTo(box.x + box.w, y + h * 0.45);
    ctx.stroke(); ctx.setLineDash([]);
  }
}

function 나무하나(ctx, x, y, s, 어둠, 종류 = "둥근") {
  ctx.fillStyle = 색(...섞색([124, 92, 64], [40, 36, 58], 어둠));
  ctx.fillRect(x - s * 0.09, y - s * 0.55, s * 0.18, s * 0.58);
  const 잎 = 섞색([92, 162, 88], [28, 46, 68], 어둠);
  ctx.fillStyle = 색(...잎);
  if (종류 === "뾰족") {
    for (let i = 0; i < 3; i++) {
      const yy = y - s * (0.45 + i * 0.26), w = s * (0.52 - i * 0.12);
      ctx.beginPath();
      ctx.moveTo(x, yy - s * 0.4); ctx.lineTo(x + w, yy); ctx.lineTo(x - w, yy);
      ctx.closePath(); ctx.fill();
    }
  } else {
    ctx.beginPath(); ctx.arc(x, y - s * 0.78, s * 0.42, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x - s * 0.3, y - s * 0.6, s * 0.3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + s * 0.3, y - s * 0.6, s * 0.3, 0, 7); ctx.fill();
  }
}

function 소품칠(ctx, box, cfg, R) {
  const y = box.y + box.h * cfg.장소.지평;
  const 어둠 = cfg.시간.땅어둠;
  const S = Math.min(box.w, box.h);
  const 있다 = n => cfg.장소.소품.includes(n);

  if (있다("산")) {                                  // 먼 산 두어 개
    for (let i = 0; i < 3; i++) {
      const cx = box.x + box.w * (0.12 + i * 0.34 + R() * 0.1);
      const h = box.h * (0.1 + R() * 0.09);
      ctx.fillStyle = 색(...섞색([132, 154, 138], [30, 38, 66], 어둠 + 0.15));
      ctx.beginPath();
      ctx.moveTo(cx - h * 1.5, y); ctx.lineTo(cx, y - h); ctx.lineTo(cx + h * 1.5, y);
      ctx.closePath(); ctx.fill();
    }
  }
  if (있다("언덕")) {
    ctx.fillStyle = 색(...섞색([224, 200, 148], [40, 44, 70], 어둠 + 0.1));
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.ellipse(box.x + box.w * (0.25 + i * 0.5), y, box.w * 0.3, box.h * 0.06, 0, Math.PI, 0);
      ctx.fill();
    }
  }
  if (있다("집")) {
    for (let i = 0; i < 3; i++) {
      const w = box.w * (0.13 + R() * 0.07), h = w * (0.8 + R() * 0.5);
      const x = box.x + box.w * (0.05 + i * 0.33 + R() * 0.08);
      ctx.fillStyle = 색(...섞색([238, 226, 208], [52, 54, 82], 어둠));
      ctx.fillRect(x, y - h, w, h);
      ctx.fillStyle = 색(...섞색([196, 106, 92], [44, 40, 66], 어둠));   // 지붕
      ctx.beginPath();
      ctx.moveTo(x - w * 0.1, y - h); ctx.lineTo(x + w / 2, y - h * 1.34);
      ctx.lineTo(x + w * 1.1, y - h); ctx.closePath(); ctx.fill();
      // 창 — 밤이면 불이 켜진다
      ctx.fillStyle = 어둠 > 0.25 ? "rgba(255,226,150,0.92)" : "rgba(150,190,220,0.75)";
      ctx.fillRect(x + w * 0.18, y - h * 0.68, w * 0.26, h * 0.24);
      ctx.fillRect(x + w * 0.56, y - h * 0.68, w * 0.26, h * 0.24);
    }
  }
  if (있다("전봇대")) {
    for (let i = 0; i < 2; i++) {
      const x = box.x + box.w * (0.2 + i * 0.55);
      const h = box.h * 0.3;
      ctx.fillStyle = 색(...섞색([140, 128, 116], [36, 38, 60], 어둠));
      ctx.fillRect(x, y - h, box.w * 0.012, h);
      ctx.fillRect(x - box.w * 0.03, y - h * 0.94, box.w * 0.072, box.w * 0.01);
    }
  }
  if (있다("나무") || 있다("숲나무") || 있다("눈나무")) {
    const 수 = 있다("숲나무") ? 9 : 3;
    for (let i = 0; i < 수; i++) {
      const x = box.x + box.w * (0.06 + R() * 0.88);
      const s = S * (0.16 + R() * 0.12);
      나무하나(ctx, x, y + box.h * 0.01, s, 있다("눈나무") ? 어둠 * 0.5 : 어둠,
               있다("눈나무") || 있다("숲나무") ? "뾰족" : "둥근");
    }
  }
  if (있다("선인장")) {
    for (let i = 0; i < 3; i++) {
      const x = box.x + box.w * (0.12 + R() * 0.76), s = S * (0.1 + R() * 0.07);
      ctx.fillStyle = 색(...섞색([98, 150, 96], [34, 44, 62], 어둠));
      ctx.beginPath(); ctx.roundRect(x - s * 0.12, y - s, s * 0.24, s, s * 0.12); ctx.fill();
      ctx.beginPath(); ctx.roundRect(x + s * 0.1, y - s * 0.8, s * 0.28, s * 0.16, s * 0.08); ctx.fill();
    }
  }
  if (있다("울타리")) {
    ctx.fillStyle = 색(...섞색([214, 190, 150], [46, 44, 66], 어둠));
    for (let x = box.x; x < box.x + box.w; x += box.w * 0.055) {
      ctx.fillRect(x, y - box.h * 0.05, box.w * 0.012, box.h * 0.05);
    }
    ctx.fillRect(box.x, y - box.h * 0.036, box.w, box.h * 0.008);
  }
  if (있다("돌")) {
    ctx.fillStyle = 색(...섞색([168, 162, 154], [40, 42, 62], 어둠));
    for (let i = 0; i < 5; i++) {
      const x = box.x + R() * box.w, yy = y + R() * (box.h - (y - box.y)) * 0.7;
      const s = S * (0.012 + R() * 0.02);
      ctx.beginPath(); ctx.ellipse(x, yy, s * 1.6, s, 0, 0, 7); ctx.fill();
    }
  }
  if (있다("꽃")) {
    const 색들 = [[240, 140, 170], [250, 214, 110], [200, 160, 240], [250, 250, 250]];
    for (let i = 0; i < 26; i++) {
      const x = box.x + R() * box.w;
      const yy = y + R() * (box.y + box.h - y) * 0.85;
      const s = S * (0.006 + R() * 0.008);
      ctx.fillStyle = 색(...섞색(색들[(R() * 4) | 0], [40, 40, 70], 어둠));
      for (let k = 0; k < 5; k++) {
        const a = k * 1.257;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * s, yy + Math.sin(a) * s, s * 0.75, 0, 7); ctx.fill();
      }
    }
  }
  if (있다("창문")) {
    const w = box.w * 0.3, h = box.h * 0.24;
    const x = box.x + box.w * 0.6, yy = box.y + box.h * 0.18;
    ctx.fillStyle = 어둠 > 0.25 ? "rgba(40,52,96,0.95)" : "rgba(168,214,240,0.95)";
    ctx.fillRect(x, yy, w, h);
    ctx.strokeStyle = 색(...섞색([160, 130, 96], [40, 38, 60], 어둠));
    ctx.lineWidth = Math.max(2, box.w * 0.008);
    ctx.strokeRect(x, yy, w, h);
    ctx.beginPath();
    ctx.moveTo(x + w / 2, yy); ctx.lineTo(x + w / 2, yy + h);
    ctx.moveTo(x, yy + h / 2); ctx.lineTo(x + w, yy + h / 2);
    ctx.stroke();
  }
  if (있다("액자")) {
    const w = box.w * 0.14, h = w * 0.78;
    const x = box.x + box.w * 0.16, yy = box.y + box.h * 0.24;
    ctx.fillStyle = 색(...섞색([196, 158, 112], [44, 42, 64], 어둠));
    ctx.fillRect(x, yy, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(x + w * 0.1, yy + h * 0.12, w * 0.8, h * 0.76);
  }
  if (있다("조리대")) {
    const h = box.h * 0.1;
    ctx.fillStyle = 색(...섞색([222, 214, 202], [50, 50, 74], 어둠));
    ctx.fillRect(box.x, y - h, box.w, h);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(box.x, y - h, box.w, box.h * 0.012);
  }
  if (있다("물줄기")) {                               // 앞쪽을 가로지르는 개울
    const yy = box.y + box.h * (cfg.장소.지평 + 0.16);
    ctx.fillStyle = 색(...섞색([110, 178, 214], [30, 54, 92], 어둠), 0.9);
    ctx.beginPath();
    ctx.ellipse(box.x + box.w / 2, yy, box.w * 0.62, box.h * 0.055, 0, 0, 7);
    ctx.fill();
  }
}

/** 안 움직이는 부분을 딴 종이에 그려 둔다 */
function 밑그림(cfg, w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
  const ctx = c.getContext("2d");
  const box = { x: 0, y: 0, w: c.width, h: c.height };
  const R = 난수기(씨앗(cfg.이름 || "배경"));

  if (cfg.장소.우주) {
    ctx.fillStyle = "#080a1c";
    ctx.fillRect(0, 0, box.w, box.h);
    for (let i = 0; i < 3; i++) {                    // 성운
      ctx.fillStyle = 색(90 + R() * 90, 70, 160 + R() * 60, 0.14);
      ctx.beginPath();
      ctx.ellipse(R() * box.w, R() * box.h, box.w * 0.4, box.h * 0.18, R() * 3, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(180,160,255,0.85)";        // 행성
    ctx.beginPath();
    ctx.arc(box.w * 0.78, box.h * 0.24, Math.min(box.w, box.h) * 0.11, 0, 7);
    ctx.fill();
  } else if (cfg.장소.실내) {
    실내칠(ctx, box, cfg, R);
    소품칠(ctx, box, cfg, R);
  } else {
    하늘칠(ctx, box, cfg);
    if (cfg.시간.해) {                                // 노을 해
      const g = ctx.createRadialGradient(box.w * 0.5, box.h * 0.5, 0,
                                         box.w * 0.5, box.h * 0.5, box.w * 0.4);
      g.addColorStop(0, "rgba(255,214,150,0.95)");
      g.addColorStop(1, "rgba(255,214,150,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(box.w * 0.5, box.h * 0.5, box.w * 0.4, 0, 7); ctx.fill();
    }
    if (cfg.시간.달) {
      ctx.fillStyle = "rgba(250,248,224,0.95)";
      ctx.beginPath();
      ctx.arc(box.w * 0.76, box.h * 0.16, Math.min(box.w, box.h) * 0.055, 0, 7);
      ctx.fill();
    }
    바닥칠(ctx, box, cfg, R);
    소품칠(ctx, box, cfg, R);
  }
  return c;
}

/* ── 밑그림 곳간 — 같은 배경을 두 번 그리지 않는다 ── */
const 곳간 = new Map();
const 곳간열쇠 = (name, w, h) => `${name}|${Math.round(w)}x${Math.round(h)}`;

function 밑그림가져오기(cfg, w, h) {
  const k = 곳간열쇠(cfg.이름, w, h);
  let c = 곳간.get(k);
  if (!c) {
    c = 밑그림(cfg, w, h);
    if (곳간.size > 24) 곳간.delete(곳간.keys().next().value);
    곳간.set(k, c);
  }
  return c;
}

/** 배경 그림을 새로 만들면 곳간을 비운다 (assets.js 에서 부른다) */
export function clearSceneryCache() { 곳간.clear(); }

/* ══════════ 움직이는 것 — 매 장면 ══════════ */

function 구름(ctx, box, cfg, t) {
  const 수 = Math.round(3 * (cfg.시간.구름 ?? 1));
  const R = 난수기(씨앗(cfg.이름 + "구름"));
  const 흐림 = cfg.시간.이름 === "흐림" || cfg.시간.이름 === "비";
  for (let i = 0; i < 수; i++) {
    const y = box.y + box.h * (0.06 + R() * 0.28);
    const s = box.w * (0.13 + R() * 0.12);
    const 속도 = 0.006 + R() * 0.01;
    let x = box.x + ((R() + t * 속도) % 1.4 - 0.2) * box.w;
    ctx.fillStyle = 흐림 ? "rgba(232,236,242,0.85)" : "rgba(255,255,255,0.88)";
    ctx.beginPath();
    ctx.arc(x, y, s * 0.5, 0, 7);
    ctx.arc(x + s * 0.42, y + s * 0.07, s * 0.36, 0, 7);
    ctx.arc(x - s * 0.42, y + s * 0.09, s * 0.32, 0, 7);
    ctx.fill();
  }
}

function 별빛(ctx, box, cfg, t) {
  const R = 난수기(씨앗(cfg.이름 + "별"));
  const 수 = cfg.장소.우주 ? 90 : 46;
  for (let i = 0; i < 수; i++) {
    const x = box.x + R() * box.w;
    const y = box.y + R() * box.h * (cfg.장소.우주 ? 1 : 0.55);
    const 위상 = R() * 6.3;
    const a = (0.45 + 0.55 * Math.sin(t * 1.6 + 위상)) * (cfg.시간.별 ?? 1);
    const s = box.w * (0.0016 + R() * 0.0026);
    ctx.fillStyle = `rgba(255,255,240,${a.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill();
  }
}

function 파도(ctx, box, cfg, t) {
  const y0 = box.y + box.h * cfg.장소.지평;
  const 아래 = box.y + box.h - y0;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  for (let i = 0; i < 5; i++) {
    const k = (i + 1) / 6;
    const y = y0 + 아래 * k * k;
    ctx.lineWidth = Math.max(1, box.h * 0.003 * (0.5 + k));
    ctx.beginPath();
    for (let x = 0; x <= box.w; x += box.w / 26) {
      const yy = y + Math.sin(x / box.w * 7 + t * (1 + k) + i) * box.h * 0.006 * (0.4 + k);
      x ? ctx.lineTo(box.x + x, yy) : ctx.moveTo(box.x + x, yy);
    }
    ctx.stroke();
  }
}

function 갈매기(ctx, box, cfg, t) {
  ctx.strokeStyle = "rgba(60,66,86,0.6)";
  ctx.lineWidth = Math.max(1.2, box.w * 0.004);
  const R = 난수기(씨앗(cfg.이름 + "새"));
  for (let i = 0; i < 3; i++) {
    const 속도 = 0.012 + R() * 0.01;
    const x = box.x + ((R() + t * 속도) % 1.3 - 0.15) * box.w;
    const y = box.y + box.h * (0.12 + R() * 0.2) + Math.sin(t * 1.4 + i) * box.h * 0.01;
    const s = box.w * (0.016 + R() * 0.012);
    const 날개 = Math.sin(t * 5 + i * 2) * 0.4;
    ctx.beginPath();
    ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x - s * 0.5, y - s * (0.5 + 날개), x, y);
    ctx.quadraticCurveTo(x + s * 0.5, y - s * (0.5 + 날개), x + s, y);
    ctx.stroke();
  }
}

function 비내림(ctx, box, cfg, t) {
  ctx.strokeStyle = "rgba(196,214,236,0.55)";
  ctx.lineWidth = Math.max(1, box.w * 0.0026);
  const R = 난수기(씨앗(cfg.이름 + "비"));
  for (let i = 0; i < 70; i++) {
    const x0 = R(), y0 = R();
    const y = box.y + ((y0 + t * 0.9) % 1) * box.h;
    const x = box.x + ((x0 + (y / box.h) * 0.06) % 1) * box.w;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - box.w * 0.012, y + box.h * 0.035);
    ctx.stroke();
  }
}

function 눈내림(ctx, box, cfg, t) {
  const R = 난수기(씨앗(cfg.이름 + "눈"));
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (let i = 0; i < 60; i++) {
    const x0 = R(), y0 = R(), 흔들 = R() * 6.3;
    const y = box.y + ((y0 + t * 0.06) % 1) * box.h;
    const x = box.x + ((x0 + Math.sin(t * 0.7 + 흔들) * 0.02 + 1) % 1) * box.w;
    const s = box.w * (0.002 + R() * 0.004);
    ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill();
  }
}

/**
 * 배경 한 장을 그린다.
 * @param ctx 캔버스
 * @param box {x,y,w,h}
 * @param name 배경 이름 ("밤바다", "노을 지는 들판" …)
 * @param t 시각(초)
 */
export function drawScenery(ctx, box, name, t = 0, 배경색 = null) {
  // 대본에서 `배경색:` 을 적었으면 그 색이 이깁니다
  const 지정 = 배경색 ? readColor(배경색) : null;
  const cfg = 지정
    ? { 단색: 지정, 장소: 기본장소, 시간: 낮, 알아봄: true, 이름: String(배경색) }
    : readScenery(name);

  if (cfg.단색) {                                   // 단색 배경 — 그릴 게 없다
    ctx.save();
    ctx.fillStyle = 색(...cfg.단색);
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.restore();
    return cfg;
  }

  ctx.save();
  ctx.drawImage(밑그림가져오기(cfg, box.w, box.h), box.x, box.y, box.w, box.h);

  if (cfg.시간.별) 별빛(ctx, box, cfg, t);
  if (!cfg.장소.실내 && !cfg.장소.우주) 구름(ctx, box, cfg, t);
  if (cfg.장소.바닥 === "바다") 파도(ctx, box, cfg, t);
  if (cfg.장소.소품.includes("갈매기")) 갈매기(ctx, box, cfg, t);
  if (cfg.시간.비) 비내림(ctx, box, cfg, t);
  if (cfg.시간.눈발) 눈내림(ctx, box, cfg, t);
  ctx.restore();
  return cfg;
}
