// Registro de sesion en JSONL: un archivo por conexion en logs/session-YYYYMMDD-HHMMSS.jsonl.
// Limite de tamano por archivo y solo se conservan los N mas recientes. Solo numeros y eventos (nunca la key).
import fs from 'node:fs';
import path from 'node:path';

const pad = (n) => String(n).padStart(2, '0');
export function stamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export class SessionLog {
  constructor({ dir, maxBytes = 20 * 1024 * 1024, keep = 20, now = () => new Date() } = {}) {
    this.dir = dir; this.maxBytes = maxBytes; this.keep = keep; this.now = now;
    this.fd = null; this.file = null; this.bytes = 0; this.full = false; this.closed = false;
    this.handsSeen = 0; this.thinned = false;
  }

  _open() {
    fs.mkdirSync(this.dir, { recursive: true });
    this.prune(this.keep - 1); // deja sitio para el nuevo
    let name = `session-${stamp(this.now())}.jsonl`, i = 1;
    while (fs.existsSync(path.join(this.dir, name))) name = `session-${stamp(this.now())}-${i++}.jsonl`;
    this.file = path.join(this.dir, name);
    this.fd = fs.openSync(this.file, 'a');
  }

  // conserva solo los `keep` archivos session-*.jsonl mas recientes (por nombre)
  prune(keep = this.keep) {
    try {
      const files = fs.readdirSync(this.dir).filter((f) => /^session-.*\.jsonl$/.test(f)).sort();
      for (const f of files.slice(0, Math.max(0, files.length - keep))) fs.unlinkSync(path.join(this.dir, f));
    } catch { /* sin carpeta aun */ }
  }

  write(obj) {
    if (this.closed || this.full || !obj || typeof obj !== 'object') return false;
    let line;
    try { line = JSON.stringify(obj); } catch { return false; }
    if (line.length > 200000) return false;
    line += '\n';
    // las muestras de manos (una por frame de inferencia) son lo mas voluminoso: al acercarse al limite se aclaran
    // (>70 %: 1 de cada 3; >90 %: ninguna) para que perf/audio/eventos sigan cabiendo
    if (obj.k === 'hands') {
      const f = this.bytes / this.maxBytes;
      if (f > 0.7) {
        if (!this.thinned) { this.thinned = true; this.event('hands_thinned', { atBytes: this.bytes }); }
        if (f > 0.9 || (this.handsSeen++ % 3) !== 0) return false;
      }
    }
    if (!this.fd) this._open();
    if (this.bytes + line.length > this.maxBytes) {
      this.full = true;
      fs.writeSync(this.fd, JSON.stringify({ k: 'ev', name: 'log_full', src: 'server', wall: Date.now() }) + '\n');
      return false;
    }
    fs.writeSync(this.fd, line);
    this.bytes += line.length;
    return true;
  }

  // evento del lado servidor
  event(name, data = {}) { return this.write({ k: 'ev', src: 'server', name, wall: Date.now(), ...data }); }

  // lote enviado por el cliente: {type:'log', entries:[...]}
  writeBatch(entries) {
    if (!Array.isArray(entries)) return 0;
    let n = 0;
    for (const e of entries.slice(0, 2000)) if (this.write(e)) n++;
    return n;
  }

  close() {
    this.closed = true;
    if (this.fd !== null) { try { fs.closeSync(this.fd); } catch { /* ya cerrado */ } this.fd = null; }
  }
}
