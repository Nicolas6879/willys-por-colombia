// Pruebas del mundo (G2): heightAt determinista, red de carreteras aplanada, roadInfo sobre la red, 6 regiones/neblinas y minimapa.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heightAt, buildTerrainData, meshHeightAt, TERRAIN, WORLD } from './public/world/terrain.js';
import { worldToLonLat, llx as worldToXZ } from './public/world/geoproj.js';
import { countrySD, landSD } from './public/world/coast.js';
import { baseHeight, canyonCut, riverCut } from './public/world/base.js';
import { roadInfo, roadAt, onRoad, ROAD, ROADS, ROAD_LENGTH, ROAD_SEARCH, buildRoadData } from './public/world/road.js';
import { SITES, EDGES, ZONE_RADIUS, RIDGES, EXTRA_RIDGES, RIVERS, PEAKS, CANYON } from './public/world/layout.js';
import { ZONES, ZONE_BY_ID, fogBoost, zoneAt, memoryPlaces, cardText } from './public/world/regions.js';
import { worldToMap, miniScale, edgeArrow, mixColor, MINI } from './public/minimap.js';
import { approachInfo } from './public/approach.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };
const IDS = ['medellin', 'caribe', 'pacifico', 'santander', 'llanos', 'cali'];

ok('heightAt determinista y finito en todo el mundo', () => {
  const pts = [];
  for (let i = 0; i < 400; i++) pts.push([WORLD.minX + ((i * 7919) % WORLD.width), WORLD.minZ + ((i * 104729) % WORLD.height)]);
  const a = pts.map(([x, z]) => heightAt(x, z)), b = pts.map(([x, z]) => heightAt(x, z));
  assert.deepEqual(a, b);
  assert.ok(a.every(Number.isFinite));
  assert.ok(Math.max(...a) < 330 && Math.min(...a) > -20, `rango ${Math.min(...a)}..${Math.max(...a)}`);
  assert.ok(WORLD.width > 3000 && WORLD.height > 4000 && WORLD.size === Math.max(WORLD.width, WORLD.height), 'mundo rectangular a escala de Colombia');
});

ok('6 regiones en su lugar geografico (proyeccion real; Caribe y Pacifico corridos <= 0.8 grados por la costa)', () => {
  assert.deepEqual(ZONES.map((z) => z.id).sort(), [...IDS].sort());
  const REAL = { medellin: [-75.57, 6.25], santander: [-73.1, 6.7], llanos: [-71.5, 4.5], cali: [-76.53, 3.45], caribe: [-75.0, 10.6], pacifico: [-76.66, 5.69] };
  for (const id of IDS) {
    const g = worldToLonLat(SITES[id].x, SITES[id].z), d = Math.hypot(g.lon - REAL[id][0], g.lat - REAL[id][1]);
    assert.ok(d < (id === 'caribe' || id === 'pacifico' ? 0.8 : 0.05), `${id}: ${g.lon.toFixed(2)},${g.lat.toFixed(2)} a ${d.toFixed(2)} grados de lo real`);
    assert.ok(countrySD(SITES[id].x, SITES[id].z) > 150, id + ' dentro de Colombia');
  }
  const S = SITES, all = Object.values(S);
  assert.ok(S.caribe.z === Math.min(...all.map((s) => s.z)), 'Caribe al norte');
  assert.ok(S.pacifico.x === Math.min(...all.map((s) => s.x)), 'Pacifico al oeste');
  assert.ok(S.llanos.x === Math.max(...all.map((s) => s.x)), 'Llanos al este');
  assert.ok(S.cali.z === Math.max(...all.map((s) => s.z)) && S.cali.x > S.pacifico.x - 100, 'Cali al sur');
  assert.ok(S.medellin.x < S.santander.x && S.santander.z < S.medellin.z + 200 && S.santander.z > S.caribe.z, 'Medellin centro-oeste, Santander centro-norte');
});

