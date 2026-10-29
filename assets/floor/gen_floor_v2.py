#!/usr/bin/env python3
"""Generate high-contrast floor PBR wipe stages (v2) — 1024 tileable."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent / "v2"
SIZE = 1024
RNG = np.random.default_rng(20261029)


# ── colour / colourspace helpers ─────────────────────────────────────────────

def hex_rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float64)


def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    c = np.clip(c / 255.0, 0, 1)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * (c ** (1 / 2.4)) - 0.055)


def luminance_Lstar(rgb_u8: np.ndarray) -> float:
    lin = srgb_to_linear(rgb_u8.astype(np.float64))
    Y = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
    f = np.where(Y > 0.008856, Y ** (1 / 3), 7.787 * Y + 16 / 116)
    return float((116 * f - 16).mean())


def shift_mean_L(rgb: np.ndarray, target_L: float, tol: float = 0.15) -> np.ndarray:
    """Iteratively scale RGB (preserving hue ratios in linear) toward target mean L*."""
    out = rgb.astype(np.float64).copy()
    for _ in range(24):
        cur = luminance_Lstar(out)
        if abs(cur - target_L) < tol:
            break
        # approximate: L* roughly tracks Y^(1/3); nudge linear Y
        factor = (target_L / max(cur, 1e-3)) ** 1.8
        factor = float(np.clip(factor, 0.85, 1.18))
        lin = srgb_to_linear(out)
        lin = np.clip(lin * factor, 0, 1)
        out = linear_to_srgb(lin) * 255.0
    return np.clip(out, 0, 255)


# ── tileable noise ───────────────────────────────────────────────────────────

def _fade(t: np.ndarray) -> np.ndarray:
    return t * t * t * (t * (t * 6 - 15) + 10)


def value_noise_2d(size: int, period: int, rng: np.random.Generator) -> np.ndarray:
    """Tileable value noise. `period` = number of cells across the texture."""
    period = max(1, int(period))
    grid = rng.random((period, period))
    # wrap by repeating first row/col
    grid = np.pad(grid, ((0, 1), (0, 1)), mode="wrap")

    ys = np.linspace(0, period, size, endpoint=False)
    xs = np.linspace(0, period, size, endpoint=False)
    yi = np.floor(ys).astype(int)
    xi = np.floor(xs).astype(int)
    yf = ys - yi
    xf = xs - xi
    yf2 = _fade(yf)[:, None]
    xf2 = _fade(xf)[None, :]

    yi = yi % period
    xi = xi % period
    y0, y1 = yi, (yi + 1) % (period + 1)  # pad size period+1 but values wrapped
    # rebuild with proper wrap indices into period grid
    g = rng.random((period, period))
    # reseed-stable: use first grid without extra pad logic
    g = grid[:period, :period]

    def sample(yy, xx):
        return g[yy % period][:, xx % period]

    # mesh
    YY, XX = np.meshgrid(yi, xi, indexing="ij")
    YYp = (YY + 1) % period
    XXp = (XX + 1) % period
    yf2 = _fade(yf)[:, None]
    xf2 = _fade(xf)[None, :]

    n00 = g[YY % period, XX % period]
    n10 = g[YYp, XX % period]
    n01 = g[YY % period, XXp]
    n11 = g[YYp, XXp]
    nx0 = n00 * (1 - xf2) + n01 * xf2
    nx1 = n10 * (1 - xf2) + n11 * xf2
    return nx0 * (1 - yf2) + nx1 * yf2


def fbm(size: int, periods: list[int], amps: list[float] | None = None, rng=RNG) -> np.ndarray:
    if amps is None:
        amps = [0.5 ** i for i in range(len(periods))]
    total = np.zeros((size, size), dtype=np.float64)
    wsum = 0.0
    for p, a in zip(periods, amps):
        # independent RNG stream per octave via spawned seed
        sub = np.random.default_rng(rng.integers(0, 2**31 - 1))
        total += a * value_noise_2d(size, p, sub)
        wsum += a
    return total / wsum


def warp_coords(size: int, strength: float, period: int, rng=RNG):
    """Return warped (Y, X) float grids in [0, size)."""
    base_y = np.linspace(0, size, size, endpoint=False)[:, None]
    base_x = np.linspace(0, size, size, endpoint=False)[None, :]
    wy = (fbm(size, [period, period * 2], rng=rng) - 0.5) * strength
    wx = (fbm(size, [period, period * 2], rng=rng) - 0.5) * strength
    return (base_y + wy) % size, (base_x + wx) % size


def sample_img(img: np.ndarray, yy: np.ndarray, xx: np.ndarray) -> np.ndarray:
    """Bilinear sample with wrap. img HxW or HxWxC, yy/xx in pixel coords."""
    h, w = img.shape[:2]
    y0 = np.floor(yy).astype(int) % h
    x0 = np.floor(xx).astype(int) % w
    y1 = (y0 + 1) % h
    x1 = (x0 + 1) % w
    fy = (yy - np.floor(yy))[..., None] if img.ndim == 3 else (yy - np.floor(yy))
    fx = (xx - np.floor(xx))[..., None] if img.ndim == 3 else (xx - np.floor(xx))
    if img.ndim == 2:
        v00 = img[y0, x0]
        v01 = img[y0, x1]
        v10 = img[y1, x0]
        v11 = img[y1, x1]
        return v00 * (1 - fy) * (1 - fx) + v01 * (1 - fy) * fx + v10 * fy * (1 - fx) + v11 * fy * fx
    v00 = img[y0, x0]
    v01 = img[y0, x1]
    v10 = img[y1, x0]
    v11 = img[y1, x1]
    fy3 = yy - np.floor(yy)
    fx3 = xx - np.floor(xx)
    return (
        v00 * (1 - fy3)[..., None] * (1 - fx3)[..., None]
        + v01 * (1 - fy3)[..., None] * fx3[..., None]
        + v10 * fy3[..., None] * (1 - fx3)[..., None]
        + v11 * fy3[..., None] * fx3[..., None]
    )


# ── height → OpenGL normal ───────────────────────────────────────────────────

def height_to_normal(height: np.ndarray, strength: float = 1.0) -> np.ndarray:
    """OpenGL normal map (+Y up / green up). height in arbitrary units."""
    # wrap-around sobel
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5
    nx = -dx * strength
    ny = -dy * strength  # OpenGL: +Y up in texture space → green stores up
    nz = np.ones_like(height)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx * inv, ny * inv, nz * inv
    rgb = np.stack([(nx + 1) * 0.5, (ny + 1) * 0.5, (nz + 1) * 0.5], axis=-1)
    return np.clip(rgb * 255.0, 0, 255).astype(np.uint8)


# ── feature layers ───────────────────────────────────────────────────────────

def make_pores(size: int, density: float = 0.012, rng=RNG) -> np.ndarray:
    """Sparse dark pores / pits. Returns 0..1 darkening mask (1 = pore)."""
    n = int(size * size * density)
    yy = rng.integers(0, size, n)
    xx = rng.integers(0, size, n)
    radii = rng.uniform(0.6, 3.5, n)
    depths = rng.uniform(0.4, 1.0, n)
    field = np.zeros((size, size), dtype=np.float64)
    yy_g, xx_g = np.ogrid[:size, :size]
    # paint in batches of local stamps for speed
    for y, x, r, d in zip(yy, xx, radii, depths):
        r_i = int(math.ceil(r + 1))
        y0, y1 = y - r_i, y + r_i + 1
        x0, x1 = x - r_i, x + r_i + 1
        # wrap slices manually
        for oy in range(y0, y1):
            for ox in range(x0, x1):
                dy = oy - y
                dx = ox - x
                dist = math.hypot(dy, dx)
                if dist <= r:
                    v = d * (1 - dist / r) ** 1.4
                    field[oy % size, ox % size] = max(field[oy % size, ox % size], v)
    return np.clip(field, 0, 1)


def make_pores_fast(size: int, density: float = 0.014, rng=RNG) -> np.ndarray:
    """Vectorized-ish pore stamp using thresholded noise + distance falloff."""
    # sparse binary seeds
    seeds = rng.random((size, size)) < density
    # distance-ish via blur of seeds (tileable box blur approx with roll)
    field = seeds.astype(np.float64)
    for r in (1, 2, 3):
        acc = field.copy()
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if dy == 0 and dx == 0:
                    continue
                dist = math.hypot(dy, dx)
                if dist <= r + 0.1:
                    w = (1 - dist / (r + 0.1)) ** 1.5
                    acc = np.maximum(acc, np.roll(np.roll(seeds.astype(np.float64), dy, 0), dx, 1) * w)
        field = np.maximum(field, acc)
    # vary depth
    depth = 0.45 + 0.55 * fbm(size, [64, 128, 256], rng=rng)
    return np.clip(field * depth, 0, 1)


def make_aggregate(size: int, density: float = 0.008, rng=RNG) -> tuple[np.ndarray, np.ndarray]:
    """Bright/dark speck mask and tint (-1 dark .. +1 bright)."""
    seeds = rng.random((size, size))
    mask = (seeds < density).astype(np.float64)
    # tiny dilation
    for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (-1, -1)):
        mask = np.maximum(mask, np.roll(np.roll((seeds < density * 0.35).astype(np.float64), dy, 0), dx, 1) * 0.7)
    tint = (rng.random((size, size)) * 2 - 1) * mask
    return mask, tint


def make_trowel_arcs(size: int, rng=RNG) -> np.ndarray:
    """Low-frequency swirling trowel marks, tileable via angular fbm warp."""
    # several overlapping oriented bands
    yy = np.linspace(0, 2 * np.pi, size, endpoint=False)[:, None]
    xx = np.linspace(0, 2 * np.pi, size, endpoint=False)[None, :]
    # domain warp
    w1 = fbm(size, [3, 6, 12], rng=rng)
    w2 = fbm(size, [4, 8, 16], rng=rng)
    a = np.sin(2 * xx + 1.3 * yy + 3.0 * (w1 - 0.5) + 0.8 * np.sin(yy * 3 + xx))
    b = np.sin(1.7 * yy - 0.9 * xx + 2.5 * (w2 - 0.5))
    c = np.sin(3.1 * (xx * 0.6 + yy * 0.4) + 2.0 * (fbm(size, [5, 10], rng=rng) - 0.5))
    arcs = 0.5 * a + 0.3 * b + 0.2 * c
    return arcs  # roughly -1..1


def make_hairline_cracks(size: int, n_cracks: int = 7, rng=RNG) -> np.ndarray:
    """Sparse polyline cracks, drawn then converted to soft mask. Tileable via wrap draw."""
    img = Image.new("F", (size, size), 0.0)
    draw = ImageDraw.Draw(img)
    for _ in range(n_cracks):
        x = float(rng.uniform(0, size))
        y = float(rng.uniform(0, size))
        length = int(rng.integers(80, 280))
        angle = float(rng.uniform(0, 2 * math.pi))
        pts = [(x, y)]
        for _s in range(length):
            angle += float(rng.normal(0, 0.08))
            step = float(rng.uniform(1.5, 3.0))
            x = (x + math.cos(angle) * step) % size
            y = (y + math.sin(angle) * step) % size
            pts.append((x, y))
        # draw segments; when wrap jumps, skip long segments
        for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
            if abs(x1 - x0) > size * 0.25 or abs(y1 - y0) > size * 0.25:
                continue
            draw.line([(x0, y0), (x1, y1)], fill=1.0, width=1)
    arr = np.array(img, dtype=np.float64)
    # slight thicken
    thick = arr.copy()
    for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
        thick = np.maximum(thick, np.roll(np.roll(arr, dy, 0), dx, 1) * 0.55)
    return np.clip(thick, 0, 1)


def make_roller_laps(size: int, rng=RNG) -> np.ndarray:
    """Subtle vertical-ish roller lap streaks."""
    xx = np.linspace(0, 2 * np.pi * 6, size, endpoint=False)[None, :]
    yy = np.linspace(0, 2 * np.pi * 2, size, endpoint=False)[:, None]
    w = fbm(size, [8, 16, 32], rng=rng)
    streaks = np.sin(xx + 0.35 * yy + 2.5 * (w - 0.5))
    # soft absolute for lap ridges
    return streaks * (0.55 + 0.45 * fbm(size, [12, 24], rng=rng))


def make_orange_peel(size: int, rng=RNG) -> np.ndarray:
    return fbm(size, [64, 128, 256, 512], [1.0, 0.55, 0.3, 0.15], rng=rng)


def make_lowfreq_wave(size: int, rng=RNG) -> np.ndarray:
    yy = np.linspace(0, 2 * np.pi, size, endpoint=False)[:, None]
    xx = np.linspace(0, 2 * np.pi, size, endpoint=False)[None, :]
    w = fbm(size, [2, 4], rng=rng)
    return 0.6 * np.sin(xx + 0.7 * yy + 1.5 * (w - 0.5)) + 0.4 * np.sin(1.3 * yy - 0.5 * xx)


# ── stage builders ───────────────────────────────────────────────────────────

def build_stage0(size: int = SIZE):
    """RAW CONCRETE — light warm grey #9c9890, strong detail."""
    base = hex_rgb("#9c9890")
    mottling = fbm(size, [4, 8, 16, 32, 64, 128], [1.0, 0.7, 0.45, 0.3, 0.18, 0.1])
    mottling = (mottling - mottling.mean()) / (mottling.std() + 1e-8)
    arcs = make_trowel_arcs(size)
    pores = make_pores_fast(size, density=0.016)
    agg_mask, agg_tint = make_aggregate(size, density=0.01)
    cracks = make_hairline_cracks(size, n_cracks=8)

    # albedo variation in linear-ish space via sRGB offsets
    # strong mottling ±18, arcs ±8, pores dark, aggregate flecks, cracks
    delta = (
        mottling * 18.0
        + arcs * 8.0
        - pores * 55.0
        + agg_tint * 28.0
        - cracks * 40.0
    )
    # warm bias in dark pores / cool in lights
    rgb = np.empty((size, size, 3), dtype=np.float64)
    rgb[..., 0] = base[0] + delta * 1.02 + arcs * 1.5
    rgb[..., 1] = base[1] + delta * 1.00 + mottling * 1.0
    rgb[..., 2] = base[2] + delta * 0.92 - pores * 5.0
    rgb = np.clip(rgb, 0, 255)
    rgb = shift_mean_L(rgb, 63.0)

    # height: pores deep, aggregate raised, arcs subtle, cracks grooves
    height = (
        mottling * 0.35
        + arcs * 0.25
        - pores * 2.8
        + agg_mask * 0.9
        - cracks * 1.4
        + (fbm(size, [128, 256, 512]) - 0.5) * 0.4
    )
    normal = height_to_normal(height, strength=14.0)

    # roughness ~0.95 with pore/crack higher, aggregate slightly lower
    rough = np.full((size, size), 0.95, dtype=np.float64)
    rough += mottling * 0.02
    rough += pores * 0.04
    rough += cracks * 0.03
    rough -= agg_mask * 0.03
    rough = np.clip(rough, 0.88, 0.99)

    return rgb, rough, normal, height


