// Geografia del mapa ilustrado (puro, testeado): mundo (x,z) <-> lon/lat de Colombia y vista del mapa grande.
// G4: el mundo 3D usa la proyeccion unica de world/geoproj.js (escala uniforme), asi que worldToGeo es su inversa EXACTA (ya no hay ajuste ni pesos).
import { SITES } from './world/layout.js';
import { RIDGES, EXTRA_RIDGES, RIVERS } from './world/layout.js';
import { LONLAT } from './world/colombia.js';
import { worldToLonLat, lonLatToWorld, SCALE } from './world/geoproj.js';

// lon/lat de los sitios de las 6 regiones (los del juego: inversa exacta de SITES)
export const GEO_CENTERS = Object.fromEntries(Object.entries(SITES).map(([id, s]) => { const g = worldToLonLat(s.x, s.z); return [id, [g.lon, g.lat]]; }));
// silueta de Colombia en [lon, lat] (la misma que usa el terreno: world/colombia.js)
export const COLOMBIA_LL = LONLAT.map(([lon, lat]) => [lon, lat]);
// cordilleras y rios del mundo 3D en [lon, lat] (para dibujarlos en el mapa grande)
const ll = (pts) => pts.map(([x, z]) => { const g = worldToLonLat(x, z); return [g.lon, g.lat]; });
export const RIDGES_LL = [...RIDGES, ...EXTRA_RIDGES].map((r) => ({ name: r.name, pts: ll(r.pts) }));
export const RIVERS_LL = RIVERS.map((r) => ({ name: r.name, pts: ll(r.pts) }));
export { SCALE };

export const worldToGeo = (x, z) => worldToLonLat(x, z);
export const geoToWorld = (lon, lat) => lonLatToWorld(lon, lat);

// Vista del mapa grande (cuadrada): lon/lat -> px. span = grados que caben en el lado.
export const VIEW = { lon0: -83.05, lat1: 13.85, span: 19.5 };
export const geoToPx = (lon, lat, S) => ({ x: (lon - VIEW.lon0) * S / VIEW.span, y: (VIEW.lat1 - lat) * S / VIEW.span });
export const worldToPx = (x, z, S) => { const g = worldToGeo(x, z); return geoToPx(g.lon, g.lat, S); };

export function pointInPoly(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
