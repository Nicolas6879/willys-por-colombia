// Musica reactiva a la velocidad (public/reactive.js, pura): targets, suavizado 3 s / 6 s, umbral y ritmo de envio, muteDrums.
import assert from 'node:assert/strict';
import { ReactiveMusic, speedTargets, RCFG } from './public/reactive.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} vs ${b}`);

// corre el controlador a `fps` Hz durante `ms`, con la velocidad dada por speedAt(t); devuelve los parches con su instante
function run(rm, { from = 0, ms, speedAt, base = {}, fps = 30 }) {
  const sent = [];
  for (let t = from; t <= from + ms; t += 1000 / fps) {
    const p = rm.update({ now: t, speed: speedAt(t), base });
    if (p) sent.push({ t, ...p });
  }
  return sent;
}

ok('targets: parado 0.3/0.4, velocidad maxima 0.7/0.7 con la base por defecto', () => {
  const lo = speedTargets(0), hi = speedTargets(24);
  near(lo.density, 0.3, 1e-9); near(hi.density, 0.7, 1e-9);
  near(lo.brightness, 0.4, 1e-9); near(hi.brightness, 0.7, 1e-9);
  near(speedTargets(12).density, 0.5, 1e-9);
  assert.equal(speedTargets(60).density, hi.density, 'por encima de vMax se satura');
  assert.equal(speedTargets(NaN).density, lo.density, 'velocidad invalida = parado');
});

ok('la reactividad se suma alrededor de la base del lugar/seccion, con rango acotado', () => {
  const b = { density: 0.6, brightness: 0.65 };
  near(speedTargets(0, b).density, 0.4, 1e-9); near(speedTargets(24, b).density, 0.8, 1e-9);
  const breakdown = { density: 0.2, brightness: 0.5 }; // seccion breakdown: el groove baja a ~0.2 y la velocidad modula alrededor
  near(speedTargets(12, breakdown).density, 0.2, 1e-9);
  assert.ok(speedTargets(24, breakdown).density <= 0.4 + 1e-9);
  for (const base of [{ density: 5, brightness: -3 }, { density: -1, brightness: 9 }, {}]) for (const v of [0, 5, 24, 99]) {
    const t = speedTargets(v, base);
    for (const k of ['density', 'brightness']) assert.ok(t[k] >= RCFG.lo && t[k] <= RCFG.hi, k + ' dentro de [lo, hi]');
  }
});

ok('suavizado: sube en ~3 s y baja en ~6 s (mas lento)', () => {
  const up = new ReactiveMusic();
  run(up, { ms: 4000, speedAt: () => 0 }); // asentado parado (~0.3)
  const d0 = up.cur.density; near(d0, 0.3, 0.02);
  const t0 = 4100;
  run(up, { from: t0, ms: 3000, speedAt: () => 24 });
  const rise = (up.cur.density - d0) / (0.7 - d0);
  assert.ok(rise > 0.7 && rise < 1, 'a los 3 s subio ' + rise.toFixed(2) + ' del salto');
  const dn = new ReactiveMusic();
  run(dn, { ms: 12000, speedAt: () => 24 });
  const h0 = dn.cur.density; near(h0, 0.7, 0.03);
  run(dn, { from: 12100, ms: 3000, speedAt: () => 0 });
  const fall3 = (h0 - dn.cur.density) / (h0 - 0.3);
  run(dn, { from: 15200, ms: 3000, speedAt: () => 0 });
  const fall6 = (h0 - dn.cur.density) / (h0 - 0.3);
  assert.ok(fall3 < rise, 'bajar es mas lento que subir (' + fall3.toFixed(2) + ' < ' + rise.toFixed(2) + ')');
  assert.ok(fall6 > 0.7 && fall6 < 1, 'a los 6 s bajo ' + fall6.toFixed(2));
});

ok('se evalua ~1 vez/s: dentro de un mismo segundo el valor suavizado no cambia', () => {
  const rm = new ReactiveMusic();
  rm.update({ now: 0, speed: 0 }); const a = rm.cur.density;
  rm.update({ now: 400, speed: 24 }); rm.update({ now: 900, speed: 24 });
  assert.equal(rm.cur.density, a);
  rm.update({ now: 1000, speed: 24 });
  assert.ok(rm.cur.density > a);
});

