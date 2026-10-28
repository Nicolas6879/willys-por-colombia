// Santander (G3b): hormiga culona GIGANTE (hito, con contorno) que pasea por una plataforma + fila de hormigas, puesto de hormigas en cono de papel,
// Barichara (pueblo de piedra: casas blancas con teja, iglesia de dos torres, plaza empedrada, fuente), Canon del Chicamocha (rio, rocas, teleferico
// con cabinas), parapentes de colores, cabras en las rocas y secaderos de tabaco. Todo procedural: piezas con vertex colors fusionadas.
// Animaciones por CPU baratas (~30 matrices): se devuelven en `update(t)` y scene.js ya las cablea.
import { CANYON, distPoly } from '../layout.js';
import { windAttr } from '../geo.js';
import { box, ball, seg, gable, put, mesh, dynInst, setM, done, count, bake, merge, lin, mixc, smoothstep, addOutline } from './santander/kit.js';

export function build(scene, ctx) {
  const { THREE, inst, heightAt, hash01, ZONE_BY_ID, lambert, basic, shade, stats, roadInfo } = ctx;
  const Z = ZONE_BY_ID.santander, gy = heightAt;
  const OX = Z.cx - 520, OZ = Z.cz + 380; // G4: la region cambio de lugar; las coordenadas absolutas originales (centro en 520,-380) se desplazan
  const root = new THREE.Group(); root.name = 'santander'; scene.add(root);
  const mats = (arr, parent = root) => { const g = merge(arr); const m = mesh(parent, g); count(stats, g); return m; };

  const TILE = 0x8b3a2b, STONE = 0xd9b38c, STONE2 = 0xc9a27a, WHITE = 0xf6f1e4, OCRE = 0xe6cfa5, WOOD = 0x6b4a2e;

  // ---------------------------------------------------------------- Barichara
  const V = { x: 612 + OX, z: -330 + OZ }, S = []; // S: geometrias estaticas del pueblo
  const glowList = [], shadeList = [];
  const SHUT = [0x3e7ea8, 0x4aa07a, 0xd9a03a, 0xc2433d];
  function house(x, z, yaw, w, d, h, k) {
    const wall = k % 3 === 0 ? OCRE : WHITE, shut = SHUT[k % SHUT.length], roof = k % 2 ? TILE : 0xa84a34, P = [];
    P.push(box(w + 0.5, 2.4, d + 0.5, STONE, { y: -0.9 }));
    P.push(box(w, h, d, wall, { y: h / 2 }));
    P.push(box(w + 0.2, 0.9, d + 0.2, STONE2, { y: 0.45 })); // zocalo de piedra
    P.push(gable(w * 1.3, h * 0.62, d * 1.22, roof).translate(0, h, 0));
    P.push(box(w * 0.24, h * 0.52, 0.35, shut, { y: h * 0.26, z: d / 2 + 0.1 })); // puerta
    for (const s of [-1, 1]) P.push(box(w * 0.22, h * 0.26, 0.3, shut, { x: s * w * 0.3, y: h * 0.58, z: d / 2 + 0.05 }));
    if (k % 3 === 1) P.push(box(1.2, 3, 1.2, STONE, { x: w * 0.25, y: h + 2.2, z: -d * 0.2 })); // chimenea
    S.push(put(merge(P), x, gy(x, z), z, yaw));
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    for (const s of [-1, 1]) { const lx = s * w * 0.3, lz = d / 2 + 0.28; glowList.push({ x: x + lx * c + lz * sn, y: gy(x, z) + h * 0.58, z: z - lx * sn + lz * c, yaw, sx: w * 0.14, sy: h * 0.17, sz: 0.2 }); }
    shadeList.push({ x, z, r: Math.max(w, d) * 0.95 });
  }
  const HS = [ // dx, dz, yaw, w, d, h  (relativo a la plaza V)
    [-26, -13, 0, 8, 8, 6], [-14, -13, 0, 9, 8, 7], [-26, 13, Math.PI, 8, 8, 6.5], [-14, 13, Math.PI, 9, 8, 6],
    [-1, -17, 0, 10, 8, 7], [12, -17, 0, 9, 8, 6], [-1, 17, Math.PI, 10, 8, 6.5], [12, 17, Math.PI, 9, 8, 7],
    [-30, 0, -Math.PI / 2, 8, 8, 6.5], [22, -26, 0.3, 9, 8, 6], [22, 26, Math.PI - 0.3, 9, 8, 6.5], [-8, -30, 0.1, 8, 8, 6], [-8, 31, Math.PI - 0.1, 8, 8, 6],
  ];
  HS.forEach(([dx, dz, yaw, w, d, h], k) => house(V.x + dx, V.z + dz, yaw, w, d, h, k));
  // iglesia de piedra (fachada hacia -x), dos torres con chapitel de teja
  {
    const P = [], T = 0xdcba92;
    P.push(box(14, 2, 22, STONE2, { y: -0.4, z: -1 }));
    P.push(box(11, 10, 18, T, { y: 5, z: -2 }));
    P.push(box(12, 12, 2.4, T, { y: 6, z: 8.6 }));
    P.push(gable(12.8, 5, 2.8, T)); P[P.length - 1].translate(0, 12, 8.6);
    P.push(gable(13.4, 5.5, 19, TILE)); P[P.length - 1].translate(0, 10, -2);
    for (const s of [-1, 1]) {
      P.push(box(4.8, 16, 4.8, T, { x: s * 4.6, y: 8, z: 9.6 }));
      P.push(box(5.4, 0.8, 5.4, STONE2, { x: s * 4.6, y: 16.2, z: 9.6 }));
      P.push(bake(new THREE.ConeGeometry(3.7, 7, 4).rotateY(Math.PI / 4), TILE, { x: s * 4.6, y: 20.2, z: 9.6 }));
      P.push(box(1.6, 2.2, 0.4, 0x4a3524, { x: s * 4.6, y: 13.6, z: 12.1 })); // campanario
    }
    P.push(box(3.4, 5.4, 0.5, 0x4a3524, { y: 2.7, z: 10 }));
    P.push(bake(new THREE.CylinderGeometry(1.7, 1.7, 0.5, 8).rotateX(Math.PI / 2), 0x4a3524, { y: 5.4, z: 10 }));
    P.push(bake(new THREE.CylinderGeometry(1.2, 1.2, 0.4, 8).rotateX(Math.PI / 2), 0x9bd0e8, { y: 9.4, z: 10 }));
    P.push(box(9, 0.6, 3.2, STONE2, { y: 0.3, z: 12 })); P.push(box(7, 0.6, 2.4, T, { y: 0.9, z: 12.2 }));
    P.push(box(0.4, 2.6, 0.4, 0x4a3524, { y: 18.9, z: 8.6 })); P.push(box(1.7, 0.4, 0.4, 0x4a3524, { y: 19.4, z: 8.6 }));
    const cx = V.x + 36, cz = V.z;
    S.push(put(merge(P), cx, gy(cx, cz), cz, -Math.PI / 2));
    shadeList.push({ x: cx, z: cz, r: 13 });
  }
  // plaza empedrada a cuadros, calle, fuente
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    const x = V.x + i * 4.6, z = V.z + j * 4.6;
    S.push(box(4.5, 0.4, 4.5, (i + j) & 1 ? 0xe0c9a4 : 0xcdb08a, { x, y: gy(x, z) + 0.2, z }));
  }
  for (let i = 0; i < 9; i++) for (const j of [-1, 1]) {
    const x = V.x - 17 - i * 3.6, z = V.z + j * 1.7;
    S.push(box(3.5, 0.34, 3.4, (i + (j > 0)) & 1 ? 0xd7bc94 : 0xc4a67f, { x, y: gy(x, z) + 0.17, z }));
  }
  {
    const fy = gy(V.x, V.z);
    S.push(bake(new THREE.CylinderGeometry(3.4, 3.7, 1.3, 10), STONE2, { x: V.x, y: fy + 0.9, z: V.z }));
    S.push(bake(new THREE.CylinderGeometry(2.7, 2.7, 0.3, 10), 0x3fb8e0, { x: V.x, y: fy + 1.6, z: V.z }));
    S.push(bake(new THREE.CylinderGeometry(0.5, 0.7, 2.6, 6), STONE, { x: V.x, y: fy + 2.4, z: V.z }));
    S.push(ball(1.1, 0x9bdcf0, { x: V.x, y: fy + 4, z: V.z }));
  }
  // arboles de la plaza (copa-nube) con viento
  const treeGeo = windAttr(merge([seg([0, 0, 0], [0, 5.5, 0], 0.5, 0.35, 0x7a5230, 5), ball(3.2, 0x8da05a, { y: 6.6, sy: 0.9 }, 7, 5), ball(2.3, 0x9bb467, { x: 1.6, y: 5.6, z: 1, sy: 0.9 }, 6, 4), ball(2.2, 0x7e9450, { x: -1.5, y: 5.8, z: -1, sy: 0.9 }, 6, 4)]), 9, 0.18);
  const trees = [[-6, -9], [8, 10], [-20, 5], [14, -29], [-40, 22], [-38, -22], [30, 40], [52, -22], [52, 20], [-52, 0]].map(([dx, dz], i) => ({ x: V.x + dx, y: gy(V.x + dx, V.z + dz), z: V.z + dz, sx: 1 + hash01(i, 3) * 0.3, sy: 1 + hash01(3, i) * 0.4, sz: 1 }));
  const goodTrees = trees.filter((t) => roadInfo(t.x, t.z).dist > 12);
  inst(treeGeo, lambert(0xffffff, { wind: true, vc: true }), goodTrees); shade(goodTrees, 3.4);

  // secaderos de tabaco (hojas colgadas) al sur del pueblo
  for (const [dx, dz] of [[-6, 38], [8, 46], [22, 40]]) {
    const x = V.x + dx, z = V.z + dz, y = gy(x, z), P = [];
    for (const sx of [-3.2, 3.2]) P.push(box(0.4, 5, 0.4, WOOD, { x: sx, y: 2.5 })), P.push(box(0.4, 5, 0.4, WOOD, { x: sx, y: 2.5, z: 2.4 }));
    for (const yy of [2.2, 3.4, 4.6]) P.push(box(7, 0.3, 0.3, WOOD, { y: yy, z: 0 }), box(7, 0.3, 0.3, WOOD, { y: yy, z: 2.4 }));
    for (let i = 0; i < 9; i++) for (const yy of [1.5, 2.7, 3.9]) P.push(box(0.55, 1.5, 0.12, (i + yy * 2) % 3 < 1 ? 0xb07a3a : 0xc99a4a, { x: -3 + i * 0.75, y: yy, z: 0 }));
    P.push(gable(8, 1.8, 3.6, 0xc9a56a)); P[P.length - 1].translate(0, 5, 1.2);
    S.push(put(merge(P), x, y, z, 0.2 * (dx > 0 ? 1 : -1)));
  }

  // puesto de hormigas en cono de papel
  const STALL = { x: 566 + OX, z: -350 + OZ };
  {
    const P = [], y = gy(STALL.x, STALL.z);
    P.push(box(8, 0.5, 4, WOOD, { y: 2.6 }));
    for (const sx of [-3.5, 3.5]) for (const sz of [-1.6, 1.6]) P.push(box(0.5, 2.6, 0.5, WOOD, { x: sx, y: 1.3, z: sz }));
    for (const sx of [-3.8, 3.8]) P.push(box(0.35, 5.2, 0.35, WOOD, { x: sx, y: 2.6 + 1.3, z: -1.8 }));
    for (let i = 0; i < 6; i++) P.push(box(1.4, 0.3, 4.6, i & 1 ? 0xffffff : 0xe2584d, { x: -3.5 + i * 1.4, y: 6.4 - Math.abs(i - 2.5) * 0.05, z: -0.4 }));
    for (const [cx, tilt] of [[-2.4, 0.12], [-0.3, -0.08], [1.9, 0.1]]) {
      P.push(bake(new THREE.ConeGeometry(1.15, 3.1, 8), 0xf3e5ab, { x: cx, y: 2.85 + 1.55, z: 0.1, rz: Math.PI + tilt }));
      P.push(bake(new THREE.CylinderGeometry(1.2, 1.2, 0.3, 8), 0xf3e5ab, { x: cx, y: 2.85 + 3.1, z: 0.1 }));
      for (let k = 0; k < 6; k++) P.push(ball(0.5, k % 2 ? 0xe9622b : 0x8b3a2b, { x: cx + Math.cos(k * 1.2) * 0.65, y: 2.85 + 3.35 + (k % 3) * 0.12, z: 0.1 + Math.sin(k * 1.2) * 0.65, sz: 1.2 }, 5, 4));
    }
    P.push(box(3.2, 1.3, 0.2, 0xfff1c2, { x: 0, y: 1.6, z: 2.15 })); P.push(box(2.4, 0.5, 0.25, 0xe9622b, { x: 0, y: 1.6, z: 2.2 }));
    S.push(put(merge(P), STALL.x, y, STALL.z, -0.7)); shadeList.push({ x: STALL.x, z: STALL.z, r: 5 });
  }
  const villageMesh = mats(S); villageMesh.name = 'barichara';
  shade(shadeList, (s) => s.r);
  inst(new THREE.BoxGeometry(1, 1, 1), basic(0xffd36b), glowList);

  // ------------------------------------------------------- Hormiga culona (hito)
  const HP = { x: 560 + OX, z: -414 + OZ }, PLAT_R = 18, SC = 1.3, hy = gy(HP.x, HP.z);
  {
    const P = [];
    P.push(bake(new THREE.CylinderGeometry(PLAT_R + 1, PLAT_R + 1.6, 1.2, 14), 0xa8683e, { x: HP.x, y: hy + 0.2, z: HP.z }));
    P.push(bake(new THREE.CylinderGeometry(PLAT_R, PLAT_R, 0.8, 14), STONE, { x: HP.x, y: hy + 0.9, z: HP.z }));
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; P.push(ball(1.1, 0xc58b57, { x: HP.x + Math.cos(a) * (PLAT_R + 0.4), y: hy + 1.2, z: HP.z + Math.sin(a) * (PLAT_R + 0.4), sy: 0.6 }, 5, 4)); }
    mats(P); shade([{ x: HP.x, z: HP.z }], PLAT_R * 0.9, 1);
  }
  const BODY = 0x8b3a2b, DARK = 0x5a2418, ORANGE = 0xe9622b, LEG0 = 0x6e2c20;
  const Hh = 6.6; // altura del torax sobre la plataforma (antes de escalar)
  const antBody = merge([
    ball(2.7, BODY, { y: Hh, z: 0, sz: 1.15 }, 9, 7), // torax
    ball(3.3, (x, y) => mixc(BODY, 0xb2523a, smoothstep(Hh, Hh + 3.3, y) * 0.6), { y: Hh + 1.1, z: 4.6 }, 10, 8), // cabeza grande (chibi)
    ball(1.15, 0xffffff, { x: -1.7, y: Hh + 2.4, z: 7, sy: 1.1 }, 7, 6), ball(1.15, 0xffffff, { x: 1.7, y: Hh + 2.4, z: 7, sy: 1.1 }, 7, 6),
    ball(0.6, 0x1a1210, { x: -1.7, y: Hh + 2.4, z: 8 }, 6, 5), ball(0.6, 0x1a1210, { x: 1.7, y: Hh + 2.4, z: 8 }, 6, 5),
    bake(new THREE.ConeGeometry(0.6, 2.4, 5), DARK, { x: -1.1, y: Hh - 0.4, z: 8.3, rx: Math.PI / 2, rz: -0.5 }), bake(new THREE.ConeGeometry(0.6, 2.4, 5), DARK, { x: 1.1, y: Hh - 0.4, z: 8.3, rx: Math.PI / 2, rz: 0.5 }),
  ]);
  // abdomen culon: pivote en la union con el torax; elipsoide enorme rojo-naranja brillante con anillos
  const abdGeo = merge([bake(new THREE.SphereGeometry(5.8, 12, 9), (x, y, z) => {
    const ring = Math.sin(z * 1.35) > 0.72 ? 0.78 : 1, top = smoothstep(-1, 5, y - Hh);
    const c = mixc(ORANGE, 0xff9a4a, top * 0.7);
    return [c[0] * ring, c[1] * ring, c[2] * ring];
  }, { y: Hh + 0.3, z: -7, sx: 1, sy: 0.95, sz: 1.3 })]);
  const legPair = (zs, ia) => {
    const out = [];
    zs.forEach((z, i) => [-1, 1].forEach((s) => {
      if ((i + (s > 0 ? 1 : 0)) % 2 !== ia) return;
      out.push(seg([s * 2, Hh, z], [s * 5.6, Hh + 1.6, z + 0.6], 0.62, 0.5, LEG0, 5), seg([s * 5.6, Hh + 1.6, z + 0.6], [s * 7.6, 0.8, z + 2], 0.5, 0.34, LEG0, 5), ball(0.6, 0x3a1810, { x: s * 7.7, y: 0.6, z: z + 2.1 }, 5, 4));
    }));
    return merge(out);
  };
  const legsA = legPair([-1.6, 0.4, 2.2], 0), legsB = legPair([-1.6, 0.4, 2.2], 1);
  const antGeo = (s) => merge([seg([0, 0, 0], [s * 1.6, 3.4, 1.8], 0.38, 0.3, DARK, 5), seg([s * 1.6, 3.4, 1.8], [s * 3.3, 5.6, 4.4], 0.3, 0.22, DARK, 5), ball(0.55, ORANGE, { x: s * 3.3, y: 5.6, z: 4.4 }, 5, 4)]);
  const ant = new THREE.Group(); ant.scale.setScalar(SC); root.add(ant);
  const mBody = mesh(ant, antBody, 'hero'), abd = new THREE.Group(), mAbd = mesh(abd, abdGeo, 'hero');
  abd.position.set(0, Hh, 1.8); mAbd.position.set(0, -Hh, -1.8); ant.add(abd); // pivote
  const piv = new THREE.Group(); ant.add(piv); piv.position.set(0, Hh, 0);
  const mA = mesh(piv, legsA, 'hero'), mB = mesh(piv, legsB, 'hero'); mA.position.y = mB.position.y = -Hh;
  const antL = new THREE.Group(), antR = new THREE.Group(); antL.position.set(-1.3, Hh + 4.2, 6.2); antR.position.set(1.3, Hh + 4.2, 6.2); ant.add(antL, antR);
  mesh(antL, antGeo(-1), 'hero'); mesh(antR, antGeo(1), 'hero');
  [mBody, mAbd].forEach((m) => addOutline(m, { thickness: 0.09 }));
  count(stats, antBody, 2, 2); count(stats, abdGeo, 2, 2); count(stats, legsA, 1); count(stats, legsB, 1); count(stats, antGeo(1), 2, 2);
  ant.position.set(HP.x, hy + 1.3, HP.z);

  // fila de hormigas pequenas: circuito en estadio entre la plataforma y el puesto
  const miniGeo = merge([ball(0.55, ORANGE, { z: -1.3, y: 0.9, sz: 1.25 }, 6, 5), ball(0.4, BODY, { z: -0.2, y: 0.8 }, 5, 4), ball(0.45, BODY, { z: 0.65, y: 0.95 }, 5, 4),
    ...[-1, 1].flatMap((s) => [-0.3, 0.2, 0.7].map((z) => seg([s * 0.3, 0.8, z], [s * 0.95, 0.05, z + 0.2], 0.1, 0.08, DARK, 3)))]);
  const NM = 9, minis = dynInst(root, miniGeo, NM); count(stats, miniGeo, NM);
  const LANE = { cx: 559 + OX, z0: -396 + OZ, z1: -366 + OZ, r: 7 }; // estadio: dos carriles rectos de largo (z1-z0) unidos por semicirculos de radio r
  const LP = (LANE.z1 - LANE.z0) * 2 + Math.PI * LANE.r * 2;
  function lanePos(d) { // -> [x, z, yaw]
    d = ((d % LP) + LP) % LP; const L = LANE.z1 - LANE.z0, arc = Math.PI * LANE.r;
    if (d < L) return [LANE.cx + LANE.r, LANE.z0 + d, 0]; // carril este hacia +z (el puesto)
    d -= L; if (d < arc) { const a = d / LANE.r; return [LANE.cx + Math.cos(a) * LANE.r, LANE.z1 + Math.sin(a) * LANE.r, -a]; }
    d -= arc; if (d < L) return [LANE.cx - LANE.r, LANE.z1 - d, Math.PI];
    d -= L; const a = d / LANE.r; return [LANE.cx - Math.cos(a) * LANE.r, LANE.z0 - Math.sin(a) * LANE.r, Math.PI - a];
  }

  // -------------------------------------------------------------- Canon
  const CA = CANYON.pts[0], CB = CANYON.pts[1], CL = Math.hypot(CB[0] - CA[0], CB[1] - CA[1]);
  const tan = [(CB[0] - CA[0]) / CL, (CB[1] - CA[1]) / CL], nor = [tan[1], -tan[0]]; // nor apunta a -x,-z (lado noroeste)
  {
    const P = [], water = [];
    // rio al fondo (cinta de agua azul que sigue el cauce)
    for (let i = 0; i < CANYON.pts.length - 1; i++) {
      const a = CANYON.pts[i], b = CANYON.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      for (let s = 0; s < L; s += 10) {
        const x = a[0] + tx * s, z = a[1] + tz * s, x2 = x + tx * 10.5, z2 = z + tz * 10.5;
        const h1 = gy(x, z), h2 = gy(x2, z2);
        P.push(bake(new THREE.BoxGeometry(7, 0.5, 10.6), s % 20 ? 0x3fb8e0 : 0x4cc4e8, { x: (x + x2) / 2, y: Math.min(h1, h2) + 0.25, z: (z + z2) / 2, ry: Math.atan2(tx, tz) }));
      }
    }
    mats(P);
  }
  // rocas del canon (planas, #A8683E) en los bordes y en el cauce
  {
    const rocks = [];
    for (let i = 0; i < CANYON.pts.length - 1; i++) {
      const a = CANYON.pts[i], b = CANYON.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      for (let k = 0; k < 16; k++) {
        const f = (k + hash01(k, i)) / 16, side = k % 2 ? 1 : -1, off = side * (34 + hash01(i, k) * 16), x = a[0] + tx * L * f + tz * off, zz = a[1] + tz * L * f - tx * off;
        if (roadInfo(x, zz).dist > 18) rocks.push({ x, y: gy(x, zz) + 0.5, z: zz, yaw: hash01(x, zz) * 6, sx: 3 + hash01(zz, x) * 4, sy: 2 + hash01(x, x) * 4, sz: 3 + hash01(zz, zz) * 4 });
      }
    }
    inst(new THREE.IcosahedronGeometry(1, 0), lambert(0xa8683e), rocks);
  }

  // teleferico: dos torres a lados opuestos del canon (primer tramo), dos cables paralelos y dos cabinas que van y vienen
  const cf = 0.2, QX = CA[0] + (CB[0] - CA[0]) * cf, QZ = CA[1] + (CB[1] - CA[1]) * cf, HALF = 54;
  const TA = { x: QX + nor[0] * HALF, z: QZ + nor[1] * HALF }, TB = { x: QX - nor[0] * HALF, z: QZ - nor[1] * HALF }; // TB = lado de la meseta
  const TOP = 22, yawX = (v) => Math.atan2(-v[1], v[0]); // yaw que lleva el eje x local a v
  TA.g = gy(TA.x, TA.z); TB.g = gy(TB.x, TB.z); TA.y = TA.g + TOP; TB.y = TB.g + TOP;
  const SAG = 6, cabY = (u) => TA.y + (TB.y - TA.y) * u - SAG * 4 * u * (1 - u);
  {
    const P = [];
    for (const T of [TA, TB]) {
      const P2 = [];
      P2.push(box(8, 1.2, 8, STONE2, { y: 0.4 }));
      for (const s of [-1, 1]) P2.push(seg([s * 2.8, 0.8, 0], [s * 0.9, TOP, 0], 0.7, 0.45, 0xd8dde6, 5));
      P2.push(box(3.6, 0.5, 0.5, 0xd8dde6, { y: 9 }), box(5.2, 0.5, 0.5, 0xd8dde6, { y: 15 }));
      P2.push(box(9, 0.9, 1, 0xb0b8c6, { y: TOP + 0.4 }), box(1.4, 1.4, 1.4, 0xe2584d, { y: TOP + 1.5 }));
      P.push(put(merge(P2), T.x, T.g, T.z, yawX(tan)));
    }
    // estacion en la meseta (caseta con techo de teja), puerta hacia el canon
    const sx = TB.x - 0.9 * 14, sz = TB.z + 0.44 * 14;
    P.push(put(merge([box(9, 6, 7, WHITE, { y: 3 }), gable(10.4, 3.4, 8, TILE).translate(0, 6, 0), box(3, 4, 0.4, 0x3e7ea8, { y: 2, z: 3.6 })]), sx, gy(sx, sz), sz, Math.atan2(nor[0], nor[1])));
    shade([{ x: sx, z: sz }], 6);
    for (const lane of [-1.8, 1.8]) {
      const N = 14;
      for (let i = 0; i < N; i++) {
        const u0 = i / N, u1 = (i + 1) / N, ox = tan[0] * lane, oz = tan[1] * lane;
        P.push(seg([TA.x + (TB.x - TA.x) * u0 + ox, cabY(u0), TA.z + (TB.z - TA.z) * u0 + oz], [TA.x + (TB.x - TA.x) * u1 + ox, cabY(u1), TA.z + (TB.z - TA.z) * u1 + oz], 0.14, 0.14, 0x4a4f5c, 3));
      }
    }
    mats(P);
  }
  const cabGeo = (body, roof) => merge([box(4.4, 3, 3.6, body, { y: -3.4 }), box(4.7, 0.5, 3.9, roof, { y: -1.7 }), box(3.6, 1.1, 3.7, 0xcdeaf5, { y: -3.2 }), box(0.3, 1.6, 0.3, 0x4a4f5c, { y: -0.7 }), box(1.4, 0.4, 0.8, 0x4a4f5c, { y: 0 })]);
  const cabA = cabGeo(0xe2584d, 0x8b3a2b), cabB = cabGeo(0xf2c14a, 0x8a5a2b), cabMeshA = mesh(root, cabA), cabMeshB = mesh(root, cabB);
  cabMeshA.frustumCulled = cabMeshB.frustumCulled = false; count(stats, cabA); count(stats, cabB);
  const cabYaw = Math.atan2(TB.x - TA.x, TB.z - TA.z);

  // ---------------------------------------------------------- Parapentes
  const wingGeo = (c1, c2, pilot) => merge([
    bake(new THREE.SphereGeometry(1, 12, 7), (x) => lin(Math.floor((x + 6.4) / 1.28) % 2 ? c2 : c1), { sx: 6.4, sy: 1.1, sz: 2.4 }),
    ball(0.9, pilot, { y: -7.4, z: 0.2, sy: 1.1 }, 6, 5), ball(0.7, 0xf3d1a8, { y: -6.4, z: 0.25 }, 5, 4), box(0.6, 0.5, 1.1, 0x3a3a3a, { y: -8.2, z: 0.3 }),
    seg([-4.6, -0.3, 0], [0, -6.8, 0], 0.07, 0.07, 0x4a3a3a, 3), seg([4.6, -0.3, 0], [0, -6.8, 0], 0.07, 0.07, 0x4a3a3a, 3), seg([-1.8, -0.7, 0], [0, -6.8, 0], 0.07, 0.07, 0x4a3a3a, 3), seg([1.8, -0.7, 0], [0, -6.8, 0], 0.07, 0.07, 0x4a3a3a, 3),
  ]);
  const along = (d) => { // punto a d u del inicio del canon (sigue la polilinea)
    for (let i = 0; i < CANYON.pts.length - 1; i++) {
      const a = CANYON.pts[i], b = CANYON.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d <= L || i === CANYON.pts.length - 2) return [a[0] + (b[0] - a[0]) * (d / L), a[1] + (b[1] - a[1]) * (d / L)];
      d -= L;
    }
  };
  const gliders = [[0xff4f6d, 0xffffff, 0x3e7ea8, 0.5, 30, 80, 0.0, 50], [0xffd23f, 0xff7a2f, 0x4aa07a, 0.62, 26, 66, 2.1, 120], [0x3fb8e0, 0xffffff, 0xc2433d, -0.45, 36, 92, 4.2, 200]].map(([c1, c2, pc, w, r, hgt, ph, d]) => {
    const m = mesh(root, wingGeo(c1, c2, pc)); m.frustumCulled = false; count(stats, m.geometry);
    const [cx, cz] = along(d);
    return { m, cx, cz, w, r, hgt: gy(cx, cz) + hgt, ph };
  });

  // ---------------------------------------------------------------- Cabras
  const goatGeo = merge([
    ball(1.0, 0xffffff, { sx: 1.0, sy: 0.95, sz: 1.7, y: 1.9 }, 8, 6), ball(0.8, 0xfff4e0, { y: 2.7, z: 1.9 }, 6, 5), ball(0.4, 0xd9b38c, { y: 2.45, z: 2.55, sz: 0.8 }, 5, 4),
    ...[-1, 1].flatMap((s) => [seg([s * 0.35, 3.3, 1.7], [s * 0.7, 4.2, 1.2], 0.17, 0.05, 0x3a2a20, 4), bake(new THREE.ConeGeometry(0.27, 0.7, 4), 0xfff4e0, { x: s * 0.85, y: 3.15, z: 1.7, rz: -s * 1.2 })]),
    seg([0, 2.1, 2.4], [0, 1.5, 2.5], 0.12, 0.05, 0x3a2a20, 4),
    ...[[-0.5, -1], [0.5, -1], [-0.5, 1.1], [0.5, 1.1]].map(([x, z]) => seg([x, 1.4, z], [x, 0, z], 0.2, 0.15, 0x9a7a5a, 4)),
  ]);
  const goatSpots = [[648, -410], [661, -418], [541, -447], [553, -441]].map(([x, z]) => [x + OX, z + OZ]).filter(([x, z]) => roadInfo(x, z).dist > 16);
  const goatTop = goatSpots.map(([x, z]) => gy(x, z) + 3.4);
  {
    const rocks = goatSpots.flatMap(([x, z], i) => [{ x, y: gy(x, z) + 0.6, z, yaw: i, sx: 4.2, sy: 3, sz: 3.6 }, { x: x + 4, y: gy(x, z) + 0.2, z: z - 2, yaw: i + 2, sx: 2.6, sy: 1.8, sz: 2.4 }]);
    inst(new THREE.IcosahedronGeometry(1, 0), lambert(0xa8683e), rocks); shade(rocks.filter((_, i) => i % 2 === 0), 4);
  }
  const goats = dynInst(root, goatGeo, goatSpots.length, [0xffffff, 0xd9b38c, 0xb08a60, 0xf3e8d2]); count(stats, goatGeo, goatSpots.length);

  // ---------------------------------------------------------------- update(t)
  const sin = Math.sin, cos = Math.cos;
  return {
    update(t) {
      // hormiga: pasea en un circulo pequeno, el abdomen se levanta a ratos, antenas y patas en tripode
      const w = 0.12, s32 = sin(t * 3.2);
      ant.position.set(HP.x + cos(t * w) * 3, hy + 1.3 + Math.abs(s32) * 0.12, HP.z + sin(t * w) * 3);
      ant.rotation.y = -Math.PI * 0.72 + sin(t * w) * 0.35;
      abd.rotation.x = 0.1 + Math.pow(Math.max(0, sin(t * 0.55)), 2) * 0.55 + s32 * 0.03;
      mA.rotation.x = s32 * 0.2; mB.rotation.x = -s32 * 0.2; mA.position.y = -Hh + Math.max(0, s32) * 0.5; mB.position.y = -Hh + Math.max(0, -s32) * 0.5;
      antL.rotation.set(sin(t * 2.3) * 0.3, 0, 0.1 + sin(t * 1.7 + 1) * 0.28); antR.rotation.set(sin(t * 2.3 + 1.7) * 0.3, 0, -0.1 + sin(t * 1.9) * 0.28);
      // fila de hormigas
      for (let i = 0; i < NM; i++) { const p = lanePos(t * 3.4 + i * (LP / NM)); setM(minis, i, p[0], gy(p[0], p[1]) + 0.1, p[1], p[2], 0, 0, 1.15); }
      done(minis);
      // teleferico: las cabinas se cruzan (A va, B viene)
      const u = 0.5 - 0.5 * cos(t * 0.1), sw = sin(t * 1.3) * 0.05;
      for (const [m, uu, lane] of [[cabMeshA, u, -1.8], [cabMeshB, 1 - u, 1.8]]) {
        m.position.set(TA.x + (TB.x - TA.x) * uu + tan[0] * lane, cabY(uu), TA.z + (TB.z - TA.z) * uu + tan[1] * lane);
        m.rotation.set(0, cabYaw, sw * (lane > 0 ? 1 : -1));
      }
      // parapentes en circulos con balanceo
      for (const g of gliders) {
        const a = g.ph + t * g.w * 0.3, dir = Math.sign(g.w);
        g.m.position.set(g.cx + cos(a) * g.r, g.hgt + sin(t * 0.4 + g.ph) * 2, g.cz + sin(a) * g.r);
        g.m.rotation.set(0.04 * sin(t * 0.9 + g.ph), atan(-sin(a) * dir, cos(a) * dir), -0.22 * dir + 0.06 * sin(t * 0.7 + g.ph));
      }
      // cabras: cabeceo para pastar y saltito
      for (let i = 0; i < goatSpots.length; i++) {
        const hop = Math.pow(Math.max(0, sin(t * 0.8 + i * 1.9)), 10) * 1.1;
        setM(goats, i, goatSpots[i][0], goatTop[i] + hop, goatSpots[i][1], i * 1.7 + 0.5, 0.18 * sin(t * 1.4 + i * 2.3) - hop * 0.15, 0, 1.3);
      }
      done(goats);
    },
  };
}
const atan = Math.atan2;
