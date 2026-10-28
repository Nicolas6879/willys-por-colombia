// Caribe solo instrumental: 5 tomas de 30 s, una sesion a la vez. Salida: out/a8-caribe-v{n}-s{seed}.wav + out/a8.jsonl
import fs from 'node:fs';
import path from 'node:path';
import { open, record, prompts, config, P, OUT, scrub, sleep } from './common.mjs';
import { pcmToMono, slice, writeWav, detectKey, chroma, centroid } from './analyze.mjs';
const CUR = 'vallenato, diatonic button accordion playing a lively melody, caja vallenata drum, guacharaca scraper rhythm, bass guitar, upbeat Colombian Caribbean folk';
const TAKES = [
  { v: 1, seed: 7, p: CUR + ', instrumental only, no vocals, no singing' },
  { v: 1, seed: 11, p: CUR + ', instrumental only, no vocals, no singing' },
  { v: 2, seed: 7, p: 'instrumental vallenato, diatonic button accordion carries the lead melody, caja vallenata drum, guacharaca scraper rhythm, electric bass, upbeat Colombian Caribbean folk, no vocals' },
  { v: 2, seed: 11, p: 'instrumental vallenato, diatonic button accordion carries the lead melody, caja vallenata drum, guacharaca scraper rhythm, electric bass, upbeat Colombian Caribbean folk, no vocals' },
  { v: 3, seed: 7, p: 'instrumental Colombian cumbia, accordion melody, tambora and alegre drums, guacharaca, bass, festive Caribbean coast groove, no vocals' },
];
const SECS = 30;
async function take(t) {
  const errs = [], filtered = [];
  const h = await open({ onMsg: (m) => { if (m.filteredPrompt) filtered.push(JSON.stringify(m.filteredPrompt).slice(0, 300)); }, onError: (e) => errs.push(scrub(e?.message || e)) });
  try { await prompts(h.session, [P(t.p)]); await config(h.session, { seed: t.seed }); await h.session.play(); await record(h, SECS); }
  catch (e) { errs.push(scrub(e?.message || e)); }
  const buf = h.buf(); try { h.session.close(); } catch {}
  return { buf, errs, filtered, secs: +h.pos().toFixed(1) };
}
for (const t of TAKES) {
  let r;
  try { r = await take(t); } catch (e) { r = { buf: Buffer.alloc(0), errs: [scrub(e?.message || e)], filtered: [], secs: 0 }; }
  if (r.secs < SECS - 2) { console.log('reintento tras 10 s:', r.errs.join(' | ')); await sleep(10000); const r2 = await take(t); r2.errs = [...r.errs.map((x) => 'try1: ' + x), ...r2.errs]; r = r2; }
  const file = `a8-caribe-v${t.v}-s${t.seed}.wav`;
  let key = null, cen = null;
  if (r.buf.length > 48000*4*5) { writeWav(path.join(OUT, file), r.buf); const mono = pcmToMono(slice(r.buf, 2, SECS)); cen = Math.round(centroid(mono)); key = detectKey(chroma(mono).mean).key; }
  const o = { file, v: t.v, prompt: t.p, seed: t.seed, errs: r.errs, filtered: r.filtered, secs: r.secs, key, centroid: cen };
  console.log(JSON.stringify(o)); fs.appendFileSync(path.join(OUT, 'a8.jsonl'), JSON.stringify(o) + '\n');
  await sleep(1500);
}
