import { describe, it, expect } from "vitest";
import { createGraph, addNode, connect } from "../src/graph/operations.js";
import { compileVertexGraph, validateGLSL } from "../src/compiler/vertex.js";
import { compileGraph, validateGLSL as validateGLSLFrag } from "../src/compiler/compile.js";

async function testVertexShader(build: (g: ReturnType<typeof createGraph>) => ReturnType<typeof createGraph>): Promise<void> {
  let g = createGraph();
  g = build(g);
  const compiled = compileVertexGraph(g);
  expect(compiled.valid, `compileVertexGraph failed: ${compiled.errors}`).toBe(true);
  const validation = await validateGLSL(compiled.source);
  if (!validation.valid) {
    console.log(compiled.source);
    console.log(validation.output);
  }
  expect(validation.valid).toBe(true);
}

describe("vertex shader compilation", () => {
  it("VertexPosition → VertexOutput", () =>
    testVertexShader((g) => {
      g = addNode(g, "VertexPosition", {});
      g = addNode(g, "VertexOutput", {});
      const nodes = [...g.nodes.values()];
      return connect(g, nodes[0].id, "out", nodes[1].id, "position");
    }));

  it("VertexPosition → ModelViewProjection → VertexOutput", () =>
    testVertexShader((g) => {
      g = addNode(g, "VertexPosition", {});
      g = addNode(g, "ModelViewProjection", {});
      g = addNode(g, "VertexOutput", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "position");
      return connect(g, nodes[1].id, "out", nodes[2].id, "position");
    }));

  it("VertexPosition → Translate → VertexOutput", () =>
    testVertexShader((g) => {
      g = addNode(g, "VertexPosition", {});
      g = addNode(g, "Translate", { x: 1, y: 2, z: 0 });
      g = addNode(g, "VertexOutput", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "position");
      return connect(g, nodes[1].id, "out", nodes[2].id, "position");
    }));

  it("VertexPosition → Rotate (Y axis) → VertexOutput", () =>
    testVertexShader((g) => {
      g = addNode(g, "VertexPosition", {});
      g = addNode(g, "Rotate", { angle: 45, axis: "y" });
      g = addNode(g, "VertexOutput", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "position");
      return connect(g, nodes[1].id, "out", nodes[2].id, "position");
    }));

  it("VertexPosition → Scale → VertexOutput", () =>
    testVertexShader((g) => {
      g = addNode(g, "VertexPosition", {});
      g = addNode(g, "Scale", { x: 2, y: 1, z: 1 });
      g = addNode(g, "VertexOutput", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "position");
      return connect(g, nodes[1].id, "out", nodes[2].id, "position");
    }));

  it("VertexPosition → Wave → VertexOutput (waving flag)", () =>
    testVertexShader((g) => {
      g = addNode(g, "VertexPosition", {});
      g = addNode(g, "Wave", { amplitude: 0.3, frequency: 2, speed: 1, axis: "z" });
      g = addNode(g, "VertexOutput", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "position");
      return connect(g, nodes[1].id, "out", nodes[2].id, "position");
    }));

  it("VertexPosition → NoiseDisplace → VertexOutput", () =>
    testVertexShader((g) => {
      g = addNode(g, "VertexPosition", {});
      g = addNode(g, "NoiseDisplace", { amount: 0.5, scale: 2 });
      g = addNode(g, "VertexOutput", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "position");
      return connect(g, nodes[1].id, "out", nodes[2].id, "position");
    }));

  it("VertexPosition → Bend → VertexOutput", () =>
    testVertexShader((g) => {
      g = addNode(g, "VertexPosition", {});
      g = addNode(g, "Bend", { angle: 30, axis: "y" });
      g = addNode(g, "VertexOutput", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "position");
      return connect(g, nodes[1].id, "out", nodes[2].id, "position");
    }));

  it("Full pipeline: VertexPosition → Wave → Translate → ModelViewProjection → VertexOutput", () =>
    testVertexShader((g) => {
      g = addNode(g, "VertexPosition", {});
      g = addNode(g, "Wave", { amplitude: 0.3, frequency: 2, speed: 1, axis: "z" });
      g = addNode(g, "Translate", { x: 0, y: 0, z: -5 });
      g = addNode(g, "ModelViewProjection", {});
      g = addNode(g, "VertexOutput", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "position");
      g = connect(g, nodes[1].id, "out", nodes[2].id, "position");
      g = connect(g, nodes[2].id, "out", nodes[3].id, "position");
      return connect(g, nodes[3].id, "out", nodes[4].id, "position");
    }));
});

