# MCP change request — `shader-graph` server

**From:** the VSE host plugin effort (`plugin-spike` map)
**Status:** implemented (CR-1–CR-6) · CR-7 reserved in schema · 1 October 2026
**Evidence:** [`research/01-mcp-graph-export.md`](research/01-mcp-graph-export.md) (graph-as-data),
[`research/02-mcp-primitive-inventory.md`](research/02-mcp-primitive-inventory.md) (vocabulary).
All findings are live, reproduced against the running server.

## Context

The host uses the shader-graph MCP as its **authoring front-end** and turns the authored
graph into its own **canonical IR** via a one-way adapter (`inspect_graph` +
`vtx_inspect_graph` + `list_primitives` → normalise). Two research passes established
that the MCP can *export the graph as data*, but that four capabilities are missing for
a host that authors **processors** and needs **round-trip, stable identity and typed
control surface**. This document lists the requested changes with the exact evidence and
a proposed minimal interface, so the host can drop its workarounds.

Requests are prioritised: **CR-1/CR-2 block processors and round-trip; CR-3–CR-5 improve
fidelity; CR-6/CR-7 are minor/future.**

## CR-1 — A video-input primitive (High)

**Evidence.** `list_primitives` (fragment) contains generators and effects but **no
input / video-source node**. The closest is `Texture`, whose only parameter is
`url: string` — a file/URL image, not a host-bound live video input.

**Request.** A primitive representing an external video input, e.g.

```
Input  (fragment)   inputs: []   outputs: [{ name: "out", type: "vec4" }]
                    params:  [{ name: "index", type: "int", default: 0, min: 0, max: 7 }]
```

**Why.** Without it, a **processor** graph cannot be authored at all; the host must
inject an input node *outside* the authored graph, defeating the authoring front-end for
the module type the host needs most.

**Impact if not done.** Processors remain unauthorable in the MCP (host-injected inputs
only); the IR `input` node has no MCP representation.

## CR-2 — Import / round-trip, stable ids, versioned payload (High)

**Evidence.** No tool accepts graph data as input (`add_node`, `connect`, … all mutate
live state); the top-level, node and edge ids are **random UUIDs regenerated on every
mutation and every replay**; replaying a captured graph reproduces topology/order/values
but with fresh ids. `target` is server-global, not part of the payload.

**Request.**
1. `set_graph` / `load_graph` accepting a graph document (fragment + vertex).
2. **Deterministic, stable ids** — either assigned by the server from content, or
   **client-supplied ids honoured on load**.
3. A **versioned, self-describing payload** (see CR-5).

**Why.** The host currently must maintain a one-way normaliser and a canonicalisation
pass (strip ids, sort, materialise defaults) before the graph can be hashed or cached.
Round-trip and stable ids would let the exported document itself be the portable
artifact and cache key.

**Impact if not done.** One-way export only; the host owns canonicalisation forever.

## CR-3 — Typed `color` and `enum` parameters (Medium)

**Evidence.** There is **no `color` or `enum` param type**. Colours are either four
`float`s (`SolidColor.r/g/b/a`) or a **`string`** (`DiffuseLight.color = "1.0,0.0,0.0"`,
`AmbientLight`, `SpecularLight`). "Enums" are free-form **`string`s**
(`Palette.mode = "fire"`, `Rotate.axis = "y"`, `Swizzle.pattern = "xxxx"`).

**Request.** First-class param types:
```
color  default: [r,g,b,a]           (or a hex string)
enum   variants: ["a","b",...]  default: "a"
```

**Why.** A host control surface needs a colour picker and a dropdown; a `string` carries
no variant list and no validation, and the host cannot tell a colour from a path.

**Impact if not done.** Hosts parse/guess strings; colour and enum controls are lossy.

## CR-4 — Port typing beyond `vec4` (Medium)

**Evidence.** **Every** port is `vec4` — including `VertexTexCoord` (a UV, logically
`vec2`) and `PassToFragment`. There is no `mat4`/`float`/`bool` port.

**Request.** At minimum `vec2` (UVs) and `mat4` (transforms); or an explicit statement
that `vec4`-only is intentional (swizzle idiom).

**Why.** The host IR types varyings/ports; a genuine `vec2` uv becomes a `vec4`, and
reflection is coarser than it needs to be.

