import { describe, it, expect } from "vitest";
import { createGraph, addNode, connect } from "../src/graph/operations.js";
import { compileMetalFragment, describeMetalFragment } from "../src/compiler/msl/fragment.js";
import { compileMetalVertex, describeMetalVertex } from "../src/compiler/msl/vertex.js";
import { validateMetal, isMetalValidationAvailable } from "../src/compiler/msl/validate.js";
import { getBackend } from "../src/compiler/backend.js";

type G = ReturnType<typeof createGraph>;

async function testMSL(build: (g: G) => G, expectTokens: string[] = []): Promise<string> {
  let g = createGraph();
  g = build(g);
  const compiled = compileMetalFragment(g);
  expect(compiled.valid, `compileMetalFragment failed: ${compiled.errors}`).toBe(true);
  expect(compiled.source).toContain("#include <metal_stdlib>");
  expect(compiled.source).toContain("using namespace metal;");
  for (const tok of expectTokens) {
    expect(compiled.source, `missing token ${tok}`).toContain(tok);
  }
  const validation = await validateMetal(compiled.source);
  if (!validation.valid) {
    console.log(compiled.source);
    console.log(validation.output);
  }
  expect(validation.valid, validation.output).toBe(true);
  return compiled.source;
}

describe("all primitives compile to valid MSL", () => {
  it("Texture (procedural)", () =>
    testMSL((g) => {
      g = addNode(g, "FragCoord", {});
      g = addNode(g, "Texture", { url: "" });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "uv");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("Noise", () =>
    testMSL((g) => {
      g = addNode(g, "Noise", { scale: 3, seed: 1.5 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      return connect(g, nodes[0].id, "out", nodes[1].id, "source");
    }));

  it("SolidColor", () =>
    testMSL((g) => {
      g = addNode(g, "SolidColor", { r: 0.2, g: 0.4, b: 0.8, a: 1 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      return connect(g, nodes[0].id, "out", nodes[1].id, "source");
    }, ["fragment float4 fragment_main", "float4(0.2, 0.4, 0.8, 1.0)"]));

  it("Gradient", () =>
    testMSL((g) => {
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
    testMSL((g) => {
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
    testMSL((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "Blur", { radius: 4 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "image");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("Glow", () =>
    testMSL((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "Glow", { intensity: 2 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "image");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("EdgeDetect", () =>
    testMSL((g) => {
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
    testMSL((g) => {
      const ids: Record<string, string> = {};
      g = addNode(g, "FragCoord", {}); ids.fc = [...g.nodes.keys()].pop()!;
      g = addNode(g, "Texture", { url: "" }); ids.tx = [...g.nodes.keys()].pop()!;
      g = addNode(g, "Noise", { scale: 1, seed: 0 }); ids.ns = [...g.nodes.keys()].pop()!;
      g = addNode(g, "Displace", { amount: 0.1 }); ids.dp = [...g.nodes.keys()].pop()!;
      g = addNode(g, "Output", {}); ids.out = [...g.nodes.keys()].pop()!;
      g = connect(g, ids.fc, "out", ids.tx, "uv");
      g = connect(g, ids.tx, "out", ids.dp, "image");
      g = connect(g, ids.ns, "out", ids.dp, "map");
      return connect(g, ids.dp, "out", ids.out, "source");
    }));

  it("BrightnessContrast", () =>
    testMSL((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "BrightnessContrast", { brightness: 0.2, contrast: 0.3 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "image");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("HueShift", () =>
    testMSL((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "HueShift", { angle: 180 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "image");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("Saturation", () =>
    testMSL((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "Saturation", { amount: 1.5 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "image");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("Invert", () =>
    testMSL((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "Invert", {});
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "image");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("Threshold", () =>
    testMSL((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "Threshold", { level: 0.5 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "image");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("Mix", () =>
    testMSL((g) => {
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
    testMSL((g) => {
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
    testMSL((g) => {
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
    testMSL((g) => {
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
    testMSL((g) => {
      g = addNode(g, "Noise", { scale: 1, seed: 0 });
      g = addNode(g, "SolidColor", { r: 1, g: 0, b: 0, a: 1 });
      g = addNode(g, "Mask", { invert: 0 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[2].id, "image");
      g = connect(g, nodes[1].id, "out", nodes[2].id, "mask");
      return connect(g, nodes[2].id, "out", nodes[3].id, "source");
    }));

  it("Time", () =>
    testMSL((g) => {
      g = addNode(g, "Time", { speed: 0.5 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      return connect(g, nodes[0].id, "out", nodes[1].id, "source");
    }, ["float iTime;", "u.iTime"]));

  it("SmoothNoise", () =>
    testMSL((g) => {
      g = addNode(g, "SmoothNoise", { scale: 3, seed: 1 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      return connect(g, nodes[0].id, "out", nodes[1].id, "source");
    }));

  it("FractalNoise", () =>
    testMSL((g) => {
      g = addNode(g, "FractalNoise", { scale: 2, seed: 0, octaves: 4, lacunarity: 2, gain: 0.5 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      return connect(g, nodes[0].id, "out", nodes[1].id, "source");
    }, ["float fbm("]));

  it("SmoothStep", () =>
    testMSL((g) => {
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

  it("Palette", () =>
    testMSL((g) => {
      g = addNode(g, "Noise", { scale: 3, seed: 0 });
      g = addNode(g, "Palette", { mode: "fire" });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "value");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("TexelSize", () =>
    testMSL((g) => {
      g = addNode(g, "TexelSize", {});
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      return connect(g, nodes[0].id, "out", nodes[1].id, "source");
    }));

  it("Swizzle", () =>
    testMSL((g) => {
      g = addNode(g, "FragCoord", {});
      g = addNode(g, "Swizzle", { pattern: "yxxx" });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "input");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("Mod + Floor + TexelSize interlacing pipeline", () =>
    testMSL((g) => {
      const ids: Record<string, string> = {};
      g = addNode(g, "FragCoord", {}); ids.fc = [...g.nodes.keys()].pop()!;
      g = addNode(g, "Floor", {}); ids.fl = [...g.nodes.keys()].pop()!;
      g = addNode(g, "Mod", { divisor: 2 }); ids.md = [...g.nodes.keys()].pop()!;
      g = addNode(g, "Swizzle", { pattern: "yxxx" }); ids.sw = [...g.nodes.keys()].pop()!;
      g = addNode(g, "SolidColor", { r: 0.5, g: 0, b: 0, a: 0 }); ids.s1 = [...g.nodes.keys()].pop()!;
      g = addNode(g, "Multiply", {}); ids.m1 = [...g.nodes.keys()].pop()!;
      g = addNode(g, "TexelSize", {}); ids.ts = [...g.nodes.keys()].pop()!;
      g = addNode(g, "Multiply", {}); ids.m2 = [...g.nodes.keys()].pop()!;
      g = addNode(g, "Add", {}); ids.ad = [...g.nodes.keys()].pop()!;
      g = addNode(g, "Texture", { url: "webcam.jpg" }); ids.tx = [...g.nodes.keys()].pop()!;
      g = addNode(g, "Output", {}); ids.ot = [...g.nodes.keys()].pop()!;
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
    }, ["fmod(", "uTexture0.sample(_samp"]));

  it("DiffuseLight", () =>
    testMSL((g) => {
      g = addNode(g, "SolidColor", { r: 0, g: 1, b: 0, a: 0 });
      g = addNode(g, "DiffuseLight", { lightDir: "1,1,1", color: "1,0,0" });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "normal");
      return connect(g, nodes[1].id, "out", nodes[2].id, "source");
    }));

  it("AmbientLight", () =>
    testMSL((g) => {
      g = addNode(g, "AmbientLight", { color: "0.1,0,0" });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      return connect(g, nodes[0].id, "out", nodes[1].id, "source");
    }));

  it("SpecularLight", () =>
    testMSL((g) => {
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

  it("NormalMap (procedural)", () =>
    testMSL((g) => {
      g = addNode(g, "SolidColor", { r: 0, g: 1, b: 0, a: 0 });
      g = addNode(g, "SolidColor", { r: 1, g: 0, b: 0, a: 0 });
      g = addNode(g, "NormalMap", { url: "", intensity: 1 });
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[2].id, "normal");
      g = connect(g, nodes[1].id, "out", nodes[2].id, "position");
      return connect(g, nodes[2].id, "out", nodes[3].id, "source");
    }, ["dfdx(", "float3x3("]));

  it("ShadowMap", () =>
    testMSL((g) => {
      g = addNode(g, "SolidColor", { r: 1, g: 0, b: 0, a: 0 });
      g = addNode(g, "ShadowMap", { bias: 0.005 });
      g = addNode(g, "Multiply", {});
      g = addNode(g, "Output", {});
      const nodes = [...g.nodes.values()];
      g = connect(g, nodes[0].id, "out", nodes[1].id, "position");
      g = connect(g, nodes[0].id, "out", nodes[2].id, "a");
      g = connect(g, nodes[1].id, "out", nodes[2].id, "b");
      return connect(g, nodes[2].id, "out", nodes[3].id, "source");
    }, ["uShadowMap", "u.uLightMVP"]));

  it("FromVertex (with a varying bridge)", async () => {
    let g = createGraph();
    g = addNode(g, "FromVertex", { name: "vData" });
    g = addNode(g, "Output", {});
    const nodes = [...g.nodes.values()];
    g = connect(g, nodes[0].id, "out", nodes[1].id, "source");
    const compiled = compileMetalFragment(g, [{ name: "vData", type: "vec4" }]);
    expect(compiled.valid).toBe(true);
    expect(compiled.source).toContain("float4 vData;");
    const validation = await validateMetal(compiled.source);
    expect(validation.valid, validation.output).toBe(true);
  });
});

describe("MSL vertex graph", () => {
  async function testVertex(build: (g: G) => G, expectTokens: string[] = []): Promise<string> {
    let g = createGraph();
    g = build(g);
    const compiled = compileMetalVertex(g);
    expect(compiled.valid, `compileMetalVertex failed: ${compiled.errors}`).toBe(true);
    expect(compiled.source).toContain("vertex VertexOut vertex_main");
    expect(compiled.source).toContain("[[stage_in]]");
    for (const tok of expectTokens) {
      expect(compiled.source, `missing token ${tok}`).toContain(tok);
    }
    const validation = await validateMetal(compiled.source);
    if (!validation.valid) {
      console.log(compiled.source);
      console.log(validation.output);
    }
    expect(validation.valid, validation.output).toBe(true);
    return compiled.source;
  }

  it("Translate", () =>
    testVertex((g) => {
      g = addNode(g, "VertexPosition", {});
      g = addNode(g, "Translate", { x: 0.5, y: 0, z: 0 });
      g = addNode(g, "VertexOutput", {});
      const n = [...g.nodes.values()];
      g = connect(g, n[0].id, "out", n[1].id, "position");
      return connect(g, n[1].id, "out", n[2].id, "position");
    }));

  it("Rotate", () =>
    testVertex((g) => {
      g = addNode(g, "VertexPosition", {});
      g = addNode(g, "Rotate", { angle: 45, axis: "y" });
      g = addNode(g, "VertexOutput", {});
      const n = [...g.nodes.values()];
      g = connect(g, n[0].id, "out", n[1].id, "position");
      return connect(g, n[1].id, "out", n[2].id, "position");
    }));

  it("Scale", () =>
    testVertex((g) => {
      g = addNode(g, "VertexPosition", {});
      g = addNode(g, "Scale", { x: 2, y: 2, z: 2 });
      g = addNode(g, "VertexOutput", {});
      const n = [...g.nodes.values()];
      g = connect(g, n[0].id, "out", n[1].id, "position");
      return connect(g, n[1].id, "out", n[2].id, "position");
    }));

  it("ModelViewProjection", () =>
    testVertex((g) => {
      g = addNode(g, "VertexPosition", {});
      g = addNode(g, "ModelViewProjection", {});
      g = addNode(g, "VertexOutput", {});
      const n = [...g.nodes.values()];
      g = connect(g, n[0].id, "out", n[1].id, "position");
      return connect(g, n[1].id, "out", n[2].id, "position");
    }, ["u.uModelViewProjection"]));

  it("Wave", () =>
    testVertex((g) => {
      g = addNode(g, "VertexPosition", {});
      g = addNode(g, "Wave", { amplitude: 0.5, frequency: 2, speed: 1, axis: "z" });
      g = addNode(g, "VertexOutput", {});
      const n = [...g.nodes.values()];
      g = connect(g, n[0].id, "out", n[1].id, "position");
      return connect(g, n[1].id, "out", n[2].id, "position");
    }, ["u.iTime"]));

  it("NoiseDisplace", () =>
    testVertex((g) => {
      g = addNode(g, "VertexPosition", {});
      g = addNode(g, "NoiseDisplace", { amount: 0.5, scale: 2 });
      g = addNode(g, "VertexOutput", {});
      const n = [...g.nodes.values()];
      g = connect(g, n[0].id, "out", n[1].id, "position");
      return connect(g, n[1].id, "out", n[2].id, "position");
    }, ["in.aPosition", "in.aNormal"]));

  it("PassToFragment", () =>
    testVertex((g) => {
      g = addNode(g, "VertexPosition", {});
      g = addNode(g, "VertexOutput", {});
      g = addNode(g, "PassToFragment", { name: "vData" });
      const n = [...g.nodes.values()];
      g = connect(g, n[0].id, "out", n[1].id, "position");
      g = connect(g, n[0].id, "out", n[2].id, "value");
      return g;
    }, ["out.vData", "float4 vData;"]));
});

describe("MSL multi-pass", () => {
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

  it("emits one entry point per pass with no PASSINDEX", async () => {
    const compiled = compileMetalFragment(twoPassGraph());
    expect(compiled.valid).toBe(true);
    const src = compiled.source;
    expect(src).toContain("fragment float4 fragment_pass0");
    expect(src).toContain("fragment float4 fragment_pass1");
    expect(src).not.toContain("PASSINDEX");
    expect(src).toContain("texture2d<float> blurBuf [[texture(0)]]");
    const validation = await validateMetal(src);
    expect(validation.valid, validation.output).toBe(true);
  });

  it("orders the write pass before the read pass", () => {
    const src = compileMetalFragment(twoPassGraph()).source;
    const writePos = src.indexOf("fragment_pass0");
    const readPos = src.indexOf("fragment_pass1");
    expect(writePos).toBeGreaterThan(-1);
    expect(readPos).toBeGreaterThan(writePos);
  });

  it("reports pass entry points in describe", () => {
    const meta = describeMetalFragment(twoPassGraph());
    expect(meta.passes).toBeDefined();
    expect(meta.passes!.length).toBe(2);
    expect(meta.entryPoints).toBeDefined();
    expect(meta.entryPoints!.map((e) => e.name)).toEqual(["fragment_pass0", "fragment_pass1"]);
    expect(meta.entryPoints![1].output).toBe(true);
    expect(meta.uniforms.some((u) => u.name === "blurBuf" && u.semantic === "buffer")).toBe(true);
  });

  it("single-pass output has fragment_main", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "Output", {});
    const [noise, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", output.id, "source");
    const src = compileMetalFragment(g).source;
    expect(src).toContain("fragment float4 fragment_main");
    expect(src).not.toContain("PASSINDEX");
  });
});

describe("MSL describe", () => {
  it("describes fragment uniforms and varyings", () => {
    let g = createGraph();
    g = addNode(g, "Time", { speed: 1 });
    g = addNode(g, "Output", {});
    const [time, output] = [...g.nodes.values()];
    g = connect(g, time.id, "out", output.id, "source");
    const meta = describeMetalFragment(g);
    expect(meta.uniforms.some((u) => u.name === "iResolution" && u.type === "float2")).toBe(true);
    expect(meta.uniforms.some((u) => u.name === "iTime")).toBe(true);
    expect(meta.output).toBe("fragment");
  });

  it("describes vertex attributes and uniforms", () => {
    let g = createGraph();
    g = addNode(g, "VertexPosition", {});
    g = addNode(g, "VertexOutput", {});
    const [pos, out] = [...g.nodes.values()];
    g = connect(g, pos.id, "out", out.id, "position");
    const meta = describeMetalVertex(g);
    expect(meta.attributes.some((a) => a.name === "aPosition" && a.type === "float3")).toBe(true);
    expect(meta.uniforms.some((u) => u.name === "uModelViewProjection" && u.type === "float4x4")).toBe(true);
  });
});

describe("Metal backend", () => {
  it("getBackend dispatches by target", () => {
    expect(getBackend("metal").language).toBe("msl");
    expect(getBackend("es100").language).toBe("glsl");
    expect(getBackend("gl150").language).toBe("glsl");
  });

  it("depth pass compiles to valid MSL", async () => {
    const { vertex, fragment } = getBackend("metal").depthPass("metal");
    expect(vertex).toContain("vertex DepthOut vertex_depth");
    expect(fragment).toContain("fragment float4 depth_fragment");
    const v = await validateMetal(vertex);
    const f = await validateMetal(fragment);
    expect(v.valid, v.output).toBe(true);
    expect(f.valid, f.output).toBe(true);
  });
});

describe("metal validation availability", () => {
  it("reports availability without throwing", async () => {
    const available = await isMetalValidationAvailable();
    expect(typeof available).toBe("boolean");
  });
});
