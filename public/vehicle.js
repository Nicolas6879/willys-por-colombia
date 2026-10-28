// Fisica arcade del Willys (pura, sin three ni DOM). Mundo: x este, z sur, y arriba. heading 0 = mirando a +z; forward = (sin h, cos h),
// izquierda = (cos h, -sin h). Velocidad local (vf adelante, vl hacia la izquierda): el derrape es vl que se amortigua (poco con freno de mano).
// step(state, input, dt, heightAt, roadInfo) -> estado NUEVO. Paso fijo con acumulador: advance().
export const FIXED_DT = 1 / 120;

export const CAR = {
  vmaxRoad: 25, vmaxOff: 17, accel: 9, brake: 24, reverseMax: 6, coast: 1.6, drag: 0.012,
  offDrag: 6, vmaxRate: 7,            // fuera de la carretera el tope baja a 17 u/s en ~1-2 s
  // direccion y agarre (modelo de bicicleta arcade: 2 neumaticos con fuerza lateral saturable). Angulo de volante: dMax / (1 + (v / dV)^2)
  dMax: 0.47, dV: 12, steerRate: 21, steerRateHi: 12, steerBack: 1.4, steerStages: 1.75,   // el volante llega al tope en ~0.11 s a baja velocidad
  fFront: 19, fRear: 22, alphaP: 0.17, muSlideF: 0.85, muSlideR: 0.75, iz: 2.0, vreg: 4, yawMax: 2.2,
  offGrip: 0.4, offRear: 0.7,         // fuera de la carretera: fraccion del agarre (la trasera pierde mas -> mas derrape y giro mas abierto)
  // drift: la trasera se suelta con el freno de mano o con giro brusco + acelerador a alta velocidad; ayudas suaves evitan los trompos
  dDrift: 0.4, capLo: 0.5, capHi: 1.0, bHand: 0.5, bHold: 0.45, bHoldK: 0.19, bMin: 0.26, bMax: 0.68, bPower: 0.3, kBeta: 8, kBetaRec: 4.5, kYaw: 20, driftIn: 14, driftOut: 3.5,
  rgHand: 0.3, rgIntent: 0.5, rgPower: 0.5, rgDown: 14, rgUp: 4.5, autoCounter: 0.45, keepSpeed: 0.7,
  handDecel: 3,
  wheelBase: 2.8, track: 1.8, wheelR: 0.42,
  springK: 90, springC: 9, suspMax: 0.35,
  slopeAccel: 1.5, bounds: 6000, roadSurface: 7,
  // G4: pendientes. Por debajo de ~30 grados la traccion es total; entre 30 y 40 se pierde y el carro resbala cuesta abajo (no sube de ~35 grados).
  slopeLo: Math.tan(30 * Math.PI / 180), slopeHi: Math.tan(40 * Math.PI / 180), slide: 14,
  // G4: colisiones (2 circulos en planta: morro y cola), rebote suave, y limite blando de Colombia
  hitR: 1.15, hitOff: 0.85, restitution: 0.22, hitFriction: 0.9, softMargin: 22, limitInset: 5,
};

