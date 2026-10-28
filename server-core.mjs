// Adaptador Node del nucleo: HTTP estatico + WebSocket que maneja hasta 2 sesiones Lyria por cliente, nombradas
// por CANAL (0 = live, 1 = recall). La maquina de estados vive en public/core.mjs (pura, fuente unica); aqui solo va el transporte.
// La conexion real a Lyria se inyecta (connect), asi se prueba con un mock.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { SessionLog } from './session-log.mjs';
import { LyriaController } from './public/core.mjs';

export { parseCh, sanitizeConfig, sanitizePrompts } from './public/core.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

export function createServer({
  connect, scrub = (x) => String(x ?? '').slice(0, 200), rotateMs = 585000, rotateDeferMs = 1000, sendIntervalMs = 150,
  logDir = path.join(ROOT, 'logs'), publicDir = path.join(ROOT, 'public'), placesFile = path.join(ROOT, 'public', 'places.json'), log = () => {},
} = {}) {
  if (typeof connect !== 'function') throw new Error('createServer necesita connect(callbacks)');
  const opts = { connect, scrub, rotateMs, rotateDeferMs, sendIntervalMs };

  const server = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.writeHead(400).end(); return; }
    const send = (file) => fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end('No encontrado'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
    if (rel === '/places.json') return send(placesFile);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(publicDir, rel));
    if (!file.startsWith(publicDir + path.sep)) { res.writeHead(403).end(); return; }
    send(file);
  });

  const wss = new WebSocketServer({
    server, path: '/ws',
    // evita que otras webs abiertas en el navegador usen tu key via localhost
    verifyClient: ({ origin }) => !origin || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin),
  });
  let active = null; // un solo cliente activo: el nuevo reemplaza al anterior (respeta el limite de 2 sesiones por key)
  wss.on('connection', (ws) => {
    if (active) { active.ctl.close(); active.ws.close(1000, 'reemplazado'); }
    const slog = new SessionLog({ dir: logDir });
    const transport = {
      send: (obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); },
      sendAudio: (ch, b64) => { if (ws.readyState === 1) ws.send(Buffer.concat([Buffer.from([ch]), Buffer.from(b64, 'base64')]), { binary: true }); },
    };
    const ctl = new LyriaController(transport, slog, opts);
    active = { ws, ctl };
    slog.event('client_connected');
    log('cliente conectado');
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg?.type === 'log') { slog.writeBatch(msg.entries); return; }
      ctl.handle(msg).catch((e) => ctl.err('fallo al manejar mensaje: ' + scrub(e?.message)));
    });
    ws.on('close', () => {
      ctl.close();
      slog.event('client_disconnected');
      slog.close();
      if (active?.ws === ws) active = null;
      log('cliente desconectado');
    });
  });

  return {
    server, wss,
    listen: (port, host = '127.0.0.1') => new Promise((res, rej) => { server.once('error', rej); server.listen(port, host, () => res(server.address().port)); }),
    close: () => new Promise((res) => {
      active?.ctl.close();
      for (const c of wss.clients) c.terminate();
      wss.close(() => server.close(() => res()));
    }),
  };
}
