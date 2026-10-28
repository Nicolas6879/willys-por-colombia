// Pruebas de vehicle.js (fisica arcade pura) sobre el terreno y la carretera reales del mundo.
import assert from 'node:assert/strict';
import { step, createState, createSim, advance, eta, FIXED_DT, CAR } from './public/vehicle.js';
import { heightAt } from './public/world/terrain.js';
import { roadInfo, roadAt } from './public/world/road.js';
import { ColliderGrid } from './public/world/colliders.js';
import { ENV, limit } from './public/world/env.js';
import { countrySD } from './public/world/coast.js';
import { RIDGES } from './public/world/layout.js';
import { baseHeight } from './public/world/base.js';
import { ZONE_BY_ID } from './public/world/regions.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };
const DT = FIXED_DT;

// carro en el eje de la carretera a distancia s, mirando a lo largo de ella
function onRoadAt(s) {
  const r = roadAt(s);
  return createState(r.x, r.z, Math.atan2(r.tx, r.tz), r.h);
}
// carro fuera de la carretera: en el llano (plano), lejos de toda carretera, mirando al norte
function offRoad() {
  let best = null;
  const L = ZONE_BY_ID.llanos;
  for (let x = L.cx - 100; x <= L.cx + 400; x += 25) for (let z = L.cz - 300; z <= L.cz + 300; z += 25) {
    const d = roadInfo(x, z).dist, h = heightAt(x, z);
    const flat = Math.max(...[[0, 40], [0, -40], [40, 0], [-40, 0]].map(([a, b]) => Math.abs(heightAt(x + a, z + b) - h)));
    if (d > 120 && flat < 0.8 && (!best || d > best.d)) best = { x, z, d };
  }
  return createState(best.x, best.z, Math.PI, heightAt(best.x, best.z));
}
const run = (s, input, secs, hook) => { for (let i = 0; i < Math.round(secs / DT); i++) { s = step(s, typeof input === 'function' ? input(s, i) : input, DT, heightAt, roadInfo); hook?.(s); } return s; };

ok('acelera hasta ~25 u/s en carretera recta (sin pasarse)', () => {
  // tramo casi recto: s=30..150 de la carretera de Medellin (pura recta inicial); mantiene el rumbo
  let s = onRoadAt(10), max = 0;
  s = run(s, (st) => { const r = roadInfo(st.x, st.z); const err = Math.atan2(r.tx, r.tz) - st.heading; return { throttle: 1, steer: -Math.max(-1, Math.min(1, err * 3)) }; }, 4, (st) => { max = Math.max(max, st.speed); });
  assert.ok(s.speed > 15, 'tras 4 s ya va rapido: ' + s.speed);
  assert.ok(max <= CAR.vmaxRoad + 0.3, 'no pasa del tope: ' + max);
});

ok('acelerar yendo en reversa frena y vuelve a ir hacia adelante', () => {
  let s = { ...offRoad(), vmaxEff: CAR.vmaxOff };
  s = run(s, { brake: 1 }, 3);
  assert.ok(s.vf < -3, 'va en reversa: ' + s.vf);
  s = run(s, { throttle: 1 }, 3);
  assert.ok(s.vf > 5, 'tras W va hacia adelante: ' + s.vf);
});

ok('fuera de la carretera el tope es ~17 u/s y menor que en carretera', () => {
  let s = { ...offRoad(), vmaxEff: CAR.vmaxOff }, max = 0;
  s = run(s, { throttle: 1, steer: 0 }, 8, (st) => { max = Math.max(max, st.speed); });
  assert.ok(max <= CAR.vmaxOff + 0.5 && max > 8, 'tope fuera: ' + max);
  assert.ok(max < CAR.vmaxRoad - 5);
});

ok('al salir de la carretera a 25 u/s se frena a ~17', () => {
  let s = { ...offRoad(), vf: 25, speed: 25, vmaxEff: 25 };
  s = run(s, { throttle: 1, steer: 0 }, 4);
  assert.ok(s.speed < CAR.vmaxOff + 1.5 && s.speed > CAR.vmaxOff - 2, 'speed ' + s.speed);
});

ok('frena hasta parar', () => {
  let s = { ...offRoad(), vf: 12, speed: 12 };
  s = run(s, { throttle: 0, brake: 1, steer: 0 }, 0.6);
  assert.ok(Math.abs(s.speed) < 1.5, 'speed ' + s.speed);
  const rev = run(s, { throttle: 0, brake: 1, steer: 0 }, 4); // mantener el freno despues de parar -> marcha atras suave
  assert.ok(rev.speed < -2 && rev.speed >= -CAR.reverseMax - 0.5, 'reversa ' + rev.speed);
  // sin tocar nada tambien se detiene (rozamiento) sin invertir
  let t = { ...offRoad(), vf: 10, speed: 10 };
  t = run(t, {}, 20, (st) => assert.ok(st.vf >= -1e-3, "no invierte la marcha: " + st.vf));
  assert.ok(Math.abs(t.speed) < 0.1);
});

