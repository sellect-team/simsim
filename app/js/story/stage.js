/* 🎭 무대 — 대본을 받아 '몇 초 시점의 화면'을 그린다.
 *
 * 게임 엔진의 방식을 그대로 쓴다.
 *   ① 대본의 지시(등장·이동·표정…)를 미리 '트랙'으로 펼쳐 둔다
 *   ② 그릴 때는 시각 t 를 넣어 각 트랙을 계산해 배우의 자리·크기를 정하고
 *   ③ 배경 → 배우 → 효과 → 자막 순서로 겹쳐 그린다.
 *
 * 실시간으로 흘러가지 않으므로 미리보기와 영상 굽기가 정확히 같은 그림을 만든다.
 * 그림이 없어도 절대 멈추지 않는다 — 자리표시로 그리고 '무엇이 없는지' 화면에 적어 준다.
 * (영상 수백 개를 만들 때는 '멈추지 않는 것'이 '예쁜 것'보다 중요하다)
 */
import { SPOTS, parseScript } from "./script.js";
import { drawEffect } from "./fx.js";
import { drawScenery, readScenery, readColor } from "./scenery.js";
import { readCharacter } from "../char/autochar.js";
import { readState } from "../char/moods.js";
import { applyPost, MOODS } from "./post.js";
import { drawProp, readProp } from "./props.js";
import { drawSubtitle, 모양읽기 } from "./subtitle.js";

/* ── 부드러움 곡선 ── */
const EASE = {
  linear: k => k,
  ease: k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2,
  in: k => k * k,
  out: k => 1 - (1 - k) * (1 - k),
  튐: k => {                                  // 통 튀며 도착
    const c = 1.70158 + 1;
    return 1 + c * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
  },
};
const ease = (name, k) => (EASE[name] || EASE.ease)(Math.max(0, Math.min(1, k)));
const spotOf = name => SPOTS[name] || (String(name || "").includes(",")
  ? String(name).split(",").map(Number) : SPOTS["가운데"]);

/* ── 장면 전환 ──
   전환은 두 장면을 겹쳐서 그린다.
     나감  — 앞 장면을 어떻게 내보낼지 (밀려남·흐려짐·물러남)
     들어옴 — 새 장면을 어떻게 들일지
   앞 장면도 계속 살아 움직이므로(drawAt 참고) 화면이 얼어붙지 않는다.
   오려내기(마스크) 전환은 clip 을 쓴다. */
const CENTER = box => [box.x + box.w / 2, box.y + box.h / 2];
const 부드럽게 = k => k * k * (3 - 2 * k);          // 시작·끝이 느린 곡선
const 빠르게시작 = k => 1 - (1 - k) * (1 - k);

const TRANSITIONS = {
  "없음": { ko: "없음 (바로 잘라 넘기기)", 들어옴: null },

  "페이드": {
    ko: "페이드 (겹쳐 넘기기 · 안 적으면 이것)",
    들어옴: (ctx, box, k) => { ctx.globalAlpha *= k; },
  },
  "밝게": {
    ko: "밝게 (흰빛으로 한 번 번쩍)", 바탕: "#ffffff", 기본길이: 0.5,
    나감: (ctx, box, k) => { ctx.globalAlpha *= Math.max(0, 1 - k * 2); },
    들어옴: (ctx, box, k) => { ctx.globalAlpha *= Math.max(0, k * 2 - 1); },
  },
  "어둡게": {
    ko: "어둡게 (검게 잠겼다 나오기 · 시간이 흐른 느낌)", 바탕: "#000000", 기본길이: 0.7,
    나감: (ctx, box, k) => { ctx.globalAlpha *= Math.max(0, 1 - k * 2); },
    들어옴: (ctx, box, k) => { ctx.globalAlpha *= Math.max(0, k * 2 - 1); },
  },

  "밀기": {
    ko: "밀기 (앞 장면을 옆으로 밀어냄)", 기본길이: 0.6,
    나감: (ctx, box, k) => { ctx.translate(-box.w * k, 0); },
    들어옴: (ctx, box, k) => { ctx.translate(box.w * (1 - k), 0); },
  },
  "슬라이드": {
    ko: "슬라이드 (새 장면이 옆에서 덮음)",
    나감: (ctx, box, k) => { ctx.translate(-box.w * 0.12 * k, 0); },  // 살짝 따라 밀림 (깊이감)
    들어옴: (ctx, box, k) => { ctx.translate(box.w * (1 - k), 0); },
  },
  "위로": {
    ko: "위로 (아래에서 올라와 덮음)",
    나감: (ctx, box, k) => { ctx.translate(0, -box.h * 0.12 * k); },
    들어옴: (ctx, box, k) => { ctx.translate(0, box.h * (1 - k)); },
  },

  "확대": {
    ko: "확대 (앞은 물러나고 새 장면이 다가옴)", 기본길이: 0.6,
    나감: (ctx, box, k) => {
      const [cx, cy] = CENTER(box);
      ctx.translate(cx, cy); ctx.scale(1 + k * 0.14, 1 + k * 0.14); ctx.translate(-cx, -cy);
      ctx.globalAlpha *= 1 - k;
    },
    들어옴: (ctx, box, k) => {
      const [cx, cy] = CENTER(box);
      ctx.translate(cx, cy); ctx.scale(0.88 + k * 0.12, 0.88 + k * 0.12); ctx.translate(-cx, -cy);
      ctx.globalAlpha *= k;
    },
  },
  "흐림": {
    ko: "흐림 (초점이 풀렸다 다시 맞음 · 회상)", 기본길이: 0.7,
    나감: (ctx, box, k) => {
      ctx.filter = `blur(${(k * 9).toFixed(1)}px)`;
      ctx.globalAlpha *= Math.max(0, 1 - k * 1.4);
    },
    들어옴: (ctx, box, k) => {
      ctx.filter = `blur(${((1 - k) * 9).toFixed(1)}px)`;
      ctx.globalAlpha *= Math.min(1, k * 1.4);
    },
  },

  /* 만화·옛날 애니메이션의 동그라미 열기 */
  "동그라미": {
    ko: "동그라미 (가운데서 동그랗게 열림)", 이징: 빠르게시작, 기본길이: 0.6,
    들어옴: (ctx, box, k) => {
      const [cx, cy] = CENTER(box);
      ctx.beginPath();
      ctx.arc(cx, cy, Math.hypot(box.w, box.h) / 2 * k, 0, 7);
      ctx.clip();
    },
  },
  "별": {
    ko: "별 (별 모양으로 열림)", 이징: 빠르게시작, 기본길이: 0.6,
    들어옴: (ctx, box, k) => {
      const [cx, cy] = CENTER(box);
      const R = Math.hypot(box.w, box.h) / 2 * k * 1.15;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const r = i % 2 ? R * 0.45 : R;
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.clip();
    },
  },
  "가로닦기": {
    ko: "가로닦기 (왼쪽부터 쓸어 넘김)",
    들어옴: (ctx, box, k) => {
      ctx.beginPath(); ctx.rect(box.x, box.y, box.w * k, box.h); ctx.clip();
    },
  },
  "세로닦기": {
    ko: "세로닦기 (위부터 쓸어 넘김)",
    들어옴: (ctx, box, k) => {
      ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h * k); ctx.clip();
    },
  },
};
export const TRANSITION_NAMES = Object.keys(TRANSITIONS);
export { TRANSITIONS };
const TRANS_SEC = 0.55;
/** 장면에 전환을 안 적었으면 이것으로 부드럽게 넘어간다 (딱딱 끊기지 않도록) */
export const DEFAULT_TRANSITION = "페이드";

