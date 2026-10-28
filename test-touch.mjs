// Pruebas de touch.js: helpers puros (activacion, direccion por arrastre y mezcla teclado+tactil). La UI se arma en el navegador.
import assert from 'node:assert/strict';
import {
  steerFromDx, touchEnabled, mergeInputs, TouchControls, joystickToInput, axisWithDead, clampStick, steerFromButtons, clampCenter,
  loadTouchMode, saveTouchMode, resolveTouchMode, nextTouchMode, TOUCH_MODES, DEFAULT_TOUCH_MODE, TOUCH_MODE_KEY,
} from './public/touch.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };

ok('direccion: dx -> steer proporcional con tope en +-1', () => {
  assert.equal(steerFromDx(0, 50), 0);
  assert.equal(steerFromDx(25, 50), 0.5);
  assert.equal(steerFromDx(50, 50), 1);
  assert.equal(steerFromDx(120, 50), 1);
  assert.equal(steerFromDx(-25, 50), -0.5);
  assert.equal(steerFromDx(-80, 50), -1);
});

ok('activacion: puntero grueso o tactil sin hover', () => {
  assert.equal(touchEnabled({ coarse: true }), true);
  assert.equal(touchEnabled({ coarse: false, hoverNone: true, maxTouchPoints: 5 }), true);
  assert.equal(touchEnabled({ coarse: false, hoverNone: false, maxTouchPoints: 10 }), false); // portatil con pantalla tactil pero mouse
  assert.equal(touchEnabled({ coarse: false, hoverNone: true, maxTouchPoints: 0 }), false);
});

ok('activacion: ?touch=1 y ?touch=0 fuerzan', () => {
  assert.equal(touchEnabled({ search: '?touch=1', coarse: false }), true);
  assert.equal(touchEnabled({ search: '?touch=0', coarse: true, hoverNone: true, maxTouchPoints: 9 }), false);
});

ok('mezcla: pisa pedales, suma direccion y OR del freno de mano', () => {
  const kb = { throttle: 1, brake: 0, steer: -1, handbrake: false };
  const t = { throttle: 0, brake: 1, steer: 0.5, handbrake: true };
  assert.deepEqual(mergeInputs(kb, t), { throttle: 1, brake: 1, steer: -0.5, handbrake: true });
});

ok('mezcla: direccion con tope, tactil nulo y pedal tactil solo', () => {
  assert.deepEqual(mergeInputs({ throttle: 0, brake: 0, steer: 1, handbrake: false }, { steer: 1 }), { throttle: 0, brake: 0, steer: 1, handbrake: false });
  assert.deepEqual(mergeInputs({ throttle: 1, brake: 1, steer: 0, handbrake: true }, null), { throttle: 1, brake: 1, steer: 0, handbrake: true });
  assert.deepEqual(mergeInputs({ throttle: 0, brake: 0, steer: 0, handbrake: false }, { throttle: 1 }), { throttle: 1, brake: 0, steer: 0, handbrake: false });
});

