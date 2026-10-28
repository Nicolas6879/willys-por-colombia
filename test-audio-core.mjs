// Logica pura del reproductor: retencion, curvas de crossfade, promote, tiempos de cola. Sin AudioContext.
import assert from 'node:assert/strict';
import { ChannelQueue, equalPowerGains, crossfadeCurves, crossfadePlan, promoteChannels, SAMPLE_RATE } from './public/audio-core.js';

// bloque de `sec` segundos de PCM16 estereo cuyo primer sample identifica el bloque
function block(id, sec = 2) {
  const frames = Math.round(sec * SAMPLE_RATE), pcm = new Int16Array(frames * 2);
  pcm[0] = id; pcm[1] = id;
  return pcm.buffer;
}
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('sin hold: el primer bloque se agenda tras el jitter', () => {
  const q = new ChannelQueue();
  const plans = q.push(block(1), 10);
  assert.equal(plans.length, 1);
  assert.ok(Math.abs(plans[0].startAt - 10.6) < 1e-9);
  assert.equal(plans[0].pcm[0], 1);
});

t('bloques consecutivos sin hueco', () => {
  const q = new ChannelQueue();
  const a = q.push(block(1), 0)[0], b = q.push(block(2), 0.5)[0];
  assert.ok(Math.abs(b.startAt - (a.startAt + a.duration)) < 1e-9);
});

t('hold: no agenda nada y acumula', () => {
  const q = new ChannelQueue();
  q.hold();
  for (let i = 1; i <= 4; i++) assert.deepEqual(q.push(block(i), i), []);
  assert.equal(q.heldChunks.length, 4);
  assert.ok(Math.abs(q.heldSeconds - 8) < 1e-9);
});

t('release: reproduce DESDE EL PRIMER bloque retenido, en orden y sin huecos', () => {
  const q = new ChannelQueue();
  q.hold();
  for (let i = 1; i <= 4; i++) q.push(block(i), i);
  const plans = q.release(20);
  assert.deepEqual(plans.map((p) => p.pcm[0]), [1, 2, 3, 4]);
  assert.ok(Math.abs(plans[0].startAt - 20.6) < 1e-9, 'el primero arranca tras el jitter');
  for (let i = 1; i < plans.length; i++) assert.ok(Math.abs(plans[i].startAt - (plans[i - 1].startAt + plans[i - 1].duration)) < 1e-9);
  assert.ok(plans.every((p) => p.skip === 0), 'nada se recorta aunque el colchon sea de 8 s');
  assert.equal(q.heldChunks.length, 0);
});

t('tras release los bloques nuevos suenan en continuidad (sin recorte por colchon)', () => {
  const q = new ChannelQueue();
  q.hold();
  for (let i = 1; i <= 4; i++) q.push(block(i), i);
  const plans = q.release(20);
  const last = plans[plans.length - 1];
  const next = q.push(block(5), 21)[0];
  assert.equal(next.skip, 0);
  assert.ok(Math.abs(next.startAt - (last.startAt + last.duration)) < 1e-9);
});

t('sin hold, colchon alto recorta (comportamiento original)', () => {
  const q = new ChannelQueue();
  q.push(block(1), 0); q.push(block(2), 0.1); q.push(block(3), 0.2); // agendado ~6.6 s por delante
  const p = q.push(block(4), 0.3);
  assert.ok(p.length === 0 || p[0].skip > 0);
  assert.ok(q.dropped > 0);
});

t('underrun: reprograma con margen', () => {
  const q = new ChannelQueue();
  q.push(block(1), 0);
  const p = q.push(block(2), 10)[0];
  assert.equal(q.underruns, 1);
  assert.ok(Math.abs(p.startAt - 10.35) < 1e-9);
});

t('bytes partidos a mitad de muestra se recomponen', () => {
  const q = new ChannelQueue();
  const full = new Uint8Array(block(7, 0.5));
  const plans = [...q.push(full.slice(0, 1001).buffer, 0), ...q.push(full.slice(1001).buffer, 0)];
  const frames = plans.reduce((s, p) => s + p.pcm.length / 2, 0);
  assert.equal(frames, full.length / 4);
  assert.equal(plans[0].pcm[0], 7);
});

t('hold tiene tope: el inicio no se pierde', () => {
  const q = new ChannelQueue({ maxHeldSec: 4 });
  q.hold();
  for (let i = 1; i <= 5; i++) q.push(block(i), 0);
  assert.equal(q.heldChunks[0][0], 1);
  assert.ok(q.heldSeconds <= 6 + 1e-9 && q.heldDropped >= 1);
});

t('reset descarta lo retenido y reinicia el tiempo', () => {
  const q = new ChannelQueue();
  q.hold(); q.push(block(1), 0); q.reset(5);
  assert.equal(q.heldChunks.length, 0);
  assert.equal(q.nextTime, 0);
});

t('crossfade equal-power: suma de potencias = 1 en todos los puntos', () => {
  for (let i = 0; i <= 100; i++) {
    const g = equalPowerGains(i / 100);
    assert.ok(Math.abs(g.in ** 2 + g.out ** 2 - 1) < 1e-12);
  }
  const c = crossfadeCurves(64);
  for (let i = 0; i < 64; i++) assert.ok(Math.abs(c.in[i] ** 2 + c.out[i] ** 2 - 1) < 1e-6);
  assert.ok(Math.abs(c.in[0]) < 1e-9 && Math.abs(c.in[63] - 1) < 1e-6);
  assert.ok(Math.abs(c.out[0] - 1) < 1e-6 && Math.abs(c.out[63]) < 1e-6);
  const mid = equalPowerGains(0.5);
  assert.ok(mid.in > 0.7 && mid.in < 0.71, 'a mitad cada canal a -3 dB, no 0.5');
});

t('crossfadePlan: duracion por defecto 1.5 s', () => {
  const p = crossfadePlan(3);
  assert.ok(Math.abs(p.end - 4.5) < 1e-9 && p.inCurve.length === 64);
  assert.ok(Math.abs(crossfadePlan(0, 800).duration - 0.8) < 1e-9);
});

t('promote: el recall pasa a ser live y queda un canal 1 fresco', () => {
  const live = new ChannelQueue(), recall = new ChannelQueue();
  recall.hold(); recall.push(block(9), 0); recall.release(1);
  const [a, b] = promoteChannels([live, recall], () => new ChannelQueue());
  assert.equal(a, recall);
  assert.notEqual(b, live);
  assert.equal(b.nextTime, 0);
  const next = a.push(block(10), 2)[0]; // el nuevo live conserva su programacion
  assert.ok(next.startAt >= 1.6);
});

console.log(`${n} pruebas OK`);