ok('gira: derecha baja el heading, izquierda lo sube; mas cerrado a baja velocidad', () => {
  const base = { ...offRoad(), vf: 10, speed: 10 };
  const r = run(base, { throttle: 0.4, steer: 1 }, 2), l = run(base, { throttle: 0.4, steer: -1 }, 2);
  assert.ok(r.heading < base.heading - 0.3, 'derecha ' + (r.heading - base.heading));
  assert.ok(l.heading > base.heading + 0.3);
  const slow = { ...base, vf: 4, speed: 4 }, fast = { ...base, vf: 12, speed: 12 };
  const rs = run(slow, { steer: 1 }, 1), rf = run(fast, { throttle: 1, steer: 1 }, 1);
  const curv = (st0, st1) => Math.abs(st1.heading - st0.heading) / Math.hypot(st1.x - st0.x, st1.z - st0.z);
  assert.ok(curv(slow, rs) > curv(fast, rf), 'curvatura mayor a menor velocidad');
});

ok('derrape suave con freno de mano: aparece velocidad lateral y se recupera al soltar', () => {
  const base = { ...offRoad(), vf: 12, speed: 12, vmaxEff: 12 };
  const a = run(base, { throttle: 0, steer: 1, handbrake: true }, 0.8);
  const b = run(base, { throttle: 0, steer: 1 }, 0.8);
  assert.ok(Math.abs(a.slip) > Math.abs(b.slip) + 0.5, `slip hand ${a.slip} vs grip ${b.slip}`);
  const c = run(a, { steer: 0 }, 1.5);
  assert.ok(Math.abs(c.slip) < Math.abs(a.slip) * 0.2 + 0.05);
});

ok('no atraviesa el terreno: y ~ heightAt durante un recorrido por la carretera (subida y bajada)', () => {
  let s = onRoadAt(10), worst = 0, minY = Infinity;
  s = run(s, (st) => {
    const r = roadInfo(st.x, st.z), look = roadAt(Math.min(r.s + 18, 940));
    const err = Math.atan2(look.x - st.x, look.z - st.z) - st.heading, e = Math.atan2(Math.sin(err), Math.cos(err));
    return { throttle: 0.8, steer: -Math.max(-1, Math.min(1, e * 2.5)) };
  }, 30, (st) => { worst = Math.max(worst, Math.abs(st.y - heightAt(st.x, st.z))); minY = Math.min(minY, st.y + st.susp - heightAt(st.x, st.z)); assert.ok(Number.isFinite(st.x + st.y)); });
  assert.ok(worst < 1e-6, 'y = heightAt: ' + worst);
  assert.ok(minY > -CAR.suspMax - 1e-6, 'carroceria nunca bajo el suelo mas que el recorrido de suspension');
});

ok('suspension: rebote amortiguado que se excita con cambios de pendiente y se apaga', () => {
  let s = onRoadAt(10), maxS = 0;
  s = run(s, (st) => { const r = roadInfo(st.x, st.z), look = roadAt(Math.min(r.s + 18, 940)); const e = Math.atan2(look.x - st.x, look.z - st.z) - st.heading; return { throttle: 1, steer: -Math.max(-1, Math.min(1, Math.atan2(Math.sin(e), Math.cos(e)) * 2.5)) }; }, 25, (st) => { maxS = Math.max(maxS, Math.abs(st.susp)); });
  assert.ok(maxS > 0.005, 'se mueve: ' + maxS);
  assert.ok(maxS <= CAR.suspMax + 1e-9);
  // resorte aislado: un golpe se amortigua
  let q = { ...offRoad(), vf: 0, speed: 0, susp: 0.2, suspV: 0 };
  const flat = () => 5;
  for (let i = 0; i < 480; i++) q = step(q, {}, DT, flat, () => ({ dist: 999 }));
  assert.ok(Math.abs(q.susp) < 0.01, 'amortiguada: ' + q.susp);
});

ok('pitch/roll siguen el terreno (rampa)', () => {
  const ramp = (x, z) => -0.3 * z + 0.2 * x; // sube hacia el norte (z negativo) y hacia +x
  let s = { ...createState(0, 0, Math.PI, 0) };
  for (let i = 0; i < 240; i++) s = step(s, {}, DT, ramp, () => ({ dist: 999 }));
  assert.ok(Math.abs(s.pitch - Math.atan(0.3)) < 0.03, 'pitch ' + s.pitch);
  assert.ok(Math.abs(s.roll) > 0.05);
});

ok('determinista: mismo input, mismo estado', () => {
  const inp = (st, i) => ({ throttle: 1, steer: Math.sin(i / 90), handbrake: i % 400 > 330 });
  const a = run(onRoadAt(10), inp, 6), b = run(onRoadAt(10), inp, 6);
  assert.deepEqual(a, b);
});

ok('paso fijo con acumulador: independiente del fps', () => {
  const inp = { throttle: 1, steer: 0.2 };
  const a = createSim(onRoadAt(10)), b = createSim(onRoadAt(10));
  for (let i = 0; i < 120; i++) advance(a, inp, 1 / 60, heightAt, roadInfo);
  for (let i = 0; i < 60; i++) advance(b, inp, 1 / 30, heightAt, roadInfo);
  assert.ok(Math.abs(a.state.x - b.state.x) < 0.5 && Math.abs(a.state.z - b.state.z) < 0.5);
});

