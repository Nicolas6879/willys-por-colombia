// Pruebas de local-link.js: el link directo navegador <-> Lyria con el nucleo puro y un SDK falso (sin red).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LocalLink, SDK_URLS } from './public/local-link.js';

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('ok -', name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// sesion falsa: registra cada llamada; los callbacks del core se disparan desde la prueba
const mkSession = () => ({
  calls: [],
  setWeightedPrompts(a) { this.calls.push(['setWeightedPrompts', a]); },
  setMusicGenerationConfig(a) { this.calls.push(['setMusicGenerationConfig', a]); },
  resetContext() { this.calls.push(['resetContext']); },
  play() { this.calls.push(['play']); },
  pause() { this.calls.push(['pause']); },
  close() { this.calls.push(['close']); },
});

// link con SDK inyectado: msgs = lo que el core manda al cliente; cbs = callbacks de cada connect
const mkLink = async (createSession) => {
  const msgs = [], audio = [], sessions = [], cbs = [];
  const link = new LocalLink({
    key: 'SECRET',
    onMessage: (m) => msgs.push(m),
    onAudio: (ch, buf) => audio.push([ch, buf]),
    onDisconnect: (why) => msgs.push({ type: 'disconnect', why }),
    rotateMs: 50,
    sendIntervalMs: 20,
    createSession: createSession || (async (cb) => { cbs.push(cb); const s = mkSession(); sessions.push(s); return s; }),
  });
  await link.connect();
  return { link, msgs, audio, sessions, cbs };
};

const openMsg = (ch, sid, play) => ({ type: 'open', ch, sid, prompts: [{ text: 'x', weight: 1 }], config: { seed: 5, bpm: 122 }, play });

await ok('open: connecting, prompts+config antes de play y luego playing', async () => {
  const { link, msgs, sessions } = await mkLink();
  link.send(openMsg(0, 1, true));
  assert.deepEqual(msgs[0], { type: 'status', ch: 0, state: 'connecting', sid: 1 });
  await sleep(10);
  assert.deepEqual(sessions[0].calls.map((c) => c[0]), ['setWeightedPrompts', 'setMusicGenerationConfig', 'play']);
  assert.deepEqual(sessions[0].calls[0][1], { weightedPrompts: [{ text: 'x', weight: 1 }] });
  assert.deepEqual(sessions[0].calls[1][1], { musicGenerationConfig: { seed: 5, bpm: 122 } });
  assert.ok(msgs.some((m) => m.type === 'status' && m.ch === 0 && m.state === 'playing' && m.sid === 1));
  link.close();
});

await ok('audio: los chunks del SDK llegan decodificados y con first_audio', async () => {
  const { link, msgs, audio, cbs } = await mkLink();
  link.send(openMsg(0, 1, true));
  await sleep(10);
  cbs[0].onmessage({ serverContent: { audioChunks: [{ data: 'AQIDBA==' }] } });
  assert.equal(audio.length, 1);
  assert.equal(audio[0][0], 0);
  assert.ok(audio[0][1] instanceof ArrayBuffer);
  assert.deepEqual([...new Uint8Array(audio[0][1])], [1, 2, 3, 4]);
  assert.ok(msgs.some((m) => m.type === 'first_audio' && m.ch === 0 && m.sid === 1));
  link.close();
});

await ok('prompts: coalescidos y aplicados tras el intervalo', async () => {
  const { link, sessions } = await mkLink();
  link.send(openMsg(0, 1, true));
  await sleep(10);
  link.send({ type: 'prompts', ch: 0, prompts: [{ text: 'tambora', weight: 3 }] });
  await sleep(80);
  const applied = sessions[0].calls.filter((c) => c[0] === 'setWeightedPrompts');
  assert.deepEqual(applied[applied.length - 1][1], { weightedPrompts: [{ text: 'tambora', weight: 3 }] });
  link.close();
});

await ok('limite: con 2 sesiones activas (conectando) un tercer open da error', async () => {
  const { link, msgs } = await mkLink();
  link.send(openMsg(0, 1, false));
  link.send(openMsg(1, 2, false));
  link.send(openMsg(0, 3, false)); // el live viejo aun conecta: cuenta como activa
  await sleep(10);
  const err = msgs.find((m) => m.type === 'error');
  assert.ok(err && /limite de 2 sesiones/.test(err.message), 'llega el error de limite');
  link.close();
});

await ok('promote: mensaje promoted, status closed del canal 1 y close del live viejo', async () => {
  const { link, msgs, sessions } = await mkLink();
  link.send(openMsg(0, 1, true));
  await sleep(10);
  link.send(openMsg(1, 2, false));
  await sleep(10);
  link.send({ type: 'promote', from: 'recall' });
  await sleep(10);
  assert.ok(msgs.some((m) => m.type === 'promoted' && m.from === 1 && m.ch === 0 && m.sid === 2));
  assert.ok(msgs.some((m) => m.type === 'status' && m.ch === 1 && m.state === 'closed'));
  assert.ok(sessions[0].calls.some((c) => c[0] === 'close'), 'el live viejo se cierra');
  link.close();
});

await ok('rotacion: tras rotateMs llega rotate_soon del canal 0', async () => {
  const { link, msgs } = await mkLink();
  link.send(openMsg(0, 1, true));
  await sleep(200);
  const r = msgs.find((m) => m.type === 'rotate_soon');
  assert.ok(r && r.ch === 0 && r.ageMs >= 0);
  link.close();
});

await ok('scrub: el error de conexion no filtra la key', async () => {
  const { link, msgs } = await mkLink(async () => { throw new Error('boom SECRET 123'); });
  link.send(openMsg(0, 1, true));
  await sleep(10);
  const err = msgs.find((m) => m.type === 'error');
  assert.ok(err, 'llega el error');
  assert.ok(!err.message.includes('SECRET'), 'sin la key');
  assert.ok(err.message.includes('[key]'), 'con [key]');
  link.close();
});

await ok('sdk vendorizado: autocontenido (sin /npm/ ni imports desnudos) y exporta GoogleGenAI', async () => {
  const dir = new URL('./public/vendor/', import.meta.url);
  const genai = fs.readFileSync(new URL('genai-web.mjs', dir), 'utf8');
  const pretry = fs.readFileSync(new URL('p-retry.mjs', dir), 'utf8');
  const retry = fs.readFileSync(new URL('retry.mjs', dir), 'utf8');
  for (const [name, src] of [['genai-web.mjs', genai], ['p-retry.mjs', pretry], ['retry.mjs', retry]]) {
    assert.ok(!src.includes('/npm/'), `${name}: sin rutas /npm/`);
    assert.ok(!/(?:from|import)\s*["'][^"'./]/.test(src), `${name}: sin specifiers desnudos`);
  }
  assert.ok(genai.includes('GoogleGenAI') && genai.includes('export{'), 'genai exporta GoogleGenAI');
  assert.ok(genai.includes('./p-retry.mjs'), 'genai importa el p-retry local');
  assert.ok(pretry.includes('./retry.mjs'), 'p-retry importa el retry local');
  assert.ok(genai.length > 300000, 'el bundle viaja completo');
  assert.equal(SDK_URLS[0], './vendor/genai-web.mjs', 'primero el archivo local');
  assert.deepEqual(SDK_URLS, ['./vendor/genai-web.mjs'], 'solo el vendor local, sin respaldo por CDN');
  assert.ok(SDK_URLS.every((u) => u.startsWith('./')), 'ninguna URL externa');
});

await ok('sdk: el mecanismo de varias URLs (inyectadas) cae a la siguiente si una falla', async () => {
  const broken = 'data:text/javascript,' + encodeURIComponent('throw new Error("cdn caido")');
  const fake = 'data:text/javascript,' + encodeURIComponent('export const GoogleGenAI = class { constructor() { this.live = { music: { connect: () => ({ setWeightedPrompts() {}, setMusicGenerationConfig() {}, resetContext() {}, play() {}, pause() {}, close() {} }) } }; } };');
  const msgs = [];
  const link = new LocalLink({
    key: 'SECRET', onMessage: (m) => msgs.push(m), onAudio: () => {}, onDisconnect: (why) => msgs.push({ type: 'disconnect', why }),
    sendIntervalMs: 20, sdkUrls: [broken, fake],
  });
  await link.connect();
  link.send(openMsg(0, 1, true));
  await sleep(10);
  assert.ok(msgs.some((m) => m.type === 'status' && m.ch === 0 && m.state === 'playing'), 'la sesion viva queda playing con el SDK de respaldo');
  link.close();
});

await ok('sdk: si todo falla, avisa por onDisconnect', async () => {
  const broken = 'data:text/javascript,' + encodeURIComponent('throw new Error("no va")');
  const msgs = [];
  const link = new LocalLink({
    key: 'SECRET', onMessage: (m) => msgs.push(m), onAudio: () => {}, onDisconnect: (why) => msgs.push({ type: 'disconnect', why }),
    sdkUrls: [broken, broken],
  });
  await assert.rejects(() => link.connect());
  const d = msgs.find((m) => m.type === 'disconnect');
  assert.equal(d?.why, 'no se pudo cargar el SDK de Google');
});

console.log(`\n${n} pruebas OK`);
