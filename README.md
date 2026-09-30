# Shader Graph

A semantic shader graph — an MCP server that lets an AI build shaders by manipulating a typed, immutable graph instead of writing source text directly. Targets GLSL (WebGL/OpenGL) and Metal (MSL).

## The idea

Conventional AI coding edits strings. This project asks: **what if the AI manipulates a structured semantic object, and source code is just one output format?**

A shader is represented as a graph of typed primitives (Noise → Blur → Mix → Output). The AI adds nodes, wires connections, and tunes parameters through MCP tools. A deterministic compiler translates the graph into valid GLSL or Metal Shading Language.

## Quick start

```sh
npm install
brew install glslang           # for GLSL validation
npm run dev                    # start the MCP server over stdio
```

Metal validation additionally needs Xcode with its license accepted and the Metal Toolchain component:

```sh
sudo xcodebuild -license accept
xcodebuild -downloadComponent MetalToolchain
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
| `set_graph` / `load_graph` | Import a graph document (round-trip); honours client-supplied ids, else assigns deterministic `n0`/`e0` ids |
| `export_graph` | Export a versioned, self-describing document (fragment, vertex, or pair) with target and primitive-registry version |
| `set_target` | Set shader target: `es100`, `es300`, `gl150`, or `metal` |
| `validate` | Run validation on the graph (type-checking, completeness, DAG, parameter ranges, pass/buffer rules) |
| `compile` | Compile fragment graph → target language for current target |
| `describe` | Fragment graph metadata (uniforms, varyings, output, passes/entry points) |
| `vtx_list_primitives` | List vertex primitive types |
| `vtx_inspect_graph` | View the current vertex graph |
| `vtx_add_node` / `vtx_remove_node` | Add/remove vertex nodes |
| `vtx_connect` / `vtx_disconnect` | Wire/remove vertex edges |
| `vtx_set_parameter` | Tune a vertex node's parameter |
| `vtx_validate` | Validate the vertex graph |
| `vtx_compile` | Compile vertex graph → target language |
| `vtx_describe` | Vertex graph metadata (attributes, uniforms, varyings) |
| `compile_pair` | Compile vertex + fragment as a matched pair with varying passthrough |
| `describe_pair` | Combined metadata for both graphs |
| `compile_depth_pass` | Depth-only shaders for shadow map rendering |

## Primitive catalogue (52 nodes)

### Fragment shader (39 nodes)

| Category | Nodes |
|----------|-------|
| **Sources** | **Input**, Texture, Noise, **SmoothNoise**, **FractalNoise**, SolidColor, Gradient, Checkerboard, **Time**, **FromVertex** |
| **Buffers** | **PassTarget**, **ReadBuffer** |
| **Coordinate** | **FragCoord**, **Floor**, **Mod**, **TexelSize**, **Swizzle** |
| **Color** | BrightnessContrast, HueShift, Saturation, Invert, Threshold, **Palette** |
| **Blend** | Mix, Add, Subtract, Multiply |
| **Lighting** | **DiffuseLight**, **AmbientLight**, **SpecularLight**, **NormalMap**, **ShadowMap** |
| **Filter** | Blur, Glow, EdgeDetect, Displace |
| **Utility** | Mask, **SmoothStep** |
| **Output** | Output |

### Vertex shader (13 nodes)

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
  - `format` (enum, optional) — explicit pixel format (`auto` default); `auto` → `rgba32f` when `float=1`, else `rgba8`
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

`describe` reports each pass's `index`, `target`, `persistent`, `float`, `format`, `width`/`height`, and whether it is the final `output`, so a host knows which framebuffers to allocate and in what order to run them.

## Typed parameters, port conventions & round-trip

The registry is the machine-readable contract a host adapter normalises against. It is versioned and content-hashed (`list_primitives` returns `{ schema, version, count, hash, primitives }`) so consumers can detect vocabulary drift.

- **Parameter types** — `float`, `int`, `string`, `enum` (with `variants`), and `color`. Colors accept `[r,g,b]`/`[r,g,b,a]` arrays, `"#rrggbb"`/`"#rrggbbaa"` hex, or the legacy `"r,g,b"` CSV string; all normalise to the same generated vector. Enums carry their allowed variants (`Palette.mode`, `Rotate.axis`, `Bend.axis`) and are validated.
- **Ports** — `vec4` is the default carrier (wider/narrower values travel in `.xy`/`.xyz` — the swizzle idiom). `VertexTexCoord` is typed `vec2`; `mat4`, `float` and `bool` port types exist for future use. `list_primitives` states this convention explicitly.
- **Video input** — the `Input` primitive (`params: [index]`) is a host-bound live video source; GLSL emits `uniform sampler2D uInputN`, MSL binds `texture2d<float> uInputN`. Processors can now be authored entirely inside the graph.
- **Round-trip & stable ids** — `export_graph` emits a self-describing payload `{ schema, schemaName, graphType, target, id, nodes, edges, primitives, stages }`. `set_graph` / `load_graph` import such a document, honouring client-supplied node/edge ids and assigning deterministic `n0`/`e0` ids when omitted. The graph `id` is a content hash, so identical documents share an identity (usable as a cache key). Stored params are not materialised against defaults — the versioned registry lets a consumer do that itself.
- **Pass formats** — `PassTarget.format` (`auto` default, or `rgba8`/`rgba16f`/`rgba32f`/`r8`/`r16f`/`r32f`/`rg8`/`rg16f`) makes the pixel format explicit instead of inferring from the `float` flag; `auto` resolves to `rgba32f` when `float=1`, else `rgba8`.

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
│   ├── primitives.ts  PortType/ParamType enums, GraphType, port/param specs
│   ├── registry.ts    52 primitive definitions (39 frag + 13 vert) + registry version
│   ├── params.ts      color/enum parsing and validation helpers
│   ├── hash.ts        content hashing for stable graph identity
│   ├── document.ts    versioned self-describing export payload
│   ├── passes.ts      Multi-pass analysis: partitioning, ordering, buffer metadata
│   ├── operations.ts  Immutable graph mutations, deterministic ids, load/round-trip
│   └── validation.ts  4-category graph validation + pass/buffer rules
├── compiler/
│   ├── backend.ts     ShaderBackend interface + getBackend(target) resolver
│   ├── targets.ts     Target/language definitions (GLSL dialects + metal)
│   ├── compile.ts     Fragment graph → GLSL code generator (GLSL backend)
│   ├── vertex.ts      Vertex graph → GLSL code generator (GLSL backend)
│   └── msl/
│       ├── fragment.ts  Fragment graph → MSL (per-pass entry points)
│       ├── vertex.ts    Vertex graph → MSL (stage_in / [[position]])
│       ├── helpers.ts   MSL helper library (noise, fbm, hsv, sobel)
│       └── validate.ts  xcrun -sdk macosx metal validation (graceful fallback)
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
├── vertex.test.ts      Vertex compiler tests (13 tests)
├── msl.test.ts         Metal backend tests (49 tests)
└── change-request.test.ts  Host change-request tests: Input, round-trip, typed params, formats (23 tests)
```

