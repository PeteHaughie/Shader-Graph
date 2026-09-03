# Shader Graph

A semantic shader graph — an MCP server that lets an AI build GLSL fragment shaders by manipulating a typed, immutable graph instead of writing source text directly.

## The idea

Conventional AI coding edits strings. This project asks: **what if the AI manipulates a structured semantic object, and source code is just one output format?**

A shader is represented as a graph of typed primitives (Noise → Blur → Mix → Output). The AI adds nodes, wires connections, and tunes parameters through MCP tools. A deterministic compiler translates the graph into valid GLSL.

## Quick start

```sh
npm install
brew install glslang           # for shader validation
npm run dev                    # start the MCP server over stdio
```

## Tools

| Tool | Purpose |
|------|---------|
| `list_primitives` | List available node types and their signatures |
| `inspect_graph` | View the current graph (nodes, edges, params) |
| `add_node` | Add a primitive node |
| `remove_node` | Remove a node and its connections |
| `connect` / `disconnect` | Wire or remove edges between nodes |
| `set_parameter` | Tune a node's parameter value |
| `set_target` | Set GLSL target version: es100, es300, or gl150 |
| `validate` | Run validation on the graph (type-checking, completeness, DAG, parameter ranges, pass/buffer rules) |
| `compile` | Compile fragment graph → GLSL for current target |
| `describe` | Fragment graph metadata (uniforms, varyings, output) |
| `vtx_list_primitives` | List vertex primitive types |
| `vtx_inspect_graph` | View the current vertex graph |
| `vtx_add_node` / `vtx_remove_node` | Add/remove vertex nodes |
| `vtx_connect` / `vtx_disconnect` | Wire/remove vertex edges |
| `vtx_set_parameter` | Tune a vertex node's parameter |
| `vtx_validate` | Validate the vertex graph |
| `vtx_compile` | Compile vertex graph → GLSL vertex shader |
| `vtx_describe` | Vertex graph metadata (attributes, uniforms, varyings) |
| `compile_pair` | Compile vertex + fragment as a matched pair with varying passthrough |
| `describe_pair` | Combined metadata for both graphs |
| `compile_depth_pass` | Depth-only shaders for shadow map rendering |

## Primitive catalogue (41 nodes)

### Fragment shader (29 nodes)

| Category | Nodes |
|----------|-------|
| **Sources** | Texture, Noise, **SmoothNoise**, **FractalNoise**, SolidColor, Gradient, Checkerboard, **Time**, **FromVertex** |
| **Buffers** | **PassTarget**, **ReadBuffer** |
| **Color** | BrightnessContrast, HueShift, Saturation, Invert, Threshold, **Palette** |
| **Blend** | Mix, Add, Subtract, Multiply |
| **Lighting** | **DiffuseLight**, **AmbientLight** |
| **Filter** | Blur, Glow, EdgeDetect, Displace |
| **Utility** | Mask, **SmoothStep** |
| **Output** | Output |

### Vertex shader (12 nodes)

| Category | Nodes |
|----------|-------|
| **Sources** | VertexPosition, VertexNormal, VertexTexCoord, VertexColor |
| **Transform** | Translate, Rotate, Scale, ModelViewProjection |
| **Deform** | Wave, NoiseDisplace, Bend |
| **Output** | VertexOutput |
| **Bridge** | **PassToFragment** |

Each primitive has typed input/output ports and validated parameter ranges. Float and int parameters can also accept wired connections from any node's vec4 output (using the `.r` channel) — so `Time` can drive `Mix.factor`, `Blur.radius`, or `Gradient.angle` for animated effects.

The graph validates on four axes: type-checking, completeness, acyclicity, and parameter bounds. Multi-pass graphs add a fifth: buffer/pass correctness (see below).

## Multi-pass & persistent buffers

The graph can render in multiple passes by rendering into **named buffers** that later passes (or later frames) read back. The vocabulary is borrowed from the ISF (Interactive Shader Format) spec:

- **`PassTarget`** — a sink, like `Output`, but writes its `source` to a named buffer instead of the display. Params:
  - `name` (string) — the buffer name, also its GLSL sampler identifier
  - `persistent` (0/1) — keep the buffer across frames (for accumulation/trails/feedback)
  - `float` (0/1) — allocate a 32-bit float buffer (for data, not just color)
  - `width` / `height` (string) — pass size equations, e.g. `"$WIDTH/16.0"` for a low-res buffer; `$WIDTH`/`$HEIGHT` are the output size
- **`ReadBuffer`** — a source that samples a named buffer (optional `uv` input, defaulting to normalized coordinates).

The subgraph feeding each sink is one pass. Passes are ordered by buffer dependency (write before read), and the compiler emits a single shader with `if (PASSINDEX == 0) { … } else if (PASSINDEX == 1) { … }` branches; the `Output` pass runs last. The graph itself stays **acyclic** — feedback is expressed through buffers, not edges: a `ReadBuffer` inside the pass that writes it reads the buffer's *previous frame* content, which is the standard way to build motion-blur trails, accumulators, and iterative effects. Reading a buffer inside its own write-pass is only valid when the buffer is `persistent`.

Example — a two-pass graph (render noise to `blurBuf`, then display it):

```text
Noise ──→ PassTarget("blurBuf")
ReadBuffer("blurBuf") ──→ Output
```

