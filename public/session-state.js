// Estado de sesiones del cliente (puro, sin DOM ni audio): canales 0 (live) y 1 (recall), identificador de sesion (sid)
// y handover. Cada `open` lleva un sid; los mensajes del servidor de OTRA sesion (p.ej. el `closed` del recall viejo que
// llega despues de abrir el nuevo) se ignoran. Los metodos devuelven EFECTOS para main.js:
//   {type:'open', ch, sid, placeId, kind:'prewarm'|'enter'|'rotation'} | {type:'startHandover'} | {type:'promote', placeId}
//   {type:'abortHandover'} | {type:'note', text, sticky?} | {type:'reopenLive', delayMs, retry, code, reason}
// reopenLive: el live se cerro solo (red, corte de ~601 s, hipo) y no hay handover en curso; main lo reabre con backoff.
export const blank = (state = '-') => ({ state, first: null, placeId: null, sid: null });
export const isFree = (c) => c.state === '-' || String(c.state).startsWith('closed');
export const HANDOVER_TIMEOUT_MS = 30000; // si el servidor no responde, el handover no puede quedar colgado
export const REOPEN_DELAYS_MS = [1000, 2000, 4000, 8000, 8000, 8000]; // reintentos de auto-recuperacion del live

export class SessionState {
  constructor() {
    this.ch = [blank(), blank()];
    this.handover = null; // { placeId|null (rotacion), started }
    this.sidSeq = 0;
    this.reopenTries = 0; // intentos de reconexion del live
    this.lastError = null; // ultimo mensaje de error (para la nota final si no se puede recuperar)
  }

  beginOpen(i, placeId) {
    const sid = ++this.sidSeq;
    this.ch[i] = { state: 'connecting', first: null, placeId, sid };
    return sid;
  }
  closeLocal(i) { this.ch[i] = blank('closed'); }

  _startHandover() {
    if (!this.handover || this.handover.started) return [];
    this.handover.started = true;
    return [{ type: 'startHandover' }];
  }

  requestPrewarm(placeId) {
    return [{ type: 'open', ch: 1, sid: this.beginOpen(1, placeId), placeId, kind: 'prewarm' }];
  }
  // Entrar con memoria: reusa el recall pre-calentado de ese lugar o abre uno
  requestEnter(placeId) {
    this.handover = { placeId, started: false, since: Date.now() };
    const c = this.ch[1];
    if (isFree(c) || c.placeId !== placeId) return [{ type: 'open', ch: 1, sid: this.beginOpen(1, placeId), placeId, kind: 'enter' }];
    return c.first != null ? this._startHandover() : []; // si aun no hay audio, first_audio lo arranca
  }
  requestRotation() {
    if (this.handover || !isFree(this.ch[1])) return null;
    this.handover = { placeId: null, started: false, since: Date.now() };
    return [{ type: 'open', ch: 1, sid: this.beginOpen(1, null), placeId: null, kind: 'rotation' }];
  }

  // Los clientes llaman a esto por frame: si el servidor nunca manda first_audio/promoted/closed, aborta
  expireHandover(now = Date.now()) {
    if (!this.handover || now - (this.handover.since ?? now) <= HANDOVER_TIMEOUT_MS) return [];
    this.handover = null;
    return [{ type: 'abortHandover' }];
  }

  onMessage(m) {
    const c = this.ch[m.ch];
    if (m.type === 'promoted') {
      if (m.sid !== undefined && m.sid !== this.ch[1].sid) return [];
      const placeId = this.handover?.placeId ?? null;
      this.ch[0] = { ...this.ch[1], state: 'playing' };
      this.ch[1] = blank('closed');
      this.handover = null;
      this.reopenTries = 0; this.lastError = null;
      return [{ type: 'promote', placeId }];
    }
    if (m.type === 'error') { this.lastError = m.message || 'error'; return [{ type: 'note', text: 'error: ' + m.message }]; }
    if (m.type === 'rotate_soon') return [{ type: 'rotate_soon' }];
    if (!c || m.ch === undefined) return [];
    if (m.sid !== undefined && m.sid !== c.sid) return []; // mensaje de una sesion anterior del canal
    if (m.type === 'status') {
      c.state = m.state;
      if (m.state === 'closed') Object.assign(c, { first: null, placeId: null });
      if (m.ch === 0 && (m.state === 'playing' || m.state === 'ready')) { this.reopenTries = 0; this.lastError = null; } // el live responde: sano
    } else if (m.type === 'first_audio') {
      c.first = m.ms;
      if (m.ch === 1) return this._startHandover();
    } else if (m.type === 'filtered') return [{ type: 'note', text: `prompt filtrado en canal ${m.ch}: ${m.reason}` }];
    else if (m.type === 'closed') {
      this.ch[m.ch] = blank(`closed (${m.code ?? '-'} ${m.reason || ''})`);
      if (m.ch === 1 && this.handover && !this.handover.started) { this.handover = null; return [{ type: 'abortHandover' }]; }
      if (m.ch === 0 && !this.handover) { // el live quedo solo: reconectar con backoff (o avisar por que no se pudo)
        const t = this.reopenTries++;
        if (t < REOPEN_DELAYS_MS.length) return [{ type: 'reopenLive', delayMs: REOPEN_DELAYS_MS[t], retry: t + 1, code: m.code ?? null, reason: m.reason || '' }];
        const why = this.lastError || `${m.code ?? '-'} ${m.reason || 'sin detalle'}`;
        return [{ type: 'note', text: `la musica no se pudo recuperar (${why}); toca recargar`, sticky: true }];
      }
    }
    return [];
  }
}
