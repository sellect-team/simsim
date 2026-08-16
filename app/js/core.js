/* 모든 탭이 함께 쓰는 공용 도구.
   화면(뷰)은 app/views/*.html, 기능은 app/js/tabs/*.js 로 나뉘어 있고
   공통 로직은 여기 한 곳에만 둔다. */

export const $ = id => document.getElementById(id);
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function fmtMS(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** JSON API 호출 — 오류를 예외로 올려 각 탭에서 한 번에 처리한다 */
export async function api(url, body, opts = {}) {
  const init = body === undefined
    ? { ...opts }
    : { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), ...opts };
  const r = await fetch(url, init);
  const d = await r.json().catch(() => ({ error: "응답을 읽지 못했습니다." }));
  if (d.error) throw new Error(d.error);
  return d;
}

/** 파일 하나를 multipart 로 올린다 */
export async function upload(url, file, field = "file") {
  const fd = new FormData();
  fd.append(field, file, file.name || "file");
  const r = await fetch(url, { method: "POST", body: fd });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d;
}

/** 상태줄 표시기 (탭마다 하나씩 만들어 쓴다) */
export function statusBox(el) {
  return (text, kind) => {
    if (!el) return;
    el.textContent = text || "";
    el.style.color = kind === "err" ? "var(--err)"
                   : kind === "ok" ? "var(--color-saffron-spark)"
                   : "var(--color-silver-mist)";
  };
}

/** 진행 막대 (wrap 안에 bar 가 있는 구조) */
export function progressBar(wrap, bar) {
  return pct => {
    if (!wrap || !bar) return;
    wrap.style.display = pct == null ? "none" : "block";
    if (pct != null) bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
  };
}

/** 슬라이더 ↔ 숫자칸을 묶고, 라벨에 현재 값을 표시한다 */
export function linkNum(rangeEl, numEl, hintEl, fmt = v => v, onChange) {
  const sync = src => {
    const v = parseFloat(src.value);
    if (isNaN(v)) return;
    const cl = Math.max(parseFloat(numEl.min), Math.min(parseFloat(numEl.max), v));
    if (src !== numEl || cl !== v) numEl.value = cl;
    rangeEl.value = Math.max(parseFloat(rangeEl.min), Math.min(parseFloat(rangeEl.max), cl));
    if (hintEl) hintEl.textContent = fmt(cl);
    onChange && onChange(cl);
  };
  rangeEl.addEventListener("input", () => sync(rangeEl));
  numEl.addEventListener("input", () => sync(numEl));
  numEl.addEventListener("blur", () => { if (isNaN(parseFloat(numEl.value))) numEl.value = rangeEl.value; sync(numEl); });
  sync(numEl);
  return () => parseFloat(numEl.value);
}

/**
 * 옵션 옆에 ? 도움말을 붙인다. index.html 의 공용 툴팁(#tipBox)이 위임 방식이라
 * 나중에 불러온 화면에서도 그대로 동작한다.
 * @param map { 요소id: "설명" }
 */
export function addTips(map) {
  Object.entries(map).forEach(([id, tip]) => {
    const el = document.getElementById(id);
    if (!el) return;
    // 슬라이더처럼 한 겹 더 감싸인 경우도 있어 위로 올라가며 라벨을 찾는다
    let box = el.closest("div"), label = null;
    for (let i = 0; i < 4 && box && !label; i++) {
      label = box.querySelector(":scope > label");
      if (!label) box = box.parentElement && box.parentElement.closest("div");
    }
    if (!label || label.querySelector(".qm")) return;
    const q = document.createElement("span");
    q.className = "qm";
    q.textContent = "?";
    q.dataset.tip = tip;
    label.appendChild(q);
  });
}

/** 고급 옵션 접기/펼치기 */
export function foldSection(btn, section, openLabel = "고급 옵션 펼치기", closeLabel = "고급 옵션 접기") {
  const set = open => {
    section.style.display = open ? "" : "none";
    btn.textContent = (open ? "▲ " : "▼ ") + (open ? closeLabel : openLabel);
  };
  let open = false;
  set(false);
  btn.addEventListener("click", () => { open = !open; set(open); });
}

/** 이미지 파일/URL → 로드가 끝난 Image 객체 */
export function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("이미지를 불러오지 못했습니다."));
    img.src = src instanceof Blob ? URL.createObjectURL(src) : src;
  });
}

