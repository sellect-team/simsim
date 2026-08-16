/* ▶ 영상 보기 창 — 히스토리·작업실·스토리 어디서든 같은 창으로 본다.
 *
 *   import { openPlayer } from "../ui/player.js";
 *   openPlayer({ filename: "story_538619.mp4", 제목: "출근길 이야기", 초: 32 });
 *
 * 크기는 세 가지 —
 *   맞춤   창에 들어가는 만큼 (기본. 어떤 영상이든 한눈에 들어온다)
 *   원본   1픽셀이 1픽셀. 화질을 볼 때 쓴다 (창보다 크면 창 안에서 굴린다)
 *   작게   원본의 절반. 여러 편을 빠르게 넘겨 볼 때
 * 고른 크기는 기억해 두었다가 다음에 열 때도 그대로 쓴다.
 *
 * webp·gif 는 <video> 가 못 트니 <img> 로 바꿔 단다.
 */
import { openModal } from "./modal.js";

const 보기URL = f => `/api/view?filename=${encodeURIComponent(f)}&subfolder=video&type=output`;
const 내려받기URL = (f, 이름) =>
  `/api/videos/download?filename=${encodeURIComponent(f)}` +
  (이름 ? `&내려받을이름=${encodeURIComponent(이름)}` : "");

const 크기표 = {
  맞춤: { 글: "맞춤", 설명: "창에 들어가는 만큼" },
  원본: { 글: "원본", 설명: "1픽셀이 1픽셀 — 화질 보기" },
  작게: { 글: "작게", 설명: "원본의 절반" },
};
const 기억한크기 = () => (크기표[localStorage.getItem("영상보기크기")] ? localStorage.getItem("영상보기크기") : "맞춤");

/** 영상(또는 gif·webp) 한 편을 창으로 연다 */
export function openPlayer(v = {}) {
  const 파일 = v.filename || v.file;
  if (!파일) return null;
  const 움직그림 = /\.(webp|gif)$/i.test(파일);
  const 제목 = v.제목 || v.title || 파일;
  const 받을이름 = v.제목 && v.제목 !== 파일 ? v.제목 : "";

  let 크기 = 기억한크기();

  const 창 = openModal({
    제목: `▶ ${제목}`,
    너비: "min(1280px, 96vw)",
    높이: "min(92vh, 1000px)",
    안내: [v.date, v.size ? `${(v.size / 1048576).toFixed(1)}MB` : "",
           v.duration || v.초 ? 시간글(v.duration || v.초) : "",
           v.주인 ? `📁 ${v.주인}` : ""].filter(Boolean).join(" · "),
    내용: `<div id="plBar" class="charRow" style="align-items:center; gap:6px; margin-bottom:8px">
        <span class="hint">크기</span>
        ${Object.entries(크기표).map(([k, o]) =>
          `<button type="button" class="ghost small plZoom" data-크기="${k}"
                   title="${o.설명}">${o.글}</button>`).join("")}
        <span class="hint" id="plInfo" style="margin-left:6px"></span>
      </div>
      <div id="plBox" style="background:#0d0c11; border-radius:10px; overflow:auto;
           display:flex; align-items:center; justify-content:center; min-height:220px;
           max-height:calc(92vh - 200px)"></div>`,
    단추: [
      { 글: "⬇ 내려받기", 강조: true, 할일: () => 내려받기(파일, 받을이름) },
      { 글: "📂 폴더에서 보기", 할일: () => {
        fetch("/api/videos/open", { method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: 파일 }) }).catch(() => {});
      } },
    ],
  });

  const 상자 = document.getElementById("plBox");
  const 알림 = document.getElementById("plInfo");

  /* 화면 요소는 종류에 따라 하나만 만든다 */
  const 화면 = document.createElement(움직그림 ? "img" : "video");
  화면.src = 보기URL(파일);
  if (!움직그림) {
    화면.controls = true;
    화면.autoplay = true;
    화면.loop = !!v.반복;
    화면.playsInline = true;
    /* `시작` 은 0~1 (컷 시트에서 그 칸을 눌러 왔을 때) */
    if (v.시작 != null) {
      화면.addEventListener("loadedmetadata", () => {
        화면.currentTime = Math.max(0, Math.min(화면.duration - 0.05,
                                                화면.duration * Number(v.시작)));
      }, { once: true });
    }
  }
  화면.style.cssText = "display:block; background:#000; border-radius:8px";
  상자.appendChild(화면);

  /** 고른 크기를 실제로 먹인다 */
  function 크기먹이기(k) {
    크기 = 크기표[k] ? k : "맞춤";
    localStorage.setItem("영상보기크기", 크기);
    document.querySelectorAll("#plBar .plZoom").forEach(b =>
      b.style.outline = b.dataset.크기 === 크기 ? "2px solid var(--accent,#6c8cff)" : "");
    const w = 화면.videoWidth || 화면.naturalWidth || 0;
    const h = 화면.videoHeight || 화면.naturalHeight || 0;
    if (크기 === "맞춤" || !w) {
      화면.style.width = "auto"; 화면.style.height = "auto";
      화면.style.maxWidth = "100%";
      화면.style.maxHeight = "calc(92vh - 210px)";
    } else {
      const 배 = 크기 === "작게" ? 0.5 : 1;
      화면.style.maxWidth = "none"; 화면.style.maxHeight = "none";
      화면.style.width = Math.round(w * 배) + "px";
      화면.style.height = Math.round(h * 배) + "px";
    }
    if (알림) 알림.textContent = w
      ? `${w}×${h}${크기 === "맞춤" ? "" : ` · 지금 ${Math.round(parseFloat(화면.style.width))}px`}`
      : "";
  }

  // 크기를 알아야 원본·작게를 계산할 수 있다 — 다 읽힌 뒤 한 번 더 맞춘다
  화면.addEventListener(움직그림 ? "load" : "loadedmetadata", () => 크기먹이기(크기));
  화면.addEventListener("error", () => {
    상자.innerHTML = '<div class="hint" style="padding:24px">영상을 열지 못했습니다. ' +
      '파일이 지워졌거나 아직 굽는 중일 수 있습니다.</div>';
  });
  document.querySelectorAll("#plBar .plZoom").forEach(b =>
    b.addEventListener("click", () => 크기먹이기(b.dataset.크기)));
  크기먹이기(크기);

  return 창;
}

/** 파일 하나 내려받기 — 어디서든 쓴다 */
export function 내려받기(파일, 이름 = "") {
  const a = document.createElement("a");
  a.href = 내려받기URL(파일, 이름);
  a.download = 이름 || 파일;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
export const downloadVideo = 내려받기;

/** 여러 편을 zip 하나로 — 서버가 묶어 준다 */
export async function 여러개내려받기(파일들, 이름 = "심심공작소_영상") {
  if (!파일들 || !파일들.length) throw new Error("고른 영상이 없습니다.");
  const r = await fetch("/api/videos/download_many", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filenames: 파일들, 이름 }) });
  if (!r.ok) {
    let 까닭 = "묶지 못했습니다.";
    try { 까닭 = (await r.json()).error || 까닭; } catch {}
    throw new Error(까닭);
  }
  const 덩어리 = await r.blob();
  const url = URL.createObjectURL(덩어리);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${이름}_${파일들.length}편.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
  return 덩어리.size;
}

function 시간글(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m ? `${m}분 ${s}초` : `${s}초`;
}
