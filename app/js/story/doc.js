/* 📄 대본 한 편 — 글·구조·무대·필요한 것을 한 덩어리로 다룬다.
   대본 글이 유일한 원본이고, 나머지는 전부 여기서 파생된다. */
import { parseScript, writeScript, musicBrief } from "./script.js";
import { Stage } from "./stage.js";
import { library } from "./assets.js";
import { expandPrefabs, loadPrefabs } from "./prefabs.js";

export class StoryDoc {
  constructor(text = "", name = "") {
    this.name = name;
    this.setText(text);
  }

  /** 글을 바꾸면 구조도 같이 바뀐다.
   *  `조각 <이름>` 은 파서에 넘기기 전에 실제 줄들로 펼친다 —
   *  원본 글(this.text)은 손대지 않으므로 저장하면 조각을 부른 그대로 남는다. */
  setText(text) {
    this.text = text || "";
    this.parsed = parseScript(expandPrefabs(this.text));
    this._stage = null;                 // 무대는 자산이 준비된 뒤에 만든다
    return this;
  }

  get meta() { return this.parsed.meta || {}; }
  get title() { return this.meta.제목 || this.name || "이름 없는 대본"; }
  get errors() { return this.parsed.errors || []; }
  get seconds() { return this.parsed.seconds || 0; }
  get sceneCount() { return (this.parsed.scenes || []).length; }
  get music() { return musicBrief(this.parsed); }

  /** 이 대본이 부르는 자산 이름들 */
  needs() { return new Stage(this.parsed, {}).needs(); }

  /** 자산을 창고에서 꺼내 무대를 세운다 */
  async build(lib = library) {
    // 조각 표를 아직 못 읽었다면 여기서 읽고 한 번 다시 훑는다 (굽기 직전 마지막 기회)
    const 처음 = await loadPrefabs();
    if (처음.size && expandPrefabs(this.text) !== (this._펼친것 ?? null)) {
      this._펼친것 = expandPrefabs(this.text);
      this.parsed = parseScript(this._펼친것);
    }
    await lib.refresh();
    const assets = await lib.forNeeds(this.needs());
    this._stage = new Stage(this.parsed, assets);
    return this._stage;
  }

  get stage() { return this._stage; }

  /** 아직 없는 그림 + 외부 AI 에 넣을 프롬프트 */
  missingWithPrompts() {
    const miss = (this._stage || new Stage(this.parsed, {})).needs().missing;
    return miss.map(m => ({
      ...m,
      프롬프트: m.종류 === "배경"
        ? `${m.이름}, 어린이 그림책 배경, 크레용·사인펜 느낌, 세로 9:16, 인물 없음, 부드러운 색`
        : `${m.이름}, 귀여운 캐릭터, 정면·측면·후면·앉기·먹기·우는 모습을 한 장에 나란히, `
          + `투명 배경, 크레용·사인펜 느낌, 굵은 외곽선`,
    }));
  }

  /** 구조를 고친 뒤 글로 되돌리기 */
  rewrite() { this.text = writeScript(this.parsed); return this.text; }

  toJSON() { return { name: this.name, text: this.text }; }
  static fromJSON(o) { return new StoryDoc(o?.text || "", o?.name || ""); }
}
