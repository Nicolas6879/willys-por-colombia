// Registro de sesion del cliente (solo numeros y eventos; nunca video ni imagenes). Acumula entradas y las envia
// en lote por el WebSocket cada ~2 s ({type:'log', entries:[...]}); sin conexion las guarda en memoria (max 5000).
// Formato de cada entrada: { k: 'perf'|'audio'|'ev'|'lat'..., t: ms desde el inicio, ...datos }.
const r3 = (v) => Math.round(v * 1000) / 1000;

export class Logger {
  constructor({ send, now = () => performance.now(), max = 5000, flushMs = 2000, batch = 400 } = {}) {
    this.send = send;           // (obj) => boolean (true si se envio)
    this.now = now;
    this.max = max; this.flushMs = flushMs; this.batch = batch;
    this.entries = [];
    this.dropped = 0;
    this.paused = false;
    this.timer = null;
    this.t0 = now();
    this._sendT = null;         // instante del ultimo envio de pesos, para medir cuando llega el siguiente audio
  }

  get recording() { return !this.paused; }

  start() { if (!this.timer) this.timer = setInterval(() => this.flush(), this.flushMs); }
  stop() { clearInterval(this.timer); this.timer = null; this.flush(); }
  setPaused(p) { this.paused = p; this.event(p ? 'log_paused' : 'log_resumed', {}, true); return this.paused; }
  toggle() { return this.setPaused(!this.paused); }

  _t() { return r3((this.now() - this.t0) / 1000); } // segundos

  log(k, data = {}, force = false) {
    if (this.paused && !force) return;
    this.entries.push({ k, t: this._t(), ...data });
    if (this.entries.length > this.max) {
      const over = this.entries.length - this.max;
      this.entries.splice(0, over);
      this.dropped += over;
    }
  }
  event(name, data = {}, force = false) { this.log('ev', { name, ...data }, force); }

  // Latencia estimada: tiempo entre enviar pesos/config a Lyria y la llegada del siguiente chunk de audio
  noteSend() { if (this._sendT === null) this._sendT = this.now(); }
  noteAudio() {
    if (this._sendT === null) return;
    this.log('lat', { ms: Math.round(this.now() - this._sendT) });
    this._sendT = null;
  }

  flush() {
    while (this.entries.length) {
      const entries = this.entries.slice(0, this.batch);
      if (!this.send({ type: 'log', entries })) return; // sin conexion: se queda en memoria
      this.entries.splice(0, entries.length);
    }
  }
}
