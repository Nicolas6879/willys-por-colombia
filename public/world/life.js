// Camino vivo, version basica (ESTILO.md seccion 4 / paso 4 de G3): cafetales en laderas (filas de arbustos verdes con puntos rojos, instanciados),
// palmas de cera (tramos Medellin-Caribe y Cali-Medellin) y 2 chivas (bus de colores con contorno) que recorren las carreteras en bucle a
// velocidad constante. Todo comparte el material cel con viento (viento mas fuerte en las palmas).
import * as THREE from 'three';
import { ROADS, ROAD_BY_ID, roadAt, roadInfo } from './road.js';
import { heightAt } from './terrain.js';
import { hash01 } from './base.js';
import { celMat, addOutline } from './materials.js';
import { bake, merge, windAttr, trisOf } from './geo.js';

const COFFEE_ROADS = ['med-car', 'cal-med'];
const sh = (x, z) => hash01(x * 0.77 + 5, z * 0.53 + 9);

// ---- geometrias (fusionadas, con vertex colors) ----
export function bushGeometry() {
  const parts = [bake(new THREE.IcosahedronGeometry(1, 0), 0x2f7d3e, { y: 0.75, sx: 1.2, sy: 0.85, sz: 1.2 })];
  [[0.75, 1.05, 0.35], [-0.5, 1.2, 0.6], [0.1, 1.3, -0.7]].forEach(([x, y, z]) => parts.push(bake(new THREE.TetrahedronGeometry(0.24, 0), 0xd7263d, { x, y, z })));
  return windAttr(merge(parts), 0, 0.07);
}
export function waxPalmGeometry() {
  const trunk = bake(new THREE.CylinderGeometry(0.26, 0.4, 16, 6, 1, true), 0xd9c7a3, { y: 8 });
  const crown = bake(new THREE.IcosahedronGeometry(3.1, 0), 0x6fb04a, { y: 16.2, sy: 0.34 });
  const tuft = bake(new THREE.ConeGeometry(0.7, 2.4, 5), 0x4f9a3e, { y: 17.6 });
  return windAttr(merge([trunk, crown, tuft]), 16, 0.25);
}
export function chivaGeometry() {
  const B = (w, h, d, x, y, z, c) => bake(new THREE.BoxGeometry(w, h, d), c, { x, y, z });
  const p = [
    B(2.3, 0.35, 6.2, 0, 0.78, 0.2, 0x4a3a2a),
    B(2.5, 1.0, 5.0, 0, 1.45, -0.5, 0xd7263d), B(2.54, 0.34, 5.0, 0, 2.12, -0.5, 0xffd23f), B(2.5, 1.0, 5.0, 0, 2.79, -0.5, 0x2b6cb0),
    B(2.6, 0.15, 5.2, 0, 3.37, -0.5, 0xffd23f), B(2.2, 0.08, 4.2, 0, 3.5, -0.5, 0x4a3a2a),
    B(2.2, 0.9, 1.4, 0, 1.3, 3.1, 0x2f9e6b), B(1.4, 0.5, 0.1, 0, 1.15, 3.83, 0xe9edf2),
    B(2.5, 0.2, 0.2, 0, 0.62, 3.95, 0xe9edf2), B(2.5, 0.2, 0.2, 0, 0.62, -3.05, 0xe9edf2),
    B(2.0, 0.55, 0.12, 0, 3.0, 2.0, 0xbfe6ff), // parabrisas
  ];
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) p.push(B(0.06, 0.55, 0.9, sx * 1.27, 2.85, -2.5 + k * 1.15, 0xbfe6ff));
  [[0.6, 3.95, -1.6, 0xd9b98a], [-0.6, 3.95, -1.9, 0xc9a56e], [0.2, 3.95, -0.4, 0xd9b98a], [-0.5, 3.95, 0.6, 0xe0c597], [0.5, 4.3, -1.0, 0xc9a56e]]
    .forEach(([x, y, z, c]) => p.push(bake(new THREE.IcosahedronGeometry(0.62, 0), c, { x, y, z, sy: 0.8 })));
  for (const sx of [-1, 1]) p.push(bake(new THREE.IcosahedronGeometry(0.22, 0), 0xfff6c8, { x: sx * 0.7, y: 1.4, z: 3.82 }));
  for (const sx of [-1, 1]) for (const z of [2.5, -1.7]) {
    p.push(bake(new THREE.CylinderGeometry(0.64, 0.64, 0.42, 8).rotateZ(Math.PI / 2), 0x2e2e33, { x: sx * 1.25, y: 0.64, z }));
    p.push(bake(new THREE.CylinderGeometry(0.3, 0.3, 0.46, 6).rotateZ(Math.PI / 2), 0xf0e6c8, { x: sx * 1.25, y: 0.64, z }));
  }
  return merge(p);
}

