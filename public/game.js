// Willys por Colombia (G2): maneja entre 6 regiones por una red de carreteras; la musica del canal live se mezcla por cercania (memory.js) y al cruzar la
// neblina de una region con Memoria se hace handover a una sesion nueva con su seed (crossfade + promote). Mismo pipeline que map2d.js.
import * as THREE from 'three';
import { Player } from './audio.js';
import { Link } from './ws.js';
import { LocalLink } from './local-link.js';
import { loadKey, saveKey } from './key-store.js';
import { Logger } from './logger.js';
import { MemoryController, placeConfig, tempoConfig } from './memory.js';
import { ReactiveMusic } from './reactive.js';
import { SessionState, isFree } from './session-state.js';
import { createHandover } from './handover.js';
import { createState, createSim, advance, CAR } from './vehicle.js';
import { approachInfo } from './approach.js';
import { World } from './world/scene.js';
import { WORLD, heightAt } from './world/terrain.js';
import { baseHeight } from './world/base.js';
import { POLY, countrySD } from './world/coast.js';
import { ENV } from './world/env.js';
import { roadInfo, roadAt, ROADS, ROAD_BY_ID } from './world/road.js';
import { ZONES, ZONE_BY_ID, memoryPlaces, fogBoost, CARD_MS } from './world/regions.js';
import { Willys } from './willys.js';
import { DriftFx } from './world/driftfx.js';
import { paletteAt, nextHourStart, START_T, DEFAULT_PERIOD_S, holdStartOf } from './world/daycycle.js';
import { Governor } from './perf.js';
import { Minimap, mixColor, hex, pushTrail } from './minimap.js';
import { BigMap } from './bigmap.js';
import { TouchControls, touchEnabled, mergeInputs } from './touch.js';
import { playlistUri, playlistUrl, nextPlaylist, initialPlaylist } from './spotify.js';

