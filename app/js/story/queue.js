/* 🌙 굽기 줄 — 대본 여러 개를 차례로 영상으로 굽는다 (밤새 돌려 두는 용도).
   하나가 실패해도 멈추지 않고 다음으로 간다. 수백 개를 만들 때 이게 핵심이다. */
import { bakeVideo, waitJob } from "./render.js";
import { library } from "./assets.js";

export class BakeQueue {
  constructor(opt = {}) {
    this.items = [];           // {doc, opt, state, note, filename, error}
    this.running = false;
    this.stopped = false;
    this.onChange = opt.onChange || (() => {});
    /* 진행률만 따로 듣고 싶은 쪽(작업 중 덮개)을 위해 열어 둔다.
       onChange 는 목록을 다시 그리는 무거운 일이라 섞어 쓰면 손해다. */
    this.onProgress = opt.onProgress || null;
    this.defaults = opt.defaults || { 세로: 1280, fps: 30 };
  }

  add(doc, opt = {}) {
    this.items.push({ doc, opt: { ...this.defaults, ...opt },
                      state: "대기", note: "", filename: null, error: null });
    this.onChange(this);
    return this;
  }
  addMany(docs, opt = {}) { docs.forEach(d => this.add(d, opt)); return this; }
  clear() { if (!this.running) { this.items = []; this.onChange(this); } return this; }
  remove(i) { if (!this.running) { this.items.splice(i, 1); this.onChange(this); } return this; }
  stop() { this.stopped = true; return this; }

  get summary() {
    const c = k => this.items.filter(x => x.state === k).length;
    return { 전체: this.items.length, 대기: c("대기"), 굽는중: c("굽는중"),
             완료: c("완료"), 실패: c("실패") };
  }

  /** 차례로 굽는다. 브라우저 탭이 열려 있어야 한다 (그림은 여기서 그린다) */
  async run() {
    if (this.running) return this.items;
    this.running = true; this.stopped = false;
    const 전체 = this.items.length;
    let 끝난것 = 0;
    for (const item of this.items) {
      if (this.stopped) { item.state = item.state === "대기" ? "중단" : item.state; continue; }
      if (item.state === "완료") continue;
      item.state = "굽는중"; item.note = "자산 준비"; this.onChange(this);
      try {
        const stage = await item.doc.build(library);
        if (!stage.seconds) throw new Error("길이가 0초입니다 (자막이 없습니다)");
        const r = await bakeVideo(stage,
          { 이름: item.doc.title, 음악: item.doc.meta.음악 || null, ...item.opt },
          p => {
            item.note = `${p.percent}% (${p.done}/${p.total}장)`;
            this.onChange(this);
            // 여러 편이면 전체에서 이 편이 차지하는 몫만큼만 채운다
            this.onProgress?.({ percent: (끝난것 + p.percent / 100) / 전체 * 100,
                                편: item.doc.title, 장: p.done, 전체장: p.total });
          });
        item.note = "mp4 로 굽는 중";
        this.onChange(this);
        this.onProgress?.({ percent: (끝난것 + 1) / 전체 * 100, 편: item.doc.title,
                            글: "mp4 로 굽는 중" });
        const done = await waitJob(r.job);
        if (done.state === "done") {
          item.state = "완료"; item.filename = done.filename;
          item.note = `${(done.size / 1048576).toFixed(1)}MB · ${done.frames}프레임`;
        } else {
          item.state = "실패"; item.error = done.error || "알 수 없는 오류"; item.note = item.error;
        }
      } catch (e) {
        item.state = "실패"; item.error = String(e.message || e); item.note = item.error;
      }
      끝난것++;
      this.onChange(this);
      this.onProgress?.({ percent: 끝난것 / 전체 * 100, 편: item.doc.title });
    }
    this.running = false;
    this.onChange(this);
    return this.items;
  }
}
