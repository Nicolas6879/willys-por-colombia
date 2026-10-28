// Musica reactiva a la velocidad (pura: sin DOM, audio ni reloj; el tiempo se inyecta).
// De la velocidad del carro salen targets de density / brightness (alrededor de una BASE que fijan la region y la seccion
// musical) y muteDrums (parado mas de ~2 s). Suavizado asimetrico tipo "Skuzic": sube en ~3 s, baja en ~6 s, evaluado ~1 vez/s.
// update() devuelve un parche de config {density, brightness, muteDrums} SOLO cuando hay que mandarlo (cambio > umbral y como
// mucho cada ~1.75 s) o null. Quien lo reciba lo manda como {type:'config', ch:0, config} (core.mjs fusiona y reenvia la config completa).
// Regla de oro: el parche va SOLO al canal live (0). Una sesion de region retenida o pre-calentandose (canal 1) NUNCA lo recibe: asi su
// inicio es identico en cada visita (misma seed + prompt + config = mismo audio). Tras el promote, resync() fuerza un envio.
export const RCFG = {
  vMax: 24,            // u/s: maxima en carretera (~24)
  baseDensity: 0.5, baseBrightness: 0.55, // base por defecto (un lugar/seccion puede fijar la suya)
  densityRange: 0.4,   // la velocidad mueve density +-0.2 alrededor de la base (parado = base-0.2, vMax = base+0.2) -> 0.3..0.7 con base 0.5
  brightnessRange: 0.3, // +-0.15 -> 0.4..0.7 con base 0.55
  lo: 0.05, hi: 0.95,  // limites absolutos (nunca 0 ni 1 del todo)
  stopSpeed: 1.0,      // por debajo: "parado o casi parado"
  moveSpeed: 2.5,      // por encima: ya se mueve (histeresis para quitar el mute)
  muteAfterMs: 2000,   // parado esto -> muteDrums
  riseMs: 3000, fallMs: 6000, // tiempos de subida / bajada del suavizado
  evalMs: 1000,        // el target se reevalua ~1 vez/s
  sendDelta: 0.05,     // umbral de cambio para mandar
  sendMinMs: 1750,     // y como mucho cada esto
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (v) => Math.round(v * 100) / 100;

// Targets instantaneos para una velocidad y una base ({density, brightness}). f = 0 parado .. 1 a velocidad maxima.
export function speedTargets(speed, base = {}, cfg = RCFG) {
  const f = clamp((Number.isFinite(speed) ? speed : 0) / cfg.vMax, 0, 1);
  const bd = Number.isFinite(base.density) ? base.density : cfg.baseDensity;
  const bb = Number.isFinite(base.brightness) ? base.brightness : cfg.baseBrightness;
  return {
    density: clamp(bd + (f - 0.5) * cfg.densityRange, cfg.lo, cfg.hi),
    brightness: clamp(bb + (f - 0.5) * cfg.brightnessRange, cfg.lo, cfg.hi),
  };
}

export class ReactiveMusic {
  constructor(cfg = {}) {
    this.cfg = { ...RCFG, ...cfg };
    this.reset();
  }
  reset() {
    this.cur = null;          // valores suavizados {density, brightness}
    this.sent = null;         // ultimo parche mandado {density, brightness, muteDrums} (null = nada mandado a la sesion actual)
    this.muteDrums = false;
    this.stoppedSince = null;
    this.lastEval = -1e9;
    this.lastSend = -1e9;
    this.lastEvalSpeed = 0;
  }
  // Una sesion live nueva (promote de region, rotacion, reapertura) no tiene la config dinamica: el siguiente update la manda (respetando sendMinMs).
  resync() { this.sent = null; }
  // Valores a incluir en el `open` de una sesion live nueva (rotacion / reapertura); {} si aun no hay estado.
  current() {
    if (!this.cur) return {};
    return { density: r2(this.cur.density), brightness: r2(this.cur.brightness), muteDrums: this.muteDrums };
  }
  // Para marcar que una sesion nueva ya arranco con current() (no hace falta reenviar hasta que cambie)
  markSent() { this.sent = this.cur ? { ...this.current() } : null; }

  update({ now, speed, base = {}, enabled = true }) {
    const c = this.cfg;
    if (!enabled) { this.stoppedSince = null; return null; }
    // muteDrums: parado > muteAfterMs; se quita en cuanto se mueve de verdad (histeresis stopSpeed/moveSpeed)
    if (speed < c.stopSpeed) { this.stoppedSince ??= now; if (now - this.stoppedSince >= c.muteAfterMs) this.muteDrums = true; }
    else if (speed >= c.moveSpeed) { this.stoppedSince = null; this.muteDrums = false; }
    this.lastEvalSpeed = speed;
    // suavizado: ~1 evaluacion por segundo
    const dt = now - this.lastEval;
    if (dt >= c.evalMs) {
      const tg = speedTargets(speed, base, c);
      if (!this.cur) this.cur = { ...tg };
      else {
        const step = Math.min(dt, 4000); // tras una pausa larga no se acumula
        for (const k of ['density', 'brightness']) {
          const tau = (tg[k] > this.cur[k] ? c.riseMs : c.fallMs) / 3; // ~95% del salto en riseMs / fallMs
          this.cur[k] += (tg[k] - this.cur[k]) * (1 - Math.exp(-step / tau));
        }
      }
      this.lastEval = now;
    }
    if (!this.cur) return null;
    const out = { density: r2(this.cur.density), brightness: r2(this.cur.brightness), muteDrums: this.muteDrums };
    if (now - this.lastSend < c.sendMinMs) return null;
    const s = this.sent;
    if (s && Math.abs(out.density - s.density) <= c.sendDelta && Math.abs(out.brightness - s.brightness) <= c.sendDelta && out.muteDrums === s.muteDrums) return null;
    this.sent = out; this.lastSend = now;
    return out;
  }
}