const $ = (id) => document.getElementById(id);
let byId = {}, meta = {};
let player = null, link = null, logger = null, memory = null, world = null, willys = null, minimap = null, bigmap = null;
const trail = []; // estela del recorrido para el mapa grande
let started = false, paused = false, memoryOn = true, showFps = false;
let observer = false; // modo observador: un solo estado para el boton ojo, la tecla H y ?hud=0
function setObserver(on = !observer) { observer = !!on; document.body.classList.toggle('observer', observer); $('eye').setAttribute('aria-pressed', String(observer)); }
let touchCtl = null; // controles tactiles (solo en puntero grueso, o ?touch=1)
const tick = () => new Promise((r) => { let d = false; const f = () => { if (!d) { d = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 60); }); // cede al navegador (pinta) entre pasos de carga
// parametros de URL: ?day=segundos por vuelta del ciclo de dia (def. 420), ?aa=1 antialias, ?hour=amanecer|dia|atardecer|crepusculo|noche (hora inicial)
const QS = new URLSearchParams(location.search);
let nokey = QS.get('nokey') === '1'; // modo sin key: se maneja igual pero sin Lyria; la musica son las playlists de Spotify de cada region
const DEV = QS.get('dev') === '1'; // dev: avisos de rendimiento en pantalla
const DAY_PERIOD_S = Math.max(20, Number(QS.get('day')) || DEFAULT_PERIOD_S);
let dayT = QS.get('hour') ? holdStartOf(QS.get('hour')) + 0.001 : START_T;
const gov = new Governor();
const ss = new SessionState();
const ch = ss.ch; // [live, recall]
let liveOpenedAt = 0, notes = '';
let noteTimer = 0;
let handover = null;
let autoPaused = false, reopenTimer = 0; // pausa automatica al ocultar la pestana y reintento de reconexion del live
const keys = new Set();

const cfgOf = placeConfig; // apertura de un lugar: seed + bpm + scale + LIVE_CONFIG (nunca density/brightness/muteDrums: el inicio del recall debe ser identico en cada visita)
// Musica reactiva a la velocidad (reactive.js): su config dinamica va SOLO al canal live (0), nunca a un recall retenido/pre-calentando; tras el promote se reenvia (resync)
const reactive = new ReactiveMusic();
let liveTempo = {}; // bpm/scale/LIVE_CONFIG del lugar con que se abrio el live: la rotacion y la reapertura lo conservan (sin resetContext al viajar)
const liveOpenCfg = () => ({ ...liveTempo, ...reactive.current() });
const ev = (name, data) => logger?.event(name, data);
const note = (t, sticky = false) => { notes = t; ev('note', { t }); $('note').textContent = t; if (t && !sticky) { clearTimeout(noteTimer); noteTimer = setTimeout(() => { if (notes === t) $('note').textContent = ''; }, 6000); } };
const mpos = () => ({ x: sim.state.x, y: sim.state.z }); // memory.js usa (x, y); y = z del mundo

function runEffects(effects) {
  for (const e of effects) {
    if (e.type === 'open') {
      if (e.kind === 'rotation') {
        handover?.openRecall(e, memory.toPrompts(memory.lastSent || memory.weightsAt(mpos())), liveOpenCfg());
      } else { const p = byId[e.placeId]; handover?.openRecall(e, [{ text: p.prompt, weight: 1 }], cfgOf(p)); }
    } else if (e.type === 'startHandover') handover?.start();
    else if (e.type === 'abortHandover') { handover?.abort(); memory.notifyAbort(); }
    else if (e.type === 'note') note(e.text, !!e.sticky);
    else if (e.type === 'promote') { player.promote(); liveOpenedAt = performance.now(); ev('promote', { place: e.placeId }); memory.notifyPromoted(e.placeId); if (e.placeId && byId[e.placeId]) liveTempo = tempoConfig(byId[e.placeId]); reactive.resync(); }
    else if (e.type === 'reopenLive') {
      ev('reopen_live', { retry: e.retry, code: e.code, reason: e.reason });
      note(e.retry > 1 ? `reconectando la musica (intento ${e.retry})...` : 'reconectando la musica...');
      scheduleReopen(e.delayMs);
    } else if (e.type === 'rotate_soon') {
      const eff = ss.requestRotation();
      if (!eff) continue;
      memory.notifyRotation(performance.now());
      ev('rotate', {}); note('rotando sesion live (limite de 10 min)');
      runEffects(eff);
    }
  }
}
function onMessage(m) { ev('srv_' + m.type, { ch: m.ch, state: m.state, ms: m.ms, sid: m.sid }); runEffects(ss.onMessage(m)); }

let cardTimer = 0;
function showCard(z) {
  const c = $('card');
  const acc = hex(z.accent);
  const sp = byId?.[z.id]?.spotify; // playlist de referencia del lugar (si la define)
  c.innerHTML = `<div class="g">Entras a</div><div class="z" style="color:${acc}">${z.name}</div><div class="g">${z.card.genre}</div><div class="i">${z.card.instruments}</div><div class="d">${z.card.fact}</div>`
    + (sp ? `<a class="sp" href="https://open.spotify.com/playlist/${sp}" target="_blank" rel="noopener">Playlist de referencia en Spotify</a>` : '');
  c.style.setProperty('--accent', acc);
  c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); // reinicia la animacion "pop"
  document.body.classList.add('card-on');
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => { c.classList.remove('show'); document.body.classList.remove('card-on'); }, CARD_MS);
}
let flashId = null, flashT = 0;
function doActions(actions) {
  if (nokey) { // sin Lyria: solo importan las entradas de region (tarjeta + playlist); no hay link, ni canales, ni handover
    for (const a of actions) {
      if (a.type === 'enter') { ev('region_enter', { place: a.placeId }); showCard(ZONE_BY_ID[a.placeId]); spotifyEnter(a.placeId); }
    }
    return;
  }
  for (const a of actions) {
    if (a.type === 'livePrompts') { link.send({ type: 'prompts', ch: 0, prompts: a.prompts }); logger?.noteSend(); }
    else if (a.type === 'prewarm') { ev('recall_prewarm', { place: a.placeId }); runEffects(ss.requestPrewarm(a.placeId)); }
    else if (a.type === 'cancelPrewarm') {
      ev('recall_cancel', { reason: a.reason, place: ch[1].placeId });
      link.send({ type: 'close', ch: 1 }); player.reset(1); ss.closeLocal(1);
    } else if (a.type === 'enter') {
      ev('region_enter', { place: a.placeId, memory: a.memory, reason: a.reason });
      showCard(ZONE_BY_ID[a.placeId]);
      if (a.memory) { flashId = a.placeId; flashT = 2; runEffects(ss.requestEnter(a.placeId)); }
    } else if (a.type === 'leave') ev('region_leave', { place: a.placeId });
  }
}

