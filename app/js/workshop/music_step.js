/* 🎵 음악 단계 — 배경 음악이 어디에 어떻게 깔리는지 보고 조정한다.
 *
 * 이야기들을 이어 붙인 전체 길이 위에 음악 띠를 그려, 어디서 시작하고
 * 어디서 잦아드는지를 눈으로 확인한다.
 * Suno 에 넣을 프롬프트도 이야기에서 자동으로 뽑아 준다.
 */
import { escapeHtml } from "../core.js";

export function mountMusicStep(el, S, { st, 보내기, refresh }) {
  const stories = S.열린것?.stories || [];
  const 순서 = (S.열린것?.timeline?.순서 || []).filter(sid => stories.some(s => s.sid === sid));
  const 줄 = 순서.length ? 순서.map(sid => stories.find(s => s.sid === sid)) : stories;
  const 사이 = S.열린것?.timeline?.사이 ?? 0.3;
  const 음악 = S.열린것?.timeline?.음악 || { 파일: "", 소리크기: 0.7, 여닫이: 1.5 };
  const 총초 = 줄.reduce((a, b) => a + (b.seconds || 0), 0) + Math.max(0, 줄.length - 1) * 사이;
  const 프롬 = [...new Set(줄.map(s => s.music_prompt).filter(Boolean))];

  el.innerHTML = `
    <div class="charRow" style="margin-top:12px; align-items:center">
      <b style="font-size:14px">🎵 배경 음악</b>
      <span class="hint">전체 ${Math.floor(총초 / 60)}분 ${Math.round(총초 % 60)}초 · ${줄.length}편</span>
    </div>

    <div class="grid" style="margin-top:10px">
      <div><label>음악 파일 <span class="hint">(올린 음악 이름)</span></label>
        <input id="muFile" value="${escapeHtml(음악.파일 || "")}" placeholder="포근한밤.mp3"></div>
      <div><label>소리 크기 <span class="hint" id="muVolLab">${(음악.소리크기 ?? 0.7).toFixed(2)}</span></label>
        <input id="muVol" type="range" min="0" max="1" step="0.05" value="${음악.소리크기 ?? 0.7}"></div>
      <div><label>여닫이 (초) <span class="hint">처음 커지고 끝에 잦아드는 시간</span></label>
        <input id="muFade" type="number" min="0" max="8" step="0.5" value="${음악.여닫이 ?? 1.5}"></div>
    </div>

    <div style="margin-top:14px">
      <div class="hint" style="margin-bottom:4px">깔리는 모습 — 이야기 위에 음악이 어떻게 얹히는지</div>
      <div id="muBar" style="position:relative; height:74px; background:#141219;
           border-radius:10px; overflow:hidden"></div>
    </div>

    <div style="margin-top:14px">
      <div class="charRow" style="align-items:center">
        <b style="font-size:14px">🎼 Suno 프롬프트</b>
        <span class="hint">— 이야기에서 뽑았습니다. 복사해서 Suno 에 넣고, 받은 파일을 음악으로 올리세요</span>
        <span style="flex:1"></span>
        <button class="ghost small" id="muCopy" type="button">📋 복사</button>
      </div>
      <textarea id="muPrompt" spellcheck="false" style="width:100%; height:82px; margin-top:6px;
        font-family:Consolas,monospace; font-size:12px; background:#141219; color:#e8e2d8;
        border-radius:8px; padding:8px">${escapeHtml(프롬.join("\n") ||
          "warm acoustic, gentle 90bpm, instrumental, children's storybook")}</textarea>
      <div class="hint" style="margin-top:4px">
        라이선스 없는 곡만 쓰세요 — Suno 로 직접 만든 곡이나 CC0 음악이 안전합니다.
      </div>
    </div>

    <div class="charRow" style="margin-top:12px; align-items:center">
      <button id="muSave">저장</button>
      <button class="ghost small" id="muPlay" type="button">▶ 들어 보기</button>
      <button class="ghost small" id="muStop" type="button">⏹</button>
      <span class="hint" id="muInfo"></span>
    </div>
    <audio id="muAudio" preload="none" style="display:none"></audio>`;

  /* 음악 띠 그리기 */
  const bar = el.querySelector("#muBar");
  function 띠그리기() {
    const 크기 = parseFloat(el.querySelector("#muVol").value);
    const 여닫 = parseFloat(el.querySelector("#muFade").value) || 0;
    let x = 0;
    const 조각 = 줄.map((s, i) => {
      const w = (s.seconds || 0) / Math.max(0.001, 총초) * 100;
      const left = x; x += w + (i < 줄.length - 1 ? 사이 / Math.max(0.001, 총초) * 100 : 0);
      return `<div title="${escapeHtml(s.name)} · ${(s.seconds || 0).toFixed(1)}초"
        style="position:absolute; left:${left}%; width:${w}%; top:6px; height:26px;
        background:#2f3a55; border-radius:5px; overflow:hidden; font-size:10px; color:#cfd6e6;
        padding:4px 5px; white-space:nowrap; text-overflow:ellipsis">${escapeHtml(s.name)}</div>`;
    }).join("");
    const 여닫폭 = Math.min(45, 여닫 / Math.max(0.001, 총초) * 100);
    bar.innerHTML = 조각 +
      `<div style="position:absolute; left:0; right:0; top:40px; height:28px;
        background:linear-gradient(90deg,
          rgba(124,58,237,0) 0%, rgba(124,58,237,${0.25 + 크기 * 0.55}) ${여닫폭}%,
          rgba(124,58,237,${0.25 + 크기 * 0.55}) ${100 - 여닫폭}%, rgba(124,58,237,0) 100%);
        border-radius:5px"></div>
      <div style="position:absolute; left:6px; top:46px; font-size:10px; color:#d9cdf5">
        🎵 ${escapeHtml(el.querySelector("#muFile").value || "(음악 없음)")} · 크기 ${크기.toFixed(2)}</div>`;
  }
  띠그리기();
  ["muVol", "muFade", "muFile"].forEach(id =>
    el.querySelector("#" + id).addEventListener("input", () => {
      el.querySelector("#muVolLab").textContent =
        parseFloat(el.querySelector("#muVol").value).toFixed(2);
      띠그리기();
    }));

  el.querySelector("#muCopy").addEventListener("click", async () => {
    const 글 = el.querySelector("#muPrompt").value;
    try { await navigator.clipboard.writeText(글); st("복사했습니다 — Suno 에 넣으세요.", "ok"); }
    catch { st(글); }
  });

  /* 실제로 들어 보기 — 정한 소리 크기와 여닫이를 그대로 흉내 낸다 */
  const 소리 = el.querySelector("#muAudio");
  let 여닫이타이머 = null;
  el.querySelector("#muPlay").addEventListener("click", async () => {
    const 파일 = el.querySelector("#muFile").value.trim();
    if (!파일) { st("먼저 음악 파일 이름을 적으세요.", "err"); return; }
    소리.src = "/api/audio/" + encodeURIComponent(파일);
    const 크기 = parseFloat(el.querySelector("#muVol").value);
    const 여닫 = parseFloat(el.querySelector("#muFade").value) || 0;
    소리.volume = 여닫 > 0 ? 0 : 크기;
    try { await 소리.play(); } catch (e) {
      el.querySelector("#muInfo").textContent = "⚠ 이 이름의 음악이 없습니다: " + 파일;
      return;
    }
    el.querySelector("#muInfo").textContent = `▶ ${파일} · 크기 ${크기.toFixed(2)} · 여닫이 ${여닫}초`;
    clearTimeout(여닫이타이머);
    if (여닫 > 0) {                      // 처음 커지는 것을 흉내 낸다
      const 걸음 = 40, 총 = Math.max(1, Math.round(여닫 * 1000 / 걸음));
      let i = 0;
      const 올리기 = setInterval(() => {
        i++; 소리.volume = Math.min(크기, 크기 * i / 총);
        if (i >= 총) clearInterval(올리기);
      }, 걸음);
    }
  });
  el.querySelector("#muStop").addEventListener("click", () => {
    소리.pause(); 소리.currentTime = 0;
    el.querySelector("#muInfo").textContent = "";
  });
  el.querySelector("#muVol").addEventListener("input", () => {
    if (!소리.paused) 소리.volume = parseFloat(el.querySelector("#muVol").value);
  });

  el.querySelector("#muSave").addEventListener("click", async () => {
    const r = await 보내기("/api/project/story/order", {
      id: S.열린것.id,
      순서: 순서.length ? 순서 : 줄.map(s => s.sid),
      사이,
      음악: { 파일: el.querySelector("#muFile").value.trim(),
              소리크기: parseFloat(el.querySelector("#muVol").value),
              여닫이: parseFloat(el.querySelector("#muFade").value) || 0 },
    });
    if (r) { st("음악 설정을 저장했습니다.", "ok"); await refresh(); }
  });
}