def build_stage1(size: int, s0_rgb: np.ndarray, s0_height: np.ndarray):
    """PRIMER — wet amber seal #5a5348 over concrete, satin, weak normal."""
    seal = hex_rgb("#5a5348")
    # underlying concrete faintly visible
    concrete = s0_rgb.astype(np.float64)
    # wet darkening + amber tint: mix seal over darkened concrete
    # softer remnant mottle under the seal
    mottle = fbm(size, [6, 12, 24, 48], [1, 0.5, 0.25, 0.12])
    mottle = (mottle - mottle.mean()) / (mottle.std() + 1e-8)
    laps = make_roller_laps(size)

    # Heavy wet soak: mostly seal colour, concrete faintly ghosted underneath
    rgb = concrete * 0.12 + seal[None, None, :] * 0.88
    # fill / flatten pore darkness toward seal (pores filled)
    local = concrete.mean(axis=2)
    poreish = np.clip((125 - local) / 80.0, 0, 1)
    rgb = rgb * (1 - 0.35 * poreish[..., None]) + seal[None, None, :] * (0.35 * poreish[..., None])
    rgb += mottle[..., None] * np.array([3.0, 2.4, 1.6])
    rgb += laps[..., None] * np.array([4.5, 3.5, 2.2])  # satin roller-lap streaks
    # amber wet boost
    rgb[..., 0] += 5.0
    rgb[..., 1] += 1.5
    rgb[..., 2] -= 4.0
    # satin sheen bands (slightly lighter amber)
    sheen = np.clip(laps, 0, 1) ** 2
    rgb += sheen[..., None] * np.array([8.0, 6.0, 3.0])
    rgb = np.clip(rgb, 0, 255)
    # Keep near true seal luminance (~36) with slight lift for ghosted concrete
    rgb = shift_mean_L(rgb, 38.5)

    # weak normal: filled pores, residual low detail
    height = s0_height * 0.12 + mottle * 0.08 + laps * 0.05
    normal = height_to_normal(height, strength=3.5)

    rough = np.full((size, size), 0.55, dtype=np.float64)
    rough += laps * 0.06  # roller-lap variation
    rough += mottle * 0.02
    rough = np.clip(rough, 0.45, 0.68)

    return rgb, rough, normal


