// Ronda 3: audicion para Nico con los prompts cortos por capas, bpm/scale por region y la config nueva (temperature 0.9, topK 28, guidance 4.5).
//   node a10-ronda3.mjs [modo[,modo]] [region,region]
//   modos: probe (campos de config aceptados por la API real) | gap (cambiar config a mitad de sesion no corta el audio) | repro (misma seed = mismo audio)
//          | regions (por region 3 seeds x 25 s) | reactive (40 s: velocidad media -> sube density -> parado con muteDrums -> vuelve) | all (por defecto)
// Salida: out/a10-<region>-s<seed>.wav, out/a10-reactive-<region>.wav, out/a10-gap-medellin.wav, out/a10.jsonl (resumen para RONDA3.md).
import fs from 'node:fs';
import path from 'node:path';
import { open, record, prompts, config, P, OUT, scrub, sleep } from './common.mjs';
import { pcmToMono, slice, writeWav, detectKey, chroma, centroid, tempo, SR } from './analyze.mjs';
import { placeConfig, LIVE_CONFIG } from '../public/memory.js';
import { ReactiveMusic } from '../public/reactive.js';

const places = JSON.parse(fs.readFileSync(path.join(OUT, '..', '..', 'public', 'places.json'), 'utf8')).places;
const get = (id) => places.find((p) => p.id === id);
const MODES = new Set((process.argv[2] || 'all').split(','));
const want = (m) => MODES.has('all') || MODES.has(m);
const ONLY = process.argv[3] ? process.argv[3].split(',') : places.map((p) => p.id);
const SECS = 25;
const JSONL = path.join(OUT, 'a10.jsonl');
const log = (o) => { console.log(JSON.stringify(o)); fs.appendFileSync(JSONL, JSON.stringify(o) + '\n'); };
const MAJOR_TONIC = { C_MAJOR_A_MINOR: 'C', D_FLAT_MAJOR_B_FLAT_MINOR: 'C#', D_MAJOR_B_MINOR: 'D', E_FLAT_MAJOR_C_MINOR: 'D#', E_MAJOR_D_FLAT_MINOR: 'E', F_MAJOR_D_MINOR: 'F', G_FLAT_MAJOR_E_FLAT_MINOR: 'F#', G_MAJOR_E_MINOR: 'G', A_FLAT_MAJOR_F_MINOR: 'G#', A_MAJOR_G_FLAT_MINOR: 'A', B_FLAT_MAJOR_G_MINOR: 'A#', B_MAJOR_A_FLAT_MINOR: 'B' };
const seedsOf = (p) => [...new Set([p.seed, ...(p.alt_seeds || []), 7, 11, 23, 42])].slice(0, 3);
const rms = (buf) => { let s = 0; const n = buf.length >> 1; for (let i = 0; i < n; i++) { const v = buf.readInt16LE(i * 2) / 32768; s += v * v; } return Math.sqrt(s / (n || 1)); };
const fold = (bpm, target) => { let b = bpm; while (b > target * 1.41) b /= 2; while (b < target / 1.41) b *= 2; return +b.toFixed(1); }; // octava mas cercana al bpm pedido

async function session(extra = {}) {
  const errs = [], filtered = [], closes = [];
  const h = await open({
    onMsg: (m, bytes, audio) => { if (m.filteredPrompt) filtered.push(JSON.stringify(m.filteredPrompt).slice(0, 300)); extra.onMsg?.(m, bytes, audio); },
    onError: (e) => errs.push(scrub(e?.message || e)),
    onClose: (e) => closes.push({ code: e?.code, reason: scrub(e?.reason) }),
  });
  return { h, errs, filtered, closes };
}
async function until(h, secs, cap = 90) { const t = Date.now(); while (h.pos() < secs && !h.st.closed && Date.now() - t < cap * 1000) await sleep(20); }

// ---------------------------------------------------------------- probe: campos de config
async function probe() {
  const p = get('medellin');
  const base = placeConfig(p);
  const cases = [
    ['topK', { topK: 28 }], ['guidance', { guidance: 4.5 }], ['density', { density: 0.3 }], ['brightness', { brightness: 0.4 }],
    ['muteDrums', { muteDrums: true }], ['muteBass', { muteBass: true }], ['onlyBassAndDrums', { onlyBassAndDrums: true }],
    ['musicGenerationMode:QUALITY', { musicGenerationMode: 'QUALITY' }], ['musicGenerationMode:DIVERSITY', { musicGenerationMode: 'DIVERSITY' }],
    ['scale+bpm', { scale: p.scale, bpm: p.bpm }],
  ];
  for (const [name, extra] of cases) {
    const { h, errs, closes } = await session();
    let verdict = 'ok';
    try {
      await prompts(h.session, [P(p.prompt)]);
      await config(h.session, { ...base, ...extra }); // en el open (antes de play)
      await h.session.play();
      await until(h, 4);
      const posA = h.pos();
      await config(h.session, { ...base, ...extra, density: 0.5 }); // y de nuevo a mitad de sesion
      await until(h, posA + 4);
      if (h.pos() < posA + 3) verdict = 'sin audio tras config';
    } catch (e) { verdict = 'rechazado: ' + scrub(e?.message || e); }
    if (h.st.closed) verdict = 'cierre: ' + JSON.stringify(h.st.closed);
    try { h.session.close(); } catch {}
    log({ mode: 'probe', field: name, verdict, secs: +h.pos().toFixed(1), errs, closes });
    await sleep(1200);
  }
}

