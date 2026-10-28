// Pruebas del gobernador de calidad (G3a, histeresis) y de la geometria de la tabla de calidad.
import assert from 'node:assert/strict';
import { Governor, QUALITY } from './public/perf.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };
// alimenta dt durante secs; devuelve [{t, level}] de cada cambio
const run = (g, dt, secs) => { const out = []; for (let t = 0; t < secs; t += dt) { const r = g.push(dt); if (r != null) out.push({ t: +g.age.toFixed(1), level: r }); } return out; };

ok('60 fps sostenidos: nunca degrada', () => { const g = new Governor(); assert.deepEqual(run(g, 1 / 60, 30), []); assert.equal(g.level, 0); });
ok('arranque lento (71 ms los primeros 4 s) y luego fluido: no degrada', () => {
  const g = new Governor(); assert.deepEqual(run(g, 0.071, 4), []); assert.deepEqual(run(g, 1 / 60, 20), []); assert.equal(g.level, 0);
});
ok('> 18 ms sostenido 3 s tras el calentamiento de 5 s: baja un nivel cada 3 s', () => {
  const g = new Governor(), ev = run(g, 0.025, 20);
  assert.equal(g.level, 3); assert.equal(ev.length, 3);
  assert.ok(ev[0].t >= 8 && ev[0].t <= 9.5, 'primer cambio ' + ev[0].t);
});
ok('un pico aislado no degrada (media movil)', () => {
  const g = new Governor(); run(g, 1 / 60, 6);
  for (let i = 0; i < 300; i++) g.push(i === 50 ? 0.1 : 1 / 60); assert.equal(g.level, 0);
});
ok('pausas > 0.5 s reinician el calentamiento (5 s sin contar)', () => {
  const g = new Governor(); run(g, 1 / 60, 6); g.push(2);
  assert.deepEqual(run(g, 0.05, 4.5), []); assert.equal(g.level, 0);
  g.rewarm(); assert.deepEqual(run(g, 0.05, 4.5), []);
});
ok('SUBE la calidad si los frames vuelven a ser rapidos (< 12 ms por 6 s)', () => {
  const g = new Governor(); run(g, 0.025, 12); assert.ok(g.level >= 1);
  const l = g.level, ev = run(g, 1 / 100, 10);
  assert.ok(ev.length >= 1 && ev[0].level === l - 1, JSON.stringify(ev));
  assert.ok(ev[0].t - 12 >= 5.5 && ev[0].t - 12 <= 9, 'sube tras ~6 s, no antes');
});
ok('entre 12 y 18 ms no cambia (zona muerta)', () => {
  const g = new Governor(); run(g, 0.025, 10); const l = g.level;
  assert.deepEqual(run(g, 0.015, 60), []); assert.equal(g.level, l);
});
ok('anti-oscilacion: si baja de nuevo poco despues de subir, no vuelve a subir en 60 s', () => {
  const g = new Governor(); run(g, 0.025, 9); // nivel 1
  assert.equal(g.level, 1);
  run(g, 1 / 100, 7); assert.equal(g.level, 0); // subio
  run(g, 0.025, 4); assert.equal(g.level, 1); // volvio a bajar rapido
  assert.deepEqual(run(g, 1 / 100, 30), []); assert.equal(g.level, 1); // bloqueado
  assert.ok(run(g, 1 / 100, 40).length === 1); assert.equal(g.level, 0); // luego puede subir
});
ok('el nivel maximo es 3 y el minimo 0', () => {
  const g = new Governor(); run(g, 0.05, 60); assert.equal(g.level, 3); assert.equal(g.push(0.05), null);
});
ok('niveles de calidad: densidad y distancia de fog decrecientes', () => {
  for (let i = 1; i < QUALITY.length; i++) { assert.ok(QUALITY[i].density < QUALITY[i - 1].density && QUALITY[i].fogFar < QUALITY[i - 1].fogFar && QUALITY[i].clouds < QUALITY[i - 1].clouds); }
  assert.equal(QUALITY[0].density, 1);
});
console.log(`\n${n} pruebas de perf OK`);
