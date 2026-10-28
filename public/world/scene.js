// Escena three.js del mundo (G3a, todo procedural): ciclo de dia (daycycle.js) que gobierna cielo, sol, luces, fog y tintes; material cel compartido
// (materials.js); terreno y carretera con vertex colors; mar con espuma y rio (water.js); nubes del cielo y estrellas (sky.js); bancos de nubes de
// entrada a region (banks.js); sombras blob (shadows.js); camino vivo (life.js) y props por region. Sin sombras dinamicas, pixelRatio 1.
import * as THREE from 'three';
import { buildTerrainData, heightAt, TERRAIN } from './terrain.js';
import { buildRoadData, roadInfo, ROAD } from './road.js';
import { SITES } from './layout.js';
import { seaFloorAt } from './base.js';
import { countrySD, landSD } from './coast.js';
import { COLLIDERS } from './colliders.js';
import { solidify } from './solidify.js';
import { ZONES, fogRegionAt } from './regions.js';
import { RIVER, RIVERS } from './layout.js';
import { makeCtx } from './props/ctx.js';
import * as mountains from './props/mountains.js';
import * as caribe from './props/caribe.js';
import * as pacifico from './props/pacifico.js';
import * as santander from './props/santander.js';
import * as llanos from './props/llanos.js';
import * as cali from './props/cali.js';
import * as medellin from './props/medellin.js';
import { paletteAt, START_T } from './daycycle.js';
import { celMat, makeCel, setCelPalette, CEL } from './materials.js';
import { makeSkyDome, makeStars, makeSkyClouds } from './sky.js';
import { makeSea, makeRiver, riverRuns } from './water.js';
import { ShadowBlobs } from './shadows.js';
import { FogBanks } from './banks.js';
import { Life } from './life.js';
import { QUALITY } from '../perf.js';

export const FOG_NEAR_K = 0.17; // near = far * 0.17 (ESTILO: 40/220 a escala del mundo -> ~70/420)
const mixC = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const rgbOf = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const setSRGB = (c, a) => c.setRGB(a[0] / 255, a[1] / 255, a[2] / 255, THREE.SRGBColorSpace);

// Terreno en bloques (chunks de 20x20 celdas, solo donde hay tierra) para que three haga frustum culling y culling por distancia por bloque; material cel compartido
function terrainMesh(sink) {
  const d = buildTerrainData(undefined, undefined, { sink }), group = new THREE.Group(), mat = celMat('vc');
  for (const c of d.chunks) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(c.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(c.colors, 3));
    g.computeVertexNormals(); // sin indices -> normal por cara = flat shading
    g.computeBoundingSphere();
    group.add(new THREE.Mesh(g, mat));
  }
  group.userData.tris = d.tris;
  return group;
}