// ---------------------------------------------------------------- gap: cambiar config a mitad de sesion no corta el audio
async function gap() {
  const p = get('medellin');
  const base = placeConfig(p);
  const chunks = []; // { wall, total } (total = bytes acumulados de la sesion)
  const { h, errs } = await session({ onMsg: (m, bytes, audio) => { if (audio) chunks.push({ wall: Date.now(), total: bytes }); } });
  const steps = [
    [8, 'density 0.2', { density: 0.2 }], [14, 'density 0.8', { density: 0.8 }], [20, 'muteDrums true', { muteDrums: true }],
    [26, 'muteDrums false', { muteDrums: false }], [32, 'brightness 0.2', { brightness: 0.2 }], [38, 'brightness 0.8 + density 0.5', { brightness: 0.8, density: 0.5 }],
  ];
  const dyn = {}; const marks = [];
  await prompts(h.session, [P(p.prompt)]); await config(h.session, base); await h.session.play();
  const wall0 = Date.now();
  for (const [at, name, patch] of steps) {
    await until(h, at);
    Object.assign(dyn, patch);
    marks.push({ name, posS: +h.pos().toFixed(2), wall: Date.now() });
    await config(h.session, { ...base, ...dyn }); // config COMPLETA
  }
  await until(h, 46);
  const buf = h.buf(); try { h.session.close(); } catch {}
  writeWav(path.join(OUT, 'a10-gap-medellin.wav'), buf);
  // metricas: huecos entre llegadas de chunks, reserva (audio recibido - tiempo transcurrido) y salto de muestra en las fronteras de chunk
  const arr = chunks.map((c, i) => ({ wall: c.wall, posS: c.total / (SR * 4), durS: (c.total - (i ? chunks[i - 1].total : 0)) / (SR * 4), off: c.total - (c.total - (i ? chunks[i - 1].total : 0)) })); // off = inicio del chunk (frontera con el anterior)
  const gapOf = (i) => (i ? arr[i].wall - arr[i - 1].wall : 0);
  const baseline = arr.map((_, i) => gapOf(i)).slice(1).sort((a, b) => a - b);
  const jump = (off) => { // |muestra izquierda - muestra anterior| en la frontera de chunk (canal L), salto de clic
    const i = off - (off % 4); if (i < 4 || i + 2 > buf.length) return 0;
    return Math.abs(buf.readInt16LE(i) - buf.readInt16LE(i - 4)) / 32768;
  };
  const around = (m) => {
    const idx = arr.map((c, i) => i).filter((i) => arr[i].wall >= m.wall - 100 && arr[i].wall <= m.wall + 6000);
    const lead = idx.map((i) => arr[i].posS - (arr[i].wall - wall0) / 1000);
    return { chunksIn6s: idx.length, maxGapMs: Math.max(0, ...idx.map(gapOf)), minLeadS: +Math.min(...lead).toFixed(2), maxBoundaryJump: +Math.max(0, ...idx.map((i) => jump(arr[i].off))).toFixed(4) };
  };
  const allJumps = arr.map((c) => jump(c.off)).sort((a, b) => a - b);
  const q = (a, f) => a[Math.min(a.length - 1, Math.floor(a.length * f))];
  const out = {
    mode: 'gap', totalS: +h.pos().toFixed(1), chunks: arr.length, chunkS: +(arr.reduce((s, c) => s + c.durS, 0) / (arr.length || 1)).toFixed(2),
    medianGapMs: q(baseline, 0.5), p95GapMs: q(baseline, 0.95), maxGapMsOverall: baseline.at(-1),
    jumpMedian: +(q(allJumps, 0.5) ?? 0).toFixed(4), jumpP99: +(q(allJumps, 0.99) ?? 0).toFixed(4), jumpMax: +(allJumps.at(-1) ?? 0).toFixed(4),
    changes: marks.map((m) => ({ name: m.name, posS: m.posS, ...around(m) })), errs,
  };
  log(out);
  return out;
}