/**
 * 캔버스를 프레임 단위로 그려 서버에서 mp4 로 굽는다 (실시간 재생 불필요).
 * drawFrame(i, t) 는 i번째 프레임을 캔버스에 그리기만 하면 된다.
 */
export async function renderVideo({ canvas, frames, fps = 30, name = "video",
                                    drawFrame, onProgress, audioMvId, audioName }) {
  const s = await api("/api/frames/start", { name, fps });
  let pending = null;
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    drawFrame(i, i / fps);
    // toBlob 은 탭이 가려지면 콜백이 1초씩 밀린다 → 동기 방식으로 뽑는다
    const durl = canvas.toDataURL("image/jpeg", 0.92);
    if (pending) await pending;
    pending = fetch(`/api/frames/add?id=${s.id}&i=${i}&b64=1`, { method: "POST", body: durl });
    if (onProgress && i % 5 === 0) {
      const el = (Date.now() - t0) / 1000;
      onProgress(i, frames, i ? Math.round(el / i * (frames - i)) : 0);
    }
  }
  if (pending) await pending;
  const d = await api("/api/frames/finish",
                      { id: s.id, fps, mv_id: audioMvId, audio_name: audioName });
  while (true) {
    await new Promise(r => setTimeout(r, 800));
    const j = await (await fetch("/api/status/" + d.job)).json();
    if (j.state === "error") throw new Error(j.error || "변환 실패");
    if (onProgress) onProgress(frames, frames, 0, j.note, j.progress);
    if (j.state === "done") return j;
  }
}

/** 배경 이미지를 object-fit: cover 처럼 캔버스에 채운다 */
export function drawCover(ctx, img, W, H) {
  if (!img) return;
  const s = Math.max(W / img.width, H / img.height);
  const w = img.width * s, h = img.height * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}


/** 영상·이미지 크기 조절 막대 (1:1 / 맞춤 / 작게) */
export function addZoomBar(...els) {
  els = els.filter(Boolean);
  if (!els.length) return;
  const anchor = els[0];
  const bar = document.createElement("div");
  bar.className = "zoombar";
  bar.innerHTML = `
    <button data-z="native" class="on" type="button">1:1 원본 크기</button>
    <button data-z="fit" type="button">🔍 맞춤 확대</button>
    <button data-z="small" type="button">작게</button>
    <span class="hint" data-size style="margin-left:8px"></span>`;
  anchor.parentNode.insertBefore(bar, anchor);
  const apply = z => {
    els.forEach(el => {
      el.style.setProperty("margin-left", "auto");
      el.style.setProperty("margin-right", "auto");
      el.style.setProperty("height", "auto", "important");   // 비율은 항상 지킨다
      if (z === "fit") {
        el.style.setProperty("width", "100%", "important");
        el.style.setProperty("max-width", "100%", "important");
        el.style.removeProperty("max-height");
      } else if (z === "small") {
        el.style.setProperty("width", "320px", "important");
        el.style.setProperty("max-width", "320px", "important");
        el.style.removeProperty("max-height");
      } else {
        // 1:1 원본 크기 — 세로 영상(720×1280)이 화면 밖으로 나가지 않게 높이도 묶어 둔다
        el.style.setProperty("width", "auto", "important");
        el.style.setProperty("max-width", "100%", "important");
        el.style.setProperty("max-height", "72vh", "important");
      }
    });
  };

  /* 실제 해상도를 알려 준다 — 무엇을 보고 있는지 헷갈리지 않게 */
  const 크기표 = bar.querySelector("[data-size]");
  const 크기보이기 = () => {
    for (const el of els) {
      const w = el.videoWidth || el.naturalWidth, h = el.videoHeight || el.naturalHeight;
      if (w && h && el.style.display !== "none") {
        크기표.textContent = `${w}×${h}` + (h > w ? " 세로" : w > h ? " 가로" : " 정사각");
        return;
      }
    }
    크기표.textContent = "";
  };
  els.forEach(el => {
    el.addEventListener("loadedmetadata", 크기보이기);
    el.addEventListener("load", 크기보이기);
    el.addEventListener("error", () => { 크기표.textContent = "⚠ 못 읽음"; });
  });
  bar.querySelectorAll("button").forEach(b => b.addEventListener("click", ev => {
    ev.stopPropagation();
    bar.querySelectorAll("button").forEach(x => x.classList.remove("on"));
    b.classList.add("on");
    apply(b.dataset.z);
  }));
  els.forEach(el => { el._applyZoom = apply; });
  bar._apply = apply;
  apply("native");
}
window.CoreZoomBar = addZoomBar;