// una malla por tramo (frustum culling), mismo material cel con vertex colors
function roadMesh() {
  const d = buildRoadData(), group = new THREE.Group(), mat = makeCel({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const [a, b] of d.ranges) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.positions.slice(a * 3, b * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(d.colors.slice(a * 3, b * 3), 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    group.add(new THREE.Mesh(g, mat));
  }
  group.userData.tris = d.positions.length / 9;
  return group;
}

const PROP_MODULES = [mountains, caribe, pacifico, santander, llanos, cali, medellin];
// Cada region vive en props/<region>.js (`build(scene, ctx)` -> {update(t)}?). Cambia/reemplaza uno sin tocar el resto.
function* buildProps(scene, shadows) { // generador: cede entre regiones (carga por pasos)
  COLLIDERS.clear();
  const ctx = makeCtx(scene, { shadows }), updaters = [];
  const heroMat = celMat('hero');
  const NAMES = ['mountains', 'caribe', 'pacifico', 'santander', 'llanos', 'cali', 'medellin'];
  ctx.stats.perModule = {};
  for (const m of PROP_MODULES) {
    const before = new Set(scene.children), f0 = ctx.stats.roadFiltered, c0 = ctx.stats.colliders, r = m.build(scene, ctx); if (r?.update) updaters.push(r.update);
    // colisionadores automaticos de las mallas fusionadas estaticas que agrego la region (casas, muros, torres, monumentos); no las animadas (material hero)
    const roadClear = (x, z) => roadInfo(x, z, 12).dist < ROAD.halfWidth + 1.5;
    for (const o of scene.children) if (!before.has(o)) { o.updateMatrixWorld(true); o.traverse((q) => { if (q.isMesh && !q.isInstancedMesh && q.material !== heroMat && !q.userData.noCollide && q.geometry.attributes.position) ctx.stats.colliders += solidify({ positions: q.geometry.attributes.position.array, index: q.geometry.index?.array ?? null, m: q.matrixWorld.elements }, { heightAt, roadClear, grid: COLLIDERS }); }); }
    ctx.stats.perModule[NAMES[PROP_MODULES.indexOf(m)]] = { colliders: ctx.stats.colliders - c0, roadFiltered: ctx.stats.roadFiltered - f0 };
    yield;
  }
  return { ...ctx.stats, updaters };
}

function* buildPropsP(scene, shadows) { // buildProps con progreso 0.55..0.92
  const g = buildProps(scene, shadows); let i = 0;
  for (let r = g.next(); ; r = g.next()) { if (r.done) return r.value; i++; yield { p: 0.55 + 0.37 * i / PROP_MODULES.length, msg: 'Llenando las regiones' }; }
}

export class World {
  // opts: antialias (false por defecto: ESTILO seccion 5), startT (fase inicial del dia)
  constructor(container, opts = {}) { for (const _ of this._build(container, opts)); } // sincrono (pruebas / humo)

  // Carga por pasos: cede al navegador (tick) entre terreno, carretera, mar y cada region; onProgress(0..1, texto).
  static async create(container, opts = {}, onProgress = () => {}, tick = () => new Promise((r) => setTimeout(r, 0))) {
    const w = Object.create(World.prototype), it = w._build(container, opts);
    for (let r = it.next(); !r.done; r = it.next()) { onProgress(Math.min(0.95, r.value?.p ?? 0), r.value?.msg ?? ''); await tick(); }
    return w;
  }
  // precompila los shaders con la camara actual (evita el tirón del primer frame)
  async compile() { try { await (this.renderer.compileAsync ? this.renderer.compileAsync(this.scene, this.camera) : this.renderer.compile(this.scene, this.camera)); } catch { this.renderer.compile(this.scene, this.camera); } }

  *_build(container, { antialias = false, startT = START_T, terrainSink } = {}) {
    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1); // la mayor ganancia de fps en iGPU
    renderer.shadowMap.enabled = false;
    container.appendChild(renderer.domElement);
    const scene = this.scene = new THREE.Scene();
    this.level = 0; this.quality = QUALITY[0];
    this.fogColor = new THREE.Color(); this.fogBoost = 0; this.fogK = 0; this.fogZone = null; this.borderK = 0;
    scene.fog = new THREE.Fog(this.fogColor, this.quality.fogFar * FOG_NEAR_K, this.quality.fogFar); scene.fog.color = this.fogColor; // (Fog copia el color: compartimos la instancia)
    scene.background = this.fogColor;
    this.camera = new THREE.PerspectiveCamera(46, 1, 1, 3200);

    this.skyDome = makeSkyDome(); scene.add(this.skyDome.mesh);
    this.stars = makeStars(); scene.add(this.stars.mesh);
    this.skyClouds = makeSkyClouds(14); scene.add(this.skyClouds.group);
    yield { p: 0.05, msg: 'Pintando el cielo' };
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1); scene.add(this.sun); // su direccion alimenta el cel (y la luna de noche)

    this.terrain = terrainMesh(terrainSink); scene.add(this.terrain);
    yield { p: 0.4, msg: 'Levantando montañas' };
    this.road = roadMesh(); scene.add(this.road);
    yield { p: 0.5, msg: 'Trazando carreteras' };

    // fondo plano del mar (a -9, como el lecho de la costa) + mar con espuma + rios (se interrumpen junto a carreteras y regiones)
    const far = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000).rotateX(-Math.PI / 2), makeCel({ color: 0xe3d49a }));
    far.position.y = -9.05; scene.add(far);
    // mas alla de la malla (oculta por la niebla) el "suelo" es mar profundo
    this.sea = makeSea((x, z) => (landSD(x, z) > 0 && countrySD(x, z) < -TERRAIN.footprintOut + 40 ? -12 : seaFloorAt(x, z))); scene.add(this.sea.mesh);
    const siteD = (x, z) => Math.min(...Object.values(SITES).map((s) => Math.hypot(x - s.x, z - s.z)));
    const lvl = (x, z) => Math.max(0.25, heightAt(x, z) + 1.55);
    this.rivers = [];
    const addRiver = (pts, half, ok) => { for (const run of riverRuns(pts, ok)) { const r = makeRiver(run, half, lvl); this.rivers.push(r); scene.add(r.mesh); } };
    addRiver(RIVER.pts, 7, (x, z) => roadInfo(x, z, 40).dist > 16); // el rio del Pacifico pasa bajo la carretera (hueco de ~30 u, como un puente)
    for (const rv of RIVERS) addRiver(rv.pts, rv.half, (x, z) => roadInfo(x, z, 70).dist > 50 && siteD(x, z) > 250);

    this.shadows = new ShadowBlobs(scene);
    this.banks = new FogBanks(scene, ZONES, heightAt);
    yield { p: 0.55, msg: 'Llenando las regiones' };
    const stats = yield* buildPropsP(scene, this.shadows);
    this.stats = stats;
    this.life = new Life(scene, this.shadows);
    this.stats.tris += this.terrain.userData.tris + this.road.userData.tris + this.life.tris + this.skyClouds.tris;
    this.stats.draws += 2 + this.terrain.children.length + this.road.children.length;

    // culling por distancia: chunks de terreno, tramos de carretera y mallas instanciadas mas alla del fog far (+ su radio) no se dibujan (la niebla los tapa)
    this.cull = [];
    this.scene.traverse((o) => {
      const ch = o.parent === this.terrain || o.parent === this.road;
      if (!(ch && o.isMesh) && !(o.isInstancedMesh && o.frustumCulled)) return;
      const bs = o.isInstancedMesh ? (o.boundingSphere || (o.computeBoundingSphere(), o.boundingSphere)) : o.geometry.boundingSphere;
      this.cull.push({ o, x: bs.center.x, z: bs.center.z, r: bs.radius });
    });
    this.dayT = startT;
    this._applyPalette(paletteAt(startT), 1);
    this._onResize = () => this.resize();
    addEventListener('resize', this._onResize);
    this.resize();
    yield { p: 0.95, msg: 'Casi listo' };
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  // degradacion automatica: menos instancias "thin" (arboles, palmas, cafetales), menos nubes, fog mas corto
  setQuality(level) {
    this.level = Math.min(QUALITY.length - 1, Math.max(0, level)); this.quality = QUALITY[this.level];
    for (const { im, n, set } of this.stats.thin) { const c = Math.floor(n * this.quality.density); if (set) set(c); else im.count = c; } // set sincroniza tambien los colisionadores de las instancias ocultas
    this.life.setDensity(this.quality.density);
    this.skyClouds.setVisibleFraction(this.quality.clouds);
  }

  // aplica la paleta de la hora a cielo, luces, fog y tintes del material cel. dt = 0..: suavizado del color de region
  _applyPalette(p, dt) {
    this.palette = p;
    // niebla de region: el fog (y la linea del horizonte) se tine 2 s hacia el color "niebla entrada" de la region cercana
    // el color de la region se oscurece de noche (no queda una neblina rosa brillante sobre el cielo nocturno)
    const rc = this.fogZone ? mixC(rgbOf(this.fogZone.fog).map((v) => v * (1 - 0.7 * p.night)), p.horizon, p.night * 0.5) : p.horizon, k = this.fogK;
    let horizon = mixC(p.horizon, rc, k * 0.9), mid = mixC(p.mid, rc, k * 0.35);
    if (this.borderK > 0.01) { const bc = mixC([196, 190, 200], p.horizon, p.night * 0.6); horizon = mixC(horizon, bc, this.borderK * 0.75); mid = mixC(mid, bc, this.borderK * 0.3); } // fuera del mapa: neblina gris lila
    setSRGB(this.fogColor, horizon);
    this.skyDome.apply(p, horizon, mid);
    this.stars.apply(p);
    this.skyClouds.apply(p);
    setSRGB(this.hemi.color, p.hemiSky); setSRGB(this.hemi.groundColor, p.hemiGround); this.hemi.intensity = p.hemiI;
    setSRGB(this.sun.color, p.sun); this.sun.intensity = p.sunI; this.sun.position.set(p.sunDir[0] * 500, p.sunDir[1] * 500, p.sunDir[2] * 500);
    setCelPalette(p);
  }

  // o = { t (s), dt (s), boost 0..1 (fogBoost), camPos, glow {zoneId: 0..1}, player {x,z}, dayT 0..1 }
  update(o) {
    const { t, dt = 0.016, boost = 0, camPos, glow = {}, player = camPos } = o;
    if (o.dayT != null) this.dayT = o.dayT;
    CEL.uTime.value = t;
    const fr = fogRegionAt(player.x, player.z);
    if (fr.zone) this.fogZone = fr.zone;
    this.fogK += (fr.k - this.fogK) * (1 - Math.exp(-dt / 0.7)); // ~2 s
    this.fogBoost += (boost - this.fogBoost) * (1 - Math.exp(-dt * 6));
    // frontera terrestre cerca (y no costa): la niebla se vuelve gris lila y mas corta ("fuera del mapa")
    const sd = countrySD(player.x, player.z), bk = sd < 150 && landSD(player.x, player.z) > 90 ? 1 - Math.min(1, Math.max(0, (sd - 5) / 145)) : 0;
    this.borderK += (bk - this.borderK) * (1 - Math.exp(-dt / 0.6));
    this._applyPalette(paletteAt(this.dayT), dt);
    const f = this.scene.fog, far0 = this.quality.fogFar, b = this.fogBoost;
    const bf = 1 - 0.3 * this.borderK;
    f.far = (far0 + (120 - far0) * b) * bf; f.near = (far0 * FOG_NEAR_K + (8 - far0 * FOG_NEAR_K) * b) * bf; // la neblina de entrada cierra la vista
    this.skyDome.mesh.position.copy(camPos); this.stars.mesh.position.copy(camPos);
    this.skyClouds.update(t, camPos);
    this.sea.update(t, camPos); for (const r of this.rivers) r.update(t);
    this.life.update(t);
    const lim = far0 + 30; // far0 = fog far base de la calidad actual
    for (const c of this.cull) c.o.visible = Math.hypot(camPos.x - c.x, camPos.z - c.z) - c.r < lim;
    for (const u of this.stats.updaters) u(t);
    this.banks.update(t, dt, player, glow);
  }

  // texto del overlay de depuracion (tecla F): triangulos y llamadas del ultimo frame
  info() { const r = this.renderer.info.render; return { tris: r.triangles, calls: r.calls, level: this.level }; }

  render() { this.renderer.render(this.scene, this.camera); }
}
