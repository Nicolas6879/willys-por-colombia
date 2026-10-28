// Pruebas de las secciones musicales: sections.js (pura) y su integracion en memory.js (opcion `sections: true`).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sectionIndex, sectionPrompts, sectionShift, sectionText, sectionWeight, SECTION_CFG } from './public/sections.js';
import { speedTargets, RCFG } from './public/reactive.js';
import { MemoryController } from './public/memory.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };
const place = { prompt: 'BASE', sections: ['S0', 'S1'] };

ok('sectionPrompts: base sola hasta +25 s, +S0 (0.35) hasta +50, S1 (0.35) hasta +70, solo base hasta +90', () => {
  const at = (ms) => sectionPrompts(place, ms);
  assert.deepEqual(at(0), [{ text: 'BASE', weight: 1 }]);
  assert.deepEqual(at(24999), [{ text: 'BASE', weight: 1 }]);
  assert.deepEqual(at(25000), [{ text: 'BASE', weight: 1 }, { text: 'S0', weight: 0.35 }]);
  assert.deepEqual(at(49999), [{ text: 'BASE', weight: 1 }, { text: 'S0', weight: 0.35 }]);
  assert.deepEqual(at(50000), [{ text: 'BASE', weight: 1 }, { text: 'S1', weight: 0.35 }]);
  assert.deepEqual(at(69999), [{ text: 'BASE', weight: 1 }, { text: 'S1', weight: 0.35 }]);
  assert.deepEqual(at(70000), [{ text: 'BASE', weight: 1 }]);
  assert.deepEqual(at(89999), [{ text: 'BASE', weight: 1 }]);
});

ok('ciclo de 90 s: se repite', () => {
  for (const [ms, k] of [[0, -1], [25000, 0], [50000, 1], [70000, -1], [90000, -1], [115000, 0], [140000, 1], [160000, -1], [180000 + 30000, 0], [-5, -1]]) assert.equal(sectionIndex(ms), k, 'ms ' + ms);
  assert.equal(SECTION_CFG.cycleMs, 90000);
  assert.deepEqual(sectionPrompts(place, 115000), sectionPrompts(place, 25000));
  assert.deepEqual(sectionPrompts({ prompt: 'B' }, 30000), [{ text: 'B', weight: 1 }], 'sin sections no hay secundarios');
});

// ---- integracion en memory.js: dos regiones lejanas
const P = [
  { id: 'a', x: 0, y: 0, inner: 1, outer: 3, prompt: 'A', sections: ['A0', 'A1'] },
  { id: 'b', x: 20, y: 0, inner: 1, outer: 3, prompt: 'B', sections: ['B0', 'B1'] },
];
function run({ sections = true, memoryOn = true, cfg = {} } = {}) {
  const mem = new MemoryController(P, { sections, ...cfg });
  const sent = [];
  const s = { mem, now: 0, pos: { x: 0, y: 0 }, sent };
  s.tick = (ms = 100) => {
    s.now += ms;
    for (const a of mem.update({ now: s.now, pos: s.pos, memoryOn, chans: { live: { state: 'playing' }, recall: { state: '-' } } })) if (a.type === 'livePrompts') sent.push({ t: s.now, texts: a.prompts.map((p) => p.text), weights: a.prompts.map((p) => p.weight) });
  };
  s.until = (t) => { while (s.now < t) s.tick(); };
  return s;
}
const last = (s, t) => s.sent.findLast((x) => x.t <= t)?.texts;

ok('memory: dentro de la region con su tema en el live, secciones a +25/+50/+70 s desde el inicio', () => {
  const s = run();
  s.mem.setLive('a');
  s.tick(); // el live arranca aqui (t = 100)
  const t0 = s.now;
  s.until(t0 + 95000);
  const firstWith = (txt) => s.sent.find((x) => x.texts.includes(txt));
  assert.ok(Math.abs(firstWith('A0').t - (t0 + 25000)) <= 800, 'A0 a +25 s: ' + (firstWith('A0').t - t0));
  assert.ok(Math.abs(firstWith('A1').t - (t0 + 50000)) <= 800);
  const back = s.sent.find((x) => x.t > firstWith('A1').t && x.texts.length === 1);
  assert.ok(Math.abs(back.t - (t0 + 70000)) <= 800, 'solo base a +70 s');
  assert.deepEqual(last(s, t0 + 30000), ['A', 'A0']);
  assert.deepEqual(s.sent.find((x) => x.texts.includes('A0')).weights, [1, 0.35]);
  assert.deepEqual(last(s, t0 + 55000), ['A', 'A1']);
  assert.deepEqual(last(s, t0 + 80000), ['A']);
  s.until(t0 + 95000 + 30000);
  assert.deepEqual(last(s, t0 + 118000), ['A', 'A0'], 'segundo ciclo');
});

