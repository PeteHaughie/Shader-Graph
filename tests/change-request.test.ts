import { describe, it, expect } from "vitest";
import {
  createGraph,
  addNode,
  connect,
  loadGraph,
  serializeGraph,
  computeGraphId,
} from "../src/graph/operations.js";
import { buildGraphDocument, GRAPH_SCHEMA } from "../src/graph/document.js";
import { getPrimitive, listPrimitives, primitiveRegistryInfo } from "../src/graph/registry.js";
import { validateGraph } from "../src/graph/validation.js";
import { analyzePasses } from "../src/graph/passes.js";
import { PortType, GraphType } from "../src/graph/primitives.js";
import { parseColor, colorLiteral, isValidColor } from "../src/graph/params.js";
import { compileGraph, validateGLSL } from "../src/compiler/compile.js";
import { compileMetalFragment } from "../src/compiler/msl/fragment.js";
import { validateMetal } from "../src/compiler/msl/validate.js";

type G = ReturnType<typeof createGraph>;

describe("CR-1 video input primitive", () => {
  it("registers an Input primitive", () => {
    const def = getPrimitive("Input");
    expect(def).toBeDefined();
    expect(def!.graphType).toBe(GraphType.Fragment);
    expect(def!.params.map((p) => p.name)).toEqual(["index"]);
  });

  it("compiles Input to valid GLSL and MSL", async () => {
    let g = createGraph();
    g = addNode(g, "Input", { index: 0 });
    g = addNode(g, "Output", {});
    const [input, output] = [...g.nodes.values()];
    g = connect(g, input.id, "out", output.id, "source");

    const glsl = compileGraph(g);
    expect(glsl.valid, glsl.errors).toBe(true);
    expect(glsl.source).toContain("uniform sampler2D uInput0;");
    expect(glsl.source).toContain("texture2D(uInput0");
    expect((await validateGLSL(glsl.source)).valid).toBe(true);

    const msl = compileMetalFragment(g);
    expect(msl.valid, msl.errors).toBe(true);
    expect(msl.source).toContain("uInput0");
    expect(msl.source).toContain("uInput0.sample(_samp");
    expect((await validateMetal(msl.source)).valid).toBe(true);
  });

  it("reports uInputN as an input uniform in describe", () => {
    let g = createGraph();
    g = addNode(g, "Input", { index: 2 });
    g = addNode(g, "Output", {});
    const [input, output] = [...g.nodes.values()];
    g = connect(g, input.id, "out", output.id, "source");
    const meta = compileGraph(g).metadata!;
    expect(meta.uniforms.some((u) => u.name === "uInput2" && u.semantic === "input")).toBe(true);
  });
});

