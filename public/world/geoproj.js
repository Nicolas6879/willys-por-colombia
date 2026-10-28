// Proyeccion unica y pura del mundo 3D (G4): lon/lat <-> mundo. Escala uniforme (mismas unidades por grado en x y z), origen en el centro
// de Colombia. Ejes: x = este, z = sur (norte = -z). worldToLonLat es la inversa EXACTA de lonLatToWorld (geomap.js la usa tal cual).
export const SCALE = 260; // unidades del mundo por grado (1 u ~ 0.43 km; Colombia ~ 3100 x 4300 u)
export const ORIGIN = { lon: -72.9, lat: 4.15 };

export const lonLatToWorld = (lon, lat) => ({ x: (lon - ORIGIN.lon) * SCALE, z: -(lat - ORIGIN.lat) * SCALE });
export const worldToLonLat = (x, z) => ({ lon: ORIGIN.lon + x / SCALE, lat: ORIGIN.lat - z / SCALE });
// atajos que devuelven [x, z]
export const llx = (lon, lat) => { const p = lonLatToWorld(lon, lat); return [p.x, p.z]; };