ok('eta: distancia / velocidad, 0 si ya llego, Infinity parado', () => {
  const s = { ...createState(0, 0, 0), vf: 20, speed: 20, vl: 0 };
  assert.equal(eta(s, { x: 0, z: 100 }), 5);
  assert.equal(eta(s, { x: 0, z: 100 }, 20), 4);
  assert.equal(eta(s, { x: 0, z: 10 }, 20), 0);
  assert.equal(eta({ ...s, vf: 0, speed: 0 }, { x: 0, z: 100 }), Infinity);
});


// ---- G4: colisiones, limite de Colombia y pendientes ----
const flat = () => 5;
const noRoad = () => ({ dist: 100, edge: -1, s: 0, tx: 1, tz: 0, h: 0 });
const runEnv = (s, input, secs, env, h = flat, ri = noRoad, hook) => { for (let i = 0; i < Math.round(secs / DT); i++) { s = step(s, typeof input === 'function' ? input(s, i) : input, DT, h, ri, env); hook?.(s, i); } return s; };
const free = (x, z, heading, v = 0) => ({ ...createState(x, z, heading, 5), vf: v, speed: v, vmaxEff: CAR.vmaxOff });

ok('ColliderGrid: circulos y cajas orientadas empujan hacia afuera con la normal correcta; sin contacto -> null', () => {
  const g = new ColliderGrid(40);
  g.addCircle(0, 0, 3); g.addBox(100, 0, 4, 1, 0); g.addBox(200, 0, 4, 1, Math.PI / 2);
  assert.equal(g.push(20, 20, 1), null);
  const a = g.push(2, 0, 1.15); // dentro de la zona del circulo (3 + 1.15)
  assert.ok(a && Math.abs(Math.hypot(a.x, a.z) - 4.15) < 1e-9 && a.nx > 0.99 && Math.abs(a.nz) < 1e-6);
  const b = g.push(100, 1.5, 1); // sobre la cara +z de la caja (semieje z = 1) -> sale por +z
  assert.ok(b && b.nz > 0.99 && Math.abs(b.z - 2) < 1e-6, JSON.stringify(b));
  const c = g.push(100 + 4.5, 0, 1); // al lado de la cara +x
  assert.ok(c && c.nx > 0.99 && Math.abs(c.x - 105) < 1e-6);
  const d = g.push(200 + 1.5, 0, 1); // caja girada 90 grados: su semieje largo (4) apunta a z; en x solo mide 1
  assert.ok(d && d.nx > 0.99 && Math.abs(d.x - 202) < 1e-6, JSON.stringify(d));
  assert.equal(g.push(200 + 4, 0, 1), null, 'la caja girada ya no esta en x = 204');
  const e = g.push(200, 4.2, 1); assert.ok(e && e.nz > 0.99, 'pero si en z');
});

ok('colisiones: el carro no atraviesa un colisionador, rebota suave (sin frenazos raros) y un golpe de refilon conserva velocidad', () => {
  const grid = new ColliderGrid(), env = { colliders: grid };
  grid.addCircle(0, 40, 3);
  let s = free(0, 0, 0, 20), minD = Infinity, maxSp = 0, minVf = 0, bumps = 0;
  s = runEnv(s, (st, i) => ({ throttle: i * DT < 1.5 ? 1 : 0 }), 6, env, flat, noRoad, (st) => { minD = Math.min(minD, Math.hypot(st.x, st.z - 40)); maxSp = Math.max(maxSp, st.speed); minVf = Math.min(minVf, st.vf); if (st.bump > 0) bumps++; });
  assert.ok(minD > 3 - 0.3, 'el centro del carro no llega dentro del colisionador: ' + minD.toFixed(2));
  assert.ok(bumps > 0 && bumps < 60, 'golpe unico, no un temblor continuo: ' + bumps);
  assert.ok(minVf > -8 && maxSp < 20.6, 'rebote suave, sin saltos de velocidad: vf min ' + minVf.toFixed(1));
  assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z));
  // refilon: el carro pasa rozando el borde
  const g2 = new ColliderGrid(); g2.addCircle(2.5, 40, 2);
  let t = free(0, 0, 0, 18), vAfter = 0;
  t = runEnv(t, { throttle: 1 }, 4, { colliders: g2 }, flat, noRoad, (st) => { if (st.z > 48) vAfter = st.speed; });
  assert.ok(vAfter > 8, 'tras un golpe lateral sigue avanzando: ' + vAfter.toFixed(1));
  // empuje: nunca atrapa al carro dentro de una caja aunque empiece dentro
  const g3 = new ColliderGrid(); g3.addBox(0, 0, 4, 4, 0.3);
  const u = runEnv(free(0.5, 0.5, 0, 0), { throttle: 0 }, 1, { colliders: g3 });
  assert.ok(g3.push(u.x, u.z, 0.2) === null, 'sale de la caja');
});

