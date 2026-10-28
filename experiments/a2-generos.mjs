import fs from 'node:fs';
import path from 'node:path';
import { open, record, prompts, config, P, OUT } from './common.mjs';
import { pcmToMono, slice, writeWav, chroma, detectKey, tempo, centroid } from './analyze.mjs';
// [prompt, bpm|null, alternativa si filtra]
const R = {
  medellin: [
    ['Latin electronic tribal house, 130 bpm, stomping four-on-the-floor kick, tribal toms and timbales, cowbell and whistle accents, bouncy plucked synth lead, short shouted crowd chants, energetic club', 130, 'Latin electronic tribal house, 130 bpm, four-on-the-floor kick, tribal toms, timbales, cowbell, bouncy plucked synth lead, energetic'],
    ['Tribal house dance music with offbeat bouncy bassline, rolling tribal toms, timbales fills, staccato plucked synth riff, short shouted chants, big build-up and hard drop, 130 bpm', 130, 'Tribal house dance music, bouncy bassline, rolling toms, timbales, staccato synth riff, build-up and drop'],
    ['Latin club electronic, stomping house kick, fast percussive hi-hats, congas, cowbell, police-whistle accents, trumpet-like synth stabs, hypnotic repetitive riff, festive', 128, 'Latin club electronic, house kick, congas, cowbell, whistle accents, brass-like synth stabs, festive'],
    ['Colombian electronic tribal house, fast 128 bpm, chopped vocal-like synths, driving tribal drums, bouncy bassline, club dance energy, cowbell and whistle, raw percussive drop', 128, 'Colombian electronic tribal house, 128 bpm, vocal-like synths, tribal drums, bouncy bassline, cowbell, whistle'],
    ['Latin electronic dance, cumbia-inspired brass-like synth melody over tribal house drums, tambora-like toms, dembow-influenced snare accents, rolling percussion, 132 bpm', 132, 'Latin electronic dance, brass-like synth melody, tribal house drums, toms, snare accents, 132 bpm'],
  ],
  pacifico: [
    ['Afro-Colombian Pacific folk, resonant wooden marimba de chonta playing a repeating ostinato, deep bombo bass drum on a rolling 6/8 groove, male and female cununo drums, guasa bamboo shaker, call and response chorus chant, earthy rainforest feel', null, 'Afro-Colombian Pacific folk, wooden marimba ostinato, deep bombo drum, cununo drums, guasa shaker, rolling 6/8 groove'],
    ['Traditional currulao ensemble, marimba with a low bass register and a high melodic register, two large bombo drums struck on the side, conical cununo hand drums, guasa tube shaker, group chanting in call and response, 6/8 swing, raw acoustic live recording', null, 'Traditional currulao ensemble, marimba bass and melody registers, bombo drums, cununo hand drums, guasa shaker, 6/8 swing'],
    ['Pacific coast chirimia band, clarinets and euphonium playing a lively melody, snare drum, bass drum and cymbals, jovial festive street parade dance, fast and joyful, acoustic', null, 'Pacific coast brass and woodwind street band, clarinets, euphonium, snare drum, bass drum, cymbals, festive'],
    ['Modern Afro-Colombian Pacific fusion, hip hop drum groove with a sampled wooden marimba loop, cununo percussion, funky bass guitar, reggae offbeat guitar skank, urban and rhythmic instrumental', 92, 'Afro-Colombian Pacific fusion, hip hop drums, wooden marimba loop, cununo percussion, funky bass, reggae guitar'],
    ['Afro-Colombian Pacific dancehall-tinged groove, marimba melody, bombo and cununo drums, ragga bassline, clarinet riff from a chirimia band, upbeat and danceable', 96, 'Afro-Colombian Pacific groove, marimba melody, bombo and cununo drums, reggae bassline, clarinet riff, upbeat'],
  ],
  santander: [
    ['Andean bambuco, bright twelve-string metal tiple strumming, plucked bandola melody with tremolo, acoustic guitar bass and chords, requinto fills, 6/8 against 3/4 sway, nostalgic intimate acoustic trio, clear and bright', null, 'Andean bambuco, bright metal-string tiple strumming, plucked bandola melody with tremolo, acoustic guitar, 6/8 sway, nostalgic'],
    ['Andean guabina, lyrical and melancholic, tiple and requinto duet, plucked bandola with tremolo, guitar accompaniment, slow lamenting mood, rustic rural acoustic recording', null, 'Andean guabina, lyrical melancholic, tiple and requinto, bandola tremolo, guitar, slow rustic acoustic'],
    ['Fast torbellino dance, requinto lead playing quick lively runs, bright tiple strumming, guitar, carraca scraper and tambourine, spinning dance rhythm, rustic festive mountain folk', null, 'Fast Andean folk dance, requinto lead with quick runs, bright tiple strumming, guitar, scraper, tambourine, festive'],
    ['Colombian Andean string trio, bandola tremolo melody in parallel thirds over bright tiple rasgueo and guitar, bambuco rhythm alternating 6/8 and 3/4 accents, warm wooden acoustic sound', 110, 'Colombian Andean string trio, bandola melody over bright tiple strumming and guitar, bambuco rhythm in 6/8 and 3/4'],
    ['Slow romantic Andean serenade, solo requinto and tiple, free expressive tempo, warm wooden acoustic recording, tender and nostalgic, mountain village evening', null, 'Slow romantic Andean serenade, requinto and tiple, tender nostalgic acoustic'],
  ],
};
const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(R);
const f1 = (v) => +v.toFixed(1);
async function take(text, bpm, filtered) {
  const h = await open({ onMsg: (m) => { if (m.filteredPrompt) filtered.push(m.filteredPrompt); } });
  await prompts(h.session, [P(text)]);
  await config(h.session, bpm ? { seed: 7, bpm } : { seed: 7 });
  await h.session.play();
  await record(h, 25);
  const buf = h.buf(); h.session.close();
  return { h, buf };
}
for (const reg of only) for (let n = 0; n < 5; n++) {
  let [text, bpm, alt] = R[reg][n]; const filtered = [];
  let r = await take(text, bpm, filtered), retried = false;
  if (filtered.length || r.buf.length < 48000 * 4 * 10) { retried = true; text = alt; r = await take(text, bpm, filtered); }
  const { h, buf } = r;
  writeWav(path.join(OUT, `a2-${reg}-${n + 1}.wav`), buf);
  const x = slice(buf, 4, 25), mono = pcmToMono(x), ch = chroma(mono), k = detectKey(ch.mean), t = tempo(mono);
  const o = { reg, n: n + 1, prompt: text, bpmCfg: bpm, filtered, retried, secs: f1(h.pos()), tempo: t.bpm, tempoHalf: t.half?.bpm, tempoDouble: t.double?.bpm, tconf: t.confidence, key: k.key, kconf: +k.confidence.toFixed(2), centroid: Math.round(centroid(mono)) };
  console.log(JSON.stringify(o));
  fs.appendFileSync(path.join(OUT, 'a2.jsonl'), JSON.stringify(o) + '\n');
  if (retried) fs.appendFileSync(path.join(OUT, 'a2.jsonl'), JSON.stringify({ note: 'original filtrado/vacio', reg, n: n + 1, original: R[reg][n][0] }) + '\n');
}
