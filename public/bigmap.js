// Mapa grande (tecla N / clic en el minimapa): MAPA ILUSTRADO de Colombia (papel crema, mar con ondas, silueta real suavizada, regiones en su
// posicion geografica, cordilleras, rios, carreteras punteadas). La parte estatica se hornea una vez en un canvas fuera de pantalla; cada
// frame solo se dibuja la estela, el pulso/visitadas y el Willys. El mundo (x,z) se lleva al mapa con worldToGeo (geomap.js). El juego sigue debajo.
import { hex, bigMapSide } from './minimap.js';
import { worldToGeo, geoToPx, GEO_CENTERS, COLOMBIA_LL, RIDGES_LL, RIVERS_LL, VIEW } from './geomap.js';

const INK = '#3A2418', CREAM = '#FFF4DC', SEA = '#9FD8F0', LAND = '#CFE8A6';

// ---- iconos simples (caja -1..1 escalada por r, centrados en 0,0); fillStyle/strokeStyle ya puestos ----
const ICONS = {
  caribe(g, r) { // sombrero vueltiao: ala ancha + copa con franjas
    g.beginPath(); g.ellipse(0, 0.35 * r, r, 0.38 * r, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-0.5 * r, 0.3 * r); g.quadraticCurveTo(-0.45 * r, -0.8 * r, 0, -0.8 * r); g.quadraticCurveTo(0.45 * r, -0.8 * r, 0.5 * r, 0.3 * r); g.closePath(); g.fill(); g.stroke();
    g.save(); g.lineWidth = 1.5; for (const y of [-0.45, -0.1]) { g.beginPath(); g.moveTo(-0.46 * r, y * r); g.lineTo(0.46 * r, y * r); g.stroke(); } g.restore();
  },
  pacifico(g, r) { // ballena de perfil
    g.beginPath(); g.moveTo(-r, 0.1 * r); g.quadraticCurveTo(-0.3 * r, -0.7 * r, 0.6 * r, -0.1 * r); g.lineTo(r, -0.5 * r); g.lineTo(0.9 * r, 0.1 * r); g.lineTo(r, 0.6 * r); g.lineTo(0.55 * r, 0.3 * r);
    g.quadraticCurveTo(-0.2 * r, 0.8 * r, -r, 0.1 * r); g.closePath(); g.fill(); g.stroke();
    g.save(); g.fillStyle = INK; g.beginPath(); g.arc(-0.55 * r, 0, Math.max(1.3, 0.07 * r), 0, Math.PI * 2); g.fill(); g.restore();
  },
  santander(g, r) { // hormiga: tres segmentos, patas y antenas
    g.save(); g.lineWidth = 1.6;
    for (const dx of [-0.2, 0.15, 0.5]) { g.beginPath(); g.moveTo(dx * r, 0.1 * r); g.lineTo((dx - 0.25) * r, 0.75 * r); g.moveTo(dx * r, 0.1 * r); g.lineTo((dx + 0.25) * r, 0.75 * r); g.stroke(); }
    g.beginPath(); g.moveTo(-0.65 * r, -0.2 * r); g.lineTo(-0.95 * r, -0.75 * r); g.moveTo(-0.55 * r, -0.2 * r); g.lineTo(-0.35 * r, -0.75 * r); g.stroke();
    g.restore();
    for (const [x, rr] of [[-0.6, 0.28], [-0.1, 0.25], [0.55, 0.45]]) { g.beginPath(); g.arc(x * r, 0, rr * r, 0, Math.PI * 2); g.fill(); g.stroke(); }
  },
  llanos(g, r) { // palma moriche: tronco curvo + frondas en abanico
    g.save(); g.lineWidth = 2.4; g.beginPath(); g.moveTo(0, r); g.quadraticCurveTo(0.2 * r, 0.2 * r, 0, -0.35 * r); g.stroke(); g.restore();
    g.save(); g.translate(0, -0.35 * r);
    for (const a of [-1.3, -0.65, 0, 0.65, 1.3]) { g.save(); g.rotate(a); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(0.35 * r, -0.7 * r, 0.1 * r, -0.95 * r); g.quadraticCurveTo(-0.1 * r, -0.5 * r, 0, 0); g.fill(); g.stroke(); g.restore(); }
    g.restore();
  },
  cali(g, r) { // figura de salsa: bailarina con falda y brazos
    g.save(); g.lineWidth = 2; g.beginPath(); g.moveTo(0, -0.4 * r); g.lineTo(0.8 * r, -0.85 * r); g.moveTo(0, -0.4 * r); g.lineTo(-0.7 * r, -0.1 * r); g.stroke(); g.restore();
    g.beginPath(); g.arc(0, -0.75 * r, 0.22 * r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-0.15 * r, -0.5 * r); g.lineTo(0.15 * r, -0.5 * r); g.lineTo(0.9 * r, 0.9 * r); g.quadraticCurveTo(0.2 * r, 0.5 * r, 0, 0.1 * r); g.quadraticCurveTo(-0.5 * r, 0.6 * r, -0.9 * r, 0.9 * r); g.closePath(); g.fill(); g.stroke();
  },
  medellin(g, r) { // cabina de metrocable colgada de un cable
    g.save(); g.lineWidth = 2; g.beginPath(); g.moveTo(-r, -0.85 * r); g.lineTo(r, -0.55 * r); g.moveTo(0, -0.7 * r); g.lineTo(0, -0.3 * r); g.stroke(); g.restore();
    g.beginPath(); g.roundRect(-0.55 * r, -0.3 * r, 1.1 * r, 1.0 * r, 0.2 * r); g.fill(); g.stroke();
    g.fillStyle = '#d9efff'; g.fillRect(-0.4 * r, -0.12 * r, 0.8 * r, 0.42 * r); g.strokeRect(-0.4 * r, -0.12 * r, 0.8 * r, 0.42 * r);
  },
};

