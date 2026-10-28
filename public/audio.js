// Reproductor de 2 canales (0 = live, 1 = recall) sobre Web Audio. PCM16 estereo 48 kHz. La logica de colas,
// retencion, tiempos y curvas esta en audio-core.js (pura, testeada en Node).
import { SAMPLE_RATE, ChannelQueue, crossfadePlan, promoteChannels } from './audio-core.js';

export class Player {
  constructor() {
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.chans = [this._makeChannel(1), this._makeChannel(0)];
    this.xfadeUntil = 0;
    this.level = 0;
    this._buf = new Float32Array(this.analyser.fftSize);
  }

  _makeChannel(gain) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    // filtro por canal: en un crossfade el que sale se "aleja" (se cierra a graves) y choca menos con el que entra
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 20000; f.Q.value = 0.7;
    g.connect(f); f.connect(this.master);
    return { q: new ChannelQueue(), gain: g, filter: f, sources: new Set(), lastGain: null };
  }

  resume() { return this.ctx.resume(); }
  suspend() { return this.ctx.suspend(); }
  setMasterGain(v, tc = 0.05) { const t = this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setTargetAtTime(v, t, tc); }
  ahead(ch) { return this.chans[ch].q.ahead(this.ctx.currentTime); }
  stats(ch) { const q = this.chans[ch].q; return { held: q.held, heldSec: q.heldSeconds, underruns: q.underruns, dropped: q.dropped, ahead: q.ahead(this.ctx.currentTime) }; }

  // arrayBuffer: PCM16 estereo intercalado little-endian (sin el byte de canal)
  push(ch, arrayBuffer) {
    const c = this.chans[ch];
    for (const plan of c.q.push(arrayBuffer, this.ctx.currentTime)) this._play(c, plan);
  }

  // Retener (true): los bloques del canal se guardan sin sonar. Soltar (false): suena desde el primer bloque retenido.
  hold(ch, on) {
    const c = this.chans[ch];
    if (on) { c.q.hold(); return; }
    for (const plan of c.q.release(this.ctx.currentTime)) this._play(c, plan);
  }

  _play(c, plan) {
    const { pcm, skip, startAt, duration, fadeIn, fadeOutPrevAt } = plan;
    const n = Math.round(duration * SAMPLE_RATE);
    const buffer = this.ctx.createBuffer(2, n, SAMPLE_RATE);
    const l = buffer.getChannelData(0), r = buffer.getChannelData(1);
    for (let i = 0; i < n; i++) { l[i] = pcm[2 * (i + skip)] / 32768; r[i] = pcm[2 * (i + skip) + 1] / 32768; }
    if (fadeOutPrevAt !== null && c.lastGain) {
      const fade = c.q.o.fade;
      c.lastGain.gain.setValueAtTime(1, Math.max(this.ctx.currentTime, fadeOutPrevAt - fade));
      c.lastGain.gain.linearRampToValueAtTime(0, fadeOutPrevAt);
    }
    if (fadeIn) {
      const fl = Math.min(n, Math.round(c.q.o.fade * SAMPLE_RATE));
      for (let i = 0; i < fl; i++) { const g = i / fl; l[i] *= g; r[i] *= g; }
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    src.connect(g); g.connect(c.gain);
    src.start(Math.max(startAt, this.ctx.currentTime));
    c.sources.add(src);
    src.onended = () => c.sources.delete(src);
    c.lastGain = g;
  }

  // Cancela lo agendado del canal y reinicia su programacion (p.ej. al reanudar de una pausa)
  reset(ch) {
    const c = this.chans[ch];
    for (const s of c.sources) { try { s.stop(); } catch { /* ya terminada */ } }
    c.sources.clear(); c.lastGain = null;
    c.q.reset(this.ctx.currentTime);
  }

  // Devuelve el canal a audible (gain 1, filtro abierto): tras recuperar una sesion muerta a mitad de un fade
  restore(ch) {
    const c = this.chans[ch], t = this.ctx.currentTime;
    c.gain.gain.cancelScheduledValues(t); c.gain.gain.setValueAtTime(1, t);
    c.filter.frequency.cancelScheduledValues(t); c.filter.frequency.setValueAtTime(20000, t);
  }

  // Equal-power: `from` baja a 0 y `to` sube a 1 en `ms`
  crossfade(from, to, ms = 1500) {
    const t = this.ctx.currentTime, plan = crossfadePlan(t, ms);
    const a = this.chans[from].gain.gain, b = this.chans[to].gain.gain;
    for (const [p, curve] of [[a, plan.outCurve], [b, plan.inCurve]]) {
      p.cancelScheduledValues(t); p.setValueAtTime(curve[0], t); p.setValueCurveAtTime(curve, t, plan.duration);
    }
    const fa = this.chans[from].filter.frequency, fb = this.chans[to].filter.frequency;
    fa.cancelScheduledValues(t); fa.setValueAtTime(fa.value, t); fa.exponentialRampToValueAtTime(400, plan.end);
    fb.cancelScheduledValues(t); fb.setValueAtTime(20000, t);
    this.xfadeUntil = plan.end;
  }

  // El recall pasa a ser live (el servidor lo avisa con `promoted`): intercambia canales; el viejo live queda vacio y mudo.
  promote() {
    const t = this.ctx.currentTime;
    const oldLive = this.chans[0]; // se descarta: para sus fuentes y lo desconecta
    for (const s of oldLive.sources) { try { s.stop(); } catch { /* ya terminada */ } }
    oldLive.sources.clear(); oldLive.gain.disconnect(); oldLive.filter.disconnect();
    this.chans = promoteChannels(this.chans, () => this._makeChannel(0));
    const live = this.chans[0].gain.gain;
    if (t >= this.xfadeUntil) { live.cancelScheduledValues(t); live.setValueAtTime(1, t); }
  }

  // Llamar una vez por frame
  updateLevel() {
    this.analyser.getFloatTimeDomainData(this._buf);
    let s = 0;
    for (let i = 0; i < this._buf.length; i++) s += this._buf[i] * this._buf[i];
    this.level += (Math.sqrt(s / this._buf.length) - this.level) * 0.15;
    return this.level;
  }
}
