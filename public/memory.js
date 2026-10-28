// Logica pura del mapa (sin DOM ni audio; tiempos y estado inyectados): pesos de mezcla por cercania,
// pre-calentado del recall, entrada/salida de lugares y "olvido" del live. update() devuelve ACCIONES para main.js/game.js:
//   {type:'livePrompts', prompts:[{text,weight}]} | {type:'prewarm', placeId} | {type:'cancelPrewarm'}
//   {type:'enter', placeId, memory} | {type:'leave', placeId}
// main.js avisa con notifyPromoted(placeId|null) cuando llega `promoted` y con notifyRotation() al abrir una rotacion.
import { SECTION_CFG, sectionIndex, sectionText, sectionWeight, sectionShift } from './sections.js';
import { RCFG } from './reactive.js';
// misma config en live y recall: la seed reproduce igual en cada visita. Menos azar: temperatura 0.9, topK 28, guidance 4.5.
export const LIVE_CONFIG = { temperature: 0.9, topK: 28, guidance: 4.5 };
// config de apertura de un lugar (live o recall): seed + bpm + scale del lugar + LIVE_CONFIG. Se fijan ANTES de play() (bpm/scale solo asi o con resetContext).
// Nunca lleva density/brightness/muteDrums: eso es dinamico y solo se manda al live (reactive.js), para que el inicio del recall sea identico.
export const placeConfig = (p) => ({ seed: p.seed, ...(p.bpm ? { bpm: p.bpm } : {}), ...(p.scale ? { scale: p.scale } : {}), ...LIVE_CONFIG });
// bpm/scale del lugar (sin seed) para sesiones sin seed: rotacion y reapertura del live
export const tempoConfig = (p) => ({ ...LIVE_CONFIG, ...(p?.bpm ? { bpm: p.bpm } : {}), ...(p?.scale ? { scale: p.scale } : {}) });

export const MCFG = {
  p: 4,                 // exponente de cercania: peso ~ 1/d^p
  solo: 0.85,           // si el mas cercano pesa >= esto, se manda solo (peso 1)
  minWeight: 0.05,      // pesos menores se descartan
  sendMinMs: 700,       // maximo un envio de livePrompts cada ~700 ms
  sendDelta: 0.08,      // y solo si cambia el set de lugares o algun peso cambia mas que esto
  settleMs: 1500,       // coalesce: si el estado final difiere (> settleDelta) de lo ultimo enviado, se manda igual al vencer esto desde el ultimo envio
  settleDelta: 0.01,    // (el ULTIMO estado de la rampa nunca se descarta, aunque el salto final sea menor que sendDelta)
  minSpeed: 0.3,        // con teclado: velocidad minima (fraccion de `speed`) para contar el rumbo
  heading: 0.9,         // con teclado: cos minimo entre la velocidad y el vector al lugar
  speed: 0.7,           // velocidad normal del orbe (unidades/s)
  maxHoldMs: 10000,     // recall retenido sin entrar mas de esto -> cancelar
  cooldownMs: 3000,     // tras cancelar, no volver a pre-calentar durante esto
  leaveMargin: 0.05,    // histeresis del radio interior
  outerMargin: 0.1,     // histeresis del radio exterior
  handoverTimeoutMs: 30000, // seguro por si main nunca avisa del promote
  // modo mundo 3D (se activa pasando `approach` a update): prewarm por tiempo de llegada
  prewarmEtaSec: 5,     // si entras en <= esto por una carretera (o rumbo directo) que va a la region -> prewarm
  minDriveSpeed: 3,     // por debajo (frenando/parado) se cancela el prewarm
  awayGraceMs: 1500,    // un prewarm solo se cancela por alejarse si lleva este tiempo sin ir hacia la region
  forgetMs: 0,          // el live olvida su lugar tras este tiempo fuera del radio exterior (0 = al salir)
  sections: false,      // secciones musicales dentro de la region (sections.js; los lugares llevan `sections: [s0, s1]`)
  sectionCfg: SECTION_CFG,
};

const free = (s) => !s || s === '-' || String(s).startsWith('closed');
const live = (s) => s === 'playing' || s === 'ready';

