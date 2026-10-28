// Colisionadores automaticos para mallas fusionadas estaticas (G4, puro): casas, muros, torres, troncos y monumentos que los props construyen como
// geometria suelta (no instanciada). Se rasterizan las caras VERTICALES (|ny| < 0.45) que cruzan la banda de altura del carro (0.5 .. 3.2 u sobre el
// terreno) en celdas de 2 u, y las celdas ocupadas se funden en rectangulos (cajas alineadas a los ejes). Asi las lomas, techos inclinados, hojas y el
// agua (caras inclinadas o planas) nunca bloquean, y nunca se bloquea la carretera.

// positions: Float32Array xyz (coordenadas locales), index: array de indices o null, m: matriz 4x4 columna-mayor de three (o null) -> a mundo.
// opts: heightAt(x,z), roadClear(x,z) -> true si la celda esta sobre la carretera (no cuenta), grid (ColliderGrid). Devuelve el numero de cajas.
export function solidify({ positions, index = null, m = null }, { heightAt, roadClear, grid, cell = 1.5, lo = 0.5, hi = 3.2, maxBoxes = 6000 }) {
  const n = index ? index.length : positions.length / 3;
  const W = (i, out) => {
    const k = (index ? index[i] : i) * 3, x = positions[k], y = positions[k + 1], z = positions[k + 2];
    if (m) { out[0] = m[0] * x + m[4] * y + m[8] * z + m[12]; out[1] = m[1] * x + m[5] * y + m[9] * z + m[13]; out[2] = m[2] * x + m[6] * y + m[10] * z + m[14]; } else { out[0] = x; out[1] = y; out[2] = z; }
  };
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], occ = new Map(), gcache = new Map();
  const ground = (x, z) => { const k = Math.floor(x / 4) + ',' + Math.floor(z / 4); let g = gcache.get(k); if (g === undefined) gcache.set(k, g = heightAt(x, z)); return g; };
  for (let t = 0; t + 2 < n; t += 3) {
    W(t, a); W(t + 1, b); W(t + 2, c);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-9 || Math.abs(ny) / nl >= 0.45) continue; // solo caras verticales
    const ymin = Math.min(a[1], b[1], c[1]), ymax = Math.max(a[1], b[1], c[1]), cx = (a[0] + b[0] + c[0]) / 3, cz = (a[2] + b[2] + c[2]) / 3, g = ground(cx, cz);
    if (ymax < g + lo || ymin > g + hi) continue;
    const x0 = Math.min(a[0], b[0], c[0]), x1 = Math.max(a[0], b[0], c[0]), z0 = Math.min(a[2], b[2], c[2]), z1 = Math.max(a[2], b[2], c[2]);
    if (x1 - x0 > 60 || z1 - z0 > 60) continue; // caras gigantes (fondos, cielo)
    const ja = Math.floor(z0 / cell), jb = Math.max(ja, Math.floor((z1 - 1e-6) / cell)), ia = Math.floor(x0 / cell), ib = Math.max(ia, Math.floor((x1 - 1e-6) / cell));
    for (let j = ja; j <= jb; j++) {
      let row = occ.get(j); if (!row) occ.set(j, row = new Set());
      for (let i = ia; i <= ib; i++) row.add(i);
    }
  }
  if (roadClear) for (const [j, row] of occ) for (const i of row) if (roadClear((i + 0.5) * cell, (j + 0.5) * cell)) row.delete(i);
  // rellenar el interior de edificios cerrados (celdas vacias que no se alcanzan desde afuera, hasta 400 celdas): una casa es un bloque macizo
  if (occ.size) {
    let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
    for (const [j, row] of occ) for (const i of row) { if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
    const w = i1 - i0 + 3, h = j1 - j0 + 3;
    if (w * h < 4e6) {
      const full = new Uint8Array(w * h), seen = new Uint8Array(w * h);
      for (const [j, row] of occ) for (const i of row) full[(j - j0 + 1) * w + (i - i0 + 1)] = 1;
      const stack = [0]; seen[0] = 1;
      while (stack.length) {
        const k = stack.pop(), x = k % w, y = (k / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const q = ny * w + nx; if (!seen[q] && !full[q]) { seen[q] = 1; stack.push(q); } }
      }
      // componentes encerrados pequenos -> macizos
      const comp = new Uint8Array(w * h);
      for (let k = 0; k < w * h; k++) {
        if (seen[k] || full[k] || comp[k]) continue;
        const cells = [k]; comp[k] = 1;
        for (let q = 0; q < cells.length; q++) { const x = cells[q] % w, y = (cells[q] / w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, z = ny * w + nx; if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[z] && !full[z] && !comp[z]) { comp[z] = 1; cells.push(z); } } }
        if (cells.length <= 400) for (const c of cells) { const j = ((c / w) | 0) + j0 - 1, i = (c % w) + i0 - 1; let row = occ.get(j); if (!row) occ.set(j, row = new Set()); row.add(i); }
      }
    }
  }
  // fundir en rectangulos: corridas en x por fila y luego pilas de corridas iguales en z
  const runs = new Map(); // "i0,i1,j" -> true
  for (const [j, row] of occ) {
    const is = [...row].sort((p, q) => p - q);
    let s0 = is[0], prev = is[0];
    for (let k = 1; k <= is.length; k++) { if (k === is.length || is[k] !== prev + 1) { if (is.length) runs.set(s0 + ',' + prev + ',' + j, true); s0 = is[k]; } prev = is[k]; }
  }
  const used = new Set(), rects = [];
  const order = [...runs.keys()].map((k) => k.split(',').map(Number)).sort((p, q) => p[2] - q[2] || p[0] - q[0]);
  for (const [i0, i1, j] of order) {
    const key = i0 + ',' + i1 + ',' + j; if (used.has(key)) continue;
    used.add(key); let j1 = j;
    while (runs.has(i0 + ',' + i1 + ',' + (j1 + 1)) && !used.has(i0 + ',' + i1 + ',' + (j1 + 1))) { j1++; used.add(i0 + ',' + i1 + ',' + j1); }
    rects.push([i0, i1, j, j1]);
  }
  let added = 0;
  for (const [i0, i1, j0, j1] of rects) {
    if (added >= maxBoxes) break;
    const hx = ((i1 - i0 + 1) * cell) / 2 - 0.25, hz = ((j1 - j0 + 1) * cell) / 2 - 0.25;
    if (hx <= 0.1 || hz <= 0.1) continue;
    grid.addBox((i0 + i1 + 1) * cell / 2, (j0 + j1 + 1) * cell / 2, hx, hz, 0); added++;
  }
  return added;
}
