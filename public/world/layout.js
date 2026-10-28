// Disposicion del mundo (pura, G4): Colombia a escala real (geoproj.js), sitios de las 6 regiones en su lugar geografico, grafo de carreteras por
// valles y pasos, cordilleras, rios, sierra y canon. Ejes: x = este, z = sur (norte = -z). Todo se escribe en lon/lat y se proyecta una sola vez.
import { llx, lonLatToWorld } from './geoproj.js';
import { WORLD_BOUNDS } from './coast.js';

const B = WORLD_BOUNDS;
export const WORLD = {
  minX: B.minX, maxX: B.maxX, minZ: B.minZ, maxZ: B.maxZ, width: B.maxX - B.minX, height: B.maxZ - B.minZ,
  seed: 1337, sea: 0,
};
WORLD.size = Math.max(WORLD.width, WORLD.height); // compat: lado del cuadrado que contiene el mundo
WORLD.half = WORLD.size / 2;
WORLD.cx = (B.minX + B.maxX) / 2; WORLD.cz = (B.minZ + B.maxZ) / 2;
export const ZONE_RADIUS = 120;

const W = (lon, lat) => llx(lon, lat).map(Math.round);

// Sitios en lon/lat. Medellin, Santander, Llanos y Cali en su coordenada real; el Caribe se baja 0.2 grados y el Pacifico se corre al sur/este
// (Quibdo queda a solo 130 km de Medellin: con meseta plana de 150 u no cabria) para que haya sitio para las mesetas y mar a 185 u de cada costa.
// h = altura de la meseta plana de la region
export const GEO_SITES = {
  medellin: { lon: -75.57, lat: 6.25, h: 38 },
  caribe: { lon: -75.0, lat: 10.4, h: 3 },
  santander: { lon: -73.1, lat: 6.7, h: 85 },
  llanos: { lon: -71.5, lat: 4.5, h: 14 },
  pacifico: { lon: -76.85, lat: 5.2, h: 4 },
  cali: { lon: -76.53, lat: 3.45, h: 28 },
};
export const SITES = Object.fromEntries(Object.entries(GEO_SITES).map(([id, s]) => { const [x, z] = W(s.lon, s.lat); return [id, { x, z, h: s.h }]; }));

// Camino sinuoso por una poligonal de waypoints [lat, lon]: muestrea cada ~step u y desplaza lateralmente amp * sin(2 pi waves t) * envolvente + bulge * sin(pi t)
// (nulo en los extremos, con tangente alineada para que las carreteras salgan limpias de cada zona). amp/bulge negativos = al otro lado.
// bulge = panza de la carretera (curva amplia que alarga el tramo sin curvas cerradas: radio minimo > ~25 u); amp = serpenteo fino.
function route(wps, amp = 0, waves = 0, bulge = 0, step = 38) {
  const P = wps.map(([la, lo]) => llx(lo, la)), cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.max(6, Math.round(L / step)), out = [];
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const t = k / n, s = t * L;
    while (j < P.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]), dx = P[j + 1][0] - P[j][0], dz = P[j + 1][1] - P[j][1], l = Math.hypot(dx, dz) || 1;
    const lat = amp * Math.sin(2 * Math.PI * waves * t) * Math.pow(Math.sin(Math.PI * t), 1.2) + bulge * Math.sin(Math.PI * t);
    out.push([Math.round(P[j][0] + dx * f - (dz / l) * lat), Math.round(P[j][1] + dz * f + (dx / l) * lat)]);
  }
  out[0] = [SITES_START.x, SITES_START.z]; return out;
}
let SITES_START = { x: 0, z: 0 };
const edge = (id, a, b, wps, amp, waves, bulge = 0) => {
  const full = [[GEO_SITES[a].lat, GEO_SITES[a].lon], ...wps, [GEO_SITES[b].lat, GEO_SITES[b].lon]];
  SITES_START = SITES[a];
  const ctrl = route(full, amp, waves, bulge);
  ctrl[ctrl.length - 1] = [SITES[b].x, SITES[b].z];
  return { id, a, b, ctrl };
};

// Grafo: anillo Medellin - Caribe - Santander - Medellin (con el atajo Medellin - Santander), cola a los Llanos, y el anillo
// Medellin - Pacifico - Cali. Objetivo: 30-55 s centro a centro a crucero (~24 u/s); Medellin <-> Caribe puede llegar a ~60 s.
export const EDGES = [
  edge('med-car', 'medellin', 'caribe', [[7.0, -75.5], [7.9, -75.4], [8.8, -75.3], [9.6, -75.1]], 22, 4),
  edge('car-san', 'caribe', 'santander', [[9.8, -74.6], [9.1, -74.2], [8.3, -73.75], [7.5, -73.4]], -20, 3),
  edge('med-san', 'medellin', 'santander', [], 20, 2, 150),
  edge('san-lla', 'santander', 'llanos', [[6.15, -72.75], [5.4, -72.3]], 20, 2, 100),
  edge('med-pac', 'medellin', 'pacifico', [], 25, 2, 265),
  edge('pac-cal', 'pacifico', 'cali', [], 185, 1, 0),
  edge('cal-med', 'cali', 'medellin', [[3.75, -76.0], [4.3, -75.75], [5.1, -75.62]], 25, 3),
];

