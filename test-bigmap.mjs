// Pruebas del mapa grande: estela, tamano, escala y proyeccion reutilizada del minimapa.
import assert from 'node:assert/strict';
import { pushTrail, bigMapSide, bigScale, hillshade, worldToMap } from './public/minimap.js';
import { WORLD } from './public/world/terrain.js';
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };

ok('pushTrail: ignora puntos cercanos y limita el largo', () => {
  const t = [];
  assert.equal(pushTrail(t, 0, 0), true);
  assert.equal(pushTrail(t, 3, 4), false);
  assert.equal(pushTrail(t, 100, 0), true);
  for (let i = 0; i < 20; i++) pushTrail(t, 200 + i * 50, 0, 14, 5);
  assert.equal(t.length, 5);
  assert.deepEqual(t[4], [200 + 19 * 50, 0]);
});
ok('bigMapSide ~70% del alto y cabe en pantallas estrechas', () => {
  assert.equal(bigMapSide(1920, 1000), 700);
  assert.equal(bigMapSide(400, 1000), 376);
});
ok('el mundo entero cabe en el mapa grande (esquinas dentro, centro al medio)', () => {
  const side = 700, s = bigScale(side, WORLD.size);
  const c = worldToMap(0, 0, 0, 0, s, side), a = worldToMap(-WORLD.half, -WORLD.half, 0, 0, s, side), b = worldToMap(WORLD.half, WORLD.half, 0, 0, s, side);
  assert.deepEqual([c.x, c.y], [350, 350]);
  assert.ok(Math.abs(a.x) < 1e-6 && Math.abs(a.y) < 1e-6 && Math.abs(b.x - side) < 1e-6 && Math.abs(b.y - side) < 1e-6);
});
ok('hillshade acotado y con signo', () => {
  assert.equal(hillshade(10, 10), 0);
  assert.ok(hillshade(50, 0) > 0 && hillshade(0, 50) < 0);
  assert.equal(hillshade(1e6, 0), 1);
});
console.log(`${n} pruebas OK`);
