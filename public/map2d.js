// Mapa de Colombia: un orbe viaja, la musica del canal live se mezcla segun la cercania a 6 lugares (memory.js decide)
// y al ENTRAR a un lugar con Memoria se hace handover a una sesion nueva con la seed del lugar (crossfade + promote).
import { Player } from './audio.js';
import { Link } from './ws.js';
import { LocalLink } from './local-link.js';
import { loadKey, saveKey } from './key-store.js';
import { Logger } from './logger.js';
import { MemoryController, placeConfig, tempoConfig } from './memory.js';
import { PLACE_GEO, BOUNDS, ORB_SPEED, snapTarget } from './geo.js';
import { MapView } from './map.js';
import { SessionState, isFree } from './session-state.js';
import { createHandover } from './handover.js';

const $ = (id) => document.getElementById(id);
const QS = new URLSearchParams(location.search); // parametros de URL: ?server=1 usa el servidor Node clasico
let places = [], byId = {}, meta = {};
let player = null, link = null, logger = null, memory = null, view = null;
let startedAt = 0;
let started = false, paused = false, memoryOn = true, showFps = false;
const ss = new SessionState();
const ch = ss.ch; // [live, recall]; ss reemplaza los elementos, nunca el array
let liveOpenedAt = 0;
let notes = '';
let noteTimer = 0;
let handover = null;
let autoPaused = false, reopenTimer = 0; // pausa automatica al ocultar la pestana y reintento de reconexion del live

// orbe
const START = { x: PLACE_GEO.find((g) => g.id === 'medellin').x, y: PLACE_GEO.find((g) => g.id === 'medellin').y + 0.1 };
const orb = { pos: { ...START }, vel: { x: 0, y: 0 }, target: null };
const keys = new Set();

const cfgOf = placeConfig;
const ev = (name, data) => logger?.event(name, data);
const note = (t, sticky = false) => { notes = t; ev('note', { t }); $('note').textContent = t; if (t && !sticky) { clearTimeout(noteTimer); noteTimer = setTimeout(() => { if (notes === t) $('note').textContent = ''; }, 6000); } };
function runEffects(effects) {
  for (const e of effects) {
    if (e.type === 'open') {
      if (e.kind === 'rotation') {
        const live = memory.livePlace && byId[memory.livePlace];
        // misma mezcla y misma config (sin seed nueva; bpm del lugar si lo tiene)
        handover?.openRecall(e, memory.toPrompts(memory.weightsAt(orb.pos)), tempoConfig(live));
      } else { const p = byId[e.placeId]; handover?.openRecall(e, [{ text: p.prompt, weight: 1 }], cfgOf(p)); }
    } else if (e.type === 'startHandover') handover?.start();
    else if (e.type === 'abortHandover') { handover?.abort(); memory.notifyAbort(); }
    else if (e.type === 'note') note(e.text, !!e.sticky);
    else if (e.type === 'promote') {
      player.promote();
      liveOpenedAt = performance.now();
      ev('promote', { place: e.placeId });
      memory.notifyPromoted(e.placeId);
    } else if (e.type === 'reopenLive') {
      ev('reopen_live', { retry: e.retry, code: e.code, reason: e.reason });
      note(e.retry > 1 ? `reconectando la musica (intento ${e.retry})...` : 'reconectando la musica...');
      scheduleReopen(e.delayMs);
    } else if (e.type === 'rotate_soon') { // si no se puede, el servidor vuelve a avisar mientras sigan ocupadas las 2 sesiones
      const eff = ss.requestRotation();
      if (!eff) continue;
      memory.notifyRotation(performance.now());
      ev('rotate', {});
      note('rotando sesion live (limite de 10 min)');
      runEffects(eff);
    }
  }
}

function onMessage(m) {
  ev('srv_' + m.type, { ch: m.ch, state: m.state, ms: m.ms, sid: m.sid });
  runEffects(ss.onMessage(m));
}

