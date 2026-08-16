/* 캐릭터·배경 목록과 현재 선택을 한 곳에서 관리한다.
   하위 탭(캐릭터 관리 / 배경 관리 / 영상 만들기)은 모두 이 저장소를 통해 대화한다. */
import { api, loadImage } from "../core.js";
import { Puppet } from "./puppet.js";

class Store extends EventTarget {
  constructor() {
    super();
    this.characters = [];
    this.backgrounds = [];
    this.selectedCharId = null;
    this.selectedBgId = null;
    this.puppet = new Puppet();
    this.bgImage = null;
  }
  emit(type) { this.dispatchEvent(new CustomEvent(type)); }

  async refreshCharacters() {
    const d = await api("/api/char/list");
    this.characters = d.items || [];
    this.emit("characters");
    return this.characters;
  }
  async refreshBackgrounds() {
    const d = await api("/api/bg/list");
    this.backgrounds = d.items || [];
    this.emit("backgrounds");
    return this.backgrounds;
  }

  /** 저장된 캐릭터를 골라 실제 그림까지 불러온다 */
  async selectCharacter(id) {
    if (!id) { this.selectedCharId = null; this.puppet = new Puppet(); this.emit("selection"); return; }
    const m = this.characters.find(c => c.id === id) ||
              (await this.refreshCharacters()).find(c => c.id === id);
    if (!m) return;
    const poses = {};
    for (const role of Object.keys(m.poses || {}))
      poses[role] = await loadImage(`/api/char/sprite?id=${id}&role=${role}`);
    this.selectedCharId = id;
    this.puppet = new Puppet(poses);
    this.emit("selection");
  }
  /** 저장하지 않은 상태(작업 중인 시트)를 그대로 쓰고 싶을 때 */
  setPuppet(puppet) { this.puppet = puppet; this.selectedCharId = null; this.emit("selection"); }

  async selectBackground(id) {
    if (!id) { this.selectedBgId = null; this.bgImage = null; this.emit("selection"); return; }
    this.bgImage = await loadImage(`/api/bg/file?id=${encodeURIComponent(id)}`);
    this.selectedBgId = id;
    this.emit("selection");
  }
  setBackgroundImage(img) { this.bgImage = img; this.selectedBgId = null; this.emit("selection"); }

  async saveCharacter(name, poses) {
    const d = await api("/api/char/save", { name, poses });
    await this.refreshCharacters();
    return d;
  }
  async deleteCharacter(id) {
    await api("/api/char/delete", { id });
    if (this.selectedCharId === id) await this.selectCharacter(null);
    await this.refreshCharacters();
  }
  async deleteBackground(id) {
    await api("/api/bg/delete", { id });
    if (this.selectedBgId === id) await this.selectBackground(null);
    await this.refreshBackgrounds();
  }
}

export const store = new Store();
