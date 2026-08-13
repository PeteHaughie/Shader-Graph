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
| `compile` | Compile graph → GLSL, validate with glslangValidator |

## Primitive catalogue (25 nodes)

| Category | Nodes |
|----------|-------|
| **Sources** | Texture, Noise, **SmoothNoise**, **FractalNoise**, SolidColor, Gradient, Checkerboard, **Time** |
| **Color** | BrightnessContrast, HueShift, Saturation, Invert, Threshold, **Palette** |
| **Blend** | Mix, Add, Subtract, Multiply |
| **Filter** | Blur, Glow, EdgeDetect, Displace |
| **Utility** | Mask, **SmoothStep** |
| **Output** | Output |

Each primitive has typed input/output ports and validated parameter ranges. The graph validates on four axes: type-checking, completeness, acyclicity, and parameter bounds.

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
| Lava Lamp | 95 | 79 |
| Slow Lava | 100 | 69 |
| Kaleidoscope | 95 | 79 |
| Vignette | 100 | 84 |
| Dreamy Blur | 100 | 74 |
| **Average** | **98.0** | **69.8** |

Graph mode wins on reliability (100% compile rate vs 83%) and speed. Text mode wins on expressive power (custom noise, smoothstep, time animation). The sweet spot is a rich primitive catalogue with escape hatches for custom GLSL.

Full report: `benchmark/REPORT.md`

## Project structure

```
src/
├── index.ts           MCP server entry point
├── graph/
│   ├── types.ts       Node, Edge, GraphState interfaces
│   ├── primitives.ts  PortType enum, port/param specs
│   ├── registry.ts    20 primitive definitions
│   ├── operations.ts  Immutable graph mutations
│   └── validation.ts  4-category graph validation
└── compiler/
    └── compile.ts     Graph → GLSL code generator
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
├── graph.test.ts       Graph model tests
└── compiler.test.ts    Compiler + GLSL validation tests
```

## Tests

```sh
npm run typecheck   # tsc --noEmit
npm test            # vitest run (39 tests)
```

## License

MIT
