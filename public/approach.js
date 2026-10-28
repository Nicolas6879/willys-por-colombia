// Aproximacion del carro a cada zona (pura): ETA y si "va hacia" ella. Alimenta el prewarm por tiempo de llegada de memory.js.
// En carretera cuenta SOLO el sentido de la carretera (en una curva cerrada el morro puede apuntar a una zona a la que no va);
// fuera de carretera cuenta el rumbo directo (cos >= APPROACH.cos).
export const APPROACH = { cos: 0.9, roadDist: 9, minSpeed: 0.5 };

// zones: [{id, cx, cz, radius, entries:[{edge, edgeS, centerS}]}] ; roadInfo(x,z) -> {dist, edge, s, tx, tz}
// (red de carreteras: solo cuenta la zona a la que lleva el TRAMO por el que vas, en el sentido en que lo recorres)
// -> { [id]: { toward, eta, dist } } ; eta = segundos hasta el borde de la zona (Infinity si no va hacia ella)
export function approachInfo(state, zones, roadInfo) {
  const sh = Math.sin(state.heading), ch = Math.cos(state.heading);
  const vx = sh * state.vf + ch * (state.vl || 0), vz = ch * state.vf - sh * (state.vl || 0), sp = Math.hypot(vx, vz);
  const ri = roadInfo(state.x, state.z), onR = ri.dist <= APPROACH.roadDist;
  const out = {};
  for (const z of zones) {
    const d = Math.hypot(z.cx - state.x, z.cz - state.z);
    let toward = false, eta = Infinity;
    if (d >= z.radius && sp > APPROACH.minSpeed) {
      if (onR) {
        const along = vx * ri.tx + vz * ri.tz, dir = Math.sign(along), en = z.entries.find((q) => q.edge === ri.edge);
        if (en && dir !== 0 && dir * (en.centerS - ri.s) > 0) {
          const remaining = dir > 0 ? en.edgeS - ri.s : ri.s - en.edgeS; toward = true; eta = Math.max(0, remaining) / Math.abs(along); } // d >= radius garantiza que aun no entro
      } else if ((vx * (z.cx - state.x) + vz * (z.cz - state.z)) / (sp * d) >= APPROACH.cos) { toward = true; eta = (d - z.radius) / sp; }
    }
    out[z.id] = { toward, eta, dist: d };
  }
  return out;
}
