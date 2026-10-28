import fs from 'node:fs';
export const SR = 48000;
export function pcmToMono(buf) { // Buffer PCM16 stereo -> Float32 mono
  const n = Math.floor(buf.length / 4), o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = (buf.readInt16LE(i * 4) + buf.readInt16LE(i * 4 + 2)) / 65536;
  return o;
}
export function writeWav(file, buf) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + buf.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28);
  h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(buf.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, buf]));
}
export function slice(buf, t0, t1) { return buf.subarray(Math.max(0, Math.floor(t0 * SR)) * 4, Math.floor(t1 * SR) * 4); }
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
function mag(x, start, N, win) {
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (x[start + i] || 0) * win[i];
  fft(re, im);
  const m = new Float64Array(N / 2);
  for (let i = 0; i < N / 2; i++) m[i] = Math.hypot(re[i], im[i]);
  return m;
}
const hann = (N) => Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
// chroma: window 16384 samples (~0.34 s), hop 0.5 s. Returns mean chroma (12) and per-window frames.
export function chroma(x) {
  const N = 16384, win = hann(N), hop = SR / 2, frames = [];
  const mean = new Float64Array(12);
  for (let s = 0; s + N <= x.length; s += hop) {
    const m = mag(x, s, N, win), c = new Float64Array(12);
    for (let k = 1; k < N / 2; k++) {
      const f = k * SR / N; if (f < 55 || f > 4200) continue;
      const midi = 69 + 12 * Math.log2(f / 440);
      c[((Math.round(midi) % 12) + 12) % 12] += m[k] * m[k];
    }
    const sum = c.reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < 12; i++) { c[i] /= sum; mean[i] += c[i]; }
    frames.push(c);
  }
  const t = frames.length || 1;
  for (let i = 0; i < 12; i++) mean[i] /= t;
  return { frames, mean };
}
const KMAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KMIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function corr(a, b) {
  const ma = a.reduce((s, v) => s + v, 0) / 12, mb = b.reduce((s, v) => s + v, 0) / 12;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return n / Math.sqrt(da * db || 1);
}
export function detectKey(meanChroma) {
  const r = [];
  for (let t = 0; t < 12; t++) {
    const rot = (p) => Array.from({ length: 12 }, (_, i) => p[(i - t + 12) % 12]);
    r.push({ key: NAMES[t] + ' major', c: corr(meanChroma, rot(KMAJ)), tonic: t, mode: 'maj' });
    r.push({ key: NAMES[t] + ' minor', c: corr(meanChroma, rot(KMIN)), tonic: t, mode: 'min' });
  }
  r.sort((a, b) => b.c - a.c);
  const best = r[0], majTonic = best.mode === 'maj' ? best.tonic : (best.tonic + 3) % 12;
  return { key: best.key, confidence: best.c, second: r[1].key, secondC: r[1].c, scaleMajorTonic: NAMES[majTonic] };
}
export function scaleFit(meanChroma, tonic) {
  return [0, 2, 4, 5, 7, 9, 11].map(d => (tonic + d) % 12).reduce((s, p) => s + meanChroma[p], 0);
}
export function bestScaleFit(meanChroma) {
  let b = { t: 0, f: 0 };
  for (let t = 0; t < 12; t++) { const f = scaleFit(meanChroma, t); if (f > b.f) b = { t, f }; }
  return { majorTonic: NAMES[b.t], fit: b.f };
}
export function tempo(x) {
  const N = 2048, hop = 512, win = hann(N), flux = [];
  let prev = null;
  for (let s = 0; s + N <= x.length; s += hop) {
    const m = mag(x, s, N, win);
    if (prev) { let f = 0; for (let k = 0; k < m.length; k++) { const d = Math.log1p(m[k] * 100) - Math.log1p(prev[k] * 100); if (d > 0) f += d; } flux.push(f); } else flux.push(0);
    prev = m;
  }
  const mu = flux.reduce((a, b) => a + b, 0) / (flux.length || 1);
  const e = flux.map(v => v - mu);
  const fps = SR / hop, lagMin = Math.floor(fps * 60 / 180), lagMax = Math.ceil(fps * 60 / 60);
  const ac = [], a0 = e.reduce((s, v) => s + v * v, 0) || 1;
  for (let l = lagMin - 1; l <= lagMax + 1; l++) {
    let s = 0; for (let i = 0; i + l < e.length; i++) s += e[i] * e[i + l];
    ac[l] = s / a0 * (e.length / (e.length - l));
  }
  let best = lagMin;
  for (let l = lagMin; l <= lagMax; l++) if (ac[l] > ac[best]) best = l;
  let lag = best;
  { const y0 = ac[best - 1], y1 = ac[best], y2 = ac[best + 1]; const d = y0 - 2 * y1 + y2; if (d) lag = best + 0.5 * (y0 - y2) / d; }
  const bpm = 60 * fps / lag;
  const at = (b) => { const l = Math.round(60 * fps / b); return l >= lagMin && l <= lagMax ? +ac[l].toFixed(3) : null; };
  return {
    bpm: +bpm.toFixed(1), confidence: +ac[best].toFixed(3),
    half: bpm / 2 >= 60 ? { bpm: +(bpm / 2).toFixed(1), c: at(bpm / 2) } : null,
    double: bpm * 2 <= 180 ? { bpm: +(bpm * 2).toFixed(1), c: at(bpm * 2) } : null,
  };
}
export function centroid(x) {
  const N = 4096, win = hann(N); let sum = 0, n = 0;
  for (let s = 0; s + N <= x.length; s += N * 4) {
    const m = mag(x, s, N, win); let a = 0, b = 0;
    for (let k = 0; k < m.length; k++) { a += k * SR / N * m[k]; b += m[k]; }
    if (b > 0) { sum += a / b; n++; }
  }
  return sum / (n || 1);
}
export function cosine(a, b) {
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += a[i] * b[i]; da += a[i] ** 2; db += b[i] ** 2; }
  return n / Math.sqrt(da * db || 1);
}
export const meanChroma = (buf) => chroma(pcmToMono(buf)).mean;
export function chromaSim(bufA, bufB) { return cosine(meanChroma(bufA), meanChroma(bufB)); }
// runs with RMS (10 ms windows) below thrDb; returns [{startS, ms}]
export function silences(buf, thrDb = -50, minMs = 20) {
  const w = SR / 100, out = []; let run = 0, st = 0;
  const n = Math.floor(buf.length / 4 / w);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < w; j++) { const o = (i * w + j) * 4; const v = (buf.readInt16LE(o) + buf.readInt16LE(o + 2)) / 65536; s += v * v; }
    const db = 20 * Math.log10(Math.sqrt(s / w) + 1e-12);
    if (db < thrDb) { if (!run) st = i; run++; } else { if (run * 10 >= minMs) out.push({ startS: st / 100, ms: run * 10 }); run = 0; }
  }
  if (run * 10 >= minMs) out.push({ startS: st / 100, ms: run * 10 });
  return out;
}
