# forbidden-zone

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
| `validate` | Run 4-category validation on the graph |
| `compile` | Compile fragment graph → GLSL, validate with glslangValidator |
| `vtx_list_primitives` | List vertex primitive types |
| `vtx_inspect_graph` | View the current vertex graph |
| `vtx_add_node` / `vtx_remove_node` | Add/remove vertex nodes |
| `vtx_connect` / `vtx_disconnect` | Wire/remove vertex edges |
| `vtx_set_parameter` | Tune a vertex node's parameter |
| `vtx_validate` | Validate the vertex graph |
| `vtx_compile` | Compile vertex graph → GLSL vertex shader |
| `compile_pair` | Compile vertex + fragment graphs as a matched pair with varying passthrough |

## Primitive catalogue (37 nodes)

### Fragment shader (25 nodes)

| Category | Nodes |
|----------|-------|
| **Sources** | Texture, Noise, **SmoothNoise**, **FractalNoise**, SolidColor, Gradient, Checkerboard, **Time**, **FromVertex** |
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

The graph validates on four axes: type-checking, completeness, acyclicity, and parameter bounds.

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
│   ├── registry.ts    37 primitive definitions (25 frag + 12 vert)
│   ├── operations.ts  Immutable graph mutations
│   └── validation.ts  4-category graph validation
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
npm test            # vitest run (67 tests)
```

## License

MIT
