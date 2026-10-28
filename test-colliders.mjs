// Pruebas de colisionadores (G4): rejilla de colisionadores (puro), colisionadores automaticos de mallas fusionadas (solidify) y su efecto en el carro.
import assert from 'node:assert/strict';
import { ColliderGrid } from './public/world/colliders.js';
import { solidify } from './public/world/solidify.js';
import { step, createState, FIXED_DT, CAR } from './public/vehicle.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };

// caja (w x h x d) centrada en (cx, cz), apoyada en y0, como triangulos sueltos (12 triangulos)
function boxTris(cx, cz, w, h, d, y0 = 0) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h, P = [];
  const quad = (a, b, c, e) => P.push(...a, ...b, ...c, ...a, ...c, ...e);
  quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]); quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]);
  quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]); quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]);
  quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]); // techo plano
  return P;
}
const flat0 = () => 0;
const run = (positions, extra = {}) => { const grid = new ColliderGrid(), added = solidify({ positions: Float32Array.from(positions) }, { heightAt: flat0, grid, ...extra }); return { grid, added }; };

ok('solidify: una casa (caja) se vuelve UNA caja de colision del tamano de su huella; el carro choca contra ella', () => {
  const { grid, added } = run(boxTris(100, 50, 12, 6, 8));
  assert.equal(added, 1, 'una sola caja');
  assert.ok(grid.push(100, 50, 1.15), 'dentro de la casa empuja');
  assert.ok(grid.push(100 + 6 + 0.5, 50, 1.15), 'junto a la pared empuja (radio del carro)');
  assert.equal(grid.push(100 + 6 + 3, 50, 1.15), null, 'a 3 u de la pared ya esta libre');
  assert.equal(grid.push(100, 50 + 4 + 3, 1.15), null);
  // el carro avanza contra la pared y no la atraviesa
  let s = { ...createState(80, 50, Math.PI / 2, 0), vf: 15, speed: 15, vmaxEff: CAR.vmaxOff };
  const env = { colliders: grid }; let maxX = -Infinity;
  for (let i = 0; i < 240; i++) { s = step(s, { throttle: 1 }, FIXED_DT, () => 0, () => ({ dist: 100 }), env); maxX = Math.max(maxX, s.x); }
  assert.ok(maxX < 94 - 0.2 && s.x < 94, 'se queda fuera de la pared: x max ' + maxX.toFixed(2));
});

ok('solidify: lomas (caras inclinadas), techos, objetos bajos o altos sobre el carro y celdas sobre la carretera NO bloquean', () => {
  // cono de loma (pendiente suave): caras con |ny| alto
  const cone = []; const R = 40, H = 12, N = 24;
  for (let i = 0; i < N; i++) { const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2; cone.push(0, H, 0, Math.cos(a0) * R, 0, Math.sin(a0) * R, Math.cos(a1) * R, 0, Math.sin(a1) * R); }
  assert.equal(run(cone).added, 0, 'una loma no es obstaculo');
  assert.equal(run(boxTris(0, 0, 10, 0.3, 10)).added, 0, 'un banco/piso a 0.3 u de alto se atraviesa');
  assert.equal(run(boxTris(0, 0, 10, 2, 10, 6)).added, 0, 'un puente/techo a 6 u por encima pasa por debajo');
  const road = (x) => Math.abs(x) < 8; // franja de carretera en x = 0
  assert.equal(run(boxTris(0, 0, 6, 5, 6), { roadClear: (x) => road(x) }).added, 0, 'sobre la carretera no hay colision');
  // pared larga: una sola caja fina, no cientos de celdas
  const wall = run(boxTris(0, 0, 40, 5, 1));
  assert.equal(wall.added, 1);
  assert.equal(wall.grid.push(0, 4, 1.15), null, 'a 3.5 u de la pared de 1 u de grosor ya se pasa');
  assert.ok(wall.grid.push(10, 1.2, 1.15));
});

