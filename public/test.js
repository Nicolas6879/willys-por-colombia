// Pagina de prueba de audio (sin 3D): viajar = mezclar dos lugares en el canal live; entrar = recall con la seed
// del lugar (sesion nueva, crossfade y promote). "Memoria no" = entrar solo cambia pesos del live.
import { Player } from './audio.js';
import { Link } from './ws.js';
import { Logger } from './logger.js';
import { placeConfig } from './memory.js';

const $ = (id) => document.getElementById(id);
const XFADE_MS = 3000;
let places = [], byId = {};
let player = null, link = null, logger = null;
let origin = null, target = null, mix = 0;
let paused = false;
const ch = [{ state: '-', first: null, place: '' }, { state: '-', first: null, place: '' }];
const firstWaiters = [[], []];
let handover = null; // { placeId|null } mientras un recall se esta puliendo para entrar (o rotacion)
let promoteTimer = 0;
let notes = '';

function render() {
  const lines = [0, 1].map((i) => {
    const s = player ? player.stats(i) : {};
    return `canal ${i} (${i ? 'recall' : 'live'}): ${ch[i].state}${ch[i].place ? ' [' + ch[i].place + ']' : ''}` +
      `${ch[i].first != null ? ' first_audio=' + ch[i].first + 'ms' : ''}` +
      `${player ? ` ahead=${s.ahead.toFixed(1)}s${s.held ? ` HOLD=${s.heldSec.toFixed(1)}s` : ''} underruns=${s.underruns}` : ''}`;
  });
  $('status').textContent = lines.join('\n') + (notes ? '\n' + notes : '');
}
const note = (t) => { notes = t; logger?.event('note', { t }); render(); };

function placePrompts() {
  const a = origin && byId[origin], b = byId[target];
  if (!a || a === b) return [{ text: b.prompt, weight: 1 }];
  return [{ text: a.prompt, weight: +(1 - mix).toFixed(3) }, { text: b.prompt, weight: +mix.toFixed(3) }];
}
const cfgOf = placeConfig;
const firstAudio = (i) => new Promise((res) => { if (ch[i].first != null) res(); else firstWaiters[i].push(res); });

async function ensureStarted() {
  if (player) { player.resume(); return; }
  player = new Player();
  await player.resume();
  logger = new Logger({ send: (o) => link.send(o) });
  link = new Link({ onAudio, onMessage, onDisconnect: (why) => note(why) });
  await link.connect();
  logger.start();
  setInterval(render, 400);
}

function onAudio(i, buf) { logger?.noteAudio(); player.push(i, buf); }

function onMessage(m) {
  logger?.event('srv_' + m.type, { ch: m.ch, state: m.state, ms: m.ms });
  if (m.type === 'status') ch[m.ch].state = m.state, m.state === 'closed' && Object.assign(ch[m.ch], { first: null, place: '' });
  else if (m.type === 'first_audio') { ch[m.ch].first = m.ms; firstWaiters[m.ch].splice(0).forEach((f) => f()); if (handover && m.ch === 1) startHandover(); }
  else if (m.type === 'filtered') note(`prompt filtrado en canal ${m.ch}: ${m.reason}`);
  else if (m.type === 'closed') { ch[m.ch].state = `closed (${m.code ?? '-'} ${m.reason || ''})`; ch[m.ch].first = null; ch[m.ch].place = ''; }
  else if (m.type === 'error') note('error: ' + m.message);
  else if (m.type === 'rotate_soon') {
    if (handover) return; // ya hay un recall en curso: no lo pisar
    note('rotando sesion live (limite de 10 min)');
    handover = { placeId: null };
    openRecall(placePrompts(), {}, '(rotacion)');
  } else if (m.type === 'promoted') {
    clearTimeout(promoteTimer);
    player.promote();
    ch[0] = { ...ch[1], state: 'playing' }; ch[1] = { state: 'closed', first: null, place: '' };
    if (handover?.placeId) { origin = handover.placeId; target = origin; mix = 0; $('mix').value = 0; $('mixv').textContent = '0.00'; refreshUi(); }
    handover = null;
  }
  render();
}

