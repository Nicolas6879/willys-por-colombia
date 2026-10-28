// Kit comun de G3b para Cali y Medellin (solo helpers locales; no toca ctx.js): geometrias fusionadas con vertex colors, colinas que
// siguen el terreno, liston (rio), personaje chibi, ventanas emisivas y contorno instanciado.
import * as THREE from 'three';
import { bake, merge, windAttr } from '../../geo.js';
import { addOutline, celMat } from '../../materials.js';
import { heightAt } from '../../terrain.js';
import { distPoly } from '../../layout.js';

export { bake, merge, windAttr, distPoly };
export const B = (w, h, d, x, y, z, c, o = {}) => bake(new THREE.BoxGeometry(w, h, d), c, { x, y, z, ...o });
export const S = (r, x, y, z, c, o = {}, ws = 7, hs = 5) => bake(new THREE.SphereGeometry(r, ws, hs), c, { x, y, z, ...o });
export const C = (rt, rb, h, x, y, z, c, o = {}, seg = 7) => bake(new THREE.CylinderGeometry(rt, rb, h, seg), c, { x, y, z, ...o });
export const K = (r, h, x, y, z, c, o = {}, seg = 7) => bake(new THREE.ConeGeometry(r, h, seg), c, { x, y, z, ...o });
// agrega un triangulo (cada vertice [x,y,z]) con el orden que mira hacia arriba (normal.y > 0)
function pushUp(pos, col, c, a, b, d) {
  const ux = b[0] - a[0], uz = b[2] - a[2], vx = d[0] - a[0], vz = d[2] - a[2], ny = uz * vx - ux * vz;
  const t = ny >= 0 ? [a, b, d] : [a, d, b];
  for (const v of t) { pos.push(v[0], v[1], v[2]); col.push(c.r, c.g, c.b); }
}
function finish(pos, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals(); return g;
}

// mesh estatico con vertex colors (material cel 'vc'); culling por frustum normal
export function addVC(scene, geo, { outline = 0, kind = 'vc' } = {}) {
  const m = new THREE.Mesh(geo, celMat(kind)); m.frustumCulled = true; geo.computeBoundingSphere();
  if (outline) addOutline(m, { thickness: outline });
  scene.add(m); return m;
}

// colina suave que sigue el terreno: perfil coseno (0 en el borde = se funde con el suelo). colorFn(f (0 borde..1 cima), ang, i) -> hex. flat shading real (sin indices)
export function hillGeometry(cx, cz, R, H, colorFn, { rings = 6, seg = 14, noise = 0.0, base = 0.12 } = {}) {
  const pos = [], col = [], c = new THREE.Color();
  const P = (i, j) => {
    const a = (j / seg) * Math.PI * 2, f = 1 - i / rings, r = R * (i / rings) * (1 + noise * Math.sin(a * 3 + 1));
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, k = f <= 0 ? 0 : Math.pow(Math.sin(f * Math.PI / 2), 1.2);
    return [x, heightAt(x, z) + base + H * k, z, f, a];
  };
  // i = 0 es la cima (radio 0), i = rings el borde
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = P(i, j), b = P(i, j + 1), d = P(i + 1, j), e = P(i + 1, j + 1);
    const tris = i === 0 ? [[a, d, e]] : [[a, d, e], [a, e, b]];
    for (const t of tris) {
      const f = (t[0][3] + t[1][3] + t[2][3]) / 3;
      c.set(colorFn(f, (t[0][4] + t[1][4] + t[2][4]) / 3, i * seg + j));
      pushUp(pos, col, c, t[0], t[1], t[2]);
    }
  }
  return finish(pos, col);
}
// altura de la superficie de la colina en (x,z) (mismo perfil que hillGeometry, sin ruido de borde): para apoyar casas y escaleras
export function hillSurface(cx, cz, R, H, base = 0.12) {
  return (x, z) => { const f = 1 - Math.hypot(x - cx, z - cz) / R; return heightAt(x, z) + (f <= 0 ? 0 : base + H * Math.pow(Math.sin(Math.min(1, f) * Math.PI / 2), 1.2)); };
}
export const hillTopY = (cx, cz, H) => heightAt(cx, cz) + 0.12 + H;