ok('regiones sin solaparse entre si (zona + neblina) y dentro del mundo', () => {
  for (const a of ZONES) {
    assert.ok(a.cx - a.radius > WORLD.minX && a.cx + a.radius < WORLD.maxX && a.cz - a.radius > WORLD.minZ && a.cz + a.radius < WORLD.maxZ);
    for (const b of ZONES) if (a.id < b.id) assert.ok(Math.hypot(a.cx - b.cx, a.cz - b.cz) > 2 * (a.radius + 60) + 60, `${a.id} - ${b.id}: ${Math.hypot(a.cx - b.cx, a.cz - b.cz).toFixed(0)}`);
  }
});

ok('geografia: Caribe y Pacifico bajos con mar, Llanos plano, Santander/Medellin/Cali en montana, cordilleras y rios', () => {
  const H = (id) => heightAt(ZONE_BY_ID[id].cx, ZONE_BY_ID[id].cz);
  assert.ok(H('caribe') > 0.5 && H('caribe') < 8, 'Caribe ' + H('caribe'));
  assert.ok(H('pacifico') > 0.5 && H('pacifico') < 10, 'Pacifico ' + H('pacifico'));
  assert.ok(H('llanos') > 5 && H('llanos') < 25, 'Llanos ' + H('llanos'));
  assert.ok(H('cali') > 20 && H('cali') < 45 && H('medellin') > 25 && H('medellin') < 60, 'valles');
  assert.ok(H('santander') > 60, 'Santander en montana ' + H('santander'));
  const C = ZONE_BY_ID.caribe, P = ZONE_BY_ID.pacifico;
  assert.ok(heightAt(C.cx, C.cz - 260) < 0 && heightAt(C.cx + 120, C.cz - 280) < 0, 'mar al norte del Caribe');
  assert.ok(heightAt(P.cx - 260, P.cz) < 0 && heightAt(P.cx - 280, P.cz + 120) < 0, 'mar al oeste del Pacifico');
  assert.ok(landSD(C.cx, C.cz) > 140 && landSD(P.cx, P.cz) > 170, 'playa a ~150-195 u de cada region de costa');
  const L = ZONE_BY_ID.llanos;
  let maxD = 0;
  for (let i = 0; i < 60; i++) { const x = L.cx + (i % 8) * 20 - 70, z = L.cz + Math.floor(i / 8) * 20 - 70; maxD = Math.max(maxD, Math.abs(heightAt(x, z) - heightAt(x + 20, z))); }
  assert.ok(maxD < 3, 'sabana plana: ' + maxD);
  // tres cordilleras SO -> NE y las ramas de la Oriental hacia Venezuela
  assert.equal(RIDGES.length, 3);
  assert.deepEqual(RIDGES.map((r) => r.name), ['occidental', 'central', 'oriental']);
  for (const r of RIDGES) {
    const top = Math.max(...r.pts.map(([x, z]) => baseHeight(x, z)));
    assert.ok(top > 100, `cordillera ${r.name}: ${top}`);
    assert.ok(r.pts[0][0] < r.pts[r.pts.length - 1][0] && r.pts[0][1] > r.pts[r.pts.length - 1][1], 'SO -> NE');
  }
  assert.ok(EXTRA_RIDGES.some((r) => r.name === 'merida') && EXTRA_RIDGES.some((r) => r.name === 'perija'), 'la Oriental se abre hacia Venezuela');
  // valles entre las cordilleras mas bajos que ellas
  const xAtLat = (r, lat) => { const z = worldToXZ(0, lat)[1]; for (let i = 0; i < r.pts.length - 1; i++) { const [x0, z0] = r.pts[i], [x1, z1] = r.pts[i + 1]; if (z <= z0 && z >= z1) return [x0 + (x1 - x0) * (z0 - z) / (z0 - z1), z]; } return null; };
  const [oc, ce, or] = RIDGES.map((r) => xAtLat(r, 8.0)); // a 8 N: lejos de las mesetas
  assert.ok(oc && ce && or);
  const mid = (a, b) => [(a[0] + b[0]) / 2, a[1]];
  assert.ok(baseHeight(...mid(oc, ce)) < baseHeight(...ce) - 40 && baseHeight(...mid(ce, or)) < baseHeight(...ce) - 40 && baseHeight(...mid(ce, or)) < baseHeight(...or) - 40, 'valles del Cauca y del Magdalena entre las cordilleras');
  // Sierra Nevada de Santa Marta cerca del Caribe (al este) con nieve
  const sierra = PEAKS.find((p) => p.name === 'sierra');
  assert.ok(baseHeight(sierra.x, sierra.z) > 190 && sierra.x > C.cx + 150 && Math.abs(sierra.z - C.cz) < 500, 'Sierra Nevada ' + baseHeight(sierra.x, sierra.z));
  const maxH = Math.max(...ROADS.map((r) => Math.max(...r.h)));
  assert.ok(maxH > 90 && maxH < 220, 'las carreteras suben a la cordillera: ' + maxH);
  // rios (Magdalena y Cauca) y canon de Santander existen y las carreteras no corren por encima del cauce
  assert.equal(RIVERS.length, 2);
  for (const rv of RIVERS) assert.ok(Math.max(...rv.pts.map(([x, z]) => riverCut(x, z))) > 2, 'rio ' + rv.name);
  assert.ok(canyonCut(CANYON.pts[1][0], CANYON.pts[1][1]) > 40, 'canon');
  for (const r of ROADS) for (let i = 0; i < r.N; i += 3) assert.ok(canyonCut(r.px[i], r.pz[i]) < 1, 'canon lejos de ' + r.id);
  // Amazonia: selva baja y llana al sur; Pacifico bajo; Colombia dentro de su contorno y el mar fuera
  const am = worldToXZ(-70.5, -1.5), amH = heightAt(...am);
  assert.ok(countrySD(...am) > 100 && amH > 5 && amH < 45, 'Amazonia baja ' + amH);
});

