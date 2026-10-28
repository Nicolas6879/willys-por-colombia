import fs from 'node:fs';
import path from 'node:path';
import { open, record, prompts, config, P, OUT, scrub } from './common.mjs';
import { pcmToMono, slice, writeWav, chroma, detectKey, tempo, centroid, SR } from './analyze.mjs';
const V = [
  { style: 'techno duro + guaracha (hard techno con congas)', bpm: 148,
    pl: [P('Hard techno with Latin club percussion, distorted pounding kick with rumble bass, galloping congas and shaker on top, short repetitive trumpet-like synth stab, shouted Spanish chants, relentless energy, abrupt breakdown then hard drop, 148 bpm')],
    alt: [P('Hard techno, distorted pounding kick, rumbling bass, fast congas and shaker, short repetitive synth stab, shouted chants, abrupt breakdown then hard drop, 148 bpm')] },
  { style: 'guaracha festiva (mas techno que aleteo clasico)', bpm: 132,
    pl: [P('Festive Colombian guaracha meets techno, four-on-the-floor punchy kick, playful galloping congas, bouncy offbeat bass, catchy two-note brass synth hook, party shouts and whistles, fun joyful attitude, drop, 132 bpm')],
    alt: [P('Festive Latin tribal techno, punchy four-on-the-floor kick, galloping congas, bouncy bass, catchy brass synth hook, party shouts, joyful, drop, 132 bpm')] },
  { style: 'caotico brainrot (vocal chops absurdos)', bpm: 140,
    pl: [P('Chaotic absurd meme-style club track, hard kick, high-pitched pitch-shifted vocal chops in Spanish, comedic samples, sirens, airhorns, sudden cuts and silences, glitchy stutters, cartoonish sound effects, congas, hyperactive internet humor, 140 bpm')],
    alt: [P('Chaotic silly club music, hard kick, squeaky pitched-up vocal chops, comic samples, sirens, airhorns, abrupt cuts, glitchy stutters, cartoon sound effects, hyperactive, 140 bpm')] },
  { style: 'techno + acordeon/cumbia', bpm: 136,
    pl: [P('Hard driving techno kick with looped chopped Colombian cumbia accordion riff, tambora drum fills, guacharaca scraper, galloping congas, rumbling bass, shouts, breakdown then drop, 136 bpm')],
    alt: [P('Driving techno kick with looped chopped cumbia accordion riff, tambora fills, scraper percussion, congas, rumbling bass, shouts, breakdown then drop, 136 bpm')] },
  { style: 'version rave de estadio', bpm: 145,
    pl: [P('Huge stadium rave, hard techno kick, euphoric anthemic synth lead, massive snare-roll build-up, crowd chants, festival energy with Latin percussion and shouts, explosive drop, 145 bpm')],
    alt: [P('Stadium rave hard techno, hard kick, euphoric anthemic synth lead, snare-roll build-up, crowd chants, Latin percussion, explosive drop, 145 bpm')] },
  { style: 'ponderado: guaracha base + hard techno', bpm: 140,
    pl: [P('Colombian guaracha club track, galloping congas, trumpet-like synth hook, shouts, drop', 1.0), P('hard techno distorted kick and rumble bass', 0.9), P('absurd meme vocal chops and airhorns', 0.3)],
    alt: [P('Latin tribal house, galloping congas, trumpet-like synth hook, shouts, drop', 1.0), P('hard techno distorted kick and rumble bass', 0.8)] },
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
  writeWav(path.join(OUT, `a5-salchipapeo-${n}.wav`), buf);
  const mono = pcmToMono(slice(buf, 4, 32)), full = pcmToMono(buf), k = detectKey(chroma(mono).mean), t = tempo(mono), d = drop(full);
  const o = { n, style: v.style, used, bpmSet: v.bpm, prompts: pl.map(p => [p.text, p.weight]), errs, filtered, secs: +h.pos().toFixed(1), tempo: t.bpm, half: t.half?.bpm, dbl: t.double?.bpm, tconf: t.confidence, key: k.key, centroid: Math.round(centroid(mono)), dropT: d.t, dropRatio: d.ratio, rms: d.rms.join(' ') };
  console.log(JSON.stringify(o));
  fs.appendFileSync(path.join(OUT, 'a5.jsonl'), JSON.stringify(o) + '\n');
}
