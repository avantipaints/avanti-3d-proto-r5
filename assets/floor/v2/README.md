# Floor wipe PBR — v2 (high contrast)

1024×1024 seamless set for the scroll-wipe effect. Does **not** replace the
originals in the parent folder.

| Stage | Look | Target base | Roughness | Normal |
|------:|------|-------------|-----------|--------|
| 0 | Raw concrete | `#9c9890` | ~0.95 | strong |
| 1 | Wet amber primer | `#5a5348` | ~0.55 | weak |
| 2 | Opaque slate base | `#4a4e55` family (deepened for ΔL*) | ~0.30 | very weak |
| 3 | Mirror topcoat | `#1c1d21` | 0.02–0.04 | almost flat |

Normals are OpenGL (+Y / green up). Albedos also shipped as `.webp`.
Regenerate with `../gen_floor_v2.py`.
