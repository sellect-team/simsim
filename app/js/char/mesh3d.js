/* 3D 메시 배우 — 이미지→3D(Hunyuan3D)로 만든 .glb 를 장면에 세운다.
   작은 WebGL 화면에 그린 뒤 그 그림을 2D 장면 캔버스에 얹으므로,
   스프라이트 캐릭터와 똑같이 장면·경로·자막·영상 굽기를 그대로 쓸 수 있다. */
import * as THREE from "../../lib/three.module.js";
import { GLTFLoader } from "../../lib/GLTFLoader.js";

const loader = new GLTFLoader();

export class MeshActor {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    this.key = new THREE.DirectionalLight(0xffffff, 1.0);
    this.key.position.set(2, 3, 3);
    this.scene.add(this.key);
    this.rim = new THREE.DirectionalLight(0xffe6bb, 0.4);
    this.rim.position.set(-3, 1.5, -2);
    this.scene.add(this.rim);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.root = null;
    this.ready = false;
    this.color = "#f4dcae";
    this.outline = 0.02;
    // 만화풍 3단 셀 셰이딩 (RGBA 4바이트씩 — RGBFormat 은 최신 three 에 없음)
    this.grad = new THREE.DataTexture(new Uint8Array([
      150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 3, 1);
    this.grad.needsUpdate = true;
    this.grad.minFilter = this.grad.magFilter = THREE.NearestFilter;
  }

  async load(url) {
    const g = await loader.loadAsync(url);
    if (this.root) this.pivot.remove(this.root);
    this.root = g.scene;
    // 화면 기준 높이 1로 맞추고 발이 바닥(y=0)에 오게 정렬
    const box = new THREE.Box3().setFromObject(this.root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = 1 / Math.max(1e-6, size.y);
    this.root.scale.setScalar(s);
    this.root.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    // 먼저 메시를 모아둔다 — 순회 도중 자식을 붙이면 무한 재귀에 빠진다
    const meshes = [];
    this.root.traverse(o => { if (o.isMesh) meshes.push(o); });
    for (const o of meshes) {
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();  // 복셀 메시는 법선이 없다
      const m = new THREE.MeshToonMaterial({ color: new THREE.Color(this.color) });
      m.gradientMap = this.grad;
      o.material = m;
      if (this.outline > 0) {                       // 만화 느낌 외곽선 (뒤집힌 껍질)
        const o2 = new THREE.Mesh(o.geometry, new THREE.MeshBasicMaterial(
          { color: 0x4a3121, side: THREE.BackSide }));
        o2.scale.setScalar(1 + this.outline);
        o2.userData.outline = true;
        o.add(o2);
      }
    }
    this.pivot.add(this.root);
    this.ready = true;
    return this;
  }

  setColor(hex) {
    this.color = hex;
    if (!this.root) return;
    const list = [];
    this.root.traverse(o => { if (o.isMesh && o.material && o.material.isMeshToonMaterial) list.push(o); });
    list.forEach(o => { o.material.color = new THREE.Color(hex); });
  }

  /** 이 순간의 모습을 그려 캔버스로 돌려준다 (배경 투명) */
  render(px, { angle = 0, tiltX = 0, lean = 0, light = 1 } = {}) {
    if (!this.ready) return null;
    const w = Math.max(32, Math.round(px * 0.9)), h = Math.max(32, Math.round(px));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.pivot.rotation.set(tiltX * Math.PI / 180, angle * Math.PI / 180, lean * Math.PI / 180);
    this.key.intensity = 1.0 * light;
    // 높이 1인 모델이 화면에 꽉 차도록 카메라를 둔다
    const dist = 0.5 / Math.tan(this.camera.fov * Math.PI / 360) * 1.12;
    this.camera.position.set(0, 0.5, dist);
    this.camera.lookAt(0, 0.5, 0);
    this.renderer.render(this.scene, this.camera);
    return this.canvas;
  }

  dispose() {
    try { this.renderer.dispose(); } catch {}
  }
}

/** 서버에 있는 3D 메시 목록 */
export async function listMeshes() {
  const d = await (await fetch("/api/mesh/list")).json();
  return d.items || [];
}
export const meshUrl = name => "/api/mesh/file?name=" + encodeURIComponent(name);
