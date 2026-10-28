// Prueba real contra Lyria (NO forma parte de npm test): server en PORT 3002, live (Caribe) + recall (Medellin seed 11).
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const PORT = 3002;
const places = Object.fromEntries(JSON.parse(fs.readFileSync(new URL('./public/places.json', import.meta.url), 'utf8')).places.map((p) => [p.id, p]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const portOpen = () => new Promise((res) => { const s = net.connect(PORT, '127.0.0.1'); s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });

let child = null;
const finish = (code, msg) => { if (msg) console[code ? 'error' : 'log'](msg); if (child) child.kill(); setTimeout(() => process.exit(code), 300); };
const T0 = Date.now();
const guard = setTimeout(() => finish(1, 'FALLO: timeout global de 40 s'), 40000);

if (await portOpen()) finish(1, 'FALLO: el puerto 3002 ya esta ocupado; no lo toco');
child = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('.', import.meta.url)), stdio: 'ignore', env: { ...process.env, PORT: String(PORT) } });
child.on('error', (e) => { console.error('no se pudo arrancar el servidor:', e.message); process.exit(1); });
for (let i = 0; i < 40 && !(await portOpen()); i++) await sleep(150);
if (!(await portOpen())) finish(1, 'FALLO: el servidor no arranco');

const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
const msgs = [], bytesByCh = [0, 0], badFrames = [];
ws.on('error', (e) => finish(1, 'FALLO ws: ' + e.message));
ws.on('message', (d, bin) => {
  if (bin) { if (d[0] > 1 || (d.length - 1) % 4) badFrames.push([d[0], d.length]); else bytesByCh[d[0]] += d.length - 1; return; }
  msgs.push(JSON.parse(d.toString()));
});
const until = async (pred, ms, what) => { const t = Date.now(); while (Date.now() - t < ms) { const m = msgs.find(pred); if (m) return m; await sleep(25); } throw new Error('timeout: ' + what + ' | ultimos: ' + JSON.stringify(msgs.slice(-5))); };
await new Promise((r) => ws.on('open', r));

try {
  const send = (o) => ws.send(JSON.stringify(o));
  const cfg = (p) => ({ seed: p.seed, ...(p.bpm ? { bpm: p.bpm } : {}) });
  send({ type: 'open', ch: 0, prompts: [{ text: places.caribe.prompt, weight: 1 }], config: cfg(places.caribe), play: true });
  const f0 = await until((m) => m.type === 'first_audio' && m.ch === 0, 20000, 'first_audio canal 0');
  console.log('first_audio live (ch0):', f0.ms, 'ms');
  send({ type: 'open', ch: 'recall', prompts: [{ text: places.medellin.prompt, weight: 1 }], config: cfg(places.medellin), play: true });
  const f1 = await until((m) => m.type === 'first_audio' && m.ch === 1, 20000, 'first_audio canal 1');
  console.log('first_audio recall (ch1):', f1.ms, 'ms');
  await sleep(2500);
  if (msgs.some((m) => m.type === 'error')) throw new Error('error del servidor: ' + JSON.stringify(msgs.find((m) => m.type === 'error')));
  if (badFrames.length) throw new Error('frames con byte de canal/tamano invalido: ' + JSON.stringify(badFrames.slice(0, 3)));
  if (!bytesByCh[0] || !bytesByCh[1]) throw new Error('faltan bytes en un canal: ' + bytesByCh);
  console.log('bytes (s de audio) ch0:', (bytesByCh[0] / 192000).toFixed(1), 'ch1:', (bytesByCh[1] / 192000).toFixed(1));
  send({ type: 'close', ch: 0 }); send({ type: 'close', ch: 1 });
  await until((m) => m.type === 'closed' && m.ch === 0, 5000, 'closed 0');
  await until((m) => m.type === 'closed' && m.ch === 1, 5000, 'closed 1');
  ws.close();
  clearTimeout(guard);
  const total = (Date.now() - T0) / 1000;
  if (total > 40) throw new Error('tardo mas de 40 s: ' + total);
  finish(0, `OK test-real en ${total.toFixed(1)} s`);
} catch (e) {
  finish(1, 'FALLO: ' + (e?.message || e));
}