// ---- colocacion (pura salvo heightAt/roadInfo) ----
export function coffeePatches(maxBushes = 520) {
  const out = [];
  for (const id of COFFEE_ROADS) {
    const R = ROADS[ROAD_BY_ID[id]], L = (R.N - 1) * R.step;
    for (let s0 = 190; s0 < L - 190; s0 += 105) for (const side of [-1, 1]) {
      const r = roadAt(s0, ROAD_BY_ID[id]), o0 = 24 + hash01(s0, side * 7) * 22;
      const px = r.x - r.tz * o0 * side, pz = r.z + r.tx * o0 * side, h = heightAt(px, pz);
      const slope = Math.hypot(heightAt(px + 6, pz) - heightAt(px - 6, pz), heightAt(px, pz + 6) - heightAt(px, pz - 6)) / 12;
      if (h < 14 || h > 150 || slope < 0.1 || hash01(s0, side + 3) < 0.25) continue;
      for (let row = 0; row < 5; row++) for (let a = -36; a <= 36; a += 5.2) {
        const rr = roadAt(Math.min(L - 2, Math.max(2, s0 + a)), ROAD_BY_ID[id]), o = o0 + row * 5.6 + (hash01(a, row + s0) - 0.5) * 0.8;
        const x = rr.x - rr.tz * o * side, z = rr.z + rr.tx * o * side;
        if (roadInfo(x, z).dist < 15) continue;
        out.push({ x, y: heightAt(x, z) - 0.05, z, yaw: hash01(x, z) * 6.28, sx: 0.9 + hash01(z, x) * 0.5, sy: 0.9 + hash01(x, x) * 0.5, sz: 0.9 + hash01(z, z) * 0.5 });
      }
    }
  }
  return out.map((o) => [sh(o.x, o.z), o]).sort((a, b) => a[0] - b[0]).map((p) => p[1]).slice(0, maxBushes);
}
export function palmSpots(maxPalms = 110) {
  const out = [];
  for (const id of COFFEE_ROADS) {
    const R = ROADS[ROAD_BY_ID[id]], L = (R.N - 1) * R.step;
    for (let s = 170; s < L - 170; s += 26) {
      if (hash01(s, id.length) > 0.55) continue; // intervalos irregulares
      const side = hash01(s, 5) < 0.5 ? -1 : 1, o = 13 + hash01(s, 9) * 70, r = roadAt(s, ROAD_BY_ID[id]);
      const x = r.x - r.tz * o * side + (hash01(s, 2) - 0.5) * 14, z = r.z + r.tx * o * side + (hash01(s, 3) - 0.5) * 14;
      if (roadInfo(x, z).dist < 13) continue;
      out.push({ x, y: heightAt(x, z) - 0.2, z, yaw: hash01(x, z) * 6.28, sx: 1, sy: 0.8 + hash01(z, x) * 0.7, sz: 1 });
    }
  }
  return out.slice(0, maxPalms);
}