// ---- datos de dibujo en lon/lat ----
// continente vecino (Panama, Venezuela, Brasil, Peru, Ecuador): sube por dentro de Colombia, que se pinta encima
const CONTINENT = [
  [-83.2, 8.1], [-82.6, 9.0], [-81.5, 9.2], [-79.5, 9.6], [-77.35, 8.67], [-75, 9], [-73, 10], [-71.9, 11.5], [-71.3, 11.8], [-69.5, 11.7],
  [-67, 10.7], [-61, 10.7], [-61, -7], [-79.3, -7], [-79.6, -4.5], [-80.5, -3], [-80.9, -1.0], [-80.0, 0.0], [-79, 1.2], [-78.8, 1.6],
  [-77.5, 3], [-76.8, 5.5], [-77.5, 7.0], [-77.9, 7.23], [-78.5, 7.6], [-80.5, 7.3],
];
// cordilleras SO -> NE (hileras de montanitas): las mismas del mundo 3D (layout.js) llevadas a lon/lat
const RIDGE_COLORS = { occidental: '#8C6A4A', central: '#9A7552', oriental: '#A98058', merida: '#B08A60', perija: '#A98058', baudo: '#8C6A4A' };
const RIDGES = RIDGES_LL.map((r) => ({ c: RIDGE_COLORS[r.name] || '#9A7552', pts: r.pts.map(([lo, la]) => [lo, la]) }));
const RIVERS = RIVERS_LL.map((r) => r.pts); // Magdalena y Cauca
const COUNTRIES = [['VENEZUELA', -67.5, 8.2], ['BRASIL', -65.5, -1.5], ['PERÚ', -72.5, -6.0], ['ECUADOR', -80.4, -3.6], ['PANAMÁ', -80.0, 8.4]];
// posicion de la etiqueta de cada region: abajo (def.), 'l' izquierda, 't' arriba
const LABEL_SIDE = { pacifico: 'l', medellin: 't' };