function doActions(actions) {
  for (const a of actions) {
    if (a.type === 'livePrompts') {
      link.send({ type: 'prompts', ch: 0, prompts: a.prompts });
      logger?.noteSend();
    } else if (a.type === 'prewarm') {
      ev('recall_prewarm', { place: a.placeId });
      runEffects(ss.requestPrewarm(a.placeId));
    } else if (a.type === 'cancelPrewarm') {
      ev('recall_cancel', { reason: a.reason, place: ch[1].placeId });
      link.send({ type: 'close', ch: 1 });
      player.reset(1);
      ss.closeLocal(1);
    } else if (a.type === 'enter') {
      ev('place_enter', { place: a.placeId, memory: a.memory, reason: a.reason });
      if (a.memory) { view.flash(a.placeId); runEffects(ss.requestEnter(a.placeId)); }
    } else if (a.type === 'leave') ev('place_leave', { place: a.placeId });
  }
}

// ---- orbe ----
function stepOrb(dt) {
  let dx = 0, dy = 0;
  if (keys.has('w') || keys.has('arrowup')) dy += 1;
  if (keys.has('s') || keys.has('arrowdown')) dy -= 1;
  if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
  if (keys.has('d') || keys.has('arrowright')) dx += 1;
  if (dx || dy) orb.target = null;
  else if (orb.target) {
    const tx = orb.target.x - orb.pos.x, ty = orb.target.y - orb.pos.y, d = Math.hypot(tx, ty);
    if (d < 0.06) orb.target = null; else { dx = tx / d; dy = ty / d; if (d < 0.5) { dx *= d / 0.5; dy *= d / 0.5; } } // frena al llegar
  }
  const l = Math.hypot(dx, dy);
  if (l > 1) { dx /= l; dy /= l; }
  const k = 1 - Math.exp(-dt * 7); // suavizado
  orb.vel.x += (dx * ORB_SPEED - orb.vel.x) * k;
  orb.vel.y += (dy * ORB_SPEED - orb.vel.y) * k;
  orb.pos.x = Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, orb.pos.x + orb.vel.x * dt));
  orb.pos.y = Math.min(BOUNDS.maxY, Math.max(BOUNDS.minY, orb.pos.y + orb.vel.y * dt));
}

// ---- bucle ----
let lastT = 0, fpsAcc = 0, fpsN = 0, hudT = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (t - lastT) / 1000 || 0.016);
  lastT = t;
  if (started) { handover?.tick(); runEffects(ss.expireHandover()); } // tick antes de expirar: si la pestana estuvo congelada, el promote sale igual
  if (started && !paused) {
    stepOrb(dt);
    const heldMs = player.stats(1).held ? player.stats(1).heldSec * 1000 : 0;
    const actions = memory.update({
      now: t, pos: orb.pos, vel: orb.vel, target: orb.target, memoryOn,
      chans: {
        live: { state: ch[0].state, ageMs: t - liveOpenedAt },
        recall: { state: ch[1].state, placeId: ch[1].placeId, heldMs, firstAudio: ch[1].first },
      },
    });
    doActions(actions);
  }
  if (view) {
    const ms = memory.getState();
    const ws = memory.weightsAt(orb.pos);
    const levels = {};
    if (ms.prewarm) levels[ms.prewarm] = Math.max(0.15, memory.prewarmProgress(orb.pos));
    if (ms.handover) levels[ms.handover] = 1;
    view.setHalos(levels, dt);
    view.setActive(ms.current);
    let col = 0, r = 0, g = 0, b = 0;
    for (const w of ws) { const c = PLACE_GEO.find((p) => p.id === w.id).color; r += ((c >> 16) & 255) * w.w; g += ((c >> 8) & 255) * w.w; b += (c & 255) * w.w; }
    col = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
    view.setOrb(orb.pos, t, col);
    view.render(dt);
    if (t - hudT > 150) { hudT = t; renderHud(ms, ws); }
  }
  if (showFps) { fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { $('fps').textContent = Math.round(fpsN / fpsAcc) + ' fps'; fpsAcc = 0; fpsN = 0; } }
}

