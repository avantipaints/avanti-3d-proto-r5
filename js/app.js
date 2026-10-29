/**
 * Avanti Paints — cinematic 3D prototype Round 6
 * Restored emissive light bar + bloom · gloss money-shot streak · 2.5s hero beat · mobile clients
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
window.ScrollTrigger = ScrollTrigger;

const CRIMSON = 0xe30046;
const BG = 0x0b0b0f;
const Q = new URLSearchParams(location.search);
const TOUCH = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
const HQ = !TOUCH || Q.has('hq');
const CALM = matchMedia('(prefers-reduced-motion: reduce)').matches || Q.has('calm');
const USE_DROP = false; /* R5: cut drop — broken capsule worse than none; light-bar sweep opens */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

if (CALM) { document.body.classList.add('calm'); $('#rmNote').hidden = false; }

const PRODUCT_ORDER = ['levelone', 'anacard', 'rk1000', 'lumiclean'];
const PRODUCTS = {
  levelone: {
    cat: 'Flooring', title: 'Level One',
    bullets: ['Excellent flow and levelling', 'Hygienic, dust-free floor surface', 'High abrasion and chemical resistance'],
    img: 'assets/products/webp/level-one.webp',
  },
  anacard: {
    cat: 'Protective Coatings', title: 'ANACARD 5548',
    bullets: ['Corrosion protection from zinc phosphate pigmentation', 'Strong adhesion on mild steel and fabricated structures', 'Resists moisture and industrial atmospheres'],
    img: 'assets/products/webp/anacard-5548.webp',
  },
  rk1000: {
    cat: 'Stone Care', title: 'RK-1000',
    bullets: ['Glossy exposed-concrete look', 'Silane-modified polymers for water repellency (lotus effect)', 'Long-term durability'],
    img: 'assets/products/webp/rk-1000.webp',
  },
  lumiclean: {
    cat: 'Cleaning & Home Care', title: 'LumiClean 99',
    bullets: ['Fast removal of mineral deposits and hard-water scale', 'Removes rust stains and cement residues', 'Multi-purpose hard-surface cleaner'],
    img: 'assets/products/webp/lumiclean.webp',
  },
};

const STAGES = [
  { num: '01', label: 'Bare concrete', title: 'The substrate waits' },
  { num: '02', label: 'Primer bite', title: 'Bond locks in' },
  { num: '03', label: 'Build coat', title: 'Body takes shape' },
  { num: '04', label: 'Mirror gloss', title: 'Level One finish' },
];

const FLOOR_BASE = 'assets/floor/v2/';
const DROP_LAYER = 1; /* excluded from reflector */
const GLOW_LAYER = 2; /* soft glow / floor streak — not mirrored */

const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: HQ, powerPreference: 'high-performance', alpha: false });
let dprCap = HQ ? 1.5 : 1.1;
renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap));
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(BG, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0e);
scene.fog = new THREE.Fog(0x0a0a0e, 7, 30);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 120);
const CAM = { y: 0.32, z: 3.2, lookZ: -14, lookY: 0.15 };
camera.position.set(0, CAM.y, CAM.z);
camera.lookAt(0, CAM.lookY, CAM.lookZ);
camera.layers.enable(DROP_LAYER);
camera.layers.enable(GLOW_LAYER);

const clock = new THREE.Clock();
const loader = new THREE.TextureLoader();
const loadTex = (url, opts = {}) => new Promise((res, rej) => {
  loader.load(url, (t) => {
    t.colorSpace = opts.colorSpace ?? THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (opts.repeat) t.repeat.set(opts.repeat, opts.repeat);
    if (opts.clamp) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    res(t);
  }, undefined, rej);
});

scene.add(new THREE.AmbientLight(0x14141c, 0.3));
const key = new THREE.DirectionalLight(0xfff2e0, 2.2);
key.position.set(-1.8, 5.2, 2.2);
scene.add(key);
const rim = new THREE.DirectionalLight(0xe30046, 0.55);
rim.position.set(3.8, 1.8, -2.2);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xb0a898, 0.5);
fill.position.set(1.2, 1.4, 3.5);
scene.add(fill);

/* Horizon glow + soft back wall with crimson rim */
const horizonGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(42, 3.4),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, fog: false, toneMapped: false })
);
horizonGlow.position.set(0, 1.15, -16.5);
scene.add(horizonGlow);

const backWall = new THREE.Mesh(
  new THREE.PlaneGeometry(52, 12),
  new THREE.MeshStandardMaterial({
    color: 0x0e0e14, roughness: 0.96, metalness: 0.04,
    emissive: 0x3a0814, emissiveIntensity: 0.38,
  })
);
backWall.position.set(0, 4.2, -19);
scene.add(backWall);

/* Faint crimson rim on horizon wall */
const rimBar = new THREE.Mesh(
  new THREE.BoxGeometry(28, 0.035, 0.035),
  new THREE.MeshStandardMaterial({ color: 0xe30046, emissive: 0xe30046, emissiveIntensity: 1.6, roughness: 0.35 })
);
rimBar.position.set(0, 0.42, -18.55);
scene.add(rimBar);
const rimBarSoft = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 0.55),
  new THREE.MeshBasicMaterial({
    color: 0xe30046, transparent: true, opacity: 0.07,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  })
);
rimBarSoft.position.set(0, 0.55, -18.4);
scene.add(rimBarSoft);

const rail = new THREE.Mesh(
  new THREE.BoxGeometry(16, 0.05, 0.05),
  new THREE.MeshStandardMaterial({ color: 0xfff4e4, emissive: 0xffe8c8, emissiveIntensity: 2.6, roughness: 0.2 })
);
rail.position.set(0, 2.7, -18.2);
scene.add(rail);