ok('solidify con matriz de mundo: la malla local rota y movida (yaw 90, en 200,-30) colisiona donde se dibuja', () => {
  const pos = boxTris(0, 0, 16, 5, 4); // largo en x local
  const c = Math.cos(Math.PI / 2), s = Math.sin(Math.PI / 2), m = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 200, 0, -30, 1]; // rotY(90) + traslacion (column-major)
  const grid = new ColliderGrid(); solidify({ positions: Float32Array.from(pos), m }, { heightAt: flat0, grid });
  assert.ok(grid.push(200, -30 + 7, 1.15), 'el largo ahora va en z mundo');
  assert.equal(grid.push(200 + 7, -30, 1.15), null, 'y en x ya no');
});

ok('ColliderGrid: muchos colisionadores en la misma celda no se cuentan dos veces ni degradan el empuje', () => {
  const g = new ColliderGrid(40);
  for (let i = 0; i < 400; i++) g.addCircle((i % 20) * 6, Math.floor(i / 20) * 6, 1.5);
  const t0 = performance.now(); let hits = 0;
  for (let i = 0; i < 20000; i++) if (g.push((i * 7) % 120, ((i * 13) % 120), 1.15)) hits++;
  assert.ok(performance.now() - t0 < 400, 'empuje rapido: ' + (performance.now() - t0).toFixed(0) + ' ms / 20k');
  assert.ok(hits > 100);
  const r = g.push(0.3, 0.2, 1.15);
  assert.ok(r && Number.isFinite(r.x) && Math.abs(r.nx * r.nx + r.nz * r.nz - 1) < 1e-9);
});

ok('ColliderGrid: addCircle devuelve el objeto; remove() lo retira de la rejilla (push ya no bloquea) y add() lo repone igual', () => {
  const g = new ColliderGrid();
  const o = g.addCircle(10, 20, 3); // rejilla propia: no ensucia el singleton
  assert.ok(o && o.t === 0 && o.x === 10 && o.z === 20 && o.r === 3, 'addCircle devuelve el circulo');
  assert.equal(g.count, 1);
  const before = g.push(10, 20, 1.15);
  assert.ok(before, 'bloquea dentro del circulo');
  g.remove(o);
  assert.equal(g.count, 0, 'count baja al retirar');
  assert.equal(g.push(10, 20, 1.15), null, 'tras remove ya no bloquea');
  g.add(o);
  assert.equal(g.count, 1, 'count sube al reponer');
  assert.deepEqual(g.push(10, 20, 1.15), before, 'tras add vuelve a bloquear igual que antes');
});

ok('ColliderGrid: addBox devuelve el objeto; remove() deja de bloquear y add() vuelve a bloquear (caja grande, varias celdas)', () => {
  const g = new ColliderGrid();
  const o = g.addBox(100, 100, 30, 30, 0.7); // r=42.4 > celda 40: cubre varias celdas (remove debe limpiarlas todas)
  assert.ok(o && o.t === 1 && o.hx === 30 && o.hz === 30, 'addBox devuelve la caja');
  assert.ok(g.push(100, 100, 1.15), 'bloquea dentro de la caja');
  assert.ok(g.push(135, 100, 1.15), 'bloquea a 35 u del centro (otra celda de la rejilla)');
  g.remove(o);
  assert.equal(g.count, 0, 'count baja al retirar');
  assert.equal(g.push(100, 100, 1.15), null, 'tras remove ya no bloquea el centro');
  assert.equal(g.push(135, 100, 1.15), null, 'ni la celda vecina (sin restos)');
  g.add(o);
  assert.equal(g.count, 1, 'count sube al reponer');
  assert.ok(g.push(100, 100, 1.15), 'tras add vuelve a bloquear');
  assert.ok(g.push(135, 100, 1.15), 'y la celda vecina tambien');
});

console.log(`\n${n} pruebas de colisiones OK`);
