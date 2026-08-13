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

describe("new primitives", () => {
  it("Time", () =>
    testPrimitive((g) => {
      g = addNode(g, "Time", { speed: 0.5 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      return connect(g, nodes[0].id, "out", nodes[1].id, "source");
    }));

  it("SmoothNoise", () =>
    testPrimitive((g) => {
      g = addNode(g, "SmoothNoise", { scale: 3, seed: 1 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      return connect(g, nodes[0].id, "out", nodes[1].id, "source");
    }));

  it("FractalNoise", () =>
    testPrimitive((g) => {
      g = addNode(g, "FractalNoise", { scale: 2, seed: 0, octaves: 4, lacunarity: 2, gain: 0.5 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      return connect(g, nodes[0].id, "out", nodes[1].id, "source");
    }));

  it("SmoothStep", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 3, seed: 0 });
      g = addNode(g, "SolidColor", { r: 0.3, g: 0.3, b: 0.3, a: 1 });
      g = addNode(g, "SolidColor", { r: 0.7, g: 0.7, b: 0.7, a: 1 });
      g = addNode(g, "SmoothStep", {});
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[3].id, "value");
      g = connect(g, nodes[1].id, "out", nodes[3].id, "edge0");
      g = connect(g, nodes[2].id, "out", nodes[3].id, "edge1");
      return connect(g, nodes[3].id, "out", nodes[4].id, "source");
    }));

  it("Palette (fire)", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 3, seed: 0 });
      g = addNode(g, "Palette", { mode: "fire" });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "value");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("Palette (ice)", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 3, seed: 0 });
      g = addNode(g, "Palette", { mode: "ice" });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "value");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("Palette (rainbow)", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 3, seed: 0 });
      g = addNode(g, "Palette", { mode: "rainbow" });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "value");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("Time + FractalNoise + Palette full pipeline", () =>
    testPrimitive((g) => {
      g = addNode(g, "FractalNoise", { scale: 3, seed: 0, octaves: 3, lacunarity: 2, gain: 0.5 });
      g = addNode(g, "Time", { speed: 0.1 });
      g = addNode(g, "Palette", { mode: "fire" });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[2].id, "value");
      return connect(g, nodes[2].id, "out", nodes[3].id, "source");
    }));

  it("Time wired to Mix.factor for animated blend", () =>
    testPrimitive((g) => {
      g = addNode(g, "Noise", { scale: 3, seed: 0 });
      g = addNode(g, "SolidColor", { r: 1, g: 0, b: 0, a: 1 });
      g = addNode(g, "Time", { speed: 0.2 });
      g = addNode(g, "Mix", { factor: 0.5 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[3].id, "a");
      g = connect(g, nodes[1].id, "out", nodes[3].id, "b");
      g = connect(g, nodes[2].id, "out", nodes[3].id, "factor");
      return connect(g, nodes[3].id, "out", nodes[4].id, "source");
    }));

  it("Time wired to Blur.radius for animated blur", () =>
    testPrimitive((g) => {
      g = addNode(g, "Texture", { url: "" });
      g = addNode(g, "Time", { speed: 1 });
      g = addNode(g, "Blur", { radius: 2 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[2].id, "image");
      g = connect(g, nodes[1].id, "out", nodes[2].id, "radius");
      return connect(g, nodes[2].id, "out", nodes[3].id, "source");
    }));

  it("Time wired to Gradient.angle for rotating gradient", () =>
    testPrimitive((g) => {
      g = addNode(g, "SolidColor", { r: 0, g: 0, b: 1, a: 1 });
      g = addNode(g, "SolidColor", { r: 1, g: 0, b: 0, a: 1 });
      g = addNode(g, "Time", { speed: 0.5 });
      g = addNode(g, "Gradient", { angle: 0 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[3].id, "colorA");
      g = connect(g, nodes[1].id, "out", nodes[3].id, "colorB");
      g = connect(g, nodes[2].id, "out", nodes[3].id, "angle");
      return connect(g, nodes[3].id, "out", nodes[4].id, "source");
    }));

  it("DiffuseLight", () =>
    testPrimitive((g) => {
      g = addNode(g, "SolidColor", { r: 0, g: 1, b: 0, a: 0 });
      g = addNode(g, "DiffuseLight", { lightDir: "1,1,1", color: "1,0,0" });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "normal");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("AmbientLight", () =>
    testPrimitive((g) => {
      g = addNode(g, "AmbientLight", { color: "0.1,0,0" });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      return connect(g, nodes[0].id, "out", nodes[1].id, "source");
    }));

  it("DiffuseLight + AmbientLight combined", () =>
    testPrimitive((g) => {
      g = addNode(g, "SolidColor", { r: 0, g: 1, b: 0, a: 0 });
      g = addNode(g, "DiffuseLight", { lightDir: "1,1,1", color: "1,0,0" });
      g = addNode(g, "AmbientLight", { color: "0.05,0,0" });
      g = addNode(g, "Add", {});
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "normal");
      g = connect(g, nodes[1].id, "out", nodes[3].id, "a");
      g = connect(g, nodes[2].id, "out", nodes[3].id, "b");
      return connect(g, nodes[3].id, "out", nodes[4].id, "source");
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

describe("new features", () => {
  it("SpecularLight", () =>
    testPrimitive((g) => {
      g = addNode(g, "SolidColor", { r: 0, g: 1, b: 0, a: 0 });
      g = addNode(g, "SolidColor", { r: 0, g: 0, b: 1, a: 0 });
      g = addNode(g, "SolidColor", { r: 1, g: 1, b: 0, a: 0 });
      g = addNode(g, "SpecularLight", { shininess: 64, color: "1,1,1" });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[3].id, "normal");
      g = connect(g, nodes[1].id, "out", nodes[3].id, "viewDir");
      g = connect(g, nodes[2].id, "out", nodes[3].id, "lightDir");
      return connect(g, nodes[3].id, "out", nodes[4].id, "source");
    }));

  it("SpecularLight + DiffuseLight + AmbientLight combined", () =>
    testPrimitive((g) => {
      g = addNode(g, "SolidColor", { r: 0, g: 1, b: 0, a: 0 });
      g = addNode(g, "DiffuseLight", { lightDir: "1,1,1", color: "1,0,0" });
      g = addNode(g, "SpecularLight", { shininess: 32, color: "1,1,1" });
      g = addNode(g, "AmbientLight", { color: "0.05,0,0" });
      g = addNode(g, "Add", {});
      g = addNode(g, "Add", {});
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "normal");
      g = connect(g, nodes[0].id, "out", nodes[2].id, "normal");
      g = connect(g, nodes[0].id, "out", nodes[2].id, "viewDir");
      g = connect(g, nodes[0].id, "out", nodes[2].id, "lightDir");
      g = connect(g, nodes[1].id, "out", nodes[4].id, "a");
      g = connect(g, nodes[2].id, "out", nodes[4].id, "b");
      g = connect(g, nodes[4].id, "out", nodes[5].id, "a");
      g = connect(g, nodes[3].id, "out", nodes[5].id, "b");
      return connect(g, nodes[5].id, "out", nodes[6].id, "source");
    }));
});

describe("normal map and shadow map", () => {
  it("NormalMap (procedural, no URL)", () =>
    testPrimitive((g) => {
      g = addNode(g, "SolidColor", { r: 0, g: 1, b: 0, a: 0 });
      g = addNode(g, "SolidColor", { r: 1, g: 0, b: 0, a: 0 });
      g = addNode(g, "NormalMap", { url: "", intensity: 1 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[2].id, "normal");
      g = connect(g, nodes[1].id, "out", nodes[2].id, "position");
      return connect(g, nodes[2].id, "out", nodes[3].id, "source");
    }));

  it("ShadowMap", () =>
    testPrimitive((g) => {
      g = addNode(g, "SolidColor", { r: 1, g: 0, b: 0, a: 0 });
      g = addNode(g, "ShadowMap", { bias: 0.005 });
      g = addNode(g, "Multiply", {});
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "position");
      g = connect(g, nodes[0].id, "out", nodes[2].id, "a");
      g = connect(g, nodes[1].id, "out", nodes[2].id, "b");
      return connect(g, nodes[2].id, "out", nodes[3].id, "source");
    }));
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