ok('limite blando de Colombia: el carro que va contra la frontera se frena y se devuelve; no cruza el contorno', () => {
  const L = ZONE_BY_ID.llanos;
  // desde el Llanos hacia el este (rumbo +x) hasta la frontera con Venezuela
  let x = L.cx; while (countrySD(x, L.cz) > 0 && x < L.cx + 3000) x += 10;
  const border = x, start = border - 260;
  let s = free(start, L.cz, Math.PI / 2, 0), minSD = Infinity, maxX = -Infinity;
  s = runEnv(s, { throttle: 1 }, 40, ENV, flat, noRoad, (st) => { minSD = Math.min(minSD, countrySD(st.x, st.z)); maxX = Math.max(maxX, st.x); });
  assert.ok(minSD > -3, 'no cruza el contorno: min countrySD ' + minSD.toFixed(2));
  assert.ok(maxX < border + 2, 'queda dentro');
  assert.ok(limit(s.x, s.z).d > 0, 'queda dentro de la frontera tras 40 s empujando');
  // frenado gradual (no choque): la velocidad hacia afuera baja antes del borde
  let t = free(border - 120, L.cz, Math.PI / 2, 17), vAt30 = null;
  t = runEnv(t, { throttle: 1 }, 6, ENV, flat, noRoad, (st) => { if (vAt30 == null && countrySD(st.x, st.z) < 30) vAt30 = st.vf; });
  assert.ok(vAt30 > 5, 'a 30 u del borde aun avanza: ' + vAt30);
  assert.ok(Math.abs(t.vf) < 8, 'cerca del borde la velocidad cae: ' + t.vf.toFixed(1));
  // tambien frena contra la costa (mar): hacia el oeste desde el Pacifico
  const P = ZONE_BY_ID.pacifico; let wx = P.cx; while (countrySD(wx, P.cz) > 0) wx -= 5;
  const u = runEnv(free(wx + 100, P.cz, -Math.PI / 2, 0), { throttle: 1 }, 25, ENV, flat, noRoad);
  assert.ok(countrySD(u.x, u.z) > -3, 'no entra al mar');
});

ok('pendientes: sube hasta ~30 grados, pierde traccion y resbala a ~40; las cordilleras tienen flancos infranqueables', () => {
  const ramp = (deg) => { const k = Math.tan(deg * Math.PI / 180); return (x, z) => 5 + z * k; };
  const climb = (deg) => { let s = free(0, 0, 0, 0); s = runEnv(s, { throttle: 1 }, 8, null, ramp(deg)); return s; };
  const gentle = climb(15), mid = climb(28), steep = climb(40), wall = climb(45);
  assert.ok(gentle.z > 40 && mid.z > 15, 'sube 15 y 28 grados: ' + gentle.z.toFixed(0) + ' / ' + mid.z.toFixed(0));
  assert.ok(steep.z < 6, 'a 40 grados no sube: z = ' + steep.z.toFixed(1));
  assert.ok(wall.z < 0.5, 'a 45 grados menos aun: z = ' + wall.z.toFixed(1));
  // resbala: parado en una cuesta de 42 grados baja solo
  let s = free(0, 50, 0, 0); s = runEnv(s, { throttle: 0 }, 4, null, ramp(42));
  assert.ok(s.z < 49, 'resbala cuesta abajo: ' + s.z.toFixed(2));
  // en suave no resbala
  let f = free(0, 50, 0, 0); f = runEnv(f, { throttle: 0 }, 4, null, ramp(10));
  assert.ok(Math.abs(f.z - 50) < 0.1, 'a 10 grados queda quieto');
  // bajar de frente funciona (la pendiente solo limita la subida)
  let d = free(0, 100, Math.PI, 0); d = runEnv(d, { throttle: 1 }, 5, null, ramp(40));
  assert.ok(d.z < 95, 'bajando por una cuesta empinada avanza: ' + d.z.toFixed(1));
  // barrera natural real: en el terreno del juego hay flancos > 35 grados en las cordilleras
  let steepCount = 0, tot = 0;
  for (const r of RIDGES) for (let i = 0; i < r.pts.length - 1; i++) for (let f2 = 0; f2 < 1; f2 += 0.25) {
    const cx = r.pts[i][0] + (r.pts[i + 1][0] - r.pts[i][0]) * f2, cz = r.pts[i][1] + (r.pts[i + 1][1] - r.pts[i][1]) * f2;
    for (const off of [60, 90, 120]) { const gx = (baseHeight(cx + off + 3, cz) - baseHeight(cx + off - 3, cz)) / 6, gz = (baseHeight(cx + off, cz + 3) - baseHeight(cx + off, cz - 3)) / 6; tot++; if (Math.hypot(gx, gz) > Math.tan(35 * Math.PI / 180)) steepCount++; }
  }
  assert.ok(steepCount / tot > 0.08, 'las cordilleras tienen flancos infranqueables: ' + steepCount + '/' + tot);
});


