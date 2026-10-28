// Pruebas de memory.js (pesos afilados, rate limit, prewarm/cancel, enter con y sin memoria, limite de 2 sesiones, re-entrada).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MemoryController, MCFG, LIVE_CONFIG, placeConfig, tempoConfig } from './public/memory.js';
import { PLACE_GEO, ORB_SPEED, snapTarget } from './public/geo.js';

const raw = JSON.parse(readFileSync(new URL('./public/places.json', import.meta.url))).places;
const places = PLACE_GEO.map((g) => ({ ...g, prompt: raw.find((p) => p.id === g.id).prompt }));
const G = Object.fromEntries(places.map((p) => [p.id, p]));
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };

// Simulador: orbe + canales; aplica las acciones como lo hace main.js y cuenta sesiones abiertas
function sim(opts = {}) {
  const mem = new MemoryController(places, opts.cfg);
  const s = { mem, now: 0, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, memoryOn: true, target: null, recall: { state: '-', placeId: null, heldMs: 0 }, live: { state: 'playing', ageMs: 0 }, log: [], maxSessions: 1, held0: 0 };
  s.sessions = () => (s.live.state === 'playing' ? 1 : 0) + (s.recall.state === 'closed' || s.recall.state === '-' ? 0 : 1);
  s.tick = (dtMs = 50) => {
    const prev = s.pos;
    s.now += dtMs;
    if (s.recall.state === 'playing' && s.recall.heldMs !== undefined) s.recall.heldMs = s.now - s.held0;
    const acts = mem.update({ now: s.now, pos: s.pos, vel: s.vel, target: s.target, memoryOn: s.memoryOn, chans: { live: s.live, recall: s.recall } });
    for (const a of acts) {
      s.log.push({ t: s.now, ...a });
      if (a.type === 'prewarm' || (a.type === 'enter' && a.memory && s.recall.state !== 'playing')) {
        s.recall = { state: 'playing', placeId: a.placeId, heldMs: 0 }; s.held0 = s.now;
      } else if (a.type === 'cancelPrewarm') s.recall = { state: 'closed', placeId: null, heldMs: 0 };
      assert.ok(a.type !== 'livePrompts' || a.prompts.length <= 2, 'nunca 3 prompts');
      s.maxSessions = Math.max(s.maxSessions, s.sessions());
      assert.ok(s.sessions() <= 2, 'nunca mas de 2 sesiones');
    }
    return acts;
  };
  // mueve el orbe en linea recta hacia (x,y) a velocidad normal, hasta llegar o agotar ms
  s.go = (x, y, maxMs = 120000, stopWhen = null, click = true) => {
    let t = 0;
    s.target = click ? { x, y } : null;
    while (t < maxMs) {
      const dx = x - s.pos.x, dy = y - s.pos.y, d = Math.hypot(dx, dy);
      if (d < 0.02) { s.vel = { x: 0, y: 0 }; break; }
      const step = Math.min(d, ORB_SPEED * 0.05);
      s.vel = { x: (dx / d) * ORB_SPEED, y: (dy / d) * ORB_SPEED };
      s.pos = { x: s.pos.x + (dx / d) * step, y: s.pos.y + (dy / d) * step };
      s.tick(50); t += 50;
      if (stopWhen && stopWhen()) break;
    }
    s.vel = { x: 0, y: 0 }; s.target = null;
  };
  // simula el promote tras un enter con memoria (main hace crossfade y server responde promoted)
  s.promote = (placeId) => { s.recall = { state: 'closed', placeId: null, heldMs: 0 }; mem.notifyPromoted(placeId); };
  s.count = (type) => s.log.filter((a) => a.type === type).length;
  return s;
}
const at = (id, dx = 0, dy = 0) => ({ x: G[id].x + dx, y: G[id].y + dy });

ok('pesos: cerca de un lugar solo suena ese (peso 1)', () => {
  const m = new MemoryController(places);
  const w = m.weightsAt(at('cali', 0.1, 0));
  assert.deepEqual(w, [{ id: 'cali', w: 1 }]);
});

