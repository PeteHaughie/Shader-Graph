import { describe, it, expect } from "vitest";
import { createGraph, addNode, connect } from "../src/graph/operations.js";
import { compileGraph, validateGLSL } from "../src/compiler/compile.js";

async function testPrimitive(build: (g: ReturnType<typeof createGraph>) => ReturnType<typeof createGraph>): Promise<void> {
  let g = createGraph();
  g = build(g);
  const compiled = compileGraph(g);
  expect(compiled.valid, `compileGraph failed: ${compiled.errors}`).toBe(true);
  const validation = await validateGLSL(compiled.source);
  if (!validation.valid) {
    console.log(compiled.source);
    console.log(validation.output);
  }
  expect(validation.valid).toBe(true);
}

describe("all primitives compile to valid GLSL", () => {
  it("Texture (procedural)", () =>
    testPrimitive((g) => {
      g = addNode(g, "Texture", { url: "" });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      return connect(g, nodes[0].id, "out", nodes[1].id, "source");
    }));

  it("Noise", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 3, seed: 1.5 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      return connect(g, nodes[0].id, "out", nodes[1].id, "source");
    }));

  it("SolidColor", () =>
    testPrimitive((g) => {
      g = addNode(g, "SolidColor", { r: 0.2, g: 0.4, b: 0.8, a: 1 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      return connect(g, nodes[0].id, "out", nodes[1].id, "source");
    }));

  it("Gradient", () =>
    testPrimitive((g) => {
      g = addNode(g, "SolidColor", { r: 0, g: 0, b: 0, a: 1 });
      g = addNode(g, "SolidColor", { r: 1, g: 1, b: 1, a: 1 });
      g = addNode(g, "Gradient", { angle: 45 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[2].id, "colorA");
      g = connect(g, nodes[1].id, "out", nodes[2].id, "colorB");
      return connect(g, nodes[2].id, "out", nodes[3].id, "source");
    }));

  it("Checkerboard", () =>
    testPrimitive((g) => {
      g = addNode(g, "SolidColor", { r: 1, g: 1, b: 1, a: 1 });
      g = addNode(g, "SolidColor", { r: 0, g: 0, b: 0, a: 1 });
      g = addNode(g, "Checkerboard", { frequency: 8 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[2].id, "colorA");
      g = connect(g, nodes[1].id, "out", nodes[2].id, "colorB");
      return connect(g, nodes[2].id, "out", nodes[3].id, "source");
    }));

  it("Blur", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "Blur", { radius: 4 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "image");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("Glow", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "Glow", { intensity: 2 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "image");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("EdgeDetect", () =>
    testPrimitive((g) => {
      g = addNode(g, "Texture", { url: "" });
      g = addNode(g, "EdgeDetect", { strength: 1 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "image");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("Displace", () =>
    testPrimitive((g) => {
      g = addNode(g, "Texture", { url: "" });
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "Displace", { amount: 0.1 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[2].id, "image");
      g = connect(g, nodes[1].id, "out", nodes[2].id, "map");
      return connect(g, nodes[2].id, "out", nodes[3].id, "source");
    }));

  it("BrightnessContrast", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "BrightnessContrast", { brightness: 0.2, contrast: 0.3 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "image");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("HueShift", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "HueShift", { angle: 180 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "image");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("Saturation", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "Saturation", { amount: 1.5 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "image");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("Invert", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "Invert", {});
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "image");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("Threshold", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "Threshold", { level: 0.5 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "image");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("Mix", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "SolidColor", { r: 1, g: 0, b: 0, a: 1 });
      g = addNode(g, "Mix", { factor: 0.5 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[2].id, "a");
      g = connect(g, nodes[1].id, "out", nodes[2].id, "b");
      return connect(g, nodes[2].id, "out", nodes[3].id, "source");
    }));

  it("Add", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "SolidColor", { r: 1, g: 0, b: 0, a: 1 });
      g = addNode(g, "Add", {});
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[2].id, "a");
      g = connect(g, nodes[1].id, "out", nodes[2].id, "b");
      return connect(g, nodes[2].id, "out", nodes[3].id, "source");
    }));

  it("Subtract", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "SolidColor", { r: 1, g: 0, b: 0, a: 1 });
      g = addNode(g, "Subtract", {});
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[2].id, "a");
      g = connect(g, nodes[1].id, "out", nodes[2].id, "b");
      return connect(g, nodes[2].id, "out", nodes[3].id, "source");
    }));

  it("Multiply", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "SolidColor", { r: 1, g: 0, b: 0, a: 1 });
      g = addNode(g, "Multiply", {});
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[2].id, "a");
      g = connect(g, nodes[1].id, "out", nodes[2].id, "b");
      return connect(g, nodes[2].id, "out", nodes[3].id, "source");
    }));

  it("Mask", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "SolidColor", { r: 1, g: 0, b: 0, a: 1 });
      g = addNode(g, "Mask", { invert: 0 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[2].id, "image");
      g = connect(g, nodes[1].id, "out", nodes[2].id, "mask");
      return connect(g, nodes[2].id, "out", nodes[3].id, "source");
    }));

  it("Mask (inverted)", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "SolidColor", { r: 1, g: 0, b: 0, a: 1 });
      g = addNode(g, "Mask", { invert: 1 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[2].id, "image");
      g = connect(g, nodes[1].id, "out", nodes[2].id, "mask");
      return connect(g, nodes[2].id, "out", nodes[3].id, "source");
    }));
});

describe("compileGraph", () => {
  it("rejects invalid graph", () => {
    const g = createGraph();
    const result = compileGraph(g);
    expect(result.valid).toBe(false);
  });

  it("generates code in topological order", () => {
    let g = createGraph();
    g = addNode(g, "Output", {});
    g = addNode(g, "Blur", { radius: 2 });
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    const nodes = [...g.nodes.values()];
    g = connect(g, nodes[2].id, "out", nodes[1].id, "image");
    g = connect(g, nodes[1].id, "out", nodes[0].id, "source");
    const result = compileGraph(g);
    const source = result.source;
    const v0pos = source.indexOf("v0");
    const v1pos = source.indexOf("v1");
    expect(v0pos).toBeLessThan(v1pos);
    expect(v0pos).not.toBe(-1);
    expect(v1pos).not.toBe(-1);
  });
});

describe("validateGLSL", () => {
  it("accepts valid GLSL", async () => {
    const source = `#version 100
precision highp float;
void main() {
  gl_FragColor = vec4(1.0);
}`;
    const result = await validateGLSL(source);
    expect(result.valid).toBe(true);
  });

  it("rejects invalid GLSL", async () => {
    const source = `#version 100
precision highp float;
void main() {
  gl_FragColor = nonexistent;
}`;
    const result = await validateGLSL(source);
    expect(result.valid).toBe(false);
  });
});