// ---- direccion y drift (modelo de bicicleta arcade) ----
// Terreno plano sintetico: carretera (dist 0) o fuera de ella (dist 100). Numeros "antes" = medidos con el modelo anterior (kappa0 0.09, kappaV 10, volante exp(-10 dt)).
const onRd = () => ({ dist: 0 }), offRd = () => ({ dist: 100 });
const deg = (r) => r * 180 / Math.PI;
const fresh = (v, off = false) => ({ ...createState(0, 0, 0, 5), vf: v, speed: v, vmaxEff: off ? CAR.vmaxOff : CAR.vmaxRoad });
const sim = (s, inp, secs, ri = onRd, hook) => { const N = Math.round(secs / DT); for (let i = 0; i < N; i++) { s = step(s, typeof inp === 'function' ? inp(i * DT, s) : inp, DT, flat, ri); hook?.(s, i * DT); } return s; };
// giro estacionario a velocidad v (el acelerador/freno mantiene v): {yaw, radius, beta}
function turn(v, steer = 1, ri = onRd, off = false) {
  let s = fresh(v, off), yaw = 0, sp = 0, n2 = 0, beta = 0;
  s = sim(s, (t, st) => { const e = v - st.vf; return { throttle: e > 0 ? Math.min(1, e * 0.6) : 0, brake: e < -1 ? 0.3 : 0, steer }; }, 3, ri, (st, t) => { if (t > 2) { yaw += Math.abs(st.yawRate); sp += Math.hypot(st.vf, st.vl); beta = Math.abs(st.beta); n2++; } });
  return { yaw: yaw / n2, radius: sp / yaw, beta: deg(beta) };
}
const OLD = { 3: { yaw: 0.208, radius: 14.4 }, 6: { yaw: 0.337, radius: 17.8 }, 12: { yaw: 0.489, radius: 24.4 }, 22: { yaw: 0.616, radius: 35.5 } };

ok('giro a baja velocidad: el radio a 6 u/s es claramente menor que a 22 u/s y la tasa de giro a velocidad baja/media supera a la anterior', () => {
  console.log('   v(u/s)  yaw antes -> ahora (rad/s)   radio antes -> ahora (u)   slip(deg)');
  const res = {};
  for (const v of [3, 6, 12, 22]) { res[v] = turn(v); console.log(`   ${String(v).padStart(5)}   ${OLD[v].yaw.toFixed(3)} -> ${res[v].yaw.toFixed(3)}              ${OLD[v].radius.toFixed(1)} -> ${res[v].radius.toFixed(1)}              ${res[v].beta.toFixed(1)}`); }
  assert.ok(res[6].radius < res[22].radius * 0.4, `radio 6 u/s ${res[6].radius.toFixed(1)} vs 22 u/s ${res[22].radius.toFixed(1)}`);
  assert.ok(res[6].radius < 8 && res[3].radius < 7, 'radio cerrado a baja velocidad (tipo carro, ~5-8 u)');
  for (const v of [3, 6, 12]) assert.ok(res[v].yaw > OLD[v].yaw * 1.4, `yaw a ${v} u/s mayor que antes: ${res[v].yaw.toFixed(3)} vs ${OLD[v].yaw}`);
  assert.ok(res[22].yaw > 0.5 && res[22].yaw < 0.95, 'a alta velocidad estable (sin girar de mas): ' + res[22].yaw.toFixed(3));
  assert.ok(res[22].beta < 3, 'sin derrape en un giro normal a 22 u/s: ' + res[22].beta.toFixed(1));
});

ok('volante: llega al tope en ~0.12-0.15 s a baja velocidad y vuelve al centro igual de rapido; sin brincos', () => {
  for (const v of [4, 10, 22]) {
    let s = fresh(v), t90 = null, prev = 0, mono = true;
    s = sim(s, { throttle: 0.4, steer: 1 }, 0.5, onRd, (st, t) => { if (t90 == null && st.steer >= 0.9) t90 = t + DT; if (st.steer < prev - 1e-9) mono = false; prev = st.steer; });
    let tc = null; sim(s, { throttle: 0.4, steer: 0 }, 0.5, onRd, (st, t) => { if (tc == null && st.steer <= 0.1) tc = t + DT; });
    console.log(`   v=${v}: tope (90%) en ${t90.toFixed(3)} s, centro (10%) en ${tc.toFixed(3)} s`);
    assert.ok(mono, 'la respuesta es monotona');
    assert.ok(t90 >= 0.08 && t90 <= (v < 8 ? 0.15 : 0.2), `tope en ${t90}`);
    assert.ok(tc <= t90, 'vuelve al centro mas rapido que lo que tarda en llegar al tope');
  }
});

ok('a velocidad casi 0 no gira sobre su eje (se siente de carro): la tasa de giro crece con el avance y en reversa va invertida y agil', () => {
  const parado = sim(fresh(0), { steer: 1 }, 1);
  assert.ok(Math.abs(parado.heading) < 1e-3 && Math.abs(parado.yawRate) < 1e-3, 'parado con el volante a tope no gira: ' + parado.heading);
  const lento = sim(fresh(0.5), { steer: 1 }, 0.3);
  assert.ok(Math.abs(lento.yawRate) < 0.35, 'a 0.5 u/s casi no gira: ' + lento.yawRate.toFixed(3));
  const y = (v) => Math.abs(sim(fresh(v), { steer: 1 }, 0.4).yawRate);
  assert.ok(y(1) < y(3) && y(3) < y(6), `yaw crece con la velocidad: ${y(1).toFixed(2)} < ${y(3).toFixed(2)} < ${y(6).toFixed(2)}`);
  // reversa: volante a la derecha, yendo hacia atras, el morro gira a la izquierda (heading sube) como un carro real
  const rev = { ...fresh(-5), speed: -5 };
  const rr = sim(rev, { brake: 1, steer: 1 }, 1.2), rl = sim(rev, { brake: 1, steer: -1 }, 1.2);
  console.log(`   reversa a ~-5 u/s (freno sostenido): volante derecho -> yaw ${rr.yawRate.toFixed(2)} rad/s, izquierdo -> ${rl.yawRate.toFixed(2)} rad/s`);
  assert.ok(rr.heading > 0.5 && rl.heading < -0.5, 'reversa invertida: ' + rr.heading.toFixed(2) + ' / ' + rl.heading.toFixed(2));
  assert.ok(Math.abs(rr.yawRate) > 0.45, 'agil en reversa: ' + rr.yawRate.toFixed(2));
  assert.ok(Math.abs(rr.beta) < 1e-9, 'sin angulo de derrape en reversa');
});

