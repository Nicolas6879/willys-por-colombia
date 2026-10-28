import fs from 'node:fs';
import path from 'node:path';
import { open, record, prompts, config, P, OUT, scrub } from './common.mjs';
import { pcmToMono, slice, writeWav, chroma, detectKey, tempo, centroid, SR } from './analyze.mjs';
const C = 'Colombian guaracha, ';
const V = [
  { style: 'guaracha clasica de aleteo', bpm: 130,
    pl: [P(C + 'four-on-the-floor kick, two fast galloping congas and shaker, short repetitive two-note trumpet-like synth melody, offbeat bass, chopped Spanish vocal shouts, stripped breakdown then explosive drop, 130 bpm')],
    alt: [P('Latin tribal house, four-on-the-floor kick, galloping congas and shaker, repetitive two-note trumpet-like synth hook, offbeat bass, chopped Spanish shouts, breakdown then big drop, 130 bpm')] },
  { style: 'salchipapeo (termino no verificado: guaracha groovera de remate/perreo)', bpm: 128,
    pl: [P(C + 'groovy bouncy tech house feel, rolling syncopated bass, claps, shaker, perreo bounce, catchy repeated Spanish vocal hook, playful party attitude, short riser then drop, 128 bpm')],
    alt: [P('Groovy Latin tech house, bouncy rolling bass, claps, shaker, repeated Spanish vocal hook, party attitude, riser then drop, 128 bpm')] },
  { style: 'zapateo (pisada seca, galope de congas)', bpm: 130,
    pl: [P(C + 'zapateo stomping dry kick, off-beat conga gallop shuffling like quick footsteps, tight closed hi-hats, punchy bass, sharp repetitive brass synth stabs, war-cry shouts, frequent drops, 130 bpm')],
    alt: [P('Latin tribal house, stomping dry kick, shuffling conga gallop, tight hi-hats, punchy bass, sharp brass synth stabs, shouts, frequent drops, 130 bpm')] },
  { style: 'guaracha con acordeon/cumbia', bpm: 130,
    pl: [P(C + 'sampled cumbia accordion riff looped and chopped over four-on-the-floor kick, tambora drum fills, guacharaca scraper, gaita flute-like lead, offbeat bass, Caribbean Colombian party, breakdown then drop, 130 bpm')],
    alt: [P('Electronic dance with looped chopped cumbia accordion riff, four-on-the-floor kick, tambora fills, scraper percussion, flute lead, offbeat bass, breakdown then drop, 130 bpm')] },
  { style: 'guaracha oscura / bala (tribal fuerte)', bpm: 135,
    pl: [P(C + 'dark aggressive tribal, compact dry kick, distorted bass, harsh shrill digital trumpet leads in minor key, metallic industrial hits, fast tom and conga percussion, tension, delayed explosive drop, 135 bpm')],
    alt: [P('Dark aggressive tribal house, compact dry kick, distorted bass, harsh shrill brass synth in minor key, metallic hits, fast toms, tension build, delayed drop, 135 bpm')] },
  { style: 'guaracha festiva de feria/estadio', bpm: 132,
    pl: [P(C + 'festive fair and stadium energy, big brass-like synth stabs, crowd chants and claps, four-on-the-floor kick, tambora and conga rhythm, euphoric big-room build-up with snare roll, huge drop, 132 bpm')],
    alt: [P('Festive Latin big room dance, big brass-like synth stabs, crowd chants and claps, four-on-the-floor kick, conga rhythm, euphoric snare-roll build-up, huge drop, 132 bpm')] },
  { style: 'guaracha moderna 2025 (armonica, crossover)', bpm: 128,
    pl: [P(C + 'modern 2025 polished production, melodic and harmonic, plucked ukulele-like chords, warm sub bass, crisp four-on-the-floor kick, reggaeton-influenced percussion, sung Spanish vocal hook, smooth build and drop, 128 bpm')],
    alt: [P('Modern polished Latin house, melodic plucked chords, warm sub bass, crisp four-on-the-floor kick, reggaeton-influenced percussion, Spanish vocal hook, smooth build and drop, 128 bpm')] },
  { style: 'ponderado: guaracha + elemento colombiano', bpm: 130,
    pl: [P('Colombian guaracha aleteo club track, four-on-the-floor kick, galloping congas, trumpet-like synth hook, shouts, drop', 1.0), P('cumbia accordion, tambora and guacharaca', 0.6), P('Colombian vallenato brass party', 0.3)],
    alt: [P('Latin tribal house, four-on-the-floor kick, galloping congas, trumpet-like synth hook, shouts, drop', 1.0), P('cumbia accordion and tambora', 0.5)] },
];
function drop(mono) {
  const w = SR / 2, r = [];
  for (let s = 0; s + w <= mono.length; s += w) { let a = 0; for (let i = 0; i < w; i++) a += mono[s + i] ** 2; r.push(Math.sqrt(a / w)); }
  let best = { t: null, ratio: 0 };
  for (let i = 4; i + 4 <= r.length; i++) {
    const pre = r.slice(i - 4, i).reduce((a, b) => a + b, 0) / 4, post = r.slice(i, i + 4).reduce((a, b) => a + b, 0) / 4;
    const ratio = post / (pre || 1e-9); if (ratio > best.ratio) best = { t: i * 0.5, ratio: +ratio.toFixed(2) };
  }
  return { ...best, rms: r.map(v => +v.toFixed(3)) };
}
async function take(pl, bpm, errs, filtered) {
  const h = await open({ onMsg: (m) => { if (m.filteredPrompt) filtered.push(JSON.stringify(m.filteredPrompt).slice(0, 300)); }, onError: (e) => errs.push(scrub(e?.message || e)) });
  try { await prompts(h.session, pl); } catch (e) { errs.push(scrub(e?.message || e)); }
  await config(h.session, { seed: 7, bpm });
  await h.session.play();
  await record(h, 32);
  const buf = h.buf(); h.session.close(); return { h, buf };
}
for (let n = 1; n <= V.length; n++) {
  const v = V[n - 1]; let pl = v.pl, errs = [], filtered = [], used = 'orig';
  let r = await take(pl, v.bpm, errs, filtered);
  if (filtered.length || errs.length || r.buf.length < 48000 * 4 * 10) {
    used = 'alt (reintento)'; const e0 = errs.concat(filtered.map(f => 'FILTERED ' + f)); errs = []; filtered = [];
    pl = v.alt; r = await take(pl, v.bpm, errs, filtered); errs = e0.concat(['--retry--'], errs);
  }
  const { h, buf } = r;
  writeWav(path.join(OUT, `a4-medellin-${n}.wav`), buf);
  const mono = pcmToMono(slice(buf, 4, 32)), full = pcmToMono(buf), k = detectKey(chroma(mono).mean), t = tempo(mono), d = drop(full);
  const o = { n, style: v.style, used, bpmSet: v.bpm, prompts: pl.map(p => [p.text, p.weight]), errs, filtered, secs: +h.pos().toFixed(1), tempo: t.bpm, half: t.half?.bpm, dbl: t.double?.bpm, tconf: t.confidence, key: k.key, centroid: Math.round(centroid(mono)), dropT: d.t, dropRatio: d.ratio, rms: d.rms.join(' ') };
  console.log(JSON.stringify(o));
  fs.appendFileSync(path.join(OUT, 'a4.jsonl'), JSON.stringify(o) + '\n');
}
