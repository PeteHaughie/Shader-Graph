# Benchmark Results

Run on: 2026-08-13T16:51:42.259Z
Total runs: 11

## Summary

| Task | Mode | Compiles? | Primitives | Nodes | Params OK | Score |
|------|------|-----------|------------|-------|-----------|-------|
| Lava Lamp | text | Yes | Missing: Glow | 1 | Yes | 79/100 |
| Slow Lava | text | No | Missing: Noise, HueShift | 1 | Yes | 34/100 |
| Kaleidoscope Refactor | text | Yes | Missing: Texture | 1 | Yes | 79/100 |
| Vignette Addition | text | Yes | All 5 | 1 | Yes | 84/100 |
| Slow Lava | text | Yes | Missing: Noise, HueShift, BrightnessContrast | 1 | Yes | 69/100 |
| Dreamy Blur | text | Yes | Missing: Texture, Blur | 1 | Yes | 74/100 |
| Lava Lamp | graph | Yes | All 11 | 8 | Yes | 100/100 |
| Slow Lava | graph | Yes | All 10 | 3 | Yes | 100/100 |
| Kaleidoscope Refactor | graph | Yes | All 6 | 8 | Yes | 100/100 |
| Vignette Addition | graph | Yes | All 6 | 6 | Yes | 100/100 |
| Dreamy Blur | graph | Yes | All 7 | 3 | Yes | 100/100 |

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
| Average score | 100.0 | 69.8 |
| Compile rate | 100% | 83% |

## Detailed Results

### Lava Lamp

Tests complex topology — can the AI wire a multi-node graph correctly?

Required: Noise, Mix, Glow (min 5 nodes)

#### Text (Mode B)

- **Score:** 79/100
- **Compiles:** Yes
- **Primitives:** Noise, Mix, Gradient, Threshold, Add, Subtract, Multiply
- **Nodes:** 1
- **Params in range:** Yes
- **Iterations:** 2
- **Time:** 45s
- **Notes:** Wrote GLSL directly in 2 iterations. More sophisticated output (smoothstep, time animation, proper color) but node count metric penalizes compact code.

#### Graph (Mode A)

- **Score:** 100/100
- **Compiles:** Yes
- **Primitives:** Mix, Glow, SolidColor, HueShift, Threshold, Add, Subtract, Multiply, SmoothNoise, FractalNoise, Palette
- **Nodes:** 8
- **Params in range:** Yes
- **Time:** 1s
- **Notes:** SmoothNoise(2,5,10) -> Mix -> Palette(fire) -> Glow -> Output

### Slow Lava

Tests parameter hunting — can the AI find the right values within constrained ranges?

Required: Noise, HueShift, BrightnessContrast (min 3 nodes)

#### Text (Mode B)

- **Score:** 34/100
- **Compiles:** No — glslangValidator failed
- **Primitives:** Mix, Glow, SolidColor, BrightnessContrast, Threshold, Add, Subtract, Multiply
- **Nodes:** 1
- **Params in range:** Yes
- **Iterations:** 9
- **Time:** 45s
- **Notes:** Sub-agent wrote GLSL directly. Uses u_time which isnt declared. Custom noise functions.

#### Text (Mode B)

- **Score:** 69/100
- **Compiles:** Yes
- **Primitives:** Mix, Gradient, Add, Subtract, Multiply
- **Nodes:** 1
- **Params in range:** Yes
- **Iterations:** 3
- **Time:** 90s
- **Notes:** Custom 4-octave FBM noise with 4-stop color ramp. Uses iTime for animation. Scoring fails to detect custom noise (not noise1d).

#### Graph (Mode A)

- **Score:** 100/100
- **Compiles:** Yes
- **Primitives:** Mix, SolidColor, HueShift, Threshold, Add, Subtract, Multiply, SmoothNoise, FractalNoise, Palette
- **Nodes:** 3
- **Params in range:** Yes
- **Time:** 1s
- **Notes:** FractalNoise(4-octave) -> Palette(fire) -> Output. 100/100 with alias scoring.

### Kaleidoscope Refactor

Tests structural reasoning — can the AI rewire a graph by inserting new nodes?

Required: Gradient, Mix, Texture (min 5 nodes)

#### Text (Mode B)

- **Score:** 79/100
- **Compiles:** Yes
- **Primitives:** Mix, Gradient, Subtract, Multiply
- **Nodes:** 1
- **Params in range:** Yes
- **Iterations:** 3
- **Time:** 45s
- **Notes:** Wrote GLSL directly. Used abs(uv-0.5)*2.0 for kaleidoscope mirroring. Compact code (1 variable).

#### Graph (Mode A)

- **Score:** 100/100
- **Compiles:** Yes
- **Primitives:** Mix, SolidColor, Gradient, Add, Multiply, Checkerboard
- **Nodes:** 8
- **Params in range:** Yes
- **Time:** 1s
- **Notes:** Gradient(blue->orange) + Checkerboard(4) -> Mix(0.7) -> Output. 100/100 with alias scoring.

### Vignette Addition

Tests surgical precision — can the AI make targeted changes without collateral damage?

Required: Noise, Multiply (min 3 nodes)

#### Text (Mode B)

- **Score:** 84/100
- **Compiles:** Yes
- **Primitives:** Noise, Gradient, Add, Subtract, Multiply
- **Nodes:** 1
- **Params in range:** Yes
- **Iterations:** 1
- **Time:** 15s
- **Notes:** Added vignette = 1.0 - length(uv-0.5)*0.8 clamped to [0.5,1.0] as multiplier. 1 iteration, compiled first time.

#### Graph (Mode A)

- **Score:** 100/100
- **Compiles:** Yes
- **Primitives:** Noise, Mix, SolidColor, Gradient, Add, Multiply
- **Nodes:** 6
- **Params in range:** Yes
- **Time:** 1s
- **Notes:** Noise(3) * Gradient(white->black) via Multiply -> Output

### Dreamy Blur

Tests the Blur primitive specifically — can the AI wire it with appropriate parameters?

Required: Texture, Blur (min 3 nodes)

#### Text (Mode B)

- **Score:** 74/100
- **Compiles:** Yes
- **Primitives:** Mix, SolidColor, Gradient, Add, Subtract, Multiply
- **Nodes:** 1
- **Params in range:** Yes
- **Iterations:** 3
- **Time:** 60s
- **Notes:** Custom smooth noise with inline 3x3 blur loop. More sophisticated noise (smoothstep interpolation) but scoring fails to detect custom implementations.

#### Graph (Mode A)

- **Score:** 100/100
- **Compiles:** Yes
- **Primitives:** Blur, Texture, SolidColor, Gradient, Add, Subtract, Multiply
- **Nodes:** 3
- **Params in range:** Yes
- **Time:** 1s
- **Notes:** Texture -> Blur(radius=10) -> Output. Real 3x3 box blur on uTexture.