export class MemoryController {
  // places: [{id, prompt, x, y, inner, outer}]
  constructor(places, cfg = {}) {
    this.cfg = { ...MCFG, ...cfg };
    this.places = places;
    this.byId = Object.fromEntries(places.map((p) => [p.id, p]));
    this.livePlace = null;     // lugar cuya seed lleva la sesion live (null = olvidado / sin lugar)
    this.current = null;       // lugar en cuyo radio interior esta el orbe
    this.enterPending = false;
    this.prewarm = null;       // { placeId, since }
    this.handover = null;      // { placeId|null (rotacion), since }
    this.lastSent = null;      // [{id, w}]
    this.lastSendT = -1e9;
    this.cancelAt = -1e9;
    this.memoryOn = true;
    this.liveSince = null;     // instante en que arranco el tema del live (promote / inicio); se fija en el primer update con live listo
    this.enterAt = null;       // instante en que entraste a la region actual (Memoria=no cuenta las secciones desde aqui)
    this.section = -1;         // seccion secundaria activa (-1 = solo base)
    this.base = { density: RCFG.baseDensity, brightness: RCFG.baseBrightness }; // base musical (lugar mas cercano + desplazamiento de la seccion)
  }

  // Base de density/brightness: promedio por peso de los lugares de la mezcla (cada lugar puede definir density/brightness) mas el
  // desplazamiento de la seccion activa. La reactividad a la velocidad modula alrededor de esto.
  baseFor(ws, section = null) {
    let d = 0, b = 0, sw = 0;
    for (const t of ws) {
      if (String(t.id).includes('#')) continue;
      const pl = this.byId[t.id];
      d += (pl?.density ?? RCFG.baseDensity) * t.w; b += (pl?.brightness ?? RCFG.baseBrightness) * t.w; sw += t.w;
    }
    if (!sw) return { density: RCFG.baseDensity, brightness: RCFG.baseBrightness };
    const sh = sectionShift(section);
    return { density: d / sw + sh.density, brightness: b / sw + sh.brightness };
  }

  dist(p, pos) { return Math.hypot(pos.x - p.x, pos.y - p.y); }

  // Pesos afilados: solo los 2 mas cercanos. -> [{id, w}] normalizados
  weightsAt(pos) {
    const { p, solo, minWeight } = this.cfg;
    const raw = this.places.map((pl) => ({ id: pl.id, v: 1 / Math.pow(Math.max(this.dist(pl, pos), pl.inner * 0.5, 1e-3), p) }));
    raw.sort((a, b) => b.v - a.v);
    const top = raw.slice(0, 2), sum = top[0].v + top[1].v;
    let w = top.map((t) => ({ id: t.id, w: t.v / sum }));
    if (w[0].w >= solo) return [{ id: w[0].id, w: 1 }];
    w = w.filter((t) => t.w >= minWeight);
    const s = w.reduce((a, t) => a + t.w, 0);
    return w.map((t) => ({ id: t.id, w: +(t.w / s).toFixed(3) }));
  }

  // ids 'cali#1' = seccion 1 de cali (sections.js)
  toPrompts(ws) {
    return ws.map((t) => {
      const [id, k] = String(t.id).split('#'), pl = this.byId[id];
      return { text: k == null ? pl.prompt : sectionText(pl.sections[+k]), weight: t.w };
    });
  }

  // El live pasa a ser la sesion con la seed del lugar (inicio o promote de una entrada)
  setLive(placeId) { this.livePlace = placeId; this.liveSince = null; this.lastSent = placeId ? [{ id: placeId, w: 1 }] : null; }
  notifyRotation(now = 0) { this.handover = { placeId: null, since: now }; this.prewarm = null; }
  notifyPromoted(placeId = null) {
    const entered = this.handover?.placeId ?? placeId;
    this.handover = null;
    if (entered) this.setLive(entered); else this.lastSent = null; // rotacion: reenviar la mezcla actual
  }
  notifyAbort() { this.handover = null; this.prewarm = null; }

