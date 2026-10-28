// Pruebas del ciclo de dia (G3a): tabla en sus puntos, continuidad circular, periodo, el atardecer dura mas, tecla T.
import assert from 'node:assert/strict';
import { paletteAt, TABLE, SEGMENTS, HOURS, timeAt, nextHourStart, rgbToHex, hexOf, DEFAULT_PERIOD_S, START_T, holdStartOf } from './public/world/daycycle.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };
const HEX = {
  amanecer: { zenith: 0x6fa8dc, horizon: 0xffc1a1, sun: 0xffb38a, hemiSky: 0xbfd7f2, hemiGround: 0x8e6c8a },
  dia: { zenith: 0x4fa3f0, horizon: 0xcdebff, sun: 0xfff2d6, hemiSky: 0xcfe8ff, hemiGround: 0x8db36a, shadow: 0x6e7fb5 },
  atardecer: { zenith: 0x5b7fd1, horizon: 0xffc873, sun: 0xffb347, hemiSky: 0xffd9a0, hemiGround: 0x7a5c9e, shadow: 0x7a5c9e },
  crepusculo: { zenith: 0x3b3a82, horizon: 0xf08a8a, sun: 0xff8a65, hemiSky: 0x8e8ad6, hemiGround: 0x4a3a6b },
  noche: { zenith: 0x121b3f, horizon: 0x2e3e7a, sun: 0x8fa8ff, hemiSky: 0x3a4a8f, hemiGround: 0x1a1a3a, shadow: 0x26305e },
};

ok('la tabla 2.2 se cumple en el centro de cada hora', () => {
  for (const s of SEGMENTS) {
    const p = paletteAt((s.holdStart + s.holdEnd) / 2);
    assert.equal(p.hour, s.hour);
    for (const [k, v] of Object.entries(HEX[s.hour])) assert.equal(rgbToHex(p[k]), v, `${s.hour}.${k}: ${rgbToHex(p[k]).toString(16)}`);
  }
  assert.deepEqual(hexOf(0x4fa3f0), [0x4f, 0xa3, 0xf0]);
});

ok('las 5 horas, segmentos contiguos que cubren 0..1', () => {
  assert.deepEqual(SEGMENTS.map((s) => s.hour), HOURS);
  assert.equal(SEGMENTS[0].holdStart, 0);
  for (let i = 1; i < SEGMENTS.length; i++) assert.ok(Math.abs(SEGMENTS[i].holdStart - SEGMENTS[i - 1].end) < 1e-12);
  assert.ok(Math.abs(SEGMENTS.at(-1).end - 1) < 1e-12);
});

ok('continuidad: sin saltos entre muestras vecinas, tambien al dar la vuelta (t=1 -> 0)', () => {
  const N = 20000, keys = ['zenith', 'horizon', 'sun', 'hemiSky', 'hemiGround', 'shadow', 'cloudBase', 'mid'];
  let prev = paletteAt(0), maxD = 0;
  for (let i = 1; i <= N; i++) {
    const p = paletteAt(i / N); // i = N equivale a 0 (circular)
    for (const k of keys) for (let c = 0; c < 3; c++) maxD = Math.max(maxD, Math.abs(p[k][c] - prev[k][c]));
    assert.ok(Math.abs(p.sunElev - prev.sunElev) < 0.5 && Math.abs(p.night - prev.night) < 0.01);
    const dAz = Math.abs(((p.sunAz - prev.sunAz + 540) % 360) - 180); assert.ok(dAz < 0.8, 'azimut');
    prev = p;
  }
  assert.ok(maxD < 1.5, 'salto maximo por muestra ' + maxD);
  const a = paletteAt(0), b = paletteAt(1), c = paletteAt(-1e-9);
  for (const k of ['zenith', 'horizon']) { assert.deepEqual(a[k], b[k]); assert.ok(Math.abs(a[k][0] - c[k][0]) < 0.01); }
});

ok('el atardecer dorado dura mas que cualquier otra hora y es la hora dominante', () => {
  const span = (s) => s.hold + s.trans;
  const at = SEGMENTS.find((s) => s.hour === 'atardecer');
  for (const s of SEGMENTS) if (s !== at) { assert.ok(at.hold > s.hold * 3, s.hour); assert.ok(span(at) > span(s) * 2.5, s.hour); }
  // fraccion del ciclo en que la hora dominante es el atardecer
  let g = 0; const N = 5000; for (let i = 0; i < N; i++) if (paletteAt(i / N).hour === 'atardecer') g++;
  assert.ok(g / N > 0.5 && g / N < 0.75, 'atardecer ocupa ' + g / N);
  assert.equal(paletteAt(START_T).hour, 'atardecer');
});

ok('periodo configurable: timeAt avanza 1 vuelta por periodo y es circular', () => {
  assert.equal(DEFAULT_PERIOD_S, 420);
  assert.ok(Math.abs(timeAt(0) - START_T) < 1e-12);
  assert.ok(Math.abs(timeAt(DEFAULT_PERIOD_S) - START_T) < 1e-9);
  assert.ok(Math.abs(timeAt(210, 420, 0) - 0.5) < 1e-12);
  assert.ok(Math.abs(timeAt(60, 120, 0) - 0.5) < 1e-12); // periodo corto = vuelta mas rapida
  assert.ok(Math.abs(timeAt(-10, 100, 0.05) - 0.95) < 1e-9);
});

ok('sol: bajo (~12 grados) al atardecer, alto de dia, azimut avanza; luna de noche', () => {
  const e = (h) => paletteAt((holdStartOf(h) + SEGMENTS.find((s) => s.hour === h).holdEnd) / 2);
  assert.ok(e('atardecer').sunElev > 8 && e('atardecer').sunElev < 14);
  assert.ok(e('dia').sunElev > 45 && e('noche').night === 1 && e('dia').night === 0);
  const d = e('atardecer').sunDir; assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9 && d[1] > 0);
  assert.ok(d[0] < 0 && d[2] < 0, 'al atardecer el sol queda al noroeste'); // oeste = -x, norte = -z
});

ok('nextHourStart (tecla T): salta al inicio de la siguiente hora en bucle', () => {
  let t = START_T; const seen = [];
  for (let i = 0; i < 6; i++) { t = nextHourStart(t); seen.push(paletteAt(t).hour); }
  assert.deepEqual(seen, ['crepusculo', 'noche', 'amanecer', 'dia', 'atardecer', 'crepusculo']);
  assert.ok(nextHourStart(0.999) === SEGMENTS[0].holdStart);
});

ok('valores intermedios mezclan entre dos horas (no se salen del rango)', () => {
  for (let i = 0; i < 400; i++) {
    const p = paletteAt(i / 400);
    for (const k of ['zenith', 'horizon', 'sun', 'shadow']) for (const v of p[k]) assert.ok(v >= 0 && v <= 255);
    assert.ok(p.exposure > 0.5 && p.exposure <= 1.0001 && p.night >= 0 && p.night <= 1);
  }
  const mid = paletteAt((SEGMENTS[2].holdEnd + SEGMENTS[2].end) / 2).horizon; // a mitad de atardecer -> crepusculo
  assert.ok(mid[0] > TABLE.crepusculo.horizon[0] - 1 && mid[1] < TABLE.atardecer.horizon[1] && mid[1] > TABLE.crepusculo.horizon[1]);
});

console.log(`\n${n} pruebas de daycycle OK`);
