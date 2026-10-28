// Caribe (G3b): mini-ciudad estilo Cartagena. Entrada por las dos carreteras con puertas de muralla (torre del reloj), calles de casitas coloniales con
// balcones, muralla frente al mar con bastiones y garitas, plaza con el hito (sombrero vueltiao gigante con contorno), acordeon gigante, palenquera,
// marimonda, puesto de arepa de huevo, ciénaga con flamencos, palmeras con cocos, sombrillas de playa y la Sierra Nevada al fondo.
// Animaciones baratas (update(t) lo cablea scene.js): sombrero gira, fuelle del acordeon, bandeja y paso de la palenquera, baile de la marimonda,
// flamencos comiendo, humo de la arepa. Todo con materiales cel compartidos; las mallas fijas se fusionan por tipo.
import { addOutline } from '../materials.js';
import { Bx, Cy, Sp, Co, Oc, Ic, limb, merge, solid, dynInst, setM, smoothstep, bake } from './caribe/kit.js';

const PI = Math.PI;
const CREAM = 0xf3e2b8, OCHRE = 0xe6b65c, STONE = 0xeacfa0, STONE2 = 0xd9b27c, TERRA = 0xd65a3a, WOOD = 0x7a4e2d, DARK = 0x4a2e22;
const WALLS = [0xffd23f, 0xff7f50, 0xff6b9a, 0x4fc3f7, 0x7ee0b0, 0xffa66b]; // amarillo, coral, rosa, celeste, menta, naranja (ESTILO 3.1)

