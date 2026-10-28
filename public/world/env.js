// Entorno fisico del mundo para vehicle.js (puro): colisionadores registrados por los props y limite blando del area jugable (contorno de Colombia).
import { COLLIDERS } from './colliders.js';
import { countrySD, countryGrad } from './coast.js';

// d = distancia con signo al contorno real de Colombia (> 0 dentro); n = normal hacia adentro (solo se calcula cerca del borde)
export function limit(x, z) {
  const d = countrySD(x, z);
  if (d > 80) return { d, nx: 0, nz: 0 };
  const [nx, nz] = countryGrad(x, z);
  return { d, nx, nz };
}
export const ENV = { colliders: COLLIDERS, limit };