/* Floating emissive light-strip — R6: thick bright bar + additive glow (R4 energy restored) */
const strip = new THREE.Mesh(
  new THREE.BoxGeometry(7.4, 0.14, 0.38),
  new THREE.MeshStandardMaterial({
    color: 0xfff8ec, emissive: 0xfff0d8, emissiveIntensity: 3.8,
    roughness: 0.12, metalness: 0.1, transparent: true, toneMapped: false,
  })
);
strip.position.set(0, 1.55, -4.5);
strip.visible = false;
scene.add(strip);
/* Crisp untone-mapped core so the bar reads bright white without needing heavy bloom */
const stripCore = new THREE.Mesh(
  new THREE.BoxGeometry(7.0, 0.055, 0.16),
  new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false })
);
stripCore.position.copy(strip.position);
stripCore.visible = false;
scene.add(stripCore);

/* Soft bloom halo around the bar (additive, not tone-mapped) */
const stripGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(7.8, 0.38),
  new THREE.MeshBasicMaterial({
    color: 0xfff4e0, transparent: true, opacity: 0.38,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, side: THREE.DoubleSide,
  })
);
stripGlow.position.copy(strip.position);
stripGlow.visible = false;
scene.add(stripGlow);

const stripHalo = new THREE.Mesh(
  new THREE.PlaneGeometry(8.6, 0.7),
  new THREE.MeshBasicMaterial({
    color: 0xffe8c8, transparent: true, opacity: 0.12,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, side: THREE.DoubleSide,
  })
);
stripHalo.position.copy(strip.position);
stripHalo.visible = false;
scene.add(stripHalo);