ok('envio: primer parche inmediato, luego solo si el cambio supera 0.05 y como mucho cada 1.75 s', () => {
  const rm = new ReactiveMusic();
  const sent = run(rm, { ms: 30000, speedAt: (t) => (t < 8000 ? 6 : t < 20000 ? 24 : 6) });
  assert.ok(sent.length >= 3, 'hubo varios envios: ' + sent.length);
  assert.ok(sent[0].t <= 100, 'primer parche al arrancar');
  for (let i = 1; i < sent.length; i++) {
    assert.ok(sent[i].t - sent[i - 1].t >= RCFG.sendMinMs - 40, `separacion ${sent[i].t - sent[i - 1].t} ms`);
    const dd = Math.abs(sent[i].density - sent[i - 1].density), db = Math.abs(sent[i].brightness - sent[i - 1].brightness);
    assert.ok(dd > RCFG.sendDelta - 1e-9 || db > RCFG.sendDelta - 1e-9 || sent[i].muteDrums !== sent[i - 1].muteDrums, 'cambio por encima del umbral');
  }
  // velocidad constante: no se manda nada mas una vez asentado
  const quiet = run(rm, { from: 30100, ms: 10000, speedAt: () => 6 });
  assert.equal(quiet.length, 0, 'sin cambios no hay envios');
});

ok('muteDrums: tras ~2 s parado, y se quita en cuanto se mueve', () => {
  const rm = new ReactiveMusic();
  const sent = run(rm, { ms: 1900, speedAt: () => 0 });
  assert.ok(sent.every((p) => p.muteDrums === false), 'antes de 2 s no hay mute');
  const s2 = run(rm, { from: 2000, ms: 2500, speedAt: () => 0 });
  assert.ok(s2.length >= 1 && s2[0].muteDrums === true, 'mute a los ~2 s parado');
  assert.ok(s2[0].t >= 2000 && s2[0].t <= 4100);
  const s3 = run(rm, { from: 4600, ms: 3000, speedAt: () => 12 });
  assert.ok(s3.length >= 1 && s3[0].muteDrums === false, 'se quita al moverse');
  assert.ok(s3[0].t - 4600 <= RCFG.sendMinMs + 100, 'y rapido: ' + (s3[0].t - 4600));
  // casi parado (0.5 u/s) tambien cuenta; un frenazo corto (< 2 s) no
  const b = new ReactiveMusic();
  run(b, { ms: 1500, speedAt: () => 0.5 }); run(b, { from: 1600, ms: 500, speedAt: () => 10 });
  assert.equal(b.muteDrums, false, 'frenazo corto: sin mute');
  const c = new ReactiveMusic();
  run(c, { ms: 2500, speedAt: () => 0.5 });
  assert.equal(c.muteDrums, true, 'casi parado: mute');
  run(c, { from: 2600, ms: 400, speedAt: () => 1.8 }); // entre stopSpeed y moveSpeed: histeresis, sigue en mute
  assert.equal(c.muteDrums, true);
});

ok('resync / current / markSent: una sesion nueva recibe la config dinamica', () => {
  const rm = new ReactiveMusic();
  assert.deepEqual(rm.current(), {});
  run(rm, { ms: 5000, speedAt: () => 24 });
  const cur = rm.current();
  assert.ok(cur.density > 0.6 && cur.muteDrums === false);
  assert.equal(run(rm, { from: 5100, ms: 5000, speedAt: () => 24 }).length, 0, 'asentado: callado');
  rm.resync(); // promote de una sesion nueva (no tiene density/brightness)
  const again = run(rm, { from: 10200, ms: 2500, speedAt: () => 24 });
  assert.equal(again.length, 1, 'tras el promote se reenvia una vez');
  assert.equal(again[0].density, cur.density);
  rm.markSent(); // reapertura que ya llevo current() en el open
  assert.equal(run(rm, { from: 13000, ms: 3000, speedAt: () => 24 }).length, 0);
});

ok('deshabilitado (pausa / live no listo): no envia ni acumula tiempo parado', () => {
  const rm = new ReactiveMusic();
  for (let t = 0; t < 5000; t += 100) assert.equal(rm.update({ now: t, speed: 0, enabled: false }), null);
  assert.equal(rm.muteDrums, false);
  assert.equal(rm.cur, null);
});

console.log(`\n${n} pruebas de reactive OK`);