// ---- conduccion ----
// arranca en Medellin (tramo 0 = Medellin -> Caribe). Dev: ?road=<id de tramo, ej. car-san>&s=<arco en u> para aparecer en otro punto de la red
const spawnEdge = ROAD_BY_ID[QS.get('road')] ?? 0, r0 = roadAt(Number(QS.get('s')) || 12, spawnEdge);
// dev: ?cam=x,y,z,tx,ty,tz (camara fija mirando a t), ?nofog=1 (sin niebla ni culling: vistas del pais), ?fov=<grados>
const CAMOVR = (QS.get('cam') || '').split(',').map(Number);
const AT = (QS.get('at') || '').split(',').map(Number); // dev: ?at=x,z,rumbo (rad; 0 = +z)
const sim = createSim(AT.length >= 2 && AT.every(Number.isFinite) ? createState(AT[0], AT[1], AT[2] || 0, heightAt(AT[0], AT[1])) : createState(r0.x, r0.z, Math.atan2(r0.tx, r0.tz), r0.h));
function readInput() {
  const k = (...n) => n.some((x) => keys.has(x));
  const kb = { throttle: k('w', 'arrowup') ? 1 : 0, brake: k('s', 'arrowdown') ? 1 : 0, steer: (k('d', 'arrowright') ? 1 : 0) - (k('a', 'arrowleft') ? 1 : 0), handbrake: keys.has(' ') };
  return mergeInputs(kb, touchCtl ? touchCtl.input : null); // teclado + tactil: los pedales pisan y la direccion se suma con tope
}

// camara de persecucion con retardo: look maqueta (ESTILO 2.4): FOV 44-50, ~30 grados de elevacion sobre el carro, mira lejos para ver la curva
const CAMV = { fov: 44, fovMax: 50, back: 14.5, backK: 0.12, up: 8.2, upK: 0.045, look: 18, lookY: 1.2 };
const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), heading: 0, slip: 0, init: false };
let fx = null; // humo y marcas del derrape (world/driftfx.js)
function updateCamera(dt) {
  const s = sim.state, camera = world.camera, sp = Math.hypot(s.vf, s.vl);
  if (!cam.init) { cam.heading = s.heading; }
  // la camara sigue ~55% del angulo de derrape (hacia donde se mueve el carro), con retardo: se ve el carro de lado sin marear
  const slipT = s.vf > 4 ? Math.max(-0.75, Math.min(0.75, s.beta || 0)) * 0.55 : 0;
  cam.slip += (slipT - cam.slip) * (cam.init ? 1 - Math.exp(-dt * 2.2) : 1);
  let d = s.heading + cam.slip - cam.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
  cam.heading += d * (cam.init ? 1 - Math.exp(-dt * 3.2) : 1);
  const sh = Math.sin(cam.heading), ch = Math.cos(cam.heading), back = CAMV.back + sp * CAMV.backK, up = CAMV.up + sp * CAMV.upK;
  const want = new THREE.Vector3(s.x - sh * back, s.y + up, s.z - ch * back);
  const k = cam.init ? 1 - Math.exp(-dt * 6) : 1;
  cam.pos.lerp(want, k);
  cam.pos.y = Math.max(cam.pos.y, heightAt(cam.pos.x, cam.pos.z) + 2.6); // nunca bajo el terreno
  const wantLook = new THREE.Vector3(s.x + sh * CAMV.look, s.y + CAMV.lookY, s.z + ch * CAMV.look);
  cam.look.lerp(wantLook, cam.init ? 1 - Math.exp(-dt * 8) : 1);
  cam.init = true;
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
  const fov = CAMV.fov + (CAMV.fovMax - CAMV.fov) * Math.min(1, Math.abs(sp) / CAR.vmaxRoad);
  if (Math.abs(fov - camera.fov) > 0.05) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 4)); camera.updateProjectionMatrix(); }
}

