// Protocolo del servidor contra un Lyria MOCK inyectado: prefijo de canal, limite de 2 sesiones, promote, close,
// coalescing y rotacion (con ROTATE_MS corto, aplazada si hay recall abierto).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createServer, sanitizeConfig } from './server-core.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapa-lyria-test-'));

// ---- mock de Lyria ----
let open = 0, maxOpen = 0, seq = 0;
const sessions = [];
function mockConnect(cb) {
  const s = {
    id: ++seq, calls: [], closed: false, cb,
    setWeightedPrompts(a) { this.calls.push(['prompts', a.weightedPrompts]); },
    setMusicGenerationConfig(a) { this.calls.push(['config', a.musicGenerationConfig]); },
    play() { this.calls.push(['play']); this.timer = setInterval(() => cb.onmessage({ serverContent: { audioChunks: [{ data: Buffer.from([s.id, 0, 0, 0, 1, 0, 0, 0]).toString('base64') }] } }), 20); },
    pause() { this.calls.push(['pause']); clearInterval(this.timer); },
    resetContext() { this.calls.push(['reset']); },
    close() { if (this.closed) return; this.closed = true; clearInterval(this.timer); open--; },
  };
  open++; maxOpen = Math.max(maxOpen, open); sessions.push(s);
  return new Promise((r) => setTimeout(() => r(s), 15)); // connect asincrono
}

const app = createServer({ connect: mockConnect, rotateMs: 400, rotateDeferMs: 80, sendIntervalMs: 40, logDir });
const port = await app.listen(0);

// ---- cliente ----
function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const c = { ws, msgs: [], frames: [] };
  ws.on('message', (d, bin) => (bin ? c.frames.push({ ch: d[0], len: d.length - 1, id: d[1] }) : c.msgs.push(JSON.parse(d.toString()))));
  c.send = (o) => ws.send(JSON.stringify(o));
  c.until = async (pred, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = c.msgs.find(pred); if (m) return m; await sleep(10); } throw new Error('timeout esperando mensaje; vistos: ' + JSON.stringify(c.msgs.slice(-6))); };
  c.ready = new Promise((r) => ws.on('open', r));
  return c;
}
let n = 0;
const ok = (name) => { n++; console.log('ok -', name); };
const P = (text, weight = 1) => ({ text, weight });

const c = client();
await c.ready;

// 1. open live: prefijo de canal 0, orden prompts+config antes de play, first_audio
c.send({ type: 'open', ch: 0, prompts: [P('caribe')], config: { seed: 7 }, play: true });
const fa0 = await c.until((m) => m.type === 'first_audio' && m.ch === 0);
assert.ok(fa0.ms >= 0);
const s0 = sessions[0];
assert.deepEqual(s0.calls.map((x) => x[0]).slice(0, 3), ['prompts', 'config', 'play']);
assert.equal(s0.calls[1][1].seed, 7);
await sleep(100);
assert.ok(c.frames.length > 0 && c.frames.every((f) => f.ch === 0 && f.id === s0.id && f.len === 8));
ok('open live: orden prompts/config/play, first_audio y frames con byte 0');

// 2. coalescing de prompts
const before = s0.calls.filter((x) => x[0] === 'prompts').length;
for (let i = 0; i < 20; i++) c.send({ type: 'prompts', ch: 0, prompts: [P('caribe', 1 - i / 20), P('cali', i / 20)] });
await sleep(300);
const sent = s0.calls.filter((x) => x[0] === 'prompts').slice(before);
assert.ok(sent.length >= 1 && sent.length <= 3, 'coalescing: ' + sent.length);
assert.ok(Math.abs(sent[sent.length - 1][1].find((p) => p.text === 'cali').weight - 0.95) < 1e-6, 'gana el ultimo estado');
ok('prompts con coalescing (20 mensajes -> ' + sent.length + ' envios, el ultimo gana)');

// 3. recall en canal 1 con prefijo 1 y seed
c.frames.length = 0;
c.send({ type: 'open', ch: 'recall', prompts: [P('medellin')], config: { seed: 11, bpm: 122 }, play: true });
await c.until((m) => m.type === 'first_audio' && m.ch === 1);
const s1 = sessions[1];
assert.deepEqual(s1.calls.slice(0, 3).map((x) => x[0]), ['prompts', 'config', 'play']);
assert.deepEqual(s1.calls[1][1], { seed: 11, bpm: 122 });
await sleep(100);
assert.ok(c.frames.some((f) => f.ch === 1 && f.id === s1.id) && c.frames.some((f) => f.ch === 0 && f.id === s0.id));
assert.ok(c.frames.every((f) => (f.ch === 0 ? f.id === s0.id : f.id === s1.id)));
ok('recall: canal 1, config con seed+bpm antes de play, frames de ambos canales');

