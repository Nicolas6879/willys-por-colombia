// Willys procedural (G3a): rojo cafetero con crema, capo, parabrisas, guardabarros, 4 ruedas que giran, repuesto atras, costales de cafe en
// la parrilla. La carroceria es UNA malla fusionada con vertex colors (material cel) + contorno inverted hull #3A2418 (addOutline); cada rueda es
// otra malla con contorno. La sombra blob la pone world.shadows (un solo plano instanciado). El modelo mira a +z; la izquierda es +x.
import * as THREE from 'three';
import { CAR } from './vehicle.js';
import { bake, merge } from './world/geo.js';
import { celMat, makeCel, makeGlow, addOutline } from './world/materials.js';

const RIDE = 0.14; // el carro se apoya un poco por encima del suelo (la cinta de la carretera va 0.15 sobre heightAt)

export function willysBodyGeometry(red = 0xc8372d) {
  const cream = 0xf5e8c8, chrome = 0xe9edf2, dark = 0x3a3a3f, seat = 0x8a5a3c, sack = 0xd9b98a, tie = 0x7a5a2c;
  const parts = [];
  const box = (w, h, d, x, y, z, c, o = {}) => parts.push(bake(new THREE.BoxGeometry(w, h, d), c, { x, y, z, ...o }));
  box(1.7, 0.62, 3.3, 0, 0.78, 0, red);                 // carroceria baja
  box(1.74, 0.12, 3.34, 0, 0.58, 0, cream);             // franja crema
  box(1.5, 0.5, 1.25, 0, 1.12, 1.15, red);              // capo
  box(1.1, 0.5, 0.12, 0, 0.95, 1.82, chrome);           // parrilla
  for (const sx of [-1, 1]) {
    box(0.5, 0.1, 0.9, sx * 1.0, 0.98, 1.45, red, { rz: sx * -0.05 });   // guardabarros delanteros
    box(0.5, 0.1, 0.9, sx * 1.0, 0.98, -1.4, red, { rz: sx * -0.05 });   // traseros
  }
  box(1.9, 0.12, 0.14, 0, 0.5, 1.95, chrome); box(1.9, 0.12, 0.14, 0, 0.5, -1.95, chrome); // defensas
  box(1.56, 0.07, 0.08, 0, 1.9, 0.43, dark); box(1.56, 0.07, 0.08, 0, 1.3, 0.55, dark);     // marco del parabrisas
  for (const sx of [-1, 1]) { box(0.07, 0.95, 0.07, sx * 0.78, 1.55, 0.45, dark); box(0.07, 0.95, 0.07, sx * 0.78, 1.55, -0.85, dark); }
  box(1.72, 0.08, 1.5, 0, 2.05, -0.2, cream);           // techo
  box(1.3, 0.22, 0.5, 0, 1.0, -0.1, seat); box(1.3, 0.55, 0.12, 0, 1.3, -0.4, seat);       // asientos
  box(1.6, 0.05, 1.5, 0, 2.14, -0.2, dark);             // parrilla del techo
  [[-0.4, 2.4, -0.7, 0.2], [0.4, 2.4, -0.65, -0.15], [-0.4, 2.4, 0.15, -0.1], [0.4, 2.4, 0.2, 0.18], [0, 2.78, -0.25, 0.05]].forEach(([x, y, z, r]) => {
    parts.push(bake(new THREE.SphereGeometry(0.42, 8, 6), sack, { x, y, z, ry: r, sx: 0.95, sy: 0.75, sz: 1.25 })); // costales de cafe
    box(0.2, 0.06, 0.2, x, y + 0.3, z, tie);
  });
  parts.push(bake(new THREE.CylinderGeometry(0.42, 0.42, 0.26, 14).rotateX(Math.PI / 2), dark, { y: 1.0, z: -2.1 })); // repuesto
  parts.push(bake(new THREE.CylinderGeometry(0.2, 0.2, 0.28, 10).rotateX(Math.PI / 2), cream, { y: 1.0, z: -2.1 }));
  return merge(parts);
}
export function willysWheelGeometry() {
  const tyre = 0x2e2e33, rim = 0xf0e6c8, R = CAR.wheelR;
  return merge([
    bake(new THREE.CylinderGeometry(R, R, 0.3, 14).rotateZ(Math.PI / 2), tyre),
    bake(new THREE.CylinderGeometry(R * 0.55, R * 0.55, 0.32, 8).rotateZ(Math.PI / 2), rim),
    bake(new THREE.BoxGeometry(0.34, 0.12, 0.12), tyre, { y: R * 0.5 }), // marca para ver que gira
  ]);
}

export class Willys {
  constructor({ body = 0xc8372d } = {}) {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // lo que se inclina (pitch/roll/suspension)
    this.root.add(this.body);
    const mesh = new THREE.Mesh(willysBodyGeometry(body), celMat('hero'));
    addOutline(mesh, { thickness: 0.035 });
    this.body.add(mesh);
    // parabrisas translucido y faros (emisivos: se encienden de noche)
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.62, 0.06), makeCel({ color: 0xbfe6ff, transparent: true, opacity: 0.55 }));
    glass.position.set(0, 1.6, 0.5); glass.rotation.x = -0.18; this.body.add(glass);
    const lamp = makeGlow({ color: 0xfff6c8 });
    for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), lamp); l.position.set(sx * 0.62, 1.05, 1.78); this.body.add(l); }

    // ruedas (hijas de root, no del cuerpo: siguen el terreno por separado)
    this.wheels = [];
    const wg = willysWheelGeometry(), wm = celMat('hero');
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const g = new THREE.Group(), spin = new THREE.Mesh(wg, wm);
      addOutline(spin, { thickness: 0.03 });
      g.add(spin); this.root.add(g);
      this.wheels.push({ g, spin, lx: sx * 0.95, lz: sz * (CAR.wheelBase / 2), front: sz > 0 });
    }
    this.lift = RIDE;
    this.root.rotation.order = 'YXZ';
    this.body.rotation.order = 'ZXY';
  }

  // state: estado de vehicle.js ; heightAt(x,z)
  update(state, heightAt) {
    const { root, body } = this;
    const hc = heightAt(state.x, state.z);
    this.lift += ((state.onRoad ? RIDE : 0.03) - this.lift) * 0.1; // sobre la cinta de la carretera (0.15) o pegado al suelo
    root.position.set(state.x, hc + this.lift, state.z);
    root.rotation.y = state.heading;
    const pitch = state.pitch + state.dynPitch, roll = state.roll + state.dynRoll;
    body.rotation.x = -pitch;          // pitch > 0 = morro arriba
    body.rotation.z = roll;            // roll > 0 = izquierda arriba
    body.position.y = state.susp;
    const sh = Math.sin(state.heading), ch = Math.cos(state.heading);
    for (const w of this.wheels) {
      const wx = state.x + sh * w.lz + ch * w.lx, wz = state.z + ch * w.lz - sh * w.lx;
      w.g.position.set(w.lx, heightAt(wx, wz) - hc + CAR.wheelR, w.lz);
      w.g.rotation.y = w.front ? (state.delta ?? -state.steer * 0.45) : 0; // angulo real del volante (se ve el contravolante en el derrape)
      w.spin.rotation.x = state.wheelSpin;
    }
  }
}
