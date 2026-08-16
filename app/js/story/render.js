/* 🎬 굽기 — 대본(무대)을 진짜 mp4 로 만든다.
 *
 * 실시간 재생을 녹화하는 게 아니라, 프레임을 하나씩 '그려서' 서버로 보낸다.
 * 그래서 컴퓨터가 느려도 결과가 항상 같고, 화면을 보고 있지 않아도 된다.
 * (게임 엔진의 Movie Maker 모드와 같은 방식)
 *
 * 30초 영상 = 900장. 한 장에 20ms 면 20초 안에 끝난다. GPU 는 쓰지 않는다.
 */

/** 캔버스 → 서버로 한 장 (숨은 탭에서도 느려지지 않게 동기 방식인 toDataURL 을 쓴다) */
async function sendFrame(sid, i, canvas, quality) {
  // quality: "png"(무손실) 또는 0~1 숫자(jpeg 화질). 안 주면 0.92.
  const q = typeof quality === "number" ? Math.max(0.3, Math.min(1, quality)) : 0.92;
  const url = quality === "png" ? canvas.toDataURL("image/png")
                                : canvas.toDataURL("image/jpeg", q);
  await fetch(`/api/frames/add?id=${sid}&i=${i}&b64=1`, { method: "POST", body: url });
}

/**
 * 무대를 영상으로 굽는다.
 * @param stage Stage
 * @param opt {이름, 가로, 세로, fps, 음악, 초당품질}
 * @param onProgress ({done, total, percent}) => void
 * @returns {job, 프레임수, 초}
 */
/**
 * 이 대본이 만들 영상의 실제 크기. 미리보기도 이걸 그대로 써야
 * 화면에서 본 것과 구운 것이 같다.
 * @returns {{가로, 세로, 비율, 이름}}
 */
export function videoSize(stage, opt = {}) {
  const 글 = String(stage?.doc?.meta?.비율 || opt.비율 || "9:16");
  const [a, b] = 글.split(":").map(Number);
  const 비율 = (a > 0 && b > 0) ? a / b : 9 / 16;

  let 가로, 세로;
  if (opt.가로 && opt.세로) {                    // 둘 다 콕 집어 준 경우만 그대로
    가로 = opt.가로; 세로 = opt.세로;
  } else {
    // 긴 변을 기준으로 잡는다. 그래야 세로 영상은 720×1280,
    // 가로 영상은 1280×720 처럼 흔히 쓰는 크기가 나온다.
    // (예전에는 높이를 1280 으로 못 박아서 16:9 가 2276×1280 이 됐다)
    const 긴변 = Math.round(opt.긴변 || opt.세로 || opt.가로 || 1280);
    if (비율 >= 1) { 가로 = 긴변; 세로 = 긴변 / 비율; }
    else { 세로 = 긴변; 가로 = 긴변 * 비율; }
  }
  가로 = Math.round(가로); 세로 = Math.round(세로);
  // h264 는 가로·세로가 짝수여야 한다
  return { 가로: 가로 + (가로 % 2), 세로: 세로 + (세로 % 2), 비율, 이름: 글 };
}

export async function bakeVideo(stage, opt = {}, onProgress = null) {
  const fps = opt.fps || 30;
  const { 가로: W, 세로: H } = videoSize(stage, opt);
  const seconds = stage.seconds;
  const total = Math.max(1, Math.round(seconds * fps));

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false });
  const box = { x: 0, y: 0, w: W, h: H };

  const started = await (await fetch("/api/frames/start", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: opt.이름 || stage.doc?.meta?.제목 || "story", fps }),
  })).json();
  if (!started.id) throw new Error("굽기 세션을 못 열었습니다.");

  for (let i = 0; i < total; i++) {
    const t = i / fps;
    ctx.fillStyle = opt.바탕 || "#ffffff";
    ctx.fillRect(0, 0, W, H);
    stage.drawAt(ctx, box, t);
    await sendFrame(started.id, i, canvas, opt.품질 ?? opt.화질);
    if (onProgress && (i % 5 === 0 || i === total - 1))
      onProgress({ done: i + 1, total, percent: Math.round((i + 1) / total * 100) });
  }

  // 대본이 지시한 효과음을 시각과 함께 넘긴다 (서버가 음악 위에 얹어 준다)
  const sfx = (stage.soundsBetween ? stage.soundsBetween(0, seconds + 1) : [])
    .map(s => ({ name: s.name, at: s.at }));
  const fin = await (await fetch("/api/frames/finish", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: started.id, fps, seconds,
                           audio: opt.음악 || stage.doc?.meta?.음악 || null, sfx,
                           music_gain: opt.음악크기, music_fade: opt.음악여닫이 }),
  })).json();
  return { job: fin.job, 프레임수: total, 초: seconds, 가로: W, 세로: H };
}

/** 굽기가 끝날 때까지 지켜본다 */
export async function waitJob(job, onProgress = null, everyMs = 1000) {
  for (;;) {
    const st = await (await fetch(`/api/status/${job}`)).json();
    if (onProgress) onProgress(st);
    if (st.state === "done" || st.state === "error") return st;
    await new Promise(r => setTimeout(r, everyMs));
  }
}

/**
 * 대본 여러 개를 줄 세워 밤새 굽는다 (수백 개를 만들 때 쓰는 방식).
 * @param jobs [{stage, opt}]
 */
export async function bakeMany(jobs, onEach = null) {
  const results = [];
  for (let i = 0; i < jobs.length; i++) {
    const { stage, opt } = jobs[i];
    try {
      const r = await bakeVideo(stage, opt, p =>
        onEach && onEach({ 순번: i + 1, 전체: jobs.length, 이름: opt?.이름, ...p }));
      const done = await waitJob(r.job);
      results.push({ 이름: opt?.이름, ok: done.state === "done", ...done });
    } catch (e) {
      results.push({ 이름: opt?.이름, ok: false, error: String(e.message || e) });
    }
  }
  return results;
}