// 4. limite de 2 sesiones
c.msgs.length = 0;
c.send({ type: 'open', ch: 2, prompts: [P('x')], play: true });
const e1 = await c.until((m) => m.type === 'error');
assert.match(e1.message, /canal/);
assert.equal(sessions.length, 2);
c.send({ type: 'open', ch: 'third', prompts: [P('x')] });
await sleep(50);
assert.equal(sessions.length, 2);
ok('canal invalido -> error, no se abre sesion');

// la 3a sesion real: reemplazar el recall dos veces seguidas dejaria la vieja conectando + live + nueva = 3
c.msgs.length = 0;
c.send({ type: 'open', ch: 1, prompts: [P('medellin2')], config: { seed: 11 }, play: true });  // reemplazo valido (la vieja ya conecto)
c.send({ type: 'open', ch: 1, prompts: [P('medellin3')], config: { seed: 11 }, play: true });  // la anterior aun conecta: seria la 3a
const e2 = await c.until((m) => m.type === 'error' && /limite/.test(m.message));
assert.equal(e2.ch, 1);
await c.until((m) => m.type === 'first_audio' && m.ch === 1);
assert.equal(sessions.length, 3);
assert.ok(maxOpen <= 2, 'maxOpen=' + maxOpen);
ok('3a sesion -> error de limite; reemplazar un canal no excede 2 (max simultaneas=' + maxOpen + ')');

// 5. promote: recall pasa a live; frames con byte 0 despues de `promoted`; live viejo cerrado
c.msgs.length = 0; c.frames.length = 0;
const s2 = sessions[2];
c.send({ type: 'promote', from: 'recall' });
await c.until((m) => m.type === 'promoted');
assert.ok(s0.closed, 'live viejo cerrado');
c.frames.length = 0; // los frames previos a `promoted` aun llevan byte 1
await sleep(150);
assert.ok(c.frames.length > 0 && c.frames.every((f) => f.ch === 0 && f.id === s2.id), 'tras promote solo llegan frames con byte 0');
c.msgs.length = 0;
c.send({ type: 'promote' });
assert.equal((await c.until((m) => m.type === 'error')).ch, 1);
ok('promote: recall -> live, el viejo se cierra, frames byte 0; sin recall -> error');

// 6. close
c.send({ type: 'close', ch: 0 });
const cl = await c.until((m) => m.type === 'closed' && m.ch === 0);
assert.equal(cl.code, 1000);
assert.ok(s2.closed);
assert.equal(open, 0);
ok('close libera la sesion');

// 7. rotacion: rotate_soon pasado ROTATE_MS; el cliente abre en el canal libre y promueve
c.msgs.length = 0;
c.send({ type: 'open', ch: 0, prompts: [P('a')], play: true });
const r0 = await c.until((m) => m.type === 'rotate_soon', 2000);
assert.equal(r0.ch, 0);
assert.ok(r0.ageMs >= 380, 'ageMs=' + r0.ageMs);
c.send({ type: 'open', ch: 1, prompts: [P('a')], play: true }); // lo que haria el cliente
await c.until((m) => m.type === 'first_audio' && m.ch === 1);
const oldLive = sessions[sessions.length - 2];
c.send({ type: 'promote', from: 'recall' });
await c.until((m) => m.type === 'promoted');
assert.ok(oldLive.closed);
assert.ok(maxOpen <= 2);
ok('rotacion: rotate_soon, sesion nueva en el canal libre y promote (max simultaneas=' + maxOpen + ')');

// 8. rotacion aplazada si hay recall abierto
c.msgs.length = 0;
c.send({ type: 'open', ch: 1, prompts: [P('recall en curso')], play: true });
await c.until((m) => m.type === 'first_audio' && m.ch === 1);
await sleep(900); // > rotateMs (400) desde que el live (ya promovido) abrio
assert.ok(!c.msgs.some((m) => m.type === 'rotate_soon'), 'aplazada mientras haya recall');
c.send({ type: 'close', ch: 1 });
const r1 = await c.until((m) => m.type === 'rotate_soon', 1500);
assert.equal(r1.ch, 0);
ok('rotacion aplazada con recall abierto; avisa al cerrarlo');

// 9. pause/play
const live = sessions[sessions.length - 1];
c.send({ type: 'pause' });
await sleep(60);
assert.ok(live.calls.some((x) => x[0] === 'pause') || sessions.some((s) => s.calls.some((x) => x[0] === 'pause')));
c.send({ type: 'play' });
await sleep(60);
ok('pause/play');

