// Cali (G3b): mini-ciudad "maqueta de juguete". Hito = Cristo Rey blanco sobre un cerro (con contorno). Cerros de Cali con cruces, ciudad baja de casas
// y torres con ventanas emisivas, rio con un gato gordo estilizado en la ribera, tarima de salsa con luces y parejas de bailarines chibi girando,
// puesto de chontaduro, iglesia La Ermita, farolas, palmas y canaverales. Todo lo estatico va fusionado en UNA malla (vertex colors).
// Devuelve { update(t) }: gira/rebota las parejas y cambia las luces de la tarima.
import { B, S, C, K, put, foot, hillGeometry, ribbonGeometry, chibi, windowQuads, addVC, merge, bake, windAttr, distPoly } from './cali/kit.js';

const WALLS = [0xffffff, 0xfff1e0, 0xffd9b8, 0xffc2c9, 0xcfe8ff, 0xffe69a, 0xf6d1ff, 0xffffff];
const ROOFS = [0xc2433d, 0xe0714f, 0xd9a05b, 0xc2433d, 0x8b3a2b];
const LIGHTS = [0xffb347, 0xff3e8a, 0xffe08a, 0xff6a3d, 0x7be0ff, 0xffd166];
const TAU = Math.PI * 2;

export function build(scene, { THREE, inst, grid, place, farFromRoad, heightAt, roadAt, hash01, ZONE_BY_ID, lambert, basic, shade }) {
  const z = ZONE_BY_ID.cali, X = (dx) => z.cx + dx, Z = (dz) => z.cz + dz, H0 = z.h;
  const hv = (x, zz, k) => hash01(x * 0.37 + k, zz * 0.41 - k);
  // ---- sitios (relativos al centro; +z = sur). Las carreteras llegan por el norte / noreste y mueren en el centro: la ciudad queda al sur y a los lados ----
  const CRISTO = [-55, 135, 62, 46], LOMAS = [[-150, 40, 38, 24], [-170, 100, 34, 20], [-185, 165, 30, 17]];
  const STAGE = [-48, 48], CHURCH = [-66, -6], STAND = [-38, -60], CAT = [62, 58];
  const RIVER = [[8, 190], [16, 135], [46, 88], [94, 62], [150, 62], [210, 92]].map(([a, b]) => [X(a), Z(b)]);
  const near = (x, zz, c, r) => Math.hypot(x - X(c[0]), zz - Z(c[1])) < r;
  const blocked = (x, zz) => near(x, zz, CRISTO, CRISTO[2] + 14) || LOMAS.some((l) => near(x, zz, l, l[2] + 10)) || near(x, zz, STAGE, 36) || near(x, zz, CHURCH, 20) || near(x, zz, STAND, 16) || near(x, zz, CAT, 18) || distPoly(x, zz, RIVER) < 20;

  const st = []; // piezas estaticas (geometrias en coordenadas de mundo) -> 1 malla

  // ---- cerros: Cristo Rey (verde-amarillo, seco arriba) y las lomas de las Tres Cruces ----
  const dry = (f, a, i) => { const k = hv(i, f * 100, 3); const g = f < 0.35 ? [0x93b84f, 0x9fbf52, 0x8aae4b] : f < 0.7 ? [0xb4bd50, 0xc4bb52, 0xa9b84e] : [0xd2bd58, 0xdcc260, 0xc9b455]; return g[Math.floor(k * 3) % 3]; };
  st.push(hillGeometry(X(CRISTO[0]), Z(CRISTO[1]), CRISTO[2], CRISTO[3], dry, { rings: 7, seg: 16, noise: 0.08 }));
  const cross = (h) => merge([B(0.9, h, 0.9, 0, h / 2, 0, 0xffffff), B(h * 0.55, 0.9, 0.9, 0, h * 0.72, 0, 0xffffff)]);
  for (const [a, b, r, hh] of LOMAS) {
    st.push(hillGeometry(X(a), Z(b), r, hh, dry, { rings: 5, seg: 12, noise: 0.1 }));
    const top = heightAt(X(a), Z(b)) + 0.12 + hh;
    st.push(put(cross(7), X(a), Z(b), 0.4, 1, top - 0.6));
  }

  // ---- rio (arena + agua) ----
  st.push(ribbonGeometry(RIVER, 24, 0.14, () => 0xf2dca0, 3), ribbonGeometry(RIVER, 13, 0.26, (i) => (i % 2 ? 0x45bfe6 : 0x58cbee), 3));

  // ---- gato gordo estilizado (guino generico; naranja con manchas turquesa, sentado, mirando al agua) ----
  const OR = 0xff9a3c, CR = 0xffe0b8, TQ = 0x19b5c9;
  const tail = []; for (let i = 0; i < 6; i++) { const a = i * 0.62; tail.push(S(0.62 - i * 0.05, 1.7 + Math.sin(a) * 1.25, 0.65 + (1 - Math.cos(a)) * 0.95, -1.5 - Math.sin(a) * 0.3, i > 3 ? TQ : OR, {}, 5, 4)); }
  const cat = merge([
    S(1.8, 0, 1.75, 0, OR, { sy: 1.08 }, 8, 6), S(1.25, 0, 1.45, 1.0, CR, { sy: 0.95 }, 7, 5),
    S(1.55, 0, 3.9, 0.35, OR, {}, 8, 6), S(0.7, 0, 3.4, 1.7, CR, {}, 6, 4),
    K(0.65, 1.2, -0.95, 5.35, 0.35, OR, { rz: 0.28 }, 4), K(0.65, 1.2, 0.95, 5.35, 0.35, OR, { rz: -0.28 }, 4),
    S(0.3, -0.62, 4.15, 1.62, 0x2a1a22, {}, 5, 4), S(0.3, 0.62, 4.15, 1.62, 0x2a1a22, {}, 5, 4), S(0.1, -0.55, 4.28, 1.86, 0xffffff, {}, 4, 3), S(0.1, 0.69, 4.28, 1.86, 0xffffff, {}, 4, 3),
    S(0.22, 0, 3.7, 2.2, 0xff7aa0, {}, 4, 3),
    C(1.0, 1.35, 0.4, 0, 2.7, 0.55, TQ, {}, 8),
    C(0.42, 0.5, 1.6, -0.75, 0.8, 1.3, OR, {}, 6), C(0.42, 0.5, 1.6, 0.75, 0.8, 1.3, OR, {}, 6),
    S(0.7, -1.55, 2.0, 0.2, TQ, { sx: 0.35 }, 5, 4), S(0.55, 1.6, 1.4, -0.4, TQ, { sx: 0.35 }, 5, 4), S(0.5, -1.35, 1.0, -0.8, TQ, { sx: 0.4 }, 5, 4),
    B(0.25, 0.9, 0.2, 0, 5.05, 1.1, TQ), B(0.2, 0.7, 0.2, -0.45, 4.95, 1.05, TQ, { rz: 0.35 }), B(0.2, 0.7, 0.2, 0.45, 4.95, 1.05, TQ, { rz: -0.35 }),
    ...tail,
  ]);
  st.push(put(cat, X(CAT[0]), Z(CAT[1]), 2.4, 2.3));
  shade([{ x: X(CAT[0]), z: Z(CAT[1]) }], 7);

  // ---- tarima de salsa (frente hacia el final de las carreteras, noreste) + pista de baldosas ----
  const SY = 2.356, wood = 0x7a4630, red = 0xc2433d, dark = 0x2f2a36;
  const stage = merge([
    B(24, 1.8, 13, 0, 0.9, 0, wood), B(24.6, 0.4, 13.6, 0, 1.9, 0, red),
    B(24, 9.5, 0.9, 0, 6.6, -6.3, dark), B(24.4, 0.9, 1.2, 0, 11.4, -6.3, 0xff3e8a), B(24.4, 0.5, 1.25, 0, 10.55, -6.3, 0xffffff),
    B(0.9, 9.5, 12, -11.5, 6.6, 0, dark), B(0.9, 9.5, 12, 11.5, 6.6, 0, dark),
    B(25, 0.9, 1.2, 0, 11.6, 6.0, dark), B(0.7, 10, 0.7, -11.9, 6.7, 6.0, 0x6b6f7a), B(0.7, 10, 0.7, 11.9, 6.7, 6.0, 0x6b6f7a),
    B(3.2, 4.4, 2.6, -9.6, 4.3, 2.6, 0x3a3340), B(3.2, 4.4, 2.6, 9.6, 4.3, 2.6, 0x3a3340),
    C(1.0, 1.0, 0.3, -9.6, 5.3, 4.0, 0xc9c3d6, { rx: Math.PI / 2 }, 10), C(1.0, 1.0, 0.3, 9.6, 5.3, 4.0, 0xc9c3d6, { rx: Math.PI / 2 }, 10),
    C(1.5, 1.5, 0.3, -9.6, 3.1, 4.0, 0xc9c3d6, { rx: Math.PI / 2 }, 10), C(1.5, 1.5, 0.3, 9.6, 3.1, 4.0, 0xc9c3d6, { rx: Math.PI / 2 }, 10),
    // timbales/piano: unas cajitas de color
    B(2.6, 1.3, 1.6, -4, 2.6, -1.5, 0xffd166), B(2.6, 1.3, 1.6, 4, 2.6, -1.5, 0xff8fa3), C(0.9, 0.9, 1.0, 0, 2.6, -2.5, 0x45bfe6, {}, 8),
  ]);
  st.push(put(stage, X(STAGE[0]), Z(STAGE[1]), SY, 1));
  // pista: 3 discos concentricos (blanco / rojo / blanco con centro magenta) delante de la tarima
  const fx = Math.sin(SY), fz = Math.cos(SY), PX = X(STAGE[0]) + fx * 19, PZ = Z(STAGE[1]) + fz * 19, PH = heightAt(PX, PZ);
  st.push(merge([C(15.5, 15.5, 0.3, 0, 0.15, 0, 0xf6ebd3, {}, 20), C(12, 12, 0.3, 0, 0.3, 0, 0xc2433d, {}, 20), C(8, 8, 0.3, 0, 0.45, 0, 0xfff6e0, {}, 20), C(3.5, 3.5, 0.3, 0, 0.6, 0, 0xff3e8a, {}, 12)]).applyMatrix4(new THREE.Matrix4().makeTranslation(PX, PH, PZ)));
  shade([{ x: X(STAGE[0]), z: Z(STAGE[1]) }], 17);

  // ---- puesto de chontaduro (frente hacia la carretera, este) ----
  const fruit = [0xe2542b, 0xf06a2a, 0xd9421f, 0xf58a2e], pile = [];
  for (let i = 0; i < 16; i++) { const a = i * 2.4, r = 0.25 + (i % 5) * 0.28; pile.push(bake(new THREE.IcosahedronGeometry(0.46, 0), fruit[i % 4], { x: Math.cos(a) * r - 0.2, y: 2.35 + (i > 9 ? 0.55 : i > 4 ? 0.25 : 0), z: Math.sin(a) * r * 0.7 + 0.5 })); }
  const bunch = (x, y, zz) => { const p = []; for (let i = 0; i < 6; i++) p.push(bake(new THREE.IcosahedronGeometry(0.34, 0), fruit[i % 4], { x: x + (i % 3 - 1) * 0.35, y: y - Math.floor(i / 3) * 0.55, z: zz + (i % 2) * 0.2 })); p.push(C(0.05, 0.05, 0.8, x, y + 0.5, zz, 0x4a7a2a, {}, 4)); return p; };
  const stand = merge([
    B(4.4, 1.5, 2.6, 0, 1.55, 0, 0xfff1d6), B(4.5, 0.25, 2.7, 0, 0.8, 0, 0xe2542b), B(4.6, 0.2, 2.8, 0, 2.35, 0, 0xc98a52),
    C(0.6, 0.6, 0.25, -2.0, 0.6, 1.4, 0x3a2418, { rz: Math.PI / 2 }, 8), C(0.6, 0.6, 0.25, 2.0, 0.6, 1.4, 0x3a2418, { rz: Math.PI / 2 }, 8),
    B(0.2, 4.6, 0.2, -2.2, 2.3, 1.2, 0xc98a52), B(0.2, 4.6, 0.2, 2.2, 2.3, 1.2, 0xc98a52),
    ...[0, 1, 2, 3, 4, 5].map((i) => B(1.0, 0.18, 3.2, -2.5 + i * 1.0, 4.65 - 0.02 * i, 0.5, i % 2 ? 0xffffff : 0xff3e8a, { rx: 0.18 })),
    ...pile, ...bunch(-1.5, 4.0, 1.0), ...bunch(1.5, 4.0, 1.0),
    chibi({ top: 0x3fb8e0, hair: 0x3a2418, skin: 0xd9a27a, bottom: 0x4a3a2a }).applyMatrix4(new THREE.Matrix4().makeTranslation(3.2, 0, -0.6)),
  ]);
  st.push(put(stand, X(STAND[0]), Z(STAND[1]), Math.PI / 2, 1.5));
  shade([{ x: X(STAND[0]), z: Z(STAND[1]) }], 5);

  // ---- iglesia La Ermita (blanca con chapitel azul-gris) ----
  const ermita = merge([
    B(9, 8, 14, 0, 4, 0, 0xffffff), B(9.4, 0.6, 14.4, 0, 8.2, 0, 0x6c8ebf),
    B(5, 14, 5, 0, 7, 7.3, 0xffffff), K(3.8, 11, 0, 19.5, 7.3, 0x6c8ebf, { ry: Math.PI / 4 }, 4), K(1.4, 4, 0, 27, 7.3, 0x8fb0dc, {}, 4),
    B(2.2, 4, 0.3, 0, 3, 9.95, 0x6c8ebf), K(1.1, 1.6, 0, 5.8, 9.95, 0x6c8ebf, { rz: 0 }, 4),
    B(1.4, 2.6, 0.2, -2.8, 10.6, 9.85, 0x6c8ebf), B(1.4, 2.6, 0.2, 2.8, 10.6, 9.85, 0x6c8ebf),
    B(6, 0.4, 5.6, 0, 0.2, 7.3, 0xe6dcc6),
  ]);
  st.push(put(ermita, X(CHURCH[0]), Z(CHURCH[1]), 1.2, 1));
  shade([{ x: X(CHURCH[0]), z: Z(CHURCH[1]) }], 11);

  addVC(scene, merge(st));

  // ---- Cristo Rey (hito: contorno) ----
  const WH = 0xffffff, STONE = 0xe9e3d6;
  const statue = merge([
    C(7.5, 9, 2.6, 0, 1.3, 0, STONE, {}, 10), C(5, 6, 4.5, 0, 4.9, 0, WH, {}, 10),
    C(2.4, 4.6, 17, 0, 15.6, 0, WH, {}, 10), C(2.5, 2.5, 0.7, 0, 15.0, 0, 0xf2c14e, {}, 10),
    B(26, 3.2, 3.2, 0, 21.4, 0, WH), B(25, 1.1, 3.6, 0, 23.0, 0, 0xf2f2f6),
    S(2.2, -13.2, 21.4, 0, 0xf2c9a0, {}, 7, 5), S(2.2, 13.2, 21.4, 0, 0xf2c9a0, {}, 7, 5),
    S(2.9, 0, 26.2, 0, 0xf2c9a0, {}, 9, 6), S(3.05, 0, 27.4, -0.4, 0x3a2418, { sy: 0.7 }, 9, 4),
    K(1.3, 1.6, 0, 30.4, 0, 0xf2c14e, {}, 6),
  ]);
  const cs = put(statue, X(CRISTO[0]), Z(CRISTO[1]), 0.35, 1.3, heightAt(X(CRISTO[0]), Z(CRISTO[1])) + CRISTO[3] + 0.1);
  addVC(scene, cs, { outline: 0.22 });

  // ---- ciudad baja: casas (cuerpo + techo + ventanas emisivas) y torres con luces ----
  const houses = place(grid(z.cx, z.cz, 200, 17, 41), (x, zz) => {
    const d = Math.hypot(x - z.cx, zz - z.cz), h = heightAt(x, zz);
    return d > 38 && d < 215 && h < H0 + 55 && farFromRoad(x, zz, 16) && !blocked(x, zz) && hv(x * 0.9, zz * 0.9, 1) < 0.7 && h;
  }, (x, zz, h) => {
    const w = 7.5 + hv(x, zz, 2) * 4.5, dd = 7.5 + hv(x + 1, zz, 3) * 4, f = foot(x, zz, 5), lvl = hv(x, zz + 1, 4) < 0.3 ? 2 : 1, hh = 4.2 * lvl + hv(x, zz, 5) * 1.4;
    return { x, y: f.lo - 0.4 + (f.hi - f.lo + hh) / 2 + 0.4, z: zz, yaw: Math.floor(hv(zz, x, 6) * 4) * 0.35, sx: w, sy: f.hi - f.lo + hh + 0.4, sz: dd, top: f.hi + hh, hh, c: Math.floor(hv(x * 2.1, zz * 1.1, 7) * WALLS.length), r: Math.floor(hv(zz, x, 8) * ROOFS.length) };
  }).slice(0, 118);
  shade(houses, (h) => Math.max(h.sx, h.sz) * 0.8);
  const box = new THREE.BoxGeometry(1, 1, 1), plain = lambert(0xffffff);
  inst(box, plain, houses, (h) => WALLS[h.c]);
  inst(box, plain, houses.map((h) => ({ ...h, y: h.top + 0.3, sy: 0.9, sx: h.sx * 1.14, sz: h.sz * 1.14 })), (h) => ROOFS[h.r]);
  inst(windowQuads([[-0.25, 0, 0.2, 1], [0.25, 0, 0.2, 1]]), basic(0xffd27a), houses.filter((h) => h.c % 2 === 0).map((h) => ({ x: h.x, y: h.top - h.hh * 0.55, z: h.z, yaw: h.yaw, sx: h.sx, sy: h.hh * 0.42, sz: h.sz })));

  const tw = [[95, 70], [135, 120], [160, 30], [105, 170], [-10, 175], [190, 150], [85, 215], [150, 205], [-115, 60], [-95, 205], [175, 100], [60, 120]]
    .map(([a, b], i) => ({ x: X(a), zz: Z(b), i })).filter((p) => farFromRoad(p.x, p.zz, 18) && !blocked(p.x, p.zz)).map((p) => {
      const hh = 17 + hv(p.x, p.zz, 9) * 17, w = 8 + hv(p.zz, p.x, 10) * 4, f = foot(p.x, p.zz, 5);
      return { x: p.x, y: f.lo + (hh + (f.hi - f.lo)) / 2 - 0.3, z: p.zz, yaw: p.i * 0.7, sx: w, sy: hh + (f.hi - f.lo), sz: w * 0.9, c: p.i };
    });
  const TOWERC = [0xffffff, 0xf3e9d8, 0xcfe0f2, 0xffd9c9, 0xe9e0ff];
  shade(tw, (t) => t.sx * 0.9);
  inst(box, plain, tw, (t) => TOWERC[t.c % 5]);
  inst(box, plain, tw.map((t) => ({ ...t, y: t.y + t.sy / 2 + 0.5, sy: 1.0, sx: t.sx * 1.08, sz: t.sz * 1.08 })), (t) => (t.c % 2 ? 0xc2433d : 0x6c8ebf));
  // franjas de ventanas (3 filas, caras +z y +x) que se encienden de noche
  const strip = (rows) => { const p = []; for (const y of rows) { p.push(bake(new THREE.PlaneGeometry(0.8, 0.07), 0xffffff, { y, z: 0.502 }), bake(new THREE.PlaneGeometry(0.8, 0.07), 0xffffff, { y, x: 0.502, ry: Math.PI / 2 })); } return merge(p); };
  inst(strip([-0.34, -0.17, 0, 0.17, 0.34]), basic(0xffe6a0), tw);

  // ---- farolas (luz calida) y palmas a lo largo de las carreteras; palmas tambien alrededor de la pista ----
  const lamps = [], bulbs = [], palms = [];
  for (const en of z.entries) {
    const dir = en.centerS < en.edgeS ? 1 : -1;
    for (let k = 0, s = en.centerS + dir * 14; k < 9; k++, s += dir * 22) {
      const r = roadAt(s, en.edge), side = k % 2 ? 1 : -1, x = r.x - r.tz * 8.5 * side, zz = r.z + r.tx * 8.5 * side, h = heightAt(x, zz);
      lamps.push({ x, y: h + 3.4, z: zz, sx: 0.22, sy: 6.8, sz: 0.22 }); bulbs.push({ x, y: h + 7.2, z: zz, sx: 1.15, sy: 1.15, sz: 1.15 });
      const x2 = r.x + r.tz * 13 * side, z2 = r.z - r.tx * 13 * side;
      if (k % 2 === 0 && !blocked(x2, z2)) palms.push({ x: x2, y: heightAt(x2, z2) - 0.3, z: z2, yaw: hv(x2, z2, 11) * 6, sx: 1.4, sy: 1.1 + hv(x2, z2, 12) * 0.5, sz: 1.4 });
    }
  }
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, x = PX + Math.cos(a) * 21, zz = PZ + Math.sin(a) * 21; if (farFromRoad(x, zz, 12) && !near(x, zz, STAGE, 17)) palms.push({ x, y: heightAt(x, zz) - 0.3, z: zz, yaw: a * 3, sx: 1.4, sy: 1.2, sz: 1.4 }); }
  [[-80, 80], [-20, 95], [75, 25], [20, 20], [-40, -25]].forEach(([a, b]) => { const x = X(a), zz = Z(b); if (farFromRoad(x, zz, 12) && !blocked(x, zz)) palms.push({ x, y: heightAt(x, zz) - 0.3, z: zz, yaw: a, sx: 1.5, sy: 1.25, sz: 1.5 }); });
  inst(new THREE.CylinderGeometry(1, 1, 1, 5), lambert(0x6b6f7a), lamps);
  inst(new THREE.SphereGeometry(0.7, 6, 5), basic(0xffe39a), bulbs);
  const palmGeo = windAttr(merge([
    C(0.34, 0.5, 5, 0.2, 2.5, 0, 0xc9a36a, { rz: -0.07 }, 6), C(0.28, 0.34, 4, 0.55, 6.9, 0, 0xb98f58, { rz: -0.1 }, 6),
    ...[0, 1, 2, 3, 4, 5].map((i) => K(0.55, 5.2, Math.cos(i * 1.047) * 1.9 + 0.9, 9.2, Math.sin(i * 1.047) * 1.9, i % 2 ? 0x4f9a3e : 0x62ad46, { rz: Math.cos(i * 1.047) * 1.2, rx: -Math.sin(i * 1.047) * 1.2 }, 3)),
    S(0.45, 0.8, 8.9, 0.3, 0x7a4a2a, {}, 4, 3), S(0.45, 1.1, 8.8, -0.3, 0x7a4a2a, {}, 4, 3),
  ]), 10, 0.3);
  shade(palms, 2.5);
  inst(palmGeo, lambert(0xffffff, { wind: true, vc: true }), palms, null, { thin: true });

  // canaverales (conos altos verde-amarillo con viento) en parches al sureste
  const cane = place(grid(X(150), Z(150), 40, 6.5, 55), (x, zz) => farFromRoad(x, zz, 16) && !blocked(x, zz) && hv(x * 0.5, zz * 0.5, 13) < 0.8 && heightAt(x, zz), (x, zz, h) => ({ x, y: h - 0.2, z: zz, sx: 1, sy: 0.9 + hv(x, zz, 14) * 0.6, sz: 1, c: hv(zz, x, 15) })).slice(0, 110);
  inst(windAttr(new THREE.ConeGeometry(1.1, 8, 4).translate(0, 4, 0), 8, 0.35), lambert(0xffffff, { wind: true }), cane, (c) => (c.c < 0.5 ? 0xa9c24a : 0x8fb843), { thin: true });

  // ---- animados: parejas de salsa y luces de la tarima ----
  const man = chibi({ top: 0xffffff, bottom: 0x2b2f4a, hair: 0x2a1a14, skin: 0xd9a27a, armUp: true }).applyMatrix4(new THREE.Matrix4().makeTranslation(-0.85, 0, 0));
  const lady = (c) => chibi({ top: c, skirt: c, hair: 0x1f120c, skin: 0xe8b48c, armUp: true }).applyMatrix4(new THREE.Matrix4().makeTranslation(0.85, 0, 0));
  const pairGeo = merge([man, lady(0xc2433d)]);
  const slots = [[-8, 0], [8, 0], [0, 8.5], [0, -7]], pairs = slots.map(([a, b], i) => ({ x: PX + a * 0.9, z: PZ + b * 0.9 + 0.5, ph: i * 1.3 }));
  const pairIM = inst(pairGeo, lambert(0xffffff, { vc: true }), pairs.map((p) => ({ x: p.x, y: PH + 0.7, z: p.z, sx: 1.9, sy: 1.9, sz: 1.9 })), (p, i) => [0xffffff, 0xffeaf2, 0xfff3d6, 0xe6f7ff][i], { dynamic: true });
  const lightPos = [-10, -6.5, -3.2, 0, 3.2, 6.5, 10].map((dx) => ({ dx, y: 11.9 }));
  const sc = Math.sin(SY), cc = Math.cos(SY);
  const lightIM = inst(new THREE.SphereGeometry(0.85, 6, 5), basic(0xffffff), lightPos.map((l) => ({ x: X(STAGE[0]) + cc * l.dx + sc * 6, y: heightAt(X(STAGE[0]), Z(STAGE[1])) + l.y, z: Z(STAGE[1]) - sc * l.dx + cc * 6 })), (l, i) => LIGHTS[i % LIGHTS.length], { dynamic: true });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), Sc = new THREE.Vector3(), Col = new THREE.Color();
  let lastBeat = -1;
  return {
    update(t) {
      for (let i = 0; i < pairs.length; i++) {
        const p = pairs[i], b = Math.abs(Math.sin(t * 3.2 + p.ph));
        E.set(Math.sin(t * 3.2 + p.ph) * 0.05, t * (i % 2 ? -1.7 : 1.7) + p.ph, Math.cos(t * 3.2 + p.ph) * 0.05); Q.setFromEuler(E);
        M.compose(P.set(p.x, PH + 0.7 + b * 0.35, p.z), Q, Sc.set(1.9, 1.9 + b * 0.1, 1.9)); pairIM.setMatrixAt(i, M);
      }
      pairIM.instanceMatrix.needsUpdate = true;
      const beat = Math.floor(t * 3);
      if (beat !== lastBeat) {
        lastBeat = beat;
        for (let i = 0; i < lightPos.length; i++) {
          const l = lightPos[i];
          Col.set(LIGHTS[(i + beat) % LIGHTS.length]); lightIM.setColorAt(i, Col);
          const k = 0.8 + 0.5 * ((i + beat) % 3 === 0 ? 1 : 0);
          M.compose(P.set(X(STAGE[0]) + cc * l.dx + sc * 6, heightAt(X(STAGE[0]), Z(STAGE[1])) + l.y, Z(STAGE[1]) - sc * l.dx + cc * 6), Q.identity(), Sc.set(k, k, k)); lightIM.setMatrixAt(i, M);
        }
        lightIM.instanceColor.needsUpdate = true; lightIM.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
