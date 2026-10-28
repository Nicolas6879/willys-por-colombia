// Red de carreteras (pura, sin three): grafo de tramos (layout.js EDGES) como splines Catmull-Rom con curvas de montana, cada uno
// remuestreado a paso fijo. roadInfo(x,z) -> la carretera MAS CERCANA de toda la red:
// {dist, edge (indice), t, s, px, pz, tx, tz, h}: distancia al eje, t = s/largo del tramo, arco s (unidades) desde el sitio `a` del tramo,
// punto mas cercano, tangente unitaria (de a hacia b) y altura del perfil de la carretera.
import { baseHeight } from './base.js';
import { EDGES, SITES } from './layout.js';

export const ROAD = { halfWidth: 5, flat: 14, blendEnd: 44, step: 2, lift: 0.15, surfaceDist: 7, maxGrade: 0.3 };

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function build(P, ha, hb) {
  const n = P.length, dense = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
    for (let k = 0; k < 80; k++) { const t = k / 80; dense.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]); }
  }
  dense.push(P[n - 1].slice());
  // longitud acumulada y remuestreo uniforme
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const L = cum[cum.length - 1], N = Math.round(L / ROAD.step) + 1;
  const px = new Float64Array(N), pz = new Float64Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = (i / (N - 1)) * L;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    px[i] = dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f;
    pz[i] = dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f;
  }
  const tx = new Float64Array(N), tz = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1), dx = px[b] - px[a], dz = pz[b] - pz[a], l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l;
  }
  // perfil de altura: terreno base muestreado y suavizado (corte y terraplen)
  let h = Float64Array.from({ length: N }, (_, i) => baseHeight(px[i], pz[i]));
  const W = 14;
  for (let pass = 0; pass < 3; pass++) {
    const o = new Float64Array(N);
    for (let i = 0; i < N; i++) { let s = 0, c = 0; for (let k = -W; k <= W; k++) { const q = i + k; if (q >= 0 && q < N) { s += h[q]; c++; } } o[i] = s / c; }
    h = o;
  }
  // pendiente maxima de la carretera (cortes y terraplenes donde el terreno es mas empinado)
  const G = ROAD.maxGrade * (L / (N - 1));
  for (let pass = 0; pass < 3; pass++) {
    h[0] = ha; h[N - 1] = hb; // los extremos quedan clavados en la meseta de cada region (las carreteras de una region se juntan a la misma altura)
    for (let i = 0; i < N; i++) h[i] = Math.max(h[i], Math.max(ha - G * i, hb - G * (N - 1 - i)));
    for (let i = 0; i < N; i++) h[i] = Math.min(h[i], Math.min(ha + G * i, hb + G * (N - 1 - i)));
    for (let i = 1; i < N; i++) h[i] = Math.min(h[i - 1] + G, Math.max(h[i - 1] - G, h[i]));
    for (let i = N - 2; i >= 0; i--) h[i] = Math.min(h[i + 1] + G, Math.max(h[i + 1] - G, h[i]));
    const o = new Float64Array(N);
    for (let i = 0; i < N; i++) { let s = 0, c = 0; for (let k = -5; k <= 5; k++) { const q = i + k; if (q >= 0 && q < N) { s += h[q]; c++; } } o[i] = s / c; }
    h = o;
  }
  h[0] = ha; h[N - 1] = hb; // paso final sin suavizar: extremos clavados y pendiente <= maxGrade exacta
  for (let i = 0; i < N; i++) h[i] = Math.min(Math.max(h[i], ha - G * i, hb - G * (N - 1 - i)), ha + G * i, hb + G * (N - 1 - i));
  for (let k = 0; k < 6; k++) {
    for (let i = 1; i < N; i++) h[i] = Math.min(h[i - 1] + G, Math.max(h[i - 1] - G, h[i]));
    for (let i = N - 2; i >= 0; i--) h[i] = Math.min(h[i + 1] + G, Math.max(h[i + 1] - G, h[i]));
  }
  for (let i = 0; i < N; i++) h[i] += ROAD.lift;
  return { px, pz, tx, tz, h, N, L, step: L / (N - 1) };
}
export const ROADS = EDGES.map((e) => ({ ...build(e.ctrl, SITES[e.a].h, SITES[e.b].h), id: e.id, a: e.a, b: e.b }));
export const ROAD_SAMPLES = ROADS[0];   // compat: primer tramo (Medellin -> Caribe)
export const ROAD_LENGTH = ROADS[0].L;
export const ROAD_BY_ID = Object.fromEntries(ROADS.map((r, i) => [r.id, i]));

