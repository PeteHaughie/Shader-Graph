import { describe, it, expect } from "vitest";
import { createGraph, addNode, connect } from "../src/graph/operations.js";
import { compileGraph, validateGLSL, describeFragmentGraph } from "../src/compiler/compile.js";

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
      g = addNode(g, "FragCoord", {});
      g = addNode(g, "Texture", { url: "" });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "uv");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
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
      g = addNode(g, "FragCoord", {});
      g = addNode(g, "Texture", { url: "" });
      g = addNode(g, "EdgeDetect", { strength: 1 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "uv");
      g = connect(g, nodes[1].id, "out", nodes[2].id, "image");
      return connect(g, nodes[2].id, "out", nodes[3].id, "source");
    }));

  it("Displace", () =>
    testPrimitive((g) => {
      const ids = {};
      g = addNode(g, "FragCoord", {}); ids.fc = [...g.nodes.keys()].pop();
      g = addNode(g, "Texture", { url: "" }); ids.tx = [...g.nodes.keys()].pop();
      g = addNode(g, "Noise", { scale: 1, seed: 0 }); ids.ns = [...g.nodes.keys()].pop();
      g = addNode(g, "Displace", { amount: 0.1 }); ids.dp = [...g.nodes.keys()].pop();
      g = addNode(g, "Output", {}); ids.out = [...g.nodes.keys()].pop();
      g = connect(g, ids.fc, "out", ids.tx, "uv");
      g = connect(g, ids.tx, "out", ids.dp, "image");
      g = connect(g, ids.ns, "out", ids.dp, "map");
      return connect(g, ids.dp, "out", ids.out, "source");
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
      g = addNode(g, "FragCoord", {});
      g = addNode(g, "Texture", { url: "" });
      g = addNode(g, "Time", { speed: 1 });
      g = addNode(g, "Blur", { radius: 2 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "uv");
      g = connect(g, nodes[1].id, "out", nodes[3].id, "image");
      g = connect(g, nodes[2].id, "out", nodes[3].id, "radius");
      return connect(g, nodes[3].id, "out", nodes[4].id, "source");
    }));

  it("TexelSize", () =>
    testPrimitive((g) => {
      g = addNode(g, "TexelSize", {});
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      return connect(g, nodes[0].id, "out", nodes[1].id, "source");
    }));

  it("Swizzle", () =>
    testPrimitive((g) => {
      g = addNode(g, "FragCoord", {});
      g = addNode(g, "Swizzle", { pattern: "yxxx" });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "input");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("Exact interlacing pipeline", () =>
    testPrimitive((g) => {
      const ids = {};
      g = addNode(g, "FragCoord", {}); ids.fc = [...g.nodes.keys()].pop();
      g = addNode(g, "Floor", {}); ids.fl = [...g.nodes.keys()].pop();
      g = addNode(g, "Mod", { divisor: 2 }); ids.md = [...g.nodes.keys()].pop();
      g = addNode(g, "Swizzle", { pattern: "yxxx" }); ids.sw = [...g.nodes.keys()].pop();
      g = addNode(g, "SolidColor", { r: 0.5, g: 0, b: 0, a: 0 }); ids.s1 = [...g.nodes.keys()].pop();
      g = addNode(g, "Multiply", {}); ids.m1 = [...g.nodes.keys()].pop();
      g = addNode(g, "TexelSize", {}); ids.ts = [...g.nodes.keys()].pop();
      g = addNode(g, "Multiply", {}); ids.m2 = [...g.nodes.keys()].pop();
      g = addNode(g, "Add", {}); ids.ad = [...g.nodes.keys()].pop();
      g = addNode(g, "Texture", { url: "webcam.jpg" }); ids.tx = [...g.nodes.keys()].pop();
      g = addNode(g, "Output", {}); ids.ot = [...g.nodes.keys()].pop();
      g = connect(g, ids.fc, "out", ids.fl, "value");
      g = connect(g, ids.fl, "out", ids.md, "value");
      g = connect(g, ids.md, "out", ids.sw, "input");
      g = connect(g, ids.sw, "out", ids.m1, "a");
      g = connect(g, ids.s1, "out", ids.m1, "b");
      g = connect(g, ids.m1, "out", ids.m2, "a");
      g = connect(g, ids.ts, "out", ids.m2, "b");
      g = connect(g, ids.m2, "out", ids.ad, "a");
      g = connect(g, ids.fc, "out", ids.ad, "b");
      g = connect(g, ids.ad, "out", ids.tx, "uv");
      return connect(g, ids.tx, "out", ids.ot, "source");
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

describe("multi-pass compilation", () => {
  function twoPassGraph() {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "PassTarget", { name: "blurBuf", persistent: 0, float: 0, width: "$WIDTH", height: "$HEIGHT" });
    g = addNode(g, "ReadBuffer", { name: "blurBuf" });
    g = addNode(g, "Output", {});
    const [noise, target, read, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", target.id, "source");
    g = connect(g, read.id, "out", output.id, "source");
    return g;
  }

  it("emits PASSINDEX branches and buffer samplers", () => {
    const compiled = compileGraph(twoPassGraph());
    expect(compiled.valid).toBe(true);
    const src = compiled.source;
    expect(src).toContain("uniform int PASSINDEX;");
    expect(src).toContain("uniform sampler2D blurBuf;");
    expect(src).toContain("if (PASSINDEX == 0) {");
    expect(src).toContain("else if (PASSINDEX == 1) {");
    expect(src).toContain("texture2D(blurBuf");
  });

  it("orders the write pass before the read pass", () => {
    const compiled = compileGraph(twoPassGraph());
    const src = compiled.source;
    const writePos = src.indexOf("gl_FragColor = v0;");
    const readPos = src.indexOf("texture2D(blurBuf");
    expect(writePos).toBeGreaterThan(-1);
    expect(readPos).toBeGreaterThan(writePos);
  });

  it("compiles two-pass graphs to valid GLSL", async () => {
    const compiled = compileGraph(twoPassGraph());
    expect(compiled.valid, compiled.errors).toBe(true);
    const validation = await validateGLSL(compiled.source);
    expect(validation.valid).toBe(true);
  });

  it("compiles persistent feedback graphs to valid GLSL", async () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "ReadBuffer", { name: "fb" });
    g = addNode(g, "Mix", { factor: 0.5 });
    g = addNode(g, "PassTarget", { name: "fb", persistent: 1, float: 1, width: "$WIDTH/2.0", height: "$HEIGHT/2.0" });
    g = addNode(g, "ReadBuffer", { name: "fb" });
    g = addNode(g, "Output", {});
    const [noise, read1, mix, target, read2, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", mix.id, "a");
    g = connect(g, read1.id, "out", mix.id, "b");
    g = connect(g, mix.id, "out", target.id, "source");
    g = connect(g, read2.id, "out", output.id, "source");
    const compiled = compileGraph(g);
    expect(compiled.valid, compiled.errors).toBe(true);
    const validation = await validateGLSL(compiled.source);
    expect(validation.valid).toBe(true);
  });

  it("keeps single-pass output free of PASSINDEX", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "Output", {});
    const [noise, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", output.id, "source");
    const compiled = compileGraph(g);
    expect(compiled.valid).toBe(true);
    expect(compiled.source).not.toContain("PASSINDEX");
  });

  it("reports passes and buffer uniforms in describe", () => {
    const meta = describeFragmentGraph(twoPassGraph());
    expect(meta.passes).toBeDefined();
    expect(meta.passes!.length).toBe(2);
    const [p0, p1] = meta.passes!;
    expect(p0.target).toBe("blurBuf");
    expect(p0.output).toBe(false);
    expect(p1.output).toBe(true);
    expect(p1.index).toBe(1);
    expect(meta.uniforms.some((u) => u.name === "PASSINDEX" && u.type === "int")).toBe(true);
    expect(meta.uniforms.some((u) => u.name === "blurBuf" && u.semantic === "buffer")).toBe(true);
  });

  it("reports size equations in describe", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "PassTarget", { name: "buf", persistent: 0, float: 0, width: "$WIDTH/16.0", height: "$HEIGHT/16.0" });
    g = addNode(g, "ReadBuffer", { name: "buf" });
    g = addNode(g, "Output", {});
    const [noise, target, read, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", target.id, "source");
    g = connect(g, read.id, "out", output.id, "source");
    const meta = describeFragmentGraph(g);
    const pass = meta.passes!.find((p) => p.target === "buf")!;
    expect(pass.width).toBe("$WIDTH/16.0");
    expect(pass.height).toBe("$HEIGHT/16.0");
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