def build_stage2(size: int):
    """BASE COAT — opaque Avanti slate #4a4e55, orange-peel, very weak normal."""
    base = hex_rgb("#4a4e55")
    peel = make_orange_peel(size)
    peel = (peel - peel.mean()) / (peel.std() + 1e-8)
    bands = make_trowel_arcs(size) * 0.35 + make_roller_laps(size) * 0.25
    bands = (bands - bands.mean()) / (bands.std() + 1e-8)

    rgb = np.empty((size, size, 3), dtype=np.float64)
    # cool slate with tiny warm peel flecks
    d = peel * 3.5 + bands * 2.2
    rgb[..., 0] = base[0] + d * 0.9
    rgb[..., 1] = base[1] + d * 1.0
    rgb[..., 2] = base[2] + d * 1.05
    rgb = np.clip(rgb, 0, 255)
    # Deepen slate so mean L* sits ≥12 below primer (~38.5 → ~24)
    # Keep cool #4a4e55 hue family
    rgb = shift_mean_L(rgb, 24.0)

    height = peel * 0.15 + bands * 0.08
    normal = height_to_normal(height, strength=2.0)

    rough = np.full((size, size), 0.30, dtype=np.float64)
    rough += peel * 0.025
    rough += bands * 0.015
    rough = np.clip(rough, 0.25, 0.38)

    return rgb, rough, normal


