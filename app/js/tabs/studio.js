/* 🧪 스튜디오 — 이 컴퓨터에서 직접 만들어 보는 곳.
 *
 * 작업실에서 쓸 **객체**를 여기서 만들고 시험한 뒤 자산으로 넘긴다.
 * 바깥 서비스를 쓰지 않는다. 쓰는 것은 셋뿐이다.
 *
 *   ComfyUI (Wan 2.2 5B)  그림 한 장 · 짧은 영상
 *   Ollama  (exaone3.5)   한국어 → 영어 프롬프트, 자막 다듬기
 *   코드                   배경·캐릭터·소품을 0초에 그리기
 *
 * 화면은 만들 수 있는 것마다 하위 탭으로 나눈다. 엔진이 꺼져 있으면 그 탭에서 알려 준다.
 */
import { $, statusBox, escapeHtml } from "../core.js";
import { drawScenery } from "../story/scenery.js";
import { drawProp, PROPS } from "../story/props.js";
import { drawAutoCharacter } from "../char/autochar.js";

let 붙임 = false;
const S = { 할수있는것: null, 그림: null, 다듬은것: null };

export async function mount(root) {
  if (!붙임) { 손붙이기(); 붙임 = true; }
  엔진확인();

  /* 다른 탭이 부를 수 있는 창구.
     히스토리의 [♻ 리메이크] 가 옛 영상의 설정을 여기로 실어 보낸다.
     (예전 스튜디오를 새로 만들면서 이 다리가 끊겨 리메이크가 조용히 죽어 있었다.) */
  window.StudioTab = {
    /** 옛 영상의 설정을 영상 만들기 칸에 채운다 */
    setSettings(s = {}) {
      하위열기("video");
      const 넣기 = (id, 값) => { const el = $(id); if (el && 값 != null && 값 !== "") el.value = 값; };
      넣기("viPrompt", s.prompt);
      // 크기·길이·스텝은 고르개라 가장 가까운 값을 고른다
      const 가까운것 = (id, 값, 숫자로 = x => parseFloat(x)) => {
        const el = $(id);
        if (!el || 값 == null) return;
        let 제일 = null, 차 = Infinity;
        for (const o of el.options) {
          const d = Math.abs(숫자로(o.value || o.textContent) - 값);
          if (d < 차) { 차 = d; 제일 = o; }
        }
        if (제일) el.value = 제일.value || 제일.textContent;
      };
      가까운것("viSec", s.seconds);
      가까운것("viSteps", s.steps);
      if (s.width && s.height) {
        const el = $("viSize");
        if (el) {
          let 제일 = null, 차 = Infinity;
          for (const o of el.options) {
            const [w, h] = (o.textContent || "").split("×").map(Number);
            const d = Math.abs(w - s.width) + Math.abs(h - s.height);
            if (d < 차) { 차 = d; 제일 = o; }
          }
          if (제일) el.value = 제일.value || 제일.textContent;
        }
      }
      this.옛설정 = s;
    },
    setStatus(글, 종류) { const el = $("viInfo"); if (el) { el.textContent = 글; el.className = "hint " + (종류 || ""); } },
  };
}

function 하위열기(name) {
  document.querySelectorAll("#stSubs .subtab").forEach(b =>
    b.classList.toggle("on", b.dataset.sub === name));
  ["image", "video", "edit", "text", "code"].forEach(k => {
    const el = $("stPane_" + k);
    if (el) el.style.display = k === name ? "" : "none";
  });
}

async function 엔진확인() {
  try {
    S.할수있는것 = await (await fetch("/api/studio/can")).json();
  } catch { S.할수있는것 = null; }
  const c = S.할수있는것;
  if (!c) { $("stCan").textContent = "⚠ 엔진 상태를 못 읽었습니다"; return; }
  const 조각 = [
    c.comfy.켜짐 ? "🟢 ComfyUI" : "🔴 ComfyUI 꺼짐",
    c.ollama.켜짐 ? `🟢 로컬 LLM (${(c.ollama.모델[0] || "").split(":")[0]})` : "🔴 로컬 LLM 꺼짐",
    c.업스케일 ? "🟢 키우기" : "⚪ 키우기 없음",
  ];
  $("stCan").textContent = 조각.join(" · ");
  $("txModel").textContent = c.ollama.모델[0] || "없음";
}

