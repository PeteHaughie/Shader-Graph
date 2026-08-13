import { describe, it, expect } from "vitest";
import { createGraph, addNode, connect } from "../src/graph/operations.js";
import { compileGraph, validateGLSL } from "../src/compiler/compile.js";

describe("compileGraph", () => {
  it("rejects invalid graph", () => {
    const g = createGraph();
    const result = compileGraph(g);
    expect(result.valid).toBe(false);
  });

  it("compiles a Noise → Output graph", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "Output", {});
    const [noise, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", output.id, "source");
    const result = compileGraph(g);
    expect(result.valid).toBe(true);
    expect(result.source).toContain("#version 100");
    expect(result.source).toContain("gl_FragColor");
    expect(result.source).toContain("noise1d");
  });

  it("compiles a Mix → Output graph", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "Texture", { url: "" });
    g = addNode(g, "Mix", { factor: 0.5 });
    g = addNode(g, "Output", {});
    const [noise, texture, mix, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", mix.id, "a");
    g = connect(g, texture.id, "out", mix.id, "b");
    g = connect(g, mix.id, "out", output.id, "source");
    const result = compileGraph(g);
    expect(result.valid).toBe(true);
    expect(result.source).toContain("mix(");
  });

  it("compiles a Noise → Blur → Output graph", () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "Blur", { radius: 2 });
    g = addNode(g, "Output", {});
    const [noise, blur, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", blur.id, "image");
    g = connect(g, blur.id, "out", output.id, "source");
    const result = compileGraph(g);
    expect(result.valid).toBe(true);
  });

  it("generates code in topological order", () => {
    let g = createGraph();
    g = addNode(g, "Output", {});
    g = addNode(g, "Blur", { radius: 2 });
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    const [output, blur, noise] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", blur.id, "image");
    g = connect(g, blur.id, "out", output.id, "source");
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

  it("compiled graph output validates as GLSL", async () => {
    let g = createGraph();
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "Blur", { radius: 2 });
    g = addNode(g, "Output", {});
    const [noise, blur, output] = [...g.nodes.values()];
    g = connect(g, noise.id, "out", blur.id, "image");
    g = connect(g, blur.id, "out", output.id, "source");
    const compiled = compileGraph(g);
    expect(compiled.valid).toBe(true);
    const validation = await validateGLSL(compiled.source);
    expect(validation.valid).toBe(true);
  });

  it("compiled Mix graph output validates as GLSL", async () => {
    let g = createGraph();
    g = addNode(g, "Texture", { url: "" });
    g = addNode(g, "Noise", { scale: 1, seed: 0 });
    g = addNode(g, "Mix", { factor: 0.5 });
    g = addNode(g, "Output", {});
    const [tex, noise, mix, output] = [...g.nodes.values()];
    g = connect(g, tex.id, "out", mix.id, "a");
    g = connect(g, noise.id, "out", mix.id, "b");
    g = connect(g, mix.id, "out", output.id, "source");
    const compiled = compileGraph(g);
    expect(compiled.valid).toBe(true);
    console.log("Mix graph GLSL output:");
    console.log(compiled.source);
    const validation = await validateGLSL(compiled.source);
    expect(validation.valid).toBe(true);
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
