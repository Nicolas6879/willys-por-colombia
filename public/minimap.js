// Minimapa (canvas 2D, arriba a la derecha). Proyeccion y flechas de borde PURAS (testeadas); el dibujo usa un canvas.
// Norte arriba: -z del mundo = arriba en pantalla. El mapa se centra en el carro.
export const MINI = { size: 180, viewRadius: 420 }; // px y unidades del mundo visibles hasta el borde del circulo

// mundo (wx,wz) -> px del canvas, con el carro (cx,cz) en el centro. scale = px por unidad
export function worldToMap(wx, wz, cx, cz, scale, size = MINI.size) {
  return { x: (wx - cx) * scale + size / 2, y: (wz - cz) * scale + size / 2 };
}
export const miniScale = (size = MINI.size, viewRadius = MINI.viewRadius) => size / 2 / viewRadius;

// Flecha en el borde del circulo hacia una zona fuera de la vista: null si cae dentro (visible). inset = px hacia adentro desde el borde.
export function edgeArrow(wx, wz, cx, cz, zoneRadius, size = MINI.size, viewRadius = MINI.viewRadius, inset = 9) {
  const dx = wx - cx, dz = wz - cz, d = Math.hypot(dx, dz);
  if (d - zoneRadius <= viewRadius) return null; // alguna parte de la zona ya se ve
  const R = size / 2 - inset, a = Math.atan2(dz, dx);
  return { x: size / 2 + Math.cos(a) * R, y: size / 2 + Math.sin(a) * R, angle: a, dist: d };
}

export const hex = (c) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');
export function mixColor(parts) { // [{color, w}] -> 0xRRGGBB
  let r = 0, g = 0, b = 0, ws = 0;
  for (const p of parts) { r += ((p.color >> 16) & 255) * p.w; g += ((p.color >> 8) & 255) * p.w; b += (p.color & 255) * p.w; ws += p.w; }
  if (!ws) return 0xffffff;
  return (Math.round(r / ws) << 16) | (Math.round(g / ws) << 8) | Math.round(b / ws);
}