export function createState(x, z, heading, h = 0) {
  return {
    x, z, heading, y: h, speed: 0, vf: 0, vl: 0, yawRate: 0, steer: 0, vy: 0,
    gx: 0, gz: 0, slope: 0, bump: 0, susp: 0, suspV: 0, pitch: 0, roll: 0, dynPitch: 0, dynRoll: 0, wheelSpin: 0, vmaxEff: CAR.vmaxRoad, onRoad: true, slip: 0, beta: 0, skid: 0, drift: 0, delta: 0, steerIn: 0, aLat: 0, rg: 1, surf: 1,
    _gv: 0, _h: h,
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sgn = (v) => (v < 0 ? -1 : 1);
const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Limite blando del area jugable: cerca del borde el componente de velocidad hacia afuera se amortigua; pasado el borde se devuelve despacio.
function limitStep(s, limit, dt) {
  const C = CAR, L = limit(s.x, s.z), d = L.d - C.limitInset;
  if (d > C.softMargin) return;
  const sh = Math.sin(s.heading), ch = Math.cos(s.heading);
  let vx = sh * s.vf + ch * s.vl, vz = ch * s.vf - sh * s.vl;
  const vin = vx * L.nx + vz * L.nz; // < 0: se va hacia afuera
  let nvin = vin;
  if (vin < 0) nvin = vin * Math.exp(-dt * 7 * (1 - clamp(d / C.softMargin, 0, 1)));
  if (d < 0) { nvin = Math.max(nvin, 2.5 + Math.min(6, -d)); const push = Math.min(-d, 1.5); s.x += L.nx * push; s.z += L.nz * push; }
  if (nvin !== vin) {
    vx += (nvin - vin) * L.nx; vz += (nvin - vin) * L.nz;
    s.vf = vx * sh + vz * ch; s.vl = vx * ch - vz * sh;
    s.bump = Math.max(s.bump, vin < 0 ? -vin * 0.3 : 0);
  }
}
// Colisiones: dos circulos (morro y cola) contra la rejilla de colisionadores; empuja fuera y rebota suave (sin frenazos raros)
function collideStep(s, grid) {
  const C = CAR;
  for (const off of [C.hitOff, -C.hitOff]) {
    const sh = Math.sin(s.heading), ch = Math.cos(s.heading), r = grid.push(s.x + sh * off, s.z + ch * off, C.hitR);
    if (!r) continue;
    s.x += r.x - (s.x + sh * off); s.z += r.z - (s.z + ch * off);
    let vx = sh * s.vf + ch * s.vl, vz = ch * s.vf - sh * s.vl;
    const vn = vx * r.nx + vz * r.nz;
    if (vn < 0) {
      const tx = vx - vn * r.nx, tz = vz - vn * r.nz, nn = -vn * C.restitution;
      vx = tx * C.hitFriction + r.nx * nn; vz = tz * C.hitFriction + r.nz * nn;
      s.vf = vx * sh + vz * ch; s.vl = vx * ch - vz * sh;
      s.bump = Math.max(s.bump, -vn);
    }
  }
}

// env (opcional): { colliders: ColliderGrid (push), limit(x,z) -> {d, nx, nz} (d > 0 dentro del area jugable; n = normal hacia adentro) }
export function step(s0, input, dt, heightAt, roadInfo, env = null) {
  const s = { ...s0 }, C = CAR;
  const thr = clamp(input.throttle || 0, 0, 1), brk = clamp(input.brake || 0, 0, 1), hand = input.handbrake ? 1 : 0;
  // volante (+ = derecha): respuesta exponencial, mas rapida a baja velocidad y mas rapida aun al volver al centro; filtra el teclado on/off
  const steerIn = clamp(input.steer || 0, -1, 1), vabs0 = Math.abs(s.vf);
  const kSteer = (C.steerRate + (C.steerRateHi - C.steerRate) * smooth01(4, 24, vabs0)) * (Math.abs(steerIn) < Math.abs(s.steerIn) ? C.steerBack : 1);
  const kS2 = 1 - Math.exp(-kSteer * C.steerStages * dt); // dos etapas en cascada: llega igual de rapido pero amortigua el on/off rapido del teclado
  s.steerIn += (steerIn - s.steerIn) * kS2;
  s.steer += (s.steerIn - s.steer) * kS2;

  // superficie: tope de velocidad segun carretera / fuera
  const ri = roadInfo(s.x, s.z);
  s.onRoad = ri.dist <= C.roadSurface;
  const vTarget = s.onRoad ? C.vmaxRoad : C.vmaxOff;
  s.vmaxEff += clamp(vTarget - s.vmaxEff, -C.vmaxRate * dt * 0.6, C.vmaxRate * dt);

  // longitudinal
  let a = 0;
  const v = s.vf;
  // traccion segun la pendiente del terreno (de la pasada anterior): sube bien hasta ~30 grados y no pasa de ~35
  const trac = 1 - smooth01(C.slopeLo, C.slopeHi, s.slope), shd0 = Math.sin(s.heading), chd0 = Math.cos(s.heading);
  const uphill = s.slope > 1e-6 ? (shd0 * s.gx + chd0 * s.gz) / s.slope : 0; // cos del angulo entre el morro y la subida
  const tracF = uphill > 0 ? 1 - (1 - trac) * Math.min(1, uphill * 2) : 1;
  if (thr > 0 && v >= -0.1) a += thr * C.accel * tracF * clamp((s.vmaxEff - v) / 3, 0, 1);
  else if (thr > 0) a += thr * C.brake; // acelerar yendo en reversa: frena y luego arranca hacia adelante
  if (brk > 0) {
    if (v > 0.4) a -= brk * C.brake;
    else if (thr === 0) a -= brk * C.accel * 0.7 * clamp((C.reverseMax + v) / 2, 0, 1); // marcha atras
  }
  if (thr === 0 && brk === 0) a -= Math.sign(v) * Math.min(Math.abs(v) / dt, C.coast + C.drag * v * v);
  if (hand && v > 0) a -= C.handDecel;
  if (v > s.vmaxEff) a -= C.offDrag * clamp((v - s.vmaxEff) / 2, 0, 1) + 0.5;
  a -= C.slopeAccel * Math.tan(s.pitch);
  let vf = v + a * dt;
  if (Math.abs(v) < 0.05 && a === 0) vf = 0;
  if (v > 0 && vf < 0 && !(brk > 0 && thr === 0)) vf = 0; // el rozamiento no invierte la marcha
  if (v < 0 && vf > 0 && thr === 0) vf = 0;
  s.vf = vf;
  if (trac < 1 && s.slope > 0.05) { // resbala cuesta abajo
    const k = C.slide * (1 - trac) * s.slope / Math.sqrt(1 + s.slope * s.slope) * dt, dx = -s.gx / s.slope, dz = -s.gz / s.slope;
    s.vf += k * (shd0 * dx + chd0 * dz); s.vl += k * (chd0 * dx - shd0 * dz);
  }

  // giro y derrape: bicicleta (delantero y trasero) con fuerza lateral saturable. Ayudas arcade: contravolante parcial automatico,
  // agarre trasero suavizado (rg) y, dentro del derrape, un controlador suave del angulo de derrape (sin trompos, sin latigazo al salir).
  const sp0 = Math.hypot(s.vf, s.vl), vabs = Math.abs(s.vf), a_ = C.wheelBase / 2, b_ = C.wheelBase / 2;
  const phi = sp0 > 1.5 && s.vf > 0 ? Math.atan2(s.vl, s.vf) : 0, aphi = Math.abs(phi); // angulo de derrape (izquierda +): 0 = avanza recto
  s.surf += ((s.onRoad ? 1 : C.offGrip) - s.surf) * (1 - Math.exp(-8 * dt));
  const stA = Math.abs(s.steer), sdir = aphi > 0.05 ? sgn(phi) : sgn(s.steer), cs = -s.steer * sdir; // sdir: lado del derrape; cs > 0: contravolante
  const hold = smooth01(0.25, 0.6, thr) * smooth01(0.1, 0.35, stA) * smooth01(8, 14, s.vf) * smooth01(0.1, 0.2, aphi); // acelerador + volante dentro de un derrape
  const pw = smooth01(0.55, 0.9, thr) * smooth01(16, 21, s.vf) * smooth01(0.75, 0.97, stA); // giro brusco + acelerador a alta velocidad
  const handI = hand ? smooth01(4, 9, s.vf) : 0;
  // angulo de derrape deseado (rad, magnitud): freno de mano + volante, acelerador + volante (mas contravolante = menos angulo), giro brusco a alta velocidad
  const bt = Math.max(handI * C.bHand * smooth01(0.1, 0.5, stA), hold * clamp(C.bHold - C.bHoldK * cs, C.bMin, C.bMax), pw * C.bPower);
  let rgT = 1;
  if (handI > 0) rgT = C.rgHand + (1 - C.rgHand) * (1 - handI);
  rgT = Math.min(rgT, 1 - (1 - C.rgIntent) * hold, 1 - (1 - C.rgPower) * pw);
  rgT = Math.max(rgT, smooth01(C.capLo, C.capHi, aphi)); // tope: pasado ~40 grados el agarre vuelve (sin trompos faciles)
  s.rg += (rgT - s.rg) * (1 - Math.exp(-(rgT < s.rg ? C.rgDown : C.rgUp) * dt));
  const dT = Math.max(smooth01(0.02, 0.12, bt), smooth01(0.16, 0.24, aphi) * smooth01(4, 8, s.vf)); // modo derrape: se mantiene hasta que el angulo baja de ~10 grados
  s.drift += (dT - s.drift) * (1 - Math.exp(-(dT > s.drift ? C.driftIn : C.driftOut) * dt));

  // angulo del volante (izquierda +): del jugador + contravolante automatico parcial dentro del derrape
  const dMaxV = C.dMax / (1 + (vabs / C.dV) ** 2), slideK = smooth01(0.12, 0.45, aphi) * smooth01(6, 11, s.vf);
  const phiF = Math.atan2(s.vl + a_ * s.yawRate, Math.max(s.vf, C.vreg));
  const delta = clamp(-s.steer * Math.max(dMaxV, C.dDrift * slideK) + C.autoCounter * slideK * clamp(phiF, -0.9, 0.9), -0.62, 0.62);
  // fuerzas laterales (por masa): saturan y caen un poco al deslizar
  const den = Math.max(vabs, C.vreg), sat = (u, mu) => { const m = Math.abs(u); return sgn(u) * (m < 1 ? Math.sin(m * Math.PI / 2) : 1 - (1 - mu) * (1 - Math.exp(-(m - 1) * 1.5))); };
  const sd = Math.sin(delta), cd = Math.cos(delta);
  const latF = -sd * s.vf + cd * (s.vl + a_ * s.yawRate), latR = s.vl - b_ * s.yawRate;
  const fF = -C.fFront * s.surf * sat(Math.atan(latF / den) / C.alphaP, C.muSlideF) * cd;
  const fR = -C.fRear * (1 - (1 - s.surf) * C.offRear) * s.surf * s.rg * sat(Math.atan(latR / den) / C.alphaP, C.muSlideR);
  s.aLat = fF + fR; s.delta = delta;
  const spB = Math.hypot(s.vf, s.vl);
  s.vl += s.aLat * dt;
  if (s.vf > 0) { const spA = Math.hypot(s.vf, s.vl); if (spA < spB && spA > 1e-6) { const k = 1 + C.keepSpeed * (spB - spA) / spA; s.vf *= k; s.vl *= k; } } // el derrape pierde poca velocidad
  { const spC = Math.hypot(s.vf, s.vl), lim = s.vmaxEff + 0.6; if (spC > lim && s.vf > 0) { const k = 1 - (1 - lim / spC) * (1 - Math.exp(-5 * dt)); s.vf *= k; s.vl *= k; } } // el derrape no pasa del tope de velocidad
  s.yawRate += ((a_ * fF - b_ * fR) / C.iz) * dt;
  if (s.drift > 0.001) { // controlador del angulo: la tasa de giro sigue a (giro de la trayectoria - k * error de angulo), con respuesta de primer orden
    const omegaPath = (s.vf * s.aLat - s.vl * a) / Math.max(4, s.vf * s.vf + s.vl * s.vl);
    const kB = C.kBeta + (C.kBetaRec - C.kBeta) * smooth01(0, 0.1, aphi - bt); // al salir del derrape (angulo > objetivo) el controlador es mas lento: salida suave
    const wDes = clamp(omegaPath - kB * (sdir * bt - phi), -C.yawMax, C.yawMax);
    s.yawRate += (wDes - s.yawRate) * (1 - Math.exp(-C.kYaw * s.drift * dt));
  }
  s.yawRate = clamp(s.yawRate, -C.yawMax, C.yawMax);
  const dpsi = s.yawRate * dt;
  s.heading += dpsi;
  // el vector velocidad no gira con el carro: rotar al marco local nuevo
  const cD = Math.cos(dpsi), sD = Math.sin(dpsi);
  const nvf = s.vf * cD + s.vl * sD, nvl = -s.vf * sD + s.vl * cD;
  s.vf = nvf; s.vl = nvl;
  s.speed = Math.hypot(s.vf, s.vl) * (s.vf >= 0 ? 1 : -1);
  s.slip = s.vl; s.beta = phi;
  s.skid = smooth01(2.2, 5.5, Math.abs(s.vl - b_ * s.yawRate)) * smooth01(2, 5, sp0); // las traseras patinan de lado

  // integracion en el plano
  const sh = Math.sin(s.heading), ch = Math.cos(s.heading);
  s.x += (sh * s.vf + ch * s.vl) * dt;
  s.z += (ch * s.vf - sh * s.vl) * dt;
  if (!env) {
    const B = C.bounds;
    if (Math.abs(s.x) > B) { s.x = Math.sign(s.x) * B; s.vf *= 0.9; s.vl *= 0.9; }
    if (Math.abs(s.z) > B) { s.z = Math.sign(s.z) * B; s.vf *= 0.9; s.vl *= 0.9; }
  } else {
    s.bump = 0;
    if (env.limit) limitStep(s, env.limit, dt);
    if (env.colliders) collideStep(s, env.colliders);
  }

  // terreno: altura bajo el centro y los 4 puntos de las ruedas -> pitch/roll
  const sh2 = Math.sin(s.heading), ch2 = Math.cos(s.heading), hb = C.wheelBase / 2, ht = C.track / 2;
  const hc = heightAt(s.x, s.z);
  const hF = heightAt(s.x + sh2 * hb, s.z + ch2 * hb), hR = heightAt(s.x - sh2 * hb, s.z - ch2 * hb);
  const hL = heightAt(s.x + ch2 * ht, s.z - sh2 * ht), hRt = heightAt(s.x - ch2 * ht, s.z + sh2 * ht);
  const pitchT = Math.atan2(hF - hR, C.wheelBase), rollT = Math.atan2(hL - hRt, C.track);
  { // gradiente del terreno (hacia la subida) con las alturas de las ruedas
    const gf = (hF - hR) / C.wheelBase, gl = (hL - hRt) / C.track;
    s.gx = gf * sh2 + gl * ch2; s.gz = gf * ch2 - gl * sh2; s.slope = Math.hypot(s.gx, s.gz);
  }
  const kp = 1 - Math.exp(-14 * dt);
  s.pitch += (pitchT - s.pitch) * kp;
  s.roll += (rollT - s.roll) * kp;
  // inclinacion dinamica: se hunde al frenar, se levanta al acelerar, se ladea al girar
  const dynP = clamp(a * -0.006, -0.12, 0.08), dynR = clamp(s.aLat * 0.0065, -0.16, 0.16); // roll > 0 = izquierda arriba: en una curva a la derecha (aLat < 0) la carroceria se inclina hacia afuera (izquierda abajo)
  s.dynPitch += (dynP - s.dynPitch) * (1 - Math.exp(-6 * dt));
  s.dynRoll += (dynR - s.dynRoll) * (1 - Math.exp(-6 * dt));

  // suspension: resorte amortiguado excitado por la aceleracion vertical del suelo
  const gv = (hc - s._h) / dt, ga = (gv - s._gv) / dt;
  s.vy = gv;
  s._h = hc; s._gv = gv; s.y = hc;
  const excite = clamp(ga, -60, 60);
  s.suspV += (-C.springK * s.susp - C.springC * s.suspV - excite) * dt;
  s.susp = clamp(s.susp + s.suspV * dt, -C.suspMax, C.suspMax);
  if (Math.abs(s.susp) >= C.suspMax) s.suspV *= 0.5;

  s.wheelSpin += (s.vf * dt) / C.wheelR;
  return s;
}

// Paso fijo con acumulador: sim = {state, acc}; devuelve el mismo objeto con el estado avanzado
export function createSim(state) { return { state, acc: 0 }; }
export function advance(sim, input, frameDt, heightAt, roadInfo, env = null, dt = FIXED_DT) {
  sim.acc += Math.min(frameDt, 0.1);
  let n = 0;
  while (sim.acc >= dt && n < 16) { sim.state = step(sim.state, input, dt, heightAt, roadInfo, env); sim.acc -= dt; n++; }
  return sim;
}

// segundos hasta llegar a un punto (en linea recta con la velocidad actual); `radius` = distancia a la que se considera llegado
export function eta(state, point, radius = 0) {
  const d = Math.hypot(point.x - state.x, point.z - state.z) - radius;
  if (d <= 0) return 0;
  const sp = Math.hypot(state.vf ?? state.speed, state.vl || 0);
  return sp > 0.05 ? d / sp : Infinity;
}
