// Efectos del derrape (ESTILO: barato en iGPU, sin texturas): humo/polvo de las ruedas traseras y marcas de llanta.
//  - Humo: UNA InstancedMesh de icosaedros de 20 triangulos (max 28 instancias), material basico translucido (1 draw call). Blanco-gris en
//    carretera y arena (polvo) fuera de ella; crece, sube y se encoge al morir. De noche se oscurece con la paleta.
//  - Marcas: UN buffer circular de quads (max 300 segmentos, 2 triangulos c/u = 1 draw call), con alfa por vertice que se desvanece con la edad.
//    Solo se pintan sobre la carretera. Pegadas al terreno con heightAt (la cinta de la carretera va 0.15 sobre el terreno).
// setQuality(level): QUALITY de perf.js (0 = mejor ... 3 = peor) reduce particulas y segmentos; en el nivel mas bajo no hay marcas.
import * as THREE from 'three';
import { CAR } from '../vehicle.js';

export const FX_LEVELS = [
  { puffs: 28, rate: 1, marks: 300 },
  { puffs: 18, rate: 0.7, marks: 200 },
  { puffs: 10, rate: 0.45, marks: 100 },
  { puffs: 6, rate: 0.3, marks: 0 },
];
export const MARK_FADE_S = 14, MARK_WIDTH = 0.32, MARK_STEP = 0.5, MARK_LIFT = 0.2;
const MAX_MARKS = 300, MAX_PUFFS = 28;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class DriftFx {
  constructor(scene) {
    this.level = 0; this.t = 0; this.acc = 0; this.side = 0; this.seed = 12345;
    // ---- humo ----
    this.puffMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.62, depthWrite: false }), MAX_PUFFS);
    this.puffMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.puffMesh.frustumCulled = false; this.puffMesh.renderOrder = 3;
    this.puffMesh.count = MAX_PUFFS;
    this.puffs = Array.from({ length: MAX_PUFFS }, () => ({ age: 1, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1 }));
    this.puffMesh.setColorAt(0, new THREE.Color(1, 1, 1)); // crea el atributo de color por instancia
    scene.add(this.puffMesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
    this._road = new THREE.Color(0xeeeae2); this._dust = new THREE.Color(0xd9bf8f);
    // ---- marcas de llanta (buffer circular) ----
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_MARKS * 4 * 3); this.col = new Float32Array(MAX_MARKS * 4 * 4);
    const idx = new Uint16Array(MAX_MARKS * 6);
    for (let i = 0; i < MAX_MARKS; i++) { const v = i * 4; idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6); for (let k = 0; k < 4; k++) { this.col[(v + k) * 4] = 0.06; this.col[(v + k) * 4 + 1] = 0.05; this.col[(v + k) * 4 + 2] = 0.05; } }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.markMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    this.markMesh.frustumCulled = false; this.markMesh.renderOrder = 2;
    scene.add(this.markMesh);
    this.birth = new Float32Array(MAX_MARKS).fill(-1e9); this.strength = new Float32Array(MAX_MARKS); this.head = 0; this.dirty = false;
    this.last = [null, null]; this.lastT = [-1, -1]; // ultimo punto de cada rueda trasera (null = trazo cortado)
    this.stats = { puffsSpawned: 0, marksWritten: 0 };
    this._hideAll();
  }
  get budget() { return FX_LEVELS[this.level]; }
  setQuality(level) {
    this.level = clamp(Math.floor(level) || 0, 0, FX_LEVELS.length - 1);
    this.puffMesh.count = this.budget.puffs;
    if (this.budget.marks === 0) this._clearMarks();
    else if (this.head >= this.budget.marks) this.head = 0;
  }
  _rnd() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  _hideAll() { const m = this._m.makeScale(0, 0, 0); for (let i = 0; i < MAX_PUFFS; i++) this.puffMesh.setMatrixAt(i, m); this.puffMesh.instanceMatrix.needsUpdate = true; }
  _clearMarks() { this.birth.fill(-1e9); for (let i = 0; i < MAX_MARKS; i++) for (let k = 0; k < 4; k++) this.col[(i * 4 + k) * 4 + 3] = 0; this.markMesh.geometry.attributes.color.needsUpdate = true; this.last = [null, null]; }

  // posicion mundial de una rueda trasera (-1 = izquierda del carro, +1 = derecha)
  _wheel(s, side) {
    const sh = Math.sin(s.heading), ch = Math.cos(s.heading), lx = -side * 0.95, lz = -CAR.wheelBase / 2; // willys: izquierda = +x local
    return [s.x + sh * lz + ch * lx, s.z + ch * lz - sh * lx];
  }

  // s: estado de vehicle.js; heightAt(x,z); night 0..1 (oscurece el humo)
  update(s, dt, heightAt, night = 0) {
    this.t += dt;
    const B = this.budget, skid = s.skid || 0;
    // ---- emision de humo ----
    if (skid > 0.12 && B.puffs > 0) {
      this.acc += dt * 46 * B.rate * skid;
      while (this.acc >= 1) { this.acc -= 1; this._spawn(s, heightAt, this.side = 1 - this.side); }
    } else this.acc = Math.min(this.acc, 1);
    // ---- animacion del humo ----
    const tint = 1 - 0.62 * night, n = this.puffMesh.count;
    for (let i = 0; i < MAX_PUFFS; i++) {
      const p = this.puffs[i];
      if (i >= n || p.age >= p.life) { if (p.age < 1e8) { this._m.makeScale(0, 0, 0); this.puffMesh.setMatrixAt(i, this._m); p.age = 1e9; p.life = 1; } continue; }
      p.age += dt;
      const u = p.age / p.life;
      if (u >= 1) { this._m.makeScale(0, 0, 0); this.puffMesh.setMatrixAt(i, this._m); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 1 - 1.6 * dt; p.vz *= 1 - 1.6 * dt; p.vy *= 1 - 0.8 * dt;
      const grow = 0.45 + 1.35 * Math.sqrt(u), shrink = u < 0.55 ? 1 : 1 - ((u - 0.55) / 0.45) ** 2;
      const sz = p.size * grow * shrink;
      this._m.compose(this._p.set(p.x, p.y, p.z), this._q.identity(), this._s.set(sz, sz * 0.8, sz));
      this.puffMesh.setMatrixAt(i, this._m);
    }
    this.puffMesh.instanceMatrix.needsUpdate = true;
    this.puffMesh.material.color.setScalar(tint);
    // ---- marcas ----
    if (B.marks > 0) this._marks(s, heightAt, skid);
    else for (let i = 0; i < 2; i++) this.last[i] = null;
    this._fade();
  }

  _spawn(s, heightAt, side) {
    const i = this.puffs.findIndex((p, k) => k < this.puffMesh.count && p.age >= p.life);
    if (i < 0) return;
    const [wx, wz] = this._wheel(s, side * 2 - 1), p = this.puffs[i], sh = Math.sin(s.heading), ch = Math.cos(s.heading);
    const vx = sh * s.vf + ch * s.vl, vz = ch * s.vf - sh * s.vl; // velocidad mundial del carro
    p.x = wx + (this._rnd() - 0.5) * 0.5; p.z = wz + (this._rnd() - 0.5) * 0.5; p.y = heightAt(wx, wz) + 0.32;
    p.vx = vx * 0.22 + (this._rnd() - 0.5) * 2.2; p.vz = vz * 0.22 + (this._rnd() - 0.5) * 2.2; p.vy = 1.0 + this._rnd() * 1.1;
    p.size = (s.onRoad ? 0.55 : 0.75) + this._rnd() * 0.45; p.life = 0.55 + this._rnd() * 0.5; p.age = 0;
    this.puffMesh.setColorAt(i, s.onRoad ? this._road : this._dust); this.puffMesh.instanceColor.needsUpdate = true;
    this.stats.puffsSpawned++;
  }

  _marks(s, heightAt, skid) {
    const on = skid > 0.4 && s.onRoad;
    for (let side = 0; side < 2; side++) {
      if (!on) { this.last[side] = null; continue; }
      const [wx, wz] = this._wheel(s, side * 2 - 1), prev = this.last[side];
      if (!prev) { this.last[side] = [wx, wz]; continue; }
      const dx = wx - prev[0], dz = wz - prev[1], d = Math.hypot(dx, dz);
      if (d < MARK_STEP) continue;
      if (d > 4) { this.last[side] = [wx, wz]; continue; } // salto (teletransporte / frame largo): corta el trazo
      this._quad(prev, [wx, wz], dx / d, dz / d, heightAt, skid);
      this.last[side] = [wx, wz];
    }
  }
  _quad(a, b, ux, uz, heightAt, skid) {
    const i = this.head; this.head = (this.head + 1) % this.budget.marks;
    const nx = -uz * MARK_WIDTH * 0.5, nz = ux * MARK_WIDTH * 0.5, v = i * 4, P = this.pos;
    const pts = [[a[0] - nx, a[1] - nz], [a[0] + nx, a[1] + nz], [b[0] - nx, b[1] - nz], [b[0] + nx, b[1] + nz]];
    for (let k = 0; k < 4; k++) { const o = (v + k) * 3; P[o] = pts[k][0]; P[o + 1] = heightAt(pts[k][0], pts[k][1]) + MARK_LIFT; P[o + 2] = pts[k][1]; }
    this.birth[i] = this.t; this.strength[i] = 0.35 + 0.35 * clamp(skid, 0, 1);
    this.markMesh.geometry.attributes.position.needsUpdate = true; this.stats.marksWritten++; this.dirty = true;
  }
  _fade() {
    if (!this.dirty && this.t - (this._fadeT || 0) < 0.1) return; // el desvanecido se actualiza ~10 veces/s
    this._fadeT = this.t; let any = false;
    for (let i = 0; i < MAX_MARKS; i++) {
      const age = this.t - this.birth[i];
      const a = age >= MARK_FADE_S || i >= this.budget.marks ? 0 : this.strength[i] * (age < 0.3 ? age / 0.3 : 1 - ((age - 0.3) / (MARK_FADE_S - 0.3)) ** 1.5);
      const o = i * 16 + 3;
      if (this.col[o] !== a) { this.col[o] = this.col[o + 4] = this.col[o + 8] = this.col[o + 12] = a; any = true; }
    }
    if (any) this.markMesh.geometry.attributes.color.needsUpdate = true;
    this.dirty = false;
  }
  // conteo para el overlay de dev / pruebas
  info() { return { draws: 2, puffTris: this.puffMesh.count * 20, markTris: this.budget.marks * 2, puffs: this.puffMesh.count, marks: this.budget.marks }; }
}
