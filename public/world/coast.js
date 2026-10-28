// Contorno de Colombia en el mundo 3D (G4, puro): poligono proyectado (geoproj), campos de distancia con signo por rejilla y utilidades.
//  - countrySD(x,z): distancia con signo al contorno REAL de Colombia (> 0 dentro). Base del limite jugable y de la franja "fuera del mapa".
//  - landSD(x,z): distancia con signo a la linea de PLAYA (> 0 en tierra, tambien la que sigue mas alla de las fronteras; < 0 en el mar).
//    Para saber que es mar y que es tierra extranjera, las fronteras terrestres se "empujan" 800 u hacia afuera (poligono extendido) y las dos
//    aristas que las unen a la costa (cuñas) cuentan como costa extranjera.
import { CHAINS, LONLAT } from './colombia.js';
import { llx } from './geoproj.js';

export const POLY = LONLAT.map(([lo, la]) => llx(lo, la)); // [[x,z],...] cerrado implicito

export const BORDER_PUSH = 800;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// poligono extendido P+ y sus aristas de costa
function buildPlus() {
  const pts = [], shore = []; // shore[i]: arista pts[i] -> pts[i+1] es costa
  const chains = CHAINS.map((c) => ({ kind: c.kind, pts: c.pts.map(([lo, la]) => llx(lo, la)) }));
  let i = 0;
  while (i < chains.length) {
    const c = chains[i];
    if (c.kind === 'coast') { for (let k = 0; k < c.pts.length - 1; k++) { pts.push(c.pts[k]); shore.push(true); } i++; continue; }
    // racha de fronteras consecutivas
    let run = [];
    while (i < chains.length && chains[i].kind === 'border') { run = run.concat(run.length ? chains[i].pts.slice(1) : chains[i].pts); i++; }
    const m = run.length - 1;
    const outN = (k) => { // normal exterior (unitaria) de la arista run[k] -> run[k+1]
      const [dx, dz] = sub(run[k + 1], run[k]), l = Math.hypot(dx, dz) || 1;
      let n = [dz / l, -dx / l];
      const mid = [(run[k][0] + run[k + 1][0]) / 2, (run[k][1] + run[k + 1][1]) / 2];
      if (pointInPoly(mid[0] + n[0] * 3, mid[1] + n[1] * 3, POLY)) n = [-n[0], -n[1]];
      return n;
    };
    pts.push(run[0]); shore.push(true); // cuña: tripunto -> primer vertice empujado
    for (let k = 1; k < m; k++) {
      const a = outN(k - 1), b = outN(k);
      let nx = a[0] + b[0], nz = a[1] + b[1]; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      const miter = Math.min(1.6, 1 / Math.max(0.5, (nx * a[0] + nz * a[1])));
      pts.push([run[k][0] + nx * BORDER_PUSH * miter, run[k][1] + nz * BORDER_PUSH * miter]); shore.push(k === m - 1);
    }
    // la arista del ultimo vertice empujado al tripunto final es la otra cuña (shore=true); las demas son lejanas
  }
  return { pts, shore };
}
const PLUS = buildPlus();
export const POLY_PLUS = PLUS.pts;

// ---- campos de distancia por rejilla ----
const CELL = 20, MARGIN = 700;
const xs = POLY.map((p) => p[0]), zs = POLY.map((p) => p[1]);
const GX0 = Math.floor((Math.min(...xs) - MARGIN) / CELL) * CELL, GZ0 = Math.floor((Math.min(...zs) - MARGIN) / CELL) * CELL;
const GNX = Math.ceil((Math.max(...xs) + MARGIN - GX0) / CELL) + 1, GNZ = Math.ceil((Math.max(...zs) + MARGIN - GZ0) / CELL) + 1;
// el mundo cubre el contorno + 540 u (la franja de tierra "fuera del mapa" que se ve mas alla de las fronteras, y el mar de las costas)
const EDGE = 540, f40 = (v, up) => (up ? Math.ceil(v / 40) : Math.floor(v / 40)) * 40;
export const WORLD_BOUNDS = { minX: f40(Math.min(...xs) - EDGE), maxX: f40(Math.max(...xs) + EDGE, 1), minZ: f40(Math.min(...zs) - EDGE), maxZ: f40(Math.max(...zs) + EDGE, 1) };

