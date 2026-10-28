// Regiones del mundo (puras, sin three): centro, radio de zona, color, tarjeta didactica y puntos de entrada sobre la red de carreteras.
// Cada carretera que toca una zona tiene su entrada: donde la carretera cruza el borde de la zona; ahi va el banco de neblina (scene.js).
import { ROADS } from './road.js';
import { SITES, ZONE_RADIUS } from './layout.js';
export { ZONE_RADIUS };

export const FORGET_EXTRA = 60; // el live "olvida" su region a radio + esto

const RAW = [
  {
    id: 'medellin', name: 'Medellín', color: 0x4da3ff, fog: 0xd9e6f2, accent: 0xe2418c,
    card: { genre: 'Electrónica melódica (afro house)', instruments: 'congas, shakers, sintetizadores',
      fact: 'Medellín es hoy una de las capitales de la música electrónica latina' },
  },
  {
    id: 'caribe', name: 'Caribe', color: 0xffc233, fog: 0xffe9b8, accent: 0x19b5c9,
    card: { genre: 'Vallenato', instruments: 'acordeón de botones, caja vallenata y guacharaca',
      fact: 'Patrimonio Cultural Inmaterial de la Humanidad (UNESCO, 2015)' },
  },
  {
    id: 'pacifico', name: 'Pacífico', color: 0x1fbf8f, fog: 0xbfe3e0, accent: 0x3fb8e0,
    card: { genre: 'Currulao y marimba de chonta', instruments: 'marimba, cununos, bombo y guasá',
      fact: 'La marimba del Pacífico es Patrimonio Inmaterial de la Humanidad (UNESCO, 2010)' },
  },
  {
    id: 'santander', name: 'Santander', color: 0xe2584d, fog: 0xf2d2b0, accent: 0xe9622b,
    card: { genre: 'Guabina andina', instruments: 'tiple, requinto y bandola',
      fact: 'El tiple es el instrumento nacional de Colombia' },
  },
  {
    id: 'llanos', name: 'Llanos', color: 0xf08a24, fog: 0xfff0c2, accent: 0xff9e1b,
    card: { genre: 'Joropo llanero', instruments: 'arpa llanera, cuatro y maracas',
      fact: 'Música de la sabana de los Llanos Orientales, compartida con Venezuela' },
  },
  {
    id: 'cali', name: 'Cali', color: 0xd63fa8, fog: 0xffd0c0, accent: 0xff3e8a,
    card: { genre: 'Salsa caleña', instruments: 'metales, piano montuno, congas y timbales',
      fact: 'Cali es la capital mundial de la salsa' },
  },
];

// Para cada tramo que toca la zona: el primer punto (desde el centro hacia afuera) fuera del radio
function entriesOf(z) {
  const out = [];
  ROADS.forEach((R, e) => {
    if (R.a !== z.id && R.b !== z.id) return;
    const { px, pz, tx, tz, h, N, step } = R, start = R.a === z.id, dir = start ? 1 : -1;
    let i = start ? 0 : N - 1;
    while (i + dir >= 0 && i + dir < N && Math.hypot(px[i] - z.cx, pz[i] - z.cz) < z.radius) i += dir;
    out.push({ edge: e, other: start ? R.b : R.a, centerS: (start ? 0 : N - 1) * step, edgeS: i * step, x: px[i], z: pz[i], tx: tx[i], tz: tz[i], h: h[i] });
  });
  return out;
}

export const ZONES = RAW.map((z) => {
  const zone = { ...z, cx: SITES[z.id].x, cz: SITES[z.id].z, radius: ZONE_RADIUS, h: SITES[z.id].h };
  const entries = entriesOf(zone);
  return { ...zone, entries };
});
export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z]));
export const ZONE_IDS = ZONES.map((z) => z.id);

export const CARD_MS = 6000;

// ESTILO.md 2.3: color de la niebla de entrada de cada region (fog) y color acento (titulo de la tarjeta). color = el de la UI/minimapa.
// Region cuya niebla debe teñir el fog global en (x,z): {zone, k 0..1}. k sube cerca de una entrada (banco de nubes) y queda un poco dentro de la region.
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function fogRegionAt(x, z, bankReach = 90) {
  let best = { zone: null, k: 0 };
  for (const zn of ZONES) {
    let k = 0.35 * (1 - sstep(zn.radius * 0.55, zn.radius, Math.hypot(x - zn.cx, z - zn.cz)));
    for (const e of zn.entries) k = Math.max(k, 0.85 * (1 - sstep(30, bankReach, Math.hypot(x - e.x, z - e.z))));
    if (k > best.k) best = { zone: zn, k };
  }
  return best;
}
export const cardText = (z) => `${z.card.genre} — ${z.card.instruments} — ${z.card.fact}`;

// Lugares para MemoryController (x, y = z del mundo). outer = radio donde el live olvida su region.
// sections: { [id]: [seccion0, seccion1] } (de places.json) para la opcion `sections` de memory.js
// bases: { [id]: { density?, brightness? } } (de places.json): base musical del lugar para la reactividad (reactive.js)
export function memoryPlaces(prompts = {}, sections = {}, bases = {}) {
  return ZONES.map((z) => ({ id: z.id, x: z.cx, y: z.cz, inner: z.radius, outer: z.radius + FORGET_EXTRA, color: z.color, prompt: prompts[z.id], sections: sections[z.id], density: bases[z.id]?.density, brightness: bases[z.id]?.brightness }));
}

// 0..1: cuanto de neblina de entrada hay en (x,z) (para subir la densidad del fog al cruzarla)
export function fogBoost(x, z, reach = 45) {
  let b = 0;
  for (const zn of ZONES) for (const e of zn.entries) {
    const d = Math.hypot(x - e.x, z - e.z);
    const t = Math.max(0, 1 - d / reach);
    b = Math.max(b, t * t * (3 - 2 * t));
  }
  return b;
}

export const zoneAt = (x, z) => ZONES.find((zn) => Math.hypot(x - zn.cx, z - zn.cz) < zn.radius) || null;