// rejilla espacial de muestras de toda la red (celda 40 u) para que roadInfo no recorra todo
const CELL = 40, GO = 3000; // rejilla de cubetas de 40 u (coordenadas desplazadas GO para que sean positivas)
export const ROAD_SEARCH = 600; // roadInfo no busca mas lejos (devuelve dist = Infinity y edge = -1)
const grid = new Map(), cellOf = (v) => Math.floor((v + GO) / CELL);
ROADS.forEach((r, e) => {
  for (let i = 0; i < r.N; i++) {
    const k = cellOf(r.px[i]) * 1000 + cellOf(r.pz[i]);
    let g = grid.get(k); if (!g) grid.set(k, g = []);
    g.push(e, i);
  }
});

export function roadInfo(x, z, maxR = ROAD_SEARCH) {
  const cx = cellOf(x), cz = cellOf(z), rMax = Math.ceil(maxR / CELL) + 1;
  let be = -1, bi = 0, bd = Infinity;
  for (let r = 0; r <= rMax; r++) {
    for (let i = cx - r; i <= cx + r; i++) {
      for (let j = cz - r; j <= cz + r; j++) {
        if (r > 0 && Math.abs(i - cx) !== r && Math.abs(j - cz) !== r) continue;
        const g = grid.get(i * 1000 + j);
        if (!g) continue;
        for (let q = 0; q < g.length; q += 2) {
          const R = ROADS[g[q]], k = g[q + 1], dx = x - R.px[k], dz = z - R.pz[k], d = dx * dx + dz * dz;
          if (d < bd) { bd = d; be = g[q]; bi = k; }
        }
      }
    }
    if (be >= 0 && Math.sqrt(bd) <= r * CELL) break;
  }
  if (be < 0 || Math.sqrt(bd) > maxR) return { dist: Infinity, edge: -1, t: 0, s: 0, px: x, pz: z, tx: 1, tz: 0, h: 0 };
  const R = ROADS[be], { px, pz, N } = R;
  let best = null;
  for (const [a, b] of [[bi - 1, bi], [bi, bi + 1]]) {
    if (a < 0 || b >= N) continue;
    const ex = px[b] - px[a], ez = pz[b] - pz[a], l2 = ex * ex + ez * ez;
    const f = clamp01(((x - px[a]) * ex + (z - pz[a]) * ez) / l2);
    const qx = px[a] + ex * f, qz = pz[a] + ez * f, d = Math.hypot(x - qx, z - qz);
    if (!best || d < best.dist) best = { dist: d, a, b, f, px: qx, pz: qz };
  }
  if (!best) best = { dist: Math.sqrt(bd), a: bi, b: bi, f: 0, px: px[bi], pz: pz[bi] };
  const { a, b, f } = best, s = (a + (b - a) * f) * R.step;
  let tx = R.tx[a] + (R.tx[b] - R.tx[a]) * f, tz = R.tz[a] + (R.tz[b] - R.tz[a]) * f;
  const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
  return { dist: best.dist, edge: be, t: s / R.L, s, px: best.px, pz: best.pz, tx, tz, h: R.h[a] + (R.h[b] - R.h[a]) * f };
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const onRoad = (info) => info.dist <= ROAD.surfaceDist;

// punto del eje del tramo `edge` a una distancia de arco s (para el conductor scriptado y los carteles)
export function roadAt(s, edge = 0) {
  const R = ROADS[edge], f0 = Math.min(R.N - 1.0001, Math.max(0, s / R.step)), i = Math.floor(f0), f = f0 - i;
  let tx = R.tx[i] + (R.tx[i + 1] - R.tx[i]) * f, tz = R.tz[i] + (R.tz[i + 1] - R.tz[i]) * f;
  const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
  return { x: R.px[i] + (R.px[i + 1] - R.px[i]) * f, z: R.pz[i] + (R.pz[i + 1] - R.pz[i]) * f, tx, tz, h: R.h[i] + (R.h[i + 1] - R.h[i]) * f };
}

// datos de la cinta de TODA la red (en piezas de ~160 u), sin indices y con color plano por quad (arrays planos; la malla three se arma en scene.js).
// stride: se usa 1 de cada `stride` muestras (la cinta no necesita el paso fino de roadInfo)
const PIECE = 40; // segmentos de la cinta por malla (con stride 2: ~160 u)
export function buildRoadData(stride = 2) {
  const pos = [], cols = [], ranges = []; // ranges: [inicio, fin) en vertices de cada carretera (la escena parte la malla por tramo para el culling)
  const lin = (c) => [Math.pow(((c >> 16) & 255) / 255, 2.2), Math.pow(((c >> 8) & 255) / 255, 2.2), Math.pow((c & 255) / 255, 2.2)];
  const ASPH = lin(0xe8c9a0), EDGE = lin(0xb98b5e), DASH = lin(0xfff1d6), BANK = lin(0x9c7248); // ESTILO 2.3: carretera crema, bordes tierra, linea central crema clara
  const offs = [-6.4, -5, -0.3, 0.3, 5, 6.4]; // borde, asfalto, linea central, asfalto, borde
  for (const { px, pz, tx, tz, h, N } of ROADS) {
    let r0 = pos.length / 3;
    const idx = []; for (let i = 0; i < N - 1; i += stride) idx.push(i); idx.push(N - 1);
    const vx = (i, o) => [px[i] - tz[i] * o, h[i] + (Math.abs(o) > 5.01 ? -0.04 : 0), pz[i] + tx[i] * o];
    for (let m = 0; m < idx.length - 1; m++) {
      if (m > 0 && m % PIECE === 0) { ranges.push([r0, pos.length / 3]); r0 = pos.length / 3; } // tramos de ~160 u: el culling por distancia no dibuja la carretera entera
      const i = idx[m], i2 = idx[m + 1];
      for (let k = 0; k < offs.length - 1; k++) {
        const a = vx(i, offs[k]), b = vx(i, offs[k + 1]), c = vx(i2, offs[k]), d = vx(i2, offs[k + 1]);
        pos.push(...a, ...c, ...b, ...b, ...c, ...d);
        const col = k === 0 || k === 4 ? EDGE : k === 2 ? (Math.floor(m / 2) % 2 === 0 ? DASH : ASPH) : ASPH;
        for (let q = 0; q < 6; q++) cols.push(...col);
      }
      // taludes (G4): faldon de tierra bajo cada borde, para que la cinta nunca flote sobre la malla del terreno (que se hunde bajo ella)
      for (const sg of [-1, 1]) {
        const a = vx(i, 6.4 * sg), c = vx(i2, 6.4 * sg), b = [px[i] - tz[i] * 7.7 * sg, h[i] - 1.45, pz[i] + tx[i] * 7.7 * sg], d = [px[i2] - tz[i2] * 7.7 * sg, h[i2] - 1.45, pz[i2] + tx[i2] * 7.7 * sg];
        pos.push(...a, ...c, ...b, ...b, ...c, ...d);
        for (let q = 0; q < 6; q++) cols.push(...BANK);
      }
    }
    ranges.push([r0, pos.length / 3]);
  }
  return { positions: Float32Array.from(pos), colors: Float32Array.from(cols), ranges };
}
