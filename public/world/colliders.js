// Colisionadores simples en planta (puros, G4): circulos y cajas orientadas en una rejilla espacial. Los props grandes (casas, torres, monumentos,
// arboles grandes, hitos) los registran con ctx.addCollider / addBox (o automaticamente desde el helper de instanciado); vehicle.js los resuelve.
export class ColliderGrid {
  constructor(cell = 40) { this.cell = cell; this.map = new Map(); this.count = 0; }
  _key(i, j) { return i * 4096 + j + 2048 * 4096; }
  _each(x0, z0, x1, z1, fn) {
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) fn(this._key(i, j));
  }
  _put(o, x0, z0, x1, z1) {
    this._each(x0, z0, x1, z1, (k) => { let l = this.map.get(k); if (!l) this.map.set(k, l = []); l.push(o); });
    this.count++;
  }
  // circulo centrado en (x,z) de radio r ; devuelve el objeto registrado (para poder retirarlo/reponerlo con remove/add)
  addCircle(x, z, r) { const o = { t: 0, x, z, r }; this._put(o, x - r, z - r, x + r, z + r); return o; }
  // caja orientada: semiejes hx (local x) y hz (local z), yaw = rotacion alrededor de Y (como three: +z local gira hacia +x con yaw>0)
  addBox(x, z, hx, hz, yaw = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw), r = Math.hypot(hx, hz), o = { t: 1, x, z, hx, hz, c, s };
    this._put(o, x - r, z - r, x + r, z + r);
    return o;
  }
  clear() { this.map.clear(); this.count = 0; }

  // add/remove los usa el thinning de calidad para ocultar/mostrar la cola de instancias sin dejar colisionadores fantasma.
  // Re-inserta (add) o retira (remove) un objeto ya creado con los MISMOS limites que addCircle/addBox (mismas celdas, determinista).
  // remove: llamar una vez por registro (no remover dos veces el mismo objeto).
  add(o) {
    if (o.t === 0) this._put(o, o.x - o.r, o.z - o.r, o.x + o.r, o.z + o.r);
    else { const r = Math.hypot(o.hx, o.hz); this._put(o, o.x - r, o.z - r, o.x + r, o.z + r); }
  }
  remove(o) {
    if (o.t === 0) this._each(o.x - o.r, o.z - o.r, o.x + o.r, o.z + o.r, (k) => { const l = this.map.get(k); if (l) { const i = l.indexOf(o); if (i >= 0) l.splice(i, 1); } });
    else { const r = Math.hypot(o.hx, o.hz); this._each(o.x - r, o.z - r, o.x + r, o.z + r, (k) => { const l = this.map.get(k); if (l) { const i = l.indexOf(o); if (i >= 0) l.splice(i, 1); } }); }
    this.count--;
  }

  // Empuja un circulo (x,z,rad) fuera de los colisionadores que toca. Devuelve null o { x, z, nx, nz, depth } (posicion corregida; n = normal de empuje
  // media, hacia afuera de los obstaculos; depth = mayor penetracion)
  push(x, z, rad) {
    const l = [], st = (this._stamp = (this._stamp || 0) + 1);
    this._each(x - rad, z - rad, x + rad, z + rad, (k) => { const q = this.map.get(k); if (q) for (const o of q) if (o.q !== st) { o.q = st; l.push(o); } });
    if (!l.length) return null;
    let px = x, pz = z, nx = 0, nz = 0, depth = 0, hit = false;
    for (let a = 0; a < l.length; a++) {
      const o = l[a];
      if (o.t === 0) {
        const dx = px - o.x, dz = pz - o.z, d = Math.hypot(dx, dz), pen = o.r + rad - d;
        if (pen <= 0) continue;
        const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0;
        px += ux * pen; pz += uz * pen; nx += ux; nz += uz; depth = Math.max(depth, pen); hit = true;
      } else {
        // al marco local de la caja: u = (+cos, -sin) en x, v = (+sin, +cos) en z (three: rotacion Y)
        const dx = px - o.x, dz = pz - o.z, lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
        const cx = Math.max(-o.hx, Math.min(o.hx, lx)), cz = Math.max(-o.hz, Math.min(o.hz, lz));
        let ex = lx - cx, ez = lz - cz, d = Math.hypot(ex, ez), pen, ux, uz;
        if (d > 1e-6) { pen = rad - d; if (pen <= 0) continue; ux = ex / d; uz = ez / d; }
        else { // centro dentro de la caja: sale por la cara mas cercana
          const gx = o.hx - Math.abs(lx), gz = o.hz - Math.abs(lz);
          if (gx < gz) { ux = Math.sign(lx) || 1; uz = 0; pen = gx + rad; } else { ux = 0; uz = Math.sign(lz) || 1; pen = gz + rad; }
        }
        // normal local -> mundo: x_w = lx*c + lz*s ; z_w = -lx*s + lz*c
        const wx = ux * o.c + uz * o.s, wz = -ux * o.s + uz * o.c;
        px += wx * pen; pz += wz * pen; nx += wx; nz += wz; depth = Math.max(depth, pen); hit = true;
      }
    }
    if (!hit) return null;
    const nl = Math.hypot(nx, nz) || 1;
    return { x: px, z: pz, nx: nx / nl, nz: nz / nl, depth };
  }
}

// singleton del mundo: lo llenan los props al construirse (scene.js) y lo lee vehicle.js (game.js lo pasa en `env`)
export const COLLIDERS = new ColliderGrid(40);
