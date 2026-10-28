// Secciones musicales dentro de una region (pura): para que el tema no suene en loop, ademas del ancla de la region (peso 1) se anade
// una capa secundaria con peso bajo, en un ciclo de 90 s contado desde que el tema arranco (promote / inicio / entrada):
//   0-25 s solo ancla | 25-50 s ancla + sections[0] (capa de instrumento) | 50-70 s ancla + sections[1] (breakdown: capa de mood, pads/ambiente) | 70-90 s solo ancla | y vuelta a empezar.
// Cada seccion puede ser un texto (formato antiguo) o { name, layer, text, weight?, density?, brightness? }: density/brightness son
// DESPLAZAMIENTOS de la base musical (la reactividad a la velocidad modula alrededor de base + desplazamiento; ver reactive.js).
export const SECTION_CFG = { addMs: 25000, switchMs: 50000, baseMs: 70000, cycleMs: 90000, weight: 0.35 };

export const sectionDef = (s) => (typeof s === 'string' ? { text: s } : s || null);
export const sectionText = (s) => sectionDef(s)?.text;
export const sectionWeight = (s, cfg = SECTION_CFG) => sectionDef(s)?.weight ?? cfg.weight;
// desplazamiento de la base {density, brightness} que aporta la seccion (0 si no define)
export const sectionShift = (s) => { const d = sectionDef(s); return { density: d?.density ?? 0, brightness: d?.brightness ?? 0 }; };

// -1 = solo base, 0 / 1 = indice de la seccion secundaria activa
export function sectionIndex(elapsedMs, cfg = SECTION_CFG) {
  if (!(elapsedMs >= 0)) return -1;
  const t = elapsedMs % cfg.cycleMs;
  return t < cfg.addMs ? -1 : t < cfg.switchMs ? 0 : t < cfg.baseMs ? 1 : -1;
}

// place: { prompt, sections: [s0, s1] } -> [{text, weight}] (ancla primero)
export function sectionPrompts(place, elapsedMs, cfg = SECTION_CFG) {
  const out = [{ text: place.prompt, weight: 1 }], k = sectionIndex(elapsedMs, cfg), sec = place.sections?.[k];
  if (k >= 0 && sec) out.push({ text: sectionText(sec), weight: sectionWeight(sec, cfg) });
  return out;
}