ok('memory: al salir de la region se quitan los secundarios (mezcla normal de bases) y se respeta el rate limit', () => {
  const s = run();
  s.mem.setLive('a'); s.tick();
  s.until(30000);
  assert.deepEqual(last(s, 30000), ['A', 'A0']);
  s.pos = { x: 10, y: 0 }; // fuera del radio interior, entre A y B
  s.until(32000);
  const after = last(s, 32000);
  assert.ok(!after.some((t) => /\d$/.test(t)), 'sin secundarios: ' + after);
  assert.deepEqual(after.slice().sort(), ['A', 'B']);
  for (let i = 1; i < s.sent.length; i++) assert.ok(s.sent[i].t - s.sent[i - 1].t >= 699, 'rate limit 700 ms');
  // y mientras esta fuera no vuelven a aparecer
  s.until(120000);
  assert.ok(!s.sent.filter((x) => x.t > 31000).some((x) => x.texts.some((t) => /\d$/.test(t))));
});

ok('memory: Memoria=no aplica secciones mientras estas dentro, contando desde la entrada', () => {
  const s = run({ memoryOn: false });
  s.pos = { x: 10, y: 0 }; s.until(5000); // fuera de todo
  s.pos = { x: 20, y: 0 }; s.tick(); // entra a B
  const tIn = s.now;
  s.until(tIn + 60000);
  assert.deepEqual(last(s, tIn + 30000), ['B', 'B0']);
  assert.deepEqual(last(s, tIn + 55000), ['B', 'B1']);
  assert.ok(s.sent.find((x) => x.texts.includes('B0')).t - tIn <= 25800 && s.sent.find((x) => x.texts.includes('B0')).t - tIn >= 25000);
  s.pos = { x: 10, y: 0 }; s.until(tIn + 63000);
  assert.ok(!last(s, tIn + 63000).some((t) => /\d$/.test(t)));
});

ok('memory: la seccion no empieza hasta que el tema de ESA region suena (handover pendiente) y sin la opcion no hay secciones', () => {
  const s = run();
  s.mem.setLive('a'); s.tick();
  s.pos = { x: 20, y: 0 }; // entra a B con Memoria: hay handover pendiente, el live sigue siendo A
  s.until(s.now + 40000);
  assert.ok(!s.sent.some((x) => x.texts.includes('B0')), 'sin secciones de B antes del promote');
  s.mem.notifyPromoted('b'); s.tick();
  const t0 = s.now; s.until(t0 + 30000);
  assert.deepEqual(last(s, t0 + 30000), ['B', 'B0']);
  const off = run({ sections: false });
  off.mem.setLive('a'); off.tick(); off.until(80000);
  assert.ok(off.sent.every((x) => x.texts.length === 1), 'por defecto (map2d) sin secciones');
});

// ---- secciones con arco: capas con peso propio y desplazamiento de la base de density / brightness
const REAL = JSON.parse(readFileSync(new URL('./public/places.json', import.meta.url))).places;

ok('seccion objeto { text, weight, density, brightness }: peso propio, desplazamiento de base y compatibilidad con textos', () => {
  const pl = { prompt: 'BASE', sections: [{ name: 'solo', layer: 'instrument', text: 'S0', weight: 0.4, density: 0.1, brightness: 0.05 }, 'S1'] };
  assert.deepEqual(sectionPrompts(pl, 30000), [{ text: 'BASE', weight: 1 }, { text: 'S0', weight: 0.4 }]);
  assert.deepEqual(sectionPrompts(pl, 55000), [{ text: 'BASE', weight: 1 }, { text: 'S1', weight: SECTION_CFG.weight }], 'un texto suelto usa el peso por defecto');
  assert.deepEqual(sectionShift(pl.sections[0]), { density: 0.1, brightness: 0.05 });
  assert.deepEqual(sectionShift('S1'), { density: 0, brightness: 0 });
  assert.equal(sectionText(pl.sections[0]), 'S0'); assert.equal(sectionWeight('x'), 0.35);
});

