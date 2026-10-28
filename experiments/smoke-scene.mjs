// Smoke test de construccion de la escena G3a con three REAL (sin WebGL: el renderer es falso). No va en `npm test` porque el proyecto carga three por CDN.
// Uso:  mkdir C:\tmp\tl && cd C:\tmp\tl && npm i three@0.160.0   y luego   THREE_DIR=C:\tmp\tl\node_modules\three node experiments/smoke-scene.mjs
// Construye World + Willys, simula 300 frames del ciclo de dia / neblina / calidad y cuenta mallas, materiales, triangulos y llamadas estimadas.
import { register } from 'node:module';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = process.env.THREE_DIR;
if (!dir) { console.log('smoke-scene: omitido (define THREE_DIR=<carpeta del paquete three 0.160>)'); process.exit(0); }
const tmp = mkdtempSync(join(tmpdir(), 'smoke-'));
const T = pathToFileURL(join(dir, '/')).href;
writeFileSync(join(tmp, 'three-wrap.mjs'), `export * from '${T}build/three.module.js';
export class WebGLRenderer { constructor() { this.domElement = {}; this.shadowMap = {}; this.info = { render: { triangles: 0, calls: 0 } }; } setPixelRatio() {} setSize() {} render() {} }`);
writeFileSync(join(tmp, 'hooks.mjs'), `export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: ${JSON.stringify(pathToFileURL(join(tmp, 'three-wrap.mjs')).href)}, shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: '${T}examples/jsm/' + spec.slice(13), shortCircuit: true };
  return next(spec, ctx);
}`);
register(pathToFileURL(join(tmp, 'hooks.mjs')));

Object.assign(globalThis, { window: globalThis, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} });
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
globalThis.document = { createElement: () => ({ getContext: () => ctx2d, style: {} }) };

const root = pathToFileURL(join(import.meta.dirname, '..', 'public')).href;
const THREE = await import('three');
const { World } = await import(`${root}/world/scene.js`);
const { Willys } = await import(`${root}/willys.js`);
const { createState } = await import(`${root}/vehicle.js`);
const { heightAt } = await import(`${root}/world/terrain.js`);
const t0 = Date.now();
const w = new World({ appendChild() {} });
const wi = new Willys(); w.scene.add(wi.root);
const cam = new THREE.Vector3(0, 40, 0);
for (let i = 0; i < 300; i++) w.update({ t: i * 0.016, dt: 0.016, boost: (i % 100) / 100, camPos: cam, player: { x: -694 + i, z: -546 }, dayT: i / 300, glow: { medellin: 0.7 } });
for (let q = 1; q <= 3; q++) { w.setQuality(q); w.update({ t: 9, dt: 0.016, camPos: cam }); }
w.setQuality(0); w.render();
wi.update(createState(-694, -546, 0, 38), heightAt);
let meshes = 0; const mats = new Set(); w.scene.traverse((o) => { if (o.isMesh || o.isPoints) { meshes++; mats.add(o.material); } });
console.log(`smoke-scene OK: construccion ${Date.now() - t0} ms, ${meshes} mallas, ${mats.size} materiales (programas compartidos), ${Math.round(w.stats.tris)} tris en escena, ${w.stats.draws} draws de props+base, ${w.stats.colliders} colisionadores, ${w.stats.roadFiltered} props quitados de la carretera ${JSON.stringify(w.stats.perModule)}`);

// ---- G4: con los colisionadores REALES de los props (ya registrados al construir el mundo), un conductor scriptado recorre cada carretera de punta a punta:
// no debe chocar con nada (bump = 0) ni quedarse atascado. Tambien cuenta que hay colisionadores en las regiones.
const { ENV } = await import(`${root}/world/env.js`);
const { createSim, advance } = await import(`${root}/vehicle.js`);
const { roadInfo, ROADS } = await import(`${root}/world/road.js`);
let totalBumps = 0;
for (const R of ROADS) {
  const pts = []; for (let i = 0; i < R.N; i++) pts.push([R.px[i], R.pz[i]]);
  const sim = createSim(createState(R.px[2], R.pz[2], Math.atan2(R.tx[2], R.tz[2]), R.h[2]));
  let i = 0, bumps = 0, t = 0;
  for (; t < 120 && i < pts.length - 6; t += 1 / 60) {
    const s = sim.state;
    while (i < pts.length - 1 && Math.hypot(pts[i + 1][0] - s.x, pts[i + 1][1] - s.z) < Math.hypot(pts[i][0] - s.x, pts[i][1] - s.z)) i++;
    let j = i, acc = 0; while (j < pts.length - 1 && acc < 20) { acc += Math.hypot(pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1]); j++; }
    const err = Math.atan2(pts[j][0] - s.x, pts[j][1] - s.z) - s.heading, e = Math.atan2(Math.sin(err), Math.cos(err)), sp = Math.hypot(s.vf, s.vl);
    advance(sim, { throttle: sp < 24 && (Math.abs(e) < 0.6 || sp < 6) ? 1 : 0, brake: sp > 26 ? 0.3 : 0, steer: -Math.max(-1, Math.min(1, e * 2.2)) }, 1 / 60, heightAt, roadInfo, ENV);
    if (sim.state.bump > 0.5) bumps++;
  }
  totalBumps += bumps;
  console.log(`  ${R.id.padEnd(8)} ${t.toFixed(0)} s, ${bumps} golpes${i >= pts.length - 6 ? '' : '  (NO LLEGO)'}`);
}
console.log(`colisionadores: ${ENV.colliders.count}; golpes totales por las carreteras: ${totalBumps}`);
