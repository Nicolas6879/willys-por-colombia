// Altura base del mundo SIN carretera (pura, determinista, sin three). G4: relieve geografico de Colombia.
// Ejes: x = este, z = sur (norte = -z). Tierra = interior del contorno real (coast.js) y la tierra extranjera que sigue mas alla de las fronteras;
// el mar rodea las costas Caribe y Pacifica. Cordilleras Occidental, Central y Oriental (SO -> NE) con los valles del Cauca y el Magdalena entre
// ellas, Sierra Nevada de Santa Marta, Pacifico bajo al oeste, Llanos planos al este y Amazonia como selva baja al sur. Las regiones son mesetas planas.
import { WORLD, SITES, RIDGES, EXTRA_RIDGES, PEAKS, RIVERS, RIVER, CANYON, ZONE_RADIUS, distPoly } from './layout.js';
import { landSD, countrySD } from './coast.js';
import { lonLatToWorld } from './geoproj.js';
export { WORLD };

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(WORLD.seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const hash01 = (a, b) => hash2(Math.floor(a), Math.floor(b));

export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f + i * 17.3, z * f - i * 9.1); n += a; a *= 0.5; f *= 2; }
  return s / n;
}

export const PLATEAU = { flat: 150, blend: 190 }; // meseta plana alrededor de cada region (radio plano y de mezcla)
const SITE_LIST = Object.values(SITES);

export const canyonCut = (x, z) => { const d = distPoly(x, z, CANYON.pts) / CANYON.w; return d > 3 ? 0 : CANYON.depth * Math.exp(-d * d); };
// los rios grandes se desvanecen dentro de ~300 u de una region (alli mandan las mesetas)
const siteFade = (x, z) => { let m = Infinity; for (const s of SITE_LIST) m = Math.min(m, Math.hypot(x - s.x, z - s.z)); return smooth(170, 300, m); };
export const riverCut = (x, z) => {
  let c = 0;
  const d0 = distPoly(x, z, RIVER.pts) / RIVER.w; if (d0 < 3) c = RIVER.depth * Math.exp(-d0 * d0);
  for (const r of RIVERS) { const d = distPoly(x, z, r.pts) / r.w; if (d < 3) c = Math.max(c, r.depth * Math.exp(-d * d) * siteFade(x, z)); }
  return c;
};

// ---- ejes de las cordilleras como funciones de z (norte-sur) ----
const OCC = RIDGES[0].pts, CEN = RIDGES[1].pts, ORI = RIDGES[2].pts;
function xAt(pts, z) { // x del eje a la latitud z (z decrece al norte); se extrapola constante mas alla de los extremos
  if (z >= pts[0][1]) return pts[0][0];
  for (let i = 0; i < pts.length - 1; i++) if (z <= pts[i][1] && z >= pts[i + 1][1]) { const f = (pts[i][1] - z) / (pts[i][1] - pts[i + 1][1]); return lerp(pts[i][0], pts[i + 1][0], f); }
  return pts[pts.length - 1][0];
}
const zLat = (lat) => lonLatToWorld(0, lat).z;
const Z9 = zLat(9.0), Z3 = zLat(3.0), Z18 = zLat(1.8);
// regiones naturales (0..1): oeste de la Occidental (Pacifico), este de la Oriental (Llanos / Amazonia), norte de 9 grados (llanuras del Caribe), sur (Amazonia)
export function climate(x, z) {
  const dW = xAt(OCC, z) - x, dE = x - xAt(ORI, z);
  return { w: smooth(40, 260, dW), e: smooth(80, 340, dE), n: smooth(Z9 + 90, Z9 - 120, z), s: smooth(Z3, Z18, z) };
}

// "fuera del mapa": franja de colinas bajas justo al otro lado de cada frontera terrestre (o = distancia fuera de Colombia)
export const OUTSIDE = { rise: 70, fall: [260, 460], amp: 26 };

export function baseHeight(x, z) {
  const S = landSD(x, z), sd = countrySD(x, z), c = climate(x, z);
  // suelo base por zona natural
  let h = 30; // valles interandinos
  h = lerp(h, 6, c.w);
  h = lerp(h, lerp(14, 24, c.s) + (fbm(x / 160 + 9, z / 160 - 3, 3) - 0.5) * 8 * c.s, c.e);
  h = lerp(h, 4.5, c.n);
  // cordilleras SO -> NE; se acaban hacia las llanuras del Caribe
  const taper = 1 - 0.85 * c.n, rough = 0.65 + 0.7 * fbm(x / 190 + 2.7, z / 190 - 4.1, 3);
  for (const r of RIDGES) { const d = distPoly(x, z, r.pts) / r.w; if (d < 3) h += taper * r.H * Math.exp(-d * d) * rough; }
  for (const r of EXTRA_RIDGES) { const d = distPoly(x, z, r.pts) / r.w; if (d < 3) h += r.H * Math.exp(-d * d) * rough; }
  for (const p of PEAKS) { const d = Math.hypot(x - p.x, z - p.z) / p.w; if (d < 3) h += p.H * Math.exp(-d * d) * (0.8 + 0.4 * rough); }
  // colinas suaves alrededor de los valles de Medellin y Cali
  for (const [id, amp] of [['medellin', 40], ['cali', 28]]) {
    const s = SITES[id], rr = Math.hypot(x - s.x, z - s.z);
    if (rr < 560) h += smooth(170, 330, rr) * (1 - smooth(380, 560, rr)) * (amp + 0.8 * amp * fbm(x / 200 - 5, z / 200 + 8, 3));
  }
  // fuera del mapa: colinas bajas pegadas a la frontera
  if (sd < 0) { const o = -sd; h += OUTSIDE.amp * smooth(0, OUTSIDE.rise, o) * (1 - smooth(OUTSIDE.fall[0], OUTSIDE.fall[1], o)) * (0.45 + fbm(x / 55 + 4, z / 55 - 7, 2)); }
  // relieve fino (casi plano en costas, Llanos y selva)
  h += (fbm(x / 70 + 21, z / 70 - 13, 3) - 0.5) * 10 * (0.12 + 0.88 * (1 - Math.max(c.w * 0.85, c.e * 0.9, c.n)));
  // mesetas planas de las regiones (terreno aplanado donde viven las zonas)
  for (const s of SITE_LIST) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < PLATEAU.flat + PLATEAU.blend) h = lerp(h, s.h, 1 - smooth(PLATEAU.flat, PLATEAU.flat + PLATEAU.blend, d));
  }
  h -= canyonCut(x, z) + riverCut(x, z);
  // costa: playa que sube suave desde el nivel del mar; mar hondo hasta -9
  if (S >= 0) {
    const bh = 1.2 + 1.8 * smooth(0, 100, S);
    return Math.max(0.8, lerp(bh, h, smooth(15, 85, S)));
  }
  return lerp(1.2, -9, smooth(0, 95, -S));
}
// altura del fondo del mar / playa solo por la distancia a la costa (barata; alimenta la textura de profundidad del agua)
export function seaFloorAt(x, z) { const S = landSD(x, z); return S >= 0 ? 1.2 + 1.8 * smooth(0, 100, S) : lerp(1.2, -9, smooth(0, 95, -S)); }
export { ZONE_RADIUS };
