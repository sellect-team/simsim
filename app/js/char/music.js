/* 🎵 음악 자산 — 배경 음악을 캐릭터·배경과 똑같이 다룬다.
 *
 * 음악은 지금까지 '그냥 파일' 이었다. 이름을 붙이고 시리즈에 묶고 태그를 달아야
 * 수십 편을 만들 때 "이 시리즈의 잔잔한 곡" 을 찾을 수 있다.
 * 재생은 브라우저 <audio> 하나로 끝낸다 — 새 라이브러리를 들이지 않는다.
 */
import { $, escapeHtml, statusBox, upload } from "../core.js";
import { openModal } from "../ui/modal.js";
import { 시리즈고르개, 붙이기 as 시리즈붙이기, 시리즈읽기,
         시리즈로가르기, 가름머리 } from "../ui/group_pick.js";

let 항목들 = [];
let 시리즈들 = [];
let 찾는말 = "";
let 지금소리 = null;                     // 한 번에 한 곡만 흐르게

const 시간글 = s => {
  s = Math.round(s || 0);
  return s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "—";
};
const 크기글 = b => (b > 1048576 ? (b / 1048576).toFixed(1) + "MB" : Math.round(b / 1024) + "KB");

export async function mount() {
  const st = statusBox($("muStatus"));

  $("muPick").addEventListener("click", () => $("muFile").click());
  $("muFile").addEventListener("change", async e => {
    const files = [...e.target.files];
    if (!files.length) return;
    try {
      for (let i = 0; i < files.length; i++) {
        st(`올리는 중… ${i + 1}/${files.length}`);
        await upload("/api/upload_audio", files[i], "audio");
      }
      await 읽기();
      st(`✅ 음악 ${files.length}개를 저장했습니다.`, "ok");
      window.dispatchEvent(new Event("자산바뀜"));
    } catch (err) { st("⚠ " + err.message, "err"); }
    e.target.value = "";
  });
  $("muFind").addEventListener("input", () => { 찾는말 = $("muFind").value.trim(); 그리기(); });

  async function 읽기() {
    const 그룹 = localStorage.getItem("ws그룹") || "";
    const q = 그룹 ? `?group=${encodeURIComponent(그룹)}` : "";
    try { 항목들 = (await (await fetch("/api/audio/list" + q)).json()).items || []; }
    catch { 항목들 = []; }
    시리즈들 = await 시리즈읽기(true);
    그리기();
  }

  /** 한 곡 듣기 — 이미 흐르던 것은 멈춘다 */
  function 듣기(x, 단추) {
    if (지금소리) { 지금소리.pause(); 지금소리 = null; }
    document.querySelectorAll("#muList .muPlay").forEach(b => { b.textContent = "▶"; });
    if (단추.dataset.흐름 === "1") { 단추.dataset.흐름 = "0"; return; }
    document.querySelectorAll("#muList .muPlay").forEach(b => { b.dataset.흐름 = "0"; });
    지금소리 = new Audio("/api/audio/" + encodeURIComponent(x.file));
    지금소리.play().then(() => { 단추.textContent = "⏸"; 단추.dataset.흐름 = "1"; })
      .catch(e => st("⚠ 못 틀었습니다: " + e.message, "err"));
    지금소리.addEventListener("ended", () => { 단추.textContent = "▶"; 단추.dataset.흐름 = "0"; });
  }

  /** 이름·태그·시리즈 고치기 */
  function 고치기(x) {
    openModal({
      제목: `🎵 ${escapeHtml(x.name)}`,
      너비: "min(560px, 94vw)", 높이: "auto",
      안내: `${escapeHtml(x.file)} · ${시간글(x.초)} · ${크기글(x.크기)}`,
      내용: `<div class="vlist" style="gap:10px">
        <label class="hint">이름 — 대본에서 부를 이름입니다
          <input id="muName" value="${escapeHtml(x.name)}" style="width:100%; margin-top:4px"></label>
        <label class="hint">태그 — 쉼표로 나눠 적으세요
          <input id="muTags" value="${escapeHtml((x.tags || []).join(", "))}"
                 placeholder="잔잔, 일상" style="width:100%; margin-top:4px"></label>
        <label class="hint">시리즈 — 비우면 공용(모든 시리즈에서 씁니다)
          <select id="muGroup" style="width:100%; margin-top:4px">
            <option value="">— 공용</option>
            ${시리즈들.map(g => `<option value="${g.id}" ${g.id === x.group ? "selected" : ""}
              >${escapeHtml(g.name)}</option>`).join("")}
          </select></label>
        <div class="hint">대본 맨 위에 이렇게 적습니다:
          <code>음악: ${escapeHtml(x.name)}</code>
          <span style="opacity:.7">(소리크기·여닫이도 같은 줄에 —
          <code>소리크기:0.7 여닫이:1.5초</code>)</span></div>
      </div>`,
      단추: [{ 글: "저장", 강조: true, 할일: async 창 => {
        try {
          await fetch("/api/audio/update", { method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: x.id,
              name: document.getElementById("muName").value,
              tags: document.getElementById("muTags").value,
              group: document.getElementById("muGroup").value }) });
          창.닫기(); await 읽기(); st("✅ 저장했습니다.", "ok");
          window.dispatchEvent(new Event("자산바뀜"));
        } catch (e) { st("⚠ " + e.message, "err"); }
      } }],
    });
  }

  function 그리기() {
    const 말 = 찾는말.toLowerCase();
    const 보일것 = 말 ? 항목들.filter(x =>
      x.name.toLowerCase().includes(말) ||
      (x.tags || []).some(t => t.toLowerCase().includes(말))) : 항목들;

    const wrap = $("muList");
    if (!항목들.length) {
      wrap.innerHTML = '<div class="hint" style="padding:12px">저장된 음악이 없습니다. ' +
        'Suno 같은 데서 뽑은 곡을 위 버튼으로 올리세요.</div>';
      return;
    }
    /* 시리즈를 골랐으면 갈라 놓는다 */
    const 가른것 = 시리즈로가르기(보일것);
    const 줄하나 = (x, i) =>
      `<div class="vitem" style="gap:8px; padding:6px 8px">
        <button class="ghost small muPlay" type="button" data-줄="${i}" data-흐름="0"
                style="width:34px">▶</button>
        <span class="vname" style="flex:1; font-size:13px">🎵 ${escapeHtml(x.name)}</span>
        <span class="vinfo" style="width:60px; font-size:11px">${시간글(x.초)}</span>
        <span class="vinfo" style="width:140px; font-size:11px">${escapeHtml((x.tags || []).join(", ")) || "—"}</span>
        ${시리즈고르개("음악", x.id, x.group)}
        <button class="ghost small muEdit" type="button" data-줄="${i}">고치기</button>
        <button class="danger small muDel" type="button" data-줄="${i}">삭제</button>
      </div>`;

    /* 줄 번호는 언제나 `보일것` 기준이라, 갈라 놓아도 누르는 것이 어긋나지 않는다 */
    const 무리그리기 = 무리 => 무리.map(x => 줄하나(x, 보일것.indexOf(x))).join("");
    wrap.innerHTML = !보일것.length
      ? '<div class="hint" style="padding:12px">찾는 음악이 없습니다.</div>'
      : 가른것.가름
        ? 가름머리(`📚 ${가른것.이름} 전용`, 가른것.전용.length, "#a78bfa", "이 시리즈에서만 씁니다") +
          (가른것.전용.length ? 무리그리기(가른것.전용)
            : '<div class="hint" style="padding:4px 10px; font-size:11px">이 시리즈만 쓰는 음악이 없습니다</div>') +
          가름머리("🌐 공용", 가른것.공용.length, "#7bd88f", "모든 시리즈가 함께 씁니다") +
          무리그리기(가른것.공용)
        : 무리그리기(보일것);

    wrap.querySelectorAll(".muPlay").forEach(b =>
      b.addEventListener("click", () => 듣기(보일것[+b.dataset.줄], b)));
    wrap.querySelectorAll(".muEdit").forEach(b =>
      b.addEventListener("click", () => 고치기(보일것[+b.dataset.줄])));
    wrap.querySelectorAll(".muDel").forEach(b =>
      b.addEventListener("click", async () => {
        const x = 보일것[+b.dataset.줄];
        if (!confirm(`'${x.name}' 음악을 삭제할까요?\n(파일이 지워집니다)`)) return;
        try {
          await fetch("/api/audio/delete", { method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: x.id }) });
          await 읽기(); st("삭제했습니다.");
          window.dispatchEvent(new Event("자산바뀜"));
        } catch (e) { st("⚠ " + e.message, "err"); }
      }));
    시리즈붙이기(wrap, { 바뀜: 읽기, 알림: st });
  }

  window.addEventListener("시리즈바뀜", 읽기);
  await 읽기();
}