// ---- bucle ----
let lastT = 0, fpsAcc = 0, fpsN = 0, hudT = 0, perfN = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const rawDt = (t - lastT) / 1000 || 0.016, dt = Math.min(0.1, rawDt);
  lastT = t;
  const lvl = gov.push(rawDt);
  if (lvl != null) { // el aviso solo con F o ?dev=1 (no tapa el mapa ni sale en cada cambio)
    world.setQuality(lvl); fx?.setQuality(lvl); ev('quality', { level: lvl, ms: +gov.lastAvgMs.toFixed(1) });
    if ((showFps || DEV) && !bigmap.open) note(`rendimiento: calidad ${lvl} (${gov.lastAvgMs.toFixed(0)} ms/frame)`);
  }
  dayT = (dayT + dt / DAY_PERIOD_S) % 1;
  if (started && !nokey) { handover?.tick(); runEffects(ss.expireHandover()); } // tick antes de expirar: si la pestana estuvo congelada, el promote sale igual
  if (started && !paused) {
    advance(sim, readInput(), dt, heightAt, roadInfo, ENV);
    const s = sim.state, sp = Math.hypot(s.vf, s.vl);
    const heldMs = player && player.stats(1).held ? player.stats(1).heldSec * 1000 : 0;
    doActions(memory.update({
      now: t, pos: mpos(), vel: { x: Math.sin(s.heading) * s.vf + Math.cos(s.heading) * s.vl, y: Math.cos(s.heading) * s.vf - Math.sin(s.heading) * s.vl },
      memoryOn, approach: approachInfo(s, ZONES, roadInfo), speed: sp,
      chans: nokey ? { live: { state: 'playing', ageMs: 0 }, recall: { state: ch[1].state, placeId: null, heldMs: 0, firstAudio: false } } // sin Lyria: solo se usa la deteccion de region
        : { live: { state: ch[0].state, ageMs: t - liveOpenedAt }, recall: { state: ch[1].state, placeId: ch[1].placeId, heldMs, firstAudio: ch[1].first } },
    }));
    if (!nokey && (ch[0].state === 'playing' || ch[0].state === 'ready')) { // musica reactiva: solo al live (canal 0)
      const patch = reactive.update({ now: t, speed: sp, base: memory.base });
      if (patch) { link.send({ type: 'config', ch: 0, config: patch }); ev('reactive', patch); }
    } else reactive.update({ now: t, speed: sp, enabled: false });
  }
  const s = sim.state, ms = memory.getState(), ws = memory.weightsAt(mpos());
  willys.update(s, heightAt);
  if (fx && started && !paused) fx.update(s, dt, heightAt, world.palette?.night || 0); // humo y marcas de llanta del derrape
  if (CAMOVR.length === 6 && CAMOVR.every(Number.isFinite)) {
    const c = world.camera; c.position.set(CAMOVR[0], CAMOVR[1], CAMOVR[2]); c.lookAt(CAMOVR[3], CAMOVR[4], CAMOVR[5]);
    if (QS.get('fov') && c.fov !== Number(QS.get('fov'))) { c.fov = Number(QS.get('fov')); c.far = 30000; c.updateProjectionMatrix(); }
  } else updateCamera(dt);
  flashT = Math.max(0, flashT - dt);
  const glow = { [ms.livePlace || '']: memoryOn ? 0.7 : 0 };
  if (flashId && flashT > 0) glow[flashId] = Math.max(glow[flashId] || 0, flashT / 2);
  world.update({ t: t / 1000, dt, boost: fogBoost(s.x, s.z, 55), camPos: world.camera.position, glow, player: { x: s.x, z: s.z }, dayT });
  if (QS.get('nofog') === '1') { world.scene.fog.near = 1e6; world.scene.fog.far = 2e6; for (const c of world.cull) c.o.visible = true; world.sea.mesh.scale.set(6, 1, 6); }
  const hc = heightAt(s.x, s.z);
  world.shadows.set(0, s.x, hc + 0.22, s.z, s.heading, -s.pitch, s.roll, 4.6, 5.4); // sombra blob del Willys (instancia 0)
  world.render();
  const sounding = memoryOn && ms.livePlace ? ZONE_BY_ID[ms.livePlace].color : mixColor(ws.map((w) => ({ color: ZONE_BY_ID[w.id].color, w: w.w })));
  pushTrail(trail, s.x, s.z);
  if (bigmap.open) bigmap.draw(s, memoryOn ? ms.livePlace : null, t / 1000);
  minimap.draw(s, started ? sounding : null, t / 1000);
  if (t - hudT > 150) { hudT = t; renderHud(ms, ws); }
  if (QS.get('perf') === '1' && ++perfN <= 12) console.log('PERF ' + JSON.stringify(world.info())); // dev: triangulos y llamadas por consola
  if (showFps) {
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) {
      const i = world.info();
      $('fps').textContent = `${Math.round(fpsN / fpsAcc)} fps · ${(i.tris / 1000).toFixed(1)}k tris · ${i.calls} calls · Q${i.level} · ${world.palette.hour}`;
      fpsAcc = 0; fpsN = 0;
    }
  }
}