/* ── 공통 ── */
async function 보내기(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
                               body: JSON.stringify(body) });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d;
}
async function 작업지켜보기(job, 알림) {
  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const st = await (await fetch("/api/status/" + job)).json();
    if (st.state === "done") return st;
    if (st.state === "error") throw new Error(st.error || "실패");
    알림?.(st);
  }
  throw new Error("너무 오래 걸립니다");
}
const 그림넣기 = (칸, durl) => {
  칸.innerHTML = `<img src="${durl}" style="max-width:100%; max-height:420px; object-fit:contain">`;
};

function 손붙이기() {
  const st = statusBox($("stStatus"));
  document.querySelectorAll("#stSubs .subtab").forEach(b =>
    b.addEventListener("click", () => 하위열기(b.dataset.sub)));
  $("stCanRefresh").addEventListener("click", 엔진확인);

  /* ══ 🖼 그림 만들기 ══ */
  $("imToEn").addEventListener("click", async () => {
    const 글 = $("imWhat").value.trim();
    if (!글) return;
    $("imAskInfo").textContent = "로컬 LLM 이 옮기는 중…";
    try {
      const d = await 보내기("/api/studio/ask", { 할일: "영어로", 글 });
      $("imPrompt").value = d.답;
      $("imAskInfo").textContent = `${d.모델} · ${d.걸린초}초`;
    } catch (e) { $("imAskInfo").textContent = "⚠ " + e.message; }
  });

  $("imGo").addEventListener("click", async () => {
    const 프롬 = $("imPrompt").value.trim() || $("imWhat").value.trim();
    if (!프롬) { st("무엇을 그릴지 적어 주세요.", "err"); return; }
    $("imGo").disabled = true;
    $("imInfo").textContent = "만드는 중… (30초 안팎)";
    $("imOut").innerHTML = '<div class="hint">그리는 중…</div>';
    try {
      const r = await 보내기("/api/image/generate", {
        name: $("imWhat").value.trim() || "그림", kind: $("imKind").value,
        프롬프트: 프롬, 비율: $("imRatio").value, 긴변: +$("imSize").value,
      });
      const done = await 작업지켜보기(r.job, s => { $("imInfo").textContent = `${s.progress || 0}% ${s.note || ""}`; });
      // 만든 그림은 자산으로 이미 들어갔다 — 그 파일을 보여 준다
      const it = done.item || {};
      const src = it.file ? `/api/bg/file?id=${it.id}` : `/api/char/sprite?id=${it.id}&role=front`;
      S.그림 = src;
      그림넣기($("imOut"), src);
      $("imName").value = it.name || "";
      $("imInfo").textContent = `✅ "${it.name}" 로 자산에 들어갔습니다 (${r.width}×${r.height})`;
      ["imKeep", "imUp", "imToEdit"].forEach(id => { $(id).disabled = false; });
      $("imKeep").textContent = "💾 이미 넣었습니다";
      $("imKeep").disabled = true;
      st(`"${it.name}" 을(를) 만들었습니다.`, "ok");
    } catch (e) {
      $("imInfo").textContent = "⚠ " + e.message;
      $("imOut").innerHTML = `<div class="hint">${escapeHtml(e.message)}</div>`;
    } finally { $("imGo").disabled = false; }
  });

  $("imUp").addEventListener("click", async () => {
    if (!S.그림) return;
    $("imInfo").textContent = "키우는 중…";
    try {
      const durl = await 그림을데이터로(S.그림);
      const r = await 보내기("/api/studio/upscale", { image: durl });
      const done = await 작업지켜보기(r.job, s => { $("imInfo").textContent = `키우는 중 ${s.progress}%`; });
      S.그림 = done.image;
      그림넣기($("imOut"), done.image);
      $("imKeep").disabled = false;
      $("imKeep").textContent = "💾 자산으로 넣기";
      $("imInfo").textContent = "✅ 4배로 키웠습니다 — 새 이름으로 넣으세요";
    } catch (e) { $("imInfo").textContent = "⚠ " + e.message; }
  });

  $("imKeep").addEventListener("click", async () => {
    try {
      const durl = await 그림을데이터로(S.그림);
      const d = await 보내기("/api/studio/keep", {
        kind: $("imKind").value, name: $("imName").value.trim() || "그림", image: durl });
      st(`"${d.item.name}" 을(를) 자산에 넣었습니다.`, "ok");
      $("imKeep").disabled = true;
    } catch (e) { st("⚠ " + e.message, "err"); }
  });

  $("imToEdit").addEventListener("click", async () => {
    if (!S.그림) return;
    S.다듬은것 = await 그림을데이터로(S.그림);
    if (S.그림다듬기받기) S.그림다듬기받기(S.다듬은것);
    하위열기("edit");
  });

  /* ══ 🎬 영상 만들기 ══ */
  $("viToEn").addEventListener("click", async () => {
    const 글 = $("viPrompt").value.trim();
    if (!글) return;
    $("viAskInfo").textContent = "옮기는 중…";
    try {
      const d = await 보내기("/api/studio/ask", { 할일: "영어로", 글 });
      $("viPrompt").value = d.답;
      $("viAskInfo").textContent = `${d.모델} · ${d.걸린초}초`;
    } catch (e) { $("viAskInfo").textContent = "⚠ " + e.message; }
  });

  $("viGo").addEventListener("click", async () => {
    const 프롬 = $("viPrompt").value.trim();
    if (!프롬) { st("무엇을 만들지 적어 주세요.", "err"); return; }
    const [w, h] = $("viSize").value.split("×").map(Number);
    $("viGo").disabled = true;
    $("viOut").innerHTML = '<div class="hint">만드는 중… GPU 를 크게 씁니다</div>';
    $("viInfo").textContent = "보내는 중…";
    try {
      const d = await 보내기("/api/generate", {
        settings: { prompt: 프롬, negative: "blurry, low quality, watermark, text",
                    width: w, height: h, seconds: +$("viSec").value,
                    steps: +$("viSteps").value, cfg: 5, filename: "studio_test" },
      });
      const pid = d.prompt_id || d.pid || d.job;
      if (!pid) throw new Error("작업 번호를 못 받았습니다");
      for (let i = 0; i < 600; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const s = await (await fetch("/api/status/" + pid)).json();
        $("viInfo").textContent = `${s.state || ""} ${s.progress != null ? s.progress + "%" : ""} ${s.note || ""}`;
        if (s.state === "done" || s.filename || s.video) {
          const 이름 = s.filename || s.video;
          $("viOut").innerHTML = `<video controls loop autoplay muted style="max-width:100%;
            max-height:420px" src="/api/view?filename=${encodeURIComponent(이름)}&subfolder=video&type=output"></video>`;
          $("viWhere").innerHTML = `— 🗂 히스토리에 저장됨: <b>${escapeHtml(이름)}</b>`;
          $("viInfo").textContent = "✅ 완성";
          st("영상을 만들었습니다 — 히스토리에서도 볼 수 있습니다.", "ok");
          return;
        }
        if (s.state === "error") throw new Error(s.error || "실패");
      }
      throw new Error("너무 오래 걸립니다");
    } catch (e) {
      $("viInfo").textContent = "⚠ " + e.message;
      $("viOut").innerHTML = `<div class="hint">${escapeHtml(e.message)}</div>`;
    } finally { $("viGo").disabled = false; }
  });

  /* ══ ✂ 그림 다듬기 ══
     자를 곳은 원본 위에서 **끌어서** 고른다.
     콘티 한 장에서 마스코트·표정만 오려내려면 이게 꼭 필요하다. */
  let 원본 = null;
  let 자를곳 = null;                      // {x,y,w,h} 0~1 비율

  const 상자그리기 = () => {
    const b = $("edBox"), img = $("edSrc");
    if (!자를곳) { b.style.display = "none"; $("edCropInfo").textContent = "전체"; return; }
    const r = img.getBoundingClientRect(), w = img.parentElement.getBoundingClientRect();
    b.style.display = "block";
    b.style.left = (img.offsetLeft + 자를곳.x * r.width) + "px";
    b.style.top = (img.offsetTop + 자를곳.y * r.height) + "px";
    b.style.width = (자를곳.w * r.width) + "px";
    b.style.height = (자를곳.h * r.height) + "px";
    $("edCropInfo").textContent =
      `${자를곳.x.toFixed(3)},${자를곳.y.toFixed(3)},${자를곳.w.toFixed(3)},${자를곳.h.toFixed(3)}`;
  };

  {
    const img = $("edSrc");
    let 시작 = null;
    const 자리 = ev => {
      const r = img.getBoundingClientRect();
      return { x: Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)),
               y: Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)) };
    };
    img.addEventListener("pointerdown", ev => {
      if (!원본) return;
      ev.preventDefault();
      시작 = 자리(ev);
      img.setPointerCapture(ev.pointerId);
    });
    img.addEventListener("pointermove", ev => {
      if (!시작) return;
      const p = 자리(ev);
      자를곳 = { x: Math.min(시작.x, p.x), y: Math.min(시작.y, p.y),
                 w: Math.abs(p.x - 시작.x), h: Math.abs(p.y - 시작.y) };
      상자그리기();
    });
    img.addEventListener("pointerup", () => {
      시작 = null;
      if (자를곳 && (자를곳.w < 0.02 || 자를곳.h < 0.02)) { 자를곳 = null; 상자그리기(); }
    });
  }
  $("edCropAll").addEventListener("click", () => { 자를곳 = null; 상자그리기(); });
  /* 다른 하위 탭에서 그림을 넘겨 줄 때 쓰는 문 */
  S.그림다듬기받기 = durl => {
    원본 = durl; S.다듬은것 = durl;
    $("edSrc").src = durl;
    자를곳 = null; 상자그리기();
    그림넣기($("edOut"), durl);
    $("edGo").disabled = false; $("edUp").disabled = false; $("edKeep").disabled = false;
  };
  addEventListener("resize", 상자그리기);

  $("edFile").addEventListener("change", async ev => {
    const f = ev.target.files?.[0];
    if (!f) return;
    원본 = await 파일을데이터로(f);
    S.다듬은것 = 원본;
    $("edSrc").src = 원본;
    자를곳 = null; 상자그리기();
    그림넣기($("edOut"), 원본);
    $("edGo").disabled = false; $("edUp").disabled = false; $("edKeep").disabled = false;
    $("edName").value = f.name.replace(/\.[^.]+$/, "");
    $("edInfo").textContent = "올렸습니다 — 아래에서 골라 다듬으세요";
  });
  $("edTol").addEventListener("input", () => { $("edTolLab").textContent = $("edTol").value; });

  $("edGo").addEventListener("click", async () => {
    if (!원본) return;
    $("edInfo").textContent = "다듬는 중…";
    try {
      const d = await 보내기("/api/studio/edit", {
        image: 원본, 자르기: 자를곳,           // 끌어서 고른 네모만 잘라 낸다
        배경지우기: $("edCut").checked, 방식: $("edMode").value, 허용: +$("edTol").value,
        긴변: +$("edSize").value, 다듬기: $("edTrim").checked,
      });
      S.다듬은것 = d.image;
      그림넣기($("edOut"), d.image);
      $("edSize2").textContent = `${d.가로}×${d.세로}`;
      $("edInfo").textContent = "✅ " + d.한일.join(" · ");
    } catch (e) { $("edInfo").textContent = "⚠ " + e.message; }
  });

  $("edUp").addEventListener("click", async () => {
    if (!S.다듬은것) return;
    $("edInfo").textContent = "키우는 중…";
    try {
      const r = await 보내기("/api/studio/upscale", { image: S.다듬은것 });
      const done = await 작업지켜보기(r.job, s => { $("edInfo").textContent = `키우는 중 ${s.progress}%`; });
      S.다듬은것 = done.image;
      그림넣기($("edOut"), done.image);
      $("edInfo").textContent = "✅ 4배로 키웠습니다";
    } catch (e) { $("edInfo").textContent = "⚠ " + e.message; }
  });

  $("edKeep").addEventListener("click", async () => {
    if (!S.다듬은것) return;
    try {
      const d = await 보내기("/api/studio/keep", {
        kind: $("edKind").value, name: $("edName").value.trim() || "그림", image: S.다듬은것 });
      st(`"${d.item.name}" 을(를) 자산에 넣었습니다.`, "ok");
    } catch (e) { st("⚠ " + e.message, "err"); }
  });

  /* ══ ✍ 글 도우미 ══ */
  $("txGo").addEventListener("click", async () => {
    const 글 = $("txIn").value.trim();
    if (!글) return;
    $("txGo").disabled = true;
    $("txInfo").textContent = "생각하는 중…";
    try {
      const d = await 보내기("/api/studio/ask", { 할일: $("txJob").value, 글 });
      $("txOut").value = d.답;
      $("txInfo").textContent = `${d.모델} · ${d.걸린초}초`;
    } catch (e) { $("txInfo").textContent = "⚠ " + e.message; }
    finally { $("txGo").disabled = false; }
  });
  $("txCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("txOut").value); st("복사했습니다.", "ok"); }
    catch { st($("txOut").value); }
  });
  $("txToImage").addEventListener("click", () => {
    $("imPrompt").value = $("txOut").value;
    하위열기("image");
  });

  /* ══ 🎨 코드 그림 ══ */
  $("cdGo").addEventListener("click", 코드그리기);
  $("cdTry").addEventListener("keydown", ev => { if (ev.key === "Enter") 코드그리기(); });
  코드보기();
}