/* Floor light streak — crisp bright white band running toward camera (money-shot helper) */
function makeStreakTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 64, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.42, 'rgba(255,248,236,0.15)');
  grd.addColorStop(0.5, 'rgba(255,255,255,1)');
  grd.addColorStop(0.58, 'rgba(255,248,236,0.15)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 256);
  const grd2 = g.createLinearGradient(0, 0, 0, 256);
  grd2.addColorStop(0, 'rgba(0,0,0,0.85)');
  grd2.addColorStop(0.35, 'rgba(0,0,0,0)');
  grd2.addColorStop(0.75, 'rgba(0,0,0,0)');
  grd2.addColorStop(1, 'rgba(0,0,0,0.7)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = grd2; g.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const streakTex = makeStreakTex();
const floorStreak = new THREE.Mesh(
  new THREE.PlaneGeometry(0.72, 14.0),
  new THREE.MeshBasicMaterial({
    map: streakTex, color: 0xffffff, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, side: THREE.DoubleSide,
  })
);
floorStreak.rotation.x = -Math.PI / 2;
floorStreak.position.set(0, 0.02, -1.6);
floorStreak.visible = false;
scene.add(floorStreak);
const floorStreakSoft = new THREE.Mesh(
  new THREE.PlaneGeometry(1.8, 14.0),
  new THREE.MeshBasicMaterial({
    map: streakTex, color: 0xfff0d8, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, side: THREE.DoubleSide,
  })
);
floorStreakSoft.rotation.x = -Math.PI / 2;
floorStreakSoft.position.set(0, 0.017, -1.6);
floorStreakSoft.visible = false;
scene.add(floorStreakSoft);
stripGlow.layers.set(GLOW_LAYER);
stripHalo.layers.set(GLOW_LAYER);
floorStreak.layers.set(GLOW_LAYER);
floorStreakSoft.layers.set(GLOW_LAYER);

const logoMark = new THREE.Mesh(
  new THREE.PlaneGeometry(2.2, 0.42),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
);
logoMark.position.set(0, 1.05, -8.5);
logoMark.rotation.x = -0.08;
logoMark.scale.setScalar(TOUCH ? 0.4 : 0.85);
logoMark.visible = false;
scene.add(logoMark);

function syncStripExtras() {
  if (typeof stripCore !== 'undefined' && stripCore) {
    stripCore.position.copy(strip.position);
    stripCore.visible = strip.visible;
  }
  if (stripGlow) {
    stripGlow.position.copy(strip.position);
    stripGlow.visible = strip.visible;
    stripGlow.material.opacity = strip.visible ? mix(0.12, 0.28, clamp(strip.material.emissiveIntensity / 6)) : 0;
  }
  if (stripHalo) {
    stripHalo.position.copy(strip.position);
    stripHalo.visible = strip.visible;
    stripHalo.material.opacity = strip.visible ? mix(0.04, 0.10, clamp(strip.material.emissiveIntensity / 6)) : 0;
  }
}

/* ---- Volumetric light shaft + ~200 slow dust motes in the beam ---- */
let shaft, dust;
function buildAtmosphere() {
  /* Upper-third soft beam only — must NOT read as a dark capsule over the headline */
  const shaftGeo = new THREE.CylinderGeometry(0.04, 1.1, 7, 20, 1, true);
  shaft = new THREE.Mesh(
    shaftGeo,
    new THREE.MeshBasicMaterial({
      color: 0xfff0dc, transparent: true, opacity: 0.022,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    })
  );
  shaft.position.set(-1.4, 8.2, -7.5);
  shaft.rotation.z = 0.22;
  shaft.rotation.x = 0.08;
  scene.add(shaft);
  shaft.visible = false; /* R5: shaft cut — reads as dark capsule */

  const COUNT = 200;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT * 3);
  /* Concentrate motes inside the conical beam volume */
  for (let i = 0; i < COUNT; i++) {
    const t = Math.random();
    const y = 1.8 + t * 9.5;
    const rad = mix(0.2, 2.1, t) * (0.25 + Math.random() * 0.75);
    const ang = Math.random() * Math.PI * 2;
    pos[i * 3] = -0.6 + Math.cos(ang) * rad + (Math.random() - 0.5) * 0.3;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = -5.5 + Math.sin(ang) * rad * 0.6 + (Math.random() - 0.5) * 2.5;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dust = new THREE.Points(
    g,
    new THREE.PointsMaterial({
      color: 0xfff2e4, size: 0.028, transparent: true, opacity: 0.42,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
    })
  );
  scene.add(dust);
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), HQ ? 0.34 : 0.22, 0.5, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ---------- Soft MeshReflectorMaterial-like floor ---------- */
const FLOOR_SIZE = 36;
const TILE = TOUCH ? 4 : 5;
let floorMat, floorMesh, mirror, uProgress = { value: 0 };
let blurTargets = null, blurPass = null;

const SoftBlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    direction: { value: new THREE.Vector2(1, 0) },
    resolution: { value: new THREE.Vector2(400, 100) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 direction;
    uniform vec2 resolution;
    varying vec2 vUv;
    void main(){
      vec2 px = direction / resolution;
      vec4 c = texture2D(tDiffuse, vUv) * 0.227027;
      c += texture2D(tDiffuse, vUv + px*1.384615) * 0.316216;
      c += texture2D(tDiffuse, vUv - px*1.384615) * 0.316216;
      c += texture2D(tDiffuse, vUv + px*3.230769) * 0.070270;
      c += texture2D(tDiffuse, vUv - px*3.230769) * 0.070270;
      gl_FragColor = c;
    }`,
};

async function buildFloor() {
  const base = FLOOR_BASE;
  const [a0, a1, a2, a3, r0, r1, r2, r3, n0, n1, n2, n3, mask, logoTex, hGlow] = await Promise.all([
    loadTex(base + 'stage0_albedo.webp', { colorSpace: THREE.SRGBColorSpace, repeat: TILE }),
    loadTex(base + 'stage1_albedo.webp', { colorSpace: THREE.SRGBColorSpace, repeat: TILE }),
    loadTex(base + 'stage2_albedo.webp', { colorSpace: THREE.SRGBColorSpace, repeat: TILE }),
    loadTex(base + 'stage3_albedo.webp', { colorSpace: THREE.SRGBColorSpace, repeat: TILE }),
    loadTex(base + 'stage0_roughness.webp', { repeat: TILE }),
    loadTex(base + 'stage1_roughness.webp', { repeat: TILE }),
    loadTex(base + 'stage2_roughness.webp', { repeat: TILE }),
    loadTex(base + 'stage3_roughness.webp', { repeat: TILE }),
    loadTex(base + 'stage0_normal.webp', { repeat: TILE }),
    loadTex(base + 'stage1_normal.webp', { repeat: TILE }),
    loadTex(base + 'stage2_normal.webp', { repeat: TILE }),
    loadTex(base + 'stage3_normal.webp', { repeat: TILE }),
    loadTex(base + 'wipe_mask.webp', { repeat: 1 }),
    loadTex('assets/env/logo_mark.png', { colorSpace: THREE.SRGBColorSpace, clamp: true }),
    loadTex('assets/env/horizon_glow.webp', { colorSpace: THREE.SRGBColorSpace, clamp: true }),
  ]);
  logoMark.material.map = logoTex;
  logoMark.material.needsUpdate = true;
  horizonGlow.material.map = hGlow;
  horizonGlow.material.needsUpdate = true;

  floorMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: a0, roughnessMap: r0, normalMap: n0,
    metalness: 0.06, roughness: 0.82, clearcoat: 0.04, clearcoatRoughness: 0.45,
    envMapIntensity: 0.65, normalScale: new THREE.Vector2(0.75, 0.75),
  });

  const wipeUniform = {
    uMap0: { value: a0 }, uMap1: { value: a1 }, uMap2: { value: a2 }, uMap3: { value: a3 },
    uRough0: { value: r0 }, uRough1: { value: r1 }, uRough2: { value: r2 }, uRough3: { value: r3 },
    uMask: { value: mask }, uProgress, uDarken: { value: 0.92 }, uAlbedoMix: { value: 1.0 },
  };

  floorMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, wipeUniform);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uMap0,uMap1,uMap2,uMap3;
        uniform sampler2D uRough0,uRough1,uRough2,uRough3;
        uniform sampler2D uMask;
        uniform float uProgress;
        uniform float uDarken;
        uniform float uAlbedoMix;
        /* Equal 25% scroll per wipe stage */
        vec3 blendStage(float p, vec2 uv){
          float m = texture2D(uMask, uv * 0.35).r;
          float edge = clamp((p * 1.15 - (uv.x * 0.55 + (1.0-uv.y) * 0.45) + (m-0.5)*0.18), 0.0, 1.0);
          float soft = smoothstep(0.0, 0.12, edge) * (1.0 - smoothstep(0.88, 1.0, edge));
          float s01 = smoothstep(0.00, 0.25, p);
          float s12 = smoothstep(0.25, 0.50, p);
          float s23 = smoothstep(0.50, 0.75, p);
          vec3 c0 = texture2D(uMap0, uv).rgb * uDarken;
          vec3 c1 = texture2D(uMap1, uv).rgb;
          vec3 c2 = texture2D(uMap2, uv).rgb;
          /* Stage 4 charcoal: lower albedo influence so mirror streak reads */
          vec3 c3 = texture2D(uMap3, uv).rgb * mix(0.22, 0.55, uAlbedoMix);
          vec3 col = mix(c0, c1, s01);
          col = mix(col, c2, s12);
          col = mix(col, c3, s23);
          col += vec3(0.75, 0.12, 0.22) * soft * 0.28;
          return col;
        }
        float blendRough(float p, vec2 uv){
          float s01 = smoothstep(0.00, 0.25, p);
          float s12 = smoothstep(0.25, 0.50, p);
          float s23 = smoothstep(0.50, 0.75, p);
          float r = mix(texture2D(uRough0, uv).r, texture2D(uRough1, uv).r, s01);
          r = mix(r, texture2D(uRough2, uv).r, s12);
          r = mix(r, texture2D(uRough3, uv).r, s23);
          return r;
        }`)
      .replace('#include <map_fragment>', `diffuseColor.rgb = blendStage(uProgress, vMapUv);`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = blendRough(uProgress, vMapUv);`);
    floorMat.userData.shader = shader;
  };
  floorMat.defines = { ...(floorMat.defines || {}), USE_UV: '' };
  floorMat.needsUpdate = true;

  const geo = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
  floorMesh = new THREE.Mesh(geo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(0, 0, -FLOOR_SIZE * 0.22);
  scene.add(floorMesh);

  const mirrorRes = HQ ? 1024 : 512;
  const mirrorShader = {
    name: 'AvantiSoftReflector',
    uniforms: {
      color: { value: null },
      tDiffuse: { value: null },
      tBlur: { value: null },
      textureMatrix: { value: null },
      uOpacity: { value: 0 },
      uMixStrength: { value: 3.4 },
      uMixBlur: { value: 0.25 },
      uMirror: { value: 0.92 },
      uDepthScale: { value: 1.0 },
      uMinDepth: { value: 0.35 },
      uCamPos: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */`
      uniform mat4 textureMatrix;
      varying vec4 vUv;
      varying vec3 vWorldPos;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vUv = textureMatrix * vec4( position, 1.0 );
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      uniform sampler2D tDiffuse;
      uniform sampler2D tBlur;
      uniform float uOpacity;
      uniform float uMixStrength;
      uniform float uMixBlur;
      uniform float uMirror;
      uniform float uDepthScale;
      uniform float uMinDepth;
      uniform vec3 uCamPos;
      varying vec4 vUv;
      varying vec3 vWorldPos;
      #include <logdepthbuf_pars_fragment>
      float blendOverlay( float base, float blend ) {
        return ( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );
      }
      vec3 blendOverlay( vec3 base, vec3 blend ) {
        return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec4 sharp = texture2DProj( tDiffuse, vUv );
        vec4 soft = texture2DProj( tBlur, vUv );
        vec3 refl = mix( sharp.rgb, soft.rgb, clamp(uMixBlur, 0.0, 1.0) );
        refl = mix( refl, blendOverlay( refl, color ), 0.18 );
        refl *= uMixStrength;
        float dist = length( vWorldPos - uCamPos );
        float depthFade = smoothstep( uMinDepth, uMinDepth + 16.0 * uDepthScale, dist );
        float fade = mix( 1.0, 0.12, depthFade );
        float alpha = uOpacity * uMirror * fade;
        gl_FragColor = vec4( refl, alpha );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };

  mirror = new Reflector(new THREE.PlaneGeometry(FLOOR_SIZE * 0.9, FLOOR_SIZE * 0.9), {
    clipBias: 0.003,
    textureWidth: mirrorRes,
    textureHeight: mirrorRes,
    color: 0xb8c0cc,
    shader: mirrorShader,
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.set(0, 0.014, -FLOOR_SIZE * 0.22);
  mirror.material.transparent = true;
  mirror.material.depthWrite = false;
  mirror.material.uniforms.uOpacity.value = 0;
  mirror.material.uniforms.uMixStrength.value = 3.4;
  mirror.material.uniforms.uMixBlur.value = 0.25;
  mirror.material.uniforms.uMirror.value = 0.92;
  mirror.material.uniforms.uDepthScale.value = 1.0;
  mirror.material.uniforms.uMinDepth.value = 0.35;
  /* Reflector virtual camera: do NOT see drop layer */
  if (mirror.camera) {
    mirror.camera.layers.disable(DROP_LAYER);
    mirror.camera.layers.disable(GLOW_LAYER);
  }
  scene.add(mirror);

  const blurW = HQ ? 400 : 256;
  const blurH = HQ ? 100 : 64;
  blurTargets = {
    a: new THREE.WebGLRenderTarget(blurW, blurH, { type: THREE.HalfFloatType }),
    b: new THREE.WebGLRenderTarget(blurW, blurH, { type: THREE.HalfFloatType }),
  };
  blurPass = {
    scene: new THREE.Scene(),
    cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    mat: new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SoftBlurShader.uniforms),
      vertexShader: SoftBlurShader.vertexShader,
      fragmentShader: SoftBlurShader.fragmentShader,
    }),
  };
  blurPass.mat.uniforms.resolution.value.set(blurW, blurH);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurPass.mat);
  blurPass.scene.add(quad);
  mirror.material.uniforms.tBlur.value = blurTargets.b.texture;
}

