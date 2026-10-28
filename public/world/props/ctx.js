// Utilidades compartidas por los modulos de props (three). Cada region exporta `build(scene, ctx)` en props/<region>.js; devuelve
// opcionalmente { update(t) } para animaciones. Los props son PLACEHOLDERS baratos (formas basicas con color) que G3 reemplaza por region.
// G3a: `lambert(color)` / `basic(color)` ya NO crean materiales: devuelven un "token" y `inst` usa el material cel compartido (materials.js)
// con el color horneado en instanceColor (+-6% de luminosidad por instancia). `lambert(color, {wind:true})` usa el viento (geometria con aWind).
import * as THREE from 'three';
import { heightAt } from '../terrain.js';
import { roadInfo, roadAt, ROAD } from '../road.js';
import { ZONE_BY_ID } from '../regions.js';
import { hash01 } from '../base.js';
import { celMat, glowMat } from '../materials.js';
import { windAttr } from '../geo.js';
import { COLLIDERS } from '../colliders.js';

export const PASTEL = [0xff8fa3, 0xffd166, 0x7ee0b0, 0x8ecbff, 0xffa66b, 0xc9a6ff, 0xfff1a8, 0xff6f91];
export const lambert = (color, opts = {}) => ({ token: 'cel', color, kind: opts.wind ? (opts.vc ? 'wind' : 'windplain') : opts.vc ? 'vc' : 'plain' });
export const basic = (color) => ({ token: 'glow', color });
export const VARIATION = 0.06; // +-6% de luminosidad por instancia (ESTILO 2.5)

