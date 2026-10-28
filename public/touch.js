// Controles tactiles del juego 3D (pensados para horizontal), con dos modos:
//  - "joystick" (por defecto): UN joystick analogico flotante en la mitad izquierda (arriba = gas, abajo = freno/reversa,
//    lados = direccion) y solo el freno de mano como boton.
//  - "flechas": botones < > para girar (abajo-izq.) y Acelerar / Freno-Reversa / Mano (abajo-der.).
// Solo escriben el input que lee la fisica (mergeInputs); no tocan audio ni mundo. Se activan con puntero grueso
// (celular/tablet) o a la fuerza con ?touch=1 / ?touch=0; el modo se fuerza con ?touchmode=joystick|flechas.
const clamp1 = (x) => Math.max(-1, Math.min(1, x));

export const steerFromDx = (dx, maxPx = 50) => clamp1(dx / maxPx); // desplazamiento horizontal -> direccion proporcional

export function touchEnabled({
  search = globalThis.location?.search ?? '',
  coarse = !!globalThis.matchMedia?.('(pointer: coarse)').matches,
  hoverNone = !!globalThis.matchMedia?.('(hover: none)').matches,
  maxTouchPoints = globalThis.navigator?.maxTouchPoints || 0,
} = {}) {
  const q = new URLSearchParams(search).get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  return coarse || (hoverNone && maxTouchPoints > 0);
}

// ---- modos de control ----
export const TOUCH_MODES = ['joystick', 'flechas'];
export const DEFAULT_TOUCH_MODE = 'joystick';
export const TOUCH_MODE_KEY = 'willys.touchmode';
export const STICK_RADIUS = 56; // px de recorrido del joystick (el area de toque es toda la mitad izquierda)
export const STICK_DEAD = 0.12; // zona muerta (fraccion del radio)
const validMode = (m) => (TOUCH_MODES.includes(m) ? m : null);
const defaultStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

// valor de un eje del joystick: zona muerta y reescalado para que arranque suave desde 0 (sin salto al salir de la zona muerta)
export function axisWithDead(v, dead = STICK_DEAD) {
  const a = Math.abs(v);
  if (a <= dead) return 0;
  return Math.sign(v) * Math.min(1, (a - dead) / (1 - dead));
}

// desplazamiento del dedo respecto al centro del joystick (px; dy < 0 = arriba en pantalla) -> input de la fisica
export function joystickToInput(dx, dy, radius = STICK_RADIUS, dead = STICK_DEAD) {
  const nx = clamp1(dx / radius), ny = clamp1(dy / radius);
  const y = axisWithDead(ny, dead);
  return { throttle: y < 0 ? -y : 0, brake: y > 0 ? y : 0, steer: axisWithDead(nx, dead) };
}

// limita el desplazamiento a un circulo de `radius` (para dibujar la perilla sin salirse de la base)
export function clampStick(dx, dy, radius = STICK_RADIUS) {
  const d = Math.hypot(dx, dy);
  if (d <= radius || d === 0) return { x: dx, y: dy };
  return { x: (dx / d) * radius, y: (dy / d) * radius };
}

// modo flechas: botones izquierda/derecha (multitouch: ambos a la vez = 0)
export const steerFromButtons = (left, right) => (right ? 1 : 0) - (left ? 1 : 0);

// mantiene la base del joystick dentro de la pantalla: centro acotado a un margen del borde
export const clampCenter = (v, size, margin) => Math.max(margin, Math.min(size - margin, v));

export function loadTouchMode(storage = defaultStorage()) {
  try { return validMode(storage?.getItem(TOUCH_MODE_KEY)) || DEFAULT_TOUCH_MODE; } catch { return DEFAULT_TOUCH_MODE; }
}
export function saveTouchMode(mode, storage = defaultStorage()) {
  if (!validMode(mode)) return false;
  try { storage.setItem(TOUCH_MODE_KEY, mode); return true; } catch { return false; }
}
export const nextTouchMode = (mode) => (mode === 'flechas' ? 'joystick' : 'flechas');

