/* 🏡 홈 — 처음 여는 화면.
 *
 * 하는 일은 셋뿐이다.
 *   ① 이 프로그램이 무엇인지 한 줄로 알려 준다
 *   ② 지금 내 것이 얼마나 있는지 보여 준다 (프로젝트·편·캐릭터·영상)
 *   ③ 어느 탭이 무엇을 하는지 알려 주고 데려간다
 *
 * 가운데 무늬는 배경 파티클과 같은 결이지만 **여기서만 작게** 돈다.
 * 화면 전체를 덮으면 일하는 데 방해가 되므로 홈에서만 보여 준다.
 */
import { $ } from "../core.js";
import { library } from "../story/assets.js";
import { openGuide } from "../ui/guide_modal.js";

const 탭소개 = [
  { tab: "homeTab", icon: "🏠", 이름: "작업실",
    설명: "프로젝트를 만들고, 대본을 쓰고, 음악을 얹고, 이어 붙여 굽습니다. 여기서 대부분의 일을 합니다." },
  { tab: "charTab", icon: "🎨", 이름: "자산",
    설명: "작업실에서 쓸 캐릭터·배경·표정을 모아 둡니다. 지금 부족한 그림도 여기서 채웁니다." },
  { tab: "studioTab", icon: "🧪", 이름: "스튜디오",
    설명: "이 컴퓨터의 생성 엔진으로 그림·영상을 직접 만들고 시험해 봅니다." },
  { tab: "historyTab", icon: "🗂", 이름: "히스토리",
    설명: "구운 영상을 모아 봅니다. 자르기·이어붙이기·GIF 로 바꾸기도 합니다." },
  { tab: "musicTab", icon: "🎵", 이름: "뮤직비주얼",
    설명: "노래에 맞춰 가사와 무늬가 흐르는 영상을 만듭니다. 작업실과는 따로 도는 기능입니다." },
  { tab: "slideTab", icon: "🎞", 이름: "슬라이드쇼",
    설명: "사진 여러 장을 이어 붙여 넘어가는 영상을 만듭니다." },
];

let raf = 0;

export async function mount(root) {
  그리기시작();
  탭들그리기();

  $("hoStart").addEventListener("click", () =>
    document.querySelector('nav#tabs [data-tab="homeTab"]')?.click());
  // 팝업은 독립 모듈이라 여기서 바로 연다 (탭을 옮겨 다닐 필요가 없다)
  $("hoGuide").addEventListener("click", () => openGuide());

  숫자채우기();
}

function 탭들그리기() {
  $("hoTabs").innerHTML = 탭소개.map(t => `
    <div class="vitem" data-가기="${t.tab}" style="flex-direction:column; align-items:flex-start;
         gap:6px; padding:14px; cursor:pointer">
      <div style="font-size:15px"><b>${t.icon} ${t.이름}</b></div>
      <span class="hint" style="line-height:1.6">${t.설명}</span>
    </div>`).join("");
  $("hoTabs").querySelectorAll("[data-가기]").forEach(el =>
    el.addEventListener("click", () =>
      document.querySelector(`nav#tabs [data-tab="${el.dataset.가기}"]`)?.click()));
}

async function 숫자채우기() {
  const 칸 = (n, 이름) => `<span><b style="font-size:22px">${n}</b>
    <span class="hint" style="margin-left:5px">${이름}</span></span>`;
  let 프로젝트 = 0, 편 = 0, 초 = 0, 영상 = 0;
  try {
    const d = await (await fetch("/api/project/list")).json();
    프로젝트 = (d.items || []).length;
    편 = (d.items || []).reduce((a, b) => a + (b.story_count || 0), 0);
    초 = (d.items || []).reduce((a, b) => a + (b.seconds || 0), 0);
  } catch {}
  try { 영상 = ((await (await fetch("/api/videos")).json()).videos || []).length; } catch {}
  try { await library.refresh(); } catch {}
  $("hoStats").innerHTML =
    칸(프로젝트, "프로젝트") + 칸(편, "편") +
    칸(`${Math.floor(초 / 60)}분`, "분량") + 칸(영상, "구운 영상") +
    칸(library.characters.length, "캐릭터") + 칸(library.backgrounds.length, "배경");
  $("hoFoot").textContent =
    "그림이 없어도 배경 25종·캐릭터 10종·소품 16종을 코드가 그립니다. " +
    "효과음은 라이선스 없는 것만 씁니다.";
}

/* ── 조용히 도는 무늬 ──
   화면을 덮는 배경과 달리 여기서는 작은 원 안에서만 돈다.
   보이지 않을 때는 아예 멈춰 힘을 낭비하지 않는다. */
function 그리기시작() {
  const c = $("hoOrb");
  if (!c) return;
  const S = 360, dpr = Math.min(2, devicePixelRatio || 1);
  c.width = S * dpr; c.height = S * dpr;
  const g = c.getContext("2d");
  g.scale(dpr, dpr);

  // 공 위에 고르게 뿌린 점 (피보나치 나선)
  const N = 260;
  const 점 = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.399963;
    점.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  const 색 = ["#8b7dff", "#6cc7ff", "#ffcf6c", "#ff8fb1", "#7bd88f"];

  cancelAnimationFrame(raf);
  const 돌기 = now => {
    raf = requestAnimationFrame(돌기);
    if (!c.isConnected || !c.offsetParent) return;      // 안 보이면 쉰다
    const t = now / 1000;
    g.clearRect(0, 0, S, S);
    const cx = S / 2, cy = S / 2, R = S * 0.4;
    const ca = Math.cos(t * 0.25), sa = Math.sin(t * 0.25);
    const cb = Math.cos(0.42), sb = Math.sin(0.42);
    const 보임 = [];
    for (let i = 0; i < N; i++) {
      const [x0, y0, z0] = 점[i];
      const x1 = x0 * ca - z0 * sa, z1 = x0 * sa + z0 * ca;   // Y축 회전
      const y1 = y0 * cb - z1 * sb, z2 = y0 * sb + z1 * cb;   // X축 기울임
      보임.push([cx + x1 * R, cy + y1 * R, z2, i]);
    }
    보임.sort((a, b) => a[2] - b[2]);                          // 뒤에 있는 것부터
    for (const [x, y, z, i] of 보임) {
      const 깊이 = (z + 1) / 2;                                 // 0=뒤 1=앞
      g.globalAlpha = 0.12 + 깊이 * 0.75;
      g.fillStyle = 색[i % 색.length];
      const s = 1.1 + 깊이 * 2.3;
      g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  };
  raf = requestAnimationFrame(돌기);
}
