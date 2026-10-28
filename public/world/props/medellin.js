// Medellin (G3b): valle con casitas de ladrillo apiladas en las laderas (ventanas emisivas: de noche la ciudad se enciende), metrocable (hito, con contorno:
// torres, estaciones, cables y cabinas que viajan y se detienen en las estaciones), la loma de la Comuna 13 con escaleras electricas, murales de colores y
// casitas vivas, plaza con silleteros desfilando alrededor de una figura redonda generica, flores, puesto de bandeja paisa (plato gigante que gira con vapor),
// puesto de arepas y las luces de club en las carreteras. Devuelve { update(t) } (cabinas, escalones, silleteros, plato y vapor).
import { B, S, C, K, put, foot, hillGeometry, hillSurface, chibi, windowQuads, addVC, outlineInstanced, merge, bake, distPoly } from './cali/kit.js';

const BRICK = [0xc65f3e, 0xb9553a, 0xd0704a, 0xc65f3e, 0xe2a36b, 0xf2e6cf, 0xd9884a];
const ROOF = [0xa24a2e, 0x8b8b8b, 0xa24a2e, 0x7a5a4a, 0x8b8b8b];
const VIVID = [0xff4f8b, 0x2fc4b2, 0xffb02e, 0xff7a2f, 0xc65f3e, 0x6a5cff, 0xf2f0e6, 0x7bd34a, 0xe2418c];
const FLOWER = [0xe2418c, 0xff4f6d, 0xffd23f, 0xb26bff, 0xff8c42, 0xffffff, 0xff7aa8];
const MURAL = [0xff3e8a, 0xffd23f, 0x2fc4b2, 0xff7a2f, 0x6a5cff, 0x7bd34a, 0xffffff, 0xe2413c];
const WALLC = [0x3b2a5e, 0x1f5f6b, 0x7a2e4a, 0xf2f0e6, 0x2b3a67];