def build_stage3(size: int):
    """MIRROR TOPCOAT — deep charcoal #1c1d21, nearly flat, tiny wave."""
    base = hex_rgb("#1c1d21")
    wave = make_lowfreq_wave(size)
    wave_n = (wave - wave.mean()) / (wave.std() + 1e-8)
    # faint depth gradient (tileable via low-freq sin)
    yy = np.linspace(0, 2 * np.pi, size, endpoint=False)[:, None]
    xx = np.linspace(0, 2 * np.pi, size, endpoint=False)[None, :]
    grad = 0.55 * np.sin(yy * 0.5 + 0.3) + 0.45 * np.sin(xx * 0.5 - 0.2)
    grad = (grad - grad.mean()) / (grad.std() + 1e-8)

    rgb = np.empty((size, size, 3), dtype=np.float64)
    d = wave_n * 1.2 + grad * 2.0
    rgb[..., 0] = base[0] + d * 0.85
    rgb[..., 1] = base[1] + d * 0.90
    rgb[..., 2] = base[2] + d * 1.00
    rgb = np.clip(rgb, 0, 255)
    rgb = shift_mean_L(rgb, 10.5)

    height = wave_n * 0.08
    normal = height_to_normal(height, strength=0.8)

    rough = np.full((size, size), 0.03, dtype=np.float64)
    rough += wave_n * 0.008
    rough = np.clip(rough, 0.02, 0.04)

    return rgb, rough, normal