// 9b. sid: close + open inmediato en el canal 1; el `closed` del viejo trae el sid viejo y todo lo nuevo el sid nuevo
c.send({ type: 'close', ch: 1 }); await sleep(50); // por si quedara un recall abierto
c.msgs.length = 0;
c.send({ type: 'open', ch: 1, sid: 41, prompts: [P('viejo')], play: true });
await c.until((m) => m.type === 'first_audio' && m.ch === 1 && m.sid === 41);
c.msgs.length = 0;
c.send({ type: 'close', ch: 1 });
c.send({ type: 'open', ch: 1, sid: 42, prompts: [P('nuevo')], play: true });
await c.until((m) => m.type === 'first_audio' && m.ch === 1 && m.sid === 42);
const oldClosed = c.msgs.find((m) => m.type === 'closed' && m.ch === 1);
assert.equal(oldClosed.sid, 41, 'closed del viejo con sid viejo');
assert.ok(c.msgs.filter((m) => m.type === 'status' && m.ch === 1 && m.state === 'closed').every((m) => m.sid === 41));
assert.ok(c.msgs.filter((m) => m.type === 'status' && m.ch === 1 && m.state !== 'closed').every((m) => m.sid === 42));
assert.ok(c.msgs.indexOf(oldClosed) < c.msgs.findIndex((m) => m.type === 'status' && m.sid === 42), 'el closed viejo llega antes que el connecting nuevo (orden del servidor)');
c.send({ type: 'promote', from: 'recall' });
assert.equal((await c.until((m) => m.type === 'promoted')).sid, 42);
ok('sid: los mensajes de cada sesion llevan su sid (closed viejo=41, status/first_audio/promoted nuevos=42)');

// 9c. config dinamica {type:'config'}: se fusiona con la config de la sesion y se reenvia COMPLETA (seed incluida), sin tocar los prompts
//     ni hacer resetContext salvo que cambien bpm/scale; y una sesion de region retenida/pre-calentada NO la recibe antes del promote
c.send({ type: 'close', ch: 1 }); c.send({ type: 'close', ch: 0 }); await sleep(80);
c.msgs.length = 0;
const OPEN_A = { seed: 5, bpm: 100, scale: 'G_MAJOR_E_MINOR', temperature: 0.9, topK: 28, guidance: 4.5 };
c.send({ type: 'open', ch: 0, sid: 51, prompts: [P('region A')], config: OPEN_A, play: true });
await c.until((m) => m.type === 'first_audio' && m.ch === 0 && m.sid === 51);
const LA = sessions[sessions.length - 1];
assert.deepEqual(LA.calls[1], ['config', OPEN_A], 'el open manda la config de apertura (con bpm/scale/topK/guidance) antes de play');
const nPrompts = () => LA.calls.filter((x) => x[0] === 'prompts').length;
let p0 = nPrompts(), k0 = LA.calls.length;
c.send({ type: 'config', ch: 0, config: { density: 0.6, brightness: 0.5, muteDrums: true } });
await sleep(150);
let added = LA.calls.slice(k0);
assert.equal(added.length, 1, 'un solo envio: ' + JSON.stringify(added.map((x) => x[0])));
assert.deepEqual(added[0], ['config', { ...OPEN_A, density: 0.6, brightness: 0.5, muteDrums: true }], 'config COMPLETA fusionada (seed incluida)');
assert.equal(nPrompts(), p0, 'no reenvia prompts');
assert.ok(!LA.calls.some((x) => x[0] === 'reset'), 'density/brightness/muteDrums no hacen resetContext');
ok('config: fusiona y reenvia la config completa (seed incluida), sin prompts ni resetContext');

// coalescing: 30 mensajes seguidos -> pocos envios, el ultimo gana; campos invalidos se descartan
k0 = LA.calls.length;
for (let i = 0; i < 30; i++) c.send({ type: 'config', ch: 0, config: { density: 0.3 + i * 0.01, muteDrums: i % 2 === 0, bogus: 9, onlyBassAndDrums: 'si' } });
await sleep(250);
added = LA.calls.slice(k0);
assert.ok(added.length >= 1 && added.length <= 4, 'coalescing: ' + added.length);
assert.ok(added.every((x) => x[0] === 'config' && !('bogus' in x[1]) && !('onlyBassAndDrums' in x[1]) && x[1].seed === 5), 'solo configs completas y limpias');
assert.ok(Math.abs(added.at(-1)[1].density - 0.59) < 1e-9 && added.at(-1)[1].muteDrums === false, 'gana el ultimo estado');
ok('config con coalescing (30 mensajes -> ' + added.length + ' envios, el ultimo gana, campos invalidos fuera)');

// bpm/scale: ahi si hay resetContext
k0 = LA.calls.length;
c.send({ type: 'config', ch: 0, config: { bpm: 110 } });
await sleep(150);
assert.ok(LA.calls.slice(k0).some((x) => x[0] === 'reset'), 'cambio de bpm -> resetContext');
assert.equal(LA.calls.slice(k0).find((x) => x[0] === 'config')[1].bpm, 110);
k0 = LA.calls.length;
c.send({ type: 'config', ch: 0, config: { density: 0.45 } });
await sleep(150);
assert.ok(!LA.calls.slice(k0).some((x) => x[0] === 'reset'), 'ya sin cambio de bpm: sin reset');
ok('config: resetContext solo si cambian bpm o scale');

