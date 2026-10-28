// Nucleo puro (sin node ni ws), fuente unica compartida por el servidor Node y el navegador: vive en public/ porque
// el navegador carga esta carpeta tal cual; server-core.mjs (Node) lo importa desde aqui.
// Maquina de estados de las 2 sesiones Lyria por cliente (0 = live, 1 = recall) y sanitizadores del protocolo. El
// transporte y la conexion real a Lyria se inyectan: transport = { send(obj), sendAudio(ch, dataB64) }, connect via opts.
const MIN_WEIGHT = 0.05;
const MAX_SESSIONS = 2;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function parseCh(v) {
  if (v === 0 || v === '0' || v === 'live') return 0;
  if (v === 1 || v === '1' || v === 'recall') return 1;
  return -1;
}

export const SCALES = [
  'C_MAJOR_A_MINOR', 'D_FLAT_MAJOR_B_FLAT_MINOR', 'D_MAJOR_B_MINOR', 'E_FLAT_MAJOR_C_MINOR', 'E_MAJOR_D_FLAT_MINOR', 'F_MAJOR_D_MINOR',
  'G_FLAT_MAJOR_E_FLAT_MINOR', 'G_MAJOR_E_MINOR', 'A_FLAT_MAJOR_F_MINOR', 'A_MAJOR_G_FLAT_MINOR', 'B_FLAT_MAJOR_G_MINOR', 'B_MAJOR_A_FLAT_MINOR',
]; // enum Scale del SDK (sin SCALE_UNSPECIFIED)
export const GEN_MODES = ['QUALITY', 'DIVERSITY', 'VOCALIZATION'];

// Campos de LiveMusicGenerationConfig (camelCase en @google/genai). Cualquier otro se descarta.
export function sanitizeConfig(c = {}) {
  const out = {};
  if (!c || typeof c !== 'object') return out;
  const set = (k, v, lo, hi) => { const n = num(v); if (n !== undefined) out[k] = clamp(n, lo, hi); };
  set('density', c.density, 0, 1);
  set('brightness', c.brightness, 0, 1);
  set('guidance', c.guidance, 0, 6);
  set('temperature', c.temperature, 0, 3);
  if (num(c.topK) !== undefined) out.topK = Math.round(clamp(c.topK, 1, 1000));
  if (num(c.seed) !== undefined) out.seed = Math.round(clamp(c.seed, 0, 2147483647));
  if (num(c.bpm) !== undefined) out.bpm = Math.round(clamp(c.bpm, 60, 200));
  if (typeof c.scale === 'string' && SCALES.includes(c.scale)) out.scale = c.scale;
  for (const k of ['muteBass', 'muteDrums', 'onlyBassAndDrums']) if (typeof c[k] === 'boolean') out[k] = c[k];
  if (typeof c.musicGenerationMode === 'string' && GEN_MODES.includes(c.musicGenerationMode)) out.musicGenerationMode = c.musicGenerationMode;
  return out;
}

export function sanitizePrompts(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((p) => p && typeof p.text === 'string' && num(p.weight) !== undefined)
    .slice(0, 12)
    .map((p) => ({ text: p.text.slice(0, 600), weight: clamp(p.weight, 0, 10) }));
}

export class LyriaController {
  constructor(transport, slog, opts) {
    this.transport = transport; this.slog = slog; this.opts = opts;
    this.slots = [null, null];   // holder por canal
    this.zombies = new Set();    // holders retirados cuyo connect() sigue en vuelo (cuentan para el limite)
    this.paused = false;
    this.closed = false;
    this.rotateTimer = null;
    this.tick = setInterval(() => this.flush(), opts.sendIntervalMs);
  }

  send(obj) { this.transport.send(obj); }
  err(message, ch) { this.send({ type: 'error', ...(ch !== undefined ? { ch } : {}), message }); this.slog.event('error', { ch, message }); }
  status(ch, state, sid) { this.send({ type: 'status', ch, state, ...(sid !== undefined ? { sid } : {}) }); }
  count() { return this.slots.filter(Boolean).length + this.zombies.size; }

  // Retira un holder: libera su canal y cierra la sesion (o la marca para cerrarla en cuanto conecte)
  retire(h) {
    h.retired = true;
    if (this.slots[h.ch] === h) this.slots[h.ch] = null;
    if (h.session) { try { h.session.close(); } catch { /* ya cerrada */ } }
    else this.zombies.add(h);
  }

