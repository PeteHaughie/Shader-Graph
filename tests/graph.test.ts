import { describe, it, expect } from "vitest";
import { createGraph, addNode, connect, removeNode, disconnect, setParameter } from "../src/graph/operations.ts";
import { validateGraph } from "../src/graph/validation.ts";
import { topologicalSort } from "../src/graph/operations.ts";
import { getPrimitive } from "../src/graph/registry.ts";

describe("graph operations", () => {
  it("creates an empty graph", () => {
    const g = createGraph();
    expect(g.nodes.size).toBe(0);
    expect(g.edges.size).toBe(0);
  });

  it("adds a node", () => {
    const g = createGraph();
    const g2 = addNode(g, "Noise", { scale: 1, seed: 0 });
    expect(g2.nodes.size).toBe(1);
    expect(g.nodes.size).toBe(0);
  });

  it("removes a node and its edges", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "Output", {});
    const noiseId = [...g.nodes.values()][0].id;
    const outputId = [...g.nodes.values()][1].id;
    g = connect(g, noiseId, "out", outputId, "source");
    expect(g.edges.size).toBe(1);
    g = removeNode(g, noiseId);
    expect(g.nodes.size).toBe(1);
    expect(g.edges.size).toBe(0);
  });

  it("connects nodes", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "Output", {});
    const nodes = [...g.nodes.values()];
    g = connect(g, nodes[0].id, "out", nodes[1].id, "source");
    expect(g.edges.size).toBe(1);
  });

  it("disconnects nodes", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "Output", {});
    const nodes = [...g.nodes.values()];
    g = connect(g, nodes[0].id, "out", nodes[1].id, "source");
    const edgeId = [...g.edges.keys()][0];
    g = disconnect(g, edgeId);
    expect(g.edges.size).toBe(0);
  });

  it("sets a parameter", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    const nodeId = [...g.nodes.keys()][0];
    g = setParameter(g, nodeId, "scale", 5);
    expect(g.nodes.get(nodeId)?.params.scale).toBe(5);
  });

  it("preserves immutability", () => {
    const g = createGraph();
    const g2 = addNode(g, "Noise", { scale: 1, seed: 0 });
    expect(g.nodes.size).toBe(0);
    expect(g2.nodes.size).toBe(1);
    expect(g.id).not.toBe(g2.id);
  });
});

describe("validation", () => {
  it("rejects graph with unknown primitive", () => {
    let g = createGraph();
    g = addNode(g, "InvalidType", {});
    const result = validateGraph(g);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Unknown primitive"))).toBe(true);
  });

  it("rejects graph without Output node", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    const result = validateGraph(g);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("no Output node"))).toBe(true);
  });

  it("rejects graph with unconnected inputs", () => {
    let g = createGraph();
    g = addNode(g, "Blur", { radius: 2 });
    g = addNode(g, "Output", {});
    const nodes = [...g.nodes.values()];
    g = connect(g, nodes[0].id, "out", nodes[1].id, "source");
    const result = validateGraph(g);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("not connected"))).toBe(true);
  });

  it("rejects type mismatch", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "Output", {});
    const nodes = [...g.nodes.values()];
    g = connect(g, nodes[0].id, "out", nodes[1].id, "source");
    const result = validateGraph(g);
    expect(result.valid).toBe(true);
  });

  it("accepts a valid complete graph", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "Blur", { radius: 2 });
    g = addNode(g, "Output", {});
    const [noise, blur, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", blur.id, "image");
    g = connect(g, blur.id, "out", output.id, "source");
    const result = validateGraph(g);
    expect(result.valid).toBe(true);
  });

  it("detects cycles", () => {
    let g = createGraph();
    g = addNode(g, "Mix", { factor: 0.5 });
    g = addNode(g, "Blur", { radius: 2 });
    const [mix, blur] = [...g.nodes.values()];
    g = connect(g, mix.id, "out", blur.id, "image");
    g = connect(g, blur.id, "out", mix.id, "a");
    const result = validateGraph(g);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("cycle"))).toBe(true);
  });

  it("rejects out-of-range parameter", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 200, seed: 0 });
    const result = validateGraph(g);
    expect(result.errors.some((e) => e.message.includes("above max"))).toBe(true);
  });
});

describe("topologicalSort", () => {
  it("sorts nodes in dependency order", () => {
    let g = createGraph();
    g = addNode(g, "Output", {});
    g = addNode(g, "Blur", { radius: 2 });
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    const [output, blur, noise] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", blur.id, "image");
    g = connect(g, blur.id, "out", output.id, "source");
    const { order } = topologicalSort(g);
    expect(order.indexOf(noise.id)).toBeLessThan(order.indexOf(blur.id));
    expect(order.indexOf(blur.id)).toBeLessThan(order.indexOf(output.id));
  });
});

