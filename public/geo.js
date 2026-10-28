// Geografia del mapa (pura): proyeccion equirectangular simple, poligono aproximado de Colombia y lugares con radios.
// Unidades del mundo: 1 unidad = 1 grado. x = lon + 73 (este), y = lat - 4 (norte).
export const ORB_SPEED = 0.7;       // unidades/s a velocidad normal
export const PREWARM_SEC = 4;       // el radio exterior = interior + lo que el orbe recorre en ~4 s
export const project = (lon, lat) => ({ x: lon + 73, y: lat - 4 });
export const BOUNDS = { minX: -7, maxX: 7, minY: -9, maxY: 9 };

// contorno detallado de Colombia (G4): world/colombia.js es la fuente unica (costas + fronteras, [lon, lat])
import { LONLAT } from './world/colombia.js';
export const COLOMBIA = LONLAT.map(([lon, lat]) => project(lon, lat));

const P = (id, lon, lat, inner, color) => ({ id, ...project(lon, lat), inner, outer: +(inner + ORB_SPEED * PREWARM_SEC).toFixed(3), color });
export const PLACE_GEO = [
  P('caribe', -75.0, 10.6, 0.5, 0xffc233),
  P('pacifico', -76.66, 5.69, 0.3, 0x2ec4b6),
  P('santander', -73.1, 6.7, 0.5, 0xc77dff),
  P('llanos', -71.5, 4.5, 0.6, 0x7bd957),
  P('cali', -76.53, 3.45, 0.35, 0xff5d5d),
  P('medellin', -75.57, 6.25, 0.32, 0x4da3ff),
];

// Iman del clic-para-ir: si el punto esta a menos de max(inner*2.5, 0.9) del centro de un lugar (el mas cercano), el destino es ese centro.
export const MAGNET_MIN = 0.9, MAGNET_K = 2.5;
export function snapTarget(pt, places = PLACE_GEO) {
  let best = null, bd = Infinity;
  for (const pl of places) {
    const d = Math.hypot(pt.x - pl.x, pt.y - pl.y);
    if (d < Math.max(pl.inner * MAGNET_K, MAGNET_MIN) && d < bd) { best = pl; bd = d; }
  }
  return best ? { x: best.x, y: best.y } : { x: pt.x, y: pt.y };
}
