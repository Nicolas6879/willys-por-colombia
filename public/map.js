// Escena three.js del mapa: Colombia vista desde arriba, lugares (disco interior, anillo exterior, etiqueta), orbe y estela.
// Mundo: x = este, y = norte (unidades de geo.js); en three: X = x, Z = -y, suelo en Y = 0.
import * as THREE from 'three';
import { COLOMBIA, PLACE_GEO, BOUNDS } from './geo.js';

const TRAIL_N = 140;

export class MapView {
  constructor(container, labelLayer, names = {}) {
    this.container = container;
    this.labelLayer = labelLayer;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b14);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 100);
    this.camera.position.set(0, 27, 7);
    this.camera.lookAt(0, 0, -0.5);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xbfd4ff, 0.6);
    sun.position.set(-4, 10, 6);
    this.scene.add(sun);

    // mar
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(BOUNDS.maxX * 2 + 8, (BOUNDS.maxY - BOUNDS.minY) + 8).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x0a1424 }));
    sea.position.y = -0.35;
    this.scene.add(sea);
    const grid = new THREE.GridHelper(36, 36, 0x16243d, 0x101a2e);
    grid.position.y = -0.33; grid.material.transparent = true; grid.material.opacity = 0.5;
    this.scene.add(grid);

    // silueta de Colombia: Shape extruida baja
    const shape = new THREE.Shape(COLOMBIA.map((p) => new THREE.Vector2(p.x, p.y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2); geo.translate(0, -0.3, 0);
    this.scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x1c2a44 })));
    const edge = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(COLOMBIA.map((p) => new THREE.Vector3(p.x, 0.02, -p.y))),
      new THREE.LineBasicMaterial({ color: 0x3d5a8c }));
    this.scene.add(edge);

    // lugares
    this.places = {};
    for (const g of PLACE_GEO) {
      const color = new THREE.Color(g.color);
      const grp = new THREE.Group();
      grp.position.set(g.x, 0.05, -g.y);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(g.inner, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }));
      const core = new THREE.Mesh(new THREE.CircleGeometry(g.inner * 0.25, 20).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
      core.position.y = 0.01;
      const ringGeo = new THREE.RingGeometry(g.outer - 0.03, g.outer, 72).rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12 }));
      const halo = new THREE.Mesh(new THREE.RingGeometry(g.outer - 0.12, g.outer + 0.02, 72).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      const flash = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      flash.position.y = 0.02;
      grp.add(disc, core, ring, halo, flash);
      this.scene.add(grp);
      const el = document.createElement('div');
      el.className = 'plabel'; el.textContent = names[g.id] || g.id;
      el.style.color = '#' + color.getHexString();
      labelLayer.appendChild(el);
      this.places[g.id] = { g, color, disc, ring, halo, flash, el, haloLevel: 0, flashT: 0 };
    }

    // orbe + luz + estela
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.orb.position.y = 0.35;
    this.light = new THREE.PointLight(0xffffff, 6, 5, 2);
    this.light.position.y = 0.9;
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glow.position.y = 0.06;
    this.scene.add(this.orb, this.light, this.glow);
    this.trailPts = [];
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
    this.trailGeo.setDrawRange(0, 0);
    this.trail = new THREE.Line(this.trailGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
    this._trailT = 0;

    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._v = new THREE.Vector3();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // en pantallas estrechas, alejar para que quepa el ancho
    this.camera.position.set(0, w / h < 0.9 ? 27 / Math.max(0.55, w / h) : 27, 7);
    this.camera.lookAt(0, 0, -0.5);
    this.camera.updateProjectionMatrix();
  }

  // clic en pantalla -> punto del mapa {x, y} (o null)
  pick(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera({ x: ((clientX - r.left) / r.width) * 2 - 1, y: -(((clientY - r.top) / r.height) * 2 - 1) }, this.camera);
    const hit = this.ray.ray.intersectPlane(this.plane, this._v);
    return hit ? { x: hit.x, y: -hit.z } : null;
  }

  setOrb(pos, now, colorHex) {
    this.orb.position.set(pos.x, 0.35, -pos.y);
    this.light.position.set(pos.x, 0.9, -pos.y);
    this.glow.position.set(pos.x, 0.06, -pos.y);
    if (colorHex !== undefined) { this.orb.material.color.setHex(colorHex); this.light.color.setHex(colorHex); this.glow.material.color.setHex(colorHex); this.trail.material.color.setHex(colorHex); }
    if (now - this._trailT > 50) {
      this._trailT = now;
      this.trailPts.push(pos.x, 0.25, -pos.y);
      if (this.trailPts.length > TRAIL_N * 3) this.trailPts.splice(0, 3);
      const arr = this.trailGeo.attributes.position.array;
      arr.set(this.trailPts); this.trailGeo.attributes.position.needsUpdate = true;
      this.trailGeo.setDrawRange(0, this.trailPts.length / 3);
    }
  }

  // halo: { id: nivel 0..1 } (los demas bajan a 0); flash(id) dispara el destello de entrada con memoria
  setHalos(levels, dt) {
    for (const [id, p] of Object.entries(this.places)) {
      const target = levels[id] || 0;
      p.haloLevel += (target - p.haloLevel) * Math.min(1, dt * 6);
      p.halo.material.opacity = p.haloLevel * 0.9;
      p.ring.material.opacity = 0.12 + p.haloLevel * 0.3;
    }
  }
  flash(id) { if (this.places[id]) this.places[id].flashT = 1; }
  setActive(id) { for (const [k, p] of Object.entries(this.places)) p.disc.material.opacity = k === id ? 0.9 : 0.55; }

  render(dt) {
    for (const p of Object.values(this.places)) {
      if (p.flashT > 0) {
        p.flashT = Math.max(0, p.flashT - dt / 1.1);
        const s = p.g.inner * (1 + (1 - p.flashT) * 3.5);
        p.flash.scale.set(s, 1, s);
        p.flash.material.opacity = p.flashT * 0.8;
      } else p.flash.material.opacity = 0;
      // etiqueta HTML
      this._v.set(p.g.x, 0.1, -p.g.y).project(this.camera);
      const r = this.renderer.domElement;
      p.el.style.transform = `translate(${(this._v.x * 0.5 + 0.5) * r.clientWidth}px, ${(-this._v.y * 0.5 + 0.5) * r.clientHeight}px) translate(-50%, -190%)`;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