function renderHud(ms, ws) {
  if (ms.current) minimap.visited.add(ms.current);
  $('region').textContent = ms.current ? meta[ms.current].name : 'En camino';
  $('region').style.color = ms.current ? hex(ZONE_BY_ID[ms.current].color) : '#3a2418';
  $('sub').textContent = ms.current ? 'zona de ' + meta[ms.current].name + (ms.section >= 0 ? ` · seccion ${ms.section + 1}` : '') : 'mezcla del live por cercania';
  if (nokey) { // sin Lyria no hay mezcla: el HUD muestra de que region suena la playlist
    $('sub').textContent = SP.regionId ? 'Spotify · ' + meta[SP.regionId].name : 'Spotify';
    $('bars').innerHTML = ''; $('chans').textContent = '';
    $('spd').firstChild.textContent = Math.round(Math.abs(sim.state.speed) * 3.6);
    return;
  }
  $('bars').innerHTML = ws.map((w) => `<div class="bar"><span class="n">${meta[w.id].name}</span><div class="t"><div class="f" style="width:${Math.round(w.w * 100)}%;background:${hex(ZONE_BY_ID[w.id].color)}"></div></div><span class="p">${Math.round(w.w * 100)}%</span></div>`).join('');
  const line = (i, label) => {
    const st = player ? player.stats(i) : { heldSec: 0, held: false };
    const pid = i === 0 ? (memoryOn ? ms.livePlace : null) : ch[i].placeId;
    return `${label}: ${ch[i].state}${pid ? ` [${meta[pid]?.name}]` : i === 0 ? ' [mezcla]' : ''}${st.held ? ` HOLD ${st.heldSec.toFixed(1)}s` : ''}`;
  };
  $('chans').textContent = `${line(0, 'live  ')}\n${line(1, 'recall')}  fase: ${ms.phase}${ms.prewarm ? ' -> ' + meta[ms.prewarm].name : ''}`;
  $('spd').firstChild.textContent = Math.round(Math.abs(sim.state.speed) * 3.6);
}

