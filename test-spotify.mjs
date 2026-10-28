// Pruebas de spotify.js: URIs/URLs de playlist y decision de cambio por region (modo sin key).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { playlistUri, playlistUrl, nextPlaylist, initialPlaylist, playlistOf, validId } from './public/spotify.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };
const places = [{ id: 'caribe', spotify: '4nKQboO11Kz73pNOeNCqoF' }, { id: 'cali', spotify: '0rBAzF0Rb6zb2kGNQVpMsg' }, { id: 'vacio' }];

ok('uri y url de playlist', () => {
  assert.equal(playlistUri('4nKQboO11Kz73pNOeNCqoF'), 'spotify:playlist:4nKQboO11Kz73pNOeNCqoF');
  assert.equal(playlistUrl('4nKQboO11Kz73pNOeNCqoF'), 'https://open.spotify.com/playlist/4nKQboO11Kz73pNOeNCqoF');
});
ok('ids invalidos no producen enlaces (evita inyeccion en URL/atributos)', () => {
  for (const bad of [null, undefined, '', 'corto', 'a/b"><script>', 'x'.repeat(60), 42]) {
    assert.equal(validId(bad), false); assert.equal(playlistUri(bad), null); assert.equal(playlistUrl(bad), null);
  }
});
ok('playlistOf acepta arreglo o mapa', () => {
  assert.equal(playlistOf(places, 'cali'), '0rBAzF0Rb6zb2kGNQVpMsg');
  assert.equal(playlistOf({ cali: places[1] }, 'cali'), '0rBAzF0Rb6zb2kGNQVpMsg');
  assert.equal(playlistOf(places, 'vacio'), null);
  assert.equal(playlistOf(places, 'nope'), null);
});
ok('nextPlaylist: cambia al entrar a otra region', () => {
  assert.equal(nextPlaylist({ current: '4nKQboO11Kz73pNOeNCqoF', regionId: 'cali', auto: true, places }), '0rBAzF0Rb6zb2kGNQVpMsg');
  assert.equal(nextPlaylist({ current: null, regionId: 'caribe', auto: true, places }), '4nKQboO11Kz73pNOeNCqoF');
});
ok('nextPlaylist: no recarga la misma, ni con auto apagado, ni sin region/playlist', () => {
  assert.equal(nextPlaylist({ current: '0rBAzF0Rb6zb2kGNQVpMsg', regionId: 'cali', auto: true, places }), null);
  assert.equal(nextPlaylist({ current: null, regionId: 'cali', auto: false, places }), null);
  assert.equal(nextPlaylist({ current: 'x', regionId: null, auto: true, places }), null); // afuera de una region se mantiene la ultima
  assert.equal(nextPlaylist({ current: null, regionId: 'vacio', auto: true, places }), null);
  assert.equal(nextPlaylist(), null);
});
ok('initialPlaylist: la de la region mas cercana, o la primera disponible', () => {
  assert.deepEqual(initialPlaylist({ nearestId: 'cali', places }), { regionId: 'cali', id: '0rBAzF0Rb6zb2kGNQVpMsg' });
  assert.deepEqual(initialPlaylist({ nearestId: 'vacio', places }), { regionId: 'caribe', id: '4nKQboO11Kz73pNOeNCqoF' });
  assert.equal(initialPlaylist({ nearestId: 'x', places: [] }), null);
});
ok('places.json real: las 6 regiones traen playlist valida', () => {
  const real = JSON.parse(fs.readFileSync(new URL('./public/places.json', import.meta.url), 'utf8')).places;
  assert.equal(real.length, 6);
  for (const p of real) assert.ok(validId(p.spotify), `${p.id} sin playlist valida`);
});
console.log(`\n${n} pruebas OK`);