function blurReflection() {
  if (!mirror || !blurTargets || !blurPass) return;
  const src = mirror.getRenderTarget().texture;
  const { a, b } = blurTargets;
  const m = blurPass.mat;
  m.uniforms.tDiffuse.value = src;
  m.uniforms.direction.value.set(1, 0);
  renderer.setRenderTarget(a);
  renderer.clear();
  renderer.render(blurPass.scene, blurPass.cam);
  m.uniforms.tDiffuse.value = a.texture;
  m.uniforms.direction.value.set(0, 1);
  renderer.setRenderTarget(b);
  renderer.clear();
  renderer.render(blurPass.scene, blurPass.cam);
  renderer.setRenderTarget(null);
  mirror.material.uniforms.tBlur.value = b.texture;
}

async function buildEnv() {
  try {
    const tex = await loadTex('assets/env/studio_strip.jpg', { colorSpace: THREE.SRGBColorSpace });
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();
  } catch (_) {}
}

/* ---------- Small glossy ruby drop (matcap, no transmission) OR cut ---------- */
let dropGroup, dropMesh, ringMesh, crownParts = [], splashArmed = false, dropAlive = false;

function makeTeardropGeo() {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const y = mix(0.55, -0.32, t);
    const tip = Math.pow(Math.max(0, 1 - t / 0.4), 1.4);
    const bulb = Math.sin(Math.pow(clamp(t, 0, 1), 0.92) * Math.PI);
    let r = 0.015 + tip * 0.05 + bulb * 0.22;
    if (t < 0.035) r *= t / 0.035;
    pts.push(new THREE.Vector2(Math.max(r, 0.002), y));
  }
  return new THREE.LatheGeometry(pts, 72);
}

/** World height ≈ 8% of viewport at drop depth */
function dropWorldScale() {
  const dist = Math.abs(CAM.z - 1.55);
  const viewH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * dist;
  const targetH = viewH * 0.055;
  const geoH = 0.87; /* lathe span */
  return targetH / geoH;
}

