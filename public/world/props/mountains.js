// Vegetacion del pais (G4, placeholders baratos instanciados): pinos de montana en las cordilleras (lejos de carreteras y de las zonas) y selva baja
// (copas redondas) en la Amazonia y el Pacifico, sin carreteras. Repartidos en bloques de 520 u para el culling por distancia.
import { SITES, WORLD } from '../layout.js';
import { climate } from '../base.js';
import { countrySD, landSD } from '../coast.js';

const BLOCK = 520;
function blocks(list) {
  const m = new Map();
  for (const t of list) { const k = Math.floor((t.x - WORLD.minX) / BLOCK) * 100 + Math.floor((t.z - WORLD.minZ) / BLOCK); (m.get(k) || m.set(k, []).get(k)).push(t); }
  return [...m.values()];
}

export function build(scene, { THREE, inst, grid, place, farFromRoad, heightAt, hash01, lambert, windAttr }) {
  const zs = Object.values(SITES), cx = WORLD.cx, cz = WORLD.cz, half = Math.max(WORLD.width, WORLD.height) / 2 + 30;
  const nearSite = (x, z, r) => { for (const s of zs) if (Math.hypot(x - s.x, z - s.z) < r) return true; return false; };

  // ---- pinos de montana
  const pineGeo = windAttr(new THREE.ConeGeometry(2.8, 9, 6).translate(0, 4.5, 0), 9, 0.12);
  const trees = place(grid(cx, cz, half, 30, 11), (x, z) => {
    if (countrySD(x, z) < -60 || landSD(x, z) < 40) return false;
    const h = heightAt(x, z), c = climate(x, z);
    if (h < 25 || h > 140 || c.e > 0.35 || hash01(x * 0.31, z * 0.29) > 0.45 || !farFromRoad(x, z, 18) || nearSite(x, z, 190)) return false;
    return h;
  }, (x, z, h) => ({ x, y: h - 0.5, z, sx: 0.8 + hash01(x, z) * 0.9, sy: 0.9 + hash01(z, x) * 1.1, sz: 0, c: hash01(x + 3, z) })).slice(0, 2200);
  trees.forEach((t) => { t.sz = t.sx; });
  for (const list of blocks(trees)) inst(pineGeo, lambert(0xffffff, { wind: true }), list, (t) => (t.c < 0.5 ? 0x3f9e5a : t.c < 0.85 ? 0x5fb862 : 0x2f8a55), { thin: true });

  // ---- selva baja: Amazonia (sur, al este de los Andes) y selva humeda del Pacifico (al oeste de la Occidental). Copa redonda + tronco, ~30 tris.
  const jungleGeo = windAttr((() => {
    const g = new THREE.IcosahedronGeometry(3.3, 0).scale(1, 0.8, 1).translate(0, 5.0, 0), t = new THREE.CylinderGeometry(0.35, 0.55, 4, 3).translate(0, 2, 0).toNonIndexed();
    const out = new THREE.BufferGeometry(), a = g, b = t, n = a.attributes.position.count + b.attributes.position.count, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const put = (geo, off, rgb) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { pos.set([p.getX(i), p.getY(i), p.getZ(i)], (off + i) * 3); col.set(rgb, (off + i) * 3); } };
    put(a, 0, [1, 1, 1]); put(b, a.attributes.position.count, [0.34, 0.25, 0.17]);
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  })(), 8, 0.1);
  const jungle = place(grid(cx, cz, half, 20, 31), (x, z) => {
    const S = landSD(x, z);
    if (S < 70 || countrySD(x, z) < -120 || hash01(x * 0.43, z * 0.37) > 0.78) return false;
    const c = climate(x, z), amazon = c.e * c.s, pac = c.w;
    if (amazon < 0.55 && pac < 0.6) return false;
    if (nearSite(x, z, 330) || !farFromRoad(x, z, 16)) return false;
    const h = heightAt(x, z);
    return h > 1.5 && h < 70 ? h : false;
  }, (x, z, h) => ({ x, y: h - 0.2, z, sx: 0.8 + hash01(x, z + 1) * 0.7, sy: 0.8 + hash01(z, x + 1) * 0.8, sz: 0, c: hash01(x + 9, z + 5) })).slice(0, 9000);
  jungle.forEach((t) => { t.sz = t.sx; });
  for (const list of blocks(jungle)) inst(jungleGeo, lambert(0xffffff, { wind: true, vc: true }), list, (t) => (t.c < 0.4 ? 0x2f8a4a : t.c < 0.75 ? 0x3f9f55 : 0x277a44), { thin: true, colliderR: 0.8 }); // tronco macizo (la copa queda por encima del carro)
}
