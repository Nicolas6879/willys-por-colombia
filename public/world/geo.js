// Ayudas de geometria (three) para fusionar piezas con vertex colors: bake/merge, nubes de esferas, atributo de viento.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash01 } from './base.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
// Geometria sin indices con color constante (hex sRGB) o color(x,y,z) por vertice (devuelve [r,g,b] lineal o hex), movida/rotada/escalada.
export function bake(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(_m);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = typeof color === 'function' ? color(p.getX(i), p.getY(i), p.getZ(i), i) : color;
    if (Array.isArray(c)) col.set(c, i * 3); else { _c.set(c); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
export const merge = (list) => mergeGeometries(list, false);
export const trisOf = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

// atributo aWind por vertice: amp * clamp(y/hMax)^2 (tronco: 0 en la base, amp en la punta); hMax <= 0 -> amp constante (copas)
export function windAttr(geo, hMax, amp) {
  const p = geo.attributes.position, a = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) { const f = hMax > 0 ? Math.min(1, Math.max(0, p.getY(i) / hMax)) : 1; a[i] = amp * f * f; }
  geo.setAttribute('aWind', new THREE.BufferAttribute(a, 1));
  return geo;
}

// Nube de n esferas fusionadas (base achatada, scale.y 0.55), de radio ~extent. Atributo color = (h, h, h) con h 1 arriba y `lo` abajo
// (el shader de nubes tine la cara inferior; los bancos lo multiplican por el color de la region). seg = [anchura, altura] de las esferas.
export function puffGeometry(seed, n = 5, extent = 1, seg = [8, 6], lo = 0.0) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = hash01(seed * 7.3 + i, 11) * 6.283, d = i === 0 ? 0 : (0.35 + hash01(seed + i * 3.1, 5) * 0.65) * extent * 0.62, r = extent * (i === 0 ? 0.62 : 0.34 + hash01(seed + i, 7) * 0.3);
    const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.7, y = (hash01(seed + i * 1.7, 3) - 0.3) * extent * 0.22;
    parts.push(bake(new THREE.SphereGeometry(r, seg[0], seg[1]), (px, py) => { const h = Math.min(1, Math.max(0, (py + extent * 0.35) / (extent * 0.9))); const v = lo + (1 - lo) * h; return [v, v, v]; },
      { x, y, z, sy: 0.55 }));
  }
  return merge(parts);
}