ok('red de carreteras: grafo conexo, anillo + atajos, extremos en el centro de las regiones', () => {
  assert.equal(ROADS.length, EDGES.length);
  assert.ok(EDGES.length >= 7);
  const adj = Object.fromEntries(IDS.map((i) => [i, new Set()]));
  for (const e of EDGES) { adj[e.a].add(e.b); adj[e.b].add(e.a); }
  const seen = new Set(['medellin']), q = ['medellin'];
  while (q.length) for (const nx of adj[q.pop()]) if (!seen.has(nx)) { seen.add(nx); q.push(nx); }
  assert.equal(seen.size, 6, 'conexo');
  assert.ok(IDS.every((i) => adj[i].size >= 2 || i === 'llanos' || i === 'caribe'), 'casi todas con 2+ salidas');
  ROADS.forEach((r, i) => {
    assert.equal(r.id, EDGES[i].id);
    assert.ok(Math.hypot(r.px[0] - SITES[r.a].x, r.pz[0] - SITES[r.a].z) < 0.5 && Math.hypot(r.px[r.N - 1] - SITES[r.b].x, r.pz[r.N - 1] - SITES[r.b].z) < 0.5);
  });
  assert.equal(ROAD_LENGTH, ROADS[0].L);
});

ok('longitud de cada tramo: 30-55 s a crucero (~24 u/s) entre centros (hasta 60 s Medellin-Caribe); no cruza otras regiones', () => {
  for (const r of ROADS) {
    const sec = r.L / 24;
    console.log(`   ${r.id.padEnd(8)} ${r.L.toFixed(0)} u  ${sec.toFixed(1)} s a 24 u/s`);
    assert.ok(sec >= 30 && sec <= (r.id === 'med-car' ? 60 : 55), `${r.id}: ${sec.toFixed(1)} s`);
    for (const z of ZONES) if (z.id !== r.a && z.id !== r.b) {
      let m = Infinity; for (let i = 0; i < r.N; i += 3) m = Math.min(m, Math.hypot(r.px[i] - z.cx, r.pz[i] - z.cz));
      assert.ok(m > z.radius + 110, `${r.id} pasa a ${m.toFixed(0)} de ${z.id}`);
    }
  }
});