/* ── 대본의 지시 → 배우별 트랙 ── */
function buildScene(scene) {
  const actors = new Map();       // 이름 → {name, tracks, events, z}
  const get = name => {
    if (!actors.has(name))
      actors.set(name, { name, z: actors.size, born: null, died: null,
                         pos: [], scale: [], alpha: [], rot: [], hop: [],
                         shakes: [], flips: [], events: [], squash: [],
                         소품: null, 붙음: [], 회전: [] });
    return actors.get(name);
  };
  const effects = [], subtitles = [], sounds = [], bubbles = [], freezes = [];
  /* 후처리(화면 전체 효과)와 시간 배속 — 게임의 포스트 프로세싱·슬로모션 */
  const post = { 분위기: [], 비네트: [], 블룸: [], 결: [], 번쩍: [] };
  const 시간트랙 = [];
  /* 카메라 — 줌·팬은 트랙으로, 흔들기는 짧은 사건으로 */
  const cam = { zoom: [], pos: [], shakes: [], tilt: [], punches: [], bars: [] };
  const camNow = () => ({
    zoom: cam.zoom.length ? cam.zoom[cam.zoom.length - 1].to : 1,
    pos: cam.pos.length ? cam.pos[cam.pos.length - 1].to : [0.5, 0.5],
  });

  for (const st of scene.steps) {
    if (st.kind === "카메라") {
      const now = camNow();
      const amt = parseFloat(st.opt?.세기);
      if (st.move === "흔들기" || st.move === "쿵") {
        cam.shakes.push({ t0: st.t, t1: st.t + st.dur, amp: amt || 1 });
      } else if (st.move === "줌인" || st.move === "확대") {
        cam.zoom.push({ t0: st.t, t1: st.t + st.dur, from: now.zoom,
                        to: amt || 1.28, ease: "ease" });
      } else if (st.move === "줌아웃" || st.move === "축소") {
        cam.zoom.push({ t0: st.t, t1: st.t + st.dur, from: now.zoom,
                        to: amt || 1.0, ease: "ease" });
      } else if (st.move === "이동" || st.move === "팬") {
        const p = st.spot ? spotOf(st.spot) : [0.5, 0.5];
        cam.pos.push({ t0: st.t, t1: st.t + st.dur, from: now.pos,
                       to: [p[0], now.pos[1]], ease: "ease" });
      } else if (st.move === "기울이기" || st.move === "틀기") {
        // 더치 앵글 — 불안·긴장. 각도는 `카메라 기울이기 8 0.5초`
        const 각 = parseFloat((st.args || []).find(a => /^-?\d/.test(a))) || amt || 6;
        const 지금틀기 = cam.tilt.length ? cam.tilt[cam.tilt.length - 1].to : 0;
        cam.tilt.push({ t0: st.t, t1: st.t + st.dur, from: 지금틀기, to: 각, ease: "ease" });
      } else if (st.move === "펀치" || st.move === "확대펀치") {
        // 줌 펀치 — 확 당겼다 곧바로 돌아온다 (놀람·타격)
        cam.punches.push({ t0: st.t, t1: st.t + Math.min(st.dur, 0.6),
                           amp: (amt || 1) * 0.12 });
      } else if (st.move === "따라가기" || st.move === "따라감") {
        /* 따라가는 카메라 — 게임의 기본 카메라.
           배우를 그냥 따라가면 화면이 계속 흔들려 멀미가 난다. 그래서 게임은
           '무시 구역(deadzone)'을 둔다 — 가운데 근처에서는 카메라가 안 움직이고,
           그 밖으로 나가야 부드럽게 따라간다. */
        cam.follow = { who: (st.args || []).find(a => a && !SPOTS[a]) || null,
                       t0: st.t, 무시: parseFloat(st.opt?.무시) || 0.16,
                       느슨: parseFloat(st.opt?.느슨) || 0.12 };
      } else if (st.move === "레터박스" || st.move === "띠") {
        const 켬 = !(st.opt && /끄기|없음|해제/.test(String(st.opt.값 || ""))) &&
                   !(st.args || []).some(a => /끄기|없음|해제/.test(a));
        const 지금띠 = cam.bars.length ? cam.bars[cam.bars.length - 1].to : 0;
        cam.bars.push({ t0: st.t, t1: st.t + st.dur, from: 지금띠, to: 켬 ? 1 : 0, ease: "ease" });
      } else {                                        // 되돌리기
        cam.zoom.push({ t0: st.t, t1: st.t + st.dur, from: now.zoom, to: 1, ease: "ease" });
        cam.pos.push({ t0: st.t, t1: st.t + st.dur, from: now.pos, to: [0.5, 0.5], ease: "ease" });
        if (cam.tilt.length) cam.tilt.push({ t0: st.t, t1: st.t + st.dur,
          from: cam.tilt[cam.tilt.length - 1].to, to: 0, ease: "ease" });
        if (cam.bars.length) cam.bars.push({ t0: st.t, t1: st.t + st.dur,
          from: cam.bars[cam.bars.length - 1].to, to: 0, ease: "ease" });
      }
      continue;
    }
    if (st.kind === "효과") {
      effects.push({ name: st.name, t0: st.t,
                     t1: st.dur ? st.t + st.dur : Infinity, opt: st.opt || {} });
      continue;
    }
    if (st.kind === "화면") {
      if (st.종류 === "분위기" || MOODS[st.종류]) {
        // `화면 분위기 밤` 또는 그냥 `화면 밤`
        post.분위기.push({ t: st.t, value: MOODS[st.종류] ? st.종류 : (st.값 || "없음") });
      } else if (st.종류 === "번쩍") {
        post.번쩍.push({ t0: st.t, t1: st.t + st.dur, amp: parseFloat(st.값) || 0.85 });
      } else if (post[st.종류]) {
        const 값 = parseFloat(st.값);
        const 지금 = post[st.종류].length ? post[st.종류][post[st.종류].length - 1].to : 0;
        post[st.종류].push({ t0: st.t, t1: st.t + st.dur, from: 지금,
                             to: Number.isFinite(값) ? 값 : 0.4, ease: "ease" });
      }
      continue;
    }
    if (st.kind === "시간") {
      시간트랙.push({ t0: st.t, t1: st.t + st.dur, 배: st.배 });
      continue;
    }
    if (st.kind === "소리") { sounds.push({ name: st.name, t: st.t }); continue; }
    if (st.kind === "자막") {
      subtitles.push({ text: st.text, t0: st.t, t1: st.t + st.dur,
                       who: st.who, opt: st.opt || {} });
      if (st.opt && st.opt.효과)
        effects.push({ name: st.opt.효과, t0: st.t, t1: st.t + st.dur, opt: {} });
      if (st.opt && st.opt.소리) sounds.push({ name: st.opt.소리, t: st.t });
      continue;
    }
    if (st.kind === "대기") continue;
    if (st.kind === "멈칫") { freezes.push({ t0: st.t, t1: st.t + st.dur }); continue; }
    if (st.kind === "대사") {
      bubbles.push({ who: st.who, text: st.text, t0: st.t, t1: st.t + st.dur, opt: st.opt || {} });
      if (st.opt?.소리) sounds.push({ name: st.opt.소리, t: st.t });
      if (st.opt?.효과) effects.push({ name: st.opt.효과, t0: st.t, t1: st.t + st.dur, opt: {} });
      get(st.who);
      continue;
    }

    const a = get(st.who);
    if (st.kind === "등장") {
      const p = spotOf(st.spot);
      a.born = st.t;
      a.pos.push({ t0: st.t, t1: st.t, from: p, to: p });
      a.alpha.push({ t0: st.t, t1: st.t + (st.dur || 0.4), from: 0, to: 1, ease: "out" });
      const sc = parseFloat(st.opt?.크기);
      a.scale.push({ t0: st.t, t1: st.t + (st.dur || 0.4),
                     from: (sc || 1) * 0.82, to: sc || 1, ease: "튐" });
      if (st.opt?.표정) a.events.push({ t: st.t, kind: "표정", value: st.opt.표정 });
      if (st.opt?.동작) a.events.push({ t: st.t, kind: "동작", value: st.opt.동작 });
    } else if (st.kind === "이동") {
      const last = a.pos.length ? a.pos[a.pos.length - 1].to : spotOf("가운데");
      const to = spotOf(st.spot);
      const dur = st.dur || 1.5;
      /* 앤티시페이션 — 가기 직전에 반대쪽으로 살짝 움츠린다.
         만화·게임 애니메이션이 '움직임을 예고'하는 방식이라 훨씬 살아 보인다. */
      const anti = st.opt?.준비 === "없음" ? 0 : 0.055;
      if (anti && dur > 0.25) {
        const back = [last[0] - (to[0] - last[0]) * anti, last[1] - (to[1] - last[1]) * anti];
        a.pos.push({ t0: st.t, t1: st.t + 0.14, from: last, to: back, ease: "out" });
        a.pos.push({ t0: st.t + 0.14, t1: st.t + dur, from: back, to, ease: st.ease || "ease" });
      } else {
        a.pos.push({ t0: st.t, t1: st.t + dur, from: last, to, ease: st.ease || "ease" });
      }
    } else if (st.kind === "경로") {
      // 여러 지점을 차례로 지나간다
      let from = a.pos.length ? a.pos[a.pos.length - 1].to : spotOf("가운데");
      const each = (st.dur || 2) / Math.max(1, st.spots.length);
      st.spots.forEach((sp, i) => {
        const to = spotOf(sp);
        a.pos.push({ t0: st.t + each * i, t1: st.t + each * (i + 1),
                     from, to, ease: i === 0 ? "in" : (i === st.spots.length - 1 ? "out" : "linear") });
        from = to;
      });
    } else if (st.kind === "점프") {
      const dur = st.dur || 0.7;
      // 위아래 포물선 + (제자리가 아니면) 옆으로 이동
      a.hop.push({ t0: st.t, t1: st.t + dur, h: st.height ?? 0.18 });
      if (st.spot && st.spot !== "제자리") {
        const last = a.pos.length ? a.pos[a.pos.length - 1].to : spotOf("가운데");
        a.pos.push({ t0: st.t, t1: st.t + dur, from: last, to: spotOf(st.spot), ease: "linear" });
      }
      a.scale.push({ t0: st.t, t1: st.t + dur * 0.18,
                     from: valueAt(a.scale, st.t, 1), to: valueAt(a.scale, st.t, 1) * 0.92, ease: "out" });
      a.scale.push({ t0: st.t + dur * 0.18, t1: st.t + dur * 0.5,
                     from: valueAt(a.scale, st.t, 1) * 0.92, to: valueAt(a.scale, st.t, 1), ease: "튐" });
      /* 부피를 지키는 눌림·늘림 — 게임 애니메이션의 기본기.
         뛰기 직전 웅크리고(납작), 뜬 동안 홀쭉해지고, 내려앉으며 다시 납작해진다. */
      a.squash.push({ t0: st.t, t1: st.t + 0.12, amt: -0.18 });                        // 웅크림
      a.squash.push({ t0: st.t + 0.12, t1: st.t + dur * 0.6, amt: 0.14 });             // 늘어남
      a.squash.push({ t0: st.t + dur - 0.06, t1: st.t + dur + 0.16, amt: -0.22 });     // 착지
    } else if (st.kind === "눌리기" || st.kind === "늘어나기") {
      const 크기 = (parseFloat(st.opt?.세기) || 1) * 0.22;
      a.squash.push({ t0: st.t, t1: st.t + (st.dur || 0.3),
                      amt: st.kind === "눌리기" ? -크기 : 크기 });
    } else if (st.kind === "상태") {
      /* 상태 — 한 낱말을 여러 지시로 펼친다 (게임의 상태 기계).
         펼쳐 두면 그 다음은 평소 길을 그대로 타므로 새로 그릴 것이 없다. */
      const S = readState(st.name);
      if (!S) {
        a.events.push({ kind: "표정", t: st.t, value: st.name, 방식: "팝", dur: 0.25 });
      } else {
        if (S.표정) a.events.push({ kind: "표정", t: st.t, value: S.표정, 방식: "팝", dur: st.dur || 0.3 });
        if (S.동작) a.events.push({ kind: "동작", t: st.t, value: S.동작 });
        a.events.push({ kind: "눈물", t: st.t, value: S.눈물 || "none" });
        if (S.눌림) a.squash.push({ t0: st.t, t1: st.t + 0.34, amt: S.눌림 });
        if (S.떨기) a.shakes.push({ t0: st.t, t1: st.t + 0.45, amp: S.떨기 });
        if (S.효과) effects.push({ name: S.효과, t0: st.t,
                                   t1: st.t + Math.max(1.2, (st.dur || 0.3) * 3), opt: {} });
        if (S.소리) sounds.push({ name: S.소리, t: st.t });
        if (S.카메라 === "펀치") cam.punches.push({ t0: st.t, t1: st.t + 0.35, amp: 0.1 });
        if (S.카메라 === "기울이기") {
          const 지금 = cam.tilt.length ? cam.tilt[cam.tilt.length - 1].to : 0;
          cam.tilt.push({ t0: st.t, t1: st.t + 0.5, from: 지금, to: 5, ease: "ease" });
        }
      }
    } else if (st.kind === "소품선언") {
      a.소품 = st.모양 || st.who;                 // 이 개체는 배우가 아니라 물건이다
      if (a.born == null) a.born = st.t;          // 선언만 해도 화면에 있게
    } else if (st.kind === "붙이기") {
      /* 부모-자식 — 게임 엔진의 트랜스폼 계층.
         붙은 동안에는 제 자리 트랙 대신 부모 자리를 따른다. */
      a.붙음.push({ t0: st.t, t1: Infinity, 부모: st.부모, 자리: st.자리 || "손" });
    } else if (st.kind === "떼기") {
      const 마지막 = a.붙음[a.붙음.length - 1];
      if (마지막) 마지막.t1 = st.t;
    } else if (st.kind === "돌리기") {
      a.회전.push({ t0: st.t, t1: st.t + (st.dur || 1), 바퀴: st.바퀴 || 1 });
    } else if (st.kind === "떨기") {
      a.shakes.push({ t0: st.t, t1: st.t + (st.dur || 0.6), amp: st.amp || 1 });
    } else if (st.kind === "기울이기") {
      const last = valueAt(a.rot, st.t, 0);
      a.rot.push({ t0: st.t, t1: st.t + (st.dur || 0.5), from: last, to: st.deg, ease: "튐" });
    } else if (st.kind === "방향") {
      a.flips.push({ t: st.t, dir: st.dir });
    } else if (st.kind === "포즈") {
      /* 그림 갈아 끼우기 — 시각과 함께 쌓아 두고, 그릴 때 '그때까지의 마지막 것'을 쓴다.
         (표정처럼 순간에 바뀌는 것이라 사이를 부드럽게 잇지 않는다.) */
      (a.poses ||= []).push({ t: st.t, role: st.role });
    } else if (st.kind === "표정반복") {
      // 두 표정을 번갈아 — 장면 끝까지
      const list = st.list && st.list.length ? st.list : ["평온"];
      for (let i = 0; i < 40; i++)
        a.events.push({ t: st.t + i * (st.dur || 0.6), kind: "표정", value: list[i % list.length] });
    } else if (st.kind === "크기") {
      const last = a.scale.length ? a.scale[a.scale.length - 1].to : 1;
      a.scale.push({ t0: st.t, t1: st.t + (st.dur || 0.5), from: last, to: st.value, ease: "ease" });
    } else if (st.kind === "퇴장") {
      a.died = st.t + (st.dur || 0.4);
      a.alpha.push({ t0: st.t, t1: a.died, from: 1, to: 0, ease: "in" });
    } else {
      a.events.push({ t: st.t, kind: st.kind, value: st.name,
                      방식: st.방식, dur: st.dur });               // 표정·동작·눈물
    }
  }
  return { bg: scene.bg, opt: scene.opt || {}, seconds: scene.seconds,
           actors: [...actors.values()], effects, subtitles, sounds, bubbles, freezes, cam,
           post, 시간트랙 };
}