  open(ch, msg) {
    const old = this.slots[ch];
    const freed = old && old.session ? 1 : 0; // si la vieja aun conecta, sigue contando como zombie
    if (this.count() - freed >= MAX_SESSIONS) return this.err('limite de 2 sesiones por cliente', ch);
    if (old) this.retire(old);
    const h = {
      ch, session: null, retired: false, ready: false, gotAudio: false, t0: Date.now(), openedAt: 0,
      prompts: sanitizePrompts(msg.prompts), config: sanitizeConfig(msg.config), wantPlay: !!msg.play,
      sid: msg.sid, dirty: false, dirtyCfg: false, applied: null, rotateNotified: false, deferLogged: false,
    };
    this.slots[ch] = h;
    this.status(ch, 'connecting', h.sid);
    this.slog.event('open', { ch, weights: h.prompts.map((p) => +p.weight.toFixed(3)), config: h.config, play: h.wantPlay });
    this.connectHolder(h);
  }

  async connectHolder(h) {
    let session = null;
    try {
      session = await this.opts.connect({
        onmessage: (m) => this.onMessage(h, m),
        onerror: (e) => this.onError(h, e),
        onclose: (e) => this.onClose(h, e),
      });
      this.zombies.delete(h);
      h.session = session;
      if (h.retired || this.closed) { try { session.close(); } catch { /* */ } return; }
      // orden de Lyria: config y prompts ANTES de play()
      await this.apply(h, true);
      if (h.retired || this.closed) return;
      h.ready = true;
      h.openedAt = Date.now();
      if (h.wantPlay && !this.paused) { session.play(); this.status(h.ch, 'playing', h.sid); } else this.status(h.ch, this.paused ? 'paused' : 'ready', h.sid);
      this.scheduleRotate();
    } catch (e) {
      this.zombies.delete(h);
      const wasRetired = h.retired;
      if (!wasRetired) this.retire(h);
      else if (session) { try { session.close(); } catch { /* */ } }
      if (!wasRetired) {
        const message = this.opts.scrub(e?.message || 'fallo al conectar');
        this.err('fallo al conectar: ' + message, h.ch);
        this.send({ type: 'closed', ch: h.ch, code: null, reason: 'connect_failed', sid: h.sid });
        this.status(h.ch, 'closed', h.sid);
        this.slog.event('close', { ch: h.ch, code: null, reason: 'connect_failed' });
      }
    }
  }

  // what: { prompts, config } -> que mandar. Cada setMusicGenerationConfig lleva la config COMPLETA de la sesion (h.config): los campos
  // omitidos vuelven al default de Lyria, seed incluida, asi que nunca se manda un parche suelto.
  async apply(h, initial, what = { prompts: true, config: true }) {
    const s = h.session;
    const active = h.prompts.filter((p) => p.weight > MIN_WEIGHT);
    this.slog.event(initial ? 'apply_initial' : what.prompts ? 'apply' : 'apply_config', { ch: h.ch, weights: active.map((p) => +p.weight.toFixed(3)), ...(what.config ? { config: { ...h.config } } : {}) });
    if (what.prompts && active.length) await s.setWeightedPrompts({ weightedPrompts: active });
    if (what.config && Object.keys(h.config).length) await s.setMusicGenerationConfig({ musicGenerationConfig: { ...h.config } });
    const next = { bpm: h.config.bpm, scale: h.config.scale };
    // bpm/scale solo se aplican antes de play() o con resetContext()
    if (!initial && h.applied && (h.applied.bpm !== next.bpm || h.applied.scale !== next.scale)) s.resetContext();
    h.applied = next;
  }

  async flush() {
    for (const h of this.slots) {
      if (!h || !h.ready || !(h.dirty || h.dirtyCfg) || h.retired) continue;
      const what = { prompts: h.dirty, config: h.dirty || h.dirtyCfg };
      h.dirty = false; h.dirtyCfg = false;
      try { await this.apply(h, false, what); } catch (e) { this.err('fallo al enviar prompts: ' + this.opts.scrub(e?.message), h.ch); }
    }
  }

  onMessage(h, msg) {
    if (h.retired || this.closed) return;
    const chunks = msg?.serverContent?.audioChunks;
    if (chunks) {
      for (const c of chunks) {
        if (!c.data) continue;
        if (!h.gotAudio) {
          h.gotAudio = true;
          const ms = Date.now() - h.t0;
          this.send({ type: 'first_audio', ch: h.ch, ms, sid: h.sid });
          this.slog.event('first_audio', { ch: h.ch, ms });
        }
        this.transport.sendAudio(h.ch, c.data);
      }
    }
    if (msg?.filteredPrompt) {
      const reason = String(msg.filteredPrompt.filteredReason || '').slice(0, 200);
      this.send({ type: 'filtered', ch: h.ch, sid: h.sid, reason, text: String(msg.filteredPrompt.text || '').slice(0, 200) });
      this.slog.event('filtered', { ch: h.ch, reason });
    }
  }

  onError(h, e) {
    if (h.retired || this.closed) return;
    this.err(this.opts.scrub(e?.message || 'error de Lyria'), h.ch);
  }