function renderHud(ms, ws) {
  $('place').textContent = ms.current ? meta[ms.current].name : '(en camino)';
  $('liveplace').textContent = ms.livePlace ? meta[ms.livePlace].name : 'olvidado';
  $('bars').innerHTML = ws.map((w) => {
    const hex = '#' + PLACE_GEO.find((p) => p.id === w.id).color.toString(16).padStart(6, '0');
    return `<div class="bar"><span class="n">${meta[w.id].name}</span><div class="t"><div class="f" style="width:${Math.round(w.w * 100)}%;background:${hex}"></div></div><span>${Math.round(w.w * 100)}%</span></div>`;
  }).join('');
  const line = (i, label) => {
    const s = player ? player.stats(i) : { ahead: 0, heldSec: 0, held: false, underruns: 0 };
    // live sin Memoria no pertenece a un lugar: refleja la mezcla; con Memoria, el lugar del ultimo handover (memory.livePlace)
    const pid = i === 0 ? (memoryOn ? ms.livePlace : null) : ch[i].placeId;
    const pl = i === 0 ? ` [${pid ? meta[pid]?.name : 'mezcla'}]` : (pid ? ` [${meta[pid]?.name}]` : '');
    return `${label}: ${ch[i].state}${pl}${s.held ? ` HOLD ${s.heldSec.toFixed(1)}s` : ''}`;
  };
  $('chans').textContent = `${line(0, 'live  ')}\n${line(1, 'recall')}\nfase: ${ms.phase}${ms.prewarm ? ' -> ' + meta[ms.prewarm].name : ''}`;
}

// ---- inicio ----
async function start() {
  if (started) return;
  // modo directo (def.): el navegador habla con Google con la key del jugador; ?server=1 usa el servidor Node clasico
  const useServer = QS.get('server') === '1';
  let key = '', remember = false;
  if (!useServer) {
    key = ($('key')?.value || '').trim();
    if (!key) { const i = $('key'); if (i) { i.classList.add('bad'); i.focus(); } $('keyset')?.classList.add('need'); return; }
    remember = !!$('remember')?.checked; // se lee antes de quitar #start
  }
  started = true; startedAt = performance.now();
  $('start').remove();
  player = new Player();
  await player.resume();
  logger = new Logger({ send: (o) => link.send(o) });
  const onAudio = (i, buf) => { logger?.noteAudio(); if (i === 1 && isFree(ch[1])) return; player.push(i, buf); };
  link = useServer ? new Link({ onAudio, onMessage, onDisconnect: note }) : new LocalLink({ onAudio, onMessage, onDisconnect: note, key });
  await link.connect();
  if (!useServer) { saveKey(key, remember); $('key')?.classList.remove('bad'); $('keyset')?.classList.remove('need'); }
  logger.start();
  handover = createHandover({ link, player, ss, ch, onStart: (h) => ev('recall_start', { place: h?.placeId, heldSec: +player.stats(1).heldSec.toFixed(2) }) });
  const near = memory.weightsAt(orb.pos)[0].id; // lugar mas cercano: su seed y bpm
  const p = byId[near];
  memory.setLive(near);
  liveOpenedAt = performance.now();
  const sid = ss.beginOpen(0, near);
  link.send({ type: 'open', ch: 0, sid, prompts: memory.toPrompts(memory.weightsAt(orb.pos)), config: cfgOf(p), play: true });
  ev('live_open', { place: near });
}