ok('pesos: en la frontera dos lugares, nunca tres', () => {
  const m = new MemoryController(places);
  const mid = { x: (G.caribe.x + G.medellin.x) / 2, y: (G.caribe.y + G.medellin.y) / 2 };
  const w = m.weightsAt(mid);
  assert.equal(w.length, 2);
  assert.ok(Math.abs(w.reduce((a, t) => a + t.w, 0) - 1) < 0.01);
  assert.ok(Math.abs(w[0].w - 0.5) < 0.2);
  for (let i = 0; i < 2000; i++) {
    const p = { x: Math.random() * 14 - 7, y: Math.random() * 18 - 9 };
    const ws = m.weightsAt(p);
    assert.ok(ws.length >= 1 && ws.length <= 2);
    assert.ok(ws.every((t) => t.w >= MCFG.minWeight - 1e-9));
  }
});

ok('rate limit: >=700 ms entre envios y solo si cambia significativamente', () => {
  const s = sim();
  s.pos = at('medellin', 1.0, 0);
  s.tick(); const first = s.log.filter((a) => a.type === 'livePrompts');
  assert.equal(first.length, 1);
  for (let i = 0; i < 40; i++) s.tick(50); // quieto 2 s: nada nuevo
  assert.equal(s.count('livePrompts'), 1);
  s.pos = at('medellin', 0.0, 0.1); s.tick(50); // cambio grande tras 2 s: sale
  assert.equal(s.count('livePrompts'), 2);
  s.pos = at('medellin', 1.0, 0.1); s.tick(50); // otro cambio grande a los 50 ms: espera
  assert.equal(s.count('livePrompts'), 2, 'rate limit');
  for (let i = 0; i < 20; i++) s.tick(50);
  assert.equal(s.count('livePrompts'), 3);
  const ts = s.log.filter((a) => a.type === 'livePrompts').map((a) => a.t);
  assert.ok(ts[2] - ts[1] >= 700);
  // cambio pequeno: no envia
  const s2 = sim(); s2.pos = at('santander', 1.0, 0); s2.tick();
  s2.pos = { x: s2.pos.x + 0.005, y: s2.pos.y }; for (let i = 0; i < 30; i++) s2.tick(50);
  assert.equal(s2.count('livePrompts'), 1);
});

ok('prewarm al acercarse por el radio exterior, no al alejarse', () => {
  const s = sim({}); s.mem.setLive('caribe');
  s.pos = at('santander', 0, 3.3); s.tick();
  s.go(G.santander.x, G.santander.y, 60000, () => s.count('prewarm') > 0);
  assert.equal(s.count('prewarm'), 1);
  const a = s.log.find((x) => x.type === 'prewarm');
  assert.equal(a.placeId, 'santander');
  const d = Math.hypot(s.pos.x - G.santander.x, s.pos.y - G.santander.y);
  assert.ok(d <= G.santander.outer + 1e-6 && d > G.santander.inner);
  // alejandose dentro de la zona exterior, sin prewarm previo: no hay prewarm
  const t = sim(); t.mem.setLive('caribe');
  t.pos = at('llanos', 2.0, 0); t.vel = { x: ORB_SPEED, y: 0 }; // se aleja (dx positivo = lejos)
  for (let i = 0; i < 20; i++) { t.pos = { x: t.pos.x + 0.035, y: t.pos.y }; t.tick(50); }
  assert.equal(t.count('prewarm'), 0);
});

ok('cancel al salir del radio exterior sin entrar, y cooldown de 3 s', () => {
  const s = sim(); s.mem.setLive('caribe');
  s.pos = at('llanos', 3.0, 0); s.tick();
  s.go(G.llanos.x, G.llanos.y, 60000, () => s.count('prewarm') > 0);
  assert.equal(s.count('prewarm'), 1);
  s.go(G.llanos.x + 5, G.llanos.y, 60000, () => s.count('cancelPrewarm') > 0);
  assert.equal(s.count('cancelPrewarm'), 1);
  assert.equal(s.log.find((a) => a.type === 'cancelPrewarm').reason, 'left_outer');
  assert.equal(s.recall.state, 'closed');
  // vuelve de inmediato: el cooldown retrasa el nuevo prewarm >= 3 s
  const tCancel = s.now;
  s.go(G.llanos.x, G.llanos.y, 60000, () => s.count('prewarm') > 1);
  const t2 = s.log.filter((a) => a.type === 'prewarm')[1].t;
  assert.ok(t2 - tCancel >= MCFG.cooldownMs - 1);
});