// escenario de drift: freno de mano + giro a la derecha, luego acelerador + contravolante (volante a la izquierda), luego enderezar con acelerador
function driftRun({ v0 = 20, handT = 0.5, steerHold = -0.5, holdT = 2, recT = 1.5, ri = onRd, off = false, steerFn = null }) {
  let s = fresh(v0, off); const tr = [];
  const rec = (tag) => (st) => tr.push({ tag, t: tr.length * DT, beta: deg(st.beta), v: Math.hypot(st.vf, st.vl), w: st.yawRate, skid: st.skid });
  s = sim(s, { throttle: 1, steer: 1, handbrake: true }, handT, ri, rec('hand'));
  s = sim(s, steerFn || { throttle: 1, steer: steerHold }, holdT, ri, rec('hold'));
  s = sim(s, { throttle: 1, steer: 0 }, recT, ri, rec('rec'));
  return tr;
}
function driftStats(tr) {
  const hold = tr.filter((r) => r.tag === 'hold'), rec = tr.filter((r) => r.tag === 'rec');
  let signs = 0, last = 0; for (const r of rec) if (Math.abs(r.beta) > 1) { const sg = Math.sign(r.beta); if (last && sg !== last) signs++; last = sg; }
  // la racha mas larga dentro de 15-40 grados durante la fase de acelerador + contravolante
  let run = 0, best = 0; for (const r of hold) { if (Math.abs(r.beta) >= 15 && Math.abs(r.beta) <= 40) { run++; best = Math.max(best, run); } else run = 0; }
  const tRec = rec.findIndex((r) => Math.abs(r.beta) < 10), tGrip = rec.findIndex((r) => Math.abs(r.beta) < 3);
  return { peak: Math.max(...tr.map((r) => Math.abs(r.beta))), sustained: best * DT, holdMean: hold.slice(60).reduce((a, r) => a + Math.abs(r.beta), 0) / (hold.length - 60), tRec: tRec < 0 ? 99 : tRec * DT, tGrip: tGrip < 0 ? 99 : tGrip * DT, signs, vIn: tr[0].v, vOut: rec.at(-1).v, minV: Math.min(...tr.map((r) => r.v)) };
}

ok('drift con freno de mano a ~20 u/s: angulo 15-40 grados, se sostiene >= 1.5 s con acelerador + contravolante, <70 grados, recupera <10 grados en <= 0.8 s sin cambiar de signo', () => {
  const tr = driftRun({}), st = driftStats(tr);
  console.log(`   pico ${st.peak.toFixed(1)} deg, sostenido en 15-40 deg ${st.sustained.toFixed(2)} s (media ${st.holdMean.toFixed(1)}), recupera <10 deg en ${st.tRec.toFixed(2)} s y <3 deg (agarre total) en ${st.tGrip.toFixed(2)} s, cambios de signo ${st.signs}, v ${st.vIn.toFixed(1)} -> ${st.vOut.toFixed(1)} (min ${st.minV.toFixed(1)})`);
  const peakHand = Math.max(...tr.filter((r) => r.t < 0.9).map((r) => Math.abs(r.beta)));
  assert.ok(peakHand >= 15 && peakHand <= 40, 'el freno de mano suelta la trasera con 15-40 grados: ' + peakHand.toFixed(1));
  assert.ok(st.sustained >= 1.5, 'sostiene el angulo >= 1.5 s: ' + st.sustained.toFixed(2));
  assert.ok(st.peak < 70, 'sin trompo: ' + st.peak.toFixed(1));
  assert.ok(st.tRec <= 0.8 && st.tRec >= 0.05, 'recupera <10 grados en <= 0.8 s: ' + st.tRec.toFixed(2));
  assert.ok(st.tGrip >= 0.3 && st.tGrip <= 0.8, 'agarre total en ~0.4-0.8 s, suave: ' + st.tGrip.toFixed(2));
  assert.ok(st.signs <= 1, 'sin oscilacion al recuperar: cambios de signo ' + st.signs);
  assert.ok(st.minV > st.vIn - 2.5 && st.vOut > st.vIn - 1, `conserva la velocidad: min ${st.minV.toFixed(1)}, salida ${st.vOut.toFixed(1)}`);
  // sin latigazo: el angulo baja sin rebotar tras soltar
  const rec = tr.filter((r) => r.tag === 'rec'); let rises = 0; for (let i = 1; i < rec.length; i++) if (Math.abs(rec[i].beta) > Math.abs(rec[i - 1].beta) + 0.05) rises++;
  assert.ok(rises < 5, 'el angulo no rebota al salir: ' + rises);
});

