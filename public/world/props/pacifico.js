// Pacifico (G3b): costa del Choco. Hito: dos ballenas jorobadas que saltan en arco (chorro + salpicadura + anillo de espuma) con contorno.
// Selva lluviosa densa con helechos, lluvia ligera local (LineSegments), palafitos sobre el agua con pasarelas y luz calida, potrillos con
// pescador que se mecen y navegan en circulos lentos, rana dorada en un tronco junto a la carretera, cocoteros y marimba de chonta bajo un toldo
// (las teclas saltan). update(t) lo cablea scene.js. Materiales cel compartidos; solo la lluvia usa un LineBasicMaterial propio (transparente).
import { addOutline } from '../materials.js';
import { RIVER, distPoly } from '../layout.js';
import { Bx, Cy, Sp, Co, Oc, Ic, limb, merge, solid, dynInst, setM, zeroM, plank, palmGeometry, bake } from './caribe/kit.js';

const PI = Math.PI;
const WOOD = 0x7a5230, WOOD2 = 0xb5753c, ZINC = 0x9aa5a8, DARK = 0x3a2418;

export function build(scene, ctx) {
  const { THREE, inst, grid, place, heightAt, roadInfo, roadAt, hash01, ZONE_BY_ID, lambert, basic, shade, windAttr, stats } = ctx;
  const Z = ZONE_BY_ID.pacifico, cx = Z.cx, cz = Z.cz;
  const gy = (x, z) => heightAt(x, z), roadD = (x, z) => roadInfo(x, z).dist;
  const SEA = -0.12;
  const solids = [];
  const free = (x, z, r) => solids.every((s) => Math.hypot(x - s.x, z - s.z) > s.r + r);
  const S = [];
  const put = (parts, x, y, z, yaw = 0, s = 1) => {
    const g = merge(parts); g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s))); S.push(g);
  };
  const rot = (lx, lz, yaw) => [lx * Math.cos(yaw) + lz * Math.sin(yaw), -lx * Math.sin(yaw) + lz * Math.cos(yaw)]; // local -> offset de mundo

  // ---------- palafitos sobre el agua ----------
  const WALL = [0x3fb8e0, 0xd9a05b, 0xfff0c8, 0xe9825a, 0x7ee0b0, 0xffd166];
  const PAL = [[-190, -126], [-194, -98], [-192, 40], [-198, 68], [-193, 98], [-200, 128]].map(([dx, dz], i) => ({ x: cx + dx, z: cz + dz, i }));
  const lights = [];
  for (const p of PAL) {
    const yaw = PI / 2, deck = 2.3, wall = WALL[p.i % WALL.length];
    const P = [Bx(6.6, 0.35, 5.6, WOOD2, { y: deck }), Bx(5.4, 2.7, 4.4, wall, { y: deck + 1.5 }), Bx(5.7, 0.3, 4.7, 0xfff3d6, { y: deck + 2.95 }),
      Bx(6.6, 0.18, 3.1, ZINC, { y: deck + 4.0, z: 1.28, rx: 0.52 }), Bx(6.6, 0.18, 3.1, ZINC, { y: deck + 4.0, z: -1.28, rx: -0.52 }), Bx(6.6, 0.25, 0.3, 0x6e7a7d, { y: deck + 4.55 }),
      Bx(1.3, 2.0, 0.2, WOOD, { x: -1.1, y: deck + 1.35, z: 2.25 }), Bx(0.2, 1.1, 0.9, WOOD, { x: -2.75, y: deck + 1.7, z: 0 }), Bx(1.2, 0.18, 0.5, 0xc7262c, { x: 1.4, y: deck + 0.95, z: 2.45 }),
      Bx(6.6, 0.8, 0.15, WOOD, { y: deck + 0.6, z: 2.85 })];
    for (const [a, b] of [[-3, -2.5], [3, -2.5], [-3, 2.5], [3, 2.5], [0, 2.7]]) P.push(limb([a, -5, b], [a, deck, b], 0.3, 0.26, 5, WOOD, true));
    put(P, p.x, 0, p.z, yaw); solids.push({ x: p.x, z: p.z, r: 5 });
    const [ox, oz] = rot(1.0, 2.3, yaw); lights.push({ x: p.x + ox + 0.1, y: deck + 2.0, z: p.z + oz, sx: 0.2, sy: 1.1, sz: 1.5 });
    // pasarela: de la orilla a la puerta
    const [dx, dz] = rot(-1.1, 3.5, yaw), ex = p.x + dx, ez = p.z + dz, sx0 = cx - 176, sy0 = gy(sx0, ez) + 0.4;
    S.push(plank([sx0, sy0, ez], [ex + 0.3, deck + 0.3, ez], 1.7, 0.25, 0xc99a5e));
    for (let q = 1; q < 3; q++) S.push(limb([sx0 + (ex - sx0) * q / 3, -4, ez - 0.7], [sx0 + (ex - sx0) * q / 3, sy0 + (deck - sy0) * q / 3, ez - 0.7], 0.2, 0.18, 4, WOOD, true));
  }
  inst(new THREE.BoxGeometry(1, 1, 1), basic(0xffe29a), lights);
  shade(PAL.map((p) => ({ x: p.x, z: p.z })), 0.1, 0);

  // ---------- marimba de chonta bajo un toldo (plaza) ----------
  const T = { x: cx - 30, z: cz - 20 }; T.y = gy(T.x, T.z); const TY = PI / 2;
  const toldo = [Bx(9, 0.5, 7, 0x8a5a2b, { y: 0.25 }), Co(7.6, 3.0, 4, 0xc9a24a, { y: 6.9, ry: PI / 4 }), Co(5.4, 1.6, 4, 0xe0bd62, { y: 8.2, ry: PI / 4 }),
    Bx(0.5, 0.25, 0.25, 0xd9b35e, { x: 0, y: 9.2 })];
  for (const a of [-1, 1]) for (const b of [-1, 1]) toldo.push(Cy(0.22, 0.26, 5.6, 6, WOOD, { x: 4.1 * a, y: 3.2, z: 3.1 * b }, true));
  for (const a of [-1, 1]) toldo.push(Bx(0.45, 1.9, 3.6, WOOD2, { x: 3.3 * a, y: 1.4 }), Bx(0.45, 0.3, 3.6, WOOD2, { x: 3.3 * a, y: 2.3 }));
  for (let i = 0; i < 12; i++) toldo.push(Cy(0.17, 0.17, 1.4 + (11 - i) * 0.12, 5, 0xc77c3e, { x: -3.0 + i * 0.55, y: 1.4 - (11 - i) * 0.0, z: 0 }, true));
  // marimbista chibi
  toldo.push(Sp(1.05, 0xe9825a, { y: 1.7, z: -2.7, sy: 1.1 }, 8, 6), Sp(0.95, 0x8a5232, { y: 3.3, z: -2.7 }, 8, 6), Co(1.3, 0.7, 8, 0xf2d27a, { y: 4.1, z: -2.7 }, true), Cy(0.55, 0.6, 1.1, 6, 0xffffff, { y: 0.8, z: -2.7 }, true),
    limb([-0.8, 2.1, -2.5], [-1.6, 3.2, -0.9], 0.2, 0.18, 4, 0x8a5232), limb([0.8, 2.1, -2.5], [1.6, 3.2, -0.9], 0.2, 0.18, 4, 0x8a5232), Sp(0.2, 0xffffff, { x: -1.6, y: 3.2, z: -0.9 }, 4, 3), Sp(0.2, 0xffffff, { x: 1.6, y: 3.2, z: -0.9 }, 4, 3),
    Sp(0.12, 0x1a100a, { x: -0.35, y: 3.4, z: -1.7 }, 4, 3), Sp(0.12, 0x1a100a, { x: 0.35, y: 3.4, z: -1.7 }, 4, 3));
  // puesto de coco con pitillo
  toldo.push(Bx(2.4, 1.4, 2, WOOD2, { x: 7.2, y: 0.7, z: 0.5 }), Sp(0.62, 0x6b4a2b, { x: 6.6, y: 1.9, z: 0.5 }, 7, 5), Cy(0.32, 0.32, 0.12, 7, 0xfff3d6, { x: 6.6, y: 2.4, z: 0.5 }), limb([6.6, 2.4, 0.5], [6.9, 3.7, 0.4], 0.07, 0.07, 4, 0xe5372e), Sp(0.62, 0x6b4a2b, { x: 7.7, y: 1.9, z: 0.8 }, 7, 5), Sp(0.62, 0x6b4a2b, { x: 7.2, y: 1.9, z: -0.1 }, 7, 5));
  put(toldo, T.x, T.y, T.z, TY); solids.push({ x: T.x, z: T.z, r: 8 }); shade([T], 9, 0.8);
  const keysGeo = new THREE.BoxGeometry(0.46, 0.24, 1).translate(0, 0, 0);
  const keys = dynInst(scene, stats, bake(keysGeo, 0xd9a05b), 'vc', 12);
  const keyData = Array.from({ length: 12 }, (_, i) => { const [ox, oz] = rot(-3.0 + i * 0.55, 0, TY); return { x: T.x + ox, z: T.z + oz, len: 3.3 - i * 0.15 }; });

  // ---------- rana dorada junto a la carretera ----------
  const en4 = Z.entries.find((e) => e.other === 'medellin') || Z.entries[0], dir4 = en4.centerS < en4.edgeS ? 1 : -1;
  const rr = roadAt(en4.centerS + dir4 * 42, en4.edge), nx = -rr.tz, nz = rr.tx, FG = { x: rr.x + nx * 9.2, z: rr.z + nz * 9.2 }; FG.y = gy(FG.x, FG.z);
  const logAng = Math.atan2(rr.tx, rr.tz);
  put([Cy(0.9, 1.0, 5.4, 8, 0x6b4a2b, { y: 0.9, rz: PI / 2 }), Cy(0.95, 0.95, 0.15, 8, 0xc99a5e, { x: 2.7, y: 0.9, rz: PI / 2 }), Bx(3.6, 0.12, 2.6, 0x3fa34d, { x: -1.0, y: 0.35, z: 1.9, rz: 0.1 }), Bx(2.4, 0.12, 1.8, 0x2f8f43, { x: 1.2, y: 0.3, z: -1.8, rz: -0.1 }),
    Sp(0.8, 0x2f8f43, { x: -2.6, y: 0.5, z: -0.6, sy: 0.7 }, 5, 4)], FG.x, FG.y, FG.z, logAng + PI / 2);
  solids.push({ x: FG.x, z: FG.z, r: 4 });
  const frogMesh = solid(scene, stats, merge([
    Sp(0.62, 0xffd400, { y: 0.55, sx: 1.05, sy: 0.85, sz: 1.2 }, 8, 6), Sp(0.34, 0xffe97a, { y: 0.4, z: 0.3, sx: 1.0, sy: 0.7 }, 6, 4),
    Sp(0.2, 0xffd400, { x: -0.3, y: 1.05, z: 0.45 }, 5, 4), Sp(0.2, 0xffd400, { x: 0.3, y: 1.05, z: 0.45 }, 5, 4), Sp(0.11, 0x1a100a, { x: -0.3, y: 1.12, z: 0.62 }, 4, 3), Sp(0.11, 0x1a100a, { x: 0.3, y: 1.12, z: 0.62 }, 4, 3),
    Sp(0.3, 0xe6bf00, { x: -0.62, y: 0.3, z: -0.55, sx: 0.5, sz: 1.5 }, 5, 4), Sp(0.3, 0xe6bf00, { x: 0.62, y: 0.3, z: -0.55, sx: 0.5, sz: 1.5 }, 5, 4),
    Cy(0.11, 0.1, 0.6, 4, 0xe6bf00, { x: -0.4, y: 0.3, z: 0.6, rx: 0.4 }), Cy(0.11, 0.1, 0.6, 4, 0xe6bf00, { x: 0.4, y: 0.3, z: 0.6, rx: 0.4 }),
  ]), { x: FG.x, y: FG.y + 1.85, z: FG.z });
  frogMesh.scale.setScalar(1.9); frogMesh.rotation.y = Math.atan2(-nx, -nz); frogMesh.position.x = FG.x; const frogBase = FG.y + 1.85;

  // ---------- selva lluviosa: arboles (tronco + copa de 3 esferas), helechos, cocoteros ----------
  const treeGeo = windAttr(merge([limb([0, -0.5, 0], [0.3, 9, 0], 0.55, 0.38, 5, 0x7a5230), Ic(3.8, 0x1c6b3c, { x: 0.3, y: 10.8 }), Ic(3.1, 0x25804a, { x: 2.2, y: 8.9, z: 1 }), Ic(2.8, 0x15573a, { x: -1.8, y: 9.3, z: -1.1 })]), 14, 0.12);
  const trees = place(grid(cx, cz, 320, 14, 21), (x, z) => {
    const h = gy(x, z), d = Math.hypot(x - cx, z - cz);
    if (h < 1.6 || h > 90 || d > 330 || roadD(x, z) < 12.5 || distPoly(x, z, RIVER.pts) < 14 || !free(x, z, 4)) return false;
    if (d < 48 || (x < cx - 150)) return false; // la plaza y la costa quedan despejadas
    return hash01(x * 0.41, z * 0.37) < 0.7 && h;
  }, (x, z, h) => ({ x, y: h, z, yaw: hash01(x, z) * 6.28, sx: 0.9 + hash01(x, z) * 0.6, sy: 0.8 + hash01(z, x) * 0.7, sz: 0.9 + hash01(x, z + 1) * 0.6 })).slice(0, 180);
  inst(treeGeo, lambert(0xffffff, { wind: true, vc: true }), trees, null, { thin: true });
  shade(trees.slice(0, 40), 3.4, 0.9);
  const fernGeo = windAttr(merge([0, 1, 2].map((k) => bake(new THREE.ConeGeometry(0.6, 3, 4, 1, true).translate(0, 1.5, 0), k % 2 ? 0x3fa34d : 0x2f8f43, { ry: k * 2.1, rz: 0.75 }))), 2.5, 0.18);
  const ferns = place(grid(cx, cz, 150, 9, 3), (x, z) => {
    const h = gy(x, z), d = Math.hypot(x - cx, z - cz);
    return h > 1.5 && d > 30 && roadD(x, z) > 7.5 && x > cx - 165 && free(x, z, 1.5) && distPoly(x, z, RIVER.pts) > 8 && hash01(x * 0.8, z * 0.8) < 0.3 && h;
  }, (x, z, h) => ({ x, y: h - 0.1, z, yaw: hash01(x, z) * 6.28, sx: 0.8 + hash01(z, x), sy: 0.8 + hash01(z + 1, x), sz: 0.8 + hash01(x, z) })).slice(0, 110);
  inst(fernGeo, lambert(0xffffff, { wind: true, vc: true }), ferns, null, { thin: true });
  const palmG = palmGeometry(windAttr, { leaf: [0x4aa955, 0x3a9a4c], coco: 0x6b4a2b });
  const palms = place(grid(cx, cz, 190, 12, 8), (x, z) => {
    const h = gy(x, z); const beach = x < cx - 140 && x > cx - 182;
    return h > 0.9 && h < 9 && roadD(x, z) > 12 && free(x, z, 3) && distPoly(x, z, RIVER.pts) > 12 && Math.hypot(x - cx, z - cz) > 26 && hash01(x * 0.7, z * 0.5) < (beach ? 0.4 : 0.12) && h;
  }, (x, z, h) => ({ x, y: h - 0.2, z, yaw: hash01(x, z) * 6.28, sy: 0.85 + hash01(z, x) * 0.5, sx: 1, sz: 1 })).slice(0, 50);
  inst(palmG, lambert(0xffffff, { wind: true, vc: true }), palms, null, { thin: true });

  // ---------- potrillos (canoas) con pescador ----------
  const canoe = merge([
    Bx(1.3, 0.5, 5.4, 0x8a5a2b, { y: 0.1 }), Bx(1.9, 0.5, 5.0, 0xa56a33, { y: 0.55 }), Bx(2.3, 0.35, 4.2, 0xb5753c, { y: 0.95 }), Bx(1.5, 0.12, 3.6, 0x4a2e22, { y: 1.15 }),
    Co(0.85, 1.6, 4, 0x8a5a2b, { y: 0.55, z: 3.1, rx: PI / 2, ry: PI / 4, sy: 1 }, true), Co(0.85, 1.6, 4, 0x8a5a2b, { y: 0.55, z: -3.1, rx: -PI / 2, ry: PI / 4 }, true),
    Sp(0.75, 0xe5372e, { y: 1.95, z: -0.4, sy: 1.1 }, 7, 5), Sp(0.62, 0x8a5232, { y: 2.85, z: -0.4 }, 7, 5), Co(1.05, 0.55, 8, 0xf2d27a, { y: 3.4, z: -0.4 }, true),
    limb([0.6, 2.1, -0.2], [1.5, 1.2, 0.9], 0.14, 0.12, 4, 0x8a5232), limb([1.5, 1.2, 0.9], [2.4, -0.4, 1.9], 0.07, 0.07, 4, 0x6b4a2b), Bx(0.15, 0.9, 0.5, 0xb5753c, { x: 2.5, y: -0.55, z: 2.1, rx: 0.6 }),
  ]);
  const CN = [[-206, -44], [-198, -14], [-212, 14], [-204, 150], [-205, -150], [-200, 100]].map(([dx, dz], i) => ({ cx0: cx + dx, cz0: cz + dz, R: 6 + (i % 3) * 2.5, w: (0.07 + 0.012 * i) * (i % 2 ? -1 : 1), ph: i * 1.9, s: 1.15 + (i % 3) * 0.15 }));
  const canoes = dynInst(scene, stats, canoe, 'vc', CN.length);

  // ---------- ballenas jorobadas (hito) ----------
  const BLUE = 0x5c7fa3, WHITE = 0xf1f6fa;
  const whaleGeo = merge([
    Sp(1, (x, y) => (y < -0.45 ? WHITE : BLUE), { sx: 1.9, sy: 1.8, sz: 5.2 }, 10, 8),
    Sp(0.3, 0x14222f, { x: 1.62, y: 0.2, z: 3.4 }, 4, 3), Sp(0.3, 0x14222f, { x: -1.62, y: 0.2, z: 3.4 }, 4, 3),
    Sp(1, 0xe6eef5, { x: 2.1, y: -1.0, z: 1.2, sx: 2.5, sy: 0.17, sz: 0.65, rz: -0.45 }, 6, 4), Sp(1, 0xe6eef5, { x: -2.1, y: -1.0, z: 1.2, sx: 2.5, sy: 0.17, sz: 0.65, rz: 0.45 }, 6, 4),
    Co(1.7, 4.8, 6, BLUE, { y: 0.1, z: -6.1, rx: -PI / 2 }, true), Co(0.45, 1.2, 4, BLUE, { y: 1.9, z: -3.2, rx: -0.35 }, true),
    Sp(1, BLUE, { x: 2.0, y: 0.15, z: -9.0, sx: 2.5, sy: 0.15, sz: 0.95, ry: -0.35 }, 6, 4), Sp(1, BLUE, { x: -2.0, y: 0.15, z: -9.0, sx: 2.5, sy: 0.15, sz: 0.95, ry: 0.35 }, 6, 4),
    Sp(0.35, 0xe6eef5, { y: -1.0, z: 4.0, sx: 2.2, sy: 0.6, sz: 1.2 }, 5, 4),
  ]);
  const TJ = 3.5, H = 21;
  const WH = [
    { ax: cx - 212, az: cz - 36, bx: cx - 224, bz: cz - 8, per: 9.6, ph: 2.0 },
    { ax: cx - 246, az: cz + 42, bx: cx - 234, bz: cz + 14, per: 11.4, ph: 7.5 },
  ];
  WH.forEach((w, i) => { w.id = i; w.mesh = solid(scene, stats, whaleGeo, { outline: { thickness: 0.12 }, addOutline }); w.mesh.rotation.order = 'YXZ'; w.mesh.scale.setScalar(1.8); w.mesh.visible = false; w.dx = w.bx - w.ax; w.dz = w.bz - w.az; w.len = Math.hypot(w.dx, w.dz); w.yaw = Math.atan2(w.dx, w.dz); });
  const drops = dynInst(scene, stats, new THREE.OctahedronGeometry(0.5), 'plain', WH.length * 20, Array(WH.length * 20).fill(0xffffff));
  const rings = dynInst(scene, stats, new THREE.TorusGeometry(1, 0.14, 4, 14).rotateX(PI / 2), 'plain', WH.length * 2, Array(WH.length * 2).fill(0xffffff));
  const SE = 0.05, SN = 0.95, LIFE = 1.9;
  const whaleUpdate = (w, t) => {
    const u = (t + w.ph) % w.per, s = u / TJ;
    if (u < TJ) {
      const y = -5.5 + H * 4 * s * (1 - s), dy = H * 4 * (1 - 2 * s), pitch = -Math.atan2(dy, w.len);
      w.mesh.visible = true; w.mesh.position.set(w.ax + w.dx * s, y, w.az + w.dz * s); w.mesh.rotation.set(pitch, w.yaw, Math.sin(s * PI) * 0.8 * (w.id ? -1 : 1));
    } else w.mesh.visible = false;
    const ev = [[SE * TJ, w.ax + w.dx * SE, w.az + w.dz * SE], [SN * TJ, w.ax + w.dx * SN, w.az + w.dz * SN]];
    ev.forEach(([te, ex, ez], k) => {
      const tau = u - te, on = tau >= 0 && tau < LIFE, base = w.id * 20;
      for (let q = 0; q < 10; q++) {
        const idx = base + (k ? 10 : 0) + q;
        if (!on) { zeroM(drops, idx); continue; }
        const spout = k === 0 && q < 5, a = hash01(q + 3, 40 + w.id * 7 + k) * 6.28, vh = spout ? 0.8 : 3 + hash01(q, 90 + k) * 3, vy = spout ? 9 + hash01(q + 11, 5) * 4 : 5 + hash01(q + 5, 8 + k) * 4;
        const sc = (spout ? 0.7 : 0.55) * (1 - tau / LIFE);
        setM(drops, idx, ex + Math.cos(a) * vh * tau, SEA + 0.2 + vy * tau - 6 * tau * tau, ez + Math.sin(a) * vh * tau, 0, 0, 0, Math.max(sc, 0.001));
      }
      const ri = w.id * 2 + k;
      if (on) { const kk = 1.5 + tau * 7; setM(rings, ri, ex, SEA + 0.12, ez, 0, 0, 0, kk, 1, kk); } else zeroM(rings, ri);
    });
  };

  // ---------- lluvia ligera local (LineSegments, caja sobre la zona) ----------
  const NR = 650, RH = 36, rainPos = new Float32Array(NR * 6), RB = [];
  for (let i = 0; i < NR; i++) RB.push([cx - 135 + hash01(i * 3 + 1, 5) * 270 + hash01(i, 2) * 0.99, cz - 135 + hash01(i * 7 + 2, 9) * 270 + hash01(i, 4) * 0.99, 22 + hash01(i, 8) * 16, hash01(i * 5, 3) * RH]);
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
  rainGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 22, cz), 210);
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xd4ebf2, transparent: true, opacity: 0.5, depthWrite: false })); rain.frustumCulled = true; scene.add(rain); stats.draws++;
  const RY0 = 3;
  const rainUpdate = (t) => {
    for (let i = 0; i < NR; i++) {
      const [bx, bz, sp, off] = RB[i], f = (t * sp + off) % RH, y = RY0 + RH - f, o = i * 6, sl = f * 0.1;
      rainPos[o] = bx + sl; rainPos[o + 1] = y; rainPos[o + 2] = bz; rainPos[o + 3] = bx + sl + 0.12; rainPos[o + 4] = y - 2.2; rainPos[o + 5] = bz;
    }
    rainGeo.attributes.position.needsUpdate = true;
  };

  // ---------- fusion de lo fijo ----------
  solid(scene, stats, merge(S));

  // ---------- animacion ----------
  const update = (t) => {
    for (const w of WH) whaleUpdate(w, t);
    drops.instanceMatrix.needsUpdate = true; rings.instanceMatrix.needsUpdate = true;
    CN.forEach((c, i) => {
      const th = c.w * t + c.ph, x = c.cx0 + Math.cos(th) * c.R, z = c.cz0 + Math.sin(th) * c.R, dirx = -Math.sin(th) * Math.sign(c.w), dirz = Math.cos(th) * Math.sign(c.w);
      setM(canoes, i, x, SEA + 0.05 + Math.sin(t * 1.3 + c.ph) * 0.12, z, Math.atan2(dirx, dirz), Math.sin(t * 1.1 + c.ph) * 0.04, Math.sin(t * 1.5 + c.ph * 2) * 0.07, c.s);
    });
    canoes.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 12; i++) { const k = keyData[i], b = Math.pow(Math.max(0, Math.sin(t * 6.2 + i * 0.9)), 3) * 0.13; setM(keys, i, k.x, T.y + 2.65 + b, k.z, TY, 0, 0, 1, 1, k.len); }
    keys.instanceMatrix.needsUpdate = true;
    const u = (t % 4.2) / 4.2, hop = u < 0.14 ? Math.sin(u / 0.14 * PI) * 1.5 : 0;
    frogMesh.position.y = frogBase + hop; frogMesh.scale.set(1.9, 1.9 * (1 + Math.sin(t * 5) * 0.035) * (hop > 0 ? 1.12 : 1), 1.9); frogMesh.rotation.x = hop > 0 ? -0.35 : 0;
    rainUpdate(t);
  };
  update(0);
  return { update };
}
