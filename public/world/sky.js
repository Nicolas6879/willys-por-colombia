// Cielo (ESTILO.md 2.7): domo con gradiente de 3 paradas + sol/luna (disco + halo) que sigue la hora, estrellas de noche y nubes del cielo
// (12-16 grupos de esferas fusionadas, UN draw call, base tenida segun la hora). Todo con fog:false; el domo y las estrellas siguen a la camara.
import * as THREE from 'three';
import { puffGeometry, merge } from './geo.js';
import { hash01 } from './base.js';

const setSRGB = (c, a) => c.setRGB(a[0] / 255, a[1] / 255, a[2] / 255, THREE.SRGBColorSpace);

export function makeSkyDome() {
  const u = {
    zenith: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
    sunCol: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 0.2, -1) }, uDay: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: u,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 zenith, mid, horizon, sunCol, sunDir; uniform float uDay;
      void main(){
        vec3 d = normalize(vDir);
        float e = clamp(d.y, -0.2, 1.0);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.2, e));
        c = mix(c, zenith, smoothstep(0.14, 0.8, e));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        float disc = smoothstep(0.99735, 0.99800, s);          // radio angular ~4 grados
        float halo = pow(s, 12.0) * 0.30 + pow(s, 3.0) * 0.10;  // halo ancho al ~15%
        c += sunCol * halo;
        c = mix(c, sunCol, disc);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), mat);
  mesh.renderOrder = -10; mesh.frustumCulled = false;
  return {
    mesh,
    // p = paletteAt; horizon/mid ya mezclados con el color de la region (si toca)
    apply(p, horizon, mid) {
      setSRGB(u.zenith.value, p.zenith); setSRGB(u.mid.value, mid); setSRGB(u.horizon.value, horizon); setSRGB(u.sunCol.value, p.sun);
      u.sunDir.value.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]);
    },
  };
}

// 200 puntos de 2 px en el hemisferio superior; aparecen por opacidad al anochecer
export function makeStars(n = 200) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = hash01(i * 3.7, 1) * Math.PI * 2, e = Math.asin(0.08 + hash01(i * 1.9, 5) * 0.92), r = 2300;
    pos.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xfff6e0, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const pts = new THREE.Points(g, mat); pts.renderOrder = -9; pts.frustumCulled = false; pts.visible = false;
  return { mesh: pts, apply(p) { const o = Math.min(1, Math.max(0, (p.night - 0.45) / 0.45)); mat.opacity = o; pts.visible = o > 0.01; } };
}

// Nubes del cielo: n grupos (4-7 esferas de 8x6) fusionados en una malla. Flotan girando 0.002 rad/s alrededor del centro del grupo, que sigue
// a la camara con paralaje (0.9). `setVisibleFraction` recorta nubes enteras (degradacion automatica de rendimiento).
export function makeSkyClouds(n = 14) {
  const parts = [], vcount = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash01(i, 9) * 0.5, rad = 520 + hash01(i * 2.1, 3) * 900, ext = 85 + hash01(i, 13) * 85;
    const pg = puffGeometry(i + 1, 4 + (i % 4), ext, [8, 6]);
    pg.translate(Math.cos(a) * rad, 250 + hash01(i * 1.3, 7) * 110, Math.sin(a) * rad);
    parts[i] = pg; vcount[i] = pg.attributes.position.count;
  }
  const geo = merge(parts);
  const u = { uTop: { value: new THREE.Color() }, uBase: { value: new THREE.Color() } };
  const mat = new THREE.ShaderMaterial({
    fog: false, uniforms: u, depthWrite: true,
    vertexShader: 'attribute vec3 color; varying float vH; void main(){ vH = color.r; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying float vH; uniform vec3 uTop, uBase;
      void main(){
        float lvl = smoothstep(0.30, 0.36, vH) * 0.5 + smoothstep(0.62, 0.68, vH) * 0.5; // 3 pasos
        gl_FragColor = vec4(mix(uBase, uTop, lvl), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = -8;
  const group = new THREE.Group(); group.add(mesh);
  let total = geo.attributes.position.count;
  return {
    group, mesh, tris: total / 3,
    apply(p) { setSRGB(u.uTop.value, p.cloudTop); setSRGB(u.uBase.value, p.cloudBase); },
    update(t, camPos) { group.position.set(camPos.x * 0.9, 0, camPos.z * 0.9); group.rotation.y = t * 0.002; },
    setVisibleFraction(f) { let c = 0, k = Math.max(1, Math.round(n * f)); for (let i = 0; i < k; i++) c += vcount[i]; geo.setDrawRange(0, c); },
  };
}