// la sesion de region pre-calentada (canal 1, retenida en el cliente) NO recibe config dinamica antes del promote
const OPEN_B = { seed: 11, bpm: 128, scale: 'C_MAJOR_A_MINOR', temperature: 0.9, topK: 28, guidance: 4.5 };
c.send({ type: 'open', ch: 1, sid: 52, prompts: [P('region B')], config: OPEN_B, play: true });
await c.until((m) => m.type === 'first_audio' && m.ch === 1 && m.sid === 52);
const RB = sessions[sessions.length - 1];
const kLive = LA.calls.length;
for (let i = 0; i < 6; i++) { c.send({ type: 'config', ch: 0, config: { density: 0.3 + i * 0.1, brightness: 0.4 + i * 0.05, muteDrums: i % 2 === 1 } }); await sleep(70); }
await sleep(120);
assert.ok(LA.calls.length > kLive, 'el live si recibe la config dinamica mientras el recall esta pre-calentado');
assert.deepEqual(RB.calls.map((x) => x[0]), ['prompts', 'config', 'play'], 'el recall pre-calentado solo tuvo prompts, config de apertura y play');
assert.deepEqual(RB.calls[1], ['config', OPEN_B], 'config de apertura intacta (sin density/brightness/muteDrums): el inicio es identico en cada visita');
c.send({ type: 'promote', from: 'recall' });
await c.until((m) => m.type === 'promoted' && m.sid === 52);
assert.deepEqual(RB.calls.map((x) => x[0]), ['prompts', 'config', 'play'], 'promote en si no manda config');
c.send({ type: 'config', ch: 0, config: { density: 0.42, muteDrums: false } });
await sleep(150);
assert.equal(RB.calls.length, 4);
assert.deepEqual(RB.calls[3], ['config', { ...OPEN_B, density: 0.42, muteDrums: false }], 'tras el promote la sesion de region si recibe la config dinamica, completa y con su seed');
assert.ok(LA.closed, 'el live viejo se cerro en el promote');
ok('recall pre-calentado: sin config dinamica antes del promote; despues del promote la recibe completa');

// sanitizeConfig: nombres camelCase del SDK, rangos y enums
const sc = sanitizeConfig({ temperature: 9, topK: 28.4, guidance: 4.5, density: 2, brightness: -1, bpm: 500, seed: 7.6, scale: 'G_MAJOR_E_MINOR', muteBass: true, muteDrums: false, onlyBassAndDrums: true, musicGenerationMode: 'DIVERSITY', extra: 1 });
assert.deepEqual(sc, { temperature: 3, topK: 28, guidance: 4.5, density: 1, brightness: 0, bpm: 200, seed: 8, scale: 'G_MAJOR_E_MINOR', muteBass: true, muteDrums: false, onlyBassAndDrums: true, musicGenerationMode: 'DIVERSITY' });
assert.equal(sanitizeConfig({ topK: 0 }).topK, 1); assert.equal(sanitizeConfig({ topK: 5000 }).topK, 1000);
assert.deepEqual(sanitizeConfig({ scale: 'H_MAJOR', musicGenerationMode: 'LOUD', muteDrums: 1, density: 'x', guidance: NaN }), {});
assert.deepEqual(sanitizeConfig(null), {});
ok('sanitizeConfig: topK, muteBass/muteDrums/onlyBassAndDrums, musicGenerationMode, scale (enum) con rangos');

// 10. cerrar el cliente cierra todo; maximo global
c.ws.close();
await sleep(150);
assert.equal(open, 0, 'sesiones abiertas tras desconectar: ' + open);
assert.ok(maxOpen <= 2);
ok('desconexion del cliente cierra todas las sesiones');

// 11. logs JSONL
const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.jsonl'));
assert.ok(files.length >= 1);
const names = new Set(fs.readFileSync(path.join(logDir, files[0]), 'utf8').trim().split('\n').map((l) => JSON.parse(l).name));
for (const e of ['open', 'first_audio', 'prompts', 'close', 'promote', 'rotate', 'error']) assert.ok(names.has(e), 'falta evento de log: ' + e);
ok('log JSONL con open/first_audio/prompts/close/promote/rotate/error');

// 12. HTTP: places.json
const res = await fetch(`http://127.0.0.1:${port}/places.json`);
assert.equal((await res.json()).places.length, 6);
ok('GET /places.json');

await app.close();
fs.rmSync(logDir, { recursive: true, force: true });
console.log(`${n} pruebas OK`);
