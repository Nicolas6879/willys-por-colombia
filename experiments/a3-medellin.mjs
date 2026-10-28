import fs from 'node:fs';
import path from 'node:path';
import { open, record, prompts, config, P, OUT, scrub } from './common.mjs';
import { pcmToMono, slice, writeWav, chroma, detectKey, tempo, centroid, SR } from './analyze.mjs';
const V5 = 'Latin electronic dance, cumbia-inspired brass-like synth melody over tribal house drums, tambora-like toms, dembow-influenced snare accents, rolling percussion, 132 bpm';
const B = 'Latin electronic dance, cumbia-inspired brass-like synth melody over tribal house drums, tambora-like toms, snare accents, big build-up and explosive drop, 132 bpm';
const V = [
  [P(B)],
  [P(B + ', guacharaca-like scraper and shaker, accordion-like synth riff, cumbia gaita-like lead')],
  [P('Latin electronic dance, guaracha, punchy offbeat bass, chopped vocal shouts, tribal toms, aggressive synth stab riff, big build-up and explosive drop, no whistles, 132 bpm')],
  [P(V5), P('samba whistle, Brazilian funk, batucada', -0.5)],
  [P(V5), P('Colombian cumbia rhythm, tambora and guacharaca', 0.4)],
  [P('Colombian guaracha, Latin electronic dance, cumbia accordion-like synth riff over tribal house drums, tambora toms, guacharaca scraper, punchy offbeat bass, chopped shouts, big build-up and explosive drop, no whistles, 132 bpm')],
];
const alt4 = [P('Colombian ' + V5)];
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
async function take(pl, errs, filtered) {
  const h = await open({ onMsg: (m) => { if (m.filteredPrompt) filtered.push(m.filteredPrompt); }, onError: (e) => errs.push(scrub(e?.message || e)) });
  try { await prompts(h.session, pl); } catch (e) { errs.push(scrub(e?.message || e)); }
  await config(h.session, { seed: 7, bpm: 132 });
  await h.session.play();
  await record(h, 32);
  const buf = h.buf(); h.session.close(); return { h, buf };
}
for (let n = 1; n <= 6; n++) {
  let pl = V[n - 1], errs = [], filtered = [], used = 'orig';
  let r = await take(pl, errs, filtered);
  if (n === 4 && (errs.length || r.buf.length < 48000 * 4 * 10)) { used = 'alt Colombian (negativo rechazado)'; const e0 = [...errs]; errs = []; filtered = []; pl = alt4; r = await take(pl, errs, filtered); errs = e0.concat(['--retry--'], errs); }
  const { h, buf } = r;
  writeWav(path.join(OUT, `a3-medellin-${n}.wav`), buf);
  const mono = pcmToMono(slice(buf, 4, 32)), full = pcmToMono(buf), k = detectKey(chroma(mono).mean), t = tempo(mono), d = drop(full);
  const o = { n, used, prompts: pl.map(p => [p.text, p.weight]), errs, filtered, secs: +h.pos().toFixed(1), tempo: t.bpm, half: t.half?.bpm, dbl: t.double?.bpm, tconf: t.confidence, key: k.key, kconf: +k.confidence.toFixed(2), centroid: Math.round(centroid(mono)), dropT: d.t, dropRatio: d.ratio, rms: d.rms.join(' ') };
  console.log(JSON.stringify(o));
  fs.appendFileSync(path.join(OUT, 'a3.jsonl'), JSON.stringify(o) + '\n');
}
