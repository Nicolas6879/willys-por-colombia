import fs from 'node:fs';
import path from 'node:path';
import { open, record, prompts, config, P, OUT, scrub } from './common.mjs';
import { pcmToMono, slice, writeWav, chroma, detectKey, tempo, centroid, SR } from './analyze.mjs';
const M = 'Colombian guaracha, modern 2025 polished production, melodic and harmonic, plucked ukulele-like chords, warm sub bass, crisp four-on-the-floor kick, reggaeton-influenced percussion, sung Spanish vocal hook, smooth build and drop, ';
const V = [140,148,155].map(b => ({ style: 'a4-7 moderna 2025 a '+b+' bpm', bpm: b, tag: 'a5-m7-'+b, pl: [P(M+b+' bpm')], alt: [P('Modern polished Latin house, melodic plucked chords, warm sub bass, crisp four-on-the-floor kick, reggaeton-influenced percussion, Spanish vocal hook, smooth build and drop, '+b+' bpm')] }));
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
  writeWav(path.join(OUT, `${v.tag}.wav`), buf);
  const mono = pcmToMono(slice(buf, 4, 32)), full = pcmToMono(buf), k = detectKey(chroma(mono).mean), t = tempo(mono), d = drop(full);
  const o = { n, style: v.style, used, bpmSet: v.bpm, prompts: pl.map(p => [p.text, p.weight]), errs, filtered, secs: +h.pos().toFixed(1), tempo: t.bpm, half: t.half?.bpm, dbl: t.double?.bpm, tconf: t.confidence, key: k.key, centroid: Math.round(centroid(mono)), dropT: d.t, dropRatio: d.ratio, rms: d.rms.join(' ') };
  console.log(JSON.stringify(o));
  fs.appendFileSync(path.join(OUT, 'a5m7.jsonl'), JSON.stringify(o) + '\n');
}
