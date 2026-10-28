// Terreno (puro, sin three): heightAt(x,z) = altura base aplanada a lo largo de la carretera, y datos de la malla low-poly en bloques.
import { WORLD, smooth, lerp, hash01, baseHeight, climate } from './base.js';
import { SITES } from './layout.js';
import { ROAD, ROADS, roadInfo } from './road.js';
import { landSD, countrySD } from './coast.js';

export { WORLD };

// Altura del terreno. Alrededor de la carretera se mezcla con el perfil de la cinta:
// dist <= flat -> altura exacta de la carretera (sin pendiente transversal); flat..blendEnd -> mezcla suave.
export function heightAt(x, z) { return heightWith(x, z, roadInfo(x, z, ROAD.blendEnd + 2)); }
function heightWith(x, z, r) {
  const b = baseHeight(x, z);
  if (r.dist >= ROAD.blendEnd) return b;
  const w = 1 - smooth(ROAD.flat, ROAD.blendEnd, r.dist);
  return lerp(b, r.h, w);
}

const lin = (c) => [Math.pow(((c >> 16) & 255) / 255, 2.2), Math.pow(((c >> 8) & 255) / 255, 2.2), Math.pow((c & 255) / 255, 2.2)];
// Suelo por altura (sRGB -> lineal; three usa vertex colors lineales): arena de costa, pasto, bosque, roca y nieve
const STOPS = [
  [-10, lin(0xe9d79a)], [2.4, lin(0xf2d79a)], [4.2, lin(0xb9d86a)], [30, lin(0x95c95d)], [85, lin(0x5fae58)],
  [135, lin(0x8fa86a)], [175, lin(0xd9d2bf)], [215, lin(0xfaf7f0)],
];
const ROCK = lin(0xbba58a);
// ESTILO.md 2.3: suelo de cada region. Cerca del sitio manda el suelo de la region; a lo largo de cada carretera el suelo hace la transicion
// del suelo de una region al de la otra (tramo a -> b), con un corredor de ~170 u a cada lado.
export const GROUND = { caribe: 0xf2d79a, pacifico: 0x4f8a5b, santander: 0xc58b57, llanos: 0xd8c45e, cali: 0xe2b455, medellin: 0x6e9a4b };
const GROUND_LIN = Object.fromEntries(Object.entries(GROUND).map(([k, v]) => [k, lin(v)]));
const TINT = { llanos: [GROUND_LIN.llanos, 0.85, 400], pacifico: [GROUND_LIN.pacifico, 0.8, 340], santander: [GROUND_LIN.santander, 0.8, 320], caribe: [GROUND_LIN.caribe, 0.7, 280],
  cali: [GROUND_LIN.cali, 0.75, 300], medellin: [GROUND_LIN.medellin, 0.7, 300] };
// zonas naturales (G4): selva baja de la Amazonia, sabana de los Llanos, selva humeda del Pacifico y "fuera del mapa" (gris lila neblinoso)
const AMAZON = lin(0x3f8f4a), SAVANNA = lin(0xcfc267), PACIFIC = lin(0x3f8a58), OUTSIDE_C = lin(0xb4b0a8);
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
// ri = roadInfo(x,z) opcional (para la transicion a lo largo del camino)
export function colorFor(h, ny, x = 0, z = 0, ri = null) {
  let i = 0;
  while (i < STOPS.length - 2 && h > STOPS[i + 1][0]) i++;
  const [h0, c0] = STOPS[i], [h1, c1] = STOPS[i + 1], t = Math.min(1, Math.max(0, (h - h0) / (h1 - h0)));
  let c = mix3(c0, c1, t);
  if (h > 3 && h < 125) {
    const cl = climate(x, z);
    const amazon = cl.e * cl.s, savanna = cl.e * (1 - cl.s) * (1 - cl.n), pacific = cl.w * 0.8;
    if (amazon > 0) c = mix3(c, AMAZON, 0.8 * amazon);
    if (savanna > 0) c = mix3(c, SAVANNA, 0.6 * savanna);
    if (pacific > 0) c = mix3(c, PACIFIC, pacific);
    if (ri && ri.dist < 175) { // transicion del suelo de una region al de la otra a lo largo del tramo
      const R = ROADS[ri.edge], w = 0.8 * (1 - smooth(30, 175, ri.dist));
      c = mix3(c, mix3(GROUND_LIN[R.a], GROUND_LIN[R.b], smooth(0.12, 0.88, ri.t)), w);
    }
    for (const id in TINT) {
      const s = SITES[id], [col, k, R] = TINT[id], w = k * (1 - smooth(R * 0.5, R, Math.hypot(x - s.x, z - s.z)));
      if (w > 0) c = mix3(c, col, w);
    }
  }
  const rock = smooth(0.84, 0.66, ny) * (h > 3 ? 1 : 0); // pendiente fuerte -> roca
  c = mix3(c, ROCK, rock);
  const sd = countrySD(x, z);
  if (sd < 40 && landSD(x, z) > 20) c = mix3(c, OUTSIDE_C, 0.72 * smooth(40, -50, sd)); // fuera del mapa: tierra apagada y neblinosa
  return c;
}

// La malla visual se hunde un poco bajo la cinta para que el pasto nunca la atraviese (G4 seccion 3; ver README)
export const ROAD_SINK = 1.1;
export const roadSink = (dist, max) => (max > 0 && dist < 34 ? max * (1 - smooth(9, 34, dist)) : 0);

