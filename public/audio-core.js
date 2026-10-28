// Logica pura del reproductor (sin AudioContext): colas por canal, retencion (hold), programacion de tiempos,
// curvas de crossfade y promote. Los tiempos (now) se inyectan, asi se prueba en Node.
export const SAMPLE_RATE = 48000;
export const DEFAULTS = {
  jitter: 0.6,        // s de buffer antes de empezar a sonar
  rebuffer: 0.35,     // s de margen tras un underrun
  targetAhead: 0.7,   // s de audio agendado que se quiere mantener por delante
  dropAbove: 1.2,     // s: si lo agendado supera esto se recorta/descarta lo entrante hasta volver a targetAhead
  grace: 3,           // s tras un reset en los que no se descarta por colchon alto
  fade: 0.02,         // s: fade en las uniones de un recorte
  maxHeldSec: 60,     // tope de audio retenido por hold (lo que llegue despues se descarta; el inicio nunca se pierde)
  protectAfterRelease: 30, // s tras soltar en los que no se recorta (el inicio del tema suena entero); luego se recupera la latencia baja
};

// Curva equal-power: in = sin, out = cos. in^2 + out^2 = 1 en todo punto (potencia constante).
export function equalPowerGains(t) {
  const x = Math.min(1, Math.max(0, t));
  return { in: Math.sin(x * Math.PI / 2), out: Math.cos(x * Math.PI / 2) };
}
export function crossfadeCurves(points = 64) {
  const fin = new Float32Array(points), fout = new Float32Array(points);
  for (let i = 0; i < points; i++) { const g = equalPowerGains(i / (points - 1)); fin[i] = g.in; fout[i] = g.out; }
  return { in: fin, out: fout };
}
// Plan temporal de un crossfade
export function crossfadePlan(now, ms = 1500, points = 64) {
  const dur = Math.max(0.01, ms / 1000);
  return { start: now, end: now + dur, duration: dur, ...(({ in: i, out: o }) => ({ inCurve: i, outCurve: o }))(crossfadeCurves(points)) };
}

// Cola de un canal. push() devuelve la lista de "planes" a agendar: { pcm, skip, startAt, duration, fadeIn, fadeOutPrevAt }.
export class ChannelQueue {
  constructor(opts = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.held = false;
    this.heldChunks = [];     // Int16Array[] (en orden de llegada)
    this.heldFrames = 0;
    this.nextTime = 0;
    this.leftover = null;
    this.noDropUntil = 0;
    this.pendingFadeIn = false;
    this.underruns = 0; this.chunks = 0; this.bytes = 0; this.dropped = 0; this.droppedSec = 0; this.heldDropped = 0;
  }

  heldSecondsOf(chunks) { return chunks.reduce((a, c) => a + c.length / 2, 0) / SAMPLE_RATE; }
  get heldSeconds() { return this.heldFrames / SAMPLE_RATE; }
  ahead(now) { return this.nextTime ? Math.max(0, this.nextTime - now) : 0; }

  // Une bytes sueltos y devuelve Int16Array estereo intercalado (o null)
  ingest(arrayBuffer) {
    let bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
    if (this.leftover) {
      const joined = new Uint8Array(this.leftover.length + bytes.length);
      joined.set(this.leftover); joined.set(bytes, this.leftover.length);
      bytes = joined; this.leftover = null;
    }
    const usable = bytes.length - (bytes.length % 4);
    if (usable < bytes.length) this.leftover = bytes.slice(usable);
    if (!usable) return null;
    // copia alineada (el byteOffset de un subarray puede no ser multiplo de 2)
    const copy = new Uint8Array(usable); copy.set(bytes.subarray(0, usable));
    this.chunks++; this.bytes += usable;
    return new Int16Array(copy.buffer);
  }

  // Retener: los bloques se guardan sin reproducir (pre-calentado del recall)
  hold() { this.held = true; }

  push(arrayBuffer, now) {
    const pcm = this.ingest(arrayBuffer);
    if (!pcm) return [];
    if (this.held) {
      if (this.heldSeconds < this.o.maxHeldSec) { this.heldChunks.push(pcm); this.heldFrames += pcm.length / 2; } else this.heldDropped++;
      return [];
    }
    const plan = this.schedule(pcm, now);
    return plan ? [plan] : [];
  }

  // Soltar: reproduce DESDE EL PRIMER bloque retenido. Durante protectAfterRelease s no se recorta (descartar saltaria
  // el principio del tema, que es justo la "memoria"); despues el recorte normal recupera la latencia baja.
  release(now) {
    this.held = false;
    const chunks = this.heldChunks; this.heldChunks = []; this.heldFrames = 0;
    this.noDropUntil = now + this.heldSecondsOf(chunks) + this.o.protectAfterRelease;
    const plans = [];
    for (const pcm of chunks) { const p = this.schedule(pcm, now); if (p) plans.push(p); }
    return plans;
  }

  schedule(pcm, now) {
    const o = this.o, frames = pcm.length / 2;
    let skip = 0, fadeIn = false, fadeOutPrevAt = null;
    if (this.nextTime === 0) this.nextTime = now + o.jitter;
    else if (this.nextTime < now) { this.nextTime = now + o.rebuffer; this.underruns++; }
    else if (this.nextTime - now > o.dropAbove && now >= this.noDropUntil) {
      const excess = this.nextTime - now - o.targetAhead;
      const dur = frames / SAMPLE_RATE;
      this.dropped++;
      if (excess >= dur) { this.droppedSec += dur; this.pendingFadeIn = true; return null; }
      skip = Math.min(frames - 1, Math.round(excess * SAMPLE_RATE));
      this.droppedSec += skip / SAMPLE_RATE;
      fadeOutPrevAt = this.nextTime; fadeIn = true;
    }
    if (this.pendingFadeIn) { fadeIn = true; this.pendingFadeIn = false; }
    const duration = (frames - skip) / SAMPLE_RATE;
    const startAt = this.nextTime;
    this.nextTime += duration;
    return { pcm, skip, startAt, duration, fadeIn, fadeOutPrevAt };
  }

  // Reinicia la programacion (re-jitter); conserva el flag hold pero descarta lo retenido
  reset(now = 0) {
    this.heldChunks = []; this.heldFrames = 0;
    this.nextTime = 0; this.leftover = null; this.pendingFadeIn = true;
    this.noDropUntil = now + this.o.grace;
  }
}

// promote: el canal 1 pasa a ser el 0; el 1 queda libre (elemento fresco). Funcion pura sobre el array de canales.
export function promoteChannels(channels, makeFresh) {
  return [channels[1], makeFresh()];
}