// color ilustrado del terreno (G4): mar claro, playa crema, tierra verde suave hacia roca y nieve; shade = hillshade -1..1
export function miniIllustrated(h, shade = 0) {
  let c;
  if (h < 0) c = [159, 216, 240];
  else if (h < 3.5) c = [244, 230, 176];
  else if (h < 40) c = [207, 232, 166];
  else if (h < 90) c = [168, 208, 134];
  else if (h < 135) c = [190, 176, 128];
  else c = [236, 230, 216];
  const k = 1 + shade * 0.22;
  return [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
}

export class Minimap {
  // world: { size, half, heightAt, roads: [[[x,z],...], ...] (una polilinea por tramo; o roadPoints: una sola), zones: [{id,cx,cz,radius,color}] }
  constructor(canvas, world, { size = MINI.size, viewRadius = MINI.viewRadius } = {}) {
    this.canvas = canvas; this.world = world; this.size = size; this.viewRadius = viewRadius;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.height = Math.round(size * dpr);
    canvas.style.width = canvas.style.height = size + 'px';
    this.ctx = canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
    this.scale = miniScale(size, viewRadius);
    this.visited = new Set();
    this._bakeTerrain();
  }

  // G4: el mundo es un rectangulo (minX..maxX, minZ..maxZ). Se hornea una vez, con el estilo del mapa ilustrado: mar azul claro, tierra crema-verde con
  // relieve suave, "fuera del mapa" lila palido; el contorno de Colombia (world.outline = [[x,z],...]) se dibuja encima cada frame.
  _bakeTerrain(cell = 16) {
    const { world } = this, bx = world.minX ?? -world.half, bz = world.minZ ?? -world.half, W = (world.maxX ?? world.half) - bx, H = (world.maxZ ?? world.half) - bz;
    const nx = Math.ceil(W / cell), nz = Math.ceil(H / cell), c = document.createElement('canvas');
    c.width = nx; c.height = nz;
    const g = c.getContext('2d'), img = g.createImageData(nx, nz), hs = world.heightAt;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = bx + (i + 0.5) * cell, z = bz + (j + 0.5) * cell, h = hs(x, z), o = (j * nx + i) * 4;
      let col = miniIllustrated(h, hillshade(hs(x - cell, z - cell), hs(x + cell, z + cell)));
      if (world.countrySD && h >= 0 && world.countrySD(x, z) < 0) col = [col[0] * 0.4 + 198 * 0.6, col[1] * 0.4 + 190 * 0.6, col[2] * 0.4 + 216 * 0.6]; // fuera del mapa
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.terrain = c; this.terrainRes = nx; this.terrainCell = cell; this.terrainOrigin = [bx, bz]; this.terrainSize = [nx, nz];
  }

  // car: {x,z,heading}; halo: color 0xRRGGBB del lugar que suena (o null); t: segundos (para pulsar)
  draw(car, halo, t = 0) {
    const { ctx, size, scale, world } = this, S = size, C = S / 2;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(C, C, C - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#9FD8F0'; ctx.fillRect(0, 0, S, S);
    // terreno horneado: 1 px de textura = terrainCell unidades
    const k = this.terrainCell * scale, o = worldToMap(this.terrainOrigin[0], this.terrainOrigin[1], car.x, car.z, scale, S);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.terrain, o.x, o.y, this.terrainSize[0] * k, this.terrainSize[1] * k);
    // contorno de Colombia (tinta, como el mapa grande)
    if (world.outline) {
      ctx.lineJoin = 'round'; ctx.beginPath();
      world.outline.forEach(([x, z], i) => { const p = worldToMap(x, z, car.x, car.z, scale, S); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      ctx.closePath(); ctx.lineWidth = 3; ctx.strokeStyle = '#3A2418'; ctx.stroke();
    }
    // carretera
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const line of (world.roads || [world.roadPoints])) line.forEach(([x, z], i) => { const p = worldToMap(x, z, car.x, car.z, scale, S); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(58,36,24,0.55)'; ctx.stroke(); // borde tierra (sticker)
    ctx.lineWidth = 3; ctx.strokeStyle = '#E8C9A0'; ctx.stroke();
    // zonas
    for (const z of world.zones) {
      const p = worldToMap(z.cx, z.cz, car.x, car.z, scale, S), col = hex(z.color);
      ctx.beginPath(); ctx.arc(p.x, p.y, z.radius * scale, 0, Math.PI * 2);
      ctx.fillStyle = col + '55'; ctx.fill();
      ctx.lineWidth = this.visited.has(z.id) ? 3 : 2; ctx.strokeStyle = col; ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#3A2418'; ctx.stroke();
    }
    // Willys como flecha orientada (heading 0 = +z = abajo en pantalla; forward = (sin h, cos h))
    ctx.translate(C, C); ctx.rotate(Math.PI - car.heading); // la punta (0,-1) pasa a (sin h, cos h) en pantalla
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6); ctx.closePath();
    ctx.fillStyle = '#d6372b'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#3A2418'; ctx.stroke();
    ctx.restore();
    // flechas de borde hacia zonas fuera de la vista
    for (const z of world.zones) {
      const a = edgeArrow(z.cx, z.cz, car.x, car.z, z.radius, S, this.viewRadius);
      if (!a) continue;
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.angle);
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, 6); ctx.lineTo(-2, 0); ctx.lineTo(-5, -6); ctx.closePath();
      ctx.fillStyle = hex(z.color); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#3A2418'; ctx.stroke();
      ctx.restore();
    }
    // marco + halo del color de la region que suena
    ctx.beginPath(); ctx.arc(C, C, C - 4, 0, Math.PI * 2);               // aro crema + filete interior #3A2418 (el borde exterior lo pone el CSS)
    ctx.lineWidth = 7; ctx.strokeStyle = '#FFF4DC'; ctx.stroke();
    ctx.beginPath(); ctx.arc(C, C, C - 7.5, 0, Math.PI * 2);
    ctx.lineWidth = 2; ctx.strokeStyle = '#3A2418'; ctx.stroke();
    if (halo != null) {
      ctx.save();
      ctx.globalAlpha = 0.65 + 0.3 * Math.sin(t * 3);
      ctx.beginPath(); ctx.arc(C, C, C - 11, 0, Math.PI * 2);
      ctx.lineWidth = 4; ctx.strokeStyle = hex(halo); ctx.shadowColor = hex(halo); ctx.shadowBlur = 10; ctx.stroke();
      ctx.restore();
    }
  }
}

// ---- Mapa grande (bigmap.js): piezas puras reutilizables ----
// Estela del recorrido: guarda un punto [x,z] cada >= minDist unidades, maximo `max` (descarta los mas viejos). Devuelve true si anadio.
export function pushTrail(trail, x, z, minDist = 14, max = 500) {
  const l = trail[trail.length - 1];
  if (l && Math.hypot(x - l[0], z - l[1]) < minDist) return false;
  trail.push([x, z]);
  if (trail.length > max) trail.splice(0, trail.length - max);
  return true;
}
// Lado (px) del mapa grande: frac del alto de pantalla, acotado al ancho disponible
export const bigMapSide = (vw, vh, frac = 0.7) => Math.max(200, Math.round(Math.min(vh * frac, vw * 0.94)));
// Escala del mapa grande centrado en el origen del mundo: todo el mundo (size) cabe en `side` px
export const bigScale = (side, worldSize) => side / worldSize;
// Sombreado suave de relieve (luz del NO): delta de altura entre vecinos -> factor de brillo ~[-1,1]
export const hillshade = (hNW, hSE, k = 0.035) => Math.max(-1, Math.min(1, (hNW - hSE) * k));