## 3D Demo

Open `demo.html` in a browser to see a WebGL render of 3-to-20-sided polygons with vertex shader rotation and fragment shader lighting — red on black, perfectly looping over 60 seconds. Uses the same vertex+fragment shader pair pattern that `compile_pair` generates.

## Tests

```sh
npm run typecheck   # tsc --noEmit
npm test            # vitest run (164 tests)
```

## Targets

Use `set_target` to switch output language and dialect:

| Target | Language | Version | Use case |
|--------|----------|---------|----------|
| `es100` | GLSL | GLSL ES 1.00 | WebGL 1, GLES 2.0 (default) |
| `es300` | GLSL | GLSL ES 3.00 | WebGL 2, Raspberry Pi 3+ |
| `gl150` | GLSL | GLSL 1.50 | OpenGL 3.2, macOS, openFrameworks |
| `metal` | MSL | Metal 3.0 | Metal on macOS / iOS, native apps |

The graph structure, validation, and primitives are target-agnostic — only code generation changes. GLSL dialects differ by tokens (`attribute` → `in`, `texture2D` → `texture`, `gl_FragColor` → `out vec4 fragColor`). Metal is a full backend with its own conventions.

### Metal (MSL) code generation

- **Entry points** — a single-pass graph becomes `fragment_main`; a multi-pass graph emits **one `[[fragment]]` function per pass** (`fragment_pass0`, `fragment_pass1`, …) rather than a GLSL-style `PASSINDEX` branch. `describe` reports the entry-point names and which pass is the display output.
- **Uniforms** — gathered into a `Uniforms` struct bound at `[[buffer(0)]]`, e.g. `float2 iResolution`, `float iTime`, `float4x4 uLightMVP`. Prefixed as `u.iResolution` in generated code.
- **Textures / buffers** — `texture2d<float>` bound at `[[texture(i)]]`, sampled via a fixed `constexpr sampler _samp`. Texture units are `uTexture0`, `uTexture1`, …; named `PassTarget` buffers keep their name as the texture argument (`blurBuf [[texture(0)]]`). `describe` lists each resource and its binding index.
- **Vertex** — stage-in attributes `aPosition/aNormal/aTexCoord/aColor` at `[[attribute(0..3)]]`; varyings pass through `VertexOut`/`FragIn` struct members; output is `[[position]]`.
- **Derivatives** — `dFdx/dFdy` become `dfdx/dfdy`; no extension declaration needed.
- **Validation** — compiles with `xcrun -sdk macosx metal -c`. If the Metal Toolchain is missing, the Xcode license is unaccepted, or you are off macOS, validation degrades to "skipped" rather than failing.

Deeper dive: `src/compiler/msl/`. The `Backend` interface (`src/compiler/backend.ts`) keeps GLSL and MSL as interchangeable code generators behind `getBackend(target)`.

## Future directions

- **ISF output target** — emit the ISF `.fs` format (JSON descriptor header + GLSL body). The graph already uses ISF's pass/buffer vocabulary, so compiled multi-pass shaders map almost directly; this would make graph output loadable in VDMX, Resolume, TouchDesigner, and other ISF hosts.
- **Compute shaders** — the same semantic graph model extends naturally to compute pipelines. Instead of a vertex→fragment pipeline, compute shaders have a dispatch grid (workgroups → invocations). Audio DSP on the GPU is a compelling application: oscillator → filter → envelope → output maps directly to a dataflow graph, with float buffers flowing between typed nodes instead of vec4 pixels.
- **More compiler targets** — HLSL (DirectX), WGSL (WebGPU), SPIR-V. The backend abstraction is now in place; each new target is another code generator.
- **Metal host binding metadata** — an explicit descriptor (MTL buffer/texture/sampler indices per entry point, uniform struct layout) so a Metal host can build `MTLRenderPipelineState`s without parsing the MSL.
- **Application-level semantic graphs** — extending the metaphor beyond shaders to frameworks like openFrameworks, where the graph describes application architecture (event-driven state machines, callbacks, GPU interaction) rather than per-pixel computation.
- **Graph visualizer** — the MCP tools work, but a visual graph editor would make the graph explorable.
- **Geodesic sphere benchmark** — subdividing the icosahedron at increasing levels for a smooth morph from rough to sphere.

## License

MIT
