// Simulacion SIN navegador (G2): un conductor scriptado recorre la RED de carreteras (Medellin -> Caribe -> Santander -> Medellin) y alimenta
// memory.js + SessionState con un servidor falso (first_audio ~3.8 s tras el open, promoted tras el promote). Mismos eventos que game.js.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MemoryController, placeConfig } from './public/memory.js';
import { ReactiveMusic } from './public/reactive.js';
import { SessionState, isFree } from './public/session-state.js';
import { createState, createSim, advance } from './public/vehicle.js';
import { heightAt } from './public/world/terrain.js';
import { ENV } from './public/world/env.js';
import { roadInfo, roadAt, ROADS } from './public/world/road.js';
import { ZONES, ZONE_BY_ID, memoryPlaces } from './public/world/regions.js';
import { approachInfo } from './public/approach.js';
import { sectionIndex, sectionText, sectionWeight } from './public/sections.js';

const places = JSON.parse(readFileSync(new URL('./public/places.json', import.meta.url))).places;
const P = Object.fromEntries(places.map((p) => [p.id, p]));
const prompts = Object.fromEntries(places.map((p) => [p.id, p.prompt]));
const secDefs = Object.fromEntries(places.map((p) => [p.id, p.sections]));
const secs = Object.fromEntries(places.map((p) => [p.id, p.sections.map(sectionText)])); // textos de las secciones
const bases = Object.fromEntries(places.map((p) => [p.id, { density: p.density, brightness: p.brightness }]));
const FIRST_AUDIO_MS = 3800, XFADE_MS = 3000, FRAME = 1 / 60, CRUISE = 24;
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };
const cfgOf = placeConfig; // como game.js