describe("vertex validation", () => {
  it("rejects vertex graph with no VertexOutput", () => {
    const g = createGraph();
    const result = compileVertexGraph(g);
    expect(result.valid).toBe(false);
  });

  it("rejects disconnected vertex graph", () => {
    let g = createGraph();
    g = addNode(g, "VertexPosition", {});
    g = addNode(g, "VertexOutput", {});
    const result = compileVertexGraph(g);
    expect(result.valid).toBe(false);
  });
});

describe("compile_pair", () => {
  it("vertex + fragment with varying passthrough", async () => {
    let vg = createGraph();
    vg = addNode(vg, "VertexPosition", {});
    vg = addNode(vg, "VertexNormal", {});
    vg = addNode(vg, "PassToFragment", { name: "vNormal" });
    vg = addNode(vg, "ModelViewProjection", {});
    vg = addNode(vg, "VertexOutput", {});
    const vnodes = [...vg.nodes.values()];
    vg = connect(vg, vnodes[1].id, "out", vnodes[2].id, "value");
    vg = connect(vg, vnodes[0].id, "out", vnodes[3].id, "position");
    vg = connect(vg, vnodes[3].id, "out", vnodes[4].id, "position");
    const vtxResult = compileVertexGraph(vg);
    expect(vtxResult.valid).toBe(true);
    expect(vtxResult.varyings?.length).toBe(1);
    expect(vtxResult.varyings?.[0].name).toBe("vNormal");

    let fg = createGraph();
    fg = addNode(fg, "FromVertex", { name: "vNormal" });
    fg = addNode(fg, "DiffuseLight", { lightDir: "1,1,1", color: "1,0,0" });
    fg = addNode(fg, "AmbientLight", { color: "0.05,0,0" });
    fg = addNode(fg, "Add", {});
    fg = addNode(fg, "Output", {});
    const fnodes = [...fg.nodes.values()];
    fg = connect(fg, fnodes[0].id, "out", fnodes[1].id, "normal");
    fg = connect(fg, fnodes[1].id, "out", fnodes[3].id, "a");
    fg = connect(fg, fnodes[2].id, "out", fnodes[3].id, "b");
    fg = connect(fg, fnodes[3].id, "out", fnodes[4].id, "source");
    const fragResult = compileGraph(fg, vtxResult.varyings);
    expect(fragResult.valid).toBe(true);

    const vtxVal = await validateGLSL(vtxResult.source);
    const fragVal = await validateGLSLFrag(fragResult.source);
    expect(vtxVal.valid).toBe(true);
    expect(fragVal.valid).toBe(true);

    expect(vtxResult.source).toContain("varying vec4 vNormal");
    expect(vtxResult.source).toContain("vNormal =");
    expect(fragResult.source).toContain("varying vec4 vNormal");
  });
});

describe("validateGLSL (vertex)", () => {
  it("accepts valid vertex shader", async () => {
    const source = `#version 100
precision highp float;
attribute vec3 aPosition;
uniform mat4 uModelViewProjection;
void main() {
  gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
}`;
    const result = await validateGLSL(source);
    expect(result.valid).toBe(true);
  });

  it("rejects invalid vertex shader", async () => {
    const source = `#version 100
precision highp float;
void main() {
  gl_FragColor = vec4(1.0);
}`;
    const result = await validateGLSL(source);
    expect(result.valid).toBe(false);
  });
});
