// Contorno de Colombia (G4, puro): cadenas de [lon, lat] -> costa Caribe, frontera con Panama, costa Pacifica y fronteras terrestres con
// Ecuador, Peru, Brasil y Venezuela. 'coast' = linea de playa (se suaviza con Chaikin), 'border' = frontera terrestre (el mundo sigue mas alla,
// marcado como "fuera del mapa"). Las cadenas comparten extremos (los tripuntos). Algunos tramos de costa estan estilizados (la costa entre
// Cartagena y Barranquilla se endereza y la costa del Choco se corre ~0.1 grados al oeste) para dejar sitio a las mini-ciudades del Caribe y el Pacifico.
export const CHAINS_RAW = [
  { kind: 'coast', name: 'caribe', pts: [
    [-71.33, 11.85], [-71.40, 12.05], [-71.55, 12.28], [-71.67, 12.46], [-71.95, 12.40], [-72.18, 12.20], [-72.45, 11.80], [-72.90, 11.55],
    [-73.30, 11.28], [-73.65, 11.25], [-73.97, 11.33], [-74.20, 11.24], [-74.40, 11.05], [-74.85, 11.06], [-75.25, 11.00], [-75.50, 10.82],
    [-75.60, 10.45], [-75.68, 10.10], [-75.62, 9.75], [-75.70, 9.40], [-76.00, 9.10], [-76.43, 8.85], [-76.78, 8.43], [-76.73, 8.10],
    [-76.95, 8.00], [-77.10, 8.20], [-77.28, 8.52], [-77.35, 8.67]] },
  { kind: 'border', name: 'panama', pts: [[-77.35, 8.67], [-77.30, 8.35], [-77.20, 7.95], [-77.55, 7.70], [-77.80, 7.45], [-77.90, 7.23]] },
  { kind: 'coast', name: 'pacifico', pts: [
    [-77.90, 7.23], [-77.75, 6.90], [-77.72, 6.60], [-77.62, 6.40], [-77.50, 6.20], [-77.48, 5.95], [-77.60, 5.70], [-77.62, 5.45], [-77.58, 5.00],
    [-77.60, 4.60], [-77.52, 4.25], [-77.40, 4.00], [-77.38, 3.80], [-77.55, 3.55], [-77.68, 3.15], [-77.85, 2.65], [-78.20, 2.35],
    [-78.55, 2.05], [-78.80, 1.82], [-78.93, 1.45]] },
  { kind: 'border', name: 'ecuador', pts: [[-78.93, 1.45], [-78.60, 1.20], [-78.15, 1.05], [-77.85, 0.80], [-77.40, 0.50], [-76.90, 0.35], [-76.50, 0.25], [-75.80, 0.10], [-75.30, -0.10]] },
  { kind: 'border', name: 'peru', pts: [[-75.30, -0.10], [-74.60, -0.45], [-74.00, -0.95], [-73.30, -1.55], [-72.85, -2.15], [-72.20, -2.45], [-71.75, -2.75], [-70.80, -3.45], [-70.05, -4.20]] },
  { kind: 'border', name: 'brasil', pts: [[-70.05, -4.20], [-69.70, -2.60], [-69.40, -1.10], [-69.80, 0.30], [-69.60, 1.00], [-68.90, 1.70], [-67.90, 1.80], [-67.00, 1.20]] },
  { kind: 'border', name: 'venezuela', pts: [
    [-67.00, 1.20], [-67.20, 2.40], [-67.50, 3.70], [-67.80, 4.50], [-67.50, 5.60], [-67.55, 6.20], [-68.40, 6.20], [-69.40, 6.10], [-70.10, 6.95],
    [-70.75, 7.05], [-71.45, 7.00], [-72.00, 7.05], [-72.15, 7.40], [-72.35, 7.80], [-72.40, 8.30], [-72.60, 8.65], [-73.00, 9.15], [-72.85, 9.55],
    [-72.80, 9.90], [-72.55, 10.30], [-72.25, 10.80], [-72.00, 11.35], [-71.95, 11.65], [-71.33, 11.85]] },
];

// Chaikin con extremos fijos (conserva los tripuntos)
export function chaikin(pts, iters = 1) {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const o = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      if (i > 0) o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      if (i < p.length - 2) o.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    o.push(p[p.length - 1]);
    p = o;
  }
  return p;
}
export const CHAINS = CHAINS_RAW.map((c) => ({ ...c, pts: chaikin(c.pts, c.kind === 'coast' ? 2 : 1) }));

// poligono cerrado [lon, lat] (sin repetir el primer vertice) y, por arista i -> i+1, si es costa
export const LONLAT = [];
export const EDGE_COAST = [];
for (const c of CHAINS) {
  for (let i = 0; i < c.pts.length - 1; i++) { LONLAT.push(c.pts[i]); EDGE_COAST.push(c.kind === 'coast'); }
}