  get phase() { return this.handover ? 'handover' : this.prewarm ? 'prewarm' : 'idle'; }
  // Progreso 0..1 del pre-calentado para el halo (0 si no hay)
  prewarmProgress(pos) {
    const pl = this.prewarm && this.byId[this.prewarm.placeId];
    if (!pl) return 0;
    return Math.min(1, Math.max(0, 1 - (this.dist(pl, pos) - pl.inner) / (pl.outer - pl.inner)));
  }
  getState() { return { base: this.base, section: this.section, current: this.current, livePlace: this.livePlace, phase: this.phase, prewarm: this.prewarm?.placeId ?? null, handover: this.handover?.placeId ?? null }; }

  // target: destino del clic-para-ir ({x,y}) o null (teclado)
  // approach (opcional, mundo 3D): { [placeId]: { toward, eta } } y speed -> prewarm por ETA (ver approach.js) en vez de los radios exteriores
  update({ now, pos, vel = { x: 0, y: 0 }, target = null, memoryOn = true, chans = {}, approach = null, speed = 0 }) {
    const c = this.cfg, out = [];
    const L = chans.live || {}, R = chans.recall || {};
    if (!memoryOn && this.prewarm) { out.push({ type: 'cancelPrewarm', reason: 'memory_off' }); this.prewarm = null; this.cancelAt = now; }
    if (this.handover && now - this.handover.since > c.handoverTimeoutMs) this.handover = null;

    // 1. radio interior (con histeresis de salida)
    let cur = this.current;
    if (cur && this.dist(this.byId[cur], pos) > this.byId[cur].inner + c.leaveMargin) { out.push({ type: 'leave', placeId: cur }); cur = null; this.enterPending = false; }
    if (!cur) {
      const inside = this.places.filter((pl) => this.dist(pl, pos) < pl.inner).sort((a, b) => this.dist(a, pos) - this.dist(b, pos))[0];
      if (inside) { cur = inside.id; this.enterPending = true; this.enterAt = now; }
    }
    this.current = cur;

    // 2. el live olvida su lugar tras forgetMs fuera del radio exterior (evita que rondar el borde reinicie el tema)
    if (this.livePlace && this.dist(this.byId[this.livePlace], pos) > this.byId[this.livePlace].outer) {
      if (this.leftLiveAt == null) this.leftLiveAt = now;
      if (now - this.leftLiveAt >= c.forgetMs) { this.livePlace = null; this.leftLiveAt = null; }
    } else this.leftLiveAt = null;

    if (!live(L.state)) return out; // sin live no hay nada que mezclar ni entrar (main abre el live)
    if (this.livePlace && this.liveSince == null) this.liveSince = now; // el tema del live arranca ahora

    // 3. entrada
    let forced = null;
    if (cur && this.enterPending) {
      if (!memoryOn) {
        out.push({ type: 'enter', placeId: cur, memory: false }); forced = [{ id: cur, w: 1 }]; this.enterPending = false;
      } else if (this.livePlace === cur) {
        out.push({ type: 'enter', placeId: cur, memory: false, reason: 'already_live' }); this.enterPending = false;
      } else if (!this.handover) {
        if (this.prewarm && this.prewarm.placeId !== cur) out.push({ type: 'cancelPrewarm', reason: 'other_place' });
        out.push({ type: 'enter', placeId: cur, memory: true });
        this.prewarm = null; this.handover = { placeId: cur, since: now }; this.enterPending = false;
      } // si hay handover en curso, queda pendiente hasta el promote
    }

    // 4. pre-calentado
    if (this.prewarm) {
      const pl = this.byId[this.prewarm.placeId];
      const held = Number.isFinite(R.heldMs) && R.placeId === pl.id ? R.heldMs : now - this.prewarm.since;
      if (approach) {
        const ap = approach[pl.id];
        if (speed < c.minDriveSpeed) { out.push({ type: 'cancelPrewarm', reason: 'stopped' }); this.prewarm = null; this.cancelAt = now; }
        else if (!ap || !ap.toward) {
          this.prewarm.awaySince ??= now;
          if (now - this.prewarm.awaySince >= c.awayGraceMs) { out.push({ type: 'cancelPrewarm', reason: 'moved_away' }); this.prewarm = null; this.cancelAt = now; }
        }
        else if (held > c.maxHoldMs) { out.push({ type: 'cancelPrewarm', reason: 'held_too_long' }); this.prewarm = null; this.cancelAt = now; }
        if (this.prewarm && ap && ap.toward) this.prewarm.awaySince = null;
      } else if (this.dist(pl, pos) > pl.outer + c.outerMargin) { out.push({ type: 'cancelPrewarm', reason: 'left_outer' }); this.prewarm = null; this.cancelAt = now; }
      else if (held > c.maxHoldMs) { out.push({ type: 'cancelPrewarm', reason: 'held_too_long' }); this.prewarm = null; this.cancelAt = now; }
    } else if (approach) {
      if (memoryOn && !this.handover && !cur && free(R.state) && now - this.cancelAt >= c.cooldownMs && speed >= c.minDriveSpeed) {
        let best = null;
        for (const pl of this.places) {
          const ap = approach[pl.id];
          if (pl.id === this.livePlace || !ap || !ap.toward || ap.eta > c.prewarmEtaSec) continue;
          if (!best || ap.eta < best.eta) best = { id: pl.id, eta: ap.eta };
        }
        if (best) { this.prewarm = { placeId: best.id, since: now }; out.push({ type: 'prewarm', placeId: best.id }); }
      }
    } else if (memoryOn && !this.handover && !cur && free(R.state) && now - this.cancelAt >= c.cooldownMs) {
      let best = null;
      for (const pl of this.places) {
        if (pl.id === this.livePlace) continue;
        const d = this.dist(pl, pos);
        if (d > pl.outer || d < pl.inner) continue;
        if (target) { if (Math.hypot(target.x - pl.x, target.y - pl.y) >= pl.inner) continue; } // clic: solo el lugar que contiene el destino
        else { // teclado: el rumbo debe apuntar al lugar
          const sp = Math.hypot(vel.x, vel.y);
          if (sp < c.minSpeed * c.speed || (vel.x * (pl.x - pos.x) + vel.y * (pl.y - pos.y)) / (sp * d) < c.heading) continue;
        }
        if (!best || d - pl.inner < best.gap) best = { id: pl.id, gap: d - pl.inner };
      }
      if (best) { this.prewarm = { placeId: best.id, since: now }; out.push({ type: 'prewarm', placeId: best.id }); }
    }

    // 5. mezcla del live (con rate limit)
    let ws = forced || this.weightsAt(pos);
    this.section = -1;
    let secDef = null;
    if (c.sections && cur) { // secciones: solo dentro de la region, con el tema de ESA region sonando (o Memoria=no, contando desde la entrada)
      const since = memoryOn ? (this.livePlace === cur ? this.liveSince : null) : this.enterAt;
      if (since != null) {
        const k = sectionIndex(now - since, c.sectionCfg);
        if (k >= 0 && this.byId[cur].sections?.[k]) { this.section = k; secDef = this.byId[cur].sections[k]; ws = [...ws, { id: `${cur}#${k}`, w: sectionWeight(secDef, c.sectionCfg) }]; }
      }
    }
    this.base = this.baseFor(ws, secDef);
    if (forced || this._shouldSend(ws, now)) {
      this.lastSent = ws; this.lastSendT = now;
      out.push({ type: 'livePrompts', prompts: this.toPrompts(ws) });
    }
    return out;
  }

  _shouldSend(ws, now) {
    if (now - this.lastSendT < this.cfg.sendMinMs) return false;
    if (!this.lastSent) return true;
    const a = new Map(this.lastSent.map((t) => [t.id, t.w])), b = new Map(ws.map((t) => [t.id, t.w]));
    if (a.size !== b.size) return true;
    let diff = 0;
    for (const [id, w] of b) { if (!a.has(id)) return true; diff = Math.max(diff, Math.abs(w - a.get(id))); }
    if (diff > this.cfg.sendDelta) return true;
    // coalesce: un envio pendiente por el rate limit no se pierde (se reevalua en cada update y se manda al vencer sendMinMs); y un resto
    // pequeno (<= sendDelta) tampoco: pasado settleMs desde el ultimo envio se manda el estado actual, que es siempre el ultimo.
    return diff > this.cfg.settleDelta && now - this.lastSendT >= this.cfg.settleMs;
  }
}