// ---- ruta por la red: lista de regiones -> polilinea densa que sigue los tramos (en el sentido que toque)
function buildPath(route) {
  const pts = [], centers = []; // centers[k] = indice del centro de route[k]
  for (let k = 0; k < route.length - 1; k++) {
    const a = route[k], b = route[k + 1];
    const e = ROADS.findIndex((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
    assert.ok(e >= 0, `no hay tramo ${a}-${b}`);
    const R = ROADS[e], fwd = R.a === a, idx = [...Array(R.N).keys()];
    if (!fwd) idx.reverse();
    if (k === 0) centers.push(0); else pts.pop();
    for (const i of idx) pts.push([R.px[i], R.pz[i]]);
    centers.push(pts.length - 1);
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, centers };
}

// ---- simulacion
function drive({ memoryOn = true, route, dwell = {}, maxSec = 600, until, startSec = 0 }) {
  const mem = new MemoryController(memoryPlaces(prompts, secDefs, bases), { forgetMs: 60000, sections: true });
  const rm = new ReactiveMusic(); // como game.js: la config dinamica va SOLO al canal live (0)
  const ss = new SessionState();
  const path = buildPath(route), r0 = roadAt(12);
  const sim = createSim(createState(r0.x, r0.z, Math.atan2(r0.tx, r0.tz), r0.h));
  const timers = [], log = [], server = { live: route[0], recall: null, maxSessions: 1 };
  let now = startSec * 1000;
  const at = (ms, fn) => timers.push({ at: now + ms, fn });
  const ev = (name, data = {}) => log.push({ t: now, name, ...data });
  const sessions = () => (server.live ? 1 : 0) + (server.recall ? 1 : 0);
  const track = () => { server.maxSessions = Math.max(server.maxSessions, sessions()); assert.ok(sessions() <= 2, 'nunca mas de 2 sesiones'); };

  const fromServer = (m) => runEffects(ss.onMessage(m));
  function runEffects(effects) {
    for (const e of effects) {
      if (e.type === 'open') {
        assert.ok(!server.recall, 'abrir recall con otro ocupado');
        server.recall = { placeId: e.placeId, sid: e.sid }; track();
        ev('recall_open', { place: e.placeId, kind: e.kind, prompts: [{ text: prompts[e.placeId], weight: 1 }], config: cfgOf(P[e.placeId]) }); // como openRecall de game.js
        fromServer({ type: 'status', ch: 1, sid: e.sid, state: 'connecting' });
        at(FIRST_AUDIO_MS, () => {
          if (!server.recall || server.recall.sid !== e.sid) return;
          fromServer({ type: 'status', ch: 1, sid: e.sid, state: 'playing' });
          fromServer({ type: 'first_audio', ch: 1, sid: e.sid, ms: FIRST_AUDIO_MS });
        });
      } else if (e.type === 'startHandover') {
        ev('recall_start');
        const sid = ss.ch[1].sid;
        at(XFADE_MS + 100, () => {
          if (!server.recall || server.recall.sid !== sid) return;
          server.live = server.recall.placeId; server.recall = null;
          fromServer({ type: 'promoted', sid });
        });
      } else if (e.type === 'abortHandover') mem.notifyAbort();
      else if (e.type === 'promote') { ev('promote', { place: e.placeId }); mem.notifyPromoted(e.placeId); rm.resync(); }
    }
  }
  function doActions(actions) {
    for (const a of actions) {
      if (a.type === 'prewarm') { ev('prewarm', { place: a.placeId }); runEffects(ss.requestPrewarm(a.placeId)); }
      else if (a.type === 'cancelPrewarm') { ev('cancel', { reason: a.reason }); server.recall = null; ss.closeLocal(1); }
      else if (a.type === 'enter') { ev('enter', { place: a.placeId, memory: a.memory, reason: a.reason }); if (a.memory) runEffects(ss.requestEnter(a.placeId)); }
      else if (a.type === 'leave') ev('leave', { place: a.placeId });
      else if (a.type === 'livePrompts') ev('prompts', { n: a.prompts.length, texts: a.prompts.map((q) => q.text), weights: a.prompts.map((q) => q.weight) });
    }
  }

  // live arranca con la region inicial (como game.js start())
  const near = mem.weightsAt({ x: sim.state.x, y: sim.state.z })[0].id;
  assert.equal(near, route[0]);
  mem.setLive(near);
  ss.beginOpen(0, near); ss.ch[0].state = 'playing';
  ev('live_open', { place: near, prompts: mem.toPrompts(mem.weightsAt({ x: sim.state.x, y: sim.state.z })), config: cfgOf(P[near]) });

  // conductor: persecucion al punto de la ruta ~20 u por delante; para en el centro de cada region `dwell` segundos
  const drv = { i: 0, k: 0, dwellUntil: -1, done: false };
  function driver(s, t) {
    const { pts, cum, centers } = path;
    let guard = 0;
    // indice de progreso = el punto mas cercano en una ventana hacia adelante (la polilinea hace horquillas en los centros de region: el primer minimo local no basta)
    for (let q = drv.i + 1, bd = Math.hypot(pts[drv.i][0] - s.x, pts[drv.i][1] - s.z); q < Math.min(pts.length, drv.i + 40); q++) { const d = Math.hypot(pts[q][0] - s.x, pts[q][1] - s.z); if (d < bd - 1e-9) { bd = d; drv.i = q; } }
    // llegada al centro de route[k]
    if (drv.k < route.length && Math.hypot(s.x - ZONE_BY_ID[route[drv.k]].cx, s.z - ZONE_BY_ID[route[drv.k]].cz) < 25 && drv.i >= centers[drv.k] - 14) {
      ev('reach', { place: route[drv.k] });
      const d = dwell[route[drv.k]] || 0;
      if (d) drv.dwellUntil = t + d;
      drv.k++;
      if (drv.k === route.length) { drv.done = true; drv.finishAt = t + d + 1; }
    }
    if (drv.done || t < drv.dwellUntil) return { throttle: 0, brake: Math.hypot(s.vf, s.vl) > 0.5 ? 1 : 0, steer: 0 }; // parado: sin freno (si no, daria marcha atras)
    if (drv.dwellUntil > 0 && !drv.departed?.[drv.k]) { (drv.departed ??= {})[drv.k] = true; ev('depart', { place: route[drv.k - 1] }); }
    let j = drv.i; while (j < pts.length - 1 && cum[j] - cum[drv.i] < 20) j++;
    const err = Math.atan2(pts[j][0] - s.x, pts[j][1] - s.z) - s.heading, e = Math.atan2(Math.sin(err), Math.cos(err));
    const sp = Math.hypot(s.vf, s.vl);
    return { throttle: sp < CRUISE && (Math.abs(e) < 0.6 || sp < 6) ? 1 : 0, brake: sp > CRUISE + 2 ? 0.3 : 0, steer: -Math.max(-1, Math.min(1, e * 2.2)) };
  }

  while (now < maxSec * 1000) {
    now += FRAME * 1000;
    for (const t of timers.filter((x) => x.at <= now)) { timers.splice(timers.indexOf(t), 1); t.fn(); }
    advance(sim, driver(sim.state, now / 1000), FRAME, heightAt, roadInfo, ENV);
    const c = sim.state, ap = approachInfo(c, ZONES, roadInfo);
    const lastOpen = log.findLast((l) => l.name === 'recall_open');
    doActions(mem.update({
      now, pos: { x: c.x, y: c.z }, vel: { x: Math.sin(c.heading) * c.vf, y: Math.cos(c.heading) * c.vf }, memoryOn,
      approach: ap, speed: Math.hypot(c.vf, c.vl),
      chans: { live: { state: ss.ch[0].state, ageMs: 0 }, recall: { state: ss.ch[1].state, placeId: ss.ch[1].placeId, heldMs: ss.ch[1].first != null ? now - (lastOpen?.t ?? now) - FIRST_AUDIO_MS : 0, firstAudio: ss.ch[1].first } },
    }));
    if (ss.ch[0].state === 'playing') { const patch = rm.update({ now, speed: Math.hypot(c.vf, c.vl), base: mem.base }); if (patch) ev('reactive', { ch: 0, live: server.live, patch }); }
    track();
    if (drv.done && !until && now / 1000 >= drv.finishAt) break;
    if (until?.(c, log, now)) break;
  }
  return { log, sim, mem, ss, server, now, path };
}

const first = (log, name, f = () => true) => log.find((l) => l.name === name && f(l));
const textsAt = (log, t) => log.findLast((l) => l.name === 'prompts' && l.t <= t)?.texts;
const hasSec = (texts, id, k) => texts?.includes(secs[id][k]);

// secciones: comprueba +25/+50/+70 (±1 s) desde `since` dentro de la region `id`; devuelve los desfases medidos (ms)
function checkSections(log, id, since, label) {
  const after = log.filter((l) => l.name === 'prompts' && l.t >= since);
  const t0 = after.find((l) => hasSec(l.texts, id, 0)), t1 = after.find((l) => hasSec(l.texts, id, 1));
  const t2 = after.find((l) => l.t > (t1?.t ?? Infinity) && !hasSec(l.texts, id, 1) && l.texts.includes(prompts[id]) && l.texts.length === 1);
  assert.ok(t0 && t1 && t2, `${label}: aparecieron las 3 transiciones`);
  const d0 = t0.t - since, d1 = t1.t - since, d2 = t2.t - since;
  assert.ok(d0 >= 25000 && d0 < 26000, `${label}: seccion 0 a +${d0 / 1000}s`);
  assert.ok(d1 >= 50000 && d1 < 51000, `${label}: seccion 1 a +${d1 / 1000}s`);
  assert.ok(d2 >= 70000 && d2 < 71000, `${label}: solo base a +${d2 / 1000}s`);
  assert.ok(!hasSec(textsAt(log, since + 24000), id, 0) && !hasSec(textsAt(log, since + 24000), id, 1), 'antes de +25 s solo base');
  const mid = textsAt(log, since + 30000); assert.ok(mid.includes(prompts[id]) && hasSec(mid, id, 0) && mid.length === 2, 'a +30 s: base + seccion 0');
  const mid2 = textsAt(log, since + 55000); assert.ok(mid2.includes(prompts[id]) && hasSec(mid2, id, 1) && !hasSec(mid2, id, 0) && mid2.length === 2, 'a +55 s: base + seccion 1');
  const w = after.find((l) => hasSec(l.texts, id, 0)).weights; assert.deepEqual(w, [1, sectionWeight(secDefs[id][0])]);
  return [d0, d1, d2];
}

// ---- escenario principal: Medellin -> Caribe -> Santander -> Medellin, parando 80 s en Medellin (inicio y vuelta) y en el Caribe
const ROUTE = ['medellin', 'caribe', 'santander', 'medellin'];
const DWELL = { medellin: 80, caribe: 80 };
let main;
ok('red completa Medellin -> Caribe -> Santander -> Medellin con Memoria: prewarm >=3 s, handover en cada neblina, max 2 sesiones', () => {
  main = drive({ route: ROUTE, dwell: DWELL, maxSec: 700 });
  const { log } = main;
  if (process.env.SIM_DEBUG) console.log(log.filter((l) => l.name !== 'prompts').map((l) => `${(l.t / 1000).toFixed(1)} ${l.name} ${l.place || ''} ${l.reason || ''}`).join(String.fromCharCode(10)));
  assert.equal(log.filter((l) => l.name === 'reach').map((l) => l.place).join(','), ROUTE.join(','), 'visito toda la ruta');
  for (const id of ['caribe', 'santander', 'medellin']) {
    const enter = log.find((l) => l.name === 'enter' && l.place === id && l.memory);
    assert.ok(enter, 'enter con memoria en ' + id);
    const pre = log.findLast((l) => l.name === 'prewarm' && l.place === id && l.t <= enter.t);
    assert.ok(pre, 'prewarm de ' + id);
    const margin = (enter.t - pre.t) / 1000;
    assert.ok(margin >= 3, `${id}: margen prewarm -> entrada ${margin.toFixed(2)} s`);
    assert.ok(pre.t + FIRST_AUDIO_MS <= enter.t, id + ': el audio del recall ya estaba listo al cruzar la neblina');
    const start = log.find((l) => l.name === 'recall_start' && l.t >= enter.t);
    assert.ok(start && start.t - enter.t < 200, id + ': handover empieza al cruzar la neblina');
    const prom = log.find((l) => l.name === 'promote' && l.t >= start.t);
    assert.equal(prom.place, id);
    assert.ok(prom.t - start.t >= XFADE_MS, 'crossfade de 3 s antes del promote');
    console.log(`   ${id.padEnd(9)} prewarm t=${(pre.t / 1000).toFixed(1)}s  enter t=${(enter.t / 1000).toFixed(1)}s  margen=${margin.toFixed(1)}s  promote t=${(prom.t / 1000).toFixed(1)}s`);
  }
  assert.equal(log.filter((l) => l.name === 'cancel').length, 0, 'sin cancelaciones');
  assert.equal(log.filter((l) => l.name === 'prewarm').length, 3, 'un prewarm por region nueva, ninguno espurio');
  assert.ok(main.server.maxSessions <= 2);
  assert.ok(isFree(main.ss.ch[1]), 'recall libre al final');
});

ok('tiempos entre regiones por carretera a crucero: 30-55 s (centro a centro; hasta 60 s Medellin-Caribe)', () => {
  const { log } = main;
  const reach = log.filter((l) => l.name === 'reach'), dep = log.filter((l) => l.name === 'depart');
  assert.equal(dep.length, 3, 'salidas de Medellin, Caribe y Santander');
  const legs = [], starts = dep.map((d) => d.t);
  for (let i = 0; i < 3; i++) legs.push((reach[i + 1].t - starts[i]) / 1000);
  console.log(`   Medellin->Caribe ${legs[0].toFixed(1)} s, Caribe->Santander ${legs[1].toFixed(1)} s, Santander->Medellin ${legs[2].toFixed(1)} s`);
  legs.forEach((v, i) => assert.ok(v >= 30 && v <= (i === 0 ? 60 : 55), 'tramo ' + i + ': ' + v));
});

ok('secciones: dentro de la region (tras el promote) a +25 s / +50 s / +70 s; igual al inicio y al volver a Medellin', () => {
  const { log } = main;
  // Caribe: desde el promote
  const pc = log.find((l) => l.name === 'promote' && l.place === 'caribe');
  const dc = checkSections(log, 'caribe', pc.t, 'Caribe');
  // Medellin al inicio (live) y a la vuelta (promote tras otra region)
  const d0 = checkSections(log, 'medellin', 0, 'Medellin inicio');
  const pm = log.find((l) => l.name === 'promote' && l.place === 'medellin');
  const d1 = checkSections(log, 'medellin', pm.t, 'Medellin vuelta');
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(d0[i] - d1[i]) < 150, `la visita de vuelta arranca identica (${d0[i]} vs ${d1[i]})`);
  console.log(`   Caribe: +${dc.map((v) => (v / 1000).toFixed(1)).join(' / +')} s ; Medellin inicio ${d0.map((v) => (v / 1000).toFixed(1)).join('/')} ; vuelta ${d1.map((v) => (v / 1000).toFixed(1)).join('/')}`);
  // el rate limit de livePrompts se respeta en toda la simulacion
  const ts = log.filter((l) => l.name === 'prompts').map((l) => l.t);
  for (let i = 1; i < ts.length; i++) assert.ok(ts[i] - ts[i - 1] >= 699, 'rate limit 700 ms');
  assert.ok(log.filter((l) => l.name === 'prompts').every((l) => l.n <= 3));
});

ok('al salir de la region los prompts secundarios se quitan y vuelve la mezcla normal de bases', () => {
  const { log } = main;
  const leave = log.find((l) => l.name === 'leave' && l.place === 'caribe');
  assert.ok(leave, 'salio del Caribe');
  const secTexts = new Set(places.flatMap((p) => p.sections.map(sectionText)));
  const after = log.filter((l) => l.name === 'prompts' && l.t >= leave.t + 1500 && l.t < log.find((x) => x.name === 'enter' && x.place === 'santander').t);
  assert.ok(after.length >= 1, 'hubo mezcla normal al salir');
  for (const a of after) assert.ok(!a.texts.some((t) => secTexts.has(t)), 'sin secundarios fuera de la region');
  assert.ok(!textsAt(log, leave.t + 1500).some((t) => secTexts.has(t)));
  assert.ok(after.some((a) => a.n === 2), 'mezcla de 2 bases en el camino');
});

ok('a la vuelta a Medellin tras otra region hay handover (no already_live) y el tema es identico al del inicio', () => {
  const { log } = main;
  const open0 = log.find((l) => l.name === 'live_open'), enter = log.findLast((l) => l.name === 'enter' && l.place === 'medellin');
  assert.equal(enter.memory, true);
  assert.notEqual(enter.reason, 'already_live');
  const ro = log.findLast((l) => l.name === 'recall_open' && l.place === 'medellin');
  assert.deepEqual(ro.prompts, open0.prompts, 'mismo prompt (base, peso 1)');
  assert.deepEqual(ro.config, open0.config, 'misma seed/bpm/temperatura');
  assert.equal(ro.config.seed, 11);
  const prom = log.findLast((l) => l.name === 'promote');
  assert.equal(prom.place, 'medellin');
  assert.equal(main.mem.livePlace, 'medellin');
});

const caribe = ZONE_BY_ID.caribe;
ok('sin Memoria no hay prewarm ni handover; las secciones cuentan desde la entrada y se quitan al salir', () => {
  const d = drive({ memoryOn: false, route: ['medellin', 'caribe', 'santander'], dwell: { caribe: 80 }, maxSec: 400, until: (c, log) => log.some((l) => l.name === 'enter' && l.place === 'santander') });
  const names = d.log.map((l) => l.name);
  assert.ok(!names.includes('prewarm') && !names.includes('recall_open') && !names.includes('recall_start') && !names.includes('promote'));
  const e = d.log.find((l) => l.name === 'enter' && l.place === 'caribe');
  assert.ok(e && e.memory === false);
  assert.equal(d.server.maxSessions, 1);
  checkSections(d.log, 'caribe', e.t, 'Caribe sin memoria');
  const leave = d.log.find((l) => l.name === 'leave' && l.place === 'caribe');
  const secTexts = new Set(places.flatMap((p) => p.sections.map(sectionText)));
  assert.ok(!textsAt(d.log, leave.t + 1500).some((t) => secTexts.has(t)), 'sin secundarios al salir');
  void caribe;
});

ok('frenar tras el prewarm lo cancela (recall cerrado) y al reanudar se vuelve a calentar', () => {
  // conductor que sigue el tramo 0 y frena en seco un momento despues del prewarm
  const mem = new MemoryController(memoryPlaces(prompts, secDefs, bases), { sections: true });
  const car = ZONE_BY_ID.caribe, en = car.entries.find((q) => q.edge === 0);
  const r = roadAt(en.edgeS - 140, 0);
  const sim = createSim({ ...createState(r.x, r.z, Math.atan2(r.tx, r.tz), r.h), vf: 20, speed: 20 });
  mem.setLive('medellin');
  const log = [];
  let t = 0, recall = { state: '-' };
  const mk = (speed, st) => mem.update({ now: t, pos: { x: st.x, y: st.z }, vel: { x: 0, y: 0 }, memoryOn: true, approach: approachInfo(st, ZONES, roadInfo), speed, chans: { live: { state: 'playing' }, recall: { ...recall, heldMs: 0 } } });
  for (let i = 0; i < 60 * 30; i++) {
    t += FRAME * 1000;
    const pw = log.find((l) => l.type === 'prewarm'), stopNow = pw && t > pw.t + 600 && t < pw.t + 6000;
    const st = sim.state, look = roadAt(Math.min(roadInfo(st.x, st.z).s + 20, ROADS[0].L - 1), 0);
    const err = Math.atan2(look.x - st.x, look.z - st.z) - st.heading, steer = -Math.max(-1, Math.min(1, Math.atan2(Math.sin(err), Math.cos(err)) * 2.2));
    advance(sim, { throttle: stopNow ? 0 : 1, brake: stopNow ? 1 : 0, steer }, FRAME, heightAt, roadInfo, ENV);
    for (const a of mk(Math.hypot(sim.state.vf, sim.state.vl), sim.state)) {
      log.push({ ...a, t });
      if (a.type === 'prewarm') recall = { state: 'playing', placeId: a.placeId };
      if (a.type === 'cancelPrewarm') recall = { state: 'closed' };
    }
  }
  assert.ok(log.some((l) => l.type === 'cancelPrewarm' && l.reason === 'stopped'), 'cancelo al frenar');
  assert.ok(log.filter((l) => l.type === 'prewarm').length >= 2, 'volvio a calentar');
});

ok('musica reactiva: solo al canal live, nunca al recall pre-calentado; el recall abre sin density/brightness/muteDrums y tras cada promote recibe la config', () => {
  const { log } = main;
  const rx = log.filter((l) => l.name === 'reactive');
  assert.ok(rx.length >= 5, 'hubo parches reactivos: ' + rx.length);
  assert.ok(rx.every((l) => l.ch === 0), 'todos al canal 0');
  for (const r of log.filter((l) => l.name === 'recall_open')) for (const k of ['density', 'brightness', 'muteDrums']) assert.ok(!(k in r.config), 'el recall abre sin ' + k);
  // entre el open del recall y su promote no hay parche dirigido a ese recall: los parches de esa ventana van al live viejo (distinto lugar)
  for (const p of log.filter((l) => l.name === 'promote')) {
    const open = log.findLast((l) => l.name === 'recall_open' && l.place === p.place && l.t <= p.t);
    for (const r of rx.filter((x) => x.t > open.t && x.t < p.t)) assert.notEqual(r.live, p.place, 'ningun parche llega a la sesion de region antes de su promote');
    const after = rx.find((x) => x.t >= p.t); // >=: con velocidad constante el resync sale en el mismo tick del promote
    assert.ok(after && after.t - p.t <= 3500, 'tras el promote en ' + p.place + ' la config dinamica se reenvia (' + (after && after.t - p.t) + ' ms)');
    assert.equal(after.live, p.place);
  }
  for (let i = 1; i < rx.length; i++) assert.ok(rx[i].t - rx[i - 1].t >= 1700, 'maximo un parche cada ~1.75 s');
  assert.ok(rx.some((l) => l.patch.muteDrums === true) && rx.some((l) => l.patch.muteDrums === false), 'al parar (dwell) se silencia la bateria y al arrancar vuelve');
  assert.ok(Math.max(...rx.map((l) => l.patch.density)) >= 0.6, 'densidad alta a velocidad de crucero');
});

console.log(`\n${n} pruebas de drive-sim OK`);