ok('cancel si lleva retenido >10 s sin entrar; re-prewarm tras cooldown si sigue acercandose', () => {
  const s = sim(); s.mem.setLive('caribe');
  s.target = at('llanos'); s.pos = at('llanos', 0.0, 1.5); s.tick(); // clic dentro de Llanos, orbe parado dentro del exterior
  assert.equal(s.count('prewarm'), 1);
  for (let i = 0; i < 205; i++) s.tick(50); // 10.25 s quieto
  assert.equal(s.count('cancelPrewarm'), 1);
  assert.equal(s.log.find((a) => a.type === 'cancelPrewarm').reason, 'held_too_long');
  const tc = s.log.find((a) => a.type === 'cancelPrewarm').t;
  for (let i = 0; i < 80; i++) s.tick(50);
  assert.equal(s.count('prewarm'), 2);
  assert.ok(s.log.filter((a) => a.type === 'prewarm')[1].t - tc >= MCFG.cooldownMs);
});

ok('clic: solo se pre-calienta el lugar que contiene el destino (Medellin -> Llanos no calienta Santander)', () => {
  const s = sim(); s.mem.setLive('medellin'); s.pos = at('medellin', 0.8, 0);
  s.go(G.llanos.x, G.llanos.y, 120000, () => s.count('enter') > 0);
  assert.deepEqual(s.log.filter((a) => a.type === 'prewarm').map((a) => a.placeId), ['llanos']);
  // destino en mar abierto (ningun lugar): sin prewarm
  const t = sim(); t.mem.setLive('medellin'); t.pos = at('medellin', 0.8, 0);
  t.go(0, 1.6, 60000); // pasa cerca de Santander, destino fuera de todo radio interior
  assert.equal(t.count('prewarm'), 0);
});

ok('teclado: prewarm solo si el rumbo apunta al lugar (cos >= 0.9) dentro del exterior', () => {
  const s = sim(); s.mem.setLive('medellin'); s.pos = at('medellin', 0.8, 0);
  s.go(G.llanos.x, G.llanos.y, 120000, () => s.count('prewarm') > 0, false); // rumbo directo a Llanos
  assert.deepEqual(s.log.filter((a) => a.type === 'prewarm').map((a) => a.placeId), ['llanos']);
  // rumbo que pasa de largo de Santander (cos < 0.9): ninguno
  const t = sim(); t.mem.setLive('caribe'); t.pos = { x: G.santander.x - 3, y: G.santander.y + 1.5 };
  t.vel = { x: ORB_SPEED, y: 0 };
  for (let i = 0; i < 60; i++) { t.pos = { x: t.pos.x + 0.035, y: t.pos.y }; t.tick(50); if (Math.abs(t.pos.x - G.santander.x) < 0.3) break; }
  assert.equal(t.log.filter((a) => a.type === 'prewarm' && a.placeId === 'santander').length, 0);
});

ok('enter con memoria: handover una vez, sin prewarm durante el handover, y el live pasa a ser el lugar', () => {
  const s = sim(); s.mem.setLive('caribe');
  s.pos = at('medellin', 0, 3.0); s.tick();
  s.go(G.medellin.x, G.medellin.y, 90000, () => s.count('enter') > 0);
  const enters = s.log.filter((a) => a.type === 'enter');
  assert.equal(enters.length, 1);
  assert.deepEqual([enters[0].placeId, enters[0].memory], ['medellin', true]);
  assert.equal(s.mem.phase, 'handover');
  // sigue dentro/pasa a otro lugar durante el handover: nada de prewarm ni segundo enter con memoria
  const before = s.count('prewarm');
  s.go(G.cali.x, G.cali.y, 30000);
  assert.equal(s.count('prewarm'), before);
  assert.equal(s.log.filter((a) => a.type === 'enter' && a.memory).length, 1);
  // promote del primer handover: el pendiente (Cali) hace su handover despues
  s.promote('medellin');
  s.tick(); s.tick();
  assert.equal(s.mem.getState().livePlace === 'medellin' || s.mem.getState().handover === 'cali', true);
});