ok('places.json: ancla corta por region + 2 secciones (capa de instrumento y breakdown de mood) que bajan el groove a ~0.2; v1 conservado', () => {
  assert.equal(REAL.length, 6);
  for (const p of REAL) {
    assert.ok(p.prompt.split(/\s+/).length <= 12, `${p.id}: ancla corta (${p.prompt.split(/\s+/).length} palabras)`);
    assert.ok(!/[A-Z][a-z]+ [A-Z][a-z]+ (and|&)/.test(p.prompt));
    assert.equal(p.sections.length, 2);
    assert.deepEqual(p.sections.map((x) => x.layer), ['instrument', 'mood']);
    const [solo, breakdown] = p.sections;
    assert.ok(solo.density > 0 && breakdown.density < 0, `${p.id}: el solo sube y el breakdown baja la base`);
    near(p.density + breakdown.density, 0.2, 0.021, `${p.id}: groove del breakdown ~0.2`);
    assert.ok(/pads|ambient|ambience|atmospher/i.test(breakdown.text), `${p.id}: breakdown con pads/ambiente`);
    assert.ok(typeof p.prompt_v1 === 'string' && p.prompt_v1.length > p.prompt.length && p.sections_v1?.length === 2, `${p.id}: prompt_v1 y sections_v1`);
    assert.ok(p.bpm >= 60 && p.bpm <= 200 && /^[A-Z_]+_(MINOR)$/.test(p.scale), `${p.id}: bpm y scale`);
    assert.ok(p.density >= 0.2 && p.density <= 0.8 && p.brightness >= 0.2 && p.brightness <= 0.8);
  }
});
function near(a, b, eps, msg) { assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} vs ${b}`); }

ok('memory.base: la base sigue al lugar y la seccion la mueve (+25 solo, +50 breakdown ~0.2, +70 vuelve); max 2 prompts dentro de la region', () => {
  const PL = [
    { id: 'a', x: 0, y: 0, inner: 1, outer: 3, prompt: 'A', density: 0.6, brightness: 0.6, sections: REAL[0].sections.map((x) => ({ ...x, density: x.name === 'solo' ? 0.1 : -0.4 })) },
    { id: 'b', x: 20, y: 0, inner: 1, outer: 3, prompt: 'B', density: 0.4, brightness: 0.5, sections: ['B0', 'B1'] },
  ];
  const mem = new MemoryController(PL, { sections: true });
  mem.setLive('a');
  let now = 0, maxPrompts = 0;
  const base = (ms) => { while (now < ms) { now += 100; for (const a of mem.update({ now, pos: { x: 0, y: 0 }, chans: { live: { state: 'playing' }, recall: { state: '-' } } })) if (a.type === 'livePrompts') maxPrompts = Math.max(maxPrompts, a.prompts.length); } return { ...mem.base }; };
  const b0 = base(10000); near(b0.density, 0.6, 1e-9); near(b0.brightness, 0.6, 1e-9);
  const b1 = base(30000); near(b1.density, 0.7, 1e-9, 'solo: +0.1'); near(b1.brightness, 0.65, 1e-9);
  const b2 = base(55000); near(b2.density, 0.2, 1e-9, 'breakdown: groove ~0.2'); near(b2.brightness, 0.55, 1e-9);
  const b3 = base(80000); near(b3.density, 0.6, 1e-9, 'vuelve a la base'); assert.equal(mem.section, -1);
  assert.ok(maxPrompts <= 2, 'maximo 2 prompts activos en la region: ' + maxPrompts);
  // entre dos lugares la base se interpola con los mismos pesos que los prompts
  const mid = new MemoryController(PL, { sections: true }); mid.setLive('a');
  for (let t = 100; t <= 2000; t += 100) mid.update({ now: t, pos: { x: 10, y: 0 }, chans: { live: { state: 'playing' }, recall: { state: '-' } } });
  near(mid.base.density, 0.5, 1e-9, 'a mitad de camino: promedio'); assert.equal(mid.section, -1);
  const w = mid.weightsAt({ x: 11, y: 0 }); const bb = mid.baseFor(w);
  assert.ok(bb.density > 0.4 && bb.density < 0.6 && Math.abs(bb.density - w.reduce((acc, t) => acc + (t.id === 'a' ? 0.6 : 0.4) * t.w, 0)) < 1e-9);
});

ok('convive con la reactividad: la seccion fija la base y la velocidad modula alrededor', () => {
  const baseSolo = { density: 0.7, brightness: 0.65 }, baseBreak = { density: 0.2, brightness: 0.55 };
  for (const [b, name] of [[baseSolo, 'solo'], [baseBreak, 'breakdown']]) {
    const stop = speedTargets(0, b), mid = speedTargets(12, b), fast = speedTargets(24, b);
    near(mid.density, b.density, 1e-9, name + ': a velocidad media la base manda');
    assert.ok(stop.density < mid.density && fast.density > mid.density, name + ': parado baja, rapido sube');
    assert.ok(fast.density - stop.density <= RCFG.densityRange + 1e-9, name + ': rango acotado');
  }
  assert.ok(speedTargets(24, baseBreak).density <= 0.45, 'aun a toda velocidad el breakdown sigue siendo suave');
  assert.ok(speedTargets(0, baseBreak).density < speedTargets(0, baseSolo).density && speedTargets(24, baseBreak).density < speedTargets(24, baseSolo).density);
});


console.log(`\n${n} pruebas de sections OK`);