ok('tramos distintos no se cruzan ni se pegan fuera de las regiones que comparten (>= 60 u)', () => {
  for (let a = 0; a < ROADS.length; a++) for (let b = a + 1; b < ROADS.length; b++) {
    const A = ROADS[a], B = ROADS[b], shared = [A.a, A.b].filter((id) => id === B.a || id === B.b);
    let m = Infinity;
    for (let i = 0; i < A.N; i += 2) {
      if (shared.some((id) => Math.hypot(A.px[i] - SITES[id].x, A.pz[i] - SITES[id].z) < ZONE_RADIUS + 90)) continue; // cerca de la region compartida se juntan
      for (let j = 0; j < B.N; j += 2) m = Math.min(m, Math.hypot(A.px[i] - B.px[j], A.pz[i] - B.pz[j]));
    }
    assert.ok(m > 60, `${A.id} y ${B.id}: ${m.toFixed(0)}`);
  }
});

ok('en cada region las carreteras entran separadas (>= 40 u) y a la misma altura que el centro', () => {
  for (const z of ZONES) {
    for (let i = 0; i < z.entries.length; i++) for (let j = i + 1; j < z.entries.length; j++) {
      const a = z.entries[i], b = z.entries[j];
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 40, `${z.id} entradas ${i}/${j}: ${Math.hypot(a.x - b.x, a.z - b.z)}`);
    }
    for (const e of z.entries) assert.ok(Math.abs(z.h - ROADS[e.edge].h[e.centerS === 0 ? 0 : ROADS[e.edge].N - 1]) < 0.4, z.id + ' altura');
  }
});

ok('las carreteras suben y bajan con curvas y respetan la pendiente maxima', () => {
  let total = 0;
  for (const { h, N, step, tx, tz, id } of ROADS) {
    let maxG = 0, turn = 0;
    for (let i = 1; i < N; i++) maxG = Math.max(maxG, Math.abs(h[i] - h[i - 1]) / step);
    for (let i = 1; i < N; i++) turn += Math.abs(Math.atan2(tx[i] * tz[i - 1] - tz[i] * tx[i - 1], tx[i] * tx[i - 1] + tz[i] * tz[i - 1]));
    assert.ok(maxG <= ROAD.maxGrade + 0.01, `${id} pendiente ${maxG}`);
    assert.ok(turn > 1.2, `${id} curvas (rad): ${turn}`);
    total += turn;
  }
  assert.ok(total > 15);
  const { h, N } = ROADS[0];
  assert.ok(h[Math.floor(N / 2)] > h[0] + 20 || h[Math.floor(N / 2)] > h[N - 1] + 20, 'sube y baja');
});

ok('terreno aplanado en TODAS las carreteras: sin pendiente transversal en la cinta y heightAt = perfil', () => {
  ROADS.forEach((r, e) => {
    for (let s = 20; s < r.L - 20; s += 23) {
      const p = roadAt(s, e), nx = -p.tz, nz = p.tx, h0 = heightAt(p.x, p.z);
      if (roadInfo(p.x, p.z).edge !== e) continue; // junto a una region otra carretera puede ser la mas cercana
      assert.ok(Math.abs(h0 - p.h) < 0.5, `${r.id} altura en el eje s=${s}: ${h0} vs ${p.h}`);
      for (const o of [-5, -3, 3, 5]) assert.ok(Math.abs(heightAt(p.x + nx * o, p.z + nz * o) - h0) < 0.8, `${r.id} pendiente transversal s=${s} o=${o}`);
    }
  });
  const far = { x: 1100, z: 700 };
  assert.ok(roadInfo(far.x, far.z).dist > ROAD.blendEnd);
  assert.equal(heightAt(far.x, far.z), baseHeight(far.x, far.z));
});