// Cordilleras (SO -> NE): eje [x,z], ancho (sigma, u) y altura. Las dos ramas finales son la Oriental abriendose hacia Venezuela (Merida) y
// la serrania de Perija. Los ejes de las tres principales sirven tambien para repartir valles, Pacifico, Llanos y Amazonia (base.js).
const R = (pts) => pts.map(([la, lo]) => W(lo, la)); // listas escritas como [lat, lon]
export const RIDGES = [
  { name: 'occidental', w: 95, H: 92, pts: R([[1.4, -77.45], [2.4, -77.05], [3.4, -76.75], [4.3, -76.45], [5.3, -76.3], [6.3, -76.2], [7.2, -76.1], [8.2, -76.0]]) },
  { name: 'central', w: 105, H: 112, pts: R([[1.9, -76.45], [2.9, -76.0], [3.9, -75.55], [4.8, -75.4], [5.6, -75.2], [6.4, -75.0], [7.3, -74.9], [8.4, -74.8]]) },
  { name: 'oriental', w: 100, H: 122, pts: R([[1.9, -76.0], [2.6, -75.6], [3.5, -74.9], [4.5, -74.2], [5.5, -73.55], [6.4, -73.3], [7.3, -73.0], [8.2, -72.75], [9.2, -72.85]]) },
];
export const EXTRA_RIDGES = [
  { name: 'merida', w: 85, H: 110, pts: R([[7.4, -72.9], [8.0, -72.1], [8.6, -71.4], [9.1, -70.6]]) },
  { name: 'perija', w: 75, H: 100, pts: R([[9.2, -72.85], [10.1, -72.75], [11.0, -72.55]]) },
  { name: 'baudo', w: 60, H: 38, pts: R([[4.5, -77.3], [5.5, -77.3], [6.6, -77.5]]) },
];
// Sierra Nevada de Santa Marta (cerca del Caribe, al este) y nevados de la cordillera Central
export const PEAKS = [
  { name: 'sierra', ...(() => { const [x, z] = W(-73.65, 10.85); return { x, z }; })(), w: 62, H: 185 },
  { name: 'nevados', ...(() => { const [x, z] = W(-75.35, 4.9); return { x, z }; })(), w: 40, H: 50 },
  { name: 'cocuy', ...(() => { const [x, z] = W(-72.3, 6.4); return { x, z }; })(), w: 36, H: 60 },
];

// Rios: Magdalena (entre la Central y la Oriental, desemboca en el Caribe al este de la region) y Cauca (valle entre la Occidental y la Central).
// Se interrumpen cerca de carreteras y de las regiones (scene.js / base.js).
export const RIVERS = [
  { name: 'magdalena', w: 11, depth: 3.5, half: 8, pts: R([[1.95, -76.35], [2.8, -75.4], [3.9, -74.95], [4.8, -74.7], [5.7, -74.55], [6.6, -74.3], [7.4, -74.15], [8.2, -74.05], [9.0, -74.1], [9.7, -74.05], [10.4, -74.0], [11.0, -74.25]]) },
  { name: 'cauca', w: 9, depth: 3, half: 6.5, pts: R([[2.3, -76.65], [3.0, -76.35], [3.8, -76.15], [4.6, -75.95], [5.4, -75.85], [6.3, -75.85], [7.1, -75.75], [7.9, -75.45], [8.5, -75.1], [9.0, -74.5], [9.05, -74.15]]) },
];
// Rio del Pacifico (corre al norte de la region hacia el mar) y canon de Santander (al noreste): forma original relativa a su region
const OLD = { pacifico: [-950, -120], santander: [520, -380] };
const shift = (pts, from, to) => pts.map(([x, z]) => [x - from[0] + to.x, z - from[1] + to.z]);
export const RIVER = { w: 9, depth: 3, pts: shift([[-700, -420], [-800, -300], [-880, -215], [-960, -195], [-1040, -210], [-1160, -190]], OLD.pacifico, SITES.pacifico) };
export const CANYON = { w: 24, depth: 48, pts: shift([[590, -470], [680, -540], [760, -620], [840, -720]], OLD.santander, SITES.santander) };

export const dist2seg = (x, z, ax, az, bx, bz) => {
  const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1, f = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / l2));
  return Math.hypot(x - (ax + ex * f), z - (az + ez * f));
};
export function distPoly(x, z, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, dist2seg(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return d;
}
export { lonLatToWorld };
