/* 📥 한 번에 올리기 — 파일 여러 개를 끌어다 놓고 시리즈까지 한 번에 정한다.
 *
 * 지금까지는 캐릭터 한 장, 배경 한 장씩 올리고 나서 하나하나 시리즈를 바꿔야 했다.
 * 콘티에서 자른 그림이 스무 장이면 그것만으로 하루가 간다.
 *
 * 여기서 하는 일
 *   ① 여러 파일을 한꺼번에 받는다 (끌어다 놓기 · 고르기)
 *   ② 파일 종류를 보고 **캐릭터/배경/음악**을 알아서 나눈다 (바꿀 수 있다)
 *   ③ 이름은 파일 이름에서 딴다 (겹치면 서버가 (1)(2) 를 붙인다)
 *   ④ 고른 **시리즈에 곧바로 넣는다**
 *   ⑤ 하나가 실패해도 나머지는 계속 올린다 — 무엇이 왜 실패했는지 남긴다
 *
 *   import { openBulkUpload } from "../ui/bulk_upload.js";
 *   openBulkUpload({ group: "gp_…", 끝나면: () => 다시그리기() });
 */
import { escapeHtml } from "../core.js";
import { openModal } from "./modal.js";
import { 시리즈읽기, 시리즈목록 } from "./group_pick.js";
import { library } from "../story/assets.js";
import { busy } from "./busy.js";

const 그림확장자 = /\.(png|jpe?g|webp|gif|bmp)$/i;
const 소리확장자 = /\.(mp3|wav|ogg|m4a|flac)$/i;

/** 파일 이름·종류를 보고 무엇으로 넣을지 짐작한다 */
function 종류짐작(file) {
  const n = file.name || "";
  if (소리확장자.test(n) || (file.type || "").startsWith("audio")) return "음악";
  if (!그림확장자.test(n) && !(file.type || "").startsWith("image")) return null;
  // 이름에 힌트가 있으면 따른다 — 콘티에서 자른 것은 대개 이렇게 적혀 있다
  if (/배경|bg|scene|장면|무대/i.test(n)) return "배경";
  if (/캐릭|char|인물|주인공/i.test(n)) return "캐릭터";
  return "배경";                     // 그림은 배경이 더 흔하다 (캐릭터는 배경을 지워야 해서 손이 더 간다)
}

/** 이름 = 파일 이름에서 확장자와 앞뒤 공백을 뺀 것 */
const 이름짓기 = f => (f.name || "파일").replace(/\.[^.]+$/, "").trim() || "파일";

