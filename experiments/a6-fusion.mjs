import fs from 'node:fs';
import path from 'node:path';
import { open, record, prompts, config, P, OUT, scrub } from './common.mjs';
import { pcmToMono, slice, writeWav, chroma, detectKey, tempo, centroid, SR } from './analyze.mjs';
const SAL2 = 'Festive Colombian guaracha meets techno, four-on-the-floor punchy kick, playful galloping congas, bouncy offbeat bass, catchy two-note brass synth hook, party shouts and whistles, fun joyful attitude, drop, 132 bpm';
const M7 = 'Colombian guaracha, modern 2025 polished production, melodic and harmonic, plucked ukulele-like chords, warm sub bass, crisp four-on-the-floor kick, reggaeton-influenced percussion, sung Spanish vocal hook, smooth build and drop, 140 bpm';
const SAL6 = [['Colombian guaracha club track, galloping congas, trumpet-like synth hook, shouts, drop', 1.0], ['hard techno distorted kick and rumble bass', 0.9], ['absurd meme vocal chops and airhorns', 0.3]];
const STAB = 'steady four-on-the-floor kick locked to the grid from the very first beat, consistent tempo, tight quantized groove';
const mk = (a, b, c) => [P(SAL2, a), P(M7, b), ...SAL6.map(([t, w]) => P(t, +(w * c).toFixed(2)))];
const FUSED = (bpm) => 'Festive Colombian guaracha with modern polished production, plucked ukulele-like chords, warm sub bass, galloping congas, catchy brass synth hook and sung Spanish hook, party shouts, then a fast intense hard-techno break with distorted kick and rumble bass, explosive drop, ' + STAB + ', ' + bpm + ' bpm';
const T = {
  1: { d: 'los 3 originales 1.0/1.0/1.0', bpm: 140, seed: 7, pl: mk(1, 1, 1) },
  2: { d: 'pesos 0.8/1.0/0.7', bpm: 140, seed: 7, pl: mk(0.8, 1, 0.7) },
  3: { d: '2 + estabilidad 0.6', bpm: 140, seed: 7, pl: [...mk(0.8, 1, 0.7), P(STAB, 0.6)] },
  4: { d: 'prompt unico fusionado + estabilidad', bpm: 140, seed: 7, pl: [P(FUSED(140))] },
  8: { d: 'como 3 a 136 bpm', bpm: 136, seed: 7, pl: [...mk(0.8, 1, 0.7), P(STAB, 0.6)] },
};
const args = process.argv.slice(2);
if (args[0] === 'seeds') { const src = +args[1]; [[5, 11], [6, 23], [7, 42]].forEach(([n, s]) => T[n] = { ...T[src], d: T[src].d + ' seed ' + s, seed: s }); }
const ids = args[0] === 'seeds' ? [5, 6, 7] : args.map(Number);
function rmsArr(mono) { const w = SR / 2, r = []; for (let s = 0; s + w <= mono.length; s += w) { let a = 0; for (let i = 0; i < w; i++) a += mono[s + i] ** 2; r.push(Math.sqrt(a / w)); } return r; }
function drop(r) { let best = { t: null, ratio: 0 }; for (let i = 4; i + 4 <= r.length; i++) { const pre = r.slice(i - 4, i).reduce((a, b) => a + b, 0) / 4, post = r.slice(i, i + 4).reduce((a, b) => a + b, 0) / 4; const ratio = post / (pre || 1e-9); if (ratio > best.ratio) best = { t: i * 0.5, ratio: +ratio.toFixed(2) }; } return best; }
const fold = (b, t) => [b, b * 2, b / 2].reduce((x, y) => Math.abs(y - t) < Math.abs(x - t) ? y : x);
async function take(v, errs, filtered) {
  const h = await open({ onMsg: (m) => { if (m.filteredPrompt) filtered.push(JSON.stringify(m.filteredPrompt).slice(0, 300)); }, onError: (e) => errs.push(scrub(e?.message || e)) });
  try { await prompts(h.session, v.pl); } catch (e) { errs.push(scrub(e?.message || e)); }
  await config(h.session, { seed: v.seed, bpm: v.bpm });
  await h.session.play();
  await record(h, 40);
  const buf = h.buf(); h.session.close(); return { h, buf };
}
for (const n of ids) {
  const v = T[n], errs = [], filtered = [];
  const { h, buf } = await take(v, errs, filtered);
  writeWav(path.join(OUT, `a6-medellin-${n}.wav`), buf);
  const full = pcmToMono(buf), mono = pcmToMono(slice(buf, 4, 40)), k = detectKey(chroma(mono).mean), t = tempo(full);
  const wins = []; for (let s = 0; s + 4 <= 40; s += 4) { const w = tempo(pcmToMono(slice(buf, s, s + 4))); wins.push(+fold(w.bpm, v.bpm).toFixed(1)); }
  const dev = wins.map(x => +(x - v.bpm).toFixed(1));
  const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  const start = (Math.abs(dev[0]) + Math.abs(dev[1])) / 2, rest = dev.slice(2).reduce((x, y) => x + Math.abs(y), 0) / (dev.length - 2);
  const r = rmsArr(full), d = drop(r);
  const o = { n, desc: v.d, bpm: v.bpm, seed: v.seed, nprompts: v.pl.length, errs, filtered, secs: +h.pos().toFixed(1), tempo: t.bpm, tconf: t.confidence, wins, dev, sdAll: +sd(wins).toFixed(2), startDev: +start.toFixed(2), restDev: +rest.toFixed(2), first8bad: start > 3 && start > 2 * rest, centroid: Math.round(centroid(mono)), key: k.key, dropT: d.t, dropRatio: d.ratio, rms: r.map(x => +x.toFixed(3)).join(' ') };
  console.log(JSON.stringify(o));
  fs.appendFileSync(path.join(OUT, 'a6.jsonl'), JSON.stringify(o) + '\n');
}