ok('enter sin memoria: solo livePrompts con ese lugar a peso 1 (sin prewarm)', () => {
  const s = sim(); s.memoryOn = false; s.mem.setLive('caribe');
  s.pos = at('cali', 3.0, 0); s.tick();
  s.go(G.cali.x, G.cali.y, 90000, () => s.count('enter') > 0);
  assert.equal(s.count('prewarm'), 0);
  const e = s.log.find((a) => a.type === 'enter');
  assert.deepEqual([e.placeId, e.memory], ['cali', false]);
  const lp = s.log.filter((a) => a.type === 'livePrompts').at(-1);
  assert.deepEqual(lp.prompts, [{ text: G.cali.prompt, weight: 1 }]);
  assert.equal(s.sessions(), 1);
});

ok('re-entrar al mismo lugar tras irse lejos vuelve a hacer handover; sin duplicados al quedarse', () => {
  const s = sim(); s.mem.setLive('caribe');
  s.pos = at('llanos', 3.2, 0); s.tick();
  s.go(G.llanos.x, G.llanos.y, 90000, () => s.count('enter') > 0);
  s.promote('llanos');
  // se queda dentro mucho tiempo: ningun enter nuevo
  for (let i = 0; i < 200; i++) s.tick(50);
  s.pos = at('llanos', 0.2, 0); for (let i = 0; i < 40; i++) s.tick(50);
  assert.equal(s.log.filter((a) => a.type === 'enter' && a.memory).length, 1);
  // sale un poco y vuelve (dentro del exterior): sigue siendo el mismo live, sin handover
  s.go(G.llanos.x + 1.0, G.llanos.y, 30000); s.go(G.llanos.x, G.llanos.y, 30000);
  assert.equal(s.log.filter((a) => a.type === 'enter' && a.memory).length, 1);
  // se va lejos (olvida), vuelve: nuevo handover
  s.go(G.llanos.x + 5, G.llanos.y, 90000);
  s.go(G.llanos.x, G.llanos.y, 90000, () => s.log.filter((a) => a.type === 'enter' && a.memory).length === 2);
  assert.equal(s.log.filter((a) => a.type === 'enter' && a.memory).length, 2);
  assert.equal(s.log.filter((a) => a.type === 'leave').length >= 2, true);
});

ok('rotacion en curso: no hay prewarm; al terminar se reenvia la mezcla', () => {
  const s = sim(); s.mem.setLive('caribe');
  s.pos = at('santander', 1.2, 0);
  s.mem.notifyRotation(s.now); s.tick(); s.tick(3000);
  s.recall = { state: 'playing', placeId: null, heldMs: 0 };
  s.tick(); assert.equal(s.count('prewarm'), 0);
  s.recall = { state: 'closed', placeId: null, heldMs: 0 };
  s.mem.notifyPromoted(null);
  for (let i = 0; i < 20; i++) s.tick(50);
  assert.ok(s.count('livePrompts') >= 2);
});

ok('radios interiores sin solape y config del live', () => {
  for (const a of places) for (const b of places) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.inner + b.inner + 0.2, `${a.id}-${b.id}`);
  assert.equal(LIVE_CONFIG.temperature, 0.9);
  for (const a of ['pacifico', 'cali', 'medellin']) for (const b of ['pacifico', 'cali', 'medellin']) if (a < b) {
    const A = places.find((p) => p.id === a), B = places.find((p) => p.id === b);
    assert.ok(Math.hypot(A.x - B.x, A.y - B.y) - A.inner - B.inner >= 0.6, `separacion ${a}-${b}`);
  }
});