function openRecall(prompts, config, label) {
  player.reset(1);
  player.hold(1, true);
  ch[1] = { state: 'connecting', first: null, place: label };
  link.send({ type: 'open', ch: 1, prompts, config, play: true });
}

// Recall listo (llego el primer audio): soltar desde el primer bloque, crossfade y promote
function startHandover() {
  clearTimeout(promoteTimer);
  const h = handover;
  if (!h || h.started) return;
  h.started = true;
  player.hold(1, false);
  if (ch[0].state.startsWith('closed') || ch[0].state === '-') { link.send({ type: 'promote', from: 'recall' }); return; }
  player.crossfade(0, 1, XFADE_MS);
  promoteTimer = setTimeout(() => { if (handover?.started) link.send({ type: 'promote', from: 'recall' }); }, XFADE_MS + 100);
}

async function travel() {
  await ensureStarted();
  const p = placePrompts();
  if (ch[0].state === '-' || ch[0].state.startsWith('closed')) {
    const o = byId[origin || target];
    link.send({ type: 'open', ch: 0, prompts: p, config: cfgOf(o), play: true });
    ch[0] = { state: 'connecting', first: null, place: o.name };
  } else link.send({ type: 'prompts', ch: 0, prompts: p });
}

async function prewarm() {
  await ensureStarted();
  const pl = byId[target];
  openRecall([{ text: pl.prompt, weight: 1 }], cfgOf(pl), pl.name);
}

async function enter() {
  await ensureStarted();
  const pl = byId[target];
  if (!$('memory').checked) { // sin memoria: solo pesos del live
    origin = target; mix = 0; $('mix').value = 0; $('mixv').textContent = '0.00'; refreshUi();
    if (ch[0].state === '-') return travel();
    link.send({ type: 'prompts', ch: 0, prompts: [{ text: pl.prompt, weight: 1 }] });
    return;
  }
  handover = { placeId: pl.id };
  if (ch[1].place !== pl.name || ch[1].state.startsWith('closed')) await prewarm();
  if (ch[1].first != null) startHandover(); // ya habia llegado audio: el listener de first_audio no se disparara de nuevo
}

function refreshUi() {
  $('origin').textContent = origin ? byId[origin].name : '-';
  $('prewarm').textContent = `Pre-calentar recall de ${byId[target].name}`;
  $('enter').textContent = `Entrar a ${byId[target].name}`;
  document.querySelectorAll('#places button').forEach((b) => b.classList.toggle('sel', b.dataset.id === target));
}

async function init() {
  places = (await (await fetch('places.json')).json()).places;
  byId = Object.fromEntries(places.map((p) => [p.id, p]));
  origin = places[0].id; target = places[1].id;
  for (const p of places) {
    const b = document.createElement('button');
    b.textContent = p.name; b.dataset.id = p.id;
    b.onclick = () => { target = p.id; refreshUi(); if (ch[0].state === 'playing') link.send({ type: 'prompts', ch: 0, prompts: placePrompts() }); };
    $('places').appendChild(b);
  }
  $('mix').oninput = () => {
    mix = Number($('mix').value); $('mixv').textContent = mix.toFixed(2);
    if (ch[0].state === 'playing' || ch[0].state === 'ready') link.send({ type: 'prompts', ch: 0, prompts: placePrompts() });
  };
  $('travel').onclick = travel;
  $('prewarm').onclick = prewarm;
  $('enter').onclick = enter;
  $('vol').oninput = () => player?.setMasterGain(Number($('vol').value));
  $('pause').onclick = async () => {
    if (!player) return;
    paused = !paused;
    if (paused) { link.send({ type: 'pause' }); await player.suspend(); }
    else { player.reset(0); player.reset(1); link.send({ type: 'play' }); await player.resume(); }
    $('pause').textContent = paused ? 'Reanudar' : 'Pausa';
  };
  refreshUi(); render();
}
init();