const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} != ${b}`);
const memStore = (init = {}) => ({ d: { ...init }, getItem(k) { return k in this.d ? this.d[k] : null; }, setItem(k, v) { this.d[k] = String(v); } });

ok('joystick: zona muerta ~12% no mueve nada', () => {
  assert.deepEqual(joystickToInput(0, 0, 50), { throttle: 0, brake: 0, steer: 0 });
  assert.deepEqual(joystickToInput(5, -5, 50), { throttle: 0, brake: 0, steer: 0 }); // 10% < 12%
  assert.equal(axisWithDead(0.12), 0);
  assert.ok(axisWithDead(0.13) > 0 && axisWithDead(0.13) < 0.05, 'arranque suave tras la zona muerta');
});

ok('joystick: arriba = gas proporcional, abajo = freno proporcional', () => {
  const up = joystickToInput(0, -50, 50);
  assert.deepEqual(up, { throttle: 1, brake: 0, steer: 0 });
  const half = joystickToInput(0, -25, 50);
  assert.equal(half.brake, 0); assert.ok(half.throttle > 0.4 && half.throttle < 0.5);
  const down = joystickToInput(0, 50, 50);
  assert.deepEqual(down, { throttle: 0, brake: 1, steer: 0 });
  const dh = joystickToInput(0, 25, 50);
  assert.equal(dh.throttle, 0); near(dh.brake, half.throttle, 'simetrico');
});

ok('joystick: horizontal = direccion proporcional con signo y tope', () => {
  assert.equal(joystickToInput(50, 0, 50).steer, 1);
  assert.equal(joystickToInput(-50, 0, 50).steer, -1);
  assert.equal(joystickToInput(500, 0, 50).steer, 1);
  const s = joystickToInput(25, 0, 50).steer; assert.ok(s > 0.4 && s < 0.5);
  assert.deepEqual(joystickToInput(-50, -50, 50), { throttle: 1, brake: 0, steer: -1 }); // diagonal: gas y giro a la vez
  assert.equal(joystickToInput(0, -9999).throttle, 1);
});

ok('joystick: perilla acotada al circulo y centro dentro de pantalla', () => {
  assert.deepEqual(clampStick(30, 40, 100), { x: 30, y: 40 });
  const c = clampStick(300, 400, 50); near(c.x, 30, 'x'); near(c.y, 40, 'y');
  assert.deepEqual(clampStick(0, 0, 50), { x: 0, y: 0 });
  assert.equal(clampCenter(5, 800, 66), 66);
  assert.equal(clampCenter(790, 800, 66), 734);
  assert.equal(clampCenter(300, 800, 66), 300);
});

ok('flechas: multitouch de izquierda/derecha', () => {
  assert.equal(steerFromButtons(true, false), -1);
  assert.equal(steerFromButtons(false, true), 1);
  assert.equal(steerFromButtons(true, true), 0);
  assert.equal(steerFromButtons(false, false), 0);
});

ok('modo: guardar/cargar con storage inyectable, default joystick', () => {
  assert.deepEqual(TOUCH_MODES, ['joystick', 'flechas']);
  assert.equal(DEFAULT_TOUCH_MODE, 'joystick');
  const st = memStore();
  assert.equal(loadTouchMode(st), 'joystick');
  assert.equal(saveTouchMode('flechas', st), true);
  assert.equal(st.d[TOUCH_MODE_KEY], 'flechas');
  assert.equal(loadTouchMode(st), 'flechas');
  assert.equal(saveTouchMode('turbo', st), false); // modo invalido no se guarda
  assert.equal(loadTouchMode(memStore({ [TOUCH_MODE_KEY]: 'basura' })), 'joystick');
  assert.equal(nextTouchMode('joystick'), 'flechas');
  assert.equal(nextTouchMode('flechas'), 'joystick');
});

ok('modo: storage que falla (privado/bloqueado) -> default y sin lanzar', () => {
  const boom = { getItem() { throw new Error('denegado'); }, setItem() { throw new Error('cuota'); } };
  assert.equal(loadTouchMode(boom), 'joystick');
  assert.equal(saveTouchMode('flechas', boom), false);
  assert.equal(loadTouchMode(null), 'joystick');
  assert.equal(saveTouchMode('flechas', null), false);
});

ok('modo: ?touchmode fuerza sobre lo guardado; invalido o ausente cae al guardado/default', () => {
  const st = memStore({ [TOUCH_MODE_KEY]: 'flechas' });
  assert.equal(resolveTouchMode({ search: '?touchmode=joystick', storage: st }), 'joystick');
  assert.equal(resolveTouchMode({ search: '?touch=1&touchmode=flechas', storage: memStore() }), 'flechas');
  assert.equal(resolveTouchMode({ search: '?touchmode=xx', storage: st }), 'flechas');
  assert.equal(resolveTouchMode({ search: '', storage: st }), 'flechas');
  assert.equal(resolveTouchMode({ search: '', storage: memStore() }), 'joystick');
  assert.equal(resolveTouchMode({ search: '?touchmode=', storage: null }), 'joystick');
});

ok('TouchControls exportado (la instancia DOM se prueba en el navegador)', () => {
  assert.equal(typeof TouchControls, 'function');
});

console.log(`\n${n} pruebas OK`);