/* ── 붙이기(부모-자식) ──
   붙어 있는 동안에는 제 자리 트랙 대신 **부모 자리 + 붙은 곳 치우침**을 쓴다.
   부모가 또 다른 것에 붙어 있을 수도 있으므로 몇 겹까지만 따라 올라간다. */
const 붙는곳 = {           // 부모의 발밑을 기준으로 얼마나 떨어져 있는가 (화면 비율)
  "손":     [0.085, -0.20],
  "머리":   [0.0, -0.46],
  "등":     [-0.075, -0.26],
  "입":     [0.03, -0.33],
  "발":     [0.0, -0.02],
  "가운데": [0.0, -0.22],
};

function 붙은부모(a, t) {
  for (const b of a.붙음 || []) if (t >= b.t0 && t < b.t1) return b;
  return null;
}

/** 시각 t 에 이 개체가 실제로 있는 자리 (붙어 있으면 부모를 따라간다) */
function 자리풀기(scene, a, t, 깊이 = 0) {
  const 붙 = 깊이 < 4 ? 붙은부모(a, t) : null;
  if (!붙) return valueAt(a.pos, t, SPOTS["가운데"]);
  const 부모 = scene.actors.find(x => x.name === 붙.부모);
  if (!부모) return valueAt(a.pos, t, SPOTS["가운데"]);
  const p = 자리풀기(scene, 부모, t, 깊이 + 1);
  const [dx, dy] = 붙는곳[붙.자리] || 붙는곳["손"];
  // 부모가 바라보는 쪽에 따라 좌우가 뒤집힌다
  let flip = 1;
  for (const f of 부모.flips || []) if (f.t <= t) flip = f.dir;
  const 부모크기 = valueAt(부모.scale, t, 1);
  let hop = 0;
  for (const j of 부모.hop || []) {
    if (t < j.t0 || t > j.t1) continue;
    const q = (t - j.t0) / Math.max(0.01, j.t1 - j.t0);
    hop = Math.max(hop, Math.sin(q * Math.PI) * j.h);
  }
  return [p[0] + dx * flip * 부모크기, p[1] + dy * 부모크기 - hop];
}