ok('roadInfo sobre la red: la carretera mas cercana, con su tramo, s y tangente', () => {
  ROADS.forEach((R, e) => {
    for (const s of [150, R.L * 0.5, R.L - 150]) {
      const r = roadAt(s, e), q = roadInfo(r.x, r.z);
      assert.equal(q.edge, e, `${R.id} s=${s}`);
      assert.ok(q.dist < 0.05 && Math.abs(q.s - s) < 0.5, `s=${s}: ${q.s}`);
      assert.ok(Math.abs(Math.hypot(q.tx, q.tz) - 1) < 1e-6 && q.tx * r.tx + q.tz * r.tz > 0.999);
      const o = roadInfo(r.x - r.tz * 4, r.z + r.tx * 4);
      assert.ok(Math.abs(o.dist - 4) < 0.1 && Math.abs(o.s - s) < 1.5 && o.edge === e);
      assert.ok(onRoad(o) && !onRoad(roadInfo(r.x - r.tz * 12, r.z + r.tx * 12)));
    }
  });
  // coincide con la fuerza bruta en puntos pseudoaleatorios (mas alla de ROAD_SEARCH devuelve dist = Infinity y edge = -1)
  for (let i = 0; i < 120; i++) {
    const x = WORLD.minX + ((i * 7919) % WORLD.width), z = WORLD.minZ + ((i * 104729) % WORLD.height), q = roadInfo(x, z);
    let best = Infinity;
    for (const R of ROADS) for (let k = 0; k < R.N; k++) best = Math.min(best, Math.hypot(x - R.px[k], z - R.pz[k]));
    if (best > ROAD_SEARCH + 2) { assert.equal(q.dist, Infinity); assert.equal(q.edge, -1); continue; }
    assert.ok(q.dist <= best + 1e-6 && q.dist > best - 2.1, `roadInfo ${x},${z}: ${q.dist} vs ${best}`);
  }
});

ok('regiones: 6 zonas con entradas sobre el borde (una por tramo), neblina y tarjetas didacticas', () => {
  assert.equal(ZONES.length, 6);
  let entries = 0;
  for (const z of ZONES) {
    assert.ok(z.entries.length >= 1);
    for (const e of z.entries) {
      entries++;
      assert.ok(Math.abs(Math.hypot(e.x - z.cx, e.z - z.cz) - z.radius) < 3, z.id + ' entrada en el borde');
      assert.ok(roadInfo(e.x, e.z).dist < 0.5);
      assert.ok(fogBoost(e.x, e.z) > 0.99);
    }
    assert.ok(zoneAt(z.cx, z.cz)?.id === z.id && fogBoost(z.cx, z.cz) < 0.01);
  }
  assert.equal(entries, EDGES.length * 2);
  const T = (id) => cardText(ZONE_BY_ID[id]);
  assert.ok(/afro house/.test(T('medellin')) && /UNESCO, 2015/.test(T('caribe')));
  assert.ok(/Currulao/.test(T('pacifico')) && /marimba, cununos, bombo y guasá/.test(T('pacifico')) && /UNESCO, 2010/.test(T('pacifico')));
  assert.ok(/Guabina andina/.test(T('santander')) && /tiple, requinto y bandola/.test(T('santander')) && /instrumento nacional/.test(T('santander')));
  assert.ok(/Joropo/.test(T('llanos')) && /arpa llanera, cuatro y maracas/.test(T('llanos')) && !/2024/.test(T('llanos')));
  assert.ok(/Salsa caleña/.test(T('cali')) && /metales, piano montuno, congas y timbales/.test(T('cali')) && /capital mundial de la salsa/.test(T('cali')));
  assert.deepEqual(memoryPlaces().map((p) => p.id), ZONES.map((z) => z.id));
  assert.equal(new Set(ZONES.map((z) => z.color)).size, 6, 'colores distintos');
});