// ---- inicio ----
async function start() {
  if (started) return;
  if (nokey) { startNoKey(); return; } // no se lee ni se guarda la key, no se crea Link/LocalLink ni sesion Lyria
  // modo directo (def.): el navegador habla con Google con la key del jugador; ?server=1 usa el servidor Node clasico
  const useServer = QS.get('server') === '1';
  let key = '', remember = false;
  if (!useServer) {
    key = ($('key')?.value || '').trim();
    if (!key) { const i = $('key'); if (i) { i.classList.add('bad'); i.focus(); } $('keyset')?.classList.add('need'); return; }
    remember = !!$('remember')?.checked; // se lee antes de quitar #start
  }
  started = true;
  $('start').remove();
  document.body.classList.add('on-air'); // ecualizador del HUD
  player = new Player();
  await player.resume();
  logger = new Logger({ send: (o) => link.send(o) });
  const onAudio = (i, buf) => { logger?.noteAudio(); if (i === 1 && isFree(ch[1])) return; player.push(i, buf); };
  link = useServer ? new Link({ onAudio, onMessage, onDisconnect: note }) : new LocalLink({ onAudio, onMessage, onDisconnect: note, key });
  await link.connect();
  if (!useServer) { saveKey(key, remember); $('key')?.classList.remove('bad'); $('keyset')?.classList.remove('need'); }
  logger.start();
  handover = createHandover({ link, player, ss, ch, onStart: (h) => ev('recall_start', { place: h?.placeId, heldSec: +player.stats(1).heldSec.toFixed(2) }) });
  const near = memory.weightsAt(mpos())[0].id; // la region mas cercana (Medellin, donde arranca el carro)
  const p = byId[near];
  memory.setLive(near);
  liveTempo = tempoConfig(p);
  liveOpenedAt = performance.now();
  const sid = ss.beginOpen(0, near);
  link.send({ type: 'open', ch: 0, sid, prompts: memory.toPrompts(memory.weightsAt(mpos())), config: cfgOf(p), play: true });
  ev('live_open', { place: near });
}
// ---- modo sin key: playlists de Spotify (iFrame API cargada solo aqui) ----
const SP = { ctl: null, current: null, regionId: null, auto: true, fold: false };
const spPlaces = () => Object.values(byId);
function spUpdateUi() {
  $('sptitle').textContent = SP.regionId ? 'Spotify · ' + meta[SP.regionId].name : 'Spotify';
  const url = playlistUrl(SP.current);
  if (url) $('splink').href = url;
  $('spauto').textContent = `Cambiar con la region: ${SP.auto ? 'si' : 'no'}`;
  $('spauto').classList.toggle('on', SP.auto);
  $('sp').classList.toggle('fold', SP.fold);
  $('spbtn').setAttribute('aria-expanded', String(!SP.fold));
}
function spLoad(id, regionId) { // carga la playlist en el embed e intenta reproducir (el navegador puede bloquear el autoplay)
  SP.current = id; SP.regionId = regionId; spUpdateUi();
  ev('spotify_load', { place: regionId, id });
  if (!SP.ctl) return; // el embed aun no esta listo: nace con SP.current
  try { SP.ctl.loadUri(playlistUri(id)); SP.ctl.play(); } catch (e) { console.warn('spotify', e); }
}
function spotifyEnter(regionId) { // misma deteccion que la tarjeta de region: accion `enter` de memory.update
  const id = nextPlaylist({ current: SP.current, regionId, auto: SP.auto, places: spPlaces() });
  if (id) spLoad(id, regionId); // sin recarga si ya suena esa; afuera de una region se mantiene la ultima
}
function startNoKey() {
  started = true; memoryOn = false;
  $('start').remove();
  document.body.classList.add('nokey', 'on-air');
  if (touchCtl) touchCtl.memBtn.style.display = 'none';
  SP.fold = document.body.classList.contains('touch'); // en celular el panel nace plegado
  const ini = initialPlaylist({ nearestId: memory.weightsAt(mpos())[0].id, places: spPlaces() });
  if (ini) { SP.current = ini.id; SP.regionId = ini.regionId; }
  spUpdateUi();
  $('spbtn').onclick = () => { SP.fold = !SP.fold; spUpdateUi(); };
  $('spauto').onclick = () => { SP.auto = !SP.auto; spUpdateUi(); if (SP.auto) { const c = memory.getState().current; if (c) spotifyEnter(c); } };
  window.onSpotifyIframeApiReady = (api) => {
    api.createController($('spembed'), { uri: playlistUri(SP.current), width: '100%', height: 152 }, (c) => {
      SP.ctl = c;
      c.addListener('ready', () => { try { c.play(); } catch {} });
    });
  };
  const sc = document.createElement('script'); sc.src = 'https://open.spotify.com/embed/iframe-api/v1'; sc.async = true; document.body.append(sc);
  ev('nokey_start', {});
}
function applyPauseUI() {
  document.body.classList.toggle('on-air', !paused);
  $('pause').textContent = paused ? 'Reanudar (P)' : 'Pausa (P)';
  touchCtl?.setPaused(paused);
}
async function togglePause() {
  if (!player && !nokey) return;
  paused = !paused; autoPaused = false; gov.rewarm();
  applyPauseUI();
  if (nokey) return; // sin Lyria no hay audio propio que suspender (el embed de Spotify se controla en su panel)
  if (paused) { link.send({ type: 'pause' }); await player.suspend(); }
  else { player.reset(0); player.reset(1); link.send({ type: 'play' }); await player.resume(); }
}
// Reabre el canal live si se murio solo (red, corte de Lyria a ~601 s, hipo): reusa la mezcla actual y NO lleva seed (continua)
function openLive() {
  const sid = ss.beginOpen(0, memory.livePlace ?? null);
  player.reset(0); player.restore(0); // limpia colas viejas y garantiza gain 1 (pudo morir a mitad de un fade)
  if (!isFree(ch[1]) && !memory.prewarm) { // recall huerfano: se quedo colgado sin llegar a promover
    link.send({ type: 'close', ch: 1 }); player.reset(1); ss.closeLocal(1);
    ev('reopen_orphan_recall', {});
  }
  link.send({ type: 'open', ch: 0, sid, prompts: memory.toPrompts(memory.lastSent || memory.weightsAt(mpos())), config: liveOpenCfg(), play: !paused });
  reactive.markSent(); // la sesion nueva ya arranca con la config dinamica actual
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
  if (nokey) return; // sin Lyria no hay Memoria
  memoryOn = !memoryOn;
  $('mem').textContent = `Memoria: ${memoryOn ? 'si' : 'no'} (M)`;
  $('mem').classList.toggle('on', memoryOn);
  touchCtl?.setMemory(memoryOn);
  ev('memory', { on: memoryOn });
}

