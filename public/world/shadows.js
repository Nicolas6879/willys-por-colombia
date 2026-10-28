// Sombras blob (ESTILO.md 2.12): UN InstancedMesh de planos con textura radial (canvas 64x64, #3A2A5E) para Willys, chivas y props grandes.
// Instancias [0, DYN) = dinamicas (set por frame); el resto se agrega una vez con add().
import * as THREE from 'three';

export const DYN = 4; // 0 = Willys, 1-2 = chivas

export function makeBlobTexture(size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(58,42,94,0.62)'); grd.addColorStop(0.55, 'rgba(58,42,94,0.34)'); grd.addColorStop(1, 'rgba(58,42,94,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class ShadowBlobs {
  constructor(scene, capacity = 2000) {
    this.cap = capacity; this.used = DYN;
    const mat = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.E = new THREE.Euler(); this.P = new THREE.Vector3(); this.S = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, zero);
    this.mesh.count = DYN; scene.add(this.mesh);
  }
  // sombra elipse sx x sz (u) en (x,y,z) con orientacion yaw/pitch/roll (orden YXZ, como el carro)
  set(i, x, y, z, yaw, pitch, roll, sx, sz = sx) {
    this.E.set(pitch, yaw, roll, 'YXZ'); this.Q.setFromEuler(this.E);
    this.M.compose(this.P.set(x, y, z), this.Q, this.S.set(sx, 1, sz)); this.mesh.setMatrixAt(i, this.M);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  hide(i) { this.mesh.setMatrixAt(i, this.M.makeScale(0, 0, 0)); this.mesh.instanceMatrix.needsUpdate = true; }
  // sombra estatica: radio r (el blob mide 2.2 r de ancho), k = alargamiento en z
  add(x, y, z, r = 4, k = 1) {
    if (this.used >= this.cap) return -1;
    const i = this.used++;
    this.set(i, x, y, z, 0, 0, 0, r * 2.2, r * 2.2 * k);
    this.mesh.count = this.used;
    return i;
  }
}
