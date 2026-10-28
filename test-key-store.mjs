// Pruebas de key-store.js: guardado/lectura de la key con storages falsos (no toca storages reales).
import assert from 'node:assert/strict';
import { loadKey, saveKey, clearKey } from './public/key-store.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };

// storage falso con Map
const mkStore = () => {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
};
const mk = () => ({ ss: mkStore(), ls: mkStore() });

ok('sin nada guardado devuelve vacio', () => {
  assert.deepEqual(loadKey(mk()), { key: '', remember: false });
});

ok('sin storages (o rotos) no revienta: trata los nulos y devuelve vacio', () => {
  assert.deepEqual(loadKey({ ss: null, ls: null }), { key: '', remember: false });
  assert.deepEqual(loadKey({ ss: {}, ls: 'x' }), { key: '', remember: false });
});

ok('guardar sin recordar usa la sesion', () => {
  const st = mk();
  saveKey('abc', false, st);
  assert.equal(st.ss.getItem('lyria.key'), 'abc');
  assert.equal(st.ls.getItem('lyria.key'), null);
  assert.deepEqual(loadKey(st), { key: 'abc', remember: false });
});

ok('guardar con recordar usa localStorage y deja la sesion limpia', () => {
  const st = mk();
  saveKey('abc', false, st); // primero en la sesion
  saveKey('abc', true, st);  // luego con recordar
  assert.equal(st.ls.getItem('lyria.key'), 'abc');
  assert.equal(st.ls.getItem('lyria.remember'), '1');
  assert.equal(st.ss.getItem('lyria.key'), null);
  assert.equal(st.ss.getItem('lyria.remember'), null);
  assert.deepEqual(loadKey(st), { key: 'abc', remember: true });
});

ok('loadKey prioriza localStorage sobre sessionStorage', () => {
  const st = mk();
  st.ss.setItem('lyria.key', 'de-sesion');
  st.ls.setItem('lyria.key', 'del-equipo');
  st.ls.setItem('lyria.remember', '1');
  assert.deepEqual(loadKey(st), { key: 'del-equipo', remember: true });
});

ok('clearKey borra key y bandera en ambos storages', () => {
  const st = mk();
  st.ss.setItem('lyria.key', 'a'); st.ss.setItem('lyria.remember', '1'); // restos en la sesion
  saveKey('abc', true, st);
  clearKey(st);
  assert.equal(st.ls.getItem('lyria.key'), null);
  assert.equal(st.ls.getItem('lyria.remember'), null);
  assert.equal(st.ss.getItem('lyria.key'), null);
  assert.equal(st.ss.getItem('lyria.remember'), null);
  assert.deepEqual(loadKey(st), { key: '', remember: false });
});

ok('la key se recorta al guardar', () => {
  const st = mk();
  saveKey('  a b  ', false, st);
  assert.equal(st.ss.getItem('lyria.key'), 'a b');
  assert.deepEqual(loadKey(st), { key: 'a b', remember: false });
});

ok('guardar key vacia limpia todo', () => {
  const st = mk();
  saveKey('abc', true, st);
  saveKey('   ', true, st);
  assert.equal(st.ls.getItem('lyria.key'), null);
  assert.equal(st.ss.getItem('lyria.key'), null);
  assert.deepEqual(loadKey(st), { key: '', remember: false });
});

console.log(`\n${n} pruebas OK`);
