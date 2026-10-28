// Ciclo de dia (puro, sin three): paletteAt(t01) interpola las 5 horas de ESTILO.md 2.2. El atardecer dorado es la hora principal y ocupa
// mas de la mitad del ciclo. Colores como [r,g,b] 0..255 (sRGB, floats); la escena los convierte. t01 = fraccion del ciclo (0..1, circular).
export const DEFAULT_PERIOD_S = 420; // 7 min por vuelta (configurable: ?day=segundos en la URL, ver game.js)
export const HOURS = ['amanecer', 'dia', 'atardecer', 'crepusculo', 'noche'];

const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const H = (zenith, horizon, sun, hemiSky, hemiGround, shadow, cloudTop, cloudBase, rest) => ({
  zenith: rgb(zenith), horizon: rgb(horizon), sun: rgb(sun), hemiSky: rgb(hemiSky), hemiGround: rgb(hemiGround), shadow: rgb(shadow),
  cloudTop: rgb(cloudTop), cloudBase: rgb(cloudBase), ...rest,
});
// sunElev/sunAz en grados (az desde el norte (-z) hacia el este (+x); 'noche' es la luna). sunI/hemiI: intensidades nominales de las luces.
// exposure: brillo del tinte iluminado del material cel; tint: cuanto del color del sol/luna se mezcla en la luz. night: 0..1 (farolas/ventanas encendidas, estrellas).
export const TABLE = {
  amanecer:   H(0x6fa8dc, 0xffc1a1, 0xffb38a, 0xbfd7f2, 0x8e6c8a, 0x8a6fa8, 0xffe9dc, 0xffb6a0, { sunElev: 8, sunAz: 80, sunI: 1.5, hemiI: 0.85, exposure: 0.96, tint: 0.45, night: 0.3 }),
  dia:        H(0x4fa3f0, 0xcdebff, 0xfff2d6, 0xcfe8ff, 0x8db36a, 0x6e7fb5, 0xffffff, 0xd8e8fa, { sunElev: 55, sunAz: 190, sunI: 2.0, hemiI: 1.0, exposure: 1.0, tint: 0.25, night: 0 }),
  atardecer:  H(0x5b7fd1, 0xffc873, 0xffb347, 0xffd9a0, 0x7a5c9e, 0x7a5c9e, 0xffffff, 0xffd9b8, { sunElev: 11, sunAz: 318, sunI: 1.6, hemiI: 0.9, exposure: 1.0, tint: 0.45, night: 0.12 }),
  crepusculo: H(0x3b3a82, 0xf08a8a, 0xff8a65, 0x8e8ad6, 0x4a3a6b, 0x4f3f85, 0xffd0c0, 0xc77a9a, { sunElev: 2, sunAz: 328, sunI: 0.9, hemiI: 0.7, exposure: 0.78, tint: 0.55, night: 0.7 }),
  noche:      H(0x121b3f, 0x2e3e7a, 0x8fa8ff, 0x3a4a8f, 0x1a1a3a, 0x26305e, 0x7a8ac8, 0x2e3e7a, { sunElev: 38, sunAz: 400, sunI: 0.55, hemiI: 0.55, exposure: 0.52, tint: 0.8, night: 1 }), // az 400 = 40 (la luna sale por el noreste)
};

// disposicion del ciclo: [hora, pesoQuieta, pesoTransicionHaciaLaSiguiente]. Se normaliza a 1.
const LAYOUT = [['amanecer', 0.04, 0.04], ['dia', 0.05, 0.05], ['atardecer', 0.55, 0.06], ['crepusculo', 0.02, 0.06], ['noche', 0.06, 0.07]];
const TOTAL = LAYOUT.reduce((s, [, a, b]) => s + a + b, 0);
export const SEGMENTS = (() => {
  let t = 0;
  return LAYOUT.map(([hour, hold, trans], i) => {
    const h = hold / TOTAL, tr = trans / TOTAL, seg = { hour, next: LAYOUT[(i + 1) % LAYOUT.length][0], holdStart: t, holdEnd: t + h, end: t + h + tr, hold: h, trans: tr };
    t = seg.end; return seg;
  });
})();
export const START_T = SEGMENTS[2].holdStart + SEGMENTS[2].hold * 0.25; // arranca en pleno atardecer dorado

const wrap01 = (t) => { const w = t - Math.floor(t); return w >= 1 ? 0 : w; };
const smooth = (x) => x * x * (3 - 2 * x);
const mixN = (a, b, k) => a + (b - a) * k;
const mixC = (a, b, k) => [mixN(a[0], b[0], k), mixN(a[1], b[1], k), mixN(a[2], b[2], k)];

// segmento y fraccion de transicion (0 = quieta en `hour`, hasta 1 = ya en `next`)
export function locate(t01) {
  const t = wrap01(t01);
  for (const s of SEGMENTS) if (t >= s.holdStart && t < s.end) return { seg: s, k: t < s.holdEnd ? 0 : smooth((t - s.holdEnd) / s.trans) };
  return { seg: SEGMENTS[0], k: 0 };
}

const COLOR_KEYS = ['zenith', 'horizon', 'sun', 'hemiSky', 'hemiGround', 'shadow', 'cloudTop', 'cloudBase'];
const NUM_KEYS = ['sunElev', 'sunI', 'hemiI', 'exposure', 'tint', 'night'];

export function paletteAt(t01) {
  const { seg, k } = locate(t01), A = TABLE[seg.hour], B = TABLE[seg.next], out = { hour: k < 0.5 ? seg.hour : seg.next, k, from: seg.hour, to: seg.next };
  for (const c of COLOR_KEYS) out[c] = mixC(A[c], B[c], k);
  for (const n of NUM_KEYS) out[n] = mixN(A[n], B[n], k);
  let az = A.sunAz, bz = B.sunAz; if (bz < az) bz += 360; // el azimut solo avanza
  out.sunAz = mixN(az, bz, k) % 360;
  out.mid = mixC(out.horizon, out.zenith, 0.45); // tercera parada del gradiente del cielo
  const el = out.sunElev * Math.PI / 180, ea = out.sunAz * Math.PI / 180;
  out.sunDir = [Math.sin(ea) * Math.cos(el), Math.sin(el), -Math.cos(ea) * Math.cos(el)]; // x este, y arriba, z sur (norte = -z)
  return out;
}

export const rgbToHex = (c) => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
export const hexOf = (h) => rgb(h);

// t01 a partir del tiempo transcurrido (s), el periodo y la fase inicial
export const timeAt = (elapsedS, periodS = DEFAULT_PERIOD_S, t0 = START_T) => wrap01(t0 + elapsedS / periodS);
// inicio (fase) de la siguiente hora respecto a t01: tecla T "avanza una hora"
export function nextHourStart(t01) {
  const t = wrap01(t01);
  for (const s of SEGMENTS) if (t >= s.holdStart && t < s.end) return wrap01(SEGMENTS[(SEGMENTS.indexOf(s) + 1) % SEGMENTS.length].holdStart);
  return SEGMENTS[0].holdStart;
}
export const holdStartOf = (hour) => SEGMENTS.find((s) => s.hour === hour).holdStart;