/** 시간 배속 — 느리게/빠르게 구간을 지나며 '화면 속 시간'이 얼마나 흘렀는가.
    구간을 앞에서부터 더해 가므로 뒤로 갈수록 어긋나지 않는다. */
function 시간흐름(트랙, t) {
  if (!트랙 || !트랙.length) return t;
  let 흐름 = 0, 이전 = 0;
  for (const q of 트랙) {
    if (t <= q.t0) break;
    흐름 += q.t0 - 이전;                                  // 구간 전은 그대로
    const 안 = Math.min(t, q.t1) - q.t0;
    흐름 += 안 * q.배;                                    // 구간 안은 배속대로
    이전 = Math.min(t, q.t1);
  }
  return 흐름 + (t - 이전);
}

/** 시각 t 의 카메라 상태 */
/* ── 부드러운 흔들림 잡음 ──
   sin 하나로 흔들면 규칙적으로 덜컹거려 기계 같다.
   게임에서 쓰는 방식대로 '값 잡음'을 부드럽게 이어 붙여 자연스럽게 만든다.
   시각 t 만 넣으면 늘 같은 값이 나오므로 미리보기와 구운 것이 같다. */
function 잡음(t, 씨) {
  const i = Math.floor(t), f = t - i;
  const 점 = n => {
    const x = Math.sin((n * 127.1 + 씨 * 311.7)) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;               // -1 ~ 1
  };
  const k = f * f * (3 - 2 * f);                       // 부드럽게 잇기
  return 점(i) + (점(i + 1) - 점(i)) * k;
}

function cameraAt(cam, t) {
  const zoom = valueAt(cam.zoom, t, 1);
  const at = valueAt(cam.pos, t, [0.5, 0.5]);
  /* 흔들기 — '트라우마' 방식.
     세기를 그대로 쓰지 않고 트라우마의 **제곱**을 쓴다.
     사람 눈은 지수 변화에 민감해서, 같은 크기라도 훨씬 세게 때린 느낌이 난다.
     (게임에서 쓰는 방식 — 시작은 확 세고 끝은 스르르 잦아든다) */
  let 트라우마 = 0;
  for (const s of cam.shakes) {
    if (t < s.t0 || t > s.t1) continue;
    const 남음 = 1 - (t - s.t0) / Math.max(0.01, s.t1 - s.t0);
    트라우마 = Math.max(트라우마, s.amp * 남음);
  }
  const shake = 트라우마 * 트라우마;                    // 제곱 = 지수 느낌
  /* 감정 도구로서의 카메라 (게임 연출에서 빌려 왔다)
       틀기   — 화면을 살짝 기울여 불안·긴장을 준다 (더치 앵글)
       펀치   — 확 당겼다 돌아온다 (놀람·타격)
       레터박스 — 위아래 검은 띠 (회상·중요한 대사) */
  const 틀기 = valueAt(cam.tilt || [], t, 0);
  let 펀치 = 1;
  for (const p of cam.punches || []) {
    if (t < p.t0 || t > p.t1) continue;
    const k = (t - p.t0) / Math.max(0.01, p.t1 - p.t0);
    펀치 = Math.max(펀치, 1 + Math.sin(k * Math.PI) * p.amp);
  }
  const 레터박스 = valueAt(cam.bars || [], t, 0);
  return {
    zoom, at, shake, 트라우마, 틀기, 펀치, 레터박스,
    // 흔들릴 때는 살짝 돌기도 한다 (옆으로만 흔들면 밋밋하다)
    기울기: shake * 잡음(t * 11, 3) * 2.2,
    흔들x: 잡음(t * 17, 1),
    흔들y: 잡음(t * 19, 2),
  };
}

/** 시각 t 의 눌림 정도 (+ 늘어남 / − 납작해짐). 산처럼 올랐다 내려온다. */
function squashAt(list, t) {
  let v = 0;
  for (const q of list || []) {
    if (t < q.t0 || t > q.t1) continue;
    const k = (t - q.t0) / Math.max(0.01, q.t1 - q.t0);
    v += q.amt * Math.sin(k * Math.PI);
  }
  return Math.max(-0.4, Math.min(0.4, v));
}

/** 트랙 목록에서 시각 t 의 값 (숫자 또는 [x,y]) */
function valueAt(tracks, t, dflt) {
  let v = dflt;
  for (const tr of tracks) {
    if (t < tr.t0) break;
    const k = tr.t1 > tr.t0 ? ease(tr.ease, (t - tr.t0) / (tr.t1 - tr.t0)) : 1;
    v = Array.isArray(tr.from)
      ? [tr.from[0] + (tr.to[0] - tr.from[0]) * k, tr.from[1] + (tr.to[1] - tr.from[1]) * k]
      : tr.from + (tr.to - tr.from) * k;
  }
  return v;
}
/** 시각 t 까지 일어난 마지막 사건 값 */
const lastEvent = (events, t, kind, dflt) => {
  let v = dflt;
  for (const e of events) if (e.t <= t && e.kind === kind) v = e.value;
  return v;
};

/* ── 자막 ──
   그리는 일은 story/subtitle.js 가 맡는다 (미리보기 화면도 같은 함수를 쓴다).
   여기서 다시 내보내는 것은 예전 코드가 stage.js 에서 가져다 쓰기 때문이다. */
export { drawSubtitle } from "./subtitle.js";

/* ── 배경 한 겹 ──
   depth 0 = 아주 멀리(거의 안 움직임), 1 = 배우와 같은 거리.
   여러 겹을 다른 깊이로 두면 카메라가 움직일 때 깊이감이 생긴다 (패럴랙스). */
function drawBackground(ctx, box, img, name, t, cam, depth = 0.55, 배경색 = null) {
  /* 바탕색을 먼저 깐다 — 그림에 투명한 데가 있어도 그 색이 비쳐 보인다.
     `배경색:` 만 적고 배경 이름을 안 쓰면 그대로 단색 화면이 된다. */
  if (배경색) {
    const c = readColor(배경색);
    if (c) {
      ctx.save();
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.restore();
      if (!img && !String(name || "").trim()) return;   // 단색만 원한 경우
    }
  }
  if (img) {
    // 화면을 꽉 채우고 아주 천천히 밀어 준다 (정지 그림에 숨을 불어넣는다)
    const drift = 1.06 + Math.sin(t * 0.25) * 0.008;
    const s = Math.max(box.w / img.width, box.h / img.height) * drift;
    const w = img.width * s, h = img.height * s;
    // 카메라가 옮겨 간 만큼을 '깊이가 얕을수록' 되돌려 준다 → 먼 배경은 덜 움직인다
    const back = cam ? (1 - depth) : 0;
    const ox = cam ? (cam.at[0] - 0.5) * box.w * back : 0;
    const oy = cam ? (cam.at[1] - 0.5) * box.h * back : 0;
    ctx.drawImage(img, box.x + (box.w - w) / 2 + ox, box.y + (box.h - h) / 2 + oy, w, h);
    return;
  }
  /* 그림이 없으면 **코드로 그려 준다.**
     이름의 낱말(밤·바다·눈·마을…)을 알아듣고 배경을 만들어 내므로
     그림을 한 장도 안 올려도 대본만으로 볼만한 영상이 나온다.
     나중에 그림을 올리면 그 즉시 위쪽 길로 빠져 그림이 쓰인다. */
  ctx.save();
  // 카메라를 따라 아주 조금만 움직여 깊이감을 준다
  const back = cam ? (1 - depth) * 0.5 : 0;
  ctx.translate(cam ? (cam.at[0] - 0.5) * box.w * back : 0,
                cam ? (cam.at[1] - 0.5) * box.h * back : 0);
  drawScenery(ctx, box, name, t, 배경색);
  ctx.restore();
}