// liston de terreno (rio, camino): pts [[x,z]...], ancho w, desplazamiento y, color por banda ('edge'/'mid')
export function ribbonGeometry(pts, w, yOff, colorFn, sub = 3) {
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < sub; k++) dense.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k / sub, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k / sub]);
  dense.push(pts[pts.length - 1]);
  const pos = [], col = [], c = new THREE.Color();
  const side = (i, s, ww) => { const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; const x = dense[i][0] - dz / l * ww * s, z = dense[i][1] + dx / l * ww * s; return [x, heightAt(x, z) + yOff, z]; };
  for (let i = 0; i < dense.length - 1; i++) {
    const q = [side(i, -1, w / 2), side(i, 1, w / 2), side(i + 1, -1, w / 2), side(i + 1, 1, w / 2)];
    c.set(colorFn(i));
    pushUp(pos, col, c, q[0], q[2], q[1]); pushUp(pos, col, c, q[1], q[2], q[3]);
  }
  return finish(pos, col);
}

// personaje chibi (cabeza ~ 45% del cuerpo), de pie en y=0, altura ~2.2: {skin, top, bottom, hair, skirt (cono en vez de piernas), hat}
export function chibi({ skin = 0xf2c9a0, top = 0xffffff, bottom = 0x2b2f4a, hair = 0x3a2418, skirt = null, armUp = false } = {}) {
  const p = [];
  if (skirt != null) p.push(K(0.62, 0.95, 0, 0.62, 0, skirt, {}, 8));
  else { p.push(C(0.17, 0.17, 0.7, -0.2, 0.35, 0, bottom, {}, 6), C(0.17, 0.17, 0.7, 0.2, 0.35, 0, bottom, {}, 6)); }
  p.push(C(0.36, 0.4, 0.75, 0, 1.05, 0, top, {}, 8));
  p.push(S(0.6, 0, 1.78, 0, skin, {}, 8, 6), S(0.64, 0, 1.9, -0.06, hair, { sy: 0.8 }, 8, 4));
  const ay = armUp ? 1.55 : 1.15;
  p.push(C(0.1, 0.1, 0.62, -0.5, ay, 0, top, { rz: armUp ? -0.5 : 0.12 }, 5), C(0.1, 0.1, 0.62, 0.5, ay, 0, top, { rz: armUp ? 0.5 : -0.12 }, 5));
  return merge(p);
}

// planos emisivos (ventanas) para glow: lista de [x,y,z,w,h] locales a una casa unitaria; plano mirando +z y -z? solo +z y +x por casa (barato)
export const windowQuads = (rows) => {
  const parts = [];
  for (const [x, y, w, h] of rows) parts.push(bake(new THREE.PlaneGeometry(w, h), 0xffffff, { x, y, z: 0.505 }), bake(new THREE.PlaneGeometry(w, h), 0xffffff, { x: 0.505, y, z: x, ry: Math.PI / 2 }));
  return merge(parts);
};

// contorno instanciado: devuelve un InstancedMesh con casco invertido que comparte la matriz de `im` (mismo conjunto de instancias)
export function outlineInstanced(scene, im, geo, thickness = 0.08) {
  const dummy = new THREE.Mesh(geo, celMat('vc')), o = addOutline(dummy, { thickness });
  const om = new THREE.InstancedMesh(o.geometry, o.material, im.instanceMatrix.count);
  om.instanceMatrix = im.instanceMatrix; om.frustumCulled = false; om.count = im.count;
  scene.add(om); return om;
}

// mueve una geometria local a (x, y, z) con giro yaw y escala sc (clona); y por defecto = altura del terreno
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
export function put(geo, x, z, yaw = 0, sc = 1, y = null) {
  const g = geo.clone(); _e.set(0, yaw, 0); _q.setFromEuler(_e);
  _m.compose(new THREE.Vector3(x, y == null ? heightAt(x, z) : y, z), _q, new THREE.Vector3(sc, sc, sc)); g.applyMatrix4(_m); return g;
}
// pie de una casa: altura minima y maxima del terreno bajo su huella (para que las casas en ladera queden "apiladas" sin huecos)
export function foot(x, z, r, fn = heightAt) {
  let lo = Infinity, hi = -Infinity;
  for (const [a, b] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) { const h = fn(x + a, z + b); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  lo = Math.max(lo, hi - 7); return { lo, hi };
}