ok('places.json tiene las 6 regiones con secciones y memoryPlaces las pasa', () => {
  const raw = JSON.parse(readFileSync(new URL('./public/places.json', import.meta.url))).places;
  assert.deepEqual(raw.map((p) => p.id).sort(), [...IDS].sort());
  const mp = memoryPlaces(Object.fromEntries(raw.map((p) => [p.id, p.prompt])), Object.fromEntries(raw.map((p) => [p.id, p.sections])));
  for (const p of mp) assert.ok(p.prompt && p.sections?.length === 2, p.id);
});

ok('malla del terreno (bloques de 20x20 celdas solo donde hay tierra) y de la red de carreteras: tamano razonable para Intel UHD 620', () => {
  const t = buildTerrainData();
  assert.ok(t.chunks.length > 100 && t.chunks.length < 400, 'bloques: ' + t.chunks.length);
  let tris = 0;
  for (const c of t.chunks) {
    assert.equal(c.positions.length, c.colors.length);
    assert.equal(c.positions.length, c.tris * 9);
    assert.ok(c.tris <= TERRAIN.chunkCells * TERRAIN.chunkCells * 2);
    tris += c.tris;
    for (let k = 0; k < c.positions.length; k += 27) { // los triangulos de cada bloque caen en su celda del mundo
      const x = c.positions[k], z = c.positions[k + 2], half = TERRAIN.chunkCells * TERRAIN.cell / 2 + 1e-3;
      assert.ok(Math.abs(x - c.cx) <= half && Math.abs(z - c.cz) <= half, 'triangulo fuera de su bloque');
    }
  }
  assert.equal(tris, t.tris);
  assert.ok(t.chunks.every((c) => c.colors.every((v) => v >= 0 && v <= 1.5)));
  const r = buildRoadData();
  assert.equal(r.positions.length, r.colors.length);
  const roadTris = r.positions.length / 9;
  assert.ok(roadTris < 40000, 'carreteras: ' + roadTris);
  assert.ok(tris + roadTris < 400000, 'mundo entero (se dibuja solo lo cercano: culling por distancia + niebla)');
  // visible a la vez con fog far 420 (+30 de margen y radio de bloque): suma de los bloques que caen en ese circulo, desde 4 puntos del mapa
  for (const id of ['medellin', 'caribe', 'llanos', 'cali']) {
    const z = ZONE_BY_ID[id]; let vis = 0;
    for (const c of t.chunks) if (Math.hypot(c.cx - z.cx, c.cz - z.cz) - 150 < 450) vis += c.tris;
    assert.ok(vis < 60000, `terreno visible en ${id}: ${vis}`);
  }
  console.log(`   terreno ${tris} tris en ${t.chunks.length} bloques, carreteras ${roadTris} tris`);
});

ok('carretera siempre por encima del terreno (G4 #3): la malla visual queda bajo la cinta en toda la red y no se mueve la altura fisica', () => {
  const offs = [-6.4, -5, -3.2, -1.6, 0, 1.6, 3.2, 5, 6.4];
  let n = 0, poke = 0, before = 0;
  for (const R of ROADS) for (let i = 20; i < R.N - 20; i += 4) for (const o of offs) {
    const x = R.px[i] - R.tz[i] * o, z = R.pz[i] + R.tx[i] * o, rib = R.h[i] + (Math.abs(o) > 5.01 ? -0.04 : 0);
    n++;
    if (meshHeightAt(x, z) >= rib - 0.01) poke++;
    if (meshHeightAt(x, z, { sink: 0 }) >= rib - 0.01) before++;
  }
  assert.ok(before / n > 0.3, 'sin el hundimiento la malla toca la cinta en muchisimos puntos (la causa: ' + (100 * before / n).toFixed(0) + '%)');
  assert.ok(poke / n < 0.002, 'con el hundimiento la malla nunca atraviesa la cinta: ' + (100 * poke / n).toFixed(2) + '%');
  console.log(`   malla >= cinta: ${(100 * before / n).toFixed(1)}% antes -> ${(100 * poke / n).toFixed(2)}% despues`);
  // la altura FISICA (heightAt) sigue igual que el perfil en el eje
  for (const R of ROADS) { const p = roadAt(R.L * 0.4, ROADS.indexOf(R)); if (roadInfo(p.x, p.z).edge === ROADS.indexOf(R)) assert.ok(Math.abs(heightAt(p.x, p.z) - p.h) < 0.5); }
});