export function makeCtx(scene, { shadows = null } = {}) {
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color(), C2 = new THREE.Color();
  const stats = { draws: 0, tris: 0, instances: 0, colliders: 0, roadFiltered: 0, thin: [] };
  const triOf = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  // ---- colisionadores (G4): addCollider(x,z,r) / addBox(x,z,hx,hz,yaw) a mano, o automaticos desde inst() ----
  const addCollider = (x, z, r) => { COLLIDERS.addCircle(x, z, r); stats.colliders++; };
  const addBox = (x, z, hx, hz, yaw = 0) => { COLLIDERS.addBox(x, z, hx, hz, yaw); stats.colliders++; };
  const fpCache = new WeakMap();
  const footprintOf = (geo) => { // huella de la parte baja de la geometria: {cx, cz, hx, hz, h, tall}
    let f = fpCache.get(geo); if (f) return f;
    geo.computeBoundingBox(); const bb = geo.boundingBox, H = bb.max.y - Math.min(0, bb.min.y), p = geo.attributes.position, lim = bb.min.y + (bb.max.y - bb.min.y) * 0.4;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < p.count; i++) if (p.getY(i) <= lim) { const x = p.getX(i), z = p.getZ(i); if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    if (!isFinite(x0)) { x0 = x1 = z0 = z1 = 0; }
    f = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, h: H, base: bb.min.y }; fpCache.set(geo, f); return f;
  };
  // registra el colisionador de una instancia grande: casas/torres (caja o circulo segun su huella) y arboles (solo el tronco). Se salta lo bajo, lo fino
  // y lo que cae sobre la carretera (nunca bloquea la via). Devuelve el objeto colisionador registrado (o null) para que el thinning por calidad pueda retirarlo
  const autoCollide = (geo, it, opts = {}) => {
    if (opts.colliderR) { const x = it.x, z = it.z; if (roadInfo(x, z, 20).dist < ROAD.surfaceDist + 2.5) return null; const o = COLLIDERS.addCircle(x, z, opts.colliderR * (it.sx ?? 1)); stats.colliders++; return o; }
    const f = footprintOf(geo), sx = it.sx ?? 1, sy = it.sy ?? 1, sz = it.sz ?? 1, H = f.h * sy;
    if (H < 3.2 || (it.pitch || it.roll)) return null;
    let hx = f.hx * sx, hz = f.hz * sz;
    const wide = Math.max(hx, hz), treeLike = H / (2 * Math.max(wide, 0.01)) >= 1.4;
    if (treeLike) { hx = hz = Math.min(1.2, wide * 0.38); if (hx < 0.45) return null; }
    else if (wide < 1.0) return null;
    // centro de la huella (rotado por el yaw de la instancia)
    const c = Math.cos(it.yaw || 0), s = Math.sin(it.yaw || 0), ox = f.cx * sx, oz = f.cz * sz, x = it.x + ox * c + oz * s, z = it.z - ox * s + oz * c;
    if (roadInfo(x, z, 20).dist < ROAD.surfaceDist + 2.5) return null;
    const round = treeLike || Math.max(hx, hz) / Math.max(0.01, Math.min(hx, hz)) < 1.35;
    const o = round ? COLLIDERS.addCircle(x, z, Math.min(hx, hz) * (treeLike ? 1 : 0.92) + (treeLike ? 0 : (Math.max(hx, hz) - Math.min(hx, hz)) * 0.4)) : COLLIDERS.addBox(x, z, hx * 0.95, hz * 0.95, it.yaw || 0);
    stats.colliders++;
    return o;
  };
  // list: [{x,y,z,sx,sy,sz,yaw,pitch,roll}] ; colorOf(item, i) -> color (si hay). opts.thin: se puede reducir la densidad (degradacion automatica)
  const inst = (geo, matIn, list, colorOf, opts = {}) => {
    const tok = matIn && matIn.token ? matIn : null;
    const mat = tok ? (tok.token === 'glow' ? glowMat() : celMat(tok.kind)) : matIn;
    if (opts.onRoad !== true && !opts.dynamic) { // ningun prop sobre la franja de la carretera (cinta + bordes + 1 u)
      const keep = list.filter((it) => roadInfo(it.x, it.z, 20).dist > ROAD.halfWidth + 2.4);
      stats.roadFiltered += list.length - keep.length; list = keep;
    }
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    list.forEach((it, i) => {
      E.set(it.pitch || 0, it.yaw || 0, it.roll || 0); Q.setFromEuler(E);
      M.compose(P.set(it.x, it.y, it.z), Q, S.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1)); im.setMatrixAt(i, M);
      if (tok) {
        C.set(tok.color);
        if (colorOf) C.multiply(C2.set(colorOf(it, i)));
        C.multiplyScalar(1 + VARIATION * (hash01(it.x * 3.1 + i, it.z * 2.3 - i) * 2 - 1));
        im.setColorAt(i, C);
      } else if (colorOf) im.setColorAt(i, C.set(colorOf(it, i)));
    });
    const cols = (opts.collide !== false && !opts.dynamic) ? list.map((it) => autoCollide(geo, it, opts)) : null; // colisionador de cada instancia (null si no aplica), en el mismo orden que la lista
    im.count = list.length; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    if (opts.dynamic) { im.frustumCulled = false; } else { im.computeBoundingSphere(); im.frustumCulled = true; } // culling por malla (las regiones quedan lejos unas de otras)
    scene.add(im);
    if (list.length) { stats.draws++; stats.tris += triOf(geo) * list.length; stats.instances += list.length; }
    if (opts.thin) { // el thinning oculta la cola de la lista (mezclada por place()): hay que retirar/reponer sus colisionadores o quedan troncos invisibles
      let vis = list.length;
      const rec = { im, n: list.length };
      rec.set = (n) => { // n = instancias visibles con el nivel de calidad actual
        if (n !== vis && cols) {
          if (n < vis) for (let i = n; i < vis; i++) { const c = cols[i]; if (c) { COLLIDERS.remove(c); stats.colliders--; } }
          else for (let i = vis; i < n; i++) { const c = cols[i]; if (c) { COLLIDERS.add(c); stats.colliders++; } }
        }
        vis = n; im.count = n;
      };
      stats.thin.push(rec);
    }
    return im;
  };
  // puntos de una rejilla jitterada alrededor de (cx,cz)
  const grid = (cx, cz, half, step, seed) => {
    const pts = [];
    for (let x = cx - half; x <= cx + half; x += step) for (let z = cz - half; z <= cz + half; z += step)
      pts.push([x + (hash01(x * 0.13 + seed, z * 0.17) - 0.5) * step * 0.9, z + (hash01(x * 0.19, z * 0.11 + seed) - 0.5) * step * 0.9]);
    return pts;
  };
  // el resultado sale MEZCLADO (determinista): asi un `.slice(0, N)` o reducir la densidad quita instancias de forma pareja, no una franja del mapa
  const place = (pts, accept, build) => {
    const out = [];
    for (const [x, z] of pts) { const r = accept(x, z); if (r !== false && r != null) out.push(build(x, z, r)); }
    return out.map((o) => [hash01(o.x * 1.3 + 7, o.z * 0.9 + 3), o]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  };
  const farFromRoad = (x, z, d) => roadInfo(x, z).dist > d;
  // sombras blob estaticas bajo props grandes: items [{x,z}] ; r(item) = radio en u
  const shade = (items, r = 4, k = 1) => { if (shadows) for (const it of items) shadows.add(it.x, heightAt(it.x, it.z) + 0.22, it.z, typeof r === 'function' ? r(it) : r, k); };
  return { THREE, scene, stats, inst, grid, place, farFromRoad, heightAt, roadInfo, roadAt, hash01, ZONE_BY_ID, PASTEL, lambert, basic, shade, windAttr, addCollider, addBox };
}
