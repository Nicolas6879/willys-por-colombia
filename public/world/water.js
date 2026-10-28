// Agua (ESTILO.md 2.9): mar con bandas de espuma que avanzan hacia la orilla (costas norte y oeste) y rio con flujo.
// El mar es UN plano de 64x64 segmentos que sigue a la camara (alineado a la rejilla, olas en coordenadas de mundo) y consulta una textura 128x128
// con la profundidad bajo el nivel del mar (precalculada de heightAt). Sin reflejos ni refraccion; opacidad fija 0.92.
import * as THREE from 'three';
import { WORLD } from './terrain.js';
import { CEL } from './materials.js';

const MAX_DEPTH = 12, TEXW = Math.ceil(WORLD.width / 14), TEXH = Math.ceil(WORLD.height / 14); // textura de profundidad del mar sobre todo el mundo (~14 u por texel)

// profundidad (0 en tierra/orilla .. MAX_DEPTH) en una textura R8 que cubre el mundo; heightAt(x,z) debe ser barata en tierra (G4: seaFloorAt)
export function makeDepthTexture(heightAt) {
  const data = new Uint8Array(TEXW * TEXH), cx = WORLD.width / TEXW, cz = WORLD.height / TEXH;
  for (let j = 0; j < TEXH; j++) for (let i = 0; i < TEXW; i++) {
    const h = heightAt(WORLD.minX + (i + 0.5) * cx, WORLD.minZ + (j + 0.5) * cz);
    data[j * TEXW + i] = Math.round(255 * Math.min(1, Math.max(0, -h / MAX_DEPTH)));
  }
  const t = new THREE.DataTexture(data, TEXW, TEXH, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

const NOISE = `
float wHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y); }`;

export function makeSea(heightAt) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uDepth: { value: makeDepthTexture(heightAt) },
    uDeep: { value: new THREE.Color(0x1e88c8) }, uMid: { value: new THREE.Color(0x4fd1c5) }, uShore: { value: new THREE.Color(0xb8f2e6) }, uFoam: { value: new THREE.Color(0xffffff) },
  }]);
  uniforms.uLit = CEL.uLit; // el tinte iluminado de la hora (compartido con el material cel)
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true, transparent: true, depthWrite: true,
    vertexShader: `uniform float uTime; varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += sin(wp.x * 0.031 + uTime * 0.9) * 0.07 + sin(wp.z * 0.027 - uTime * 0.7 + wp.x * 0.01) * 0.08; // amplitud <= 0.15 u
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D uDepth; uniform vec3 uDeep, uMid, uShore, uFoam, uLit; uniform float uTime; varying vec3 vW;
      #include <fog_pars_fragment>
      ${NOISE}
      void main(){
        vec2 uv = (vW.xz - vec2(${WORLD.minX.toFixed(1)}, ${WORLD.minZ.toFixed(1)})) / vec2(${WORLD.width.toFixed(1)}, ${WORLD.height.toFixed(1)});
        float d = (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) ? ${MAX_DEPTH.toFixed(1)} : texture2D(uDepth, uv).r * ${MAX_DEPTH.toFixed(1)};
        vec3 col = mix(uShore, uMid, smoothstep(0.0, 1.6, d));
        col = mix(col, uDeep, smoothstep(2.5, 8.0, d));
        float n = wNoise(vW.xz * 0.09 + uTime * 0.05);
        float w = sin((d * 1.1 + uTime * 0.32 + n * 1.4) * 6.2831);        // fase constante cuando d baja con t: las bandas avanzan hacia la orilla
        float band = smoothstep(0.80, 0.96, w * 0.5 + 0.5 + (n - 0.5) * 0.25);
        float fade = 1.0 - smoothstep(2.0, 7.5, d);                         // se desvanecen mar adentro
        float edge = 1.0 - smoothstep(0.0, 0.4, d + (n - 0.5) * 0.35);       // espuma pegada a la orilla
        col = mix(col, uFoam, max(band * fade, edge * 0.9));
        col *= uLit;
        gl_FragColor = vec4(col, 0.92);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600, 40, 40).rotateX(-Math.PI / 2), mat);
  mesh.position.y = -0.12; mesh.frustumCulled = false; mesh.renderOrder = 2;
  const cell = 1600 / 40;
  return {
    mesh,
    update(t, cam) { uniforms.uTime.value = t; mesh.position.x = Math.round(cam.x / cell) * cell; mesh.position.z = Math.round(cam.z / cell) * cell; },
  };
}

// Rio: cinta de agua que sigue el cauce (pts [[x,z],..]) con flujo (franjas que avanzan) y espuma en las orillas. level(x,z) -> altura de la superficie.
export function makeRiver(pts, halfWidth, level, color = 0x3fb8e0) {
  const pos = [], uvs = [], idx = [];
  let acc = 0, cnt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 14), nx = -(bz - az) / L, nz = (bx - ax) / L;
    for (let k = i === 0 ? 0 : 1; k <= n; k++) { // una seccion transversal cada ~14 u (la primera de cada tramo ya existe)
      const f = k / n, cx = ax + (bx - ax) * f, cz = az + (bz - az) * f, y = level(cx, cz), v = (acc + L * f) / 14;
      pos.push(cx - nx * halfWidth, y, cz - nz * halfWidth, cx + nx * halfWidth, y, cz + nz * halfWidth);
      uvs.push(0, v, 1, v);
      if (cnt > 0) { const q = (cnt - 1) * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      cnt++;
    }
    acc += L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(uvs), 2));
  g.setIndex(idx);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uCol: { value: new THREE.Color(color) }, uFoam: { value: new THREE.Color(0xffffff) } }]);
  uniforms.uLit = CEL.uLit;
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 uCol, uFoam, uLit; uniform float uTime; varying vec2 vUv; varying vec3 vW;
      #include <fog_pars_fragment>
      ${NOISE}
      void main(){
        float n = wNoise(vec2(vUv.x * 5.0, vUv.y * 1.4 - uTime * 0.9));
        float streak = smoothstep(0.62, 0.78, sin((vUv.y * 1.6 - uTime * 0.55) * 6.2831 + vUv.x * 3.0 + n * 2.0) * 0.5 + 0.5);
        vec3 col = mix(uCol, uFoam, streak * 0.45);
        float edge = smoothstep(0.34, 0.5, abs(vUv.x - 0.5) + (n - 0.5) * 0.12);     // espuma en las orillas
        col = mix(col, uFoam, edge * 0.85);
        gl_FragColor = vec4(col * uLit, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = 1;
  return { mesh, update(t) { uniforms.uTime.value = t; } };
}

// Parte un rio (polilinea [[x,z],..]) en tramos continuos donde ok(x,z) es cierto (muestrea cada ~step u): el rio se interrumpe junto a carreteras y regiones
export function riverRuns(pts, ok, step = 14) {
  const runs = []; let cur = [];
  const push = (x, z) => { if (ok(x, z)) cur.push([x, z]); else { if (cur.length >= 3) runs.push(cur); cur = []; } };
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) push(ax + (bx - ax) * k / n, az + (bz - az) * k / n);
  }
  if (cur.length >= 3) runs.push(cur);
  return runs;
}