  onClose(h, e) {
    if (h.retired || this.closed) return;
    h.retired = true;
    if (this.slots[h.ch] === h) this.slots[h.ch] = null;
    const code = e?.code ?? null, reason = this.opts.scrub(e?.reason || '');
    this.send({ type: 'closed', ch: h.ch, code, reason, sid: h.sid });
    this.status(h.ch, 'closed', h.sid);
    this.slog.event('close', { ch: h.ch, code, reason, by: 'lyria' });
    this.scheduleRotate();
  }

  // Rotacion: Lyria corta a ~601 s. Cuando el live lleva rotateMs avisa rotate_soon{ch:0}; el CLIENTE abre una sesion
  // nueva (sin seed) en el canal libre, hace crossfade y manda promote. Si hay algo en el canal 1 (recall en curso) se aplaza.
  scheduleRotate() {
    clearTimeout(this.rotateTimer); this.rotateTimer = null;
    const h = this.slots[0];
    if (this.closed || !h || !h.ready || h.rotateNotified) return;
    const delay = Math.max(0, h.openedAt + this.opts.rotateMs - Date.now());
    this.rotateTimer = setTimeout(() => this.rotateCheck(h), delay);
  }

  rotateCheck(h) {
    if (this.closed || h.retired || this.slots[0] !== h) return;
    if (this.count() >= MAX_SESSIONS) { // recall en curso: aplazar
      if (!h.deferLogged) { h.deferLogged = true; this.slog.event('rotate', { ch: 0, deferred: true }); }
      this.rotateTimer = setTimeout(() => this.rotateCheck(h), this.opts.rotateDeferMs);
      return;
    }
    h.rotateNotified = true;
    this.send({ type: 'rotate_soon', ch: 0, ageMs: Date.now() - h.openedAt });
    this.slog.event('rotate', { ch: 0, deferred: false, ageMs: Date.now() - h.openedAt });
  }

  promote(msg) {
    const from = parseCh(msg.from ?? 'recall');
    if (from !== 1) return this.err('promote solo admite from:"recall"');
    const h = this.slots[1];
    if (!h) return this.err('no hay recall que promover', 1);
    const old = this.slots[0];
    if (old) this.retire(old);
    this.slots[0] = h; this.slots[1] = null; h.ch = 0;
    h.rotateNotified = false; h.deferLogged = false;
    this.slog.event('promote', { from: 1, ch: 0, replacedLive: !!old });
    this.send({ type: 'promoted', from: 1, ch: 0, sid: h.sid }); // en orden con los frames: antes llevaban byte 1, despues byte 0
    this.status(1, 'closed', h.sid);
    this.status(0, h.ready ? (this.paused ? 'paused' : h.wantPlay ? 'playing' : 'ready') : 'connecting', h.sid);
    this.scheduleRotate();
  }

  async handle(msg) {
    const type = msg?.type;
    if (type === 'open' || type === 'prompts' || type === 'config' || type === 'close') {
      const ch = parseCh(msg.ch);
      if (ch < 0) return this.err('canal invalido (0|1|"live"|"recall")');
      if (type === 'open') return this.open(ch, msg);
      const h = this.slots[ch];
      if (!h) return this.err('no hay sesion en el canal', ch);
      if (type === 'prompts') {
        h.prompts = sanitizePrompts(msg.prompts);
        if (msg.config) h.config = { ...h.config, ...sanitizeConfig(msg.config) };
        h.dirty = true; // coalescing: flush() manda solo el ultimo estado cada sendIntervalMs
        this.slog.event('prompts', { ch, weights: h.prompts.map((p) => +p.weight.toFixed(3)) });
        return;
      }
      if (type === 'config') { // config dinamica (density, brightness, muteDrums...): se fusiona y se reenvia COMPLETA, sin tocar los prompts
        h.config = { ...h.config, ...sanitizeConfig(msg.config) };
        h.dirtyCfg = true; // mismo coalescing que los prompts; resetContext solo si cambian bpm/scale (lo decide apply)
        this.slog.event('config', { ch, config: sanitizeConfig(msg.config) });
        return;
      }
      this.retire(h);
      this.send({ type: 'closed', ch, code: 1000, reason: 'client', sid: h.sid });
      this.status(ch, 'closed', h.sid);
      this.slog.event('close', { ch, code: 1000, reason: 'client' });
      if (ch === 0) this.scheduleRotate();
      return;
    }
    if (type === 'promote') return this.promote(msg);
    if (type === 'pause') {
      this.paused = true;
      for (const h of this.slots) if (h?.ready) { try { h.session.pause(); } catch { /* */ } this.status(h.ch, 'paused', h.sid); }
      return;
    }
    if (type === 'play') {
      this.paused = false;
      for (const h of this.slots) {
        if (!h) continue;
        h.wantPlay = true;
        if (h.ready) { try { h.session.play(); } catch { /* */ } this.status(h.ch, 'playing', h.sid); }
      }
    }
  }

  close() {
    this.closed = true;
    clearInterval(this.tick);
    clearTimeout(this.rotateTimer);
    for (const h of this.slots) if (h) this.retire(h);
  }
}