describe("CR-2 import / round-trip / stable ids", () => {
  function sampleGraph(): G {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 2, seed: 1 });
    g = addNode(g, "Blur", { radius: 3 });
    g = addNode(g, "Output", {});
    const [noise, blur, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", blur.id, "image");
    g = connect(g, blur.id, "out", output.id, "source");
    return g;
  }

  it("round-trips a graph through export -> load with identical content", () => {
    const g = sampleGraph();
    const doc = buildGraphDocument(g, "metal", GraphType.Fragment);
    const loaded = loadGraph(doc, GraphType.Fragment);
    expect(loaded.errors).toEqual([]);
    expect(serializeGraph(loaded.state)).toEqual(serializeGraph(g));
    expect(loaded.state.id).toBe(g.id);
  });

  it("honours client-supplied node and edge ids", () => {
    const doc = {
      graphType: GraphType.Fragment,
      nodes: [
        { id: "src", type: "Noise", params: { scale: 1, seed: 0 } },
        { id: "sink", type: "Output", params: {} },
      ],
      edges: [{ id: "wire", from: "src", fromPort: "out", to: "sink", toPort: "source" }],
    };
    const { state, errors } = loadGraph(doc);
    expect(errors).toEqual([]);
    expect([...state.nodes.keys()].sort()).toEqual(["sink", "src"]);
    expect([...state.edges.keys()]).toEqual(["wire"]);
    expect(validateGraph(state).valid).toBe(true);
  });

  it("assigns deterministic index ids when omitted", () => {
    const doc = {
      nodes: [
        { type: "Noise", params: { scale: 1, seed: 0 } },
        { type: "Output", params: {} },
      ],
      edges: [{ from: "n0", fromPort: "out", to: "n1", toPort: "source" }],
    };
    const { state, errors } = loadGraph(doc);
    expect(errors).toEqual([]);
    expect([...state.nodes.keys()].sort()).toEqual(["n0", "n1"]);
  });

  it("gives identical graphs the same content id and different graphs different ids", () => {
    const a = sampleGraph();
    const b = sampleGraph();
    const c = addNode(sampleGraph(), "Invert", {});

    expect(a.id).toBe(b.id);
    expect(a.id).not.toBe(c.id);
    expect(a.id.startsWith("g_")).toBe(true);
  });

  it("reports load errors for dangling edges", () => {
    const { errors } = loadGraph({
      nodes: [{ id: "a", type: "Output", params: {} }],
      edges: [{ from: "ghost", fromPort: "out", to: "a", toPort: "source" }],
    });
    expect(errors.some((e) => e.includes("unknown source node"))).toBe(true);
  });

  it("export document carries a stable id", () => {
    const g = sampleGraph();
    expect(computeGraphId(g)).toBe(g.id);
    expect(buildGraphDocument(g).id).toBe(g.id);
  });
});

describe("CR-3 typed color and enum params", () => {
  it("marks light colours as color params and mode/axis as enums", () => {
    const ambient = getPrimitive("AmbientLight")!;
    expect(ambient.params.find((p) => p.name === "color")!.type).toBe("color");
    const palette = getPrimitive("Palette")!;
    const mode = palette.params.find((p) => p.name === "mode")!;
    expect(mode.type).toBe("enum");
    expect(mode.variants).toEqual(["fire", "ice", "rainbow", "gold", "neon"]);
    const rotate = getPrimitive("Rotate")!;
    expect(rotate.params.find((p) => p.name === "axis")!.variants).toEqual(["x", "y", "z"]);
  });

  it("parses array, hex and CSV colours", () => {
    expect(parseColor([1, 0, 0, 1])).toEqual([1, 0, 0, 1]);
    expect(parseColor("#ff0000")).toEqual([1, 0, 0, 1]);
    expect(parseColor("0, 1, 0")).toEqual([0, 1, 0, 1]);
    expect(isValidColor("#00ff00ff")).toBe(true);
    expect(isValidColor("not a colour")).toBe(false);
  });

  it("compiles array and hex colours identically", () => {
    const build = (color: unknown) => {
      let g = createGraph();
      g = addNode(g, "AmbientLight", { color });
      g = addNode(g, "Output", {});
      const [ambient, output] = [...g.nodes.values()];
      g = connect(g, ambient.id, "out", output.id, "source");
      return compileGraph(g);
    };
    const fromArray = build([0, 1, 0, 1]);
    const fromHex = build("#00ff00");
    expect(fromArray.valid, fromArray.errors).toBe(true);
    expect(fromArray.source).toContain("vec4(vec3(0.0, 1.0, 0.0), 1.0)");
    expect(fromHex.source).toContain("vec4(vec3(0.0, 1.0, 0.0), 1.0)");
  });

  it("still accepts a legacy CSV colour string", () => {
    expect(colorLiteral("0.5, 0.5, 0.5")).toBe("0.5, 0.5, 0.5");
  });

  it("rejects an invalid enum value and an invalid colour", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "Palette", { mode: "bogus" });
    g = addNode(g, "Output", {});
    const [noise, palette, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", palette.id, "value");
    g = connect(g, palette.id, "out", output.id, "source");
    expect(validateGraph(g).valid).toBe(false);

    let h = createGraph();
    h = addNode(h, "AmbientLight", { color: "nope" });
    h = addNode(h, "Output", {});
    const [amb, out] = [...h.nodes.values()];
    h = connect(h, amb.id, "out", out.id, "source");
    expect(validateGraph(h).valid).toBe(false);
  });
});

