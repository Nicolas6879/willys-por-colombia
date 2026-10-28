// Kit de G3b (Caribe + Pacifico): atajos para armar piezas con vertex colors (bake + merge de geo.js), mallas sueltas contadas en
// ctx.stats y utilidades para matrices dinamicas. Todo usa el material cel compartido ('vc' / 'wind' / 'plain'): no crea materiales nuevos.
import * as THREE from 'three';
import { bake, merge, trisOf } from '../../geo.js';
import { celMat } from '../../materials.js';

export { bake, merge, trisOf };
// piezas (color hex sRGB o fn(x,y,z,i)->hex/[r,g,b]); o = {x,y,z,rx,ry,rz,sx,sy,sz}
export const Bx = (w, h, d, c, o) => bake(new THREE.BoxGeometry(w, h, d), c, o);
export const Cy = (rt, rb, h, seg, c, o, open = false) => bake(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), c, o);
export const Sp = (r, c, o, ws = 8, hs = 6) => bake(new THREE.SphereGeometry(r, ws, hs), c, o);
export const Co = (r, h, seg, c, o, open = false) => bake(new THREE.ConeGeometry(r, h, seg, 1, open), c, o);
export const Oc = (r, c, o) => bake(new THREE.OctahedronGeometry(r), c, o);
export const Ic = (r, c, o) => bake(new THREE.IcosahedronGeometry(r, 0), c, o);
export const Ci = (r, seg, c, o) => bake(new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2), c, o);

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _u = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
// cilindro/cono truncado entre dos puntos 3D (a,b = [x,y,z])
export function limb(a, b, r1, r2, seg, color, open = true) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _d.length(); _q.setFromUnitVectors(_u, _d.normalize()); _e.setFromQuaternion(_q);
  return Cy(r2, r1, L, seg, color, { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2, rx: _e.x, ry: _e.y, rz: _e.z }, open);
}

// malla suelta (no instanciada) con material cel compartido; cuenta draws/tris en ctx.stats. outline: {thickness} -> casco invertido (hito)
export function solid(scene, stats, geo, { kind = 'vc', x = 0, y = 0, z = 0, yaw = 0, outline = null, addOutline = null, parent = null } = {}) {
  const m = new THREE.Mesh(geo, celMat(kind)); m.position.set(x, y, z); m.rotation.y = yaw;
  (parent || scene).add(m);
  stats.draws++; stats.tris += trisOf(geo);
  if (outline && addOutline) { addOutline(m, outline); stats.draws++; stats.tris += trisOf(geo); }
  return m;
}

// InstancedMesh dinamico (n pequeno; sus matrices se reescriben en update)
export function dynInst(scene, stats, geo, kind, n, colors = null) {
  const im = new THREE.InstancedMesh(geo, celMat(kind), n);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false;
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) { im.setMatrixAt(i, new THREE.Matrix4()); if (colors) im.setColorAt(i, c.set(colors[i])); }
  scene.add(im); stats.draws++; stats.tris += trisOf(geo) * n;
  return im;
}
const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _P = new THREE.Vector3(), _S = new THREE.Vector3();
// escribe la matriz i (orden YXZ: yaw, pitch, roll); no marca needsUpdate
export function setM(im, i, x, y, z, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) {
  _E.set(pitch, yaw, roll, 'YXZ'); _Q.setFromEuler(_E); _M.compose(_P.set(x, y, z), _Q, _S.set(sx, sy, sz)); im.setMatrixAt(i, _M);
}
export const zeroM = (im, i) => im.setMatrixAt(i, _M.makeScale(0, 0, 0));
export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// segmento de tabla/plank entre dos puntos 3D (caja de w x h, largo = |ab|), con color
export function plank(a, b, w, h, color) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), o = new THREE.Object3D();
  o.position.copy(A).add(B).multiplyScalar(0.5); o.lookAt(B); o.updateMatrix();
  const g = bake(new THREE.BoxGeometry(w, h, A.distanceTo(B)), color); g.applyMatrix4(o.matrix); return g;
}
// palmera con cocos: tronco curvo de 3 tramos + 6 hojas (planas) + 3 cocos; ~80 tris. leaf/bark: colores
export function palmGeometry(windAttr, { leaf = [0x5dbb63, 0x4aa955], coco = 0x6b4a2b } = {}) {
  const P = [], tp = [[0, 0, 0], [0.35, 2.6, 0], [1.0, 5.2, 0], [1.9, 7.6, 0]], bark = [0xb98550, 0xa87846, 0x9a6c3e];
  for (let i = 0; i < 3; i++) P.push(limb(tp[i], tp[i + 1], 0.42 - i * 0.07, 0.35 - i * 0.07, 5, bark[i]));
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3 + 0.3, tilt = k % 2 ? 0.25 : -0.45;
    P.push(bake(new THREE.ConeGeometry(0.95, 4.6, 4, 1, true).translate(0, 2.3, 0), leaf[k % 2], { x: 1.9, y: 7.8, ry: -a, rz: -(Math.PI / 2 - tilt), sx: 0.28 }));
  }
  P.push(Oc(0.42, coco, { x: 1.6, y: 7.3, z: 0.5 }), Oc(0.42, coco, { x: 2.3, y: 7.35, z: -0.3 }), Oc(0.4, coco, { x: 1.9, y: 7.1, z: -0.7 }));
  return windAttr(merge(P), 9, 0.3);
}
