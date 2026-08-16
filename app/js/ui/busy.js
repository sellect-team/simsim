/* ⏳ 작업 중 표시 — 무엇이 돌고 있는지 화면 한가운데에 크게 알린다.
 *
 * 굽기는 몇십 초가 걸린다. 아무 표시가 없으면 멈춘 줄 알고 다시 누르게 되고,
 * 그러면 같은 일이 두 번 돌아 더 느려진다.
 *
 * 두 가지로 쓴다.
 *   앞에서 도는 일 (굽기·저장·묶기)   — 화면을 덮어 못 누르게 하고 진행률을 보여 준다
 *   뒤에서 돌려도 되는 일             — [뒤에서 돌리기] 를 누르면 덮개만 걷고 계속 돈다
 *                                       (오른쪽 아래에 작은 표시로 남는다)
 *
 *   import { busy } from "../ui/busy.js";
 *   const 일 = busy.시작("🔥 굽는 중", { 뒤로가능: true, 멈추기: () => queue.stop() });
 *   일.진행(37, "12/30장");
 *   일.끝("완성");                    // 또는 일.실패("…")
 *
 *   await busy.감싸기("💾 저장 중", async 일 => { … });   // 끝나면 저절로 닫힌다
 */

const 최소보임 = 350;         // 눈에 안 보이게 스쳐 지나가면 오히려 어수선하다

class Busy {
  constructor() {
    this.덮개 = null;
    this.작은것 = null;
    this.지금 = null;
    this.센것 = 0;
  }

  _만들기() {
    if (this.덮개) return;
    const d = document.createElement("div");
    d.id = "uiBusy";
    d.style.cssText = `position:fixed; inset:0; z-index:600; display:none;
      align-items:center; justify-content:center; background:rgba(8,7,12,0.72);
      backdrop-filter:blur(2px)`;
    d.innerHTML = `
      <div style="background:#17151d; border-radius:18px; padding:26px 30px; min-width:330px;
                  max-width:min(520px,92vw); box-shadow:0 20px 60px rgba(0,0,0,.6);
                  text-align:center">
        <div style="display:flex; align-items:center; justify-content:center; gap:12px">
          <span id="uiBusySpin" style="width:26px; height:26px; border-radius:50%;
                border:3px solid #332e40; border-top-color:var(--accent,#6c8cff);
                animation:uiBusySpin .8s linear infinite; flex:none"></span>
          <b id="uiBusyTitle" style="font-size:17px"></b>
        </div>
        <div id="uiBusyNote" class="hint" style="margin-top:10px; min-height:18px"></div>
        <div style="height:9px; background:#241f2e; border-radius:5px; overflow:hidden; margin-top:14px">
          <div id="uiBusyBar" style="height:100%; width:0%; border-radius:5px;
               background:linear-gradient(90deg,#6c8cff,#a78bfa); transition:width .25s"></div>
        </div>
        <div id="uiBusyPct" class="hint" style="margin-top:6px; font-size:12px"></div>
        <div class="charRow" style="justify-content:center; gap:8px; margin-top:16px">
          <button type="button" class="ghost small" id="uiBusyBg" style="display:none">
            🡇 뒤에서 돌리기</button>
          <button type="button" class="danger small" id="uiBusyStop" style="display:none">
            ⏹ 멈추기</button>
        </div>
      </div>`;
    document.body.appendChild(d);

    if (!document.getElementById("uiBusyCss")) {
      const s = document.createElement("style");
      s.id = "uiBusyCss";
      s.textContent = "@keyframes uiBusySpin{to{transform:rotate(360deg)}}";
      document.head.appendChild(s);
    }

    // 작은 표시 — 뒤로 보냈을 때 오른쪽 아래에 남는다
    const m = document.createElement("div");
    m.id = "uiBusyMini";
    m.style.cssText = `position:fixed; right:16px; bottom:16px; z-index:590; display:none;
      align-items:center; gap:9px; background:#17151d; border-radius:12px; padding:9px 13px;
      box-shadow:0 8px 24px rgba(0,0,0,.5); cursor:pointer; font-size:12px`;
    m.innerHTML = `<span style="width:15px; height:15px; border-radius:50%; flex:none;
        border:2px solid #332e40; border-top-color:var(--accent,#6c8cff);
        animation:uiBusySpin .8s linear infinite"></span>
      <span id="uiBusyMiniText"></span>`;
    m.addEventListener("click", () => { if (this.지금) this._덮기(true); });
    document.body.appendChild(m);

    this.덮개 = d;
    this.작은것 = m;
    document.getElementById("uiBusyBg").addEventListener("click", () => this._덮기(false));
    document.getElementById("uiBusyStop").addEventListener("click", () => {
      const 일 = this.지금;
      if (일?.멈추기) { 일.멈추기(); this.글쓰기("멈추는 중…"); }
    });
  }