ok('contorno: proyeccion unica geoproj (inversa exacta), costa con mar alrededor y fronteras con tierra mas alla', () => {
  for (const [lo, la] of [[-75.57, 6.25], [-67.0, 1.2], [-79.0, 8.0], [-71.3, 12.4]]) { const [x, z] = worldToXZ(lo, la), g = worldToLonLat(x, z); assert.ok(Math.abs(g.lon - lo) < 1e-9 && Math.abs(g.lat - la) < 1e-9); }
  const mid = ZONE_BY_ID.medellin;
  assert.ok(countrySD(mid.cx, mid.cz) > 400 && landSD(mid.cx, mid.cz) > 400);
  const [bx, bz] = worldToXZ(-66.9, 4.0), [px, pz] = worldToXZ(-71.0, 4.0), [sx, sz] = worldToXZ(-79.5, 6.0), [gx, gz] = worldToXZ(-77.9, 5.0);
  assert.ok(countrySD(bx, bz) < 0 && landSD(bx, bz) > 0, 'tras la frontera con Venezuela sigue la tierra');
  assert.ok(countrySD(px, pz) > 0);
  assert.ok(countrySD(sx, sz) < 0 && landSD(sx, sz) < 0, 'mar al oeste de la costa Pacifica');
  assert.ok(countrySD(gx, gz) < 0 && landSD(gx, gz) < 0 && heightAt(gx, gz) < -3, 'mar hondo cerca de la costa');
  // la tierra extranjera se ve (colinas bajas y gris) pero el mapa no es una isla: altura > 0 hasta 400 u mas alla de la frontera
  let c = 0; for (let d = 20; d <= 400; d += 20) { if (heightAt(bx + 100 + d, bz) > 0.5) c++; }
  assert.ok(c >= 15, 'tierra continua tras la frontera');
});

