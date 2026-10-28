// Modo sin key: logica pura para elegir que playlist de Spotify suena (el embed y el DOM viven en game.js).
// Las playlists salen del campo `spotify` de cada lugar en places.json (solo el ID de la playlist).
const ID_RE = /^[A-Za-z0-9]{10,40}$/;
export const validId = (id) => typeof id === 'string' && ID_RE.test(id);

export const playlistUri = (id) => (validId(id) ? `spotify:playlist:${id}` : null); // para controller.loadUri
export const playlistUrl = (id) => (validId(id) ? `https://open.spotify.com/playlist/${id}` : null); // enlace "Abrir en Spotify"

// places: arreglo de lugares [{id, spotify}] o mapa id -> lugar
const placeOf = (places, id) => (Array.isArray(places) ? places.find((p) => p?.id === id) : places?.[id]) || null;
export const playlistOf = (places, regionId) => { const s = placeOf(places, regionId)?.spotify; return validId(s) ? s : null; };

// Decide si hay que cargar otra playlist: devuelve el ID nuevo, o null si no se debe cambiar
// (auto apagado, sin region, region sin playlist, o ya es la que suena).
export function nextPlaylist({ current = null, regionId = null, auto = true, places = [] } = {}) {
  if (!auto || !regionId) return null;
  const id = playlistOf(places, regionId);
  if (!id || id === current) return null;
  return id;
}

// Playlist inicial: la de la region mas cercana; si no tiene, el primer lugar que tenga una. null si ninguna.
export function initialPlaylist({ nearestId = null, places = [] } = {}) {
  const near = playlistOf(places, nearestId);
  if (near) return { regionId: nearestId, id: near };
  const list = Array.isArray(places) ? places : Object.values(places || {});
  const first = list.find((p) => validId(p?.spotify));
  return first ? { regionId: first.id, id: first.spotify } : null;
}