async function buildDroplet() {
  if (!USE_DROP) return;
  let matcap;
  try {
    matcap = await loadTex('assets/env/ruby_matcap.png', { colorSpace: THREE.SRGBColorSpace, clamp: true });
  } catch (_) {
    return; /* no matcap → cut drop */
  }

  dropGroup = new THREE.Group();
  const sc = dropWorldScale();
  dropGroup.scale.setScalar(sc);
  /* Right third of frame, beside type */
  dropGroup.position.set(TOUCH ? 0.62 : 1.05, TOUCH ? 0.95 : 1.05, TOUCH ? 1.4 : 1.6);
  dropGroup.layers.set(DROP_LAYER);
  scene.add(dropGroup);

  dropMesh = new THREE.Mesh(
    makeTeardropGeo(),
    new THREE.MeshMatcapMaterial({
      color: 0xffffff,
      matcap,
      transparent: true,
      opacity: 1,
      fog: false,
    })
  );
  dropMesh.layers.set(DROP_LAYER);
  dropGroup.add(dropMesh);

  /* Soft emissive core (additive) behind matcap for crimson glow */
  const core = new THREE.Mesh(
    makeTeardropGeo(),
    new THREE.MeshBasicMaterial({
      color: 0xff2a5c, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    })
  );
  core.scale.setScalar(0.92);
  core.layers.set(DROP_LAYER);
  dropGroup.add(core);

  /* Tiny white specular streak billboard */
  const streak = new THREE.Mesh(
    new THREE.PlaneGeometry(0.08, 0.32),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    })
  );
  streak.position.set(-0.05, 0.14, 0.22);
  streak.rotation.z = -0.35;
  streak.layers.set(DROP_LAYER);
  dropGroup.add(streak);

  ringMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.04, 0.07, 48),
    new THREE.MeshBasicMaterial({ color: CRIMSON, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
  );
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.set(dropGroup.position.x, 0.02, dropGroup.position.z);
  ringMesh.layers.set(DROP_LAYER);
  scene.add(ringMesh);

  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + (i % 2) * 0.1;
    const d = new THREE.Mesh(
      makeTeardropGeo(),
      new THREE.MeshMatcapMaterial({ color: 0xffffff, matcap, transparent: true, opacity: 0, fog: false })
    );
    d.scale.setScalar(0.1 + (i % 3) * 0.03);
    d.userData = { ang, phase: i / 8 };
    d.position.copy(ringMesh.position);
    d.rotation.z = Math.PI;
    d.layers.set(DROP_LAYER);
    scene.add(d);
    crownParts.push(d);
  }
  dropAlive = true;
}

function triggerSplash() {
  if (!dropAlive || splashArmed || CALM) return;
  splashArmed = true;
  const z = dropGroup.position.z;
  const x = dropGroup.position.x;
  const state = { t: 0 };
  gsap.to(state, {
    t: 1, duration: 0.42, ease: 'power2.out',
    onUpdate: () => {
      const t = state.t;
      ringMesh.material.opacity = Math.sin(t * Math.PI) * 0.9;
      const rs = mix(0.12, 1.6, t);
      ringMesh.scale.set(rs, rs, 1);
      ringMesh.position.set(x, 0.02, z);
      crownParts.forEach((d, i) => {
        const a = d.userData.ang;
        const delay = d.userData.phase * 0.12;
        const lt = clamp((t - delay) / 0.85);
        const lift = Math.sin(lt * Math.PI) * mix(0.12, 0.35, (i % 3) / 2);
        const rad = lt * mix(0.18, 0.55, (i % 5) / 4);
        d.position.set(x + Math.cos(a) * rad, 0.04 + lift, z + Math.sin(a) * rad * 0.85);
        d.material.opacity = Math.sin(lt * Math.PI) * 0.9;
      });
    },
    onComplete: () => {
      ringMesh.material.opacity = 0;
      crownParts.forEach((d) => { d.material.opacity = 0; });
    },
  });
}

function killDrop() {
  dropAlive = false;
  if (dropGroup) dropGroup.visible = false;
  if (ringMesh) ringMesh.visible = false;
  crownParts.forEach((d) => { d.visible = false; });
}

/* ---------- Scroll ---------- */
let lenis, finishProg = 0, clientsIn = false, heroBeatDone = false;
window.__AVANTI_LENIS = null;