describe("multi-pass primitives", () => {
  it("registers PassTarget and ReadBuffer", () => {
    const pt = getPrimitive("PassTarget");
    const rb = getPrimitive("ReadBuffer");
    expect(pt).toBeDefined();
    expect(rb).toBeDefined();
    expect(pt?.params.map((p) => p.name)).toEqual(["name", "persistent", "float", "width", "height"]);
    expect(rb?.inputs[0]).toMatchObject({ name: "uv", optional: true });
  });

  it("accepts a valid two-pass graph", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "PassTarget", { name: "blurBuf", persistent: 0, float: 0, width: "$WIDTH", height: "$HEIGHT" });
    g = addNode(g, "ReadBuffer", { name: "blurBuf" });
    g = addNode(g, "Output", {});
    const [noise, target, read, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", target.id, "source");
    g = connect(g, read.id, "out", output.id, "source");
    const result = validateGraph(g);
    expect(result.valid).toBe(true);
  });

  it("accepts a persistent self-read (feedback) buffer", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "ReadBuffer", { name: "fb" });
    g = addNode(g, "Mix", { factor: 0.5 });
    g = addNode(g, "PassTarget", { name: "fb", persistent: 1, float: 0, width: "$WIDTH", height: "$HEIGHT" });
    g = addNode(g, "Output", {});
    const [noise, read, mix, target, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", mix.id, "a");
    g = connect(g, read.id, "out", mix.id, "b");
    g = connect(g, mix.id, "out", target.id, "source");
    g = connect(g, read.id, "out", output.id, "source");
    const result = validateGraph(g);
    expect(result.valid).toBe(true);
  });

  it("rejects non-persistent self-read buffer", () => {
    let g = createGraph();
    g = addNode(g, "ReadBuffer", { name: "fb" });
    g = addNode(g, "PassTarget", { name: "fb", persistent: 0, float: 0, width: "$WIDTH", height: "$HEIGHT" });
    const [read, target] = [...g.nodes.values()];
    g = connect(g, read.id, "out", target.id, "source");
    const result = validateGraph(g);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("is read inside the pass that writes it"))).toBe(true);
  });

  it("rejects a ReadBuffer with no matching PassTarget", () => {
    let g = createGraph();
    g = addNode(g, "ReadBuffer", { name: "ghost" });
    g = addNode(g, "Output", {});
    const [read, output] = [...g.nodes.values()];
    g = connect(g, read.id, "out", output.id, "source");
    const result = validateGraph(g);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("has no matching PassTarget"))).toBe(true);
  });

  it("rejects duplicate PassTarget buffer names", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "PassTarget", { name: "buf", persistent: 0, float: 0, width: "$WIDTH", height: "$HEIGHT" });
    g = addNode(g, "PassTarget", { name: "buf", persistent: 0, float: 0, width: "$WIDTH", height: "$HEIGHT" });
    g = addNode(g, "Output", {});
    const [noise, t1, t2, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", t1.id, "source");
    g = connect(g, noise.id, "out", t2.id, "source");
    g = connect(g, noise.id, "out", output.id, "source");
    const result = validateGraph(g);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Duplicate PassTarget buffer name"))).toBe(true);
  });

  it("rejects buffer names that are not valid identifiers", () => {
    let g = createGraph();
    g = addNode(g, "ReadBuffer", { name: "my buffer" });
    g = addNode(g, "Output", {});
    const [read, output] = [...g.nodes.values()];
    g = connect(g, read.id, "out", output.id, "source");
    const result = validateGraph(g);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("not a valid GLSL identifier"))).toBe(true);
  });

  it("rejects invalid size equations", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "PassTarget", { name: "buf", persistent: 0, float: 0, width: "$blurAmount", height: "$HEIGHT" });
    g = addNode(g, "Output", {});
    const [noise, target, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", target.id, "source");
    g = connect(g, noise.id, "out", output.id, "source");
    const result = validateGraph(g);
    expect(result.errors.some((e) => e.message.includes("Invalid width equation"))).toBe(true);
  });

  it("accepts valid size equations", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "PassTarget", { name: "buf", persistent: 0, float: 0, width: "$WIDTH/16.0", height: "$HEIGHT/16.0" });
    g = addNode(g, "Output", {});
    const [noise, target, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", target.id, "source");
    g = connect(g, noise.id, "out", output.id, "source");
    const result = validateGraph(g);
    expect(result.valid).toBe(true);
  });

  it("rejects pass ordering cycles", () => {
    let g = createGraph();
    g = addNode(g, "ReadBuffer", { name: "b" });
    g = addNode(g, "PassTarget", { name: "c", persistent: 0, float: 0, width: "$WIDTH", height: "$HEIGHT" });
    g = addNode(g, "ReadBuffer", { name: "c" });
    g = addNode(g, "PassTarget", { name: "b", persistent: 0, float: 0, width: "$WIDTH", height: "$HEIGHT" });
    g = addNode(g, "ReadBuffer", { name: "c" });
    g = addNode(g, "Output", {});
    const [readB, passA, readC, passB, readC2, output] = [...g.nodes.values()];
    g = connect(g, readB.id, "out", passA.id, "source");
    g = connect(g, readC.id, "out", passB.id, "source");
    g = connect(g, readC2.id, "out", output.id, "source");
    const result = validateGraph(g);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Pass ordering cycle"))).toBe(true);
  });

  it("rejects multiple Output nodes", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "Output", {});
    g = addNode(g, "Output", {});
    const [noise, o1, o2] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", o1.id, "source");
    g = connect(g, noise.id, "out", o2.id, "source");
    const result = validateGraph(g);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("more than one Output"))).toBe(true);
  });
});