async function togglePause() {
  if (!player) return;
  paused = !paused; autoPaused = false;
  if (paused) { link.send({ type: 'pause' }); await player.suspend(); }
  else { player.reset(0); player.reset(1); link.send({ type: 'play' }); await player.resume(); }
  $('pause').textContent = paused ? 'Reanudar (P)' : 'Pausa (P)';
}
// Reabre el canal live si se murio solo (red, corte de Lyria a ~601 s, hipo): reusa la mezcla actual y NO lleva seed (continua)
function openLive() {
  const live = memory.livePlace && byId[memory.livePlace];
  const sid = ss.beginOpen(0, memory.livePlace ?? null);
  player.reset(0); player.restore(0); // limpia colas viejas y garantiza gain 1 (pudo morir a mitad de un fade)
  if (!isFree(ch[1]) && !memory.prewarm) { // recall huerfano: se quedo colgado sin llegar a promover
    link.send({ type: 'close', ch: 1 }); player.reset(1); ss.closeLocal(1);
    ev('reopen_orphan_recall', {});
  }
  link.send({ type: 'open', ch: 0, sid, prompts: memory.toPrompts(memory.lastSent || memory.weightsAt(orb.pos)), config: tempoConfig(live), play: !paused });
  memory.liveSince = null; // el tema reancla con la reapertura
  if (!paused) liveOpenedAt = performance.now();
  ev('live_open', { place: memory.livePlace ?? null, reopen: true });
}
function scheduleReopen(delayMs) {
  clearTimeout(reopenTimer);
  reopenTimer = setTimeout(() => {
    if (!started || ss.handover || !isFree(ch[0])) return; // handover en curso o canal ya ocupado: no pisar
    openLive();
  }, delayMs);
}
function toggleMemory() {
  memoryOn = !memoryOn;
  $('mem').textContent = `Memoria: ${memoryOn ? 'si' : 'no'} (M)`;
  $('mem').classList.toggle('on', memoryOn);
  ev('memory', { on: memoryOn });
}

async function init() {
  const data = (await (await fetch('places.json')).json()).places;
  byId = Object.fromEntries(data.map((p) => [p.id, p]));
  meta = byId;
  places = PLACE_GEO.map((g) => ({ ...g, prompt: byId[g.id].prompt }));
  memory = new MemoryController(places);
  view = new MapView($('view'), $('labels'), Object.fromEntries(data.map((p) => [p.id, p.name])));
  view.render(0.016);
  const k = loadKey(); // precarga la key guardada (el storage global puede estar bloqueado: key-store lo maneja)
  if (k.key) { $('key').value = k.key; $('remember').checked = k.remember; }
  if (QS.get('server') === '1') $('keyset').style.display = 'none'; // modo servidor: la key del jugador no aplica
  $('start').onclick = (e) => { if (!e.target.closest('#keyset')) start(); }; // clics en la key/recordar no arrancan el juego
  $('mem').onclick = toggleMemory;
  $('pause').onclick = togglePause;
  view.renderer.domElement.addEventListener('pointerdown', (e) => {
    if (!started || performance.now() - startedAt < 400) return; // el clic de "empezar" no es clic-para-ir
    const p = view.pick(e.clientX, e.clientY);
    if (p) orb.target = snapTarget({ x: Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, p.x)), y: Math.min(BOUNDS.maxY, Math.max(BOUNDS.minY, p.y)) });
  });
  addEventListener('keydown', (e) => {
    if (e.target?.tagName === 'INPUT') return; // mientras se escribe la key no corren los atajos
    const k = e.key.toLowerCase();
    if (k === 'm') toggleMemory();
    else if (k === 'p') togglePause();
    else if (k === 'h') $('hud').classList.toggle('hidden');
    else if (k === 'f') { showFps = !showFps; $('fps').classList.toggle('hidden', !showFps); }
    else if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  addEventListener('pointerdown', () => { if (player && player.ctx.state === 'suspended') player.resume().catch(() => {}); }, { passive: true }); // iOS puede dejar el audio suspendido tras una interrupcion
  // Al bloquear la pantalla / cambiar de app se pausa limpio; al volver se reanuda sin reusar audio viejo (evita bucles de cola rancia)
  addEventListener('visibilitychange', () => {
    if (!started || !player) return;
    if (document.hidden && !paused) {
      paused = true; autoPaused = true;
      $('pause').textContent = 'Reanudar (P)';
      link.send({ type: 'pause' }); player.suspend().catch(() => {});
    } else if (!document.hidden && autoPaused) {
      autoPaused = false; paused = false;
      $('pause').textContent = 'Pausa (P)';
      if (!ss.handover) { player.reset(0); player.reset(1); }
      link.send({ type: 'play' }); player.resume().catch(() => {});
    }
  });
  requestAnimationFrame(frame);
}
init().catch((e) => { console.error('init', e); note('error al cargar: ' + (e?.message || e)); });