function setupScroll() {
  lenis = new Lenis({ lerp: CALM ? 1 : 0.09, smoothWheel: !CALM });
  window.__AVANTI_LENIS = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  window.__AVANTI_SCROLL_TO = (sel) => new Promise((resolve) => {
    const el = document.querySelector(sel);
    if (!el) { resolve(false); return; }
    const y = el.offsetTop;
    lenis.scrollTo(y, {
      offset: 0,
      immediate: false,
      duration: CALM ? 0.01 : 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      onComplete: () => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
      },
    });
  });
  window.__AVANTI_SCROLL_Y = (y) => new Promise((resolve) => {
    lenis.scrollTo(y, {
      duration: CALM ? 0.01 : 0.9,
      onComplete: () => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))),
    });
  });
  window.__AVANTI_FINISH = (p) => new Promise((resolve) => {
    const el = document.querySelector('#finish');
    const top = el.offsetTop;
    const h = el.offsetHeight - window.innerHeight;
    const y = top + clamp(p) * h;
    lenis.scrollTo(y, {
      duration: 0.7,
      onComplete: () => {
        ScrollTrigger.update();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
      },
    });
  });

  /* 600ms ease on wipe scrub */
  ScrollTrigger.create({
    trigger: '#finish',
    start: 'top top',
    end: 'bottom bottom',
    scrub: CALM ? 0 : 0.6,
    onUpdate: (self) => {
      finishProg = self.progress;
      uProgress.value = finishProg;
      /* Equal 25% per stage */
      const idx = Math.min(3, Math.floor(finishProg * 3.999));
      const st = STAGES[idx];
      $('#hNum').textContent = st.num;
      $('#hLabel').textContent = st.label;
      $('#capK').textContent = `${st.num} · ${st.label}`;
      $('#capTitle').textContent = st.title;

      if (floorMat) {
        floorMat.clearcoat = mix(0.04, 1.0, sstep(0.5, 0.9, finishProg));
        floorMat.clearcoatRoughness = mix(0.42, 0.03, sstep(0.5, 0.95, finishProg));
        floorMat.roughness = mix(0.82, 0.04, sstep(0.45, 0.95, finishProg));
        floorMat.metalness = mix(0.05, 0.28, sstep(0.55, 1, finishProg));
        floorMat.envMapIntensity = mix(0.5, 2.8, sstep(0.4, 1, finishProg));
        if (floorMat.userData.shader) {
          floorMat.userData.shader.uniforms.uDarken.value = mix(0.92, 1.0, sstep(0.1, 0.4, finishProg));
          /* Lower albedo influence at gloss stage so mirror streak dominates */
          floorMat.userData.shader.uniforms.uAlbedoMix.value = mix(1.0, 0.28, sstep(0.7, 1.0, finishProg));
        }
      }

      if (mirror) {
        const m = sstep(0.55, 0.88, finishProg);
        mirror.material.uniforms.uOpacity.value = m * 0.92;
        mirror.material.uniforms.uMixStrength.value = mix(2.8, 5.2, m);
        mirror.material.uniforms.uMirror.value = mix(0.7, 1.0, m);
        /* Crisp streak at gloss — zero blur */
        mirror.material.uniforms.uMixBlur.value = mix(0.28, 0.0, m);
        mirror.visible = m > 0.02 && !clientsIn;
      }

      const markIn = sstep(0.0, 0.12, finishProg) * (clientsIn ? 0 : 1);
      logoMark.visible = markIn > 0.01 && finishProg > 0.08;
      logoMark.material.opacity = markIn * mix(0.4, 0.75, sstep(0.3, 1, finishProg));
      /* R6: always park the bar at home during finish — never leave sweep coords */
      if (heroBeatDone || finishProg > 0.01) {
        /* Descend from hero height into money-shot home above the charcoal */
        strip.position.set(
          0,
          mix(2.15, 1.42, sstep(0.05, 0.85, finishProg)),
          mix(-5.5, -4.2, sstep(0.05, 0.7, finishProg))
        );
      }
      strip.visible = markIn > 0.01 && !clientsIn;
      strip.material.opacity = 1;
      strip.material.emissiveIntensity = mix(2.8, 5.2, sstep(0.15, 1, finishProg)) * Math.max(markIn, 0.25);
      syncStripExtras();

      /* Money-shot floor streak toward camera — ramps hard at gloss */
      if (floorStreak) {
        const g = sstep(0.62, 0.92, finishProg) * (clientsIn ? 0 : 1);
        floorStreak.visible = g > 0.02;
        floorStreak.material.opacity = g * 1.15;
        floorStreak.scale.set(mix(0.9, 1.6, g), 1, 1);
        if (typeof floorStreakSoft !== 'undefined' && floorStreakSoft) {
          floorStreakSoft.visible = g > 0.02;
          floorStreakSoft.material.opacity = g * 0.28;
          floorStreakSoft.scale.set(mix(1.0, 1.35, g), 1, 1);
        }
      }

      /* Dim crimson rim at gloss so white bar owns the reflection */
      if (rimBar) rimBar.material.emissiveIntensity = mix(1.6, 0.55, sstep(0.65, 1, finishProg));
      if (rimBarSoft) rimBarSoft.material.opacity = mix(0.07, 0.035, sstep(0.65, 1, finishProg));

      camera.position.y = mix(CAM.y, 0.24, finishProg);
      camera.position.z = mix(CAM.z, 2.4, finishProg);
      camera.lookAt(0, mix(CAM.lookY, 0.04, finishProg), mix(CAM.lookZ, -16, finishProg));
      horizonGlow.material.opacity = mix(0.28, 0.4, finishProg);
      if (shaft) shaft.material.opacity = mix(0.014, 0.035, finishProg);
      renderer.toneMappingExposure = mix(1.02, 1.08, sstep(0.7, 1, finishProg));
    },
    onEnter: () => $('#hud').classList.add('on'),
    onLeave: () => $('#hud').classList.remove('on'),
    onEnterBack: () => $('#hud').classList.add('on'),
    onLeaveBack: () => $('#hud').classList.remove('on'),
  });

  ScrollTrigger.create({
    trigger: '.hero',
    start: 'top top',
    end: 'bottom top',
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      if (dropAlive && dropMesh) {
        const fall = sstep(0, 0.5, p);
        dropGroup.position.y = mix(TOUCH ? 0.95 : 1.05, 0.16, fall);
        const impact = sstep(0.52, 0.62, p);
        const fade = sstep(0.58, 0.72, p);
        const base = 1;
        dropMesh.scale.set(
          mix(base, 1.25, impact) * mix(1, 0.05, fade),
          mix(base, 0.55, impact) * mix(1, 0.05, fade),
          mix(base, 1.25, impact) * mix(1, 0.05, fade)
        );
        dropGroup.visible = p < 0.75;
        dropMesh.material.opacity = 1 - fade;
        if (p > 0.55 && p < 0.68 && !splashArmed) triggerSplash();
        if (p < 0.4) splashArmed = false;
      }

      /* Headline fades as we leave hero into finish */
      $('.hero-copy').style.opacity = String(1 - sstep(0.25, 0.95, p) * 0.7);

      /* Scroll-linked bar hold after intro beat (intro owns first 2.5s) */
      if (!dropAlive && heroBeatDone && finishProg < 0.02) {
        const hold = 1 - sstep(0.55, 1.0, p);
        strip.visible = hold > 0.05;
        strip.material.opacity = 1;
        strip.material.emissiveIntensity = mix(2.0, 6.0, hold);
        strip.position.set(0, 2.15, -5.5);
        syncStripExtras();
        if (mirror && hold > 0.1) {
          mirror.visible = true;
          mirror.material.uniforms.uOpacity.value = Math.max(mirror.material.uniforms.uOpacity.value, hold * 0.28);
        }
      }

      if (finishProg < 0.02 && dropAlive) {
        logoMark.visible = false;
        logoMark.material.opacity = 0;
        strip.visible = false;
        syncStripExtras();
      }
    },
  });

  /* CLIENTS: hide light bar / logo so marquee sits on floor */
  ScrollTrigger.create({
    trigger: '#clients',
    start: 'top 85%',
    end: 'bottom top',
    onEnter: () => { clientsIn = true; strip.visible = false; logoMark.visible = false; if (typeof stripCore !== "undefined" && stripCore) stripCore.visible = false; if (stripGlow) stripGlow.visible = false; if (stripHalo) stripHalo.visible = false; if (floorStreak) floorStreak.visible = false;
    if (typeof floorStreakSoft !== "undefined" && floorStreakSoft) floorStreakSoft.visible = false; if (mirror) mirror.visible = false; },
    onEnterBack: () => { clientsIn = true; strip.visible = false; logoMark.visible = false; if (typeof stripCore !== "undefined" && stripCore) stripCore.visible = false; if (stripGlow) stripGlow.visible = false; if (stripHalo) stripHalo.visible = false; if (floorStreak) floorStreak.visible = false;
    if (typeof floorStreakSoft !== "undefined" && floorStreakSoft) floorStreakSoft.visible = false; if (mirror) mirror.visible = false; },
    onLeave: () => { clientsIn = false; },
    onLeaveBack: () => { clientsIn = false; },
  });

  $$('.stagger-grid figure').forEach((fig) => {
    ScrollTrigger.create({
      trigger: fig, start: 'top 90%',
      onEnter: () => fig.classList.add('is-in'),
      onEnterBack: () => fig.classList.add('is-in'),
    });
  });
}

