// Llanos (G3b): sabana dorada con pasto al viento, morichales junto a un cano de colores tipo Cano Cristales, chiguiros (con crias) y garzas,
// llanero a caballo (hito, con contorno) que trota en un circuito lento, vacas, casa llanera con corral y fogon con carne a la llanera y humo.
// Piezas con vertex colors fusionadas; las animaciones (CPU, ~40 matrices) se devuelven en `update(t)` (scene.js ya la cablea).
import { windAttr } from '../geo.js';
import { box, ball, seg, put, mesh, dynInst, setM, done, count, bake, merge, mixc, smoothstep, addOutline } from './llanos/kit.js';

export function build(scene, ctx) {
  const { THREE, inst, heightAt, hash01, ZONE_BY_ID, lambert, basic, shade, stats, roadInfo } = ctx;
  const Z = ZONE_BY_ID.llanos, gy = heightAt, C = { x: Z.cx, z: Z.cz };
  const OX = C.x - 900; // G4: la region cambio de lugar; las coordenadas absolutas originales (centro en x = 900) se desplazan
  const root = new THREE.Group(); root.name = 'llanos'; scene.add(root);
  const mats = (arr) => { const g = merge(arr); const m = mesh(root, g); count(stats, g); return m; };
  const sin = Math.sin, cos = Math.cos;

  // ------------------------------------------------------------ Cano de colores
  const spineZ = (x) => C.z + 38 + 8 * sin((x - OX - 780) / 34) + (x - C.x) * 0.03;
  const wy = (x, z) => Math.max(gy(x, z), gy(x + 4, z), gy(x - 4, z), gy(x, z + 4), gy(x, z - 4)) + 0.55; // nivel del agua (sobre las facetas del terreno)
  const X0 = 780 + OX, X1 = 1040 + OX, STEP = 6;
  const BANDS = [[-5.2, -3.6, 0xf6d13e], [-3.6, -2.0, 0xd8283a], [-2.0, -0.5, 0x3ea85a], [-0.5, 1.0, 0x36b9e6], [1.0, 2.8, 0xe04a3e], [2.8, 5.2, 0xf2c24a]];
  {
    const pos = [], col = [], nor = [], lc = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
    const pt = (x, off) => { // punto del borde `off` (perpendicular al eje en x)
      const dz = (spineZ(x + 0.5) - spineZ(x - 0.5)), l = Math.hypot(1, dz), nx = -dz / l, nz = 1 / l, px = x + nx * off, pz = spineZ(x) + nz * off;
      return [px, wy(px, pz), pz];
    };
    for (let x = X0; x < X1; x += STEP) for (const [o0, o1, hex] of BANDS) {
      const j = 1 + 0.05 * (hash01(x * 0.5, o0 * 3) - 0.5), c = lc(hex).map((v) => v * j);
      const a = pt(x, o0), b = pt(x, o1), d = pt(x + STEP, o0), e = pt(x + STEP, o1);
      for (const v of [a, b, d, b, e, d]) { pos.push(...v); col.push(...c); nor.push(0, 1, 0); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    mesh(root, g); count(stats, g);
    // rocas redondeadas dentro y a los bordes del cano
    const rocks = [];
    for (let k = 0; k < 26; k++) {
      const x = X0 + 10 + hash01(k, 5) * (X1 - X0 - 20), off = (hash01(5, k) - 0.5) * 11, z = spineZ(x) + off;
      rocks.push({ x, y: wy(x, z) + 0.1, z, yaw: k, sx: 0.8 + hash01(k, k) * 1.2, sy: 0.55 + hash01(k, 2) * 0.5, sz: 0.8 + hash01(2, k) * 1.2 });
    }
    inst(new THREE.IcosahedronGeometry(1, 0), lambert(0xffffff), rocks, (r, i) => [0x8a7f75, 0xa59582, 0x6b5f58, 0xb06a4a][i % 4]);
  }

  // ------------------------------------------------------------ Morichales
  const palmGeo = (() => {
    const P = [seg([0, 0, 0], [0.3, 6, 0.1], 0.55, 0.4, 0x9c7448, 6), seg([0.3, 6, 0.1], [0.1, 11.5, 0], 0.4, 0.3, 0xb38452, 6)];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, dx = cos(a), dz = sin(a);
      P.push(seg([0.1, 11.6, 0], [0.1 + dx * 5.2, 10.3 + (i % 2) * 0.5, dz * 5.2], 0.5, 0.06, i % 2 ? 0x6cb24a : 0x84c25a, 4));
      P.push(seg([0.1 + dx * 2.2, 11.6, dz * 2.2], [0.1 + dx * 4.6, 9.6, dz * 4.6], 0.4, 0.05, i % 2 ? 0x5aa23e : 0x74b44c, 4));
    }
    P.push(ball(0.7, 0xd9a05b, { y: 11, x: 0.1 }, 5, 4));
    return windAttr(merge(P), 12, 0.35);
  })();
  const palms = [];
  const groups = [[840 + OX, -1, 16, 6], [972 + OX, 1, 14, 7], [1034 + OX, -1, 14, 6], [905 + OX, 1, 17, 4]];
  groups.forEach(([gx, side, dist, n], gi) => {
    for (let k = 0; k < n; k++) {
      const x = gx + (hash01(k, gi) - 0.5) * 30, off = side * (dist + hash01(gi, k) * 12), z = spineZ(x) + off;
      if (roadInfo(x, z).dist > 14) palms.push({ x, y: gy(x, z), z, sx: 1, sy: 0.85 + hash01(x, z) * 0.5, sz: 1, yaw: k * 1.9 });
    }
  });
  inst(palmGeo, lambert(0xffffff, { wind: true, vc: true }), palms); shade(palms, 2.6);

  // ------------------------------------------------------------ Pasto de sabana (viento)
  {
    const gTuft = windAttr(merge([0, 1, 2].map((i) => {
      const a = i * 2.1; return bake(new THREE.ConeGeometry(0.42, 2.6, 3, 1, true), (x, y) => mixc(0xa89a44, 0xf0dc7a, smoothstep(0, 2.6, y)), { x: cos(a) * 0.35, z: sin(a) * 0.35, y: 1.3, rz: cos(a) * 0.15, rx: sin(a) * 0.15 });
    })), 2.6, 0.25);
    const pts = [];
    for (let i = 0; i < 400 && pts.length < 260; i++) {
      const a = hash01(i, 3) * 6.283, r = Math.sqrt(hash01(7, i)) * 125, x = C.x + cos(a) * r, z = C.z + sin(a) * r;
      if (roadInfo(x, z).dist < 8 || Math.abs(z - spineZ(x)) < 7.5 && x > X0 - 10 && x < X1 + 10) continue;
      pts.push({ x, y: gy(x, z), z, yaw: hash01(i, 9) * 6, sx: 0.6 + hash01(i, 1) * 0.5, sy: 0.55 + hash01(i, 2) * 0.6, sz: 1 });
    }
    inst(gTuft, lambert(0xffffff, { wind: true, vc: true }), pts, (p) => [0xffffff, 0xf2e6c0, 0xe6d9a0][Math.floor(hash01(p.x, p.z) * 3)], { thin: true });
  }

  // ------------------------------------------------------------ Casa llanera + corral + fogon
  const HOUSE = { x: C.x + 38, z: C.z - 84 }, COR = { x: C.x + 92, z: C.z - 70 }, FIRE = { x: C.x - 28, z: C.z - 50 };
  {
    const mk = () => {
      const P = [], T = 0xc8a04a;
      P.push(box(17, 0.8, 12, 0xb98b5e, { y: 0.4 }));
      for (const [px, pz] of [[-7.5, -5], [7.5, -5], [-7.5, 5], [7.5, 5], [0, 5], [-3.7, 5]]) P.push(seg([px, 0, pz], [px, 6.2, pz], 0.45, 0.4, 0x6b4a2e, 5));
      P.push(box(15, 5.2, 0.6, 0xf3e5ab, { y: 3.2, z: -5 }), box(0.6, 5.2, 10, 0xf3e5ab, { x: -7.5, y: 3.2 }), box(0.6, 5.2, 10, 0xf3e5ab, { x: 7.5, y: 3.2 }));
      P.push(box(15.2, 0.5, 0.7, 0x8a5a2b, { y: 2, z: -5 }), box(15.2, 0.5, 0.7, 0x8a5a2b, { y: 5.2, z: -5 }), box(2.2, 3.6, 0.7, 0x5b3a22, { x: 4, y: 2.5, z: -4.8 }));
      P.push(bake(new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4), (x, y) => mixc(0xa4802e, T, smoothstep(5.8, 12, y)), { y: 9.1, sx: 12, sy: 6.2, sz: 9.6 }));
      P.push(bake(new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4), 0x8a6a2a, { y: 6.1, sx: 12.6, sy: 0.7, sz: 10.2 }), ball(0.9, 0xdbb860, { y: 12.4, sy: 1.3 }, 5, 4));
      P.push(seg([-3.7, 4.4, 5], [-1.8, 2.6, 5], 0.12, 0.12, 0xe2584d, 4), seg([-1.8, 2.6, 5], [0, 2.4, 5], 0.4, 0.4, 0xffffff, 4), seg([0, 2.4, 5], [1.5, 4.4, 5], 0.12, 0.12, 0xe2584d, 4));
      return merge(P);
    };
    const F = [];
    F.push(put(mk(), HOUSE.x, gy(HOUSE.x, HOUSE.z), HOUSE.z, 0.15));
    shade([HOUSE], 10);
    // corral de cercas (cajas): 30 x 20
    const cw = 30, cd = 20, cy = gy(COR.x, COR.z);
    const posts = [], rails = [];
    for (let i = 0; i <= 6; i++) for (const sz of [-1, 1]) posts.push([-cw / 2 + i * cw / 6, sz * cd / 2]);
    for (let j = 1; j < 4; j++) for (const sx of [-1, 1]) posts.push([sx * cw / 2, -cd / 2 + j * cd / 4]);
    const cg = [];
    for (const [px, pz] of posts) cg.push(box(0.6, 3, 0.6, 0x6b4a2e, { x: px, y: 1.5, z: pz }));
    for (const yy of [1.1, 2.2]) {
      for (const sz of [-1, 1]) cg.push(box(cw, 0.35, 0.3, 0x8a5a2b, { y: yy, z: sz * cd / 2 }));
      for (const sx of [-1, 1]) cg.push(box(0.3, 0.35, cd, 0x8a5a2b, { x: sx * cw / 2, y: yy }));
    }
    F.push(put(merge(cg), COR.x, cy, COR.z, 0));
    // fogon + mamona: aro de piedras, brasa (separada, brilla de noche), leña y estacas inclinadas con carne
    const fg = [], fy = gy(FIRE.x, FIRE.z);
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; fg.push(ball(0.75, i % 2 ? 0x8a7f75 : 0xa59582, { x: cos(a) * 2.6, y: 0.4, z: sin(a) * 2.6, sy: 0.7 }, 5, 4)); }
    fg.push(seg([-1.6, 0.5, -0.8], [1.5, 0.9, 1.0], 0.35, 0.35, 0x4a3524, 5), seg([-1.4, 0.9, 1.1], [1.6, 0.5, -0.9], 0.35, 0.35, 0x3a2a1c, 5));
    for (let i = 0; i < 5; i++) {
      const a = 0.35 + i / 5 * 6.283, dx = cos(a), dz = sin(a), tx = dx * 3.9, tz = dz * 3.9;
      fg.push(seg([tx, 0, tz], [dx * 1.1, 4.1, dz * 1.1], 0.2, 0.15, 0x6b4a2e, 4)); // estaca inclinada hacia el fuego
      const mx = dx * 2.0, mz = dz * 2.0;
      fg.push(bake(new THREE.CylinderGeometry(0.72, 0.82, 2.5, 6), (x, y) => mixc(0x8a3f1f, 0xb5622e, smoothstep(0.4, 2.6, y)), { x: mx, y: 2.6, z: mz, rx: -dz * 0.4, rz: dx * 0.4 })); // costillar / lomo
      fg.push(bake(new THREE.TorusGeometry(0.76, 0.12, 4, 8), 0xf0d9a8, { x: mx, y: 2.6, z: mz, rx: Math.PI / 2 - dz * 0.4, rz: dx * 0.4 })); // grasa dorada
    }
    F.push(put(merge(fg), FIRE.x, fy, FIRE.z, 0));
    shade([{ x: FIRE.x, z: FIRE.z }], 4.2);
    mats(F);
    inst(new THREE.CylinderGeometry(1.8, 2, 0.5, 8), basic(0xff6a1f), [{ x: FIRE.x, y: fy + 0.4, z: FIRE.z }]);
  }

  // ------------------------------------------------------------ Animales (+z adelante)
  const COW_W = 0xffffff, DARK = 0x2a2220;
  const cowGeo = merge([
    bake(new THREE.SphereGeometry(1.35, 7, 5), (x, y, z) => ((sin(x * 2.3 + z * 1.4) + sin(z * 2.9 - y * 1.7) > 0.95) ? lin3(0x3a2a24) : lin3(COW_W)), { sx: 0.95, sy: 0.9, sz: 1.5, y: 2.5 }),
    ball(0.85, COW_W, { y: 3.1, z: 2.5 }, 7, 5), ball(0.55, 0xf0b8a8, { y: 2.65, z: 3.2, sy: 0.8 }, 6, 4), ball(0.12, DARK, { x: -0.3, y: 2.7, z: 3.7 }, 4, 3), ball(0.12, DARK, { x: 0.3, y: 2.7, z: 3.7 }, 4, 3),
    ...[-1, 1].flatMap((s) => [ball(0.38, 0xd7b79a, { x: s * 0.95, y: 3.2, z: 2.2, sy: 0.5, sz: 0.9 }, 5, 3), bake(new THREE.ConeGeometry(0.2, 0.8, 4), 0xf3e5ab, { x: s * 0.5, y: 3.95, z: 2.35, rz: -s * 0.5 })]),
    ...[[-0.7, -1.4], [0.7, -1.4], [-0.7, 1.3], [0.7, 1.3]].map(([x, z]) => seg([x, 1.7, z], [x, 0, z], 0.32, 0.26, 0xe6d9c0, 5)), seg([0, 3, -2.1], [0, 1.4, -2.5], 0.12, 0.08, DARK, 3),
  ]);
  function lin3(hex) { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }
  const CPOS = [[C.x + 128, C.z + 6, 1], [C.x + 112, C.z + 24, 4], [C.x + 136, C.z - 14, 2.2], [C.x + 120, C.z - 4, 5.1], [C.x + 104, C.z + 6, 0.4],
    [COR.x - 6, COR.z + 1, 3.3], [COR.x + 5, COR.z - 3, 1.2], [COR.x + 1, COR.z + 4, 4.4]];
  const cowTint = [0xffffff, 0xe8c9a0, 0xb8845a, 0xffffff, 0xd9b38c, 0xffffff, 0xe8c9a0, 0xb8845a, 0xffffff, 0xd9b38c].slice(0, CPOS.length);
  const cows = dynInst(root, cowGeo, CPOS.length, cowTint); count(stats, cowGeo, CPOS.length); shade(CPOS.map(([x, z]) => ({ x, z })), 2.6);

  const capyGeo = merge([
    ball(1.1, 0x9a6b3f, { sx: 1.0, sy: 0.88, sz: 1.65, y: 1.35 }, 9, 7), ball(0.9, 0x8d6038, { y: 1.65, z: 1.9, sz: 1.1 }, 7, 6), ball(0.72, 0x7a5330, { y: 1.35, z: 2.7, sx: 1.05, sy: 0.9 }, 6, 5),
    ball(0.2, 0x2a1810, { x: -0.24, y: 1.55, z: 3.3 }, 4, 3), ball(0.2, 0x2a1810, { x: 0.24, y: 1.55, z: 3.3 }, 4, 3), ball(0.13, 0x1a1210, { x: -0.55, y: 2.0, z: 2.45 }, 4, 3), ball(0.13, 0x1a1210, { x: 0.55, y: 2.0, z: 2.45 }, 4, 3),
    ball(0.28, 0x6b4a2e, { x: -0.45, y: 2.45, z: 1.6, sy: 0.8 }, 5, 4), ball(0.28, 0x6b4a2e, { x: 0.45, y: 2.45, z: 1.6, sy: 0.8 }, 5, 4),
    ...[[-0.6, -1.0], [0.6, -1.0], [-0.6, 1.1], [0.6, 1.1]].map(([x, z]) => seg([x, 0.8, z], [x, 0, z], 0.32, 0.28, 0x6b4a2e, 5)),
  ]);
  const capyAt = (x0, off, y) => ({ x: x0, z: spineZ(x0) + off });
  const CAP = [
    { ...capyAt(880 + OX, -7.2), s: 1.15, yaw: 0.2, kind: 'mom' }, { ...capyAt(890 + OX, -6.5), s: 1.0, yaw: 0.6, kind: 'drink' },
    { ...capyAt(873 + OX, -8.8), s: 0.5, yaw: 0.3, kind: 'baby' }, { ...capyAt(870 + OX, -10.5), s: 0.45, yaw: 0.1, kind: 'baby' }, { ...capyAt(877 + OX, -11), s: 0.42, yaw: 0.5, kind: 'baby' },
  ];
  const capys = dynInst(root, capyGeo, CAP.length); count(stats, capyGeo, CAP.length); shade(CAP.filter((c) => c.s > 0.8), 2.4);

  // garzas: 4 posadas (en el cano) y 2 en vuelo
  const heronBody = (flying) => merge([
    ball(0.85, 0xffffff, { y: 3.7, sx: 0.7, sy: 0.85, sz: 1.6 }, 8, 6), bake(new THREE.ConeGeometry(0.45, 1.4, 5), 0xf3f0e6, { y: 3.7, z: -1.9, rx: -Math.PI / 2 }),
    seg([0, 4.0, 1.0], [0, 5.3, 1.7], 0.3, 0.24, 0xffffff, 5), seg([0, 5.3, 1.7], [0, 6.7, 1.3], 0.24, 0.2, 0xffffff, 5), ball(0.42, 0xffffff, { y: 7, z: 1.5 }, 6, 5),
    bake(new THREE.ConeGeometry(0.2, 1.5, 4), 0xf0a020, { y: 6.95, z: 2.6, rx: Math.PI / 2 }), ball(0.09, 0x1a1210, { x: 0.22, y: 7.15, z: 1.8 }, 3, 3), ball(0.09, 0x1a1210, { x: -0.22, y: 7.15, z: 1.8 }, 3, 3),
    ...(flying ? [seg([-0.2, 3.3, -0.9], [-0.2, 3.0, -3.6], 0.1, 0.07, 0xd9a030, 3), seg([0.2, 3.3, -0.9], [0.2, 3.0, -3.6], 0.1, 0.07, 0xd9a030, 3)]
      : [seg([-0.25, 3.2, 0], [-0.25, 0, 0.1], 0.1, 0.08, 0xd9a030, 3), seg([0.25, 3.2, 0], [0.25, 0, 0.1], 0.1, 0.08, 0xd9a030, 3)]),
  ]);
  const wingG = (s) => bake(new THREE.SphereGeometry(1, 8, 4), 0xffffff, { x: s * 2.4, sx: 2.5, sy: 0.12, sz: 1.2 });
  const HER = [[905 + OX, 0.6], [925 + OX, -1.2], [948 + OX, 1.4], [962 + OX, -0.8]].map(([x, off], i) => ({ x, z: spineZ(x) + off, yaw: 0.8 + i * 1.7 }));
  const herons = dynInst(root, heronBody(false), HER.length); count(stats, heronBody(false), HER.length);
  const FL = 2, flyBody = dynInst(root, heronBody(true), FL), wR = dynInst(root, wingG(1), FL), wL = dynInst(root, wingG(-1), FL);
  count(stats, heronBody(true), FL); count(stats, wingG(1), FL); count(stats, wingG(-1), FL);

  // ------------------------------------------------------------ Llanero a caballo (hito, con contorno)
  const HC = { x: C.x + 52, z: C.z + 4, rx: 24, rz: 15 }, HS = 1.3;
  const HORSE = 0x8a5a2b, SKIN = 0xd9a066;
  const hBody = merge([
    bake(new THREE.SphereGeometry(1.5, 10, 8), HORSE, { sx: 0.9, sy: 0.88, sz: 1.75, y: 3.7 }), seg([0, 4.3, 2.1], [0, 6.1, 3.3], 0.95, 0.7, HORSE, 7), ball(0.95, HORSE, { y: 6.4, z: 3.95, sz: 1.25 }, 8, 6),
    ball(0.62, 0x6b4a2e, { y: 5.9, z: 5.05, sx: 0.95 }, 6, 5), ball(0.2, 0xf6f1e4, { y: 6.4, z: 4.65, sx: 0.5, sz: 2 }, 4, 4), // hocico y mancha
    ball(0.13, 0x1a1210, { x: -0.7, y: 6.7, z: 4.2 }, 4, 3), ball(0.13, 0x1a1210, { x: 0.7, y: 6.7, z: 4.2 }, 4, 3),
    bake(new THREE.ConeGeometry(0.25, 0.9, 4), HORSE, { x: -0.45, y: 7.4, z: 3.5, rz: 0.2 }), bake(new THREE.ConeGeometry(0.25, 0.9, 4), HORSE, { x: 0.45, y: 7.4, z: 3.5, rz: -0.2 }),
    seg([0, 6.9, 3.2], [0, 4.5, 2.0], 0.25, 0.25, 0x3a2418, 4), seg([0, 4.3, -2.6], [0, 2.1, -3.5], 0.35, 0.18, 0x3a2418, 5), // crin y cola
    // montura y jinete
    box(2.4, 0.3, 2.6, 0xc2433d, { y: 5.2, z: -0.2 }), box(1.9, 0.35, 2.0, 0x6b4a2e, { y: 5.45, z: -0.2 }),
    bake(new THREE.ConeGeometry(1.55, 2.6, 8), (x, y) => ((Math.floor((y + 10) * 2.6) % 2) ? lin3(0xc2433d) : lin3(0xf3e5ab)), { y: 6.9, z: -0.1 }), // poncho
    ball(0.7, SKIN, { y: 8.6, z: 0.1 }, 7, 5), ball(0.08, 0x1a1210, { x: -0.25, y: 8.7, z: 0.72 }, 3, 3), ball(0.08, 0x1a1210, { x: 0.25, y: 8.7, z: 0.72 }, 3, 3),
    bake(new THREE.CylinderGeometry(2.1, 2.1, 0.16, 12), 0xf3e5ab, { y: 9.15, z: 0.1 }), bake(new THREE.CylinderGeometry(0.85, 0.95, 0.75, 8), 0xf3e5ab, { y: 9.5, z: 0.1 }), bake(new THREE.CylinderGeometry(0.97, 0.97, 0.22, 8), 0x3a2418, { y: 9.28, z: 0.1 }),
    seg([-0.9, 6.0, 0.1], [-1.35, 4.6, 0.6], 0.38, 0.32, 0x6b4a2e, 4), seg([0.9, 6.0, 0.1], [1.35, 4.6, 0.6], 0.38, 0.32, 0x6b4a2e, 4),
    seg([0.9, 7.4, 0.3], [0.6, 6.6, 1.9], 0.3, 0.25, 0xc2433d, 4), seg([0.6, 6.6, 1.9], [0.2, 5.8, 3.1], 0.07, 0.07, 0x3a2418, 3),
  ]);
  const hLeg = (ia) => {
    const out = [];
    [[-0.75, 1.6, 0], [0.75, 1.6, 1], [-0.75, -1.6, 1], [0.75, -1.6, 0]].forEach(([x, z, g]) => {
      if (g !== ia) return;
      out.push(seg([x, 2.8, z], [x, 1.4, z + 0.15], 0.4, 0.3, HORSE, 5), seg([x, 1.4, z + 0.15], [x, 0.3, z], 0.3, 0.26, HORSE, 5), box(0.6, 0.35, 0.7, 0x2a1c14, { x, y: 0.18, z: z + 0.1 }));
    });
    return merge(out);
  };
  const horse = new THREE.Group(); horse.scale.setScalar(HS); root.add(horse);
  const hMesh = mesh(horse, hBody, 'hero'), hp = new THREE.Group(); hp.position.set(0, 2.8, 0); horse.add(hp);
  const lA = mesh(hp, hLeg(0), 'hero'), lB = mesh(hp, hLeg(1), 'hero'); lA.position.y = lB.position.y = -2.8;
  [hMesh, lA, lB].forEach((m) => addOutline(m, { thickness: 0.07 }));
  count(stats, hBody, 2, 2); count(stats, lA.geometry, 2, 2); count(stats, lB.geometry, 2, 2);

  // humo del fogon: bolitas palidas que suben y se encogen
  const NS = 7, smokeG = new THREE.SphereGeometry(1, 6, 5), smoke = dynInst(root, smokeG, NS, Array(NS).fill(0xe0d6e2), 'plain'); count(stats, smokeG, NS);

  // ------------------------------------------------------------ update(t)
  const fy0 = gy(FIRE.x, FIRE.z), flyC = { x: C.x + 20, z: spineZ(C.x + 20) - 30 };
  const loopPos = (a) => [HC.x + cos(a) * HC.rx, HC.z + sin(a) * HC.rz];
  return {
    update(t) {
      // llanero: trote suave en un circuito lento
      const a = t * 0.075, p = loopPos(a), p2 = loopPos(a + 0.02), ph = t * 5.2, bob = Math.abs(sin(ph)) * 0.22;
      horse.position.set(p[0], gy(p[0], p[1]) + bob, p[1]);
      horse.rotation.set(0.03 * sin(ph * 2), Math.atan2(p2[0] - p[0], p2[1] - p[1]), 0.02 * sin(ph));
      lA.rotation.x = sin(ph) * 0.45; lB.rotation.x = -sin(ph) * 0.45;
      lA.position.y = -2.8 + Math.max(0, sin(ph)) * 0.25; lB.position.y = -2.8 + Math.max(0, -sin(ph)) * 0.25;
      // vacas: cabeceo de pastar
      for (let i = 0; i < CPOS.length; i++) { const [x, z, yaw] = CPOS[i]; setM(cows, i, x, gy(x, z), z, yaw, Math.max(0, sin(t * 0.5 + i * 2.1)) * 0.28, 0, 1.15); }
      done(cows);
      // chiguiros: respiran; el segundo bebe del cano de vez en cuando
      CAP.forEach((c, i) => {
        const br = 1 + 0.025 * sin(t * 1.8 + i), drink = c.kind === 'drink' ? Math.pow(Math.max(0, sin(t * 0.45)), 3) * 0.4 : 0;
        setM(capys, i, c.x, gy(c.x, c.z), c.z, c.yaw, drink, 0, c.s, c.s * br, c.s);
      });
      done(capys);
      // garzas posadas: cabeceo leve; en vuelo: circulan con aleteo
      HER.forEach((h, i) => setM(herons, i, h.x, wy(h.x, h.z) - 0.1, h.z, h.yaw + 0.15 * sin(t * 0.6 + i * 2), 0, 0, 1.15));
      done(herons);
      const ma = new THREE.Matrix4(), mb = new THREE.Matrix4(), mc = new THREE.Matrix4();
      for (let i = 0; i < FL; i++) {
        const dir = i ? -1 : 1, ang = t * 0.12 * dir + i * 3.1, r = 38 + i * 12, x = flyC.x + cos(ang) * r, z = flyC.z + sin(ang) * r, y = gy(x, z) + 20 + i * 5 + sin(t * 0.7 + i) * 1.5;
        const yaw = Math.atan2(-sin(ang) * dir, cos(ang) * dir), flap = sin(t * 5.5 + i * 1.7) * 0.7;
        setM(flyBody, i, x, y, z, yaw, 0, -0.15 * dir, 1.2);
        mb.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, -0.15 * dir, 'YXZ')), new THREE.Vector3(1.2, 1.2, 1.2));
        mc.makeTranslation(0, 3.7, 0).multiply(ma.makeRotationZ(flap)).multiply(new THREE.Matrix4().makeTranslation(0, -3.7, 0));
        wR.setMatrixAt(i, mb.clone().multiply(mc));
        mc.makeTranslation(0, 3.7, 0).multiply(ma.makeRotationZ(-flap)).multiply(new THREE.Matrix4().makeTranslation(0, -3.7, 0));
        wL.setMatrixAt(i, mb.clone().multiply(mc));
      }
      done(flyBody); done(wR); done(wL);
      // humo
      for (let i = 0; i < NS; i++) {
        const pp = (t * 0.12 + i / NS) % 1, s = (0.5 + pp * 2.2) * (1 - pp * pp * pp);
        setM(smoke, i, FIRE.x + sin(t * 0.8 + i * 2) * 0.6 + pp * 3.2, fy0 + 3.5 + pp * 15, FIRE.z + cos(t * 0.6 + i) * 0.6, 0, 0, 0, s);
      }
      done(smoke);
    },
  };
}