export const TERRAIN = { cell: 12.8, chunkCells: 20, footprintOut: 520, seaSkip: 95 };
// Malla sin indices (flat shading real) en bloques de chunkCells x chunkCells celdas. Solo se generan las celdas con tierra (o mar poco profundo)
// hasta `footprintOut` u mas alla del contorno de Colombia; el resto es el fondo plano del mar / el horizonte tapado por la niebla.
// Devuelve { chunks: [{ci, cj, positions, colors, tris, cx, cz}], cell, tris }. opts.sink: cuanto se hunde la malla visual bajo la cinta.
export function buildTerrainData(cell = TERRAIN.cell, chunkCells = TERRAIN.chunkCells, opts = {}) {
  const sinkMax = opts.sink ?? ROAD_SINK;
  const x0 = Math.floor(WORLD.minX / cell) * cell, z0 = Math.floor(WORLD.minZ / cell) * cell;
  const nx = Math.ceil((WORLD.maxX - x0) / cell), nz = Math.ceil((WORLD.maxZ - z0) / cell), n1 = nx + 1;
  const H = new Float32Array(n1 * (nz + 1)), RI = new Array(n1 * (nz + 1)), has = new Uint8Array(n1 * (nz + 1));
  const live = (i, j) => { // celda con geometria?
    const cx = x0 + (i + 0.5) * cell, cz = z0 + (j + 0.5) * cell;
    return countrySD(cx, cz) > -TERRAIN.footprintOut && landSD(cx, cz) > -TERRAIN.seaSkip;
  };
  const need = (i, j) => {
    const k = j * n1 + i;
    if (has[k]) return k;
    has[k] = 1;
    const x = x0 + i * cell, z = z0 + j * cell, r = RI[k] = roadInfo(x, z, 180);
    H[k] = heightWith(x, z, r) - roadSink(r.dist, sinkMax);
    return k;
  };
  const chunks = new Map();
  let tris = 0;
  const cnx = Math.ceil(nx / chunkCells);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (!live(i, j)) continue;
    const ck = Math.floor(j / chunkCells) * cnx + Math.floor(i / chunkCells);
    let C = chunks.get(ck); if (!C) chunks.set(ck, C = { ci: Math.floor(i / chunkCells), cj: Math.floor(j / chunkCells), cells: [] });
    C.cells.push(i, j);
  }
  const out = [];
  for (const C of chunks.values()) {
    const m = C.cells.length / 2, positions = new Float32Array(m * 2 * 9), colors = new Float32Array(m * 2 * 9);
    let o = 0;
    const tri = (ax, ay, az, bx, by, bz, cx, cy, cz, ri) => {
      positions.set([ax, ay, az, bx, by, bz, cx, cy, cz], o);
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nxx = uy * vz - uz * vy, nyy = uz * vx - ux * vz, nzz = ux * vy - uy * vx;
      const l = Math.hypot(nxx, nyy, nzz) || 1, ny = Math.abs(nyy / l);
      const mx = (ax + bx + cx) / 3, mz = (az + bz + cz) / 3, hm = (ay + by + cy) / 3, c = colorFor(hm, ny, mx, mz, ri);
      const jt = 0.94 + 0.12 * hash01(ax * 0.37 + bx * 0.11 + 100, az * 0.29 + cz * 0.13 + 100); // facetas
      for (let k = 0; k < 3; k++) colors.set([c[0] * jt, c[1] * jt, c[2] * jt], o + k * 3);
      o += 9;
    };
    for (let q = 0; q < C.cells.length; q += 2) {
      const i = C.cells[q], j = C.cells[q + 1], xa = x0 + i * cell, za = z0 + j * cell, xb = xa + cell, zb = za + cell;
      const k00 = need(i, j), k10 = need(i + 1, j), k01 = need(i, j + 1), k11 = need(i + 1, j + 1), ri = RI[k00];
      const h00 = H[k00], h10 = H[k10], h01 = H[k01], h11 = H[k11];
      if ((i + j) % 2 === 0) { tri(xa, h00, za, xa, h01, zb, xb, h10, za, ri); tri(xb, h10, za, xa, h01, zb, xb, h11, zb, ri); }
      else { tri(xa, h00, za, xa, h01, zb, xb, h11, zb, ri); tri(xa, h00, za, xb, h11, zb, xb, h10, za, ri); }
    }
    tris += m * 2;
    out.push({ ci: C.ci, cj: C.cj, positions, colors, tris: m * 2, cx: x0 + (C.ci + 0.5) * chunkCells * cell, cz: z0 + (C.cj + 0.5) * chunkCells * cell });
  }
  return { chunks: out, cell, chunkCells, tris, x0, z0 };
}

// Altura de la MALLA visual (interpolacion lineal de los triangulos, como la dibuja three) en (x,z); para diagnosticos y pruebas.
export function meshHeightAt(x, z, opts = {}) {
  const cell = opts.cell ?? TERRAIN.cell, sinkMax = opts.sink ?? ROAD_SINK;
  const x0 = Math.floor(WORLD.minX / cell) * cell, z0 = Math.floor(WORLD.minZ / cell) * cell;
  const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell), xa = x0 + i * cell, za = z0 + j * cell, u = (x - xa) / cell, v = (z - za) / cell;
  const hv = (ii, jj) => { const X = x0 + ii * cell, Z = z0 + jj * cell, r = roadInfo(X, Z, 180); return heightWith(X, Z, r) - roadSink(r.dist, sinkMax); };
  const h00 = hv(i, j), h10 = hv(i + 1, j), h01 = hv(i, j + 1), h11 = hv(i + 1, j + 1);
  if ((i + j) % 2 === 0) return u + v <= 1 ? h00 + u * (h10 - h00) + v * (h01 - h00) : h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
  return u >= v ? h00 + u * (h10 - h00) + v * (h11 - h10) : h00 + v * (h01 - h00) + u * (h11 - h01);
}