ok('el volante ajusta el angulo del drift de forma predecible: mas contravolante, menos angulo; barrido a 12, 16, 20 y 24 u/s', () => {
  console.log('   velocidad  volante  angulo medio sostenido (deg)  sostenido(s)  salida(s)  signos');
  const means = [];
  for (const sh of [0.5, -0.3, -0.6, -1]) {
    const row = [];
    for (const v0 of [12, 16, 20, 24]) {
      const st = driftStats(driftRun({ v0, steerHold: sh, holdT: 1.8 })); row.push(st);
      console.log(`   ${String(v0).padStart(6)}   ${String(sh).padStart(6)}   ${st.holdMean.toFixed(1).padStart(8)}                    ${st.sustained.toFixed(2)}          ${st.tRec.toFixed(2)}      ${st.signs}`);
      assert.ok(st.peak < 70 && st.signs <= 1 && st.tRec <= 0.8, `v0 ${v0} steer ${sh}: pico ${st.peak.toFixed(0)} signos ${st.signs} t ${st.tRec.toFixed(2)}`);
    }
    means.push(row[2].holdMean);
  }
  for (let i = 1; i < means.length; i++) assert.ok(means[i] < means[i - 1] - 1, `monotono con el contravolante: ${means.map((m) => m.toFixed(1))}`);
  assert.ok(means.every((m) => m >= 12 && m <= 40), 'angulos en el rango jugable 12-40: ' + means.map((m) => m.toFixed(1)));
});

ok('joystick analogico (volante proporcional) y teclado (-1/0/1 suavizado) sostienen y sueltan el drift igual de bien', () => {
  const analog = driftStats(driftRun({ steerHold: -0.45 }));
  const kbFn = (t) => ({ throttle: 1, steer: Math.floor(t / 0.06) % 2 ? 0 : -1 }); // contravolante que entra y sale a ~8 Hz (media -0.5)
  const kbTr = driftRun({ steerFn: kbFn }), kb = driftStats(kbTr);
  console.log(`   analogico: sostenido ${analog.sustained.toFixed(2)} s, media ${analog.holdMean.toFixed(1)} deg, salida ${analog.tRec.toFixed(2)} s | teclado a 8 Hz: sostenido ${kb.sustained.toFixed(2)} s, media ${kb.holdMean.toFixed(1)} deg, salida ${kb.tRec.toFixed(2)} s`);
  for (const [name, st] of [['analogico', analog], ['teclado', kb]]) assert.ok(st.sustained >= 1.5 && st.peak < 70 && st.tRec <= 0.8 && st.signs <= 1, name + ' ' + JSON.stringify(st));
  const tr = kbTr.filter((r) => r.tag === 'hold').slice(120);
  const pp = Math.max(...tr.map((r) => Math.abs(r.beta))) - Math.min(...tr.map((r) => Math.abs(r.beta)));
  console.log(`   oscilacion del angulo con teclado a 8 Hz: ${pp.toFixed(2)} deg pico a pico`);
  assert.ok(pp < 3, 'sin temblor del angulo: ' + pp.toFixed(2));
});

ok('teclado on/off rapido en recta y en curva no produce temblor (rumbo y trayectoria suaves)', () => {
  for (const [v, period] of [[6, 0.06], [12, 0.06], [20, 0.06], [12, 0.04]]) {
    let s = fresh(v); const h = [];
    s = sim(s, (t) => ({ throttle: 0.5, steer: Math.floor(t / period) % 2 ? 0 : 1 }), 3, onRd, (st, t) => { if (t > 1) h.push(st.heading); });
    // rumbo = tendencia + rizado; el rizado (tras quitar el ajuste lineal) es pequeno
    const n = h.length, mx = (n - 1) / 2, my = h.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0; h.forEach((y, i) => { sxy += (i - mx) * (y - my); sxx += (i - mx) ** 2; });
    const slope = sxy / sxx, resid = h.map((y, i) => y - (my + slope * (i - mx))), rip = Math.max(...resid) - Math.min(...resid);
    console.log(`   v=${v} u/s, on/off cada ${period} s: rizado del rumbo ${deg(rip).toFixed(2)} deg pico a pico (giro medio ${deg(slope / DT).toFixed(0)} deg/s)`);
    assert.ok(deg(rip) < 1.6, 'rizado del rumbo < 1.6 grados: ' + deg(rip).toFixed(2));
    assert.ok(Math.abs(deg(s.beta)) < 8, 'no entra en derrape por el golpeteo');
  }
});