// ---------------------------------------------------------------- repro: misma seed + prompt + config = audio identico (bit a bit) con la config nueva
async function repro() {
  const p = get('medellin'), cfg = placeConfig(p);
  const take = async () => {
    const { h } = await session();
    await prompts(h.session, [P(p.prompt)]); await config(h.session, cfg); await h.session.play(); await until(h, 8);
    const b = Buffer.from(h.buf()); try { h.session.close(); } catch {}
    return b;
  };
  const a = await take(); await sleep(1500); const b = await take();
  const n = Math.min(a.length, b.length, SR * 4 * 6);
  let firstDiff = -1; for (let i = 0; i < n; i++) if (a[i] !== b[i]) { firstDiff = i; break; }
  log({ mode: 'repro', region: 'medellin', seed: cfg.seed, comparedS: +(n / (SR * 4)).toFixed(2), identical: firstDiff < 0, firstDiffS: firstDiff < 0 ? null : +(firstDiff / (SR * 4)).toFixed(3) });
}

// ---------------------------------------------------------------- regions: 3 seeds x 25 s
async function takeRegion(p, seed) {
  const { h, errs, filtered } = await session();
  try { await prompts(h.session, [P(p.prompt)]); await config(h.session, { ...placeConfig(p), seed }); await h.session.play(); await record(h, SECS); }
  catch (e) { errs.push(scrub(e?.message || e)); }
  const buf = h.buf(); const fa = h.st.firstAudioMs; try { h.session.close(); } catch {}
  return { buf, errs, filtered, secs: +h.pos().toFixed(1), firstAudioMs: fa };
}
async function regions() {
  for (const id of ONLY) {
    const p = get(id);
    for (const seed of seedsOf(p)) {
      let r;
      try { r = await takeRegion(p, seed); } catch (e) { r = { buf: Buffer.alloc(0), errs: [scrub(e?.message || e)], filtered: [], secs: 0 }; }
      if (r.secs < SECS - 2) { console.log('reintento tras 15 s:', r.errs.join(' | ')); await sleep(15000); const r2 = await takeRegion(p, seed); r2.errs = [...r.errs.map((x) => 'try1: ' + x), ...r2.errs]; r = r2; }
      const file = `a10-${id}-s${seed}.wav`;
      let m = {};
      if (r.buf.length > SR * 4 * 10) {
        writeWav(path.join(OUT, file), r.buf);
        const mono = pcmToMono(slice(r.buf, 3, SECS)), k = detectKey(chroma(mono).mean), tp = tempo(mono);
        m = { tempoRaw: tp.bpm, tempoFold: fold(tp.bpm, p.bpm), tempoConf: tp.confidence, key: k.key, keyConf: +k.confidence.toFixed(2), keyMajorTonic: k.scaleMajorTonic, scaleOk: k.scaleMajorTonic === MAJOR_TONIC[p.scale], centroid: Math.round(centroid(mono)), rms: +rms(slice(r.buf, 3, SECS)).toFixed(3) };
      }
      log({ mode: 'regions', region: id, seed, current: seed === p.seed, file, prompt: p.prompt, bpm: p.bpm, scale: p.scale, firstAudioMs: r.firstAudioMs, secs: r.secs, errs: r.errs, filtered: r.filtered, ...m });
      await sleep(1500);
    }
  }
}

// ---------------------------------------------------------------- reactive: 40 s en una region, velocidad simulada por la posicion de audio
async function reactive(id = 'medellin') {
  const p = get(id), base = placeConfig(p);
  const rm = new ReactiveMusic();
  const speedAt = (s) => (s < 8 ? 12 : s < 16 ? 24 : s < 30 ? 0 : 24); // u/s: media -> maxima -> parado -> maxima
  const events = [];
  const { h, errs } = await session();
  await prompts(h.session, [P(p.prompt)]); await config(h.session, base); await h.session.play();
  const dyn = {};
  while (h.pos() < 40 && !h.st.closed) {
    const posS = h.pos(), patch = rm.update({ now: posS * 1000, speed: speedAt(posS), base: { density: p.density, brightness: p.brightness } });
    if (patch) { Object.assign(dyn, patch); events.push({ posS: +posS.toFixed(1), speed: speedAt(posS), ...patch }); await config(h.session, { ...base, ...dyn }); }
    await sleep(100);
  }
  const buf = h.buf(); try { h.session.close(); } catch {}
  writeWav(path.join(OUT, `a10-reactive-${id}.wav`), buf);
  const segs = [];
  for (let t = 0; t + 2 <= Math.min(40, h.pos()); t += 2) { const s = slice(buf, t, t + 2); segs.push({ t, rms: +rms(s).toFixed(3), centroid: Math.round(centroid(pcmToMono(s))) }); }
  log({ mode: 'reactive', region: id, file: `a10-reactive-${id}.wav`, secs: +h.pos().toFixed(1), timeline: 'speed 12 (0-8 s) -> 24 (8-16) -> 0 (16-30, mute a los 2 s) -> 24 (30-40)', events, segs, errs });
}

if (want('probe')) await probe();
if (want('gap')) await gap();
if (want('repro')) await repro();
if (want('regions')) await regions();
if (want('reactive')) await reactive(ONLY.length === 1 ? ONLY[0] : 'medellin');
console.log('listo; LIVE_CONFIG =', JSON.stringify(LIVE_CONFIG));