// pantalla de carga: barra + texto; se quita con fundido al terminar
const loading = (p, msg) => { $('lbar').style.width = Math.round(p * 100) + '%'; if (msg) $('lmsg').textContent = msg; };
async function warmUp() { // primer update + precompilado de shaders + un render, todo tras la pantalla de carga
  loading(0.96, 'Preparando los colores');
  updateCamera(0.016);
  const s = sim.state;
  world.update({ t: 0, dt: 0.016, camPos: world.camera.position, player: { x: s.x, z: s.z }, dayT });
  await tick();
  await world.compile();
  world.render();
  loading(1, '¡Listo!');
  await tick();
  const l = $('loading'); l.classList.add('done'); setTimeout(() => l.remove(), 500);
}

async function init() {
  const data = (await (await fetch('places.json')).json()).places;
  byId = Object.fromEntries(data.map((p) => [p.id, p]));
  meta = byId;
  memory = new MemoryController(memoryPlaces(Object.fromEntries(data.map((p) => [p.id, p.prompt])), Object.fromEntries(data.map((p) => [p.id, p.sections])), Object.fromEntries(data.map((p) => [p.id, { density: p.density, brightness: p.brightness }]))), { forgetMs: 60000, sections: true });
  loading(0.02, 'Armando Colombia');
  await tick();
  world = await World.create($('view'), { antialias: QS.get('aa') === '1', startT: dayT, terrainSink: QS.get('roadfix') === '0' ? 0 : undefined }, loading, tick);
  willys = new Willys();
  world.scene.add(willys.root);
  fx = new DriftFx(world.scene); fx.setQuality(world.level);
  await tick();
  const roads = ROADS.map((R) => { const pts = []; for (let i = 0; i < R.N; i += 5) pts.push([R.px[i], R.pz[i]]); const last = [R.px[R.N - 1], R.pz[R.N - 1]]; const p = pts[pts.length - 1]; if (p[0] !== last[0] || p[1] !== last[1]) pts.push(last); return pts; });
  loading(0.95, 'Dibujando el mapa');
  await tick();
  const mapWorld = { ...WORLD, heightAt: baseHeight, countrySD, outline: POLY, roads, zones: ZONES }; // minimapa: terreno horneado con la altura base (sin carreteras)
  minimap = new Minimap($('minimap'), mapWorld);
  bigmap = new BigMap($('bigmap'), { ...mapWorld, heightAt }, { trail, visited: minimap.visited });
  $('minimap').onclick = () => bigmap.toggle();
  if (QS.get('map') === '1') bigmap.toggle(true); // dev: abrir el mapa grande al iniciar
  $('bigmap').onclick = (e) => { if (e.target === $('bigmap')) bigmap.toggle(false); };
  const k = loadKey(); // precarga la key guardada (el storage global puede estar bloqueado: key-store lo maneja)
  if (k.key) { $('key').value = k.key; $('remember').checked = k.remember; }
  if (QS.get('server') === '1') $('keyset').style.display = 'none'; // modo servidor: la key del jugador no aplica
  if (nokey || QS.get('server') === '1') { if (nokey) $('keyset').style.display = 'none'; $('nk').style.display = 'none'; } // ?nokey=1: sin bloque de key
  $('nokey').onclick = (e) => { e.stopPropagation(); nokey = true; start(); };
  $('start').onclick = (e) => { if (!e.target.closest('#keyset, #nk')) start(); }; // clics en la key/recordar no arrancan el juego
  if (QS.get('fps') === '1') { showFps = true; $('fps').classList.remove('hidden'); } // dev: overlay de fps/triangulos desde el inicio
  if (ZONE_BY_ID[QS.get('card')]) showCard(ZONE_BY_ID[QS.get('card')]); // dev: ver la tarjeta de una region sin entrar
  if (QS.get('preview') === '1') { $('start').style.display = 'none'; if (QS.get('hud') === '0') setObserver(true); } // dev: capturas sin pantalla de inicio
  $('eye').onclick = (e) => { setObserver(); e.target.blur?.(); $('eye').blur(); };
  $('mem').onclick = (e) => { toggleMemory(); e.target.blur(); };
  $('pause').onclick = (e) => { togglePause(); e.target.blur(); };
  if (touchEnabled()) { // celular/tablet (o ?touch=1): agrega los controles tactiles y compacta el HUD
    touchCtl = new TouchControls({ onMap: () => bigmap.toggle(), onMemory: () => toggleMemory(), onPause: () => togglePause() });
    touchCtl.setMemory(memoryOn); touchCtl.setPaused(paused); // estado inicial de los botones
    document.body.classList.add('touch');
  }
  addEventListener('keydown', (e) => {
    if (e.target?.tagName === 'INPUT') return; // mientras se escribe la key no corren los atajos
    const k = e.key.toLowerCase();
    if (k === 'n') bigmap.toggle();
    else if (k === 'escape') bigmap.toggle(false);
    else if (k === 'm') toggleMemory();
    else if (k === 'p') togglePause();
    else if (k === 'h') setObserver();
    else if (k === 't') { dayT = nextHourStart(dayT); note('hora: ' + paletteAt(dayT).hour); } // avanza una hora del ciclo de dia
    else if (k === 'f') { showFps = !showFps; $('fps').classList.toggle('hidden', !showFps); }
    else if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) { keys.add(k); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  addEventListener('pointerdown', () => { if (player && player.ctx.state === 'suspended') player.resume().catch(() => {}); }, { passive: true }); // iOS puede dejar el audio suspendido tras una interrupcion
  // Al bloquear la pantalla / cambiar de app se pausa limpio; al volver se reanuda sin reusar audio viejo (evita bucles de cola rancia)
  addEventListener('visibilitychange', () => {
    gov.rewarm(); // al volver de otra pestana los primeros frames no cuentan
    if (!started || !player) return;
    if (document.hidden && !paused) {
      paused = true; autoPaused = true; applyPauseUI();
      link.send({ type: 'pause' }); player.suspend().catch(() => {});
    } else if (!document.hidden && autoPaused) {
      autoPaused = false; paused = false; applyPauseUI();
      if (!ss.handover) { player.reset(0); player.reset(1); }
      link.send({ type: 'play' }); player.resume().catch(() => {});
    }
  });
  await warmUp();
  gov.rewarm(); lastT = performance.now();
  requestAnimationFrame(frame);
}
init().catch((e) => { console.error('init', e); const m = $('lmsg'); if (m) m.textContent = 'No se pudo cargar: ' + (e?.message || e); });