export function build(scene, { THREE, inst, grid, place, farFromRoad, heightAt, roadAt, hash01, ZONE_BY_ID, lambert, basic, shade, PASTEL }) {
  const med = ZONE_BY_ID.medellin, X = (dx) => med.cx + dx, Z = (dz) => med.cz + dz;
  const hv = (x, zz, k) => hash01(x * 0.37 + k, zz * 0.41 - k);
  const TAU = Math.PI * 2;

  // ---- sitios (relativos al centro; las 4 carreteras se juntan en el centro) ----
  const HILL = [-108, 78, 50, 36], PLAZA = [78, -54, 21], BAND = [-36, 46], AREP = [10, 40];
  const hillH = hillSurface(X(HILL[0]), Z(HILL[1]), HILL[2], HILL[3]);
  const ang = 0.7, dx = Math.cos(ang), dz = Math.sin(ang), A = { x: med.cx + dx * 62, z: med.cz + dz * 62 }, Bp = { x: med.cx + dx * 330, z: med.cz + dz * 330 };
  const LINE = [[A.x, A.z], [Bp.x, Bp.z]];
  const near = (x, zz, c, r) => Math.hypot(x - X(c[0]), zz - Z(c[1])) < r;
  const blocked = (x, zz) => near(x, zz, HILL, HILL[2] + 10) || near(x, zz, PLAZA, PLAZA[2] + 12) || near(x, zz, BAND, 14) || near(x, zz, AREP, 12) || distPoly(x, zz, LINE) < 14;

  const st = []; // geometrias estaticas (mundo) -> 1 malla
  const box = new THREE.BoxGeometry(1, 1, 1), plain = lambert(0xffffff);
  // viga entre dos puntos 3D (caja w x h x largo)
  const beam = (a, b, w, h, c) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = new THREE.Matrix4().lookAt(new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(0, 1, 0));
    m.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    return bake(new THREE.BoxGeometry(w, h, L), c).applyMatrix4(m);
  };

  // ---- Loma de la Comuna 13: casitas de colores, escaleras electricas y murales ----
  const bush = (f, a, i) => { const k = hv(i, f * 90, 5); return f < 0.3 ? [0x4f9a4e, 0x5aa552, 0x468f4c][Math.floor(k * 3)] : f < 0.65 ? [0x6fa650, 0x7aaf53][Math.floor(k * 2)] : [0x8fb35a, 0x9cbb62][Math.floor(k * 2)]; };
  st.push(hillGeometry(X(HILL[0]), Z(HILL[1]), HILL[2], HILL[3], bush, { rings: 7, seg: 16 }));
  const EA = 0.2, ex = Math.cos(EA), ez = Math.sin(EA); // el frente de la loma (y la escalera) miran al este, hacia las carreteras
  const pathAt = (k) => { const r = HILL[2] * (0.9 - k * 0.7), x = X(HILL[0]) + ex * r, zz = Z(HILL[1]) + ez * r; return [x, hillH(x, zz) + 0.9, zz]; };
  const NSEG = 6, pp = Array.from({ length: NSEG + 1 }, (_, i) => pathAt(i / NSEG));
  const sideOff = (p, s, d) => [p[0] - ez * d * s, p[1], p[2] + ex * d * s];
  const mural = (w, h, seed, c0) => {
    const p = [B(w, h, 0.6, 0, h / 2, 0, c0)];
    for (const sgn of [1, -1]) {
      for (let i = 0; i < 7; i++) {
        const ww = (0.12 + hv(seed + i, sgn, 21) * 0.28) * w, hh = (0.15 + hv(i, seed, 22) * 0.35) * h, x = (hv(seed, i, 23) - 0.5) * (w - ww), y = hh / 2 + hv(i + 3, seed, 24) * (h - hh);
        p.push(bake(new THREE.PlaneGeometry(ww, hh), MURAL[Math.floor(hv(seed + i, i, 25) * MURAL.length)], { x: sgn * x, y, z: sgn * (0.31 + i * 0.012), ry: sgn > 0 ? 0 : Math.PI }));
      }
      for (let i = 0; i < 2; i++) p.push(bake(new THREE.CircleGeometry((0.14 + hv(seed, i, 26) * 0.12) * Math.min(w, h * 1.6), i ? 5 : 10), MURAL[Math.floor(hv(i, seed, 27) * MURAL.length)], { x: sgn * (i ? 0.2 : -0.22) * w, y: h * (i ? 0.7 : 0.45), z: sgn * (0.34 + i * 0.012), ry: sgn > 0 ? 0 : Math.PI }));
    }
    return merge(p);
  };
  for (let i = 0; i < NSEG; i++) {
    const a = pp[i], b = pp[i + 1], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
    st.push(beam(a, b, 4.6, 0.7, 0x6b6f7a), beam(sideOff(a, 1, 2.5).map((v, k) => (k === 1 ? v + 1 : v)), sideOff(b, 1, 2.5).map((v, k) => (k === 1 ? v + 1 : v)), 0.35, 0.35, 0xe9edf2), beam(sideOff(a, -1, 2.5).map((v, k) => (k === 1 ? v + 1 : v)), sideOff(b, -1, 2.5).map((v, k) => (k === 1 ? v + 1 : v)), 0.35, 0.35, 0xe9edf2));
    // techo naranja sobre arcos
    st.push(put(merge([B(6.4, 0.5, 5.6, 0, 3.9, 0, 0xff7a2f), B(0.4, 3.8, 0.4, -2.9, 1.9, 0, 0xe9edf2), B(0.4, 3.8, 0.4, 2.9, 1.9, 0, 0xe9edf2)]), mid[0], mid[2], yaw, 1, mid[1] - 0.6));
    // murales a los dos lados (paneles escalonados que siguen la ladera)
    for (const s of [1, -1]) { const q = sideOff(mid, s, 5.4); st.push(put(mural(6.2, 5.2 + (i % 2), i * 7 + (s > 0 ? 1 : 40), WALLC[(i + (s > 0 ? 0 : 2)) % WALLC.length]), q[0], q[2], yaw - Math.PI / 2, 1, mid[1] - 1.5)); }
  }
  st.push(put(mural(10, 6, 91, 0x2b3a67), X(HILL[0]) + 58, Z(HILL[1]) + 26, -Math.PI / 2 + 0.3 - Math.PI, 1), put(mural(9, 5, 17, 0x7a2e4a), X(HILL[0]) + 52, Z(HILL[1]) - 36, Math.PI / 2 + 0.2, 1));

  // ---- plaza: baldosas, figura redonda generica (bronce), flores ----
  const PX = X(PLAZA[0]), PZ = Z(PLAZA[1]), PH = heightAt(PX, PZ);
  const plaza = merge([C(21, 21, 0.3, 0, 0.15, 0, 0xf2e6cf, {}, 20), C(17, 17, 0.3, 0, 0.3, 0, 0xc65f3e, {}, 20), C(12, 12, 0.3, 0, 0.45, 0, 0xf2e6cf, {}, 20), C(5.2, 6, 1.3, 0, 1.1, 0, 0xd9c7a3, {}, 12),
    // figura voluminosa generica: cuerpo/cabeza esfericos, brazos y piernas diminutos, sombrerito
    S(4.3, 0, 7.0, 0, 0xcf8f4e, { sy: 0.95 }, 10, 7), S(2.1, 0.2, 12.3, 0, 0xd9a063, {}, 8, 6), K(2.4, 1.6, 0.2, 14.5, 0, 0xb87438, {}, 8), C(2.6, 2.6, 0.35, 0.2, 13.5, 0, 0xb87438, {}, 8),
    S(1.15, -4.4, 6.4, 0.4, 0xd9a063, {}, 6, 4), S(1.15, 4.6, 6.2, 0.4, 0xd9a063, {}, 6, 4), S(1.6, -1.9, 2.7, 0, 0xcf8f4e, {}, 6, 4), S(1.6, 1.9, 2.7, 0, 0xcf8f4e, {}, 6, 4),
    S(0.35, -0.8, 12.6, 1.8, 0x2a1a22, {}, 4, 3), S(0.35, 1.1, 12.6, 1.8, 0x2a1a22, {}, 4, 3)]);
  st.push(put(plaza, PX, PZ, 0.5, 1, PH));
  shade([{ x: PX, z: PZ }], 22);

  // ---- puestos: bandeja paisa (plato gigante animado aparte) y arepas ----
  const awn = (n, c1, c2, w, z0) => Array.from({ length: n }, (_, i) => B(w / n, 0.2, 3.4, -w / 2 + (i + 0.5) * (w / n), 4.4 - 0.03 * i, z0, i % 2 ? c1 : c2, { rx: 0.2 }));
  const stall = (c, flag) => merge([B(5.4, 1.7, 2.8, 0, 0.85, 0, c), B(5.6, 0.3, 3.0, 0, 1.8, 0, 0xc98a52), B(0.25, 4.6, 0.25, -2.6, 2.3, 1.2, 0xc98a52), B(0.25, 4.6, 0.25, 2.6, 2.3, 1.2, 0xc98a52), ...awn(6, 0xffffff, flag ? 0xffd23f : 0xe2418c, 5.8, 0.6)]);
  const flag3 = merge([B(5.4, 1.7, 2.8, 0, 0.85, 0, 0xf2e6cf), B(5.6, 0.3, 3.0, 0, 1.8, 0, 0xc98a52), B(0.25, 4.6, 0.25, -2.6, 2.3, 1.2, 0xc98a52), B(0.25, 4.6, 0.25, 2.6, 2.3, 1.2, 0xc98a52),
    ...[0xffd23f, 0xffd23f, 0x2b4fa8, 0xe2413c, 0xe2413c, 0xe2413c].map((c, i) => B(1.0, 0.2, 3.4, -2.5 + i, 4.4 - 0.03 * i, 0.6, c, { rx: 0.2 })), chibi({ top: 0xe2413c, hair: 0x2a1a14, skin: 0xd9a27a }).applyMatrix4(new THREE.Matrix4().makeTranslation(3.6, 0, 0))]);
  st.push(put(flag3, X(BAND[0]), Z(BAND[1]), Math.PI / 2, 1.5));
  const arepa = merge([stall(0xffd9a0, true), ...Array.from({ length: 9 }, (_, i) => C(0.75, 0.75, 0.3, -1.5 + (i % 3) * 1.4, 2.05 + Math.floor(i / 3) * 0.32, 0.2, i % 2 ? 0xe9b44c : 0xf0c35a, {}, 8)),
    chibi({ top: 0xffffff, hair: 0x3a2418, skin: 0xe0a97d, bottom: 0x2b4fa8 }).applyMatrix4(new THREE.Matrix4().makeTranslation(-3.6, 0, 0))]);
  st.push(put(arepa, X(AREP[0]), Z(AREP[1]), -Math.PI / 2, 1.5));
  shade([{ x: X(BAND[0]), z: Z(BAND[1]) }, { x: X(AREP[0]), z: Z(AREP[1]) }], 6);
  addVC(scene, merge(st));

  // ---- casas: valle + laderas (apiladas), loma de la Comuna ----
  // casas de ladera: filas apretadas siguiendo las curvas de nivel (cada 5.5 u de altura), asentadas en el terreno
  const taken = new Map(), cand = [], KEY = 6;
  const free = (x, zz) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of taken.get(`${Math.floor(x / KEY) + a},${Math.floor(zz / KEY) + b}`) || []) if (Math.hypot(q[0] - x, q[1] - zz) < 4.6) return false; return true; };
  for (let x = med.cx - 330; x <= med.cx + 330; x += 3.5) for (let zz = med.cz - 330; zz <= med.cz + 330; zz += 3.5) {
    const d = Math.hypot(x - med.cx, zz - med.cz); if (d < 62 || d > 330) continue;
    const h = heightAt(x, zz), sl = h - med.h; if (sl < 4 || h > 150) continue;
    const gr = Math.max(0.12, Math.hypot(heightAt(x + 2, zz) - heightAt(x - 2, zz), heightAt(x, zz + 2) - heightAt(x, zz - 2)) / 4); if (((h / 5.5) % 1) * 5.5 / gr > 2.2) continue; // a menos de 2.2 u de una curva de nivel
    if (d > 200 && hv(x * 0.7, zz * 0.7, 61) < 0.45) continue;
    if (!farFromRoad(x, zz, 15) || blocked(x, zz) || !free(x, zz)) continue;
    const k = `${Math.floor(x / KEY)},${Math.floor(zz / KEY)}`; (taken.get(k) || taken.set(k, []).get(k)).push([x, zz]); cand.push({ x, z: zz });
  }
  const valley = place(grid(med.cx, med.cz, 150, 17, 7), (x, zz) => { const d = Math.hypot(x - med.cx, zz - med.cz), h = heightAt(x, zz); return d > 58 && h - med.h < 4 && farFromRoad(x, zz, 15) && !blocked(x, zz) && hv(x * 0.9, zz * 0.9, 1) < 0.4 && h; }, (x, zz) => ({ x, z: zz })).slice(0, 36);
  const byD = cand.map((p) => [Math.hypot(p.x - med.cx, p.z - med.cz), p]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  const houses = [...valley, ...byD.slice(0, 380), ...byD.slice(380).filter((p) => hv(p.x, p.z, 63) < 0.12).slice(0, 50)]; // las laderas cercanas, apretadas; las lejanas, esparcidas
  // casa pequena y achatada, apoyada en la altura minima de sus esquinas (cimiento corto; la parte de ladera arriba queda enterrada)
  const mk = (x, zz, fn, vivid) => {
    const w = 3.8 + hv(x, zz, 2) * 1.4, d = 3.8 + hv(x + 1, zz, 3) * 1.4, f = foot(x, zz, 2.0, fn), hh = 2.7 + hv(x, zz, 5) * 0.9 + (hv(x, zz + 1, 4) < 0.12 ? 2.4 : 0), base = f.lo, top = f.lo + hh + (f.hi - f.lo) * 0.35;
    const gx = fn(x + 2, zz) - fn(x - 2, zz), gz = fn(x, zz + 2) - fn(x, zz - 2), yaw = Math.abs(gx) + Math.abs(gz) > 0.3 ? Math.atan2(gx, gz) : Math.floor(hv(zz, x, 6) * 4) * 0.4;
    const cr = hv(x * 2.1, zz * 1.1, 7);
    return { x, y: (base - 2 + top) / 2, z: zz, yaw, sx: w, sy: top - base + 2, sz: d, top, hh: Math.min(hh, top - base), c: vivid ? Math.floor(cr * VIVID.length) : cr < 0.78 ? Math.floor(cr * 5) % 4 : 4 + Math.floor((cr - 0.78) * 14) % 3, r: Math.floor(hv(zz, x, 8) * ROOF.length), v: vivid };
  };
  const list = houses.map((p) => mk(p.x, p.z, heightAt, false));
  for (let r = 0.3; r < 0.9; r += 0.12) {
    const n = Math.floor((TAU * HILL[2] * r) / 6);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + r * 3, off = Math.abs(Math.atan2(Math.sin(a - EA), Math.cos(a - EA)));
      if (off < 0.34) continue; // deja libre la escalera
      list.push(mk(X(HILL[0]) + Math.cos(a) * HILL[2] * r, Z(HILL[1]) + Math.sin(a) * HILL[2] * r, hillH, true));
    }
  }
  shade(list.slice(0, 120), (h) => Math.max(h.sx, h.sz) * 0.8);
  const col = (h) => (h.v ? VIVID[h.c] : BRICK[h.c]);
  inst(box, plain, list, col, { thin: true });
  inst(box, plain, list.map((h) => ({ ...h, y: h.top + 0.3, sy: 0.45, sx: h.sx * 1.1, sz: h.sz * 1.1 })), (h) => ROOF[h.r], { thin: true });
  inst(windowQuads([[-0.25, 0, 0.2, 1], [0.25, 0, 0.2, 1]]), basic(0xffd27a), list.filter((h, i) => i % 3 !== 1).map((h) => ({ x: h.x, y: h.top - h.hh * 0.55, z: h.z, yaw: h.yaw, sx: h.sx, sy: h.hh * 0.4, sz: h.sz })), null, { thin: true });

  // edificios de ladrillo en el valle (con franjas de ventanas que se encienden)
  const mid = grid(med.cx, med.cz, 150, 34, 77).map(([x, zz]) => ({ x, zz })).filter((p) => { const d = Math.hypot(p.x - med.cx, p.zz - med.cz); return d > 60 && d < 150 && farFromRoad(p.x, p.zz, 17) && !blocked(p.x, p.zz) && hv(p.x, p.zz, 31) < 0.5; }).slice(0, 14).map((p, i) => {
    const hh = 12 + hv(p.x, p.zz, 32) * 14, w = 7.5 + hv(p.zz, p.x, 33) * 3, f = foot(p.x, p.zz, 4);
    return { x: p.x, y: f.lo + (hh + f.hi - f.lo) / 2 - 0.3, z: p.zz, yaw: i * 0.5, sx: w, sy: hh + f.hi - f.lo, sz: w * 0.9, c: i };
  });
  shade(mid, (t) => t.sx);
  inst(box, plain, mid, (t) => [0xc65f3e, 0xd0704a, 0xb9553a, 0xe2a36b][t.c % 4]);
  inst(box, plain, mid.map((t) => ({ ...t, y: t.y + t.sy / 2 + 0.4, sy: 0.8, sx: t.sx * 1.08, sz: t.sz * 1.08 })), () => 0x8b8b8b);
  const strip = () => { const p = []; for (const y of [-0.34, -0.17, 0, 0.17, 0.34]) p.push(bake(new THREE.PlaneGeometry(0.8, 0.07), 0xffffff, { y, z: 0.502 }), bake(new THREE.PlaneGeometry(0.8, 0.07), 0xffffff, { y, x: 0.502, ry: Math.PI / 2 })); return merge(p); };
  inst(strip(), basic(0xffe6a0), mid);

  // ---- farolas (luz calida) y luces de club (magenta / cian) a lo largo de las carreteras ----
  const lamps = [], lights = [];
  for (const en of med.entries) {
    const dir = en.centerS < en.edgeS ? 1 : -1;
    for (let k = 0, s = en.centerS + dir * 12; k < 6; k++, s += dir * 20) {
      const r = roadAt(s, en.edge), side = k % 2 ? 1 : -1, x = r.x - r.tz * 8.5 * side, zz = r.z + r.tx * 8.5 * side, h = heightAt(x, zz);
      lamps.push({ x, y: h + 3.4, z: zz, sx: 0.22, sy: 6.8, sz: 0.22 });
      lights.push({ x, y: h + 7.2, z: zz, sx: 1.2, sy: 1.2, sz: 1.2, c: k % 3 === 0 ? 0xff4fd8 : k % 3 === 1 ? 0x42e8ff : 0xffe39a });
    }
  }
  inst(new THREE.CylinderGeometry(1, 1, 1, 5), lambert(0x6b6f7a), lamps);
  inst(new THREE.SphereGeometry(0.7, 6, 5), basic(0xffffff), lights, (l) => l.c);

  // ---- flores de colores (octaedro sobre tallo) en parches ----
  const flowerGeo = C(0.07, 0.07, 1.0, 0, 0.5, 0, 0x3f8f4e, {}, 3);
  const flw = [];
  for (const [cx, cz, r, n, off] of [[PLAZA[0], PLAZA[1], 19, 22, 0], [-40, 95, 28, 22, 3], [60, 100, 30, 24, 5], [-60, -70, 26, 22, 7], [30, -120, 22, 16, 9], [100, 40, 24, 18, 11]]) {
    for (let i = 0; i < n; i++) {
      const a = hv(i, off, 41) * TAU, d = (cx === PLAZA[0] ? 0.85 + hv(i, off, 42) * 0.18 : Math.sqrt(hv(i, off, 43))) * r, x = X(cx) + Math.cos(a) * d, zz = Z(cz) + Math.sin(a) * d;
      if (farFromRoad(x, zz, 9) && !near(x, zz, AREP, 7) && !near(x, zz, BAND, 7)) flw.push({ x, y: heightAt(x, zz), z: zz, sx: 2.6, sy: 2.6, sz: 2.6, yaw: a, c: (i + off) % FLOWER.length });
    }
  }
  inst(flowerGeo, lambert(0xffffff, { vc: true }), flw, (f) => 0xffffff, { thin: true });
  // capullos: otro mesh con el color por instancia
  inst(bake(new THREE.OctahedronGeometry(0.55), 0xffffff, { y: 1.2 }), plain, flw, (f) => FLOWER[f.c], { thin: true });

  // ---- metrocable (hito con contorno): estaciones + torres fusionadas en una malla; cable y cabinas aparte ----
  const N = 6, tow = [], towGeo = [];
  const TH = (i) => (i === 0 || i === N ? 8 : 15 + (i % 2) * 2);
  for (let i = 0; i <= N; i++) {
    const f = i / N, x = A.x + (Bp.x - A.x) * f, zz = A.z + (Bp.z - A.z) * f, g = heightAt(x, zz);
    tow.push({ x, z: zz, g, top: g + TH(i) });
  }
  const yawL = Math.atan2(dx, dz), px = -dz, pz = dx; // pz/px: perpendicular a la linea
  tow.forEach((t, i) => {
    const Ht = TH(i);
    if (i === 0 || i === N) {
      const sg = merge([B(10, 4, 12, 0, -1.4, 0, 0xf2f0e6), ...[[-4.6, -5.6], [4.6, -5.6], [-4.6, 5.6], [4.6, 5.6]].map(([a, b]) => B(0.8, 13, 0.8, a, 2.5, b, 0xf2f0e6)), B(10.8, 0.8, 12.8, 0, 9.4, 0, 0xe2413c), K(6.6, 2.4, 0, 11, 0, 0xe2413c, { ry: Math.PI / 4 }, 4), C(2.0, 2.0, 0.8, 0, Ht + 0.2, 0, 0xe9edf2, { rz: Math.PI / 2 }, 10), B(0.5, 1.2, 0.5, 0, Ht - 0.5, 0, 0x4a4f5c)]);
      towGeo.push(put(sg, t.x, t.z, yawL, 1, t.g));
    } else {
      const tg = merge([C(0.75, 1.15, Ht + 5, -1.5, Ht / 2 - 2.5, 0, 0xf2eee2, {}, 6), C(0.75, 1.15, Ht + 5, 1.5, Ht / 2 - 2.5, 0, 0xf2eee2, {}, 6), B(5.6, 0.7, 1.0, 0, Ht - 0.4, 0, 0xe2413c), B(3.4, 0.5, 0.8, 0, Ht * 0.5, 0, 0xe9e4da), C(0.55, 0.55, 1.1, -1.6, Ht + 0.2, 0, 0x4a4f5c, { rz: Math.PI / 2 }, 8), C(0.55, 0.55, 1.1, 1.6, Ht + 0.2, 0, 0x4a4f5c, { rz: Math.PI / 2 }, 8)]);
      towGeo.push(put(tg, t.x, t.z, yawL, 1, t.g));
    }
  });
  addVC(scene, merge(towGeo), { outline: 0.16 });
  // cables (2 lineas, +-1.6 a los lados), sin contorno
  const cab = [];
  for (const sd of [1, -1]) for (let i = 0; i < N; i++) { const a = tow[i], b = tow[i + 1]; cab.push(beam([a.x + px * 1.6 * sd, a.top + 0.4, a.z + pz * 1.6 * sd], [b.x + px * 1.6 * sd, b.top + 0.4, b.z + pz * 1.6 * sd], 0.16, 0.16, 0x4a4f5c)); }
  addVC(scene, merge(cab));
  // cabinas
  const cabGeo = merge([C(0.1, 0.1, 1.7, 0, 2.5, 0, 0x4a4f5c, {}, 4), B(3.4, 0.35, 3.0, 0, 1.55, 0, 0x4a4f5c), B(3.4, 2.5, 2.8, 0, 0.3, 0, 0xe2413c), B(3.44, 0.75, 2.84, 0, -0.5, 0, 0xffffff),
    B(2.2, 1.0, 2.9, 0, 0.55, 0, 0x8fd3ff), B(3.5, 1.0, 1.8, 0, 0.55, 0, 0x8fd3ff), S(1.9, 0, 1.45, 0, 0xffd23f, { sy: 0.35 }, 8, 4)]);
  const cabIM = inst(cabGeo, lambert(0xffffff, { vc: true }), Array.from({ length: 6 }, () => ({ x: A.x, y: 0, z: A.z, sx: 1.4, sy: 1.4, sz: 1.4 })), () => 0xffffff, { dynamic: true });
  outlineInstanced(scene, cabIM, cabGeo, 0.09);
  const topAt = (f) => { const k = Math.min(N - 1, Math.floor(f * N)), u = f * N - k; return tow[k].top + (tow[k + 1].top - tow[k].top) * u + 0.4; };
  const TR = 38, DW = 3, CYC = 2 * (TR + DW), ease = (u) => u * u * (3 - 2 * u);

  // ---- animados: cabinas, escalones, silleteros, plato de bandeja y vapor ----
  // escalones: 14 plaquitas que suben por la escalera en bucle
  const stepGeo = merge([B(3.6, 0.2, 0.5, 0, 0, 0, 0xffd23f), B(3.6, 0.05, 0.12, 0, 0.12, 0.2, 0xffffff)]);
  const NSTEP = 24, stepIM = inst(stepGeo, lambert(0xffffff, { vc: true }), Array.from({ length: NSTEP }, () => ({ x: 0, y: 0, z: 0 })), () => 0xffffff, { dynamic: true });
  const plen = []; let ptot = 0; for (let i = 0; i < NSEG; i++) { const L = Math.hypot(pp[i + 1][0] - pp[i][0], pp[i + 1][1] - pp[i][1], pp[i + 1][2] - pp[i][2]); plen.push(L); ptot += L; }
  const onPath = (u) => { let d = u * ptot, i = 0; while (i < NSEG - 1 && d > plen[i]) { d -= plen[i]; i++; } const k = d / plen[i], a = pp[i], b = pp[i + 1]; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k + 0.45, a[2] + (b[2] - a[2]) * k, Math.atan2(b[0] - a[0], b[2] - a[2]), -Math.asin((b[1] - a[1]) / plen[i])]; };
  // silleteros
  const silletero = merge([chibi({ top: 0xffffff, bottom: 0x4a3a2a, hair: 0x2a1a14, skin: 0xd9a27a }), C(1.9, 1.9, 0.25, 0, 2.1, -1.0, 0xa9702d, { rx: Math.PI / 2 }, 10),
    ...[[0, 0], ...Array.from({ length: 7 }, (_, i) => [Math.cos(i / 7 * TAU) * 0.85, Math.sin(i / 7 * TAU) * 0.85]), ...Array.from({ length: 11 }, (_, i) => [Math.cos((i + 0.5) / 11 * TAU) * 1.5, Math.sin((i + 0.5) / 11 * TAU) * 1.5])]
      .map(([a, b], i) => bake(new THREE.OctahedronGeometry(0.36), FLOWER[i % FLOWER.length], { x: a, y: 2.1 + b, z: -1.25 - (i === 0 ? 0.15 : 0) }))]);
  const NS = 5, silIM = inst(silletero, lambert(0xffffff, { vc: true }), Array.from({ length: NS }, () => ({ x: PX, y: PH, z: PZ })), () => 0xffffff, { dynamic: true });
  // plato de bandeja paisa (gira) y vapor
  const plate = merge([C(2.5, 2.2, 0.35, 0, 0, 0, 0xfaf6ea, {}, 12), S(0.95, -0.9, 0.5, -0.6, 0x6b3a22, { sy: 0.6 }, 6, 4), S(1.05, 0.6, 0.45, -0.9, 0xffffff, { sy: 0.55 }, 6, 4), B(1.1, 0.3, 0.8, 1.2, 0.3, 0.2, 0xd9884a, { ry: 0.3 }), B(1.0, 0.3, 0.7, 0.2, 0.3, 0.6, 0xc9743a, { ry: -0.2 }),
    C(0.7, 0.7, 0.12, -1.2, 0.3, 0.9, 0xffffff, {}, 8), S(0.28, -1.2, 0.42, 0.9, 0xffc42e, {}, 5, 4), C(0.65, 0.65, 0.28, 1.2, 0.35, 1.0, 0xe9b44c, {}, 8), B(0.4, 0.28, 1.5, -0.3, 0.3, 1.3, 0xf2b53a, { ry: 0.5 }), S(0.55, 1.0, 0.4, -1.3, 0x5aa552, { sy: 0.7 }, 5, 4)]);
  const bx = X(BAND[0]) + 0.0, bz = Z(BAND[1]), bh = heightAt(bx, bz) + 3.05;
  const plateIM = inst(plate, lambert(0xffffff, { vc: true }), [{ x: bx, y: bh, z: bz, sx: 1.5, sy: 1.5, sz: 1.5 }], () => 0xffffff, { dynamic: true });
  const steam = inst(new THREE.SphereGeometry(0.5, 5, 4), lambert(0xffffff), [0, 1, 2].map(() => ({ x: bx, y: bh, z: bz })), () => 0xffffff, { dynamic: true });

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), Sc = new THREE.Vector3();
  const setM = (im, i, x, y, z, rx, ry, rz, sx, sy = sx, sz = sx) => { E.set(rx, ry, rz, 'YXZ'); Q.setFromEuler(E); M.compose(P.set(x, y, z), Q, Sc.set(sx, sy, sz)); im.setMatrixAt(i, M); };
  return {
    update(t) {
      for (let i = 0; i < 6; i++) {
        const tau = (t + (i / 6) * CYC) % CYC; let f, side;
        if (tau < TR) { f = ease(tau / TR); side = 1; } else if (tau < TR + DW) { f = 1; side = 1; } else if (tau < 2 * TR + DW) { f = 1 - ease((tau - TR - DW) / TR); side = -1; } else { f = 0; side = -1; }
        const x = A.x + (Bp.x - A.x) * f + px * 1.6 * side, zz = A.z + (Bp.z - A.z) * f + pz * 1.6 * side;
        setM(cabIM, i, x, topAt(f) - 4.65, zz, 0, yawL, Math.sin(t * 1.3 + i * 2) * 0.05, 1.4);
      }
      cabIM.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < NSTEP; i++) { const p = onPath(((i / NSTEP) + t * 0.05) % 1); setM(stepIM, i, p[0], p[1], p[2], p[4], p[3], 0, 1); }
      stepIM.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < NS; i++) {
        const a = t * 0.085 + (i / NS) * TAU, b = Math.abs(Math.sin(t * 4.2 + i * 1.7)) * 0.3;
        setM(silIM, i, PX + Math.cos(a) * 14.5, PH + 0.35 + b, PZ + Math.sin(a) * 14.5, 0, -a + 0, Math.sin(t * 4.2 + i * 1.7) * 0.07, 1.7);
      }
      silIM.instanceMatrix.needsUpdate = true;
      setM(plateIM, 0, bx, bh, bz, 0.12, t * 0.6, 0, 1.5); plateIM.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < 3; i++) { const u = ((t * 0.35 + i / 3) % 1), s = 0.6 + u * 0.9; setM(steam, i, bx + Math.sin(t + i * 2) * 0.5, bh + 0.8 + u * 4, bz + Math.cos(t * 0.8 + i) * 0.5, 0, 0, 0, s * (1 - u * 0.6)); }
      steam.instanceMatrix.needsUpdate = true;
    },
  };
}