export function build(scene, ctx) {
  const { THREE, inst, grid, place, heightAt, roadInfo, roadAt, hash01, ZONE_BY_ID, lambert, shade, windAttr, stats } = ctx;
  const Z = ZONE_BY_ID.caribe, cx = Z.cx, cz = Z.cz;
  const gy = (x, z) => heightAt(x, z);
  const roadD = (x, z) => roadInfo(x, z).dist;
  const solids = []; // {x,z,r}: huecos ocupados (palmeras no se plantan encima)
  const free = (x, z, r) => solids.every((s) => Math.hypot(x - s.x, z - s.z) > s.r + r);
  const S = []; // geometria fija (coordenadas de mundo), una sola malla
  // grupo local -> mundo
  const put = (parts, x, y, z, yaw = 0, s = 1) => {
    const g = merge(parts); g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s))); S.push(g);
  };

  // ---------- piezas ----------
  const garita = (x, y, z) => [Cy(1.4, 1.6, 2.6, 8, CREAM, { x, y: y + 1.3, z }), Co(2.1, 1.8, 8, TERRA, { x, y: y + 3.5, z }, true), Bx(0.8, 1.2, 0.2, DARK, { x, y: y + 1.2, z: z + 1.5 })];
  const tower = (clock) => {
    const P = [Bx(9, 15, 9, CREAM, { y: 7.5 }), Bx(9.8, 1, 9.8, OCHRE, { y: 15.5 }), Bx(6.4, 4.5, 6.4, CREAM, { y: 18 }), Co(5.2, 4.6, 4, TERRA, { y: 22.5, ry: PI / 4 })];
    for (const [a, b, ry] of [[0, 3.25, 0], [0, -3.25, 0], [3.25, 0, PI / 2], [-3.25, 0, PI / 2]]) P.push(Bx(2.2, 2.8, 0.3, DARK, { x: a, y: 18, z: b, ry }));
    P.push(Bx(2.4, 3.6, 0.3, DARK, { y: 2.2, z: 4.55 }), Bx(1.8, 2, 0.3, 0x2e4a6b, { x: -2.6, y: 9, z: 4.55 }), Bx(1.8, 2, 0.3, 0x2e4a6b, { x: 2.6, y: 9, z: 4.55 }));
    if (clock) for (const sg of [1, -1]) P.push(Cy(2.3, 2.3, 0.5, 14, 0xffffff, { y: 12.4, z: 4.6 * sg, rx: PI / 2 }), Bx(0.28, 1.8, 0.18, 0x2a1a10, { y: 12.9, z: 4.95 * sg }), Bx(1.3, 0.28, 0.18, 0x2a1a10, { x: 0.55 * sg, y: 12.4, z: 4.95 * sg }));
    else P.push(...garita(0, 23.5, 0));
    return P;
  };
  const bastion = (x, z, outAng, withG = true) => {
    const y = gy(x, z) - 0.3, P = [Cy(6.3, 7.2, 9.2, 10, STONE, { x, y: y + 4.6, z }, true), Cy(6.9, 6.9, 0.8, 10, STONE2, { x, y: y + 9.4, z })];
    if (withG) P.push(...garita(x + Math.cos(outAng) * 4.6, y + 9.8, z + Math.sin(outAng) * 4.6));
    S.push(merge(P));
  };
  // tramo de muralla de a a b (altura 7.5, grosor 5); merlons del lado exterior (normal n)
  const wallSeg = (ax, az, bx, bz, nSign = 1, merl = true) => {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, mx = (ax + bx) / 2, mz = (az + bz) / 2, y = gy(mx, mz) - 0.3, ry = -Math.atan2(dz, dx);
    const P = [Bx(L + 0.5, 7.6, 5, STONE, { x: mx, y: y + 3.8, z: mz, ry }), Bx(L + 0.5, 0.6, 5.6, STONE2, { x: mx, y: y + 7.7, z: mz, ry })];
    if (merl) for (let k = 0; k < Math.floor(L / 3.4); k++) {
      const f = (k + 0.5) * 3.4 - L / 2;
      P.push(Bx(1.7, 1.5, 1.7, STONE, { x: mx + ux * f + uz * 1.65 * nSign, y: y + 8.8, z: mz + uz * f - ux * 1.65 * nSign, ry }));
    }
    S.push(merge(P));
  };

  // ---------- muralla del mar (norte): arco con bastiones y garitas ----------
  const WN = 15, wpts = [];
  for (let i = 0; i <= WN; i++) { const u = i / WN * 2 - 1; wpts.push([cx + u * 118, cz - 100 - 13 * (1 - u * u)]); }
  for (let i = 0; i < WN; i++) wallSeg(wpts[i][0], wpts[i][1], wpts[i + 1][0], wpts[i + 1][1], 1);
  for (let i = 0; i <= WN; i += 3) { bastion(wpts[i][0], wpts[i][1], -PI / 2 + (i - WN / 2) * 0.12); solids.push({ x: wpts[i][0], z: wpts[i][1], r: 8 }); }
  for (let i = 0; i <= WN; i++) solids.push({ x: wpts[i][0], z: wpts[i][1], r: 6 });

  // ---------- puertas de las dos carreteras (torre del reloj en la del sur) ----------
  const gates = Z.entries.map((en, k) => {
    const dir = en.centerS < en.edgeS ? 1 : -1, r = roadAt(en.centerS + dir * 104, en.edge), nx = -r.tz, nz = r.tx, out = Math.atan2(r.tx * dir, r.tz * dir); // out: yaw con el +z local hacia fuera del pueblo
    for (const sd of [-1, 1]) {
      const tx = r.x + nx * 16.5 * sd, tz = r.z + nz * 16.5 * sd, ty = gy(tx, tz) - 0.3;
      put(tower(k === 0 && sd === -1), tx, ty, tz, out);
      solids.push({ x: tx, z: tz, r: 7 });
      wallSeg(r.x + nx * 21 * sd, r.z + nz * 21 * sd, r.x + nx * 62 * sd, r.z + nz * 62 * sd, sd * dir, true);
      bastion(r.x + nx * 66 * sd, r.z + nz * 66 * sd, Math.atan2(r.tz * dir, r.tx * dir), true);
      for (let q = 0; q < 6; q++) solids.push({ x: r.x + nx * (21 + q * 8) * sd, z: r.z + nz * (21 + q * 8) * sd, r: 6 });
    }
    return { en, dir, r };
  });

  // ---------- casitas coloniales con balcones (instanciadas) ----------
  const houses = [];
  const tryAt = (x, z, fx, fz, seedK) => {
    if (roadD(x, z) < 8.2 || Math.hypot(x - cx, z - cz) < 18) return;
    if (houses.some((h) => Math.hypot(h.x - x, h.z - z) < 6.4) || !free(x, z, 3)) return;
    const s = 0.58 + hash01(x * 0.7, z * 0.9 + seedK) * 0.14; // casita ~5 u de alto (~2x el Willys)
    houses.push({ x, y: gy(x, z) - 0.2, z, yaw: Math.atan2(fx, fz), sx: s, sy: s, sz: s, c: Math.floor(hash01(x * 1.9 + seedK, z * 1.3) * WALLS.length) });
  };
  const tryHouse = (en, dir, d, off, side, seedK) => {
    const r = roadAt(en.centerS + dir * d, en.edge), nx = -r.tz, nz = r.tx;
    tryAt(r.x + nx * off * side, r.z + nz * off * side, -nx * side, -nz * side, seedK);
  };
  for (const { en, dir } of gates) {
    for (let d = 24; d <= 94; d += 7) for (const side of [-1, 1]) tryHouse(en, dir, d + (side > 0 ? 2 : 0), 10.6, side, 1);
    for (let d = 30; d <= 92; d += 9) for (const side of [-1, 1]) if (hash01(d * 3.1, side * 7 + en.edge) < 0.55) tryHouse(en, dir, d, 20, side, 2);
  }
  // casitas alrededor de la plaza (miran al centro de la plaza)
  for (const [dx, dz] of [[-62, -62], [-78, -44], [72, -76], [86, -54], [58, -90], [-58, -90], [-90, -70], [100, -78]]) tryAt(cx + dx, cz + dz, cx + 2 - (cx + dx), cz - 46 - (cz + dz), 3);
  const body = new THREE.BoxGeometry(8, 8.5, 7).translate(0, 4.25, 0);
  const trim = merge([
    Bx(8.7, 0.8, 7.7, 0xfff3d6, { y: 8.7 }), Bx(6.2, 0.35, 2.4, WOOD, { y: 4.9, z: 4.2 }), Bx(6.2, 0.95, 0.2, 0x5a3822, { y: 5.55, z: 5.3 }),
    Bx(1.7, 2.3, 0.2, 0x2e4a6b, { x: -2, y: 6.9, z: 3.55 }), Bx(1.7, 2.3, 0.2, 0x2e4a6b, { x: 2, y: 6.9, z: 3.55 }), Bx(2, 3.4, 0.2, 0x5a3822, { y: 1.7, z: 3.55 }),
    Co(6.6, 2.6, 4, 0xc8502f, { y: 10.3, ry: PI / 4 }), Bx(0.2, 2, 1.6, 0x2e4a6b, { x: 4.05, y: 5.5, z: 0 }),  
    Oc(1.0, 0xe2418c, { x: -2.4, y: 5.9, z: 4.7 }), Oc(0.9, 0xe2418c, { x: 1.9, y: 5.8, z: 4.9 }), Oc(0.75, 0xff6fb1, { x: 0.2, y: 5.7, z: 5.1 }),
  ]);
  inst(body, lambert(0xffffff), houses, (h) => WALLS[h.c]);
  inst(trim, lambert(0xffffff, { vc: true }), houses);
  shade(houses.slice(0, 50), 4);
  houses.forEach((h) => solids.push({ x: h.x, z: h.z, r: 3.6 }));

  // ---------- plaza empedrada ----------
  const PL = { x: cx + 2, z: cz - 46, r: 34 };
  const plazaY = gy(PL.x, PL.z) + 0.1;
  S.push(bake(new THREE.CircleGeometry(PL.r, 24).rotateX(-PI / 2), (x, y, z) => { const t = Math.hypot(x - PL.x, z - PL.z) / PL.r; return t < 0.25 ? 0xfff0c8 : t > 0.88 ? 0xd9b27c : 0xf0d9a6; }, { x: PL.x, y: plazaY, z: PL.z }));
  solids.push({ x: PL.x, z: PL.z, r: PL.r });

  // ---------- sombrero vueltiao (hito, contorno, gira) ----------
  const hat = (() => {
    const BLK = 0x241812, WHT = 0xf4ead2, prof = [], cols = [], add = (r, y, c) => { prof.push(new THREE.Vector2(r, y)); cols.push(c); };
    // perfil CCW (solido a la izquierda): bajo del ala -> borde -> ala (anillos negro/crema) -> copa -> tapa. Puntos duplicados = bandas nitidas.
    add(0.01, 0.1, WHT); add(5.6, 0.1, WHT); add(11.8, -1.1, WHT); add(12.2, -0.6, BLK);
    const bands = [[12.2, -0.6], [11.0, -0.35], [9.6, -0.05], [8.2, 0.3], [6.2, 0.9]];
    bands.forEach(([r, y], i) => { const c = i % 2 ? WHT : BLK; add(r, y, c); if (i < bands.length - 1) add(r - 0.02, y + 0.01, i % 2 ? BLK : WHT); });
    const crown = [[6.0, 0.9, 5.8, 2.3], [5.7, 2.5, 5.4, 4.0], [5.3, 4.2, 5.1, 5.6]];
    crown.forEach(([r0, y0, r1, y1], i) => { const c = i % 2 ? BLK : WHT; add(r0, y0 + 0.001, c); add(r1, y1, c); });
    add(5.0, 5.9, BLK); add(3.0, 6.4, BLK); add(0.01, 6.6, BLK);
    const g = new THREE.LatheGeometry(prof, 16), n = prof.length, col = new Float32Array(g.attributes.position.count * 3), cc = new THREE.Color();
    for (let i = 0; i < g.attributes.position.count; i++) { cc.set(cols[i % n]); col.set([cc.r, cc.g, cc.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  })();
  const HAT = { x: cx - 34, z: cz - 52 }; HAT.y = gy(HAT.x, HAT.z);
  solid(scene, stats, merge([Cy(2.4, 3.2, 4.2, 10, STONE2, { y: 2.1 }), Cy(5.5, 6.2, 0.9, 14, OCHRE, { y: 0.45 })]), { x: HAT.x, y: HAT.y, z: HAT.z });
  const hatMesh = solid(scene, stats, hat, { x: HAT.x, y: HAT.y + 4.6, z: HAT.z, outline: { thickness: 0.3 }, addOutline });
  hatMesh.scale.setScalar(0.8); solids.push({ x: HAT.x, z: HAT.z, r: 11 }); shade([HAT], 15, 0.9);

  // ---------- acordeon gigante ----------
  const ACC = { x: cx + 36, z: cz - 62 }; ACC.y = gy(ACC.x, ACC.z); ACC.yaw = Math.atan2(-(cz + 10 - ACC.z), cx + 6 - ACC.x);
  const accL = merge([Bx(4.4, 10.5, 7.2, 0xc7262c, { y: 5.25 }), Bx(0.5, 9.4, 6.2, 0x241812, { x: -2.35, y: 5.25 }), Bx(4.6, 0.6, 7.4, 0xffffff, { y: 10.7 }),
    ...[0, 1, 2].flatMap((a) => [0, 1, 2, 3].map((b) => Oc(0.42, 0xf6efe0, { x: -2.7, y: 3 + b * 2, z: -2 + a * 2 })))]);
  const accR = merge([Bx(4.4, 10.5, 7.2, 0xc7262c, { y: 5.25 }), Bx(0.5, 9.4, 6.2, 0x241812, { x: 2.35, y: 5.25 }), Bx(4.6, 0.6, 7.4, 0xffffff, { y: 10.7 }),
    ...[0, 1, 2].flatMap((a) => [0, 1, 2, 3, 4].map((b) => Oc(0.46, 0xf6efe0, { x: 2.75, y: 2 + b * 1.7, z: -2.1 + a * 2.1 })))]);
  const accB = merge(Array.from({ length: 9 }, (_, i) => Bx(2 / 9 * 1.02, i % 2 ? 8.4 : 9.4, i % 2 ? 5.6 : 6.6, i % 2 ? 0xffffff : 0xe5372e, { x: -1 + (i + 0.5) * 2 / 9, y: 5.25 })));
  const accG = new THREE.Group(); accG.position.set(ACC.x, ACC.y, ACC.z); accG.rotation.y = ACC.yaw; scene.add(accG);
  const aL = solid(scene, stats, accL, { parent: accG }), aR = solid(scene, stats, accR, { parent: accG }), aB = solid(scene, stats, accB, { parent: accG });
  solids.push({ x: ACC.x, z: ACC.z, r: 11 }); shade([ACC], 12, 0.9);

  // ---------- palenquera ----------
  const PAL = { x: cx + 14, z: cz - 26 }; PAL.y = gy(PAL.x, PAL.z);
  const palBody = merge([
    Cy(2.0, 2.9, 1.2, 12, 0xe5372e, { y: 0.6 }, true), Cy(1.6, 2.1, 1.3, 12, 0xffd23f, { y: 1.8 }, true), Cy(1.3, 1.7, 1.1, 12, 0x2a8bd6, { y: 2.95 }, true),
    Sp(1.25, 0xffffff, { y: 3.9, sy: 0.85 }), Sp(1.65, 0x8a5232, { y: 5.6 }, 10, 8),
    Sp(1.7, 0xffd23f, { y: 6.0, sy: 0.55 }, 10, 5), Sp(0.2, 0x1a100a, { x: -0.55, y: 5.7, z: 1.5 }, 5, 4), Sp(0.2, 0x1a100a, { x: 0.55, y: 5.7, z: 1.5 }, 5, 4), Sp(0.28, 0xff8a8a, { y: 5.2, z: 1.55, sx: 1.6, sy: 0.5 }, 5, 4),
    limb([-1.2, 4.2, 0], [-2.5, 6.4, 0.2], 0.34, 0.3, 5, 0x8a5232), limb([1.2, 4.2, 0], [2.5, 6.4, 0.2], 0.34, 0.3, 5, 0x8a5232),
  ]);
  const palTray = merge([
    Cy(3.3, 2.9, 0.35, 14, 0xc77c3e, { y: 0.2 }), Co(0.85, 1.8, 7, 0xffc21a, { x: -1.5, y: 1.3, z: 0.3 }), Co(0.5, 1.2, 5, 0x3fa34d, { x: -1.5, y: 2.7, z: 0.3 }, true),
    Sp(0.95, 0xff9a3c, { x: 0.4, y: 1.1, z: 0.9 }, 7, 5), Sp(1.1, 0x3fa34d, { x: 1.6, y: 1.2, z: -0.5, sx: 1.3 }, 7, 5), Sp(0.8, 0xe5372e, { x: -0.3, y: 1.0, z: -1.3 }, 7, 5),
    limb([0.8, 0.6, 1.7], [2.3, 0.8, 1.4], 0.32, 0.3, 5, 0xffe14d), Sp(0.7, 0xb06fd4, { x: 2.3, y: 0.9, z: 0.6 }, 6, 4),
  ]);
  const palG = new THREE.Group(); palG.position.set(PAL.x, PAL.y, PAL.z); scene.add(palG);
  const palM = solid(scene, stats, palBody, { parent: palG }), palT = solid(scene, stats, palTray, { parent: palG, y: 7.2 });
  palG.scale.setScalar(1.25); solids.push({ x: PAL.x, z: PAL.z, r: 4.5 }); shade([PAL], 4.5);

  // ---------- marimonda bailando ----------
  const MAR = { x: cx - 6, z: cz - 44 }; MAR.y = gy(MAR.x, MAR.z);
  const mar = merge([
    Cy(0.5, 0.45, 1.8, 6, 0xffd23f, { x: -0.8, y: 1.0 }), Cy(0.5, 0.45, 1.8, 6, 0xffd23f, { x: 0.8, y: 1.0 }),
    Sp(0.75, 0x2a8bd6, { x: -0.8, y: 0.35, z: 0.3, sz: 1.35 }, 6, 4), Sp(0.75, 0x2a8bd6, { x: 0.8, y: 0.35, z: 0.3, sz: 1.35 }, 6, 4),
    Sp(2.0, 0xff3e8a, { y: 3.4, sy: 1.1 }, 9, 7),
    ...[[-1, 0.9], [0.9, 1.2], [-1.2, -0.2], [0.8, -0.5], [0.0, 0.2], [1.3, 0.55], [-0.3, -1.1]].map(([a, b], i) => { const y = 3.4 + b * 1.2, rr = Math.sqrt(Math.max(0.1, 4 - (a * 1.1) ** 2 - (y - 3.4) ** 2 / 1.2)); return Oc(0.42, i % 2 ? 0xffffff : 0xffe14d, { x: a * 1.1, y, z: rr * 0.97 }); }),
    limb([-1.7, 4.2, 0], [-3.1, 5.4, 0.6], 0.38, 0.32, 5, 0xffd23f), limb([1.7, 4.2, 0], [3.1, 3.4, 0.9], 0.38, 0.32, 5, 0xffd23f), Sp(0.5, 0xffffff, { x: -3.2, y: 5.5, z: 0.6 }, 5, 4), Sp(0.5, 0xffffff, { x: 3.2, y: 3.3, z: 0.9 }, 5, 4),
    Sp(1.6, 0xfff1d6, { y: 6.2 }, 9, 7), Sp(0.52, 0xffffff, { x: -0.62, y: 6.5, z: 1.2, sz: 0.6 }, 6, 4), Sp(0.52, 0xffffff, { x: 0.62, y: 6.5, z: 1.2, sz: 0.6 }, 6, 4),
    Sp(0.24, 0x1a100a, { x: -0.62, y: 6.5, z: 1.58, sz: 0.5 }, 5, 4), Sp(0.24, 0x1a100a, { x: 0.62, y: 6.5, z: 1.58, sz: 0.5 }, 5, 4),
    limb([0, 5.9, 1.4], [0, 5.1, 2.8], 0.42, 0.32, 6, 0xff8a3d), limb([0, 5.1, 2.8], [0, 3.9, 3.2], 0.32, 0.22, 6, 0xff8a3d),
    Sp(1.1, 0xffd23f, { x: -1.8, y: 6.5, sx: 0.32, sy: 1.25, sz: 0.9 }, 6, 5), Sp(1.1, 0xffd23f, { x: 1.8, y: 6.5, sx: 0.32, sy: 1.25, sz: 0.9 }, 6, 5),
    Co(1.9, 4.4, 8, 0x19b5c9, { y: 8.6, z: -0.9, rx: -0.5 }, true), Co(0.9, 2.8, 6, 0xffd23f, { y: 10.9, z: -3.3, rx: -1.1 }, true),
  ]);
  const marM = solid(scene, stats, mar, { x: MAR.x, y: MAR.y, z: MAR.z }); marM.scale.setScalar(0.85); solids.push({ x: MAR.x, z: MAR.z, r: 4 }); shade([MAR], 4);

  // ---------- puesto de arepa de huevo ----------
  const AR = { x: cx - 18, z: cz - 20 }; AR.y = gy(AR.x, AR.z);
  const stall = [Bx(7.2, 2, 3.4, 0xb5753c, { y: 1 }), Bx(7.7, 0.25, 3.9, 0xfff0d0, { y: 2.1 }), Bx(7.2, 3.6, 0.25, 0xffd23f, { y: 4.2, z: -1.8 }),
    Cy(1.65, 1.65, 0.4, 12, 0xe9b44c, { y: 8.3, z: 0.4, rx: PI / 2 }), Cy(0.7, 0.7, 0.2, 10, 0xffffff, { y: 8.3, z: 0.7, rx: PI / 2 }), Sp(0.42, 0xffc21a, { y: 8.3, z: 0.9, sz: 0.5 }, 6, 4)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) stall.push(Cy(0.18, 0.18, 6, 5, 0x7a4e2d, { x: 3.5 * sx, y: 3, z: 1.7 * sz }, true));
  for (let i = 0; i < 6; i++) stall.push(Bx(1.3, 0.3, 4.9, i % 2 ? 0xffffff : 0xe5372e, { x: -3.25 + i * 1.3, y: 6.15, z: 0.1, rx: 0.2 }));
  [-2.4, -0.8, 0.8].forEach((x, i) => stall.push(Cy(0.95, 0.95, 0.4, 10, 0xe9b44c, { x, y: 2.5, z: 0.4 }), Cy(0.55, 0.55, 0.1, 8, 0xffffff, { x: x + 0.1, y: 2.75, z: 0.5 }), Sp(0.3, 0xffc21a, { x: x + 0.1, y: 2.85, z: 0.5, sy: 0.6 }, 6, 4)));
  stall.push(Cy(0.9, 0.9, 0.55, 8, 0x3a3030, { x: 2.7, y: 2.4, z: 0.3 }));
  put(stall, AR.x, AR.y, AR.z, 0.35); solids.push({ x: AR.x, z: AR.z, r: 5.5 }); shade([AR], 6);
  const smokeI = dynInst(scene, stats, new THREE.SphereGeometry(0.6, 6, 4), 'plain', 3, [0xf4efe6, 0xe6dfd2, 0xf4efe6]);
  const sxo = AR.x + Math.cos(0.35) * 2.7, szo = AR.z - Math.sin(0.35) * 2.7;

  // ---------- sombrillas de playa ----------
  const umb = [[-46, -142], [-14, -138], [22, -144], [56, -140], [90, -136]].map(([dx, dz]) => ({ x: cx + dx, z: cz + dz }));
  const umbParts = [Cy(0.13, 0.13, 3.8, 5, 0xf5e9d0, { y: 1.9 }, true), Co(2.7, 1.2, 8, (x, y, z, i) => (Math.floor(i / 3) % 2 ? 0xffffff : 0xe5372e), { y: 4.3 }, true), Oc(0.4, 0xffd23f, { y: 4.95 })];
  const umbGeo = merge(umbParts);
  inst(umbGeo, lambert(0xffffff, { vc: true }), umb.map((u, i) => ({ x: u.x, y: gy(u.x, u.z) - 0.1, z: u.z, yaw: i * 1.3, pitch: 0.12 })));
  for (const u of umb) solids.push({ x: u.x, z: u.z, r: 3 });

  // ---------- fusion de lo fijo ----------
  const stat = merge(S);
  solid(scene, stats, stat);

  // ---------- Sierra Nevada (fondo, nieve en lo alto) ----------
  const peak = (r, H, x, z, seed) => {
    const g = new THREE.ConeGeometry(r, H, 12, 6, true);
    return bake(g, (px, py) => { const f = (py + 12) / H, n = 0.05 * Math.sin(px * 0.2 + seed); return f > 0.64 + n ? 0xffffff : f > 0.52 + n ? 0xc8d4e6 : f > 0.25 ? 0x8aa0a8 : 0x6e9a78; }, { x, y: H / 2 - 12, z });
  };
  const sn = merge([peak(88, 140, cx + 215, cz + 30, 1), peak(70, 100, cx + 150, cz + 105, 2), peak(62, 86, cx + 285, cz - 15, 3), peak(55, 70, cx + 255, cz + 100, 4)]); // G4: la Sierra Nevada real queda al ESTE del Caribe (antes al oeste)
  solid(scene, stats, sn);

  // ---------- ciénaga con flamencos ----------
  const PD = { x: cx - 92, z: cz - 8, rx: 27, rz: 16 }; PD.y = gy(PD.x, PD.z) + 0.12;
  solid(scene, stats, bake(new THREE.CircleGeometry(1, 22).rotateX(-PI / 2), (x, y, z) => (Math.hypot(x - PD.x, z - PD.z) < 14 ? 0x74d3dc : 0xf2a9bd), { x: PD.x, y: PD.y, z: PD.z, sx: PD.rx, sz: PD.rz }));
  solids.push({ x: PD.x, z: PD.z, r: 27 });
  const PINK = 0xff8fb1, PINKD = 0xe86a92;
  const flBody = merge([
    Sp(1, PINK, { y: 3.9, sy: 0.85, sz: 1.5 }, 8, 6), Co(0.6, 1.8, 5, PINKD, { y: 3.9, z: -2.2, rx: -PI / 2 }, true),
    Sp(0.9, PINKD, { x: 0.78, y: 4.0, z: -0.2, sx: 0.25, sy: 0.75, sz: 1.2 }, 5, 4), Sp(0.9, PINKD, { x: -0.78, y: 4.0, z: -0.2, sx: 0.25, sy: 0.75, sz: 1.2 }, 5, 4),
    limb([0.3, 3.3, 0.1], [0.3, 0, 0.1], 0.12, 0.09, 4, PINKD), limb([-0.3, 3.3, 0.1], [-0.3, 2.4, -0.6], 0.12, 0.11, 4, PINKD), limb([-0.3, 2.4, -0.6], [-0.3, 2.0, 0.4], 0.11, 0.1, 4, PINKD),
    Bx(0.6, 0.1, 1.0, PINKD, { x: 0.3, y: 0.05, z: 0.4 }),
  ]);
  const flNeck = merge([
    limb([0, 0, 0], [0, 1.6, 0.5], 0.3, 0.22, 5, PINK), limb([0, 1.6, 0.5], [0, 3.0, -0.05], 0.22, 0.2, 5, PINK), limb([0, 3.0, -0.05], [0, 3.4, 0.45], 0.2, 0.2, 5, PINK),
    Sp(0.42, PINK, { y: 3.5, z: 0.6 }, 6, 5), Co(0.2, 1.0, 4, 0x2a1a1a, { y: 3.35, z: 1.3, rx: PI / 2 + 0.45 }, true), Sp(0.1, 0x1a100a, { x: 0.33, y: 3.65, z: 0.7 }, 4, 3), Sp(0.1, 0x1a100a, { x: -0.33, y: 3.65, z: 0.7 }, 4, 3),
  ]);
  const FL = Array.from({ length: 7 }, (_, i) => {
    const a = i * 2.4, rr = 5 + (i % 3) * 5.5 + hash01(i, 77) * 3, x = PD.x + Math.cos(a) * rr * 1.25, z = PD.z + Math.sin(a) * rr * 0.65;
    return { x, z, y: PD.y, yaw: a + PI * 0.5 + (hash01(i, 5) - 0.5), s: 1.0 + hash01(i, 9) * 0.25, per: 3 + hash01(i, 3) * 2, ph: i * 1.7 };
  });
  inst(flBody, lambert(0xffffff, { vc: true }), FL.map((f) => ({ x: f.x, y: f.y, z: f.z, yaw: f.yaw, sx: f.s, sy: f.s, sz: f.s })));
  const flN = dynInst(scene, stats, flNeck, 'vc', FL.length);

  // ---------- palmeras con cocos (tronco curvo + 6 hojas) ----------
  const palmGeo = (() => {
    const P = [], tp = [[0, 0, 0], [0.35, 2.6, 0], [1.0, 5.2, 0], [1.9, 7.6, 0]], bark = [0xb98550, 0xa87846, 0x9a6c3e];
    for (let i = 0; i < 3; i++) P.push(limb(tp[i], tp[i + 1], 0.42 - i * 0.07, 0.35 - i * 0.07, 5, bark[i]));
    for (let k = 0; k < 6; k++) {
      const a = k * PI / 3 + 0.3, tilt = k % 2 ? 0.25 : -0.45; // arriba / caida
      P.push(bake(new THREE.ConeGeometry(0.95, 4.6, 4, 1, true).translate(0, 2.3, 0), k % 2 ? 0x5dbb63 : 0x4aa955, { x: 1.9, y: 7.8, z: 0, ry: -a, rz: -(PI / 2 - tilt), sx: 0.28 }));
    }
    P.push(Oc(0.42, 0x6b4a2b, { x: 1.6, y: 7.3, z: 0.5 }), Oc(0.42, 0x6b4a2b, { x: 2.3, y: 7.35, z: -0.3 }), Oc(0.4, 0x7a5535, { x: 1.9, y: 7.1, z: -0.7 }));
    return windAttr(merge(P), 9, 0.3);
  })();
  const palms = place(grid(cx, cz, 235, 14, 5), (x, zz) => {
    const h = gy(x, zz), dBeach = zz < cz - 108 && zz > cz - 156;
    if (h < 0.9 || h > 8 || Math.hypot(x - cx, zz - cz) > 250 || roadD(x, zz) < 13) return false;
    if (!free(x, zz, 2.5)) return false;
    if (!dBeach && Math.hypot(x - cx, zz - cz) < 110 && hash01(x * 0.6, zz * 0.9) > 0.12) return false; // dentro del pueblo casi no hay
    return hash01(x * 0.7, zz * 0.7) < (dBeach ? 0.5 : 0.28) && h;
  }, (x, zz, h) => ({ x, y: h - 0.2, z: zz, yaw: hash01(x, zz) * 6.28, sx: 0.9 + hash01(zz, x) * 0.3, sy: 0.85 + hash01(zz, x + 1) * 0.5, sz: 0.9 + hash01(x + 1, zz) * 0.3 })).slice(0, 70);
  inst(palmGeo, lambert(0xffffff, { wind: true, vc: true }), palms, null, { thin: true });
  shade(palms.slice(0, 35), 2.6);

  // ---------- animacion ----------
  const neckOf = (f, t) => { const u = ((t + f.ph) % f.per) / f.per, a = u < 0.34 ? smoothstep(0, 0.12, u) * (1 - smoothstep(0.24, 0.34, u)) : 0; return 0.12 + Math.sin(t * 0.9 + f.ph) * 0.07 + a * 2.55; };
  const update = (t) => {
    hatMesh.rotation.y = t * 0.35;
    const open = 1.15 + Math.sin(t * 2.6) * 0.3 + Math.sin(t * 1.3) * 0.1, half = open * 5.2;
    aB.scale.x = half; aB.position.x = 0; aL.position.x = -half - 2.2; aR.position.x = half + 2.2;
    const b = Math.sin(t * 2.0); palT.rotation.z = Math.sin(t * 1.6) * 0.09; palT.rotation.x = Math.cos(t * 1.3) * 0.06; palG.rotation.z = Math.sin(t * 1.0) * 0.03; palM.position.y = Math.abs(b) * 0.1; palT.position.y = 7.2 + Math.abs(b) * 0.1;
    marM.position.y = MAR.y + Math.abs(Math.sin(t * 5.2)) * 1.1; marM.rotation.z = Math.sin(t * 2.6) * 0.18; marM.rotation.y = Math.sin(t * 1.3) * 0.5;
    for (let i = 0; i < 3; i++) { const u = ((t * 0.45 + i / 3) % 1), sc = Math.sin(u * PI) * 1.0 + 0.05; setM(smokeI, i, sxo + Math.sin(u * 6 + i) * 0.4, AR.y + 3.0 + u * 6, szo, 0, 0, 0, sc, sc, sc); }
    smokeI.instanceMatrix.needsUpdate = true;
    FL.forEach((f, i) => { const c = Math.cos(f.yaw), s = Math.sin(f.yaw); setM(flN, i, f.x + s * 1.2 * f.s, f.y + 4.3 * f.s, f.z + c * 1.2 * f.s, f.yaw, neckOf(f, t), 0, f.s * 1.2, f.s * 1.2, f.s * 1.2); });
    flN.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { update };
}
