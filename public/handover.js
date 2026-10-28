// Coreografia del handover de recall (soltar el hold, crossfade y promote), compartida por los clientes (game.js, map2d.js).
// Dependencias inyectadas; onStart permite al cliente loguear recall_start sin acoplar el modulo.
// La promocion se vigila por timer Y por tick() por frame: con la pestana congelada (celular) el setTimeout llega tarde o nunca.
import { isFree } from './session-state.js';

export const XFADE_MS = 3000;

export function createHandover({ link, player, ss, ch, xfadeMs = XFADE_MS, onStart = null }) {
  let timer = 0, sent = false, since = 0, sid = 0;
  // abre la sesion recall (siempre con holdeo hasta el handover)
  const openRecall = (e, prompts, config) => { player.reset(1); player.hold(1, true); link.send({ type: 'open', ch: 1, sid: e.sid, prompts, config, play: true }); };
  const send = () => { if (sent) return; sent = true; clearTimeout(timer); timer = 0; link.send({ type: 'promote', from: 'recall' }); };
  // recall listo: suelta el hold; si el live esta libre promueve ya, si no crossfade y promote tras xfadeMs + 100 ms
  const start = () => {
    clearTimeout(timer); timer = 0; sent = false; since = 0;
    onStart?.(ss.handover);
    player.hold(1, false);
    if (isFree(ch[0])) return send();
    player.crossfade(0, 1, xfadeMs);
    since = Date.now(); sid = ch[1].sid;
    timer = setTimeout(() => tick(), xfadeMs + 100);
  };
  // Red de seguridad por frame (clock real): si el timer no disparo (pestana congelada, movil), promueve igual.
  const tick = (now = Date.now()) => {
    if (sent || !since || !ss.handover) return;
    if (now - since < xfadeMs + 100) return;
    if (ch[1].sid !== sid) { since = 0; return; }
    send();
  };
  const abort = () => { clearTimeout(timer); timer = 0; since = 0; };
  return { openRecall, start, abort, tick };
}
