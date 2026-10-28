// Pruebas de la geografia del mapa ilustrado (G4): worldToGeo es la inversa EXACTA de la proyeccion del mundo (geoproj.js), el contorno es el mismo
// del terreno y las regiones/carreteras/Willys caen donde el mapa dice.
import assert from 'node:assert/strict';
import { worldToGeo, geoToWorld, GEO_CENTERS, COLOMBIA_LL, RIDGES_LL, RIVERS_LL, pointInPoly, geoToPx, worldToPx, VIEW, SCALE } from './public/geomap.js';
import { SITES, WORLD, EDGES } from './public/world/layout.js';
import { lonLatToWorld, worldToLonLat, SCALE as S2 } from './public/world/geoproj.js';
import { POLY, countrySD } from './public/world/coast.js';
import { ROADS } from './public/world/road.js';
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };

ok('proyeccion unica: escala uniforme y worldToGeo es la inversa exacta (ida y vuelta < 1e-9 grados en todo el mundo)', () => {
  assert.equal(SCALE, S2);
  assert.ok(SCALE >= 180 && SCALE <= 300, 'u/grado: ' + SCALE);
  for (let x = WORLD.minX; x <= WORLD.maxX; x += 211) for (let z = WORLD.minZ; z <= WORLD.maxZ; z += 223) {
    const g = worldToGeo(x, z), w = geoToWorld(g.lon, g.lat);
    assert.ok(Math.abs(w.x - x) < 1e-6 && Math.abs(w.z - z) < 1e-6, `ida y vuelta en ${x},${z}`);
    const g2 = worldToLonLat(x, z); assert.deepEqual(g, g2);
  }
  // escala uniforme: 1 grado en lon = 1 grado en lat = SCALE u
  const a = lonLatToWorld(-75, 5), b = lonLatToWorld(-74, 5), c = lonLatToWorld(-75, 6);
  assert.ok(Math.abs(b.x - a.x - SCALE) < 1e-9 && Math.abs(a.z - c.z - SCALE) < 1e-9);
});
ok('worldToGeo: en el centro de cada region da exactamente su lon/lat; las 4 regiones no desplazadas estan en su coordenada real', () => {
  for (const id of Object.keys(GEO_CENTERS)) {
    const g = worldToGeo(SITES[id].x, SITES[id].z), [lon, lat] = GEO_CENTERS[id];
    assert.ok(Math.hypot(g.lon - lon, g.lat - lat) < 1e-9, id);
  }
  const REAL = { medellin: [-75.57, 6.25], santander: [-73.1, 6.7], llanos: [-71.5, 4.5], cali: [-76.53, 3.45] };
  for (const [id, [lo, la]] of Object.entries(REAL)) assert.ok(Math.hypot(GEO_CENTERS[id][0] - lo, GEO_CENTERS[id][1] - la) < 0.01, id + ' real');
});
ok('worldToGeo: orientacion (norte = -z, este = +x) y todos los centros dentro de la silueta', () => {
  const c = worldToGeo(SITES.caribe.x, SITES.caribe.z), k = worldToGeo(SITES.cali.x, SITES.cali.z);
  assert.ok(c.lat > k.lat + 5);
  assert.ok(worldToGeo(SITES.llanos.x, SITES.llanos.z).lon > worldToGeo(SITES.pacifico.x, SITES.pacifico.z).lon + 4);
  for (const [lon, lat] of Object.values(GEO_CENTERS)) assert.ok(pointInPoly(lon, lat, COLOMBIA_LL));
});
ok('la silueta del mapa es el mismo contorno del terreno: cada vertice proyectado cae donde el mundo 3D lo dibuja, y esta densificada', () => {
  assert.ok(COLOMBIA_LL.length > 150, 'vertices: ' + COLOMBIA_LL.length);
  assert.equal(POLY.length, COLOMBIA_LL.length);
  COLOMBIA_LL.forEach(([lon, lat], i) => { const w = lonLatToWorld(lon, lat); assert.ok(Math.hypot(w.x - POLY[i][0], w.z - POLY[i][1]) < 1e-6); });
  // Willys (carreteras incluidas) coincide con la silueta: todos los puntos de las carreteras estan dentro del contorno en el mapa y en el mundo
  for (const R of ROADS) for (let i = 0; i < R.N; i += 8) {
    const g = worldToGeo(R.px[i], R.pz[i]);
    assert.ok(pointInPoly(g.lon, g.lat, COLOMBIA_LL), `${R.id} dentro del mapa en ${i}`);
    assert.ok(countrySD(R.px[i], R.pz[i]) > 50, `${R.id} dentro del mundo en ${i}`);
  }
  // puntos de Colombia en el mapa == puntos de Colombia en el mundo (misma respuesta de pointInPoly y countrySD lejos del borde)
  let bad = 0, tot = 0;
  for (let x = WORLD.minX; x < WORLD.maxX; x += 97) for (let z = WORLD.minZ; z < WORLD.maxZ; z += 101) {
    const sd = countrySD(x, z); if (Math.abs(sd) < 40) continue;
    const g = worldToGeo(x, z); tot++; if (pointInPoly(g.lon, g.lat, COLOMBIA_LL) !== sd > 0) bad++;
  }
  assert.equal(bad, 0, `${bad}/${tot} puntos discrepan`);
});
ok('worldToPx: los centros de region caen en los mismos pixeles que geoToPx de su lon/lat; cordilleras y rios del mapa salen del mundo 3D', () => {
  for (const id of Object.keys(SITES)) {
    const p = worldToPx(SITES[id].x, SITES[id].z, 700), q = geoToPx(GEO_CENTERS[id][0], GEO_CENTERS[id][1], 700);
    assert.ok(Math.hypot(p.x - q.x, p.y - q.y) < 1e-6);
  }
  assert.deepEqual(RIDGES_LL.map((r) => r.name).slice(0, 3), ['occidental', 'central', 'oriental']);
  for (const r of RIDGES_LL.slice(0, 3)) assert.ok(r.pts[0][0] < r.pts[r.pts.length - 1][0] && r.pts[0][1] < r.pts[r.pts.length - 1][1], 'SO -> NE (lat sube, lon sube)');
  assert.equal(RIVERS_LL.length, 2);
  assert.equal(EDGES.length, 7);
});
ok('la silueta cabe en la vista del mapa', () => {
  for (const [lon, lat] of COLOMBIA_LL) { const p = geoToPx(lon, lat, 1000); assert.ok(p.x > 0 && p.x < 1000 && p.y > 0 && p.y < 1000); }
  assert.equal(VIEW.span, 19.5);
});
console.log(`${n} pruebas OK`);