compiles to:

```glsl
uniform vec2 iResolution;
uniform int PASSINDEX;
uniform sampler2D blurBuf;

void main() {
  if (PASSINDEX == 0) {  vec4 v0 = noise1d(1.0, 0.0);
    gl_FragColor = v0;}
  else if (PASSINDEX == 1) {  vec4 v0 = texture2D(blurBuf, gl_FragCoord.xy / iResolution);
    gl_FragColor = v0;}
}
```

`describe` reports each pass's `index`, `target`, `persistent`, `float`, `width`/`height`, and whether it is the final `output`, so a host knows which framebuffers to allocate and in what order to run them.

## Configure in opencode

Add to `~/.config/opencode/opencode.jsonc`:

```json
"shader-graph": {
  "type": "local",
  "command": ["npx", "tsx", "src/index.ts"],
  "workingDirectory": "/path/to/forbidden-zone",
  "enabled": true
}
```

## Benchmark results

5 tasks × 2 modes (graph vs text), scored on compile success, primitive coverage, node count, and parameter validity:

| Task | Graph | Text |
|------|:-----:|:----:|
| Lava Lamp | **100** | 79 |
| Slow Lava | **100** | 69 |
| Kaleidoscope | **100** | 79 |
| Vignette | **100** | 84 |
| Dreamy Blur | **100** | 74 |
| **Average** | **100.0** | **69.8** |

Graph mode wins on reliability (100% compile rate vs 83%), speed (seconds vs minutes), and structural correctness. The primitive catalogue has been expanded to close the expressive gap — SmoothNoise, FractalNoise, Palette, Time, and float input ports now let the graph mode produce shaders that rival hand-written GLSL in sophistication (FBM noise, cosine color palettes, time-driven animation).

Full report: `benchmark/REPORT.md`

## Project structure

```
src/
├── index.ts           MCP server entry point
├── graph/
│   ├── types.ts       Node, Edge, GraphState interfaces
│   ├── primitives.ts  PortType enum, GraphType, port/param specs
│   ├── registry.ts    41 primitive definitions (29 frag + 12 vert)
│   ├── passes.ts      Multi-pass analysis: partitioning, ordering, buffer metadata
│   ├── operations.ts  Immutable graph mutations
│   └── validation.ts  4-category graph validation + pass/buffer rules
├── compiler/
│   ├── compile.ts     Fragment graph → GLSL code generator
│   └── vertex.ts      Vertex graph → GLSL code generator
benchmark/
├── tasks.json         5 benchmark task definitions
├── score.mjs          GLSL output scoring
├── run.mjs            Benchmark runner
├── report.mjs         Report generator
└── REPORT.md          Full results
research/
├── glsl-validation.md   GLSL validator options
└── mcp-sdk-patterns.md  MCP SDK v2 reference
tests/
├── graph.test.ts       Graph model tests (25 tests)
├── compiler.test.ts    Fragment compiler tests (25 tests)
└── vertex.test.ts      Vertex compiler tests (13 tests)
```

## 3D Demo

Open `demo.html` in a browser to see a WebGL render of 3-to-20-sided polygons with vertex shader rotation and fragment shader lighting — red on black, perfectly looping over 60 seconds. Uses the same vertex+fragment shader pair pattern that `compile_pair` generates.

## Tests

```sh
npm run typecheck   # tsc --noEmit
npm test            # vitest run (92 tests)

## GLSL targets

Use `set_target` to switch between GLSL dialects:

| Target | Version | Use case |
|--------|---------|----------|
| `es100` | GLSL ES 1.00 | WebGL 1, GLES 2.0 (default) |
| `es300` | GLSL ES 3.00 | WebGL 2, Raspberry Pi 3+ |
| `gl150` | GLSL 1.50 | OpenGL 3.2, macOS, openFrameworks |

The graph structure, validation, and primitives are target-agnostic — only the GLSL text generation changes (`attribute` → `in`, `texture2D` → `texture`, `gl_FragColor` → `out vec4 fragColor`, etc.).
```

## Future directions

- **ISF output target** — emit the ISF `.fs` format (JSON descriptor header + GLSL body). The graph already uses ISF's pass/buffer vocabulary, so compiled multi-pass shaders map almost directly; this would make graph output loadable in VDMX, Resolume, TouchDesigner, and other ISF hosts.
- **Compute shaders** — the same semantic graph model extends naturally to compute pipelines. Instead of a vertex→fragment pipeline, compute shaders have a dispatch grid (workgroups → invocations). Audio DSP on the GPU is a compelling application: oscillator → filter → envelope → output maps directly to a dataflow graph, with float buffers flowing between typed nodes instead of vec4 pixels.
- **More compiler targets** — HLSL (DirectX), WGSL (WebGPU), Metal, SPIR-V. The semantic graph is target-agnostic; each target is a new code generator.
- **Application-level semantic graphs** — extending the metaphor beyond shaders to frameworks like openFrameworks, where the graph describes application architecture (event-driven state machines, callbacks, GPU interaction) rather than per-pixel computation.
- **Graph visualizer** — the MCP tools work, but a visual graph editor would make the graph explorable.
- **Geodesic sphere benchmark** — subdividing the icosahedron at increasing levels for a smooth morph from rough to sphere.

## License

MIT