function edgeList(poly, flags) {
  const n = poly.length, E = [];
  for (let i = 0; i < n; i++) {
    if (flags && !flags[i]) continue;
    const a = poly[i], b = poly[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1];
    E.push({ ax: a[0], az: a[1], ex, ez, il: 1 / (ex * ex + ez * ez || 1) });
  }
  return E;
}
// distancia (acotada a RCAP) con cubetas: cada arista se guarda en las cubetas que toca su caja ensanchada RCAP
const RCAP = 560, BK = 200;
function bucketize(E) {
  const bx0 = Math.floor(GX0 / BK), bz0 = Math.floor(GZ0 / BK), nx = Math.ceil((GNX * CELL) / BK) + 2, nz = Math.ceil((GNZ * CELL) / BK) + 2, B = new Array(nx * nz);
  for (const e of E) {
    const x0 = Math.min(e.ax, e.ax + e.ex) - RCAP, x1 = Math.max(e.ax, e.ax + e.ex) + RCAP, z0 = Math.min(e.az, e.az + e.ez) - RCAP, z1 = Math.max(e.az, e.az + e.ez) + RCAP;
    for (let i = Math.floor(x0 / BK); i <= Math.floor(x1 / BK); i++) for (let j = Math.floor(z0 / BK); j <= Math.floor(z1 / BK); j++) {
      const k = (j - bz0) * nx + (i - bx0); if (k < 0 || k >= B.length) continue;
      (B[k] || (B[k] = [])).push(e);
    }
  }
  return { B, bx0, bz0, nx };
}
function distCap(K, x, z) {
  const list = K.B[(Math.floor(z / BK) - K.bz0) * K.nx + (Math.floor(x / BK) - K.bx0)];
  let best = RCAP * RCAP;
  if (list) for (const e of list) {
    const px = x - e.ax, pz = z - e.az;
    let f = (px * e.ex + pz * e.ez) * e.il; f = f < 0 ? 0 : f > 1 ? 1 : f;
    const dx = px - e.ex * f, dz = pz - e.ez * f, d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
// x de cruce de cada fila con el poligono (ordenados); dentro = numero impar de cruces a la izquierda
function crossings(poly, z) {
  const xs = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z)) xs.push((xj - xi) * (z - zi) / (zj - zi) + xi);
  }
  return xs.sort((p, q) => p - q);
}
const KP = bucketize(edgeList(POLY, null)), KS = bucketize(edgeList(PLUS.pts, PLUS.shore));
const SDP = new Float32Array(GNX * GNZ), SDS = new Float32Array(GNX * GNZ);
for (let j = 0; j < GNZ; j++) {
  const z = GZ0 + j * CELL + 1e-6, cp = crossings(POLY, z), cs = crossings(PLUS.pts, z);
  let ip = 0, is = 0;
  for (let i = 0; i < GNX; i++) {
    const x = GX0 + i * CELL, k = j * GNX + i;
    while (ip < cp.length && cp[ip] <= x) ip++;
    while (is < cs.length && cs[is] <= x) is++;
    const dP = distCap(KP, x, z), dS = distCap(KS, x, z);
    SDP[k] = ip & 1 ? dP : -dP;
    SDS[k] = is & 1 ? dS : -dS;
  }
}
function sample(F, x, z) {
  let fx = (x - GX0) / CELL, fz = (z - GZ0) / CELL;
  fx = fx < 0 ? 0 : fx > GNX - 1.001 ? GNX - 1.001 : fx; fz = fz < 0 ? 0 : fz > GNZ - 1.001 ? GNZ - 1.001 : fz;
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * GNX + i;
  return (F[k] * (1 - u) + F[k + 1] * u) * (1 - v) + (F[k + GNX] * (1 - u) + F[k + GNX + 1] * u) * v;
}
export const countrySD = (x, z) => sample(SDP, x, z);
export const landSD = (x, z) => sample(SDS, x, z);
// gradiente (hacia adentro de Colombia) de countrySD, unitario
export function countryGrad(x, z, h = 6) {
  const gx = countrySD(x + h, z) - countrySD(x - h, z), gz = countrySD(x, z + h) - countrySD(x, z - h), l = Math.hypot(gx, gz) || 1;
  return [gx / l, gz / l];
}
export const insideCountry = (x, z) => countrySD(x, z) > 0;
export const RASTER = { CELL, GX0, GZ0, GNX, GNZ };