/* 코드로 그리는 것들을 늘어놓는다 */
function 코드보기() {
  const 보기 = [
    ["배경", ["노을 지는 들판", "밤바다", "눈 오는 마을", "숲속", "내 방", "우주"]],
    ["캐릭터", ["누렁이 강아지", "냥이 고양이", "곰돌이", "토끼"]],
    ["소품", Object.keys(PROPS).slice(0, 8)],
  ];
  const 칸 = $("cdOut");
  칸.innerHTML = "";
  for (const [종류, 이름들] of 보기) {
    const 줄 = document.createElement("div");
    줄.style.cssText = "width:100%; margin-top:6px; font-size:13px";
    줄.innerHTML = `<b>${종류}</b> <span class="hint">— 대본에 이 이름을 그대로 씁니다</span>`;
    칸.appendChild(줄);
    for (const n of 이름들) 칸.appendChild(코드칸(종류, n));
  }
}

function 코드그리기() {
  const 이름 = $("cdTry").value.trim();
  if (!이름) { 코드보기(); return; }
  const 칸 = $("cdOut");
  칸.innerHTML = "";
  칸.appendChild(코드칸($("cdKind").value, 이름, true));
  $("cdInfo").textContent = `"${이름}" 을(를) ${$("cdKind").value} 로 그렸습니다`;
}

