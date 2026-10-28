// Guarda la key de Google del jugador: localStorage si "recordar", sessionStorage si no (se borra al cerrar la pestana).
// Puro: los storages se inyectan via st.ls/st.ss; los globales se leen en el default del parametro (en Node no existen).
const K_KEY = 'lyria.key';
const K_REM = 'lyria.remember';

const norm = (s) => (s && typeof s.getItem === 'function' ? s : null); // storage ausente o incompleto = nulo
const safe = (f) => { try { return f(); } catch { return null; } }; // leer el storage global puede lanzar (bloqueado por el navegador)

export function loadKey(st = {}, ls = safe(() => globalThis.localStorage), ss = safe(() => globalThis.sessionStorage)) {
  const L = norm(st.ls ?? ls), S = norm(st.ss ?? ss);
  const k = L && L.getItem(K_REM) === '1' ? L.getItem(K_KEY) : null;
  if (k) return { key: k, remember: true };
  return { key: (S && S.getItem(K_KEY)) || '', remember: false };
}

export function saveKey(key, remember, st = {}, ls = safe(() => globalThis.localStorage), ss = safe(() => globalThis.sessionStorage)) {
  const k = String(key ?? '').trim();
  if (!k) return clearKey(st, ls, ss);
  const L = norm(st.ls ?? ls), S = norm(st.ss ?? ss);
  if (remember) {
    L?.setItem(K_KEY, k); L?.setItem(K_REM, '1');
    S?.removeItem(K_KEY); S?.removeItem(K_REM);
  } else {
    S?.setItem(K_KEY, k);
    L?.removeItem(K_KEY); L?.removeItem(K_REM);
  }
}

export function clearKey(st = {}, ls = safe(() => globalThis.localStorage), ss = safe(() => globalThis.sessionStorage)) {
  for (const s of [norm(st.ls ?? ls), norm(st.ss ?? ss)]) if (s) { s.removeItem(K_KEY); s.removeItem(K_REM); }
}
