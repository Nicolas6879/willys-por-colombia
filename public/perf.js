// Degradacion automatica de rendimiento (ESTILO.md seccion 5; puro, testeado). Se alimenta con el dt de cada frame.
// Media movil exponencial del frametime con histeresis: baja un nivel si supera `downMs` sostenido `downS` segundos; SUBE un nivel
// si queda bajo `upMs` sostenido `upS` segundos. Los primeros `warmupS` segundos tras empezar y tras cada `rewarm()` (cambio de
// pestana, pausa) no cuentan, ni los frames > 0.5 s. Si tras subir vuelve a bajar en < 20 s, no vuelve a subir en 60 s (anti-oscilacion).
export const QUALITY = [
  { density: 1, fogFar: 420, clouds: 1 },
  { density: 0.7, fogFar: 340, clouds: 0.75 },
  { density: 0.45, fogFar: 270, clouds: 0.5 },
  { density: 0.3, fogFar: 210, clouds: 0.35 },
];
export class Governor {
  constructor({ downMs = 18, downS = 3, upMs = 12, upS = 6, warmupS = 5, emaS = 0.5, maxLevel = QUALITY.length - 1 } = {}) {
    Object.assign(this, { downMs, downS, upMs, upS, warmupS, emaS, maxLevel });
    this.level = 0; this.age = 0; this.warm = warmupS; this.ema = 0; this.slowT = 0; this.fastT = 0; this.upAt = -1e9; this.noUpUntil = -1e9; this.lastAvgMs = 0;
  }
  rewarm() { this.warm = this.warmupS; this.slowT = this.fastT = 0; this.ema = 0; }
  // dt en segundos; devuelve el nuevo nivel si cambio, o null
  push(dt) {
    this.age += dt;
    if (dt > 0.5) { this.rewarm(); return null; } // pausa / pestana en segundo plano
    this.ema = this.ema ? this.ema + (dt - this.ema) * (1 - Math.exp(-dt / this.emaS)) : dt;
    this.lastAvgMs = this.ema * 1000;
    if (this.warm > 0) { this.warm -= dt; return null; }
    const ms = this.lastAvgMs;
    this.slowT = ms > this.downMs ? this.slowT + dt : 0;
    this.fastT = ms < this.upMs ? this.fastT + dt : 0;
    if (this.slowT >= this.downS && this.level < this.maxLevel) {
      if (this.age - this.upAt < 20) this.noUpUntil = this.age + 60;
      this.slowT = this.fastT = 0; this.ema = 0;
      return ++this.level;
    }
    if (this.fastT >= this.upS && this.level > 0 && this.age >= this.noUpUntil) {
      this.slowT = this.fastT = 0; this.upAt = this.age; this.ema = 0;
      return --this.level;
    }
    return null;
  }
  get quality() { return QUALITY[this.level]; }
}
