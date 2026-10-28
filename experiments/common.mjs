import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'experiments', 'out');
fs.mkdirSync(OUT, { recursive: true });
const req = createRequire(path.join(ROOT, 'package.json'));
const { GoogleGenAI } = await import(pathToFileURL(req.resolve('@google/genai')).href);
function readKey() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const k = (raw.match(/^\s*GEMINI_API_KEY\s*=\s*(.*)$/m)?.[1] || '').trim().replace(/^["']|["']$/g, '');
    if (k) return k;
  } catch { /* */ }
  return process.env.GEMINI_API_KEY || '';
}
const KEY = readKey();
export const scrub = KEY ? (x) => String(x ?? '').split(KEY).join('[key]').slice(0, 300) : (x) => String(x ?? '').slice(0, 300);
export const ai = new GoogleGenAI({ apiKey: KEY, httpOptions: { apiVersion: 'v1alpha' } });
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const SRATE = 48000;
// Session that accumulates PCM. pos() = seconds of audio received so far.
export async function open(extra = {}) {
  const chunks = []; let bytes = 0;
  const st = { t0: Date.now(), firstAudioMs: null, closed: null, err: null };
  const session = await ai.live.music.connect({
    model: 'models/lyria-realtime-exp',
    callbacks: {
      onmessage: (msg) => {
        const c = msg.serverContent?.audioChunks;
        if (c) {
          for (const a of c) { const b = Buffer.from(a.data, 'base64'); if (!extra.noStore) chunks.push(b); bytes += b.length; }
          if (st.firstAudioMs === null) st.firstAudioMs = Date.now() - st.t0;
        }
        extra.onMsg?.(msg, bytes, !!c);
      },
      onerror: (e) => { st.err = scrub(e?.message || e); extra.onError?.(e); },
      onclose: (e) => { st.closed = { code: e?.code, reason: scrub(e?.reason), at: Date.now() }; extra.onClose?.(e); },
    },
  });
  return { session, st, pos: () => bytes / (SRATE * 4), buf: () => Buffer.concat(chunks), bytes: () => bytes };
}
// wait until s more seconds of audio have arrived
export async function record(h, s) {
  const target = h.pos() + s, t = Date.now();
  while (h.pos() < target && !h.st.closed && Date.now() - t < (s + 40) * 1000) await sleep(50);
}
export const P = (text, weight = 1) => ({ text, weight });
export const prompts = (session, list) => session.setWeightedPrompts({ weightedPrompts: list });
export const config = (session, c) => session.setMusicGenerationConfig({ musicGenerationConfig: c });
