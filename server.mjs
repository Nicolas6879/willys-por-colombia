// Arranque real: carga la key del .env (manda sobre la variable de entorno) y conecta a Lyria RealTime.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import { createServer } from './server-core.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
function readKey() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const k = (raw.match(/^\s*GEMINI_API_KEY\s*=\s*(.*)$/m)?.[1] || '').trim().replace(/^["']|["']$/g, '');
    if (k) return k;
  } catch { /* sin .env */ }
  return process.env.GEMINI_API_KEY || '';
}
const API_KEY = readKey();
if (!API_KEY) { console.error('Falta GEMINI_API_KEY en .env'); process.exit(1); }

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;
const ROTATE_MS = Number(process.env.ROTATE_MS) || 585000;
const MODEL = 'models/lyria-realtime-exp';
const ai = new GoogleGenAI({ apiKey: API_KEY, httpOptions: { apiVersion: 'v1alpha' } });
const scrub = (x) => String(x ?? '').split(API_KEY).join('[key]').slice(0, 200); // nunca la key en logs ni mensajes
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const app = createServer({ connect: (callbacks) => ai.live.music.connect({ model: MODEL, callbacks }), scrub, rotateMs: ROTATE_MS, log });
await app.listen(PORT, HOST);
log(`Mapa Lyria en http://${HOST}:${PORT} (rotacion a ${ROTATE_MS} ms)`);
const shutdown = () => app.close().then(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