// anillos de carretera que recorre cada chiva: [tramo, +1 de a->b | -1 de b->a]
export const CHIVA_RINGS = [[['med-car', 1], ['car-san', 1], ['med-san', -1]], [['med-pac', 1], ['pac-cal', 1], ['cal-med', 1]]];
export const CHIVA_SPEED = 9; // u/s constante
export function ringLength(ring) { return ring.reduce((s, [id]) => s + ROADS[ROAD_BY_ID[id]].L, 0); }
// posicion sobre un anillo a una distancia de arco u (mod longitud): {x,y,z,yaw,pitch}. lane: desplazamiento a la derecha del sentido de marcha
export function ringPose(ring, u, lane = 2.4) {
  const Lt = ringLength(ring); u = ((u % Lt) + Lt) % Lt;
  for (const [id, dir] of ring) {
    const e = ROAD_BY_ID[id], L = ROADS[e].L;
    if (u > L) { u -= L; continue; }
    const s = dir > 0 ? u : L - u, r = roadAt(s, e), tx = r.tx * dir, tz = r.tz * dir, rx = -tz, rz = tx;
    const a = roadAt(Math.max(0, s - 3), e), b = roadAt(Math.min(L, s + 3), e);
    return { x: r.x + rx * lane, z: r.z + rz * lane, y: r.h + 0.02, yaw: Math.atan2(tx, tz), pitch: -Math.atan2((b.h - a.h) * dir, 6), edge: id };
  }
  return null;
}

export class Life {
  constructor(scene, shadows) {
    this.scene = scene; this.shadows = shadows; this.thin = [];
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color();
    const inst = (geo, list, tint) => {
      const im = new THREE.InstancedMesh(geo, celMat('wind'), Math.max(1, list.length));
      list.forEach((it, i) => {
        E.set(0, it.yaw || 0, 0); Q.setFromEuler(E); M.compose(P.set(it.x, it.y, it.z), Q, S.set(it.sx, it.sy, it.sz)); im.setMatrixAt(i, M);
        im.setColorAt(i, C.setScalar(1 + 0.06 * (hash01(it.x * 3.1, it.z * 2.3) * 2 - 1)));
      });
      im.count = list.length; im.computeBoundingSphere(); scene.add(im);
      this.thin.push({ im, n: list.length });
      return im;
    };
    this.bushes = coffeePatches(); this.palms = palmSpots();
    const bg = bushGeometry(), pg = waxPalmGeometry();
    this.bushMesh = inst(bg, this.bushes); this.palmMesh = inst(pg, this.palms);
    this.tris = trisOf(bg) * this.bushes.length + trisOf(pg) * this.palms.length;
    for (const p of this.palms.slice(0, 60)) shadows.add(p.x, p.y + 0.4, p.z, 2.2);
    // chivas
    const cg = chivaGeometry(), mat = celMat('hero');
    this.chivas = CHIVA_RINGS.map((ring, i) => {
      const root = new THREE.Group(), body = new THREE.Group(), mesh = new THREE.Mesh(cg, mat);
      addOutline(mesh, { thickness: 0.05 });
      body.add(mesh); root.add(body); root.rotation.order = 'YXZ'; scene.add(root);
      return { ring, root, body, u0: [330, 520][i], ph: i * 2.1 };
    });
    this.tris += trisOf(cg) * 2 * 2; // cuerpo + contorno
  }
  setDensity(d) { for (const t of this.thin) t.im.count = Math.max(0, Math.floor(t.n * d)); }
  update(t) {
    this.chivas.forEach((c, i) => {
      const p = ringPose(c.ring, c.u0 + CHIVA_SPEED * t);
      c.root.position.set(p.x, p.y, p.z); c.root.rotation.set(p.pitch, p.yaw, 0);
      c.body.rotation.z = Math.sin(t * 3.1 + c.ph) * 0.03; c.body.position.y = Math.abs(Math.sin(t * 5.3 + c.ph)) * 0.04;
      this.shadows.set(1 + i, p.x, p.y + 0.12, p.z, p.yaw, p.pitch, 0, 3.8, 8.2);
    });
  }
}