/* ── 🖼 만화 칸 테두리 — 손으로 그린 듯 삐뚤빼뚤한 네모 ── */
export function drawPanelBorder(ctx, box, style = "테두리") {
  const S = Math.min(box.w, box.h);
  const m = S * 0.022;                                  // 여백
  const w = box.w - m * 2, h = box.h - m * 2;
  const jitter = (i) => (Math.sin(i * 12.9898) * 43758.5453 % 1) * S * 0.006;
  ctx.save();
  ctx.strokeStyle = style === "굵게" ? "#1d150e" : "#2b2119";
  ctx.lineWidth = Math.max(2.5, S * (style === "굵게" ? 0.016 : 0.009));
  ctx.lineJoin = "round";
  ctx.beginPath();
  const pts = [[box.x + m, box.y + m], [box.x + m + w, box.y + m],
               [box.x + m + w, box.y + m + h], [box.x + m, box.y + m + h]];
  pts.forEach(([x, y], i) => {
    const jx = jitter(i * 3), jy = jitter(i * 3 + 1);
    i ? ctx.lineTo(x + jx, y + jy) : ctx.moveTo(x + jx, y + jy);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/* ── 💬 말풍선 — 글자 길이에 맞춰 늘어난다 (게임의 9-슬라이스와 같은 생각) ── */
export function drawBubble(ctx, box, text, k, anchor, opt = {}) {
  if (!text) return;
  const S = Math.min(box.w, box.h);
  const size = (parseFloat(opt.글자크기) || 0.05) * S;
  ctx.save();
  ctx.font = `700 ${size}px "${opt.글꼴 || "Gaegu"}", system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  const maxW = box.w * 0.6;
  const lines = [];
  let cur = "";
  for (const w of String(text).split(/(\s+)/)) {
    if (ctx.measureText(cur + w).width > maxW && cur.trim()) { lines.push(cur.trim()); cur = w; }
    else cur += w;
  }
  if (cur.trim()) lines.push(cur.trim());

  const lineH = size * 1.2;
  const tw = Math.max(...lines.map(l => ctx.measureText(l).width));
  const padX = size * 0.7, padY = size * 0.5;
  const w = tw + padX * 2, h = lines.length * lineH + padY * 2;
  // 말풍선은 머리 위에. 화면 밖으로 나가지 않게 안쪽으로 밀어 준다
  let cx = anchor.x, cy = anchor.y - h / 2 - S * 0.02;
  cx = Math.max(box.x + w / 2 + 6, Math.min(box.x + box.w - w / 2 - 6, cx));
  cy = Math.max(box.y + h / 2 + 6, cy);

  const pop = 0.7 + Math.min(1, k * 7) * 0.3;         // 톡 튀어나오기
  ctx.globalAlpha = Math.min(1, k * 9);
  ctx.translate(cx, cy); ctx.scale(pop, pop); ctx.translate(-cx, -cy);

  ctx.fillStyle = opt.바탕색 || "#fffdf6";
  ctx.strokeStyle = opt.선색 || "#3a2e22";
  ctx.lineWidth = Math.max(1.8, size * 0.075);
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, size * 0.55);
  ctx.fill(); ctx.stroke();
  // 꼬리 (말하는 사람 쪽으로)
  const tail = Math.max(-w / 2 + size, Math.min(w / 2 - size, anchor.x - cx));
  ctx.beginPath();
  ctx.moveTo(cx + tail - size * 0.32, cy + h / 2 - 1);
  ctx.lineTo(cx + tail * 1.05, cy + h / 2 + size * 0.75);
  ctx.lineTo(cx + tail + size * 0.32, cy + h / 2 - 1);
  ctx.closePath();
  ctx.fillStyle = opt.바탕색 || "#fffdf6";
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();                                     // 이음새 지우기
  ctx.moveTo(cx + tail - size * 0.3, cy + h / 2 - 1);
  ctx.lineTo(cx + tail + size * 0.3, cy + h / 2 - 1);
  ctx.strokeStyle = opt.바탕색 || "#fffdf6";
  ctx.lineWidth = Math.max(2.4, size * 0.1);
  ctx.stroke();

  ctx.fillStyle = opt.색 || "#2b2119";
  lines.forEach((l, i) => ctx.fillText(l, cx, cy - h / 2 + padY + lineH * (i + 0.5)));
  ctx.restore();
}

/* ── 배우 ── */
function drawActor(ctx, box, actor, sprite, state) {
  const S = Math.min(box.w, box.h);
  const size = S * 0.62 * state.scale;
  /* 눌림·늘림 — 부피를 지킨다.
     세로로 k 배 늘리면 가로는 1/k 배로 줄여야 덩치가 그대로로 보인다.
     (안 그러면 캐릭터가 커졌다 작아졌다 하는 것처럼 보인다) */
  const q = state.눌림 || 0;
  const sy = 1 + q, sx = 1 / Math.max(0.4, sy);
  const w = size * sx, h = size * sy;
  const at = { x: box.x + (state.pos[0] + (state.jitter ? Math.sin(state.t * 47) * 0.004 * state.jitter : 0)) * box.w - w / 2,
               y: box.y + (state.pos[1] - (state.hop || 0)) * box.h - h,   // 발밑 기준, 점프만큼 위로
               w, h };
  ctx.save();
  ctx.globalAlpha *= state.alpha;
  /* 발밑 그림자 — 이게 없으면 캐릭터가 배경 위에 '떠 있는 종이'처럼 보인다.
     점프해서 높이 뜰수록 작고 옅어진다 (게임에서 높이를 알려 주는 기본 장치). */
  if (state.그림자 !== false) {
    const up = state.hop || 0;
    const k = Math.max(0.25, 1 - up * 3);
    ctx.save();
    ctx.globalAlpha *= 0.22 * k;
    ctx.fillStyle = "#2b2119";
    ctx.beginPath();
    ctx.ellipse(at.x + w / 2, box.y + state.pos[1] * box.h,
                w * 0.3 * k, w * 0.075 * k, 0, 0, 7);
    ctx.fill();
    ctx.restore();
  }
  // 기울이기·좌우 반전 — 발밑을 축으로
  if (state.rot || state.flip < 0) {
    ctx.translate(at.x + w / 2, at.y + h);
    if (state.rot) ctx.rotate(state.rot * Math.PI / 180);
    if (state.flip < 0) ctx.scale(-1, 1);
    ctx.translate(-(at.x + w / 2), -(at.y + h));
  }
  /* 스미어 — 빠르게 움직일 때 진행 방향으로 늘여 준다 (만화의 잔상 표현).
     한 프레임 전과 견줘 많이 옮겨졌으면 그만큼 납작하게 늘인다. */
  if (state.speed > 0.15) {
    const s = Math.min(0.35, (state.speed - 0.15) * 0.5);
    const dir = state.dir >= 0 ? 1 : -1;
    ctx.translate(at.x + w / 2, at.y + h);
    ctx.transform(1 + s, 0, dir * s * 0.35, 1 - s * 0.35, 0, 0);
    ctx.translate(-(at.x + w / 2), -(at.y + h));
  }
  if (sprite && sprite.draw) {
    sprite.move = state.동작 || sprite.move;
    sprite.tear = state.눈물 || "none";
    if (state.표정겹침) {
      // '서서히' 바뀌는 표정 — 앞 표정을 옅게, 새 표정을 진하게 겹쳐 그린다
      const k = state.표정겹침.k;
      ctx.save();
      ctx.globalAlpha *= 1 - k;
      sprite.expr = state.표정겹침.from || "blink";
      sprite.draw(ctx, at, state.t);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= k;
      sprite.expr = state.표정 || "blink";
      sprite.draw(ctx, at, state.t);
      ctx.restore();
    } else {
      sprite.expr = state.표정 || "blink";
      sprite.draw(ctx, at, state.t);
    }
  } else if (sprite && sprite.width) {
    ctx.drawImage(sprite, at.x, at.y, at.w, at.h);
  } else {
    ctx.fillStyle = "rgba(200,190,175,0.5)";
    ctx.strokeStyle = "#b9ad99";
    ctx.setLineDash([6, 5]);
    ctx.fillRect(at.x, at.y, at.w, at.h);
    ctx.strokeRect(at.x, at.y, at.w, at.h);
    ctx.setLineDash([]);
    ctx.fillStyle = "#8a7f70";
    ctx.font = `${S * 0.04}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(`${actor.name} 없음`, at.x + at.w / 2, at.y + at.h / 2);
  }
  ctx.restore();
  return at;
}

/* ── 무대 ─────────────────────────────────────────── */
export class Stage {
  /**
   * @param doc parseScript 결과
   * @param assets {배우:{이름:FaceSprite|Image}, 배경:{이름:Image}}
   */
  constructor(doc, assets = {}) {
    this.doc = doc;
    this.assets = { 배우: {}, 배경: {}, ...assets };
    this.scenes = (doc.scenes || []).map(buildScene);
    let acc = 0;
    this.scenes.forEach(s => { s.start = acc; acc += s.seconds; });
    this.seconds = acc;
  }

  /** 대본 글에서 바로 만든다 */
  static fromText(src, assets) { return new Stage(parseScript(src), assets); }

  /** 대본 첫머리에 적은 자막 기본 모양.
   *
   *  `자막차림표:` 로 한 벌 고르고, `자막글꼴:` `자막색:` 처럼 낱낱이 덧칠할 수 있다.
   *  편마다 다시 적지 않아도 되게 여기서 한 번에 정한다. */
  subtitleDefaults() {
    const m = this.doc.meta || {};
    const 적은것 = {};
    const 표 = {
      자막차림표: "차림표", 자막모양: "차림표", 자막글꼴: "글꼴", 자막크기: "크기",
      자막색: "색", 자막가로: "가로", 자막세로: "세로", 자막높이: "높이",
      자막바탕: "바탕", 자막바탕색: "바탕색", 자막투명도: "투명도",
      자막테두리: "테두리", 자막테두리색: "테두리색", 자막등장: "등장", 자막타자속도: "타자속도",
    };
    for (const [적는말, 키] of Object.entries(표)) {
      if (m[적는말] != null && m[적는말] !== "") 적은것[키] = m[적는말];
    }
    return 모양읽기(적은것);
  }

  /** 그때 그 배우가 어떤 그림으로 보이나.
   *
   *  `<이름> 포즈 sleep` 을 쓰면 그 시각부터 그 그림으로 바뀐다.
   *  포즈를 안 썼거나 그 그림이 없으면 기본(front) 그림을 그대로 쓴다 —
   *  그림 한 장짜리 캐릭터도 아무 일 없이 돌아가야 하기 때문이다.
   */
  배우그림(a, t) {
    const 기본 = this.assets.배우[a.name];
    if (!a.poses?.length) return 기본;
    let 고른것 = null;
    for (const p of a.poses) {
      if (p.t <= t + 1e-6) 고른것 = p.role; else break;
    }
    if (!고른것) return 기본;
    return (this.assets.포즈?.[a.name]?.[고른것]) || 기본;
  }

  /** 이 대본이 필요로 하는 것들 (없는 것 찾기 · 미리 받아두기 용) */
  needs() {
    const 배경 = new Set(), 배우 = new Set(), 효과 = new Set(), 소리 = new Set();
    /* 어느 배우의 어떤 포즈가 쓰이는가 — 쓰는 것만 실어 오려고 모은다
       (21포즈짜리 캐릭터를 통째로 받으면 느려진다) */
    const 포즈 = {};
    for (const s of this.scenes) {
      if (s.bg) 배경.add(s.bg);
      s.actors.forEach(a => {
        if (!a.소품) 배우.add(a.name);
        (a.poses || []).forEach(p => { (포즈[a.name] ||= new Set()).add(p.role); });
      });
      s.effects.forEach(e => 효과.add(e.name));
      s.sounds.forEach(x => 소리.add(x.name));
    }
    /* 없는 것 — 다만 배경은 코드로 그려 주므로 '없어도 굽을 수 있다'.
       그래서 `자동:true` 를 달아 준다. 작업실은 이걸 보고 막지 않는다. */
    const missing = [];
    배경.forEach(n => {
      if (this.assets.배경[n]) return;
      if (readColor(n)) return;                    // 단색 배경은 그림이 필요 없다
      const s = readScenery(n);
      missing.push({ 종류: "배경", 이름: n, 자동: true,
                     자동설명: s.알아봄 ? `${s.시간.이름} ${s.장소.이름}` : "기본 들판" });
    });
    // 소품은 코드로 그리므로 캐릭터 그림이 필요 없다
    const 소품이름 = new Set();
    for (const sc of this.scenes)
      for (const a of sc.actors) if (a.소품) 소품이름.add(a.name);
    배우.forEach(n => {
      if (소품이름.has(n)) return;
      if (this.assets.배우[n] && !this.assets.배우[n].자동) return;
      const c = readCharacter(n);
      missing.push({ 종류: "캐릭터", 이름: n, 자동: true,
                     자동설명: c.알아봄 ? c.종류 : `${c.종류} (이름으로 고름)` });
    });
    return { 배경: [...배경], 배우: [...배우], 효과: [...효과], 소리: [...소리],
             포즈: Object.fromEntries(Object.entries(포즈).map(([k, v]) => [k, [...v]])),
             missing };
  }

  /** 시각 t 가 어느 장면인지 */
  sceneAt(t) {
    for (const s of this.scenes) if (t < s.start + s.seconds) return s;
    return this.scenes[this.scenes.length - 1] || null;
  }

  /** 이 순간 울려야 할 소리 (t0 ~ t1 사이) */
  soundsBetween(t0, t1) {
    const out = [];
    for (const s of this.scenes)
      for (const snd of s.sounds) {
        const at = s.start + snd.t;
        if (at >= t0 && at < t1) out.push({ name: snd.name, at });
      }
    return out;
  }

  /** 화면 한 장 (box = {x,y,w,h})
   *
   *  @param 짓 {자막빼고:true} 자막을 안 그린다.
   *    💬 자막 꾸미기 창이 쓴다 — 거기서는 **고치는 중인 자막 하나만** 보여야 한다.
   *    원래 자막이 같이 깔리면 둘이 겹쳐 어느 쪽을 고치고 있는지 알 수가 없다. */
  drawAt(ctx, box, t, 짓 = {}) {
    this._자막빼고 = !!짓.자막빼고;
    if (!this.scenes.length) return;
    const scene = this.sceneAt(t);
    const lt = t - scene.start;                        // 장면 안에서의 시각

    ctx.save();
    ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();

    // 장면 전환 — 앞 장면과 새 장면을 겹쳐 그린다
    const idx = this.scenes.indexOf(scene);
    const 이름 = scene.opt.전환 || (idx > 0 ? DEFAULT_TRANSITION : "없음");
    const tr = TRANSITIONS[이름] || TRANSITIONS[DEFAULT_TRANSITION];
    const 길이 = Math.max(0.05, parseFloat(scene.opt.전환길이) || tr.기본길이 || TRANS_SEC);

    if (tr.들어옴 && idx > 0 && lt < 길이) {
      const prev = this.scenes[idx - 1];
      const k = (tr.이징 || 부드럽게)(Math.min(1, lt / 길이));

      // 검게·희게 잠기는 전환은 바탕을 먼저 깔아야 사이가 비지 않는다
      if (tr.바탕) {
        ctx.save();
        ctx.fillStyle = tr.바탕;
        ctx.fillRect(box.x, box.y, box.w, box.h);
        ctx.restore();
      }
      // 앞 장면 — 얼려 두지 않고 **계속 살아 움직이게** 둔다.
      // (예전에는 마지막 화면을 정지 사진처럼 붙들어서 툭 끊기는 느낌이 났다)
      ctx.save();
      if (tr.나감) tr.나감(ctx, box, k);
      if (ctx.globalAlpha > 0.004) this.drawScene(ctx, box, prev, prev.seconds + lt);
      ctx.restore();
      // 새 장면
      ctx.save();
      tr.들어옴(ctx, box, k);
      if (ctx.globalAlpha > 0.004) this.drawScene(ctx, box, scene, lt);
      ctx.restore();
    } else {
      this.drawScene(ctx, box, scene, lt);
    }

    /* 여닫이 — 영상 맨 앞·맨 뒤를 어둠(또는 흰빛)에서 열고 닫는다.
       뚝 시작해서 뚝 끝나는 느낌을 없앤다. 대본 첫머리에 `여닫이: 어둡게`. */
    const 여닫이 = (this.doc.meta || {}).여닫이;
    if (여닫이 && 여닫이 !== "없음") {
      const 열기 = 0.45, 닫기 = 0.6;
      let 가림 = 0;
      if (t < 열기) 가림 = 1 - 부드럽게(t / 열기);
      else if (t > this.seconds - 닫기)
        가림 = 부드럽게(Math.min(1, (t - (this.seconds - 닫기)) / 닫기));
      if (가림 > 0.004) {
        ctx.save();
        ctx.globalAlpha *= 가림;
        ctx.fillStyle = 여닫이 === "밝게" ? "#ffffff" : "#000000";
        ctx.fillRect(box.x, box.y, box.w, box.h);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /** 시각 t 에 이 개체가 실제로 있는 자리 (붙어 있으면 부모를 따라간다) */
  자리보기(scene, actor, t) { return 자리풀기(scene, actor, t); }

  /** 실제 시각 → '화면 속 시각'. 느리게/빠르게 구간을 지나면 달라진다. */
  sceneTime(scene, rawT) { return 시간흐름(scene.시간트랙, rawT); }

  drawScene(ctx, box, scene, rawT) {
    // 시간 배속 — 느리게/빠르게 구간에서는 화면 속 시간이 다르게 흐른다 (슬로모션)
    let lt = this.sceneTime(scene, rawT);
    // 멈칫 구간에서는 시간을 그 시작점에 붙들어 둔다 → 화면이 잠깐 얼어붙는다
    for (const f of scene.freezes) {
      if (rawT >= f.t0 && rawT < f.t1) { lt = f.t0; break; }
    }
    const cam = cameraAt(scene.cam, lt);
    /* 따라가는 카메라 — 배우가 무시 구역 밖으로 나간 만큼만 부드럽게 쫓아간다 */
    const f = scene.cam.follow;
    if (f && lt >= f.t0) {
      const 배우 = scene.actors.find(a => !f.who || a.name === f.who) || scene.actors[0];
      if (배우) {
        const 지금 = valueAt(배우.pos, lt, [0.5, 0.72])[0];
        const 벗어남 = 지금 - 0.5;
        const 넘음 = Math.max(0, Math.abs(벗어남) - f.무시) * Math.sign(벗어남);
        cam.at = [0.5 + 넘음 * (1 - f.느슨), cam.at[1]];
      }
    }
    ctx.save();
    // 카메라 — 화면 가운데를 축으로 확대하고, 보는 자리로 옮기고, 흔든다
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    ctx.translate(cx, cy);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cx - (cam.at[0] - 0.5) * box.w, -cy - (cam.at[1] - 0.5) * box.h);
    if (cam.shake > 0.001) {
      ctx.translate(cam.흔들x * cam.shake * box.w * 0.05,
                    cam.흔들y * cam.shake * box.h * 0.04);
      if (Math.abs(cam.기울기) > 0.02) {              // 살짝 돌기까지 (덜 밋밋하다)
        ctx.translate(cx, cy);
        ctx.rotate(cam.기울기 * Math.PI / 180);
        ctx.translate(-cx, -cy);
      }
    }
    /* 감정 도구로서의 카메라 — 기울이기(긴장) · 펀치(놀람)
       기울이면 네 귀퉁이가 화면 밖으로 나가 빈 곳이 생긴다.
       그래서 기울인 만큼 살짝 확대해 가려 준다 (게임에서도 이렇게 한다). */
    if (cam.틀기 || cam.펀치 !== 1) {
      const 라디안 = Math.abs(cam.틀기) * Math.PI / 180;
      const 가림 = Math.cos(라디안) + Math.sin(라디안) * Math.max(box.w / box.h, box.h / box.w);
      ctx.translate(cx, cy);
      if (cam.틀기) ctx.rotate(cam.틀기 * Math.PI / 180);
      ctx.scale(cam.펀치 * 가림, cam.펀치 * 가림);
      ctx.translate(-cx, -cy);
    }

    // 배경 — 뒤·본·앞 세 겹까지 (없으면 본 배경 하나)
    const 뒤 = scene.opt.뒤 || scene.opt.뒷배경;
    const 앞 = scene.opt.앞 || scene.opt.앞배경;
    // 배경색 — 장면에 적은 것이 먼저, 없으면 대본 첫머리에 적은 것
    const 배경색 = scene.opt.배경색 || scene.opt.바탕 || (this.doc.meta || {}).배경색 || null;
    if (뒤) drawBackground(ctx, box, this.assets.배경[뒤], 뒤, lt, cam, 0.15);
    drawBackground(ctx, box, this.assets.배경[scene.bg], scene.bg, lt, cam,
                   뒤 ? 0.55 : 0.35, 배경색);

    // 배우 (뒤에 등장한 사람이 앞에 오도록 z 순서)
    for (const a of [...scene.actors].sort((p, q) => p.z - q.z)) {
      if (a.born != null && lt < a.born) continue;
      if (a.died != null && lt > a.died) continue;
      const pos = 자리풀기(scene, a, lt);
      const prev = 자리풀기(scene, a, Math.max(0, lt - 0.05));    // 얼마나 빨리 움직이는가
      const dx = pos[0] - prev[0];
      // 점프 (포물선) · 떨기 · 기울이기 · 좌우 반전
      let hop = 0;
      for (const j of a.hop) {
        if (lt < j.t0 || lt > j.t1) continue;
        const q = (lt - j.t0) / Math.max(0.01, j.t1 - j.t0);
        hop = Math.max(hop, Math.sin(q * Math.PI) * j.h);
      }
      let jitter = 0;
      for (const sh of a.shakes) {
        if (lt < sh.t0 || lt > sh.t1) continue;
        const k = 1 - (lt - sh.t0) / Math.max(0.01, sh.t1 - sh.t0);
        jitter = Math.max(jitter, sh.amp * k);
      }
      let flip = 1;
      for (const f of a.flips) if (f.t <= lt) flip = f.dir;

      /* ── 소품이면 물건으로 그리고 끝 ──
         배우와 같은 트랙(자리·크기·회전·점프·눌림)을 그대로 쓰지만
         얼굴·표정·그림자 대신 물건 그림 하나를 얹는다. */
      if (a.소품) {
        let 각 = valueAt(a.rot, lt, 0);
        for (const r of a.회전 || []) {                 // 돌리기 — 빙글빙글
          if (lt < r.t0) continue;
          const 끝 = Math.min(lt, r.t1);
          각 += (끝 - r.t0) / Math.max(0.01, r.t1 - r.t0) * 360 * r.바퀴;
        }
        const 크 = valueAt(a.scale, lt, 1) * (parseFloat(a.opt?.크기) || 1);
        const 올림 = 붙은부모(a, lt) ? 0 : hop;          // 붙어 있으면 부모가 이미 올려 준다
        ctx.save();
        ctx.globalAlpha *= valueAt(a.alpha, lt, 1);
        const 그림 = this.assets.배우[a.name];
        const 자리 = { x: pos[0] + (jitter ? Math.sin(lt * 47) * 0.004 * jitter : 0),
                       y: pos[1] - 올림 };
        if (그림 && 그림.width) {                        // 올린 그림이 있으면 그걸 쓴다
          const S2 = Math.min(box.w, box.h) * 0.28 * 크;
          const w2 = S2, h2 = S2 * (그림.height / 그림.width || 1);
          ctx.translate(box.x + 자리.x * box.w, box.y + 자리.y * box.h);
          ctx.rotate(각 * Math.PI / 180);
          ctx.drawImage(그림, -w2 / 2, -h2 / 2, w2, h2);
        } else {
          drawProp(ctx, box, a.소품, 자리, 0.2 * 크, 각);
        }
        ctx.restore();
        continue;
      }

      // 표정 — '팝'은 잠깐 커지고, '서서히'는 앞 표정과 겹친다
      let 표정겹침 = null, 표정팝 = 1;
      const exprs = a.events.filter(e => e.kind === "표정" && e.t <= lt);
      const last표정 = exprs[exprs.length - 1];
      if (last표정) {
        const 지남 = lt - last표정.t;
        const dur = last표정.dur || 0.3;
        if (last표정.방식 === "팝" && 지남 < dur)
          표정팝 = 1 + Math.sin((지남 / dur) * Math.PI) * 0.1;
        if (last표정.방식 === "서서히" && 지남 < dur) {
          const prev = exprs[exprs.length - 2];
          표정겹침 = { from: prev ? prev.value : "blink", k: 지남 / dur };
        }
      }

      const state = {
        t: lt, pos,
        hop, jitter, flip, 표정겹침,
        rot: valueAt(a.rot, lt, 0) + (jitter ? Math.sin(lt * 55) * 2.5 * jitter : 0),
        scale: valueAt(a.scale, lt, 1) * 표정팝,
        눌림: squashAt(a.squash, lt),
        alpha: valueAt(a.alpha, lt, 1),
        speed: Math.abs(dx) / 0.05,
        dir: dx,
        표정: lastEvent(a.events, lt, "표정", null),
        동작: lastEvent(a.events, lt, "동작", null),
        눈물: lastEvent(a.events, lt, "눈물", null),
      };
      // 모션 트레일 — 빠르게 움직일 때 지나온 자리에 옅은 잔상을 남긴다
      if (state.speed > 0.35) {
        const ghosts = Math.min(3, Math.round(state.speed * 3));
        for (let g = ghosts; g >= 1; g--) {
          const back = Math.max(0, lt - g * 0.035);
          const gp = valueAt(a.pos, back, pos);
          ctx.save();
          ctx.globalAlpha *= 0.16 * (1 - g / (ghosts + 1));
          drawActor(ctx, box, a, this.배우그림(a, back),
                    { ...state, t: back, pos: gp, speed: 0 });
          ctx.restore();
        }
      }
      const at = drawActor(ctx, box, a, this.배우그림(a, lt), state);
      // 이 배우의 말풍선
      for (const b of scene.bubbles) {
        if (b.who !== a.name || lt < b.t0 || lt > b.t1) continue;
        drawBubble(ctx, box, b.text, lt - b.t0,
                   { x: at.x + at.w / 2, y: at.y }, b.opt);
      }
    }

    // 인서트 컷 — 구석에 작은 칸을 띄워 같은 장면을 확대해 보여 준다 (만화의 클로즈업)
    // 장면 옵션: 인서트:0.34  (칸 크기 비율)
    // 앞배경 (배우보다 앞 — 풀숲·창틀처럼 가리는 것)
    if (앞) drawBackground(ctx, box, this.assets.배경[앞], 앞, lt, cam, 1);

    // 효과
    for (const e of scene.effects) {
      if (lt < e.t0 || lt > e.t1) continue;
      drawEffect(ctx, box, e.name, lt - e.t0, e.opt);
    }
    ctx.restore();                 // 카메라 끝 — 자막은 카메라를 따라 흔들리지 않는다

    // 레터박스 — 위아래 검은 띠 (영화 같은 느낌 · 회상·중요한 대사에)
    if (cam.레터박스 > 0.002) {
      const h = box.h * 0.11 * Math.min(1, cam.레터박스);
      ctx.save();
      ctx.fillStyle = "#000";
      ctx.fillRect(box.x, box.y, box.w, h);
      ctx.fillRect(box.x, box.y + box.h - h, box.w, h);
      ctx.restore();
    }

    // 만화 칸 테두리 (장면 옵션 칸:테두리)
    if (scene.opt.칸) drawPanelBorder(ctx, box, scene.opt.칸);

    // 인서트 컷 — 구석의 작은 칸에 같은 장면을 확대해 보여 준다 (만화의 클로즈업)
    if (scene.opt.인서트) {
      const f = Math.max(0.2, Math.min(0.6, parseFloat(scene.opt.인서트) || 0.34));
      const iw = box.w * f, ih = box.h * f;
      const ix = scene.opt.인서트자리 === "왼쪽" ? box.x + box.w * 0.04
                                                : box.x + box.w * 0.96 - iw;
      const iy = box.y + box.h * 0.04;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(ix, iy, iw, ih, Math.min(iw, ih) * 0.06);
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.save();
      ctx.clip();
      // 같은 장면을 2배로 당겨 그린다
      const z = parseFloat(scene.opt.인서트배율) || 2;
      ctx.translate(ix + iw / 2, iy + ih / 2);
      ctx.scale(z, z);
      ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2));
      this.drawScene(ctx, box, { ...scene, opt: { ...scene.opt, 인서트: null, 칸: null } }, lt);
      ctx.restore();
      ctx.strokeStyle = "#2b2119";
      ctx.lineWidth = Math.max(2, Math.min(box.w, box.h) * 0.008);
      ctx.stroke();
      ctx.restore();
    }

    /* 자막 모양 — 대본 첫머리에 적은 기본값 위에 그 자막이 따로 적은 것을 얹는다.
       (편마다 글꼴·크기를 다시 안 써도 되도록) */
    const 자막기본 = this.subtitleDefaults();
    if (!this._자막빼고) {
      for (const s of scene.subtitles) {
        if (lt < s.t0 || lt > s.t1) continue;
        drawSubtitle(ctx, box, s.text, lt - s.t0, s.opt || {}, 자막기본);
      }
    }

    /* 후처리 — 다 그린 뒤 한 겹 더. 게임이 같은 그림으로 좋아 보이는 비결이다.
       자막 뒤에 하는 이유: 자막까지 같은 분위기에 잠겨야 한 장면으로 보인다. */
    applyPost(ctx, box, this.postAt(scene, lt));
  }

  /** 시각 t 의 후처리 값 (장면 옵션 `분위기:밤` + 대본의 `화면` 지시) */
  postAt(scene, t) {
    const p = scene.post || {};
    let 분위기 = scene.opt.분위기 || (this.doc.meta || {}).분위기 || "없음";
    for (const e of p.분위기 || []) if (e.t <= t) 분위기 = e.value;
    const 얹기 = (list, 기본) => {
      let v = 기본;
      for (const tr of list || []) {
        if (t < tr.t0) break;
        const k = tr.t1 > tr.t0 ? ease(tr.ease, (t - tr.t0) / (tr.t1 - tr.t0)) : 1;
        v = tr.from + (tr.to - tr.from) * k;
      }
      return v;
    };
    const M = MOODS[분위기] || {};
    let 번쩍 = 0;
    for (const f of p.번쩍 || []) {
      if (t < f.t0 || t > f.t1) continue;
      const k = (t - f.t0) / Math.max(0.01, f.t1 - f.t0);
      번쩍 = Math.max(번쩍, f.amp * (1 - k) * (1 - k));      // 확 밝았다 빠르게 잦아듦
    }
    return {
      분위기,
      비네트: 얹기(p.비네트, M.비네트 ?? 0),
      블룸: 얹기(p.블룸, M.블룸 ?? 0),
      결: 얹기(p.결, M.결 ?? 0),
      번쩍,
    };
  }
}