// ?touchmode=... (pruebas) manda sobre lo guardado; sin nada valido -> joystick
export function resolveTouchMode({ search = globalThis.location?.search ?? '', storage = defaultStorage() } = {}) {
  const q = validMode(new URLSearchParams(search).get('touchmode'));
  return q || loadTouchMode(storage);
}

// teclado + tactil: pedales por maximo, direccion por suma (con tope), freno de mano por OR
export function mergeInputs(kb, t) {
  return {
    throttle: Math.max(kb.throttle, t?.throttle || 0),
    brake: Math.max(kb.brake, t?.brake || 0),
    steer: clamp1(kb.steer + (t?.steer || 0)),
    handbrake: !!(kb.handbrake || t?.handbrake),
  };
}

const SVG = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON_JOY = SVG('<ellipse cx="12" cy="20" rx="8" ry="2.6"/><path d="M12 17.4V10"/><circle cx="12" cy="7" r="4" fill="currentColor"/>');
const ICON_ARROWS = SVG('<path d="M10 6L3 12l7 6z" fill="currentColor"/><path d="M14 6l7 6-7 6z" fill="currentColor"/>');

export class TouchControls {
  constructor({ mode = resolveTouchMode(), onMap = null, onMemory = null, onPause = null, onMode = null } = {}) {
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.mode = validMode(mode) || DEFAULT_TOUCH_MODE;
    this.onMode = onMode;
    this.stickId = null; // puntero que maneja el joystick (uno solo)
    this.stick = { dx: 0, dy: 0 };
    this.held = { left: 0, right: 0, gas: 0, brake: 0, hand: 0 }; // cantidad de dedos sobre cada boton
    const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt) n.textContent = txt; return n; };
    const noMenu = (n) => { n.addEventListener('contextmenu', (e) => e.preventDefault()); n.addEventListener('selectstart', (e) => e.preventDefault()); return n; }; // sin menu de pulsacion larga ni seleccion

    this.zone = noMenu(el('div')); this.zone.id = 'tz'; // mitad izquierda: el pulgar apoya y el joystick aparece ahi
    this.zone.addEventListener('pointerdown', (e) => this._stickDown(e));
    this.zone.addEventListener('pointermove', (e) => this._stickMove(e));
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) this.zone.addEventListener(ev, (e) => this._stickUp(e));
    this.base = noMenu(el('div')); this.base.id = 'tbase'; // base del joystick (fantasma fija hasta que se toca)
    this.puck = noMenu(el('div')); this.puck.id = 'tpuck';
    this.base.append(this.puck);

    this.hand = this._hold(noMenu(el('div', 'tbtn', 'Freno de mano')), 'hand'); this.hand.id = 'thand';
    this.left = this._hold(noMenu(el('div', 'tbtn', '◀')), 'left'); this.left.id = 'tleft';
    this.right = this._hold(noMenu(el('div', 'tbtn', '▶')), 'right'); this.right.id = 'tright';
    this.gas = this._hold(noMenu(el('div', 'tbtn', 'Acelerar')), 'gas'); this.gas.id = 'tgas';
    this.brake = this._hold(noMenu(el('div', 'tbtn', 'Freno / Reversa')), 'brake'); this.brake.id = 'tbrake';
    const ped = noMenu(el('div')); ped.id = 'tped'; // freno arriba, acelerar abajo (el pulgar descansa en acelerar)
    ped.append(this.brake, this.gas);
    const arrows = noMenu(el('div')); arrows.id = 'tarrows';
    arrows.append(this.left, this.right);

    this.mapBtn = this._tap(el('button', 'tbtn', 'Mapa'), onMap);
    this.memBtn = this._tap(el('button', 'tbtn', 'Memoria'), onMemory);
    this.pauseBtn = this._tap(el('button', 'tbtn', 'Pausa'), onPause);
    this.modeBtn = this._tap(el('button', 'tbtn', ''), () => this.setMode(nextTouchMode(this.mode), true));
    this.modeBtn.id = 'tmode';
    const top = noMenu(el('div')); top.id = 'ttop'; // acciones, bajo el minimapa (rejilla 2x2)
    top.append(this.mapBtn, this.memBtn, this.pauseBtn, this.modeBtn);

    document.body.append(this.zone, this.base, this.hand, arrows, ped, top);
    addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    this.setMode(this.mode, false);
  }

  _hold(node, key) { // mantener pulsado = tecla sostenida; multitouch por pointerId, captura el puntero para no perder el pointerup
    const ids = new Set();
    node._ids = ids;
    node.addEventListener('pointerdown', (e) => { e.preventDefault(); node.setPointerCapture?.(e.pointerId); ids.add(e.pointerId); this._press(node, key, ids); });
    const up = (e) => { if (ids.delete(e.pointerId)) this._press(node, key, ids); };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) node.addEventListener(ev, up);
    return node;
  }
  _press(node, key, ids) { this.held[key] = ids.size; node.classList.toggle('act', ids.size > 0); this._sync(); }

  _tap(node, fn) { node.addEventListener('click', () => { fn?.(); node.blur(); }); return node; }

  _stickDown(e) {
    if (this.mode !== 'joystick' || this.stickId != null) return;
    e.preventDefault();
    this.stickId = e.pointerId;
    this.zone.setPointerCapture?.(e.pointerId);
    const r = STICK_RADIUS + 10; // el centro nace donde cae el dedo (acotado para que la base quepa en pantalla)
    this.cx = clampCenter(e.clientX, innerWidth, r); this.cy = clampCenter(e.clientY, innerHeight, r);
    this.base.style.left = `${this.cx}px`; this.base.style.top = `${this.cy}px`; this.base.style.bottom = 'auto';
    this.base.classList.add('live');
    this.stick = { dx: e.clientX - this.cx, dy: e.clientY - this.cy };
    this._sync();
  }
  _stickMove(e) {
    if (e.pointerId !== this.stickId) return;
    this.stick = { dx: e.clientX - this.cx, dy: e.clientY - this.cy };
    this._sync();
  }
  _stickUp(e) {
    if (e && e.pointerId !== this.stickId) return;
    this.stickId = null; this.stick = { dx: 0, dy: 0 };
    this.base.classList.remove('live');
    this.base.style.left = this.base.style.top = this.base.style.bottom = ''; // vuelve al sitio fantasma por CSS
    this._sync();
  }

  _sync() { // recalcula this.input (el mismo objeto, lo lee game.js cada frame) segun el modo
    const i = this.input, h = this.held;
    if (this.mode === 'joystick') {
      const s = joystickToInput(this.stick.dx, this.stick.dy);
      i.throttle = s.throttle; i.brake = s.brake; i.steer = s.steer;
      const c = clampStick(this.stick.dx, this.stick.dy);
      this.puck.style.transform = `translate(calc(-50% + ${c.x.toFixed(1)}px), calc(-50% + ${c.y.toFixed(1)}px))`;
    } else {
      i.throttle = h.gas ? 1 : 0; i.brake = h.brake ? 1 : 0; i.steer = steerFromButtons(h.left, h.right);
    }
    i.handbrake = h.hand > 0;
  }

  releaseAll() { // blur / pestana oculta / cambio de modo: nada queda pisado
    for (const n of [this.hand, this.left, this.right, this.gas, this.brake]) { n._ids.clear(); n.classList.remove('act'); }
    for (const k of Object.keys(this.held)) this.held[k] = 0;
    this._stickUp(null);
  }

  setMode(mode, persist = false) {
    if (!validMode(mode)) return;
    this.releaseAll();
    this.mode = mode;
    document.body.classList.toggle('tm-joystick', mode === 'joystick');
    document.body.classList.toggle('tm-flechas', mode === 'flechas');
    this.modeBtn.innerHTML = mode === 'joystick' ? ICON_JOY + '<span>Joystick</span>' : ICON_ARROWS + '<span>Flechas</span>'; // iconos SVG propios (los emoji no se renderizan igual en todos los celulares)
    this.modeBtn.title = 'Cambiar modo de control';
    if (persist) saveTouchMode(mode);
    this.onMode?.(mode);
  }

  setMemory(on) { this.memBtn.classList.toggle('on', !!on); } // estado visual del boton de memoria
  setPaused(on) { this.pauseBtn.textContent = on ? 'Reanudar' : 'Pausa'; this.pauseBtn.classList.toggle('on', !!on); }
}