  _덮기(보일까) {
    if (!this.덮개) return;
    this.덮개.style.display = 보일까 ? "flex" : "none";
    this.작은것.style.display = 보일까 || !this.지금 ? "none" : "flex";
  }

  글쓰기(글) {
    const el = document.getElementById("uiBusyNote");
    if (el) el.textContent = 글 || "";
  }

  /** 일 하나 시작. 돌려받은 것으로 진행률을 알리고 끝낸다. */
  시작(제목, opt = {}) {
    this._만들기();
    const 나 = {
      제목, 시작한때: performance.now(), 멈추기: opt.멈추기 || null, 살았나: true,
    };
    this.지금 = 나;
    document.getElementById("uiBusyTitle").textContent = 제목;
    document.getElementById("uiBusyBg").style.display = opt.뒤로가능 ? "" : "none";
    document.getElementById("uiBusyStop").style.display = opt.멈추기 ? "" : "none";
    document.getElementById("uiBusyMiniText").textContent = 제목;
    this.글쓰기(opt.안내 || "");
    this._막대(opt.진행 ?? null);
    this._덮기(true);

    나.진행 = (퍼센트, 글) => {
      if (!나.살았나) return;
      this._막대(퍼센트);
      if (글 != null) this.글쓰기(글);
      const mt = document.getElementById("uiBusyMiniText");
      if (mt) mt.textContent = 퍼센트 == null ? 제목 : `${제목} ${Math.round(퍼센트)}%`;
    };
    나.제목바꾸기 = 글 => {
      나.제목 = 글;
      const el = document.getElementById("uiBusyTitle");
      if (el) el.textContent = 글;
    };
    나.끝 = () => this._끝내기(나);
    나.실패 = 까닭 => { this.글쓰기("⚠ " + (까닭 || "실패")); this._끝내기(나, 900); };
    return 나;
  }

  _막대(퍼센트) {
    const bar = document.getElementById("uiBusyBar");
    const pct = document.getElementById("uiBusyPct");
    if (!bar) return;
    if (퍼센트 == null) {
      // 얼마나 걸릴지 모를 때 — 왔다 갔다 하는 막대
      bar.style.width = "38%";
      bar.style.animation = "uiBusySlide 1.4s ease-in-out infinite alternate";
      if (!document.getElementById("uiBusySlideCss")) {
        const s = document.createElement("style");
        s.id = "uiBusySlideCss";
        s.textContent = "@keyframes uiBusySlide{from{margin-left:0}to{margin-left:62%}}";
        document.head.appendChild(s);
      }
      if (pct) pct.textContent = "";
    } else {
      bar.style.animation = "none";
      bar.style.marginLeft = "0";
      bar.style.width = Math.max(0, Math.min(100, 퍼센트)) + "%";
      if (pct) pct.textContent = Math.round(퍼센트) + "%";
    }
  }

  _끝내기(나, 늦추기 = 0) {
    if (!나.살았나) return;
    나.살았나 = false;
    if (this.지금 !== 나) return;              // 그 사이 다른 일이 시작됨
    const 지난것 = performance.now() - 나.시작한때;
    const 기다릴것 = Math.max(늦추기, 최소보임 - 지난것);
    setTimeout(() => {
      if (this.지금 !== 나) return;
      this.지금 = null;
      this._덮기(false);
      if (this.작은것) this.작은것.style.display = "none";
    }, Math.max(0, 기다릴것));
  }

  /** 짧은 일에 편하게 — 끝나거나 터지면 저절로 닫힌다 */
  async 감싸기(제목, 할일, opt = {}) {
    const 일 = this.시작(제목, opt);
    try {
      const r = await 할일(일);
      일.끝();
      return r;
    } catch (e) {
      일.실패(e?.message || String(e));
      throw e;
    }
  }
}

export const busy = new Busy();