function 코드칸(종류, 이름, 크게 = false) {
  const W = 크게 ? 220 : 120, H = 크게 ? 390 : 210;
  const wrap = document.createElement("div");
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  c.style.cssText = "border-radius:8px; background:#141219";
  const g = c.getContext("2d");
  try {
    if (종류 === "배경") drawScenery(g, { x: 0, y: 0, w: W, h: H }, 이름, 1.2);
    else if (종류 === "소품") {
      drawScenery(g, { x: 0, y: 0, w: W, h: H }, "흰색", 0);
      drawProp(g, { x: 0, y: 0, w: W, h: H }, 이름, { x: 0.5, y: 0.5 }, 0.5);
    } else {
      drawScenery(g, { x: 0, y: 0, w: W, h: H }, "공원 잔디밭", 1);
      const img = drawAutoCharacter(이름, 420);
      const s = Math.min(W, H) * 0.62;
      g.drawImage(img, (W - s) / 2, H * 0.72 - s, s, s);
    }
  } catch (e) {
    g.fillStyle = "#8a7f70"; g.font = "12px system-ui";
    g.fillText("못 그렸습니다", 8, 20);
  }
  wrap.appendChild(c);
  const lab = document.createElement("div");
  lab.style.cssText = `font-size:11px; width:${W}px; margin-top:2px`;
  lab.textContent = 이름;
  wrap.appendChild(lab);
  return wrap;
}

/* ── 도우미 ── */
function 파일을데이터로(f) {
  return new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = no;
    r.readAsDataURL(f);
  });
}
async function 그림을데이터로(src) {
  if (typeof src === "string" && src.startsWith("data:")) return src;
  const img = await new Promise((ok, no) => {
    const i = new Image();
    i.onload = () => ok(i); i.onerror = no; i.src = src;
  });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext("2d").drawImage(img, 0, 0);
  return c.toDataURL("image/png");
}