## CR-5 — Self-describing export payload + schema/primitives version (Medium)

**Evidence.** The payload has no graph-kind label (fragment vs vertex is implied by the
*tool name*), no target/backend, no canvas layout, and no version. Parameter
types/defaults/`min`/`max`/`isInput` live only in `list_primitives`, with no version.

**Request.** One export payload carrying at least:
```
{ "schema": <int>, "graphType": "fragment"|"vertex", "target": "metal",
  "nodes": [...], "edges": [...], "primitives": <versioned> }
```
and a **version/hash on `list_primitives`** so consumers can pin the vocabulary
(the host records one as `primitive_registry`).

**Why.** Lets a consumer detect vocabulary drift and know the kind/backend without
inferring from which tool it called.

## CR-6 — Explicit pixel format on `PassTarget` (Low)

**Evidence.** `PassTarget.float` is an `int` 0/1 — a boolean proxy for "float format".
**Request.** An explicit `format` (`rgba8`/`rgba16f`/…) and any filter/wrap options.
**Why.** The host assumes `rgba16f` and refuses otherwise; an explicit field removes the
proxy and the assumption.

## CR-7 — Compute primitives (Low / future)

Deferred: the host's first cut is fragment+vertex only. Recorded so the export schema
(CR-5) does not foreclose compute stage(s).

## What the host does today (workarounds)

- **One-way normaliser** instead of round-trip: `inspect_graph` + `vtx_inspect_graph` +
  `list_primitives` → strip ids, materialise defaults/type/range, sort, canonicalise.
- **Host-injected inputs** for processors (CR-1 missing).
- **Colour/enum not exercised**; only `float`/`int` params (CR-3 missing).
- **`vec4` varyings** accepted as-is (CR-4).
- **Pinned `list_primitives` snapshot** committed alongside the graph (CR-5 missing).

## Out of scope of this request

- Process isolation, codecs, multi-OS backends — host concerns.
- Any change to the emit targets (`es100`/`es300`/`gl150`/`metal`); the host owns MSL
  emission from its IR, so the MCP's literal-baking emit path is not a dependency.

## Provenance / how to reproduce

- `shader-graph_list_primitives` and `shader-graph_vtx_list_primitives` (full vocabulary).
- `shader-graph_inspect_graph` / `vtx_inspect_graph` stability and round-trip tests —
  see `research/01-mcp-graph-export.md` §2–§3.
- Primitive inventory and the four gaps — see `research/02-mcp-primitive-inventory.md`.

## Resolution (1 October 2026)

| CR | Status | What shipped |
|----|--------|--------------|
| CR-1 | Done | `Input` fragment primitive (`index` 0–7). Emits `uniform sampler2D uInputN` (GLSL) / `texture2d<float> uInputN` (MSL); `describe` reports it with semantic `input`. |
| CR-2 | Done | `set_graph` / `load_graph` import a document; client ids honoured, else deterministic `n0`/`e0`. Graph `id` is a content hash (stable across identical documents). `export_graph` round-trips. |
| CR-3 | Done | Param types `color` and `enum` (with `variants`). Colors accept array/hex/CSV and normalise for codegen; enums validated. `Palette.mode`, `Rotate.axis`, `Wave.axis`, `Bend.axis`; light `color` params. |
| CR-4 | Done | `vec2`/`mat4`/`float`/`bool` port types added; `VertexTexCoord` is `vec2`; `vec4` default + swizzle idiom stated explicitly in `list_primitives`. |
| CR-5 | Done | Self-describing payload `{ schema, schemaName, graphType, target, id, nodes, edges, primitives, stages }`; `list_primitives` returns `{ schema, version, count, hash, primitives }`. |
| CR-6 | Done | `PassTarget.format` enum (`auto` default) + per-pass `format` in `describe`; resolves `auto` from the `float` flag. |
| CR-7 | Reserved | Export schema carries `stages`; compute stages can be added without a schema break. |

Evidence: `tests/change-request.test.ts` (23 tests), plus the MSL suite compiling `Input` to real `.air` via Apple's `metal` compiler. Full suite: 164 tests.

Note: stored params are **not** materialised against defaults on load or in the export payload — the versioned `primitives` registry is included so a consumer can materialise defaults/type/range itself. If you would prefer the server to emit fully-materialised params, that is a small follow-up.