describe("CR-4 port typing", () => {
  it("exposes vec2/mat4/float port types", () => {
    expect(PortType.Vec2).toBe("vec2");
    expect(PortType.Mat4).toBe("mat4");
  });

  it("types VertexTexCoord as vec2", () => {
    expect(getPrimitive("VertexTexCoord")!.outputs[0].type).toBe(PortType.Vec2);
  });
});

describe("CR-5 self-describing versioned payload", () => {
  it("exposes a versioned primitive registry", () => {
    const info = primitiveRegistryInfo();
    expect(info.version).toBeGreaterThanOrEqual(2);
    expect(info.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(info.count).toBe(listPrimitives().length);
  });

  it("builds a self-describing graph payload", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "Output", {});
    const [noise, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", output.id, "source");

    const doc = buildGraphDocument(g, "metal", GraphType.Fragment);
    expect(doc.schema).toBe(GRAPH_SCHEMA);
    expect(doc.graphType).toBe(GraphType.Fragment);
    expect(doc.target).toBe("metal");
    expect(doc.primitives.version).toBeGreaterThanOrEqual(2);
    expect(doc.id).toBe(g.id);
    expect(doc.stages).toContain(GraphType.Fragment);
    expect(doc.nodes.length).toBe(2);
    expect(doc.edges.length).toBe(1);
  });
});

describe("CR-6 explicit PassTarget format", () => {
  function twoPass(format?: string): G {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "PassTarget", { name: "buf", persistent: 0, float: 0, width: "$WIDTH", height: "$HEIGHT", ...(format ? { format } : {}) });
    g = addNode(g, "ReadBuffer", { name: "buf" });
    g = addNode(g, "Output", {});
    const [noise, target, read, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", target.id, "source");
    g = connect(g, read.id, "out", output.id, "source");
    return g;
  }

  it("defaults format by resolving auto + float", () => {
    const meta = analyzePasses(twoPass());
    expect(meta.passes[0].format).toBe("rgba8");
  });

  it("reports an explicit format", () => {
    const meta = analyzePasses(twoPass("rgba16f"));
    expect(meta.passes[0].format).toBe("rgba16f");
    expect(meta.buffers[0].format).toBe("rgba16f");
  });

  it("resolves float buffers to rgba32f under auto", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "PassTarget", { name: "fb", persistent: 1, float: 1, width: "$WIDTH", height: "$HEIGHT" });
    g = addNode(g, "ReadBuffer", { name: "fb" });
    g = addNode(g, "Mix", { factor: 0.5 });
    g = addNode(g, "Output", {});
    const [noise, target, read, mix, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", mix.id, "a");
    g = connect(g, read.id, "out", mix.id, "b");
    g = connect(g, mix.id, "out", target.id, "source");
    g = connect(g, read.id, "out", output.id, "source");
    const meta = analyzePasses(g);
    expect(meta.passes.find((p) => p.target === "fb")!.format).toBe("rgba32f");
  });

  it("rejects an invalid format", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "PassTarget", { name: "buf", persistent: 0, float: 0, format: "bogus", width: "$WIDTH", height: "$HEIGHT" });
    g = addNode(g, "ReadBuffer", { name: "buf" });
    g = addNode(g, "Output", {});
    const [noise, target, read, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", target.id, "source");
    g = connect(g, read.id, "out", output.id, "source");
    const errors = analyzePasses(g).errors.join("\n");
    expect(errors).toContain("Invalid format");
  });

  it("keeps old graphs without format valid (optional param)", () => {
    const withFormat = twoPass("rgba16f");
    const without = twoPass();
    expect(validateGraph(withFormat).valid).toBe(true);
    expect(validateGraph(without).valid).toBe(true);
  });
});