# ── IO ───────────────────────────────────────────────────────────────────────

def save_albedo(rgb: np.ndarray, path_jpg: Path, path_webp: Path | None = None):
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), mode="RGB")
    img.save(path_jpg, quality=92, optimize=True, subsampling=0)
    if path_webp:
        img.save(path_webp, quality=90, method=6)


def save_roughness(rough: np.ndarray, path: Path):
    u8 = np.clip(rough * 255.0, 0, 255).astype(np.uint8)
    Image.fromarray(u8, mode="L").save(path, optimize=True)


def save_normal(normal: np.ndarray, path: Path):
    Image.fromarray(normal, mode="RGB").save(path, optimize=True)


def make_preview(albedos: list[np.ndarray], labels: list[str], path: Path):
    n = len(albedos)
    pad = 16
    label_h = 36
    cell = SIZE
    w = n * cell + (n + 1) * pad
    h = cell + 2 * pad + label_h
    canvas = Image.new("RGB", (w, h), (18, 18, 20))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
        font_sm = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
    except Exception:
        font = ImageFont.load_default()
        font_sm = font
    for i, (alb, lab) in enumerate(zip(albedos, labels)):
        x = pad + i * (cell + pad)
        y = pad
        tile = Image.fromarray(np.clip(alb, 0, 255).astype(np.uint8))
        canvas.paste(tile, (x, y))
        L = luminance_Lstar(alb)
        draw.text((x + 8, y + cell + 6), f"{i}  {lab}", fill=(230, 230, 230), font=font)
        draw.text((x + 8, y + cell + 28), f"mean L* = {L:.1f}", fill=(160, 160, 165), font=font_sm)
    canvas.save(path, optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"Generating → {OUT} @ {SIZE}²")

    s0_rgb, s0_r, s0_n, s0_h = build_stage0(SIZE)
    print(f"  stage0 L*={luminance_Lstar(s0_rgb):.2f}")
    s1_rgb, s1_r, s1_n = build_stage1(SIZE, s0_rgb, s0_h)
    print(f"  stage1 L*={luminance_Lstar(s1_rgb):.2f}")
    s2_rgb, s2_r, s2_n = build_stage2(SIZE)
    print(f"  stage2 L*={luminance_Lstar(s2_rgb):.2f}")
    s3_rgb, s3_r, s3_n = build_stage3(SIZE)
    print(f"  stage3 L*={luminance_Lstar(s3_rgb):.2f}")

    stages = [
        (0, s0_rgb, s0_r, s0_n),
        (1, s1_rgb, s1_r, s1_n),
        (2, s2_rgb, s2_r, s2_n),
        (3, s3_rgb, s3_r, s3_n),
    ]
    Ls = [luminance_Lstar(rgb) for _, rgb, _, _ in stages]
    for i in range(3):
        d = Ls[i] - Ls[i + 1]
        print(f"  ΔL*({i}→{i+1}) = {d:.2f} {'OK' if d >= 12 else 'TOO SMALL'}")

    for i, rgb, rough, normal in stages:
        save_albedo(rgb, OUT / f"stage{i}_albedo.jpg", OUT / f"stage{i}_albedo.webp")
        save_roughness(rough, OUT / f"stage{i}_roughness.png")
        save_normal(normal, OUT / f"stage{i}_normal.png")
        print(f"  wrote stage{i}_*")

    labels = ["RAW CONCRETE", "PRIMER", "BASE COAT", "MIRROR TOPCOAT"]
    make_preview([s0_rgb, s1_rgb, s2_rgb, s3_rgb], labels, OUT / "preview.png")
    print(f"  wrote preview.png")
    print("done")


if __name__ == "__main__":
    main()
