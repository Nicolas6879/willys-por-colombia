// Pruebas de session-state.js: sid por sesion (carrera close+open en el canal 1), handover y rotacion.
import assert from 'node:assert/strict';
import { SessionState, HANDOVER_TIMEOUT_MS } from './public/session-state.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };
const types = (e) => e.map((x) => x.type);

ok('carrera: el closed/status del recall viejo llega tras abrir el nuevo y se ignora; el handover arranca', () => {
  const s = new SessionState();
  const [pw] = s.requestPrewarm('santander');
  s.onMessage({ type: 'status', ch: 1, state: 'playing', sid: pw.sid });
  s.onMessage({ type: 'first_audio', ch: 1, ms: 3800, sid: pw.sid });
  // enter llanos: el cliente cierra el viejo y abre uno nuevo
  s.closeLocal(1);
  const eff = s.requestEnter('llanos');
  assert.deepEqual(types(eff), ['open']);
  const sid2 = eff[0].sid;
  assert.notEqual(sid2, pw.sid);
  // llegan los mensajes del viejo DESPUES del open nuevo
  assert.deepEqual(s.onMessage({ type: 'closed', ch: 1, code: 1000, reason: 'client', sid: pw.sid }), []);
  s.onMessage({ type: 'status', ch: 1, state: 'closed', sid: pw.sid });
  assert.equal(s.ch[1].placeId, 'llanos');
  assert.equal(s.ch[1].state, 'connecting');
  assert.ok(s.handover);
  s.onMessage({ type: 'status', ch: 1, state: 'playing', sid: sid2 });
  const e = s.onMessage({ type: 'first_audio', ch: 1, ms: 3600, sid: sid2 });
  assert.deepEqual(types(e), ['startHandover']);
  assert.equal(s.ch[1].placeId, 'llanos');
  const p = s.onMessage({ type: 'promoted', sid: sid2 });
  assert.deepEqual(p, [{ type: 'promote', placeId: 'llanos' }]);
  assert.equal(s.ch[0].placeId, 'llanos');
  assert.equal(s.handover, null);
});

ok('first_audio de una sesion vieja no arranca el handover', () => {
  const s = new SessionState();
  const [a] = s.requestPrewarm('cali');
  s.closeLocal(1);
  const [b] = s.requestEnter('llanos');
  assert.deepEqual(s.onMessage({ type: 'first_audio', ch: 1, ms: 1, sid: a.sid }), []);
  assert.deepEqual(types(s.onMessage({ type: 'first_audio', ch: 1, ms: 1, sid: b.sid })), ['startHandover']);
});

ok('enter con recall pre-calentado del mismo lugar: reusa; con audio ya llegado arranca ya; sin audio espera', () => {
  const s = new SessionState();
  const [a] = s.requestPrewarm('cali');
  assert.deepEqual(s.requestEnter('cali'), []); // aun sin audio
  assert.deepEqual(types(s.onMessage({ type: 'first_audio', ch: 1, ms: 1, sid: a.sid })), ['startHandover']);
  const s2 = new SessionState();
  const [b] = s2.requestPrewarm('cali');
  s2.onMessage({ type: 'first_audio', ch: 1, ms: 1, sid: b.sid });
  assert.deepEqual(types(s2.requestEnter('cali')), ['startHandover']);
  assert.deepEqual(s2.onMessage({ type: 'first_audio', ch: 1, ms: 1, sid: b.sid }), []); // sin duplicar
});

ok('rotacion: solo si no hay handover ni recall; promoted deja placeId null', () => {
  const s = new SessionState();
  const [r] = s.requestRotation();
  assert.equal(r.kind, 'rotation');
  assert.equal(s.requestRotation(), null);
  s.onMessage({ type: 'first_audio', ch: 1, ms: 1, sid: r.sid });
  assert.deepEqual(s.onMessage({ type: 'promoted', sid: r.sid }), [{ type: 'promote', placeId: null }]);
});

ok('closed del recall actual antes del audio aborta el handover', () => {
  const s = new SessionState();
  const [a] = s.requestEnter('cali');
  assert.deepEqual(types(s.onMessage({ type: 'closed', ch: 1, code: 1011, sid: a.sid })), ['abortHandover']);
  assert.equal(s.handover, null);
});

ok('expireHandover: sin handover devuelve [] y no toca nada', () => {
  const s = new SessionState();
  assert.deepEqual(s.expireHandover(), []);
  assert.equal(s.handover, null);
});

ok('expireHandover: handover reciente no expira', () => {
  const s = new SessionState();
  s.requestEnter('cali');
  const since = s.handover.since;
  assert.deepEqual(s.expireHandover(since + 1000), []);
  assert.ok(s.handover);
});

ok('expireHandover: handover viejo aborta y se limpia', () => {
  const s = new SessionState();
  s.requestEnter('cali');
  const since = s.handover.since;
  assert.deepEqual(s.expireHandover(since + HANDOVER_TIMEOUT_MS + 1), [{ type: 'abortHandover' }]);
  assert.equal(s.handover, null);
});

ok('expireHandover: tras expirar, el closed tardio del recall ya no aborta', () => {
  const s = new SessionState();
  const [e] = s.requestEnter('cali');
  const since = s.handover.since;
  assert.deepEqual(s.expireHandover(since + 30001), [{ type: 'abortHandover' }]);
  assert.deepEqual(s.onMessage({ type: 'closed', ch: 1, code: 1000, reason: 'late', sid: e.sid }), []);
  assert.equal(s.handover, null);
});

ok('closed del live sin handover: reconecta con backoff; agotado, nota pegajosa con el ultimo error', () => {
  const s = new SessionState();
  s.onMessage({ type: 'error', message: 'quota exceeded' });
  const delays = [];
  for (let i = 0; i < 6; i++) {
    const [e] = s.onMessage({ type: 'closed', ch: 0, code: 429, reason: 'exhausted' });
    assert.equal(e.type, 'reopenLive');
    assert.equal(e.retry, i + 1);
    delays.push(e.delayMs);
  }
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, 8000, 8000]);
  const [last] = s.onMessage({ type: 'closed', ch: 0, code: 429, reason: 'exhausted' });
  assert.deepEqual(last, { type: 'note', text: 'la musica no se pudo recuperar (quota exceeded); toca recargar', sticky: true });
});

ok('el live sano reinicia los reintentos de reconexion', () => {
  const s = new SessionState();
  s.onMessage({ type: 'closed', ch: 0, code: 1006, reason: 'net' });
  const sid = s.beginOpen(0, 'medellin');
  s.onMessage({ type: 'status', ch: 0, state: 'playing', sid });
  const [e] = s.onMessage({ type: 'closed', ch: 0, code: 1006, reason: 'net' });
  assert.equal(e.retry, 1);
  assert.equal(e.delayMs, 1000);
});

ok('no reconecta el live si hay handover o rotacion en curso', () => {
  const s = new SessionState();
  s.requestEnter('cali');
  assert.deepEqual(s.onMessage({ type: 'closed', ch: 0, code: 1006, reason: 'net' }), []);
  const s2 = new SessionState();
  s2.requestRotation();
  assert.deepEqual(s2.onMessage({ type: 'closed', ch: 0, code: 1006, reason: 'net' }), []);
});

console.log(`\n${n} pruebas de session-state ok`);
