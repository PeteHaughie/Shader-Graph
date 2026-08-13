# Benchmark Results

Run on: 2026-08-13T15:52:19.855Z
Total runs: 9

## Summary

| Task | Mode | Compiles? | Primitives | Nodes | Params OK | Score |
|------|------|-----------|------------|-------|-----------|-------|
| Lava Lamp | graph | Yes | Missing: Glow | 8 | Yes | 95/100 |
| Lava Lamp | text | Yes | Missing: Glow | 1 | Yes | 79/100 |
| Slow Lava | text | No | Missing: Noise, HueShift | 1 | Yes | 34/100 |
| Slow Lava | graph | Yes | All 9 | 4 | Yes | 100/100 |
| Kaleidoscope Refactor | graph | Yes | Missing: Texture | 8 | Yes | 95/100 |
| Vignette Addition | graph | Yes | All 6 | 6 | Yes | 100/100 |
| Kaleidoscope Refactor | text | Yes | Missing: Texture | 1 | Yes | 79/100 |
| Vignette Addition | text | Yes | All 5 | 1 | Yes | 84/100 |
| Slow Lava | text | Yes | Missing: Noise, HueShift, BrightnessContrast | 1 | Yes | 69/100 |

## Scoring

| Metric | Weight |
|--------|--------|
| Compiles | 40 pts |
| Required primitives present | 20 pts (-5 per missing) |
| Node count >= minimum | 20 pts (pro-rata) |
| All parameters in range | 20 pts |

## Mode Comparison

| Metric | Graph (Mode A) | Text (Mode B) |
|--------|---------------|---------------|
| Average score | 97.5 | 69.0 |
| Compile rate | 100% | 80% |

## Detailed Results

### Lava Lamp

Tests complex topology — can the AI wire a multi-node graph correctly?

Required: Noise, Mix, Glow (min 5 nodes)

#### Graph (Mode A)

- **Score:** 95/100
- **Compiles:** Yes
- **Primitives:** Noise, Mix, Add, Multiply
- **Nodes:** 8
- **Params in range:** Yes
- **Iterations:** 116
- **Time:** 120s
- **Notes:** Three noise layers at scales 2,5,10 blended through 3 Mix nodes. No Glow (Blur is pass-through). No color tinting.

#### Text (Mode B)

- **Score:** 79/100
- **Compiles:** Yes
- **Primitives:** Noise, Mix, Gradient, Threshold, Add, Subtract, Multiply
- **Nodes:** 1
- **Params in range:** Yes
- **Iterations:** 2
- **Time:** 45s
- **Notes:** Wrote GLSL directly in 2 iterations. More sophisticated output (smoothstep, time animation, proper color) but node count metric penalizes compact code.

### Slow Lava

Tests parameter hunting — can the AI find the right values within constrained ranges?

Required: Noise, HueShift, BrightnessContrast (min 4 nodes)

#### Text (Mode B)

- **Score:** 34/100
- **Compiles:** No — glslangValidator failed
- **Primitives:** Mix, Glow, SolidColor, BrightnessContrast, Threshold, Add, Subtract, Multiply
- **Nodes:** 1
- **Params in range:** Yes
- **Iterations:** 9
- **Time:** 45s
- **Notes:** Sub-agent wrote GLSL directly. Uses u_time which isnt declared. Custom noise functions.

#### Graph (Mode A)

- **Score:** 100/100
- **Compiles:** Yes
- **Primitives:** Noise, HueShift, BrightnessContrast, Mix, Add, Subtract, Multiply, Threshold, SolidColor
- **Nodes:** 4
- **Params in range:** Yes
- **Iterations:** 11
- **Time:** 1s
- **Notes:** Noise(scale=4) -> HueShift(angle=30) -> BrightnessContrast(brightness=0.1,contrast=0.4) -> Output. Perfect score.

#### Text (Mode B)

- **Score:** 69/100
- **Compiles:** Yes
- **Primitives:** Mix, Gradient, Add, Subtract, Multiply
- **Nodes:** 1
- **Params in range:** Yes
- **Iterations:** 3
- **Time:** 90s
- **Notes:** Custom 4-octave FBM noise with 4-stop color ramp. Uses iTime for animation. Scoring fails to detect custom noise (not noise1d).

### Kaleidoscope Refactor

Tests structural reasoning — can the AI rewire a graph by inserting new nodes?

Required: Gradient, Mix, Texture (min 5 nodes)

#### Graph (Mode A)

- **Score:** 95/100
- **Compiles:** Yes
- **Primitives:** Mix, SolidColor, Gradient, Add, Multiply, Checkerboard
- **Nodes:** 8
- **Params in range:** Yes
- **Iterations:** 16
- **Time:** 1s
- **Notes:** Gradient(blue->orange,45deg) + Checkerboard(4) blended via Mix(0.7). Missing Texture primitive but Texture isnt needed for kaleidoscope.

#### Text (Mode B)

- **Score:** 79/100
- **Compiles:** Yes
- **Primitives:** Mix, Gradient, Subtract, Multiply
- **Nodes:** 1
- **Params in range:** Yes
- **Iterations:** 3
- **Time:** 45s
- **Notes:** Wrote GLSL directly. Used abs(uv-0.5)*2.0 for kaleidoscope mirroring. Compact code (1 variable).

### Vignette Addition

Tests surgical precision — can the AI make targeted changes without collateral damage?

Required: Noise, Multiply (min 3 nodes)

#### Graph (Mode A)

- **Score:** 100/100
- **Compiles:** Yes
- **Primitives:** Noise, Mix, SolidColor, Gradient, Add, Multiply
- **Nodes:** 6
- **Params in range:** Yes
- **Iterations:** 14
- **Time:** 1s
- **Notes:** Noise(scale=3) * Gradient(white->black, horizontal) via Multiply. Linear gradient vignette approximation.

#### Text (Mode B)

- **Score:** 84/100
- **Compiles:** Yes
- **Primitives:** Noise, Gradient, Add, Subtract, Multiply
- **Nodes:** 1
- **Params in range:** Yes
- **Iterations:** 1
- **Time:** 15s
- **Notes:** Added vignette = 1.0 - length(uv-0.5)*0.8 clamped to [0.5,1.0] as multiplier. 1 iteration, compiled first time.

