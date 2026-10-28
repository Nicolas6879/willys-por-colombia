import fs from 'node:fs';
import path from 'node:path';
import { open, record, prompts, config, P, OUT, scrub } from './common.mjs';
import { pcmToMono, slice, writeWav, detectKey, chroma, tempo, centroid, SR } from './analyze.mjs';
export const STY = {
  reggaeton: { n: 1, bpm: 93, drop: false, p: 'Modern Medellin-style reggaeton, slow classic dembow rhythm with the signature dembow kick and snare pattern, deep rolling 808 sub bass, melancholic modern synth pads, romantic nylon guitar melody over lush chords, elegant sensual perreo groove, clean polished contemporary production, 93 bpm' },
  guaracha: { n: 2, bpm: 139, drop: true, p: 'Colombian guaracha salchipapeo party track, punchy straight four-on-the-floor kick from the very first beat, galloping congas, short repetitive synthetic trumpet hook, cumbia accordion riff, festive Spanish party shouts, tension build then explosive drop, no whistles, no batucada, 139 bpm' },
  parrandera: { n: 3, bpm: null, drop: false, p: 'Antioquian parranda folk music, lively and mischievous village fonda party, bright accordion, tiple and acoustic guitars strumming, guacharaca scraper rhythm, upright bass, joyful rustic carrying groove, live band feel, festive dancing energy' },
  tango: { n: 4, bpm: null, drop: false, p: 'Dramatic classic tango, passionate bandoneon leading, expressive piano, walking double bass, sweeping string section violins, staccato rhythmic accents, intense romantic tension and swelling crescendo, smoky milonga hall atmosphere' },
  melodic: { n: 5, bpm: 122, drop: true, p: 'Elegant melodic afro house for a Latin club, organic percussion with congas and shakers, hypnotic rolling bass, emotive warm pads, memorable plucked synth melody with Latin flavor, tasteful build and smooth uplifting drop, polished modern production, 122 bpm' },
};
const rmsArr = (m) => { const w = SR / 2, r = []; for (let s = 0; s + w <= m.length; s += w) { let a = 0; for (let i = 0; i < w; i++) a += m[s + i] ** 2; r.push(Math.sqrt(a / w)); } return r; };
function drop(r) { let b = { t: null, ratio: 0 }; for (let i = 4; i + 4 <= r.length; i++) { const pre = r.slice(i - 4, i).reduce((a, c) => a + c, 0) / 4, post = r.slice(i, i + 4).reduce((a, c) => a + c, 0) / 4; const q = post / (pre || 1e-9); if (q > b.ratio) b = { t: i * 0.5, ratio: +q.toFixed(2) }; } return b; }
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
const SECS = 35;
for (const name of process.argv.slice(2)) {
  const s = STY[name];
  for (const seed of [7, 11, 23, 42]) {
    const errs = [], filtered = [];
    const h = await open({ onMsg: (m) => { if (m.filteredPrompt) filtered.push(JSON.stringify(m.filteredPrompt).slice(0, 300)); }, onError: (e) => errs.push(scrub(e?.message || e)) });
    try { await prompts(h.session, [P(s.p)]); } catch (e) { errs.push(scrub(e?.message || e)); }
    await config(h.session, s.bpm ? { seed, bpm: s.bpm } : { seed });
    await h.session.play(); await record(h, SECS);
    const buf = h.buf(); h.session.close();
    const file = `a7-${name}-s${seed}.wav`; writeWav(path.join(OUT, file), buf);
    const full = pcmToMono(buf), mono = pcmToMono(slice(buf, 2, SECS));
    const raw = []; for (let t = 0; t + 4 <= SECS; t += 4) raw.push(tempo(pcmToMono(slice(buf, t, t + 4))).bpm);
    const ref = s.bpm || tempo(full).bpm;
    const fold = (b) => [b, b * 2, b / 2].reduce((x, y) => Math.abs(y - ref) < Math.abs(x - ref) ? y : x);
    const wins = raw.map(x => +fold(x).toFixed(1));
    const m = med(wins), dev = wins.map(x => +(x - m).toFixed(1));
    const startDev = (Math.abs(dev[0]) + Math.abs(dev[1])) / 2, rest = dev.slice(2).reduce((a, c) => a + Math.abs(c), 0) / (dev.length - 2);
    const r = rmsArr(full), d = drop(r);
    const o = { style: name, seed, file, bpm: s.bpm, errs, filtered, secs: +h.pos().toFixed(1), wins, med: m, startDev: +startDev.toFixed(2), restDev: +rest.toFixed(2), centroid: Math.round(centroid(mono)), key: detectKey(chroma(mono).mean).key, dropT: d.t, dropRatio: d.ratio };
    console.log(JSON.stringify(o)); fs.appendFileSync(path.join(OUT, 'a7.jsonl'), JSON.stringify(o) + '\n');
    await new Promise(r => setTimeout(r, 1500));
  }
}
