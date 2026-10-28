// Ayudas para armar props "de juguete" con pocas primitivas: piezas con color horneado (vertex colors) que se fusionan en una malla.
// Ejes locales de los animales/vehiculos: +z = adelante, +y = arriba. (Copia identica en props/llanos/kit.js.)
import * as THREE from 'three';
import { bake, merge, trisOf } from '../../geo.js';
import { celMat, addOutline } from '../../materials.js';

export { bake, merge, trisOf, addOutline };
const _c = new THREE.Color(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
export const lin = (hex) => { _c.set(hex); return [_c.r, _c.g, _c.b]; };
export const mixc = (a, b, t) => { const A = lin(a), B = lin(b); return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; };
export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const box = (w, h, d, color, o = {}) => bake(new THREE.BoxGeometry(w, h, d), color, o);
export const ball = (r, color, o = {}, ws = 8, hs = 6) => bake(new THREE.SphereGeometry(r, ws, hs), color, o);
// cilindro/cono entre dos puntos [x,y,z] (r0 en a, r1 en b)
export function seg(a, b, r0, r1, color, radial = 5) {
  _a.set(...a); _b.set(...b);
  const dir = _b.clone().sub(_a), len = dir.length() || 1e-3;
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1);
  g.applyQuaternion(_q.setFromUnitVectors(_up, dir.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return bake(g, color);
}
// prisma triangular (techo a dos aguas): ancho w, alto h, largo l (a lo largo de z), base en y=0
export function gable(w, h, l, color) {
  const g = new THREE.CylinderGeometry(1, 1, 1, 3).rotateX(-Math.PI / 2); // vertice arriba, eje en z; y de -0.5 a 1, ancho 1.732
  return bake(g, color, { sx: w / 1.732, sy: h / 1.5, sz: l, y: (0.5 * h) / 1.5 });
}
// copia colocada (x,y,z,yaw) de una geometria con color
export function put(geo, x = 0, y = 0, z = 0, yaw = 0, s = 1) {
  const g = geo.clone();
  g.applyMatrix4(_m.compose(new THREE.Vector3(x, y, z), _q.setFromAxisAngle(_up, yaw), new THREE.Vector3(s, s, s)));
  return g;
}
export const mesh = (parent, geo, kind = 'vc') => { const m = new THREE.Mesh(geo, celMat(kind)); parent.add(m); return m; };
export const tint = (geo, hex) => geo; // (reservado)
// InstancedMesh animable (matrices por frame; sin culling porque se mueve)
export function dynInst(parent, geo, n, colors = null, kind = 'vc') {
  const im = new THREE.InstancedMesh(geo, celMat(kind), n);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false;
  if (colors) colors.forEach((c, i) => im.setColorAt(i, _c.set(c)));
  parent.add(im); return im;
}
const _E = new THREE.Euler(), _Q = new THREE.Quaternion(), _M = new THREE.Matrix4(), _P = new THREE.Vector3(), _S = new THREE.Vector3();
export function setM(im, i, x, y, z, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) {
  _E.set(pitch, yaw, roll, 'YXZ'); _Q.setFromEuler(_E);
  im.setMatrixAt(i, _M.compose(_P.set(x, y, z), _Q, _S.set(sx, sy, sz)));
}
export const done = (im) => { im.instanceMatrix.needsUpdate = true; };
// suma al contador de estadisticas de ctx (draws y triangulos de mallas propias)
export const count = (stats, geo, n = 1, draws = 1) => { stats.draws += draws; stats.tris += trisOf(geo) * n; };
