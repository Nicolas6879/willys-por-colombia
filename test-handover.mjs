// Pruebas de handover.js: coreografia del recall (openRecall, hold, crossfade y promote) con fakes puros.
import assert from 'node:assert/strict';
import { createHandover } from './public/handover.js';

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('ok -', name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fakes minimos: link guarda lo enviado; player registra cada llamada en orden; xfadeMs corto por defecto para no tardar en el timer
const mk = (xfade = 30) => {
  const link = { sent: [], send(o) { this.sent.push(o); } };
  const player = {
    calls: [],
    reset(i) { this.calls.push(['reset', i]); },
    hold(i, v) { this.calls.push(['hold', i, v]); },
    crossfade(a, b, ms) { this.calls.push(['crossfade', a, b, ms]); },
    promote(i) { this.calls.push(['promote', i]); },
    stats() { return { heldSec: 1.23, held: true }; },
  };
  const ss = { handover: { placeId: 'med' } };
  const ch = [{ state: 'ready', samples: 1, sid: null }, { sid: 42, placeId: 'cal' }];
  const started = [];
  const h = createHandover({ link, player, ss, ch, xfadeMs: xfade, onStart: (v) => started.push(v) });
  return { link, player, ss, ch, h, started };
};

await ok('openRecall: reset(1) + hold(1,true) y open al canal 1 con sid/prompts/config/play', () => {
  const { link, player, h } = mk();
  const prompts = [{ text: 'guabina', weight: 1 }];
  const config = { seed: 7 };
  h.openRecall({ sid: 99 }, prompts, config);
  assert.deepEqual(link.sent, [{ type: 'open', ch: 1, sid: 99, prompts, config, play: true }]);
  assert.deepEqual(player.calls, [['reset', 1], ['hold', 1, true]]);
});

await ok('live ocupado: hold(1,false), crossfade(0,1,xfadeMs) y promote tras xfadeMs+100 (una sola vez)', async () => {
  const { link, player, ch, h } = mk();
  ch[0] = { state: 'playing' };
  h.start();
  assert.deepEqual(player.calls, [['hold', 1, false], ['crossfade', 0, 1, 30]]);
  assert.equal(link.sent.length, 0);
  await sleep(250);
  assert.equal(link.sent.length, 1);
  assert.deepEqual(link.sent[0], { type: 'promote', from: 'recall' });
});

await ok('live libre: promote inmediato sin crossfade ni timer posterior', async () => {
  const { link, player, ch, h } = mk();
  ch[0] = { state: '-' };
  h.start();
  assert.deepEqual(player.calls, [['hold', 1, false]]);
  assert.deepEqual(link.sent, [{ type: 'promote', from: 'recall' }]);
  await sleep(250);
  assert.equal(link.sent.length, 1);
});

await ok('abort antes del timer: no hay promote', async () => {
  const { link, ch, h } = mk();
  ch[0] = { state: 'playing' };
  h.start();
  h.abort();
  await sleep(250);
  assert.deepEqual(link.sent, []);
});

await ok('si cambia el sid del recall antes del timer: no hay promote', async () => {
  const { link, ch, h } = mk();
  ch[0] = { state: 'playing' };
  h.start();
  ch[1].sid = 43;
  await sleep(250);
  assert.deepEqual(link.sent, []);
});

await ok('si ss.handover se limpia antes del timer: no hay promote', async () => {
  const { link, ss, ch, h } = mk();
  ch[0] = { state: 'playing' };
  h.start();
  ss.handover = null;
  await sleep(250);
  assert.deepEqual(link.sent, []);
});

await ok('onStart se llama una vez al arrancar y recibe ss.handover', () => {
  const { ss, ch, h, started } = mk();
  ch[0] = { state: '-' };
  h.start();
  assert.equal(started.length, 1);
  assert.equal(started[0], ss.handover);
});

await ok('tick: promueve por frame aunque el timer no haya disparado (pestana congelada)', () => {
  const { link, ch, h } = mk(60000);
  ch[0] = { state: 'playing' };
  h.start();
  const t0 = Date.now();
  h.tick(t0 + 1000);
  assert.deepEqual(link.sent, []);
  h.tick(t0 + 60101);
  assert.deepEqual(link.sent, [{ type: 'promote', from: 'recall' }]);
});

await ok('tick: no promueve dos veces ni despues de abort', () => {
  const a = mk(60000); a.ch[0] = { state: 'playing' }; a.h.start();
  const t0 = Date.now();
  a.h.tick(t0 + 60101); a.h.tick(t0 + 60300);
  assert.equal(a.link.sent.length, 1);
  const b = mk(60000); b.ch[0] = { state: 'playing' }; b.h.start();
  b.h.abort();
  b.h.tick(Date.now() + 70000);
  assert.deepEqual(b.link.sent, []);
});

await ok('tick: un sid nuevo en el recall lo desactiva', () => {
  const { link, ch, h } = mk(60000);
  ch[0] = { state: 'playing' };
  h.start();
  ch[1].sid = 43;
  h.tick(Date.now() + 70000);
  assert.deepEqual(link.sent, []);
  h.abort(); // limpia el timer largo para no demorar el proceso
});

console.log(`\n${n} pruebas de handover OK`);
process.exitCode = 0;