// poligono recto (la silueta es EXACTAMENTE el contorno del mundo 3D)
function polyPath(g, pts) { g.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y); g.closePath(); }
// Catmull-Rom -> curvas bezier por los puntos (cerrada o abierta); pts en px
function smoothPath(g, pts, closed) {
  const n = pts.length, P = (i) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))], last = closed ? n : n - 1;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    g.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
  }
  if (closed) g.closePath();
}
const rngOf = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

export class BigMap {
  // root: <div id="bigmap"> con un <canvas>; world: { roads, zones }; trail: [[x,z],...] compartido; visited: Set de ids
  constructor(root, world, { trail, visited }) {
    this.world = world; this.trail = trail; this.visited = visited; this.open = false;
    this.root = root; this.canvas = root.querySelector('canvas'); this.ctx = this.canvas.getContext('2d');
    this.bg = null;
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    const side = bigMapSide(innerWidth, innerHeight), dpr = Math.min(devicePixelRatio || 1, 2);
    this.side = side; this.dpr = dpr; this.bg = null; // al cambiar de tamano se vuelve a hornear
    this.canvas.width = this.canvas.height = Math.round(side * dpr);
    this.canvas.style.width = this.canvas.style.height = side + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  toggle(on = !this.open) {
    this.open = on; this.root.classList.toggle('show', on); document.body.classList.toggle('map-on', on);
    if (on && !this.bg) this._bake();
  }

  // ---- parte estatica, una sola vez ----
  _bake() {
    const S = this.side, dpr = this.dpr, k = S / 700; // k escala grosores y tipos a cualquier tamano
    const c = document.createElement('canvas'); c.width = c.height = Math.round(S * dpr);
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const PX = (lon, lat) => geoToPx(lon, lat, S), pxs = (pts) => pts.map(([lo, la]) => PX(lo, la)), deg = S / VIEW.span;
    const rnd = rngOf(7);
    g.lineJoin = 'round'; g.lineCap = 'round';

    // 1. mar + ondas dibujadas
    g.fillStyle = SEA; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.6 * k;
    const step = 46 * k;
    for (let y = step / 2; y < S; y += step) for (let x = step / 2; x < S; x += step) {
      const px = x + (rnd() - 0.5) * step * 0.7, py = y + (rnd() - 0.5) * step * 0.7, w = 7 * k;
      g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + w / 2, py - w * 0.6, px + w, py); g.quadraticCurveTo(px + w * 1.5, py + w * 0.6, px + w * 2, py);
      g.quadraticCurveTo(px + w * 2.5, py - w * 0.6, px + w * 3, py); g.stroke();
    }
    // 2. continente vecino
    g.beginPath(); smoothPath(g, pxs(CONTINENT), true); g.fillStyle = '#F7EACB'; g.fill(); g.lineWidth = 2 * k; g.strokeStyle = 'rgba(58,36,24,0.35)'; g.stroke();
    g.font = `700 ${Math.round(11 * k)}px Fredoka, "Trebuchet MS", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(122,90,60,0.5)';
    for (const [t, lo, la] of COUNTRIES) { const p = PX(lo, la); g.fillText(t.split('').join(String.fromCharCode(8202)), p.x, p.y); }
    // nombres de mares (cursiva)
    g.font = `italic 600 ${Math.round(17 * k)}px Georgia, "Times New Roman", serif`; g.fillStyle = '#3F7FA6';
    let p = PX(-78.2, 12.0); g.fillText('Mar Caribe', p.x, p.y);
    p = PX(-81.2, 3.4); g.fillText('Océano', p.x, p.y - 10 * k); g.fillText('Pacífico', p.x, p.y + 10 * k);

    // 3. silueta de Colombia: sombra de sticker, relleno verde suave, sombreado interior
    const sil = pxs(COLOMBIA_LL);
    g.save(); g.translate(0, 7 * k); g.beginPath(); polyPath(g, sil); g.fillStyle = 'rgba(58,36,24,0.32)'; g.fill(); g.restore();
    g.beginPath(); polyPath(g, sil); g.fillStyle = LAND; g.fill();
    g.save(); g.clip();
    g.lineWidth = 26 * k; g.strokeStyle = 'rgba(120,175,95,0.35)'; g.stroke(); // borde interior mas oscuro
    // manchas de color por region (en su posicion geografica)
    for (const z of this.world.zones) {
      const [lo, la] = GEO_CENTERS[z.id] || [0, 0], q = PX(lo, la), R = 1.75 * deg, gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, R), col = hex(z.color);
      gr.addColorStop(0, col + 'cc'); gr.addColorStop(0.55, col + '66'); gr.addColorStop(1, col + '00');
      g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, R, 0, Math.PI * 2); g.fill();
    }
    // cordilleras: triangulos con nieve, de norte a sur para que las del sur queden delante
    const near = (lo, la) => Object.values(GEO_CENTERS).some(([a, b]) => Math.hypot(a - lo, b - la) < 0.95);
    const peaks = [];
    for (const r of RIDGES) {
      const pp = r.pts; let acc = 0;
      for (let i = 0; i < pp.length - 1; i++) {
        const [x0, y0] = pp[i], [x1, y1] = pp[i + 1], len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / 0.42));
        for (let j = 0; j < n; j++) {
          const f = j / n, lo = x0 + (x1 - x0) * f + (rnd() - 0.5) * 0.12, la = y0 + (y1 - y0) * f + (rnd() - 0.5) * 0.12;
          if (!near(lo, la)) peaks.push({ lo, la, c: r.c, s: 0.85 + rnd() * 0.5 });
        }
        acc += len;
      }
    }
    peaks.sort((a, b) => b.la - a.la);
    for (const m of peaks) {
      const q = PX(m.lo, m.la), w = 0.30 * deg * m.s, h = 0.36 * deg * m.s;
      g.beginPath(); g.moveTo(q.x - w, q.y); g.lineTo(q.x - w * 0.05, q.y - h); g.lineTo(q.x + w, q.y); g.closePath();
      g.fillStyle = m.c; g.fill(); g.lineWidth = 1.7 * k; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.moveTo(q.x - w * 0.36, q.y - h * 0.62); g.lineTo(q.x - w * 0.05, q.y - h); g.lineTo(q.x + w * 0.3, q.y - h * 0.7); g.lineTo(q.x + w * 0.05, q.y - h * 0.78); g.lineTo(q.x - w * 0.12, q.y - h * 0.62); g.closePath();
      g.fillStyle = '#fff'; g.fill();
    }
    // rios Magdalena y Cauca
    for (const rv of RIVERS) {
      const pts = pxs(rv);
      g.beginPath(); smoothPath(g, pts, false); g.lineWidth = 5 * k; g.strokeStyle = 'rgba(58,36,24,0.55)'; g.stroke();
      g.lineWidth = 3 * k; g.strokeStyle = '#4DA3E0'; g.stroke();
    }
    g.restore();

    // 4. carreteras del juego (layout.js) llevadas a lon/lat, punteadas color tierra
    g.beginPath();
    for (const line of this.world.roads) line.forEach(([x, z], i) => { const gg = worldToGeo(x, z), q = PX(gg.lon, gg.lat); i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); });
    g.lineWidth = 6.5 * k; g.strokeStyle = 'rgba(255,244,220,0.7)'; g.stroke();
    g.setLineDash([8 * k, 7 * k]); g.lineWidth = 3.6 * k; g.strokeStyle = '#A9744B'; g.stroke(); g.setLineDash([]);

    // 5. borde grueso de la silueta
    g.beginPath(); polyPath(g, sil); g.lineWidth = 5 * k; g.strokeStyle = INK; g.stroke();

    // 6. regiones: placa con icono y nombre (Fredoka, contorno blanco)
    const fs = Math.round(17 * k);
    for (const z of this.world.zones) {
      const [lo, la] = GEO_CENTERS[z.id] || [0, 0], q = PX(lo, la), R = 0.62 * deg, col = hex(z.color);
      g.beginPath(); g.arc(q.x, q.y + 3 * k, R, 0, Math.PI * 2); g.fillStyle = 'rgba(58,36,24,0.4)'; g.fill();
      g.beginPath(); g.arc(q.x, q.y, R, 0, Math.PI * 2); g.fillStyle = CREAM; g.fill();
      g.beginPath(); g.arc(q.x, q.y, R * 0.86, 0, Math.PI * 2); g.fillStyle = col + '66'; g.fill();
      g.lineWidth = 3 * k; g.strokeStyle = INK; g.beginPath(); g.arc(q.x, q.y, R, 0, Math.PI * 2); g.stroke();
      g.save(); g.translate(q.x, q.y); g.fillStyle = col; g.strokeStyle = INK; g.lineWidth = 1.8 * k; ICONS[z.id]?.(g, R * 0.66); g.restore();
      g.font = `700 ${fs}px Fredoka, "Trebuchet MS", sans-serif`; g.textBaseline = 'middle';
      const left = LABEL_SIDE[z.id] === 'l', tx = left ? q.x - R - 6 * k : q.x, ty = left ? q.y : LABEL_SIDE[z.id] === 't' ? q.y - R - 12 * k : q.y + R + 12 * k;
      g.textAlign = left ? 'right' : 'center';
      g.lineWidth = 5 * k; g.strokeStyle = '#fff'; g.strokeText(z.name, tx, ty); g.fillStyle = INK; g.fillText(z.name, tx, ty);
    }

    // 7. titulo, rosa de los vientos y leyenda
    g.textAlign = 'left'; g.textBaseline = 'top'; g.font = `700 ${Math.round(40 * k)}px Fredoka, "Trebuchet MS", sans-serif`;
    g.lineWidth = 8 * k; g.strokeStyle = INK; g.strokeText('Colombia', 16 * k, 12 * k); g.fillStyle = '#FFC233'; g.fillText('Colombia', 16 * k, 12 * k);
    this._compass(g, S - 62 * k, S - 62 * k, 34 * k, k);
    this._legend(g, 14 * k, S - 56 * k, k);

    // 8. textura de papel (ruido suave) + viñeta de borde
    const nz = document.createElement('canvas'); nz.width = nz.height = 128;
    const ng = nz.getContext('2d'), im = ng.createImageData(128, 128);
    for (let i = 0; i < 128 * 128; i++) { im.data[i * 4] = 120; im.data[i * 4 + 1] = 80; im.data[i * 4 + 2] = 40; im.data[i * 4 + 3] = rnd() * 26; }
    ng.putImageData(im, 0, 0);
    g.fillStyle = g.createPattern(nz, 'repeat'); g.fillRect(0, 0, S, S);
    const vg = g.createRadialGradient(S / 2, S / 2, S * 0.45, S / 2, S / 2, S * 0.78);
    vg.addColorStop(0, 'rgba(150,100,50,0)'); vg.addColorStop(1, 'rgba(150,100,50,0.22)'); g.fillStyle = vg; g.fillRect(0, 0, S, S);
    this.bg = c;
  }

  _compass(g, cx, cy, r, k) {
    g.save(); g.translate(cx, cy);
    g.beginPath(); g.arc(0, 0, r * 1.05, 0, Math.PI * 2); g.fillStyle = 'rgba(255,244,220,0.85)'; g.fill(); g.lineWidth = 2.5 * k; g.strokeStyle = INK; g.stroke();
    for (const [a, long, fill] of [[0, 1, '#d6372b'], [Math.PI / 2, 0.7, CREAM], [Math.PI, 0.7, CREAM], [-Math.PI / 2, 0.7, CREAM]]) {
      g.save(); g.rotate(a); g.beginPath(); g.moveTo(0, -r * long); g.lineTo(r * 0.2, 0); g.lineTo(-r * 0.2, 0); g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 1.8 * k; g.strokeStyle = INK; g.stroke(); g.restore();
    }
    g.font = `700 ${Math.round(13 * k)}px Fredoka, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 4 * k; g.strokeStyle = CREAM; g.strokeText('N', 0, -r * 1.35); g.fillStyle = INK; g.fillText('N', 0, -r * 1.35);
    g.restore();
  }
  _legend(g, x, y, k) {
    g.save(); g.translate(x, y);
    g.beginPath(); g.roundRect(0, 0, 120 * k, 42 * k, 10 * k); g.fillStyle = 'rgba(255,244,220,0.9)'; g.fill(); g.lineWidth = 2.5 * k; g.strokeStyle = INK; g.stroke();
    this._check(g, 16 * k, 13 * k, 6.5 * k, k);
    g.beginPath(); g.arc(16 * k, 30 * k, 6 * k, 0, Math.PI * 2); g.lineWidth = 2.5 * k; g.strokeStyle = '#ff8a3d'; g.stroke();
    g.font = `700 ${Math.round(12 * k)}px Nunito, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = INK;
    g.fillText('visitada', 30 * k, 13 * k); g.fillText('suena ahora', 30 * k, 30 * k);
    g.restore();
  }
  _check(g, x, y, r, k) {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = '#4fbf6a'; g.fill(); g.lineWidth = 2 * k; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.moveTo(x - r * 0.45, y); g.lineTo(x - r * 0.1, y + r * 0.4); g.lineTo(x + r * 0.5, y - r * 0.4); g.lineWidth = 2 * k; g.strokeStyle = '#fff'; g.stroke();
  }

  // car: {x,z,heading}; activeId: id de la region que suena (o null); t: segundos
  draw(car, activeId, t = 0) {
    if (!this.open) return;
    if (!this.bg) this._bake(); // tras un resize (el lienzo se vacia) se vuelve a hornear
    const { ctx, side: S, world } = this, k = S / 700, P = (x, z) => { const g = worldToGeo(x, z); return geoToPx(g.lon, g.lat, S); };
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(this.bg, 0, 0, S, S);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // estela del recorrido
    if (this.trail.length > 1) {
      ctx.beginPath(); this.trail.forEach(([x, z], i) => { const p = P(x, z); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      ctx.setLineDash([2 * k, 7 * k]); ctx.lineWidth = 3.8 * k; ctx.strokeStyle = '#d6372b'; ctx.stroke(); ctx.setLineDash([]);
    }
    // visitadas (check) y la que suena (pulso del color)
    const deg = S / VIEW.span, R = 0.62 * deg;
    for (const z of world.zones) {
      const [lo, la] = GEO_CENTERS[z.id] || [0, 0], q = geoToPx(lo, la, S), col = hex(z.color);
      if (z.id === activeId) {
        const ph = (t * 0.9) % 1;
        ctx.beginPath(); ctx.arc(q.x, q.y, R * (1 + 1.1 * ph), 0, Math.PI * 2); ctx.lineWidth = 4.5 * k; ctx.globalAlpha = 0.85 * (1 - ph); ctx.strokeStyle = col; ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (this.visited.has(z.id)) {
        ctx.beginPath(); ctx.arc(q.x, q.y, R + 4 * k, 0, Math.PI * 2); ctx.lineWidth = 3.5 * k; ctx.strokeStyle = col + 'aa'; ctx.stroke();
        this._check(ctx, q.x + R * 0.8, q.y - R * 0.8, 7.5 * k, k);
      }
    }
    // Willys: flecha orientada segun el rumbo llevado al mapa (heading 0 = +z)
    const c = P(car.x, car.z), f = P(car.x + Math.sin(car.heading) * 20, car.z + Math.cos(car.heading) * 20);
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(Math.atan2(f.x - c.x, -(f.y - c.y)));
    ctx.beginPath(); ctx.moveTo(0, -11 * k); ctx.lineTo(7.5 * k, 8 * k); ctx.lineTo(0, 4 * k); ctx.lineTo(-7.5 * k, 8 * k); ctx.closePath();
    ctx.fillStyle = '#d6372b'; ctx.fill(); ctx.lineWidth = 2.5 * k; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
  }
}