ok('iman del clic-para-ir', () => {
  const cali = places.find((p) => p.id === 'cali');
  // a 0.8 u de Cali (fuera del radio interior 0.35, dentro de 0.9): va al centro exacto
  assert.deepEqual(snapTarget({ x: cali.x + 0.8, y: cali.y }, places), { x: cali.x, y: cali.y });
  // lejos: sin cambios
  assert.deepEqual(snapTarget({ x: cali.x + 1.5, y: cali.y + 1.5 }, places), { x: cali.x + 1.5, y: cali.y + 1.5 });
  // el mas cercano gana; umbral max(inner*2.5, 0.9)
  const llanos = places.find((p) => p.id === 'llanos');
  assert.deepEqual(snapTarget({ x: llanos.x + 1.4, y: llanos.y }, places), { x: llanos.x, y: llanos.y }); // llanos inner .6 -> 1.5
  // con el iman, un clic cerca de Cali pre-calienta Cali (destino = centro)
  const s = sim(); s.mem.setLive('medellin');
  s.target = snapTarget({ x: cali.x + 0.8, y: cali.y }, places);
  assert.equal(Math.hypot(s.target.x - cali.x, s.target.y - cali.y), 0);
});

ok('LIVE_CONFIG (menos azar) y placeConfig: seed + bpm + scale del lugar, nunca config dinamica', () => {
  assert.deepEqual(LIVE_CONFIG, { temperature: 0.9, topK: 28, guidance: 4.5 });
  for (const p of raw) {
    const c = placeConfig(p);
    assert.deepEqual(c, { seed: p.seed, bpm: p.bpm, scale: p.scale, temperature: 0.9, topK: 28, guidance: 4.5 });
    for (const k of ['density', 'brightness', 'muteDrums']) assert.ok(!(k in c), 'apertura sin ' + k + ' (el inicio del recall es identico en cada visita)');
    assert.deepEqual(tempoConfig(p), { temperature: 0.9, topK: 28, guidance: 4.5, bpm: p.bpm, scale: p.scale }, 'rotacion/reapertura: mismo tempo y tonalidad, sin seed');
  }
  assert.deepEqual(placeConfig({ seed: 3 }), { seed: 3, temperature: 0.9, topK: 28, guidance: 4.5 });
});

