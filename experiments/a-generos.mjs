import fs from 'node:fs';
import path from 'node:path';
import { open, record, prompts, config, P, OUT } from './common.mjs';
import { pcmToMono, slice, writeWav, chroma, detectKey, tempo, centroid } from './analyze.mjs';
const R = {
  caribe: [
    'vallenato, diatonic button accordion playing a lively melody, caja vallenata drum, guacharaca scraper rhythm, bass guitar, upbeat Colombian Caribbean folk',
    'cumbia, gaita flutes melody, tambora drum, alegre drum, maracon rattle, call and response, warm bass, traditional Colombian Caribbean coast dance',
    'Colombian Caribbean folk fusion, accordion and gaita flute together, cumbia rhythm with guacharaca and tambora, joyful festive dance groove',
  ],
  pacifico: [
    'currulao, marimba de chonta wooden marimba ostinato, cununo drums, bombo drum, guasa shaker, Afro-Colombian Pacific coast, call and response chant feel',
    'Afro-Colombian Pacific rainforest folk, resonant marimba melody over deep bombo bass drum, cununos and guasa rattle, hypnotic rolling 6/8 groove',
    'Pacific coast of Colombia, marimba de chonta, hand percussion ensemble, rhythmic ritual dance, earthy and warm, wooden marimba tones',
  ],
  santander: [
    'Andean bambuco in 6/8, tiple, bandola, acoustic guitar trio, nostalgic, string ensemble, Colombian Andean folk',
    'Colombian bambuco, bandola and tiple duet with guitar accompaniment, gentle 6/8 sway, melancholic romantic mountain serenade',
    'Andean Colombian instrumental, requinto guitar, tiple strumming, soft bandola melody, rustic nostalgic bambuco rhythm in 6/8',
  ],
  llanos: [
    'joropo llanero, Colombian harp virtuoso fast arpeggios, cuatro, maracas, fast galloping 6/8 3/4 rhythm, bass guitar, plains folk',
    'Venezuelan-Colombian plains joropo, arpa llanera harp melody, cuatro strumming, maracas driving rhythm, energetic galloping, instrumental',
    'llanera music from the eastern plains, harp, cuatro and maracas, fast syncopated 6/8 gallop, festive and rustic',
  ],
  cali: [
    'salsa caleña, brass section trumpets and trombones, piano montuno, congas, timbales, bass tumbao, fast dance tempo, Colombian salsa',
    'fast Cali salsa dura, punchy horn section stabs, piano montuno, conga and bongo, cowbell, timbales fills, energetic dance floor',
    'Colombian salsa band instrumental, tight brass arrangement, montuno piano, congas, timbales, driving bass, fast and festive',
  ],
  medellin: [
    'Colombian electronic tribal house, guaracha, fast 128 bpm, chopped vocal-like synths, heavy percussion, aleteo, club',
    'guaracha aleteo, aggressive electronic dance, fast 130 bpm, tribal drums, chopped vocal chops synth, bass drops, Medellin club',
    'Latin electronic tribal house, 128 bpm, percussive congas and timbales over four-on-the-floor kick, stuttering vocal-like synth stabs, energetic',
  ],
};
const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(R);
const f1 = (v) => +v.toFixed(1);
for (const reg of only) for (let n = 0; n < 3; n++) {
  const text = R[reg][n]; const filtered = [];
  const h = await open({ onMsg: (m) => { if (m.filteredPrompt) filtered.push(m.filteredPrompt); } });
  await prompts(h.session, [P(text)]);
  await config(h.session, { seed: 7 });
  await h.session.play();
  await record(h, 25);
  const buf = h.buf(); h.session.close();
  writeWav(path.join(OUT, `a-${reg}-${n + 1}.wav`), buf);
  const x = slice(buf, 4, 25), mono = pcmToMono(x), ch = chroma(mono), k = detectKey(ch.mean), t = tempo(mono);
  const o = { reg, n: n + 1, prompt: text, filtered, secs: f1(h.pos()), tempo: t.bpm, tempoHalf: t.half?.bpm, tempoDouble: t.double?.bpm, tconf: t.confidence, key: k.key, kconf: +k.confidence.toFixed(2), centroid: Math.round(centroid(mono)) };
  console.log(JSON.stringify(o));
  fs.appendFileSync(path.join(OUT, 'a.jsonl'), JSON.stringify(o) + '\n');
}
