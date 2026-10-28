// Loop test: temperatura 0.9/default/1.3 + EVO (secciones), 90 s por toma, medellin y caribe.
import fs from 'node:fs';
import path from 'node:path';
import { open, record, prompts, config, P, OUT, scrub, sleep } from './common.mjs';
import { pcmToMono, slice, writeWav, detectKey, chroma, cosine } from './analyze.mjs';
const places = JSON.parse(fs.readFileSync(path.join(OUT, '..', '..', 'public', 'places.json'), 'utf8'));
const get = (id) => (Array.isArray(places) ? places : places.places).find((p) => p.id === id);
const SEC = {
  medellin: ['breakdown with filtered pads and vocal-less atmosphere', 'energetic peak with extra percussion and rising synth lead'],
  caribe: ['accordion solo with fast ornamented runs', 'full band chorus, caja and guacharaca more intense'],
};
const SECS = 90;
const ONLY = process.argv[2] ? process.argv[2].split(',') : null; // opcional: "medellin-T09,..."

function repMetrics(buf) {
  const mono = pcmToMono(slice(buf, 6, SECS));
  const fr = chroma(mono).frames; // 0.5 s por frame
  const W = 8, H = 4, wins = [];
  for (let i = 0; i + W <= fr.length; i += H) {
    const m = new Float64Array(12);
    for (let j = i; j < i + W; j++) for (let k = 0; k < 12; k++) m[k] += fr[j][k] / W;
    wins.push(m);
  }
  const sims = [];
  for (let a = 0; a < wins.length; a++) for (let b = a + 1; b < wins.length; b++)
    if ((b - a) * 2 >= 4 + 8) sims.push(cosine(wins[a], wins[b])); // sin solape y hueco >= 8 s
  sims.sort((x, y) => y - x);
  const n = Math.max(1, Math.ceil(sims.length * 0.1));
  const rep = sims.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let cs = 0; for (let i = 0; i + 1 < wins.length; i++) cs += cosine(wins[i], wins[i + 1]);
  return { rep: +rep.toFixed(4), novelty: +(1 - cs / Math.max(1, wins.length - 1)).toFixed(4), nwin: wins.length };
}

async function take(pl, variant) {
  const errs = [], filtered = [];
  const h = await open({ onMsg: (m) => { if (m.filteredPrompt) filtered.push(JSON.stringify(m.filteredPrompt).slice(0, 300)); }, onError: (e) => errs.push(scrub(e?.message || e)) });
  const cfg = { seed: pl.seed };
  if (pl.bpm) cfg.bpm = pl.bpm;
  if (variant === 'T09') cfg.temperature = 0.9;
  if (variant === 'T13') cfg.temperature = 1.3;
  const base = P(pl.prompt);
  try {
    await prompts(h.session, [base]); await config(h.session, cfg); await h.session.play();
    if (variant !== 'EVO') await record(h, SECS);
    else {
      const [s1, s2] = SEC[pl.id];
      const steps = [[25, [base, P(s1, 0.35)]], [50, [base, P(s2, 0.35)]], [70, [base]]];
      for (const [t, list] of steps) {
        while (h.pos() < t && !h.st.closed) await sleep(50);
        await prompts(h.session, list);
      }
      while (h.pos() < SECS && !h.st.closed) await sleep(50);
    }
  } catch (e) { errs.push(scrub(e?.message || e)); }
  const buf = h.buf(); try { h.session.close(); } catch {}
  return { buf, errs, filtered, secs: +h.pos().toFixed(1) };
}

for (const id of ['medellin', 'caribe']) for (const variant of ['T09', 'T11', 'T13', 'EVO']) {
  if (ONLY && !ONLY.includes(`${id}-${variant}`)) continue;
  const pl = get(id);
  let r;
  try { r = await take(pl, variant); } catch (e) { r = { buf: Buffer.alloc(0), errs: [scrub(e?.message || e)], filtered: [], secs: 0 }; }
  if (r.secs < SECS - 2) { console.log('reintento tras 15 s:', r.errs.join(' | ')); await sleep(15000); const r2 = await take(pl, variant); r2.errs = [...r.errs.map((x) => 'try1: ' + x), ...r2.errs]; r = r2; }
  let m = { rep: null, novelty: null }, key = null;
  if (r.buf.length > 48000 * 4 * 20) {
    writeWav(path.join(OUT, `a9-${id}-${variant}.wav`), r.buf);
    m = repMetrics(r.buf); key = detectKey(chroma(pcmToMono(slice(r.buf, 2, SECS))).mean).key;
  }
  const o = { lugar: id, variante: variant, rep: m.rep, novelty: m.novelty, key, errs: r.errs, filtered: r.filtered, secs: r.secs };
  console.log(JSON.stringify(o)); fs.appendFileSync(path.join(OUT, 'a9.jsonl'), JSON.stringify(o) + '\n');
  await sleep(1500);
}
