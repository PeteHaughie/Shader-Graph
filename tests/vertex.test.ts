import { describe, it, expect } from "vitest";
import { createGraph, addNode, connect } from "../src/graph/operations.js";
import { compileVertexGraph, validateGLSL } from "../src/compiler/vertex.js";

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