ok('rampa con coalesce: el ULTIMO estado nunca se descarta (envio pendiente por el rate limit se manda al vencer; el resto pequeno tambien)', () => {
  const PL = [{ id: 'a', x: 0, y: 0, inner: 1, outer: 3, prompt: 'A' }, { id: 'b', x: 20, y: 0, inner: 1, outer: 3, prompt: 'B' }];
  const finalOk = (mem, pos) => {
    const want = mem.weightsAt(pos), got = mem.lastSent;
    return want.length === got.length && want.every((w) => Math.abs(w.w - (got.find((g) => g.id === w.id)?.w ?? -9)) <= 0.011);
  };
  const ramp = (stopX, cfg) => {
    const mem = new MemoryController(PL, cfg);
    mem.setLive('a');
    let now = 0, x = 0; const sent = [];
    const step = (ms, nx) => { now += ms; x = nx; for (const a of mem.update({ now, pos: { x, y: 0 }, chans: { live: { state: 'playing' }, recall: { state: '-' } } })) if (a.type === 'livePrompts') sent.push({ t: now, w: a.prompts.map((p) => p.weight) }); };
    step(50, 0);
    while (x < stopX) step(50, Math.min(stopX, x + 0.35)); // rampa rapida (7 u/s)
    const tStop = now;
    for (let i = 0; i < 60; i++) step(50, stopX); // 3 s quieto
    return { mem, sent, tStop, stopX };
  };
  let settleWorked = 0, withoutSettle = 0;
  for (const stopX of [7.3, 8.1, 8.9, 9.4, 9.9, 10.4, 10.9, 11.6, 12.5, 13.4]) {
    const r = ramp(stopX);
    assert.ok(finalOk(r.mem, { x: stopX, y: 0 }), `stop ${stopX}: lo ultimo enviado coincide con el estado final: ${JSON.stringify(r.mem.lastSent)} vs ${JSON.stringify(r.mem.weightsAt({ x: stopX, y: 0 }))}`);
    for (let i = 1; i < r.sent.length; i++) assert.ok(r.sent[i].t - r.sent[i - 1].t >= 699, 'sigue respetando el rate limit de 700 ms');
    assert.ok(!r.sent.length || r.sent.at(-1).t <= r.tStop + MCFG.settleMs + 100, `stop ${stopX}: el ultimo envio llega a lo mas ${MCFG.settleMs} ms tras parar (+${(r.sent.at(-1)?.t ?? 0) - r.tStop} ms)`);
    settleWorked++;
  }
  assert.equal(settleWorked, 10);
  // resto pequeno: el ultimo envio queda a < sendDelta (0.08) del estado final; sin settle se quedaria desviado para siempre, con settle se corrige
  const residual = (cfg) => {
    const mem = new MemoryController(PL, cfg); mem.setLive('a');
    let now = 0; const sent = [];
    const at = (t, x) => { now = t; for (const q of mem.update({ now, pos: { x, y: 0 }, chans: { live: { state: 'playing' }, recall: { state: '-' } } })) if (q.type === 'livePrompts') sent.push(t); };
    at(0, 0); for (let t = 50; t <= 5000; t += 50) at(t, 9.0);  // se asienta en x = 9.0 (envia la mezcla)
    const mid = sent.length;
    for (let t = 5050; t <= 10000; t += 50) at(t, 9.3);        // un paso pequeno: peso cambia ~0.054
    return { mem, extra: sent.length - mid, diff: Math.abs(mem.weightsAt({ x: 9.3, y: 0 })[0].w - mem.lastSent.find((q) => q.id === mem.weightsAt({ x: 9.3, y: 0 })[0].id).w) };
  };
  const a1 = residual(), a0 = residual({ settleMs: 1e9 });
  assert.ok(a1.diff <= 0.011 && a1.extra === 1, 'con coalesce final el resto pequeno se manda una vez: diff ' + a1.diff);
  assert.ok(a0.diff > 0.04 && a0.diff < MCFG.sendDelta && a0.extra === 0, 'sin el, se queda desviado: diff ' + a0.diff + ' (la prueba es sensible)');
});

ok('envio pendiente por el rate limit: se guarda solo el ultimo estado y sale al vencer los 700 ms', () => {
  const PL = [{ id: 'a', x: 0, y: 0, inner: 1, outer: 3, prompt: 'A' }, { id: 'b', x: 20, y: 0, inner: 1, outer: 3, prompt: 'B' }];
  const mem = new MemoryController(PL); mem.setLive('a');
  const sent = [];
  const at = (now, x) => { for (const a of mem.update({ now, pos: { x, y: 0 }, chans: { live: { state: 'playing' }, recall: { state: '-' } } })) if (a.type === 'livePrompts') sent.push({ t: now, ws: mem.lastSent.map((q) => ({ ...q })) }); };
  at(0, 9.0);                          // primer envio (cambia el set de lugares)
  const t0 = sent[0].t;
  at(t0 + 100, 10.0);                  // cambio grande dentro de la ventana: pendiente
  at(t0 + 300, 10.5);                  // otro cambio: solo cuenta el ultimo
  at(t0 + 500, 11.0);
  assert.equal(sent.length, 1, 'nada sale antes de 700 ms');
  at(t0 + 699, 11.0); assert.equal(sent.length, 1);
  at(t0 + 700, 11.0);
  assert.equal(sent.length, 2, 'sale al vencer');
  assert.deepEqual(sent[1].ws, mem.weightsAt({ x: 11.0, y: 0 }).map((q) => ({ ...q })), 'con el ULTIMO estado (11.0), no con uno intermedio');
});


console.log(`\n${n} pruebas de memory ok`);