ok('sin trompos faciles: abuso extremo (freno de mano + volante + gas sostenido, cambios de volante, teclas al azar) no pasa de ~70 grados y la velocidad se mantiene acotada', () => {
  const cases = {
    'mano+volante+gas': () => ({ throttle: 1, steer: 1, handbrake: true }),
    'volante a tope + gas': () => ({ throttle: 1, steer: 1 }),
    'mano + volante alterno 0.3 s': (t) => ({ throttle: 1, steer: Math.floor(t / 0.3) % 2 ? -1 : 1, handbrake: true }),
    'teclas al azar': (t) => ({ throttle: Math.sin(t * 91.7) + Math.sin(t * 37.1) > -0.3 ? 1 : 0, steer: Math.sign(Math.sin(t * 13.3 + 1)), handbrake: Math.sin(t * 5.1) > 0.2 }),
    'mano pulsos + volante senoidal': (t) => ({ throttle: 1, steer: Math.sin(t * 2), handbrake: Math.sin(t * 1.3) > 0.5 }),
  };
  for (const [name, f] of Object.entries(cases)) for (const [v0, ri, off] of [[25, onRd, false], [14, onRd, false], [16, offRd, true]]) {
    let maxB = 0, maxV = 0, maxW = 0;
    sim(fresh(v0, off), f, 10, ri, (st) => { maxB = Math.max(maxB, Math.abs(deg(st.beta))); maxV = Math.max(maxV, Math.hypot(st.vf, st.vl)); maxW = Math.max(maxW, Math.abs(st.yawRate)); });
    console.log(`   ${name.padEnd(30)} v0=${String(v0).padStart(2)}${off ? ' fuera' : ' road '}: angulo max ${maxB.toFixed(0).padStart(2)} deg, v max ${maxV.toFixed(1)}, yaw max ${maxW.toFixed(2)}`);
    assert.ok(maxB < 70, `${name}: angulo ${maxB.toFixed(0)}`);
    assert.ok(maxV < (off ? CAR.vmaxOff : CAR.vmaxRoad) + 1.5, `${name}: velocidad ${maxV.toFixed(1)}`);
    assert.ok(maxW <= CAR.yawMax + 1e-9);
  }
});

ok('fuera de la carretera: menos agarre y mas derrape que en carretera, algo mas lento, pero controlable (el drift recupera igual)', () => {
  const road = turn(16, 1, onRd, false), grass = turn(16, 1, offRd, true);
  console.log(`   giro a 16 u/s: carretera yaw ${road.yaw.toFixed(2)} slip ${road.beta.toFixed(1)} deg radio ${road.radius.toFixed(1)} | fuera yaw ${grass.yaw.toFixed(2)} slip ${grass.beta.toFixed(1)} deg radio ${grass.radius.toFixed(1)}`);
  assert.ok(grass.beta > road.beta + 1, 'mas derrape fuera');
  assert.ok(grass.radius > road.radius, 'menos agarre: radio mayor fuera');
  const g = driftStats(driftRun({ v0: 16, off: true, ri: offRd })), r = driftStats(driftRun({ v0: 16 }));
  console.log(`   drift a 16 u/s: fuera pico ${g.peak.toFixed(0)} deg, salida ${g.tRec.toFixed(2)} s, v final ${g.vOut.toFixed(1)} | carretera pico ${r.peak.toFixed(0)} deg, salida ${r.tRec.toFixed(2)} s, v final ${r.vOut.toFixed(1)}`);
  assert.ok(g.peak < 70 && g.tRec <= 0.9 && g.signs <= 1, 'fuera tambien se controla: ' + JSON.stringify(g));
  assert.ok(g.vOut < r.vOut, 'fuera es mas lento');
});

ok('giro brusco + acelerador a alta velocidad suelta la trasera de forma controlada; a baja velocidad o sin acelerador no', () => {
  const run = (v0, thr) => { let maxB = 0; sim(fresh(v0), { throttle: thr, steer: 1 }, 3, onRd, (st) => { maxB = Math.max(maxB, Math.abs(deg(st.beta))); }); return maxB; };
  const fast = run(23, 1), coast = run(23, 0), slow = run(10, 0.3); // (a 10 u/s con gas a fondo llegaria a 16+ u/s y tambien soltaria la trasera)
  console.log(`   volante a tope: 23 u/s con gas -> ${fast.toFixed(0)} deg ; 23 u/s sin gas -> ${coast.toFixed(0)} deg ; 10 u/s con gas suave -> ${slow.toFixed(0)} deg`);
  assert.ok(fast >= 15 && fast < 45, 'power-slide: ' + fast.toFixed(0));
  assert.ok(coast < 8 && slow < 10, 'sin gas / lento no derrapa');
});

ok('efectos visuales: el estado expone skid (traseras patinando) y beta (angulo de derrape) para humo, marcas y camara', () => {
  const tr = driftRun({});
  const skidOn = tr.filter((r) => r.skid > 0.5).length * DT;
  let straight = 0; sim(fresh(22), { throttle: 1, steer: 0 }, 2, onRd, (st) => { straight = Math.max(straight, st.skid); });
  console.log(`   skid > 0.5 durante ${skidOn.toFixed(2)} s del drift; en recta: ${straight.toFixed(2)}`);
  assert.ok(skidOn > 1.5 && straight === 0);
  let maxSk = 0; sim(fresh(12), { throttle: 0.5, steer: 1 }, 3, onRd, (st) => { maxSk = Math.max(maxSk, st.skid); });
  assert.ok(maxSk < 0.3, 'un giro normal no deja marcas: ' + maxSk.toFixed(2));
});

console.log(`\n${n} pruebas de vehicle OK`);