ok('minimapa: proyeccion norte arriba, escala y flechas de borde', () => {
  const S = MINI.size, k = miniScale();
  const c = worldToMap(100, 200, 100, 200, k);
  assert.deepEqual(c, { x: S / 2, y: S / 2 });
  const north = worldToMap(100, 100, 100, 200, k), east = worldToMap(200, 200, 100, 200, k);
  assert.ok(north.y < c.y && Math.abs(north.x - c.x) < 1e-9, 'norte (-z) arriba');
  assert.ok(east.x > c.x && Math.abs(east.y - c.y) < 1e-9, 'este a la derecha');
  assert.ok(Math.abs(worldToMap(100 + MINI.viewRadius, 200, 100, 200, k).x - S) < 1e-9, 'viewRadius llega al borde');
  assert.equal(edgeArrow(100, 100, 100, 200, 120), null, 'zona cercana: sin flecha');
  const a = edgeArrow(100, -800, 100, 200, 120);
  assert.ok(a && Math.abs(a.x - S / 2) < 1e-6 && a.y < S / 2 - 60 && Math.abs(a.angle + Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(Math.hypot(a.x - S / 2, a.y - S / 2) - (S / 2 - 9)) < 1e-6);
  const b = edgeArrow(1000, 200, 100, 200, 120);
  assert.ok(b.x > S / 2 && Math.abs(b.y - S / 2) < 1e-6);
  assert.equal(mixColor([{ color: 0xff0000, w: 1 }, { color: 0x0000ff, w: 1 }]), 0x800080);
});

ok('minimapa: desde Medellin se ven flechas de borde hacia las regiones fuera de vista y ninguna hacia la propia', () => {
  const med = ZONE_BY_ID.medellin;
  const arrows = ZONES.filter((z) => z.id !== 'medellin').map((z) => ({ id: z.id, a: edgeArrow(z.cx, z.cz, med.cx, med.cz, z.radius) }));
  assert.equal(edgeArrow(med.cx, med.cz, med.cx, med.cz, med.radius), null);
  assert.ok(arrows.filter((q) => q.a).length >= 4, 'la mayoria fuera de vista tiene flecha');
  const cari = arrows.find((q) => q.id === 'caribe').a, pac = arrows.find((q) => q.id === 'pacifico').a;
  assert.ok(cari.y < MINI.size / 2 && (pac === null || pac.x < MINI.size / 2), 'Caribe arriba; el Pacifico (a ~430 u) ya se ve en el minimapa o su flecha va a la izquierda');
});

ok('approach: ETA por la carretera correcta de la red, sin "hacia" la region que dejas atras', () => {
  const car = ZONE_BY_ID.caribe, med = ZONE_BY_ID.medellin, e0 = med.entries.find((e) => e.edge === 0), c0 = car.entries.find((e) => e.edge === 0);
  const at = (s, back = false, v = 20, edge = 0) => {
    const r = roadAt(s, edge), sgn = back ? -1 : 1;
    return approachInfo({ x: r.x, z: r.z, heading: Math.atan2(sgn * r.tx, sgn * r.tz), vf: v, vl: 0 }, ZONES, roadInfo);
  };
  const a = at(c0.edgeS - 100);
  assert.ok(a.caribe.toward && Math.abs(a.caribe.eta - 5) < 0.4, 'eta ' + a.caribe.eta);
  for (const id of IDS) if (id !== 'caribe') assert.ok(!a[id].toward, 'solo el Caribe: ' + id);
  assert.ok(!at(c0.edgeS - 100, false, 0).caribe.toward, 'parado no va hacia nada');
  const b = at(e0.edgeS + 100, true);
  assert.ok(b.medellin.toward && Math.abs(b.medellin.eta - 5) < 0.4 && !b.caribe.toward);
  for (let s = e0.edgeS + 1; s < c0.edgeS; s += 4) assert.ok(!at(s).medellin.toward, 'espurio en s=' + s);
  ROADS.forEach((R, e) => { // en cada tramo y sentido solo "va hacia" la region de destino
    const ea = ZONE_BY_ID[R.a].entries.find((q) => q.edge === e), eb = ZONE_BY_ID[R.b].entries.find((q) => q.edge === e);
    for (let s = ea.edgeS + 2; s < eb.edgeS; s += 6) {
      const f = at(s, false, 20, e), g = at(s, true, 20, e);
      assert.ok(!f[R.a].toward && !g[R.b].toward, `${R.id} espurio s=${s}`);
      assert.ok(f[R.b].toward && g[R.a].toward, `${R.id} falta s=${s}`);
      for (const id of IDS) if (id !== R.a && id !== R.b) assert.ok(!f[id].toward && !g[id].toward);
    }
  });
  const r = roadAt(c0.edgeS + 30); // dentro de la zona no hay aproximacion
  assert.ok(!approachInfo({ x: r.x, z: r.z, heading: 0, vf: 20, vl: 0 }, ZONES, roadInfo).caribe.toward);
  const L = ZONE_BY_ID.llanos, off = { x: 1100, z: 450 }; // fuera de carretera: rumbo directo cos >= 0.9
  const fo = approachInfo({ ...off, heading: Math.atan2(L.cx - off.x, L.cz - off.z), vf: 15, vl: 0 }, ZONES, roadInfo);
  const dd = Math.hypot(L.cx - off.x, L.cz - off.z);
  assert.ok(roadInfo(off.x, off.z).dist > 20 && fo.llanos.toward && Math.abs(fo.llanos.eta - (dd - ZONE_RADIUS) / 15) < 0.1);
});

console.log(`\n${n} pruebas de world OK`);
