import fs from 'node:fs';
import path from 'node:path';
import { open, record, sleep, prompts, config, P, OUT } from './common.mjs';
import { slice, writeWav, meanChroma, cosine, SR } from './analyze.mjs';
const X = { name: 'cali', text: 'salsa caleña, brass section trumpets and trombones, piano montuno, congas, timbales, bass tumbao, fast dance tempo, Colombian salsa' };
const Y = { name: 'caribe', text: 'vallenato, diatonic button accordion playing a lively melody, caja vallenata drum, guacharaca scraper rhythm, bass guitar, upbeat Colombian Caribbean folk' };
if (process.env.BX) X.text = process.env.BX;
const s = (a, t0, t1) => slice(a, t0, t1);
const f3 = (v) => +v.toFixed(3);
const h1 = await open();
await prompts(h1.session, [P(X.text)]);
await config(h1.session, { seed: 7 });
await h1.session.play();
await record(h1, 25);                         // primera visita: audio 0-25
const tTravel = h1.pos();
let h2 = null, s2p;
const STEPS = 20;
for (let i = 1; i <= STEPS; i++) {
  const f = i / STEPS;
  await prompts(h1.session, [P(X.text, +(1 - 0.95 * f).toFixed(3)), P(Y.text, +(0.05 + 0.95 * f).toFixed(3))]);
  const target = tTravel + 2 * i;
  while (h1.pos() < target && !h1.st.closed) await sleep(50);
  if (!h2 && h1.pos() - tTravel >= 35) {
    h2 = await open(); await prompts(h2.session, [P(X.text)]); await config(h2.session, { seed: 7 }); await h2.session.play();
    console.log('sesion2 abierta en viaje t=', f3(h1.pos() - tTravel));
  }
}
const tEnd = h1.pos();
await prompts(h1.session, [P(X.text)]);        // vuelta a X solo, sin seed nueva
await record(h1, 20);
await record(h1, 2);
const b1 = h1.buf(); h1.session.close();
await record(h2, Math.max(0, 24 - h2.pos()));
const b2 = h2.buf(); h2.session.close();
console.log('dur s1', f3(b1.length / SR / 4), 'tTravel', f3(tTravel), 'tEnd', f3(tEnd), 'dur s2', f3(b2.length / SR / 4));
const first = s(b1, 0, 25);
const travel = s(b1, 25, 65);
// crossfade 1.5 s
function xfade(a, b, secs) {
  const n = Math.floor(secs * SR), out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) {
    const o = i * 4 + c * 2, g = i / n;
    const v = a.readInt16LE(a.length - n * 4 + o) * Math.cos(g * Math.PI / 2) + b.readInt16LE(o) * Math.sin(g * Math.PI / 2);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v))), o);
  }
  return out;
}
const XF = 1.5;
const mem = Buffer.concat([first, travel.subarray(0, travel.length - XF * SR * 4), xfade(travel, b2, XF), s(b2, XF, XF + 20)]);
const sin = Buffer.concat([first, travel, s(b1, 65, 85)]);
writeWav(path.join(OUT, 'b-recall-memoria.wav'), mem);
writeWav(path.join(OUT, 'b-recall-sin-memoria.wav'), sin);
writeWav(path.join(OUT, 'b-recall-sesion1.wav'), b1);
writeWav(path.join(OUT, 'b-recall-sesion2.wav'), b2);
const tail = (b) => s(b, b.length / 4 / SR - 20, b.length / 4 / SR);
const cFirst = meanChroma(s(first, 2, 25));
const res = {
  x: X.name, y: Y.name,
  bytes_sesion2_vs_primera_visita_primeros_s: (() => { const n = Math.min(first.length, b2.length, SR * 4 * 20); let same = 0; for (let i = 0; i < n; i++) if (first[i] === b2[i]) same++; return f3(same / n); })(),
};
res.chroma_s2_0_20_vs_primera_0_20 = f3(cosine(meanChroma(s(b2, 0, 20)), meanChroma(s(first, 0, 20))));
res.chroma_memoria_20finales_vs_primera = f3(cosine(meanChroma(tail(mem)), cFirst));
res.chroma_sinmemoria_20finales_vs_primera = f3(cosine(meanChroma(tail(sin)), cFirst));
res.chroma_viaje_final_vs_primera = f3(cosine(meanChroma(s(travel, 25, 40)), cFirst));
res.chroma_viaje_inicio_vs_primera = f3(cosine(meanChroma(s(travel, 0, 12)), cFirst));
res.control_primera_mitad1_vs_mitad2 = f3(cosine(meanChroma(s(first, 0, 12)), meanChroma(s(first, 12, 24))));
res.dur_memoria = f3(mem.length / 4 / SR); res.dur_sin = f3(sin.length / 4 / SR);
console.log(JSON.stringify(res, null, 1));
fs.writeFileSync(path.join(OUT, 'b-result.json'), JSON.stringify(res, null, 1));
