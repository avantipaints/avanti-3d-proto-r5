# Floor finish wipe — PBR texture sets

Procedural, seamless (tileable) textures for a web 3D floor-finish wipe effect.
Albedo maps are 2048×2048 JPEG (sRGB). Roughness and normals are 2048×2048 PNG.
`wipe_mask_noise.png` is 1024×1024 grayscale fBm for feathered wipe edges.

## Files

| File | Description |
|------|-------------|
| `stage0_albedo.jpg` | Raw concrete albedo (sRGB) |
| `stage0_roughness.png` | Raw concrete roughness (linear grayscale) |
| `stage0_normal.png` | Raw concrete normal (OpenGL, +Y up) |
| `stage1_albedo.jpg` | Primer albedo |
| `stage1_roughness.png` | Primer roughness |
| `stage1_normal.png` | Primer normal |
| `stage2_albedo.jpg` | Base coat albedo |
| `stage2_roughness.png` | Base coat roughness |
| `stage2_normal.png` | Base coat normal |
| `stage3_albedo.jpg` | Mirror gloss topcoat albedo |
| `stage3_roughness.png` | Mirror gloss roughness |
| `stage3_normal.png` | Mirror gloss normal |
| `wipe_mask_noise.png` | 1024 tileable fBm wipe-edge mask |
| `preview.png` | Contact sheet of the four albedos |
| `README.md` | This file |

## Stages & roughness ranges

| Stage | Look | Base color | Roughness |
|-------|------|------------|-----------|
| 0 | Raw concrete — mottled grey, pores, aggregate, trowel swirl | `#8a8a86` | **0.90 – 0.98** |
| 1 | Primer — wet-sealed darker grey, pores mostly filled | `#6f6f6c` | **0.65 – 0.75** |
| 2 | Base coat — opaque charcoal, slight roller texture | `#3a3b3f` | **0.30 – 0.40** |
| 3 | Mirror gloss topcoat — deep charcoal, nearly uniform | `#2a2b2f` | **0.02 – 0.05** |

Normals: stage0 strong (pores/pits) → stage1 weak → stage2 very weak → stage3 almost flat (subtle low-frequency undulation).

## Suggested Three.js `MeshPhysicalMaterial` values

```js
// Shared maps; swap map / roughnessMap / normalMap per wipe stage
const common = {
  metalness: 0.0,
  envMapIntensity: 1.0,
  normalScale: new THREE.Vector2(1, 1), // dial down for later stages if needed
};

// stage0 — raw concrete
{ ...common, roughness: 0.94, clearcoat: 0, clearcoatRoughness: 0 }

// stage1 — primer
{ ...common, roughness: 0.70, clearcoat: 0, clearcoatRoughness: 0 }

// stage2 — base coat
{ ...common, roughness: 0.35, clearcoat: 0.15, clearcoatRoughness: 0.25 }

// stage3 — mirror gloss topcoat
{
  ...common,
  roughness: 0.03,
  clearcoat: 1.0,
  clearcoatRoughness: 0.02,
  reflectivity: 0.5,
}
```

Use `wipe_mask_noise.png` as a greyscale mask (or displacement into a wipe UV) to feather the transition between consecutive stage materials.

Normals are OpenGL convention (green/+Y up). If your engine expects DirectX normals, invert the G channel.