export function openBulkUpload(opt = {}) {
  let 목록 = [];                     // {file, 종류, 이름, 상태, 까닭}
  let 갈시리즈 = opt.group ?? (localStorage.getItem("ws그룹") || "");
  let 도는중 = false;

  const 창 = openModal({
    제목: "📥 한 번에 올리기",
    너비: "min(900px, 96vw)",
    안내: "파일을 끌어다 놓거나 골라 주세요. 그림·소리를 섞어 놓아도 알아서 나눕니다. " +
          "이름은 <b>파일 이름</b>에서 땁니다.",
    내용: `<div id="buDrop" style="border:2px dashed #3a3446; border-radius:14px; padding:22px;
             text-align:center; cursor:pointer; background:#161420">
        <div style="font-size:15px">여기에 파일을 끌어다 놓으세요</div>
        <div class="hint" style="margin-top:6px">또는 눌러서 고르기 · 그림(png·jpg·webp) · 소리(mp3·wav)</div>
        <input type="file" id="buFile" multiple accept="image/*,audio/*" style="display:none">
      </div>

      <div class="charRow" style="align-items:center; gap:8px; margin-top:12px; flex-wrap:wrap">
        <span class="hint">📚 넣을 시리즈</span>
        <select id="buGroup" style="max-width:210px"></select>
        <span style="flex:1"></span>
        <span class="hint">한꺼번에 종류 바꾸기</span>
        <button class="ghost small" type="button" data-모두="캐릭터">🐕 캐릭터</button>
        <button class="ghost small" type="button" data-모두="배경">🏞 배경</button>
      </div>

      <div class="hint" id="buInfo" style="margin-top:10px">아직 고른 파일이 없습니다.</div>
      <div id="buList" class="vlist" style="margin-top:6px; max-height:340px; overflow-y:auto"></div>`,
    단추: [{ 글: "⬆ 모두 올리기", 강조: true, 할일: () => 올리기() }],
  });

  const $ = id => document.getElementById(id);
  const 알림 = 글 => { const el = $("buInfo"); if (el) el.innerHTML = 글; };

  /* ── 시리즈 고르개 ── */
  (async () => {
    await 시리즈읽기(true);
    $("buGroup").innerHTML = '<option value="">— 공용 (모든 시리즈에서 씀)</option>' +
      시리즈목록().map(g => `<option value="${g.id}" ${g.id === 갈시리즈 ? "selected" : ""}
        >${escapeHtml(g.name)}</option>`).join("") +
      '<option value="__new">＋ 새 시리즈…</option>';
  })();

  $("buGroup").addEventListener("change", async () => {
    if ($("buGroup").value !== "__new") { 갈시리즈 = $("buGroup").value; return; }
    const 이름 = prompt("새 시리즈 이름", "새 시리즈");
    if (!이름) { $("buGroup").value = 갈시리즈; return; }
    try {
      const r = await (await fetch("/api/group/save", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: 이름 }) })).json();
      if (!r.id) throw new Error(r.error || "못 만들었습니다");
      await 시리즈읽기(true);
      갈시리즈 = r.id;
      $("buGroup").innerHTML = '<option value="">— 공용 (모든 시리즈에서 씀)</option>' +
        시리즈목록().map(g => `<option value="${g.id}" ${g.id === 갈시리즈 ? "selected" : ""}
          >${escapeHtml(g.name)}</option>`).join("") +
        '<option value="__new">＋ 새 시리즈…</option>';
    } catch (e) { alert("⚠ " + e.message); $("buGroup").value = 갈시리즈; }
  });

  /* ── 파일 받기 ── */
  function 파일더하기(files) {
    for (const f of files) {
      const 종류 = 종류짐작(f);
      if (!종류) { 목록.push({ file: f, 종류: null, 이름: 이름짓기(f),
                               상태: "못 씀", 까닭: "그림도 소리도 아닙니다" }); continue; }
      목록.push({ file: f, 종류, 이름: 이름짓기(f), 상태: "기다림", 까닭: "" });
    }
    그리기();
  }
  $("buDrop").addEventListener("click", () => $("buFile").click());
  $("buFile").addEventListener("change", e => { 파일더하기([...e.target.files]); e.target.value = ""; });
  ["dragenter", "dragover"].forEach(k => $("buDrop").addEventListener(k, e => {
    e.preventDefault(); $("buDrop").style.borderColor = "var(--accent,#6c8cff)";
  }));
  ["dragleave", "drop"].forEach(k => $("buDrop").addEventListener(k, e => {
    e.preventDefault(); $("buDrop").style.borderColor = "#3a3446";
  }));
  $("buDrop").addEventListener("drop", e => 파일더하기([...(e.dataTransfer?.files || [])]));

  document.querySelectorAll("[data-모두]").forEach(b => b.addEventListener("click", () => {
    목록.forEach(x => { if (x.종류 && x.종류 !== "음악") x.종류 = b.dataset.모두; });
    그리기();
  }));

  /* ── 목록 그리기 ── */
  const 표시 = { 기다림: ["대기", "#8a8290"], 올리는중: ["올리는 중…", "#6cc7ff"],
                 완료: ["✅ 올림", "#7bd88f"], 실패: ["⚠ 실패", "#ff7a7a"],
                 "못 씀": ["✕ 못 씀", "#ff7a7a"] };
  function 그리기() {
    const 셈 = {};
    목록.forEach(x => { 셈[x.종류 || "못 씀"] = (셈[x.종류 || "못 씀"] || 0) + 1; });
    알림(목록.length
      ? `파일 ${목록.length}개 — ` + Object.entries(셈).map(([k, v]) => `${k} ${v}`).join(" · ")
      : "아직 고른 파일이 없습니다.");

    $("buList").innerHTML = 목록.map((x, i) => {
      const [글, 색] = 표시[x.상태] || 표시["기다림"];
      return `<div class="vitem" style="gap:8px; padding:5px 8px">
        <span class="vname" style="flex:1; font-size:12px; overflow:hidden;
              text-overflow:ellipsis; white-space:nowrap">${escapeHtml(x.file.name)}</span>
        ${x.종류 ? `<select data-종류="${i}" style="max-width:100px; padding:2px 6px; font-size:11px"
          ${x.상태 === "완료" ? "disabled" : ""}>
          ${["캐릭터", "배경", "음악"].map(k =>
            `<option ${k === x.종류 ? "selected" : ""}>${k}</option>`).join("")}
        </select>` : '<span class="vinfo" style="width:100px"></span>'}
        <input data-이름="${i}" value="${escapeHtml(x.이름)}" ${x.상태 === "완료" ? "disabled" : ""}
               style="width:180px; padding:2px 7px; font-size:11px">
        <span class="vinfo" style="width:120px; font-size:11px; color:${색}"
              title="${escapeHtml(x.까닭 || "")}">${글}</span>
        ${x.상태 === "완료" ? "" :
          `<button class="ghost small" type="button" data-빼기="${i}" style="padding:0 6px">✕</button>`}
      </div>`;
    }).join("") || '<div class="hint" style="padding:10px">위에 파일을 놓아 주세요.</div>';

    $("buList").querySelectorAll("[data-종류]").forEach(s =>
      s.addEventListener("change", () => { 목록[+s.dataset.종류].종류 = s.value; }));
    $("buList").querySelectorAll("[data-이름]").forEach(inp =>
      inp.addEventListener("input", () => { 목록[+inp.dataset.이름].이름 = inp.value; }));
    $("buList").querySelectorAll("[data-빼기]").forEach(b =>
      b.addEventListener("click", () => { 목록.splice(+b.dataset.빼기, 1); 그리기(); }));
  }
  그리기();

  /* ── 하나 올리기 ──
     종류마다 창구가 달라 여기서 갈라 준다. 캐릭터는 그림을 데이터로 바꿔 보낸다. */
  async function 하나올리기(x) {
    const q = new URLSearchParams();
    if (갈시리즈) q.set("group", 갈시리즈);
    if (x.이름) q.set("name", x.이름);

    if (x.종류 === "배경") {
      const fd = new FormData();
      fd.append("image", x.file, x.file.name);
      const r = await (await fetch("/api/bg/save?" + q, { method: "POST", body: fd })).json();
      if (r.error) throw new Error(r.error);
      return r.item?.name;
    }
    if (x.종류 === "음악") {
      const fd = new FormData();
      fd.append("audio", x.file, x.file.name);
      const r = await (await fetch("/api/upload_audio", { method: "POST", body: fd })).json();
      if (r.error) throw new Error(r.error);
      // 음악은 올린 뒤에 이름·시리즈를 적어 준다 (올리기 창구가 파일만 받는다)
      const 파일 = r.filename || r.name || x.file.name;
      await fetch("/api/audio/update", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 파일, name: x.이름, group: 갈시리즈 }) });
      return x.이름;
    }
    // 캐릭터 — 그림 한 장을 'front' 포즈로 넣는다 (포즈는 나중에 더할 수 있다)
    const durl = await 파일을데이터로(x.file);
    const r = await (await fetch("/api/char/save", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: x.이름, group: 갈시리즈,
                             poses: { front: durl } }) })).json();
    if (r.error) throw new Error(r.error);
    return r.item?.name;
  }

  async function 올리기() {
    if (도는중) return;
    const 할것 = 목록.filter(x => x.종류 && x.상태 !== "완료");
    if (!할것.length) { 알림("올릴 것이 없습니다."); return; }
    도는중 = true;
    const 일 = busy.시작(`⬆ ${할것.length}개 올리는 중`, {
      뒤로가능: true, 안내: "하나가 실패해도 나머지는 계속 올립니다.", 진행: 0,
    });
    let 됨 = 0, 안됨 = 0;
    for (let i = 0; i < 할것.length; i++) {
      const x = 할것[i];
      x.상태 = "올리는중"; 그리기();
      일.제목바꾸기(`⬆ ${x.이름} (${i + 1}/${할것.length})`);
      try {
        const 이름 = await 하나올리기(x);
        x.상태 = "완료"; x.이름 = 이름 || x.이름; 됨++;
      } catch (e) { x.상태 = "실패"; x.까닭 = e.message; 안됨++; }
      일.진행((i + 1) / 할것.length * 100, `${됨}개 올림${안됨 ? ` · ${안됨}개 실패` : ""}`);
      그리기();
    }
    일.끝();
    도는중 = false;
    library.clear();
    window.dispatchEvent(new Event("자산바뀜"));
    opt.끝나면?.({ 됨, 안됨 });
    알림(`✅ ${됨}개를 올렸습니다.` +
         (안됨 ? ` <span style="color:#ff7a7a">${안됨}개는 실패 — 목록에서 까닭을 보세요.</span>` : ""));
  }

  return 창;
}

function 파일을데이터로(f) {
  return new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => no(new Error("파일을 못 읽었습니다"));
    r.readAsDataURL(f);
  });
}
