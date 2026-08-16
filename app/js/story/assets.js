/* 📦 자산 창고 — 캐릭터·배경을 이름으로 찾아 주고, 한 번 만든 것은 다시 만들지 않는다.
 *
 * 대본을 한 글자 칠 때마다 캐릭터 그물망을 다시 만들면 프로그램이 눈에 띄게 느려진다.
 * 그래서 만든 것을 창고에 넣어 두고 이름으로 꺼내 쓴다 (수백 개 영상을 만들 때 특히 중요).
 */
import { loadImage } from "../core.js";
import { FaceSprite, DEFAULT_PARTS } from "../char/face.js";
import { applyFace } from "../char/facefind.js";
import { drawAutoCharacter, autoParts, readCharacter } from "../char/autochar.js";

export class AssetLibrary {
  constructor() {
    this.characters = [];          // 서버의 캐릭터 목록
    this.backgrounds = [];         // 서버의 배경 목록
    /* 지금 보고 있는 시리즈. 이 시리즈 것 + **공용**(소속 없는 것) 만 쓴다.
       다른 시리즈의 자산을 몰래 갖다 쓰면 그 시리즈를 지웠을 때 대본이 깨진다. */
    this.group = localStorage.getItem("ws그룹") || "";
    this.cache = new Map();        // 열쇠 → 이미 만든 것
    this.loadedAt = 0;
  }

  /** 서버 목록 새로 읽기 (30초 안에 다시 부르면 그냥 넘어간다) */
  async refresh(force = false) {
    if (!force && Date.now() - this.loadedAt < 30000) return this;
    try {
      const [c, b] = await Promise.all([
        fetch("/api/char/list").then(r => r.json()),
        fetch("/api/bg/list").then(r => r.json()),
      ]);
      /* 쓸 수 있는가 —
           공용(소속 없음) 은 언제나 쓴다
           시리즈를 고르지 않았으면(전체 보기) 다 쓴다
           시리즈를 골랐으면 그 시리즈 것만 쓴다 */
      const 쓸수있나 = m => {
        const 소속 = m.group || "";
        if (!소속) return true;                       // 공용
        if (!this.group) return true;                 // 전체 보기
        if (this.group === "__none") return false;    // 안 묶인 것만 보기
        return 소속 === this.group;
      };
      this.characters = (c.items || []).filter(쓸수있나);
      this.backgrounds = (b.items || []).filter(쓸수있나);
      this.loadedAt = Date.now();
    } catch { /* 목록을 못 읽어도 화면은 계속 돈다 */ }
    return this;
  }

  /** 이름이 딱 맞지 않아도 비슷한 것을 찾아 준다 */
  static match(list, name) {
    if (!name) return null;
    const n = String(name).replace(/\s/g, "");
    return list.find(x => x.name.replace(/\s/g, "") === n)
        || list.find(x => { const m = x.name.replace(/\s/g, "");
                            return m.includes(n) || n.includes(m); })
        || null;
  }

  /** 캐릭터 하나 (한 번 만들면 창고에 남는다) */
  async character(name, role = "front") {
    const c = AssetLibrary.match(this.characters, name);
    if (!c) return this.autoCharacter(name, role);   // 올린 그림이 없으면 코드로 세워 준다
    /* 그 캐릭터에 그 포즈가 없으면 **아무것도 주지 않는다.**
       코드 그림을 대신 내주면 갑자기 딴 캐릭터로 바뀌어 버린다 —
       무대는 null 을 받으면 기본 그림을 그대로 쓴다. */
    if (role !== "front" && c.poses && !c.poses[role]) return null;
    const key = `ch:${c.id}:${role}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const made = (async () => {
      try {
        const img = await loadImage(`/api/char/sprite?id=${c.id}&role=${role}`);
        let parts = null;
        try {
          const r = await (await fetch(`/api/char/rig?id=${c.id}`)).json();
          parts = r.rig?.views?.[role]?.parts || r.rig?.face || null;
        } catch {}
        if (!parts) {
          /* 저장해 둔 설정이 없으면 그림에서 눈·입을 찾아 맞춘다.
             짐작한 자리에 표정을 그리면 눈·입이 엉뚱한 데 찍힌다. */
          parts = DEFAULT_PARTS(role);
          try { applyFace(parts, img, role); } catch {}
        }
        return new FaceSprite(img, parts, 20, { view: role, move: "breathe" });
      } catch { return null; }
    })();
    this.cache.set(key, made);
    return made;
  }

  /** 그림이 없을 때 이름만 보고 세우는 배우.
   *  만드는 것이 '그림 한 장'이라 올린 그림과 완전히 같은 길을 탄다 —
   *  표정·동작·눈물·말풍선이 그대로 붙는다. 나중에 진짜 그림을 올리면
   *  위쪽 match() 가 그쪽을 집으므로 저절로 바뀐다. */
  autoCharacter(name, role = "front") {
    const key = `auto:${name}:${role}`;
    if (this.cache.has(key)) return this.cache.get(key);
    let made = null;
    try {
      const img = drawAutoCharacter(name, 512);
      const sprite = new FaceSprite(img, autoParts(name), 20, { view: role, move: "breathe" });
      sprite.자동 = true;                       // 화면에서 '코드 그림'이라고 알려 주려고
      made = Promise.resolve(sprite);
    } catch { made = Promise.resolve(null); }
    this.cache.set(key, made);
    return made;
  }

  /** 배경 하나 */
  async background(name) {
    const b = AssetLibrary.match(this.backgrounds, name);
    if (!b) return null;
    const key = `bg:${b.id}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const made = loadImage(`/api/bg/file?id=${b.id}`).catch(() => null);
    this.cache.set(key, made);
    return made;
  }

  /** 대본 하나가 필요로 하는 것을 한꺼번에 (없는 것은 조용히 빠진다).
   *
   *  `포즈` 로 갈아 끼우는 그림도 함께 받아 둔다 — **쓰는 것만** 받는다.
   *  21포즈짜리 캐릭터를 통째로 받으면 미리보기가 눈에 띄게 느려진다.
   */
  async forNeeds(needs) {
    const 배우 = {}, 배경 = {}, 포즈 = {};
    const 할일 = [
      ...needs.배우.map(async n => { const v = await this.character(n); if (v) 배우[n] = v; }),
      ...needs.배경.map(async n => { const v = await this.background(n); if (v) 배경[n] = v; }),
    ];
    for (const [이름, 역할들] of Object.entries(needs.포즈 || {})) {
      for (const role of 역할들) {
        할일.push((async () => {
          const v = await this.character(이름, role);
          if (v) (포즈[이름] ||= {})[role] = v;
        })());
      }
    }
    await Promise.all(할일);
    return { 배우, 배경, 포즈 };
  }

  /** 보는 시리즈를 바꾼다 — 창고를 비우고 다시 읽는다 */
  setGroup(gid) {
    if ((gid || "") === this.group) return;
    this.group = gid || "";
    this.clear();
  }

  /** 창고 비우기 (캐릭터를 새로 저장했을 때) */
  clear() { this.cache.clear(); this.loadedAt = 0; }
}

/** 프로그램 전체가 하나의 창고를 같이 쓴다 */
export const library = new AssetLibrary();