function lazyMedia() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const img = en.target;
      const src = img.getAttribute('data-src');
      if (src) { img.src = src; img.removeAttribute('data-src'); }
      io.unobserve(img);
    });
  }, { rootMargin: '200px' });
  $$('img[data-src]').forEach((img) => io.observe(img));
}

let openId = null;
function fillProduct(id) {
  const p = PRODUCTS[id];
  if (!p) return;
  openId = id;
  $('#pvCat').textContent = p.cat;
  $('#pvTitle').textContent = p.title;
  $('#pvBullets').innerHTML = p.bullets.map((b) => `<li>${b}</li>`).join('');
  const pack = $('#pvPack');
  pack.src = p.img;
  pack.alt = p.title;
  const refl = $('#pvReflect');
  if (refl) { refl.src = p.img; refl.alt = ''; }
}

function openProduct(id, fromEl) {
  const p = PRODUCTS[id];
  if (!p) return;
  fillProduct(id);
  const view = $('#productView');
  view.hidden = false;
  document.body.classList.add('product-open');
  const pack = $('#pvPack');
  const from = fromEl.querySelector('.pack-img') || fromEl;
  const fr = from.getBoundingClientRect();
  pack.style.position = 'fixed';
  pack.style.left = fr.left + 'px';
  pack.style.top = fr.top + 'px';
  pack.style.width = fr.width + 'px';
  pack.style.height = fr.height + 'px';
  pack.style.maxHeight = 'none';
  pack.style.zIndex = '60';
  pack.classList.remove('float');

  requestAnimationFrame(() => {
    const wrap = $('.pv-pack-wrap').getBoundingClientRect();
    const targetH = Math.min(innerHeight * (TOUCH ? 0.72 : 0.6), wrap.height);
    const targetW = targetH * (fr.width / Math.max(fr.height, 1));
    const tx = wrap.left + wrap.width / 2 - targetW / 2;
    const ty = wrap.top + wrap.height / 2 - targetH / 2;
    gsap.to(pack, {
      left: tx, top: ty, width: targetW, height: targetH,
      duration: CALM ? 0.01 : 0.85, ease: 'power3.inOut',
      onComplete: () => {
        pack.style.position = pack.style.left = pack.style.top = pack.style.width = pack.style.height = pack.style.maxHeight = pack.style.zIndex = '';
        pack.classList.add('float');
      },
    });
    view.classList.add('open');
  });
}

function closeProduct() {
  const view = $('#productView');
  const pack = $('#pvPack');
  pack.classList.remove('float');
  const card = $$(`.pack-card[data-id="${openId}"]`)[0];
  if (card && !CALM) {
    const to = (card.querySelector('.pack-img') || card).getBoundingClientRect();
    const fr = pack.getBoundingClientRect();
    pack.style.position = 'fixed';
    pack.style.left = fr.left + 'px'; pack.style.top = fr.top + 'px';
    pack.style.width = fr.width + 'px'; pack.style.height = fr.height + 'px';
    pack.style.maxHeight = 'none'; pack.style.zIndex = '60';
    view.classList.remove('open');
    gsap.to(pack, {
      left: to.left, top: to.top, width: to.width, height: to.height,
      duration: 0.7, ease: 'power3.inOut',
      onComplete: () => {
        pack.style.position = pack.style.left = pack.style.top = pack.style.width = pack.style.height = pack.style.maxHeight = pack.style.zIndex = '';
        view.hidden = true; document.body.classList.remove('product-open'); openId = null;
      },
    });
  } else {
    view.classList.remove('open');
    setTimeout(() => { view.hidden = true; document.body.classList.remove('product-open'); openId = null; }, 400);
  }
}

function navProduct(dir) {
  if (!openId) return;
  const i = PRODUCT_ORDER.indexOf(openId);
  const next = PRODUCT_ORDER[(i + dir + PRODUCT_ORDER.length) % PRODUCT_ORDER.length];
  fillProduct(next);
  const pack = $('#pvPack');
  pack.classList.remove('float');
  void pack.offsetWidth;
  pack.classList.add('float');
}

function wireUI() {
  $$('.pack-card').forEach((btn) => btn.addEventListener('click', () => openProduct(btn.dataset.id, btn)));
  $('#productBack').addEventListener('click', closeProduct);
  $('#pvPrev').addEventListener('click', () => navProduct(-1));
  $('#pvNext').addEventListener('click', () => navProduct(1));
  addEventListener('keydown', (e) => {
    if (!openId) return;
    if (e.key === 'Escape') closeProduct();
    if (e.key === 'ArrowLeft') navProduct(-1);
    if (e.key === 'ArrowRight') navProduct(1);
  });
}

function onResize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  dprCap = HQ ? 1.5 : 1.1;
  renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap));
  renderer.setSize(w, h, false);
  composer.setSize(w, h); bloom.setSize(w, h);
  if (dropAlive && dropGroup) dropGroup.scale.setScalar(dropWorldScale());
}
addEventListener('resize', onResize);

