// Neblina de entrada a region (ESTILO.md 2.8, el "momento estrella"): en cada entrada (donde una carretera cruza el borde de una zona) hay un
// banco de nubes-esfera esponjosas del color "niebla entrada" de la region, a nivel del suelo y cruzando la carretera. Al acercarse el Willys
// (< ~40 u) las nubes se abren a los lados y se encogen a 0.6; al cruzar, se cierran detras (escala 1) y se reabsorben (opacidad 0.9 -> 0).
// Cada nube rebota: scale = 1 + 0.05 sin(1.5 t + fase). Ademas un anillo disperso de nubes marca el borde de la zona. La interpolacion de 2 s del
// fog global al color de la region la hace scene.js (fogRegionAt en regions.js).
import * as THREE from 'three';
import { puffGeometry } from './geo.js';
import { makeCel } from './materials.js';
import { hash01 } from './base.js';

const OPEN_NEAR = 12, OPEN_FAR = 40, ROAD_CLEAR = 14, SHRINK = 0.6, BANK_OP = 0.92;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bankMat = (op) => makeCel({ vertexColors: true, soft: 0.3, transparent: true, opacity: op, depthWrite: true });

export class FogBanks {
  constructor(scene, zones, heightAt) {
    this.banks = []; this.rings = [];
    const geo = this.geo = puffGeometry(3, 6, 1.4, [7, 4], 0.78); // ~250 tris por nube (solo se dibujan los bancos cercanos)
    const ringGeo = puffGeometry(5, 5, 1.4, [6, 4], 0.78); // ~180 tris
    const M = new THREE.Matrix4();
    for (const z of zones) {
      const col = new THREE.Color(z.fog).lerp(new THREE.Color(0xffffff), 0.22), C = new THREE.Color(); // la nube es el color de niebla de la region, un poco mas luminoso
      for (const e of z.entries) {
        const ox = e.x - z.cx, oz = e.z - z.cz, ol = Math.hypot(ox, oz) || 1;
        const b = { zone: z, e, out: [ox / ol, oz / ol], nx: -e.tz, nz: e.tx, clouds: [], open: 0, op: BANK_OP, side: 0, passed: false, mat: bankMat(BANK_OP), tint: new THREE.Color(z.color) };
        const N = 17;
        for (let i = 0; i < N; i++) {
          const upper = i >= 13, k = upper ? i - 13 : i;
          const o = upper ? (k - 1.5) * 18 + (hash01(i, 5) - 0.5) * 6 : (k - 6) * 8 + (hash01(i, 3) - 0.5) * 3;
          const s = upper ? 3.6 + hash01(i, 7) * 1.6 : 4.2 + hash01(i, 7) * 2.2;
          const along = (hash01(i, 11) - 0.5) * 6;
          const x = e.x + b.nx * o + e.tx * along, zz = e.z + b.nz * o + e.tz * along;
          let to = o + Math.sign(o || (i % 2 ? 1 : -1)) * 6;
          if (Math.abs(o) < ROAD_CLEAR) to = Math.sign(o || (i % 2 ? 1 : -1)) * (ROAD_CLEAR + hash01(i, 13) * 3);
          b.clouds.push({ o, to, along, s, ph: hash01(i, 17) * 6.28, yaw: hash01(i, 19) * 6.28, y: heightAt(x, zz) + s * (upper ? 2.3 : 0.9), upper });
        }
        const im = b.im = new THREE.InstancedMesh(geo, b.mat, N);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.renderOrder = 3;
        for (let i = 0; i < N; i++) { M.identity(); im.setMatrixAt(i, M); im.setColorAt(i, C.copy(col).multiplyScalar(0.94 + 0.12 * hash01(i, 23))); }
        scene.add(im); this.banks.push(b);
      }
      // anillo disperso en el borde de la zona (salta los arcos de las entradas)
      const ringMat = bankMat(0.6), items = [];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 + 0.2, x = z.cx + Math.cos(a) * z.radius, zz = z.cz + Math.sin(a) * z.radius;
        if (z.entries.some((e) => Math.hypot(e.x - x, e.z - zz) < 50)) continue;
        const s = 8 + hash01(k, 31) * 5;
        items.push({ x, z: zz, y: Math.max(heightAt(x, zz), 0) + s * 1.1, s, ph: hash01(k, 37) * 6.28, yaw: hash01(k, 41) * 6.28 });
      }
      const im = new THREE.InstancedMesh(ringGeo, ringMat, Math.max(1, items.length));
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.renderOrder = 3;
      items.forEach((it, i) => { M.identity(); im.setMatrixAt(i, M); im.setColorAt(i, C.copy(col).multiplyScalar(0.94 + 0.12 * hash01(i, 43))); });
      im.count = items.length; scene.add(im); this.rings.push({ zone: z, im, items, mat: ringMat, tint: new THREE.Color(z.color) });
    }
    this.tris = geo.attributes.position.count / 3; this.trisBank = this.tris * 17;
    this._P = new THREE.Vector3(); this._Q = new THREE.Quaternion(); this._S = new THREE.Vector3(); this._E = new THREE.Euler(); this._M = M;
    this.visible = 170; // distancia a partir de la cual el banco no se dibuja ni se anima
  }

  // t: segundos, dt: s, p: {x,z} del jugador, glow: {zoneId: 0..1} (la memoria tine la neblina del color de la region)
  update(t, dt, p, glow = {}, density = 1) {
    const { _P: P, _Q: Q, _S: S, _E: E, _M: M } = this;
    for (const b of this.banks) {
      const { e } = b, dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
      const vis = d < this.visible; b.im.visible = vis && b.op > 0.01;
      if (d > 75) { b.passed = false; b.side = 0; }
      const pr = dx * b.out[0] + dz * b.out[1];
      if (!b.side && d < 60) b.side = pr >= 0 ? 1 : -1;
      if (b.side && !b.passed && Math.sign(pr || 1) !== b.side && Math.abs(pr) > OPEN_NEAR + 2) b.passed = true;
      if (!vis) { b.op = b.passed ? 0 : BANK_OP; b.open = 0; continue; }
      const openT = 1 - sstep(OPEN_NEAR, OPEN_FAR, d);
      b.open += (openT - b.open) * (1 - Math.exp(-dt * 5));
      const opT = b.passed ? 0 : BANK_OP;
      b.op += Math.sign(opT - b.op) * Math.min(Math.abs(opT - b.op), dt * (b.passed ? 0.6 : 1.5));
      b.mat.opacity = b.op; b.im.visible = b.op > 0.01;
      b.mat.color.setRGB(1, 1, 1).lerp(b.tint, (glow[b.zone.id] || 0) * 0.35);
      const op = b.open;
      b.clouds.forEach((c, i) => {
        const sh = (c.to - c.o) * op, sc = c.s * (1 - (1 - SHRINK) * op) * (1 + 0.05 * Math.sin(t * 1.5 + c.ph)), o = c.o + sh;
        E.set(0, c.yaw, 0); Q.setFromEuler(E);
        M.compose(P.set(e.x + b.nx * o + e.tx * c.along, c.y, e.z + b.nz * o + e.tz * c.along), Q, S.set(sc, sc * 1.7, sc));
        b.im.setMatrixAt(i, M);
      });
      b.im.instanceMatrix.needsUpdate = true;
    }
    for (const r of this.rings) {
      const z = r.zone, vis = Math.hypot(p.x - z.cx, p.z - z.cz) < z.radius + 280; r.im.visible = vis && r.items.length > 0;
      if (!vis) continue;
      r.mat.color.setRGB(1, 1, 1).lerp(r.tint, (glow[z.id] || 0) * 0.35);
      r.items.forEach((c, i) => {
        const sc = c.s * (1 + 0.05 * Math.sin(t * 1.5 + c.ph));
        E.set(0, c.yaw, 0); Q.setFromEuler(E); M.compose(P.set(c.x, c.y, c.z), Q, S.set(sc, sc * 1.5, sc)); r.im.setMatrixAt(i, M);
      });
      r.im.instanceMatrix.needsUpdate = true;
    }
  }
}
