// Link directo: el navegador habla con Lyria RealTime usando la key del jugador (misma interfaz publica que ws.js).
// Reutiliza el nucleo puro (core.mjs); el SDK web de @google/genai viaja vendorizado (public/vendor/), porque su
// dist/web crudo tiene un import desnudo ('p-retry') que el navegador no puede resolver: se usa el build +esm de
// jsdelivr (2.29.1, misma version que package.json) con las dependencias reescritas a rutas locales. Sin respaldo
// por CDN a proposito: no se carga codigo de terceros con acceso a la key del jugador.
import { LyriaController } from './core.mjs';

export const SDK_URLS = [
  './vendor/genai-web.mjs', // unico origen: archivo local que viaja con public/ (funciona sin CDN, tambien bajo subruta)
];
export const MODEL = 'models/lyria-realtime-exp';

const b64ToBuf = (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };

export class LocalLink {
  constructor({ onAudio, onMessage, onDisconnect, key, rotateMs = 585000, sendIntervalMs = 150, sdkUrls = SDK_URLS, createSession = null }) {
    this.onAudio = onAudio;           // (ch, ArrayBuffer PCM16)
    this.onMessage = onMessage;       // (obj: status, first_audio, filtered, closed, promoted, rotate_soon, error)
    this.onDisconnect = onDisconnect; // (motivo)
    this.key = key;
    this.rotateMs = rotateMs;
    this.sendIntervalMs = sendIntervalMs;
    this.sdkUrls = sdkUrls;
    this.createSession = createSession; // inyectable en pruebas (en Node el import por URL no aplica)
    this.ctl = null;
    this.scrub = (x) => String(x ?? '').split(this.key).join('[key]'); // la key no sale en mensajes ni errores
  }

  async connect() {
    if (!this.createSession) {
      let GoogleGenAI, lastErr;
      for (const url of this.sdkUrls) {
        try {
          const m = await import(url);
          if (m?.GoogleGenAI) { GoogleGenAI = m.GoogleGenAI; break; }
          lastErr = new Error('el SDK no exporta GoogleGenAI');
        } catch (e) { lastErr = e; } // una URL caida no tumba la carga: se intenta la siguiente
      }
      if (!GoogleGenAI) {
        this.onDisconnect?.('no se pudo cargar el SDK de Google');
        throw lastErr ?? new Error('SDK no disponible'); // el cliente muestra el aviso via onDisconnect
      }
      const ai = new GoogleGenAI({ apiKey: this.key, httpOptions: { apiVersion: 'v1alpha' } }); // mismo patron que server.mjs
      this.createSession = (callbacks) => ai.live.music.connect({ model: MODEL, callbacks });
    }
    const transport = {
      send: (o) => this.onMessage?.(o),
      sendAudio: (ch, b64) => this.onAudio?.(ch, b64ToBuf(b64)),
    };
    const slog = { event() {}, writeBatch() {}, close() {} }; // sin servidor no hay log persistente
    this.ctl = new LyriaController(transport, slog, { connect: (cb) => this.createSession(cb), scrub: this.scrub, rotateMs: this.rotateMs, sendIntervalMs: this.sendIntervalMs });
  }

  // misma interfaz que Link; los {type:'log'} del logger se ignoran (no hay servidor que los guarde)
  send(obj) {
    if (!this.ctl || this.ctl.closed) return;
    if (obj?.type === 'log') return;
    this.ctl.handle(obj).catch((e) => this.ctl.err('fallo al manejar mensaje: ' + this.scrub(e?.message)));
  }

  close() { this.ctl?.close(); }
}