let frames = 0, fpsAcc = 0;
function tick() {
  requestAnimationFrame(tick);
  const dt = clock.getDelta();
  frames++; fpsAcc += dt;
  if (fpsAcc >= 1) { window.__AVANTI_FPS = frames / fpsAcc; frames = 0; fpsAcc = 0; }

  if (strip && strip.visible) {
    const base = finishProg > 0.5 ? 5.2 : 3.8;
    strip.material.emissiveIntensity = mix(base, base + 1.4, 0.5 + 0.5 * Math.sin(clock.elapsedTime * 1.05));
    syncStripExtras();
  }
  if (shaft) {
    shaft.material.opacity = 0.016 + 0.01 * Math.sin(clock.elapsedTime * 0.35);
    shaft.rotation.y = Math.sin(clock.elapsedTime * 0.08) * 0.04;
  }
  if (clientsIn) {
    strip.visible = false;
    logoMark.visible = false;
    if (typeof stripCore !== "undefined" && stripCore) stripCore.visible = false;
    if (stripGlow) stripGlow.visible = false;
    if (stripHalo) stripHalo.visible = false;
    if (floorStreak) floorStreak.visible = false;
    if (typeof floorStreakSoft !== "undefined" && floorStreakSoft) floorStreakSoft.visible = false;
    if (mirror) mirror.visible = false;
    if (typeof rail !== "undefined" && rail) rail.visible = false;
  } else if (typeof rail !== "undefined" && rail) {
    rail.visible = true;
  }
  if (dust) {
    const arr = dust.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] -= dt * (0.025 + (i % 11) * 0.004);
      if (arr[i + 1] < 1.6) arr[i + 1] = 10.8;
      arr[i] += Math.sin(clock.elapsedTime * 0.22 + i * 0.01) * dt * 0.015;
    }
    dust.geometry.attributes.position.needsUpdate = true;
  }
  if (mirror && mirror.visible && mirror.material.uniforms.uOpacity.value > 0.02) {
    mirror.material.uniforms.uCamPos.value.copy(camera.position);
    blurReflection();
  }
  composer.render();
}


/** R6: ~2.5s hero beat — dolly push, bar sweep L→R, floor glint, headline line-by-line */
function playHeroBeat() {
  const lines = $$('.hl-line');
  const kicker = $('.hero-kicker');
  const tag = $('.tagline');
  gsap.set(lines, { opacity: 0, y: 18 });
  if (kicker) gsap.set(kicker, { opacity: 0 });
  if (tag) gsap.set(tag, { opacity: 0 });

  if (CALM) {
    gsap.set(lines, { opacity: 1, y: 0 });
    if (kicker) gsap.set(kicker, { opacity: 1 });
    if (tag) gsap.set(tag, { opacity: 1 });
    strip.visible = true;
    strip.position.set(0, 2.15, -5.5);
    strip.material.emissiveIntensity = 4.5;
    syncStripExtras();
    heroBeatDone = true;
    return;
  }

  camera.position.set(0, CAM.y + 0.06, CAM.z + 0.95);
  camera.lookAt(0, CAM.lookY, CAM.lookZ);
  strip.visible = true;
  strip.position.set(-4.4, 2.35, -5.2);
  strip.material.emissiveIntensity = 0.2;
  strip.material.opacity = 1;
  syncStripExtras();
  if (mirror) {
    mirror.visible = true;
    mirror.material.uniforms.uOpacity.value = 0;
    mirror.material.uniforms.uMixStrength.value = 3.2;
    mirror.material.uniforms.uMixBlur.value = 0.15;
  }
  if (floorStreak) {
    floorStreak.visible = true;
    floorStreak.material.opacity = 0;
  }

  const tl = gsap.timeline({
    defaults: { ease: 'power2.out' },
    onComplete: () => { heroBeatDone = true; },
  });

  /* Dolly push-in over concrete */
  tl.to(camera.position, {
    z: CAM.z, y: CAM.y, duration: 2.5, ease: 'power1.inOut',
    onUpdate: () => camera.lookAt(0, CAM.lookY, CAM.lookZ),
  }, 0);

  /* Bar sweeps left → right into home, blooming on */
  tl.to(strip.position, { x: 0, y: 2.15, z: -5.5, duration: 2.15, ease: 'power2.inOut' }, 0.12);
  tl.to(strip.material, { emissiveIntensity: 7.2, duration: 1.9, ease: 'power2.out',
    onUpdate: syncStripExtras }, 0.12);

  /* Reflection glints across the floor */
  if (mirror) {
    tl.to(mirror.material.uniforms.uOpacity, { value: 0.42, duration: 1.35 }, 0.45);
    tl.to(mirror.material.uniforms.uMixStrength, { value: 4.8, duration: 1.35 }, 0.45);
  }
  if (floorStreak) {
    tl.to(floorStreak.material, { opacity: 0.35, duration: 1.2 }, 0.55);
    tl.to(floorStreak.material, { opacity: 0.12, duration: 0.8 }, 1.8);
  }

  /* Headline reveals line by line */
  if (kicker) tl.to(kicker, { opacity: 1, duration: 0.45 }, 0.05);
  lines.forEach((el, i) => {
    tl.to(el, { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out' }, 0.35 + i * 0.38);
  });
  if (tag) tl.to(tag, { opacity: 1, duration: 0.5 }, 1.35);
}

async function boot() {
  const bar = $('#loadP');
  const set = (t) => { bar.style.transform = `scaleX(${t})`; };
  set(0.1);
  try {
    await buildEnv(); set(0.25);
    await buildFloor(); set(0.65);
    await buildDroplet(); buildAtmosphere(); set(0.9);
    setupScroll(); wireUI(); lazyMedia(); set(1);
    document.documentElement.classList.add('go');
    tick();
    playHeroBeat();
  } catch (err) {
    console.error(err);
    set(1); document.documentElement.classList.add('go');
    setupScroll(); wireUI(); lazyMedia(); tick();
    heroBeatDone = true;
  }
}
boot();
window.__AVANTI_GET_FPS = () => window.__AVANTI_FPS || 0;
window.__AVANTI_KILL_DROP = killDrop;
