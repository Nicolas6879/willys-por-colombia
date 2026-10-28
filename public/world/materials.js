// Materiales de la maqueta (ESTILO.md 2.5/2.6/2.10): MeshLambertMaterial + vertex colors + UN onBeforeCompile que reemplaza la luz por 3 pasos (cel):
// sombra (multiplica por el color de sombra de la hora), media y luz (tinte calido del sol). Los uniformes son COMPARTIDOS por todos los materiales:
// el ciclo de dia los actualiza una vez por frame (setCelPalette). El viento (aWind + uTime) y las luces que se encienden de noche (uNight)
// se inyectan en el mismo patron. addOutline = contorno "inverted hull" reutilizable.
import * as THREE from 'three';

export const CEL = {
  uShadow: { value: new THREE.Color(0.48, 0.36, 0.62) }, uMid: { value: new THREE.Color(0.8, 0.72, 0.8) }, uLit: { value: new THREE.Color(1, 0.93, 0.82) },
  uTime: { value: 0 }, uNight: { value: 0 }, uWind: { value: 1 },
};
const raw = (col, c, k = 1) => col.setRGB(c[0] / 255 * k, c[1] / 255 * k, c[2] / 255 * k, THREE.LinearSRGBColorSpace); // los tintes multiplican en lineal (sin conversion sRGB)

// p = paletteAt(t01)
export function setCelPalette(p) {
  const sun = p.sun, w = p.tint;
  const lit = [255 + (sun[0] - 255) * w, 255 + (sun[1] - 255) * w, 255 + (sun[2] - 255) * w];
  raw(CEL.uShadow.value, p.shadow);
  raw(CEL.uLit.value, lit, p.exposure);
  const m = [p.shadow[0] + (lit[0] - p.shadow[0]) * 0.7, p.shadow[1] + (lit[1] - p.shadow[1]) * 0.7, p.shadow[2] + (lit[2] - p.shadow[2]) * 0.7];
  raw(CEL.uMid.value, m, p.exposure);
  CEL.uNight.value = p.night;
}

const CEL_FRAG = `
	float celNl = 0.0;
	#if NUM_DIR_LIGHTS > 0
		celNl = dot( normal, directionalLights[ 0 ].direction );
	#endif
	float celHm = 0.5;
	#if NUM_HEMI_LIGHTS > 0
		celHm = 0.5 + 0.5 * dot( normal, hemisphereLights[ 0 ].direction );
	#endif
	float celV = 0.38 * celHm + 0.62 * smoothstep( -0.1, 0.45, celNl );
	vec3 celCol = mix( mix( uShadow, uMid, smoothstep( 0.38, 0.42, celV ) ), uLit, smoothstep( 0.68, 0.72, celV ) );
	vec3 outgoingLight = diffuseColor.rgb * celCol + totalEmissiveRadiance;`;

const celSoft = (k) => CEL_FRAG.replace('vec3 outgoingLight', `celCol = mix( uLit, celCol, ${k.toFixed(2)} );\n\tvec3 outgoingLight`);

const WIND_VERT = `
	#include <begin_vertex>
	#ifdef USE_INSTANCING
		float wph = instanceMatrix[ 3 ].x * 0.5 + instanceMatrix[ 3 ].z * 0.5;
	#else
		float wph = position.x * 0.5 + position.z * 0.5;
	#endif
	transformed.x += sin( uTime * 1.6 + wph ) * uWind * aWind;
	transformed.z += cos( uTime * 1.3 + wph * 1.3 ) * uWind * aWind * 0.6;`;

// opts: vertexColors (la geometria trae atributo color), wind (usa atributo aWind), y cualquier opcion de material (transparent, side, opacity...)
// soft: sombras suaves; true/0.4 = nubes de neblina (el cuerpo se mantiene claro), 0.65 = Willys y chivas (los heroes se leen a contraluz)
export function makeCel({ vertexColors = false, wind = false, soft = false, ...rest } = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors, ...rest });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uShadow: CEL.uShadow, uMid: CEL.uMid, uLit: CEL.uLit });
    sh.fragmentShader = sh.fragmentShader
      .replace('uniform vec3 diffuse;', 'uniform vec3 diffuse;\nuniform vec3 uShadow, uMid, uLit;')
      .replace('#include <lights_lambert_fragment>', '').replace('#include <lights_fragment_begin>', '').replace('#include <lights_fragment_maps>', '')
      .replace('#include <lights_fragment_end>', '').replace('#include <aomap_fragment>', '')
      .replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;', soft ? celSoft(soft === true ? 0.4 : soft) : CEL_FRAG);
    if (wind) {
      Object.assign(sh.uniforms, { uTime: CEL.uTime, uWind: CEL.uWind });
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aWind;\nuniform float uTime, uWind;\nvoid main() {').replace('#include <begin_vertex>', WIND_VERT);
    }
  };
  mat.customProgramCacheKey = () => `cel${wind ? 'W' : ''}${soft ? 'S' + soft : ''}`;
  return mat;
}
const memo = {};
// materiales compartidos (uno por familia): plain (color por instancia o material.color), vc (color por vertice), wind (vc + viento), windplain (instancia + viento), hero (vc, sombras suaves)
export const celMat = (kind = 'plain') => memo[kind] ??= makeCel({ vertexColors: kind === 'vc' || kind === 'wind' || kind === 'hero', wind: kind === 'wind' || kind === 'windplain', soft: kind === 'hero' ? 0.65 : false });

// "emisivo": MeshBasic que se enciende de noche (farolas, ventanas, luces de tarima). Por dia queda mas apagado.
export function makeGlow(opts = {}) {
  const mat = new THREE.MeshBasicMaterial(opts);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = CEL.uNight;
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform float uNight;\nvoid main() {').replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb *= mix( 0.55, 1.3, uNight );');
  };
  mat.customProgramCacheKey = () => 'glow';
  return mat;
}
export const glowMat = () => memo.glow ??= makeGlow();

// ---- contorno inverted hull (solo Willys y chivas por ahora) ----
const outlineGeoCache = new WeakMap();
// copia solo con position + normal "suave" (normales promediadas por posicion) para que el contorno no abra grietas en las aristas duras
function smoothOutlineGeometry(src) {
  let g = outlineGeoCache.get(src);
  if (g) return g;
  const s = src.index ? src.toNonIndexed() : src.clone();
  if (!s.attributes.normal) s.computeVertexNormals();
  const pos = s.attributes.position, nor = s.attributes.normal, key = (i) => `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
  const acc = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = key(i); let a = acc.get(k); if (!a) acc.set(k, a = [0, 0, 0]);
    a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = acc.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l;
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', pos); g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  outlineGeoCache.set(src, g);
  return g;
}
const outlineMats = new Map();
function outlineMaterial(thickness, color) {
  const k = thickness + ':' + color;
  let m = outlineMats.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    const u = { value: thickness };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uThick = u;
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform float uThick;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed += normalize( normal ) * uThick;');
    };
    m.customProgramCacheKey = () => 'outline';
    outlineMats.set(k, m);
  }
  return m;
}
// Agrega al mesh un hijo "casco invertido" (BackSide, #3A2418, engrosado por la normal). Reutilizable para chivas/hitos. Devuelve el hijo.
export function addOutline(mesh, { thickness = 0.035, color = 0x3a2418 } = {}) {
  const o = new THREE.Mesh(smoothOutlineGeometry(mesh.geometry), outlineMaterial(thickness, color));
  o.name = 'outline';
  mesh.add(o);
  return o;
}
