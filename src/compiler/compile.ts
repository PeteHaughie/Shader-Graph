import { execFile } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GraphState } from "../graph/types.js";
import { getPrimitive } from "../graph/registry.js";
import { validateGraph } from "../graph/validation.js";
import { topologicalSort } from "../graph/operations.js";

interface CompiledShader {
  source: string;
  valid: boolean;
  errors?: string;
  metadata?: ShaderMetadata;
}

const GLSL_HEADER = `#version 100
precision highp float;
`;

const GLSL_UNIFORMS = `
uniform vec2 iResolution;
`;

function toGLSLFloat(n: number): string {
  const s = n.toString();
  return s.includes(".") ? s : `${s}.0`;
}

function wiredParam(inputVarMap: Map<string, string>, params: Record<string, unknown>, name: string, def: number): string {
  const wired = inputVarMap.get(name);
  if (wired) return `${wired}.r`;
  return toGLSLFloat((params[name] as number) ?? def);
}

function generateNoiseGLSL(): string {
  return `
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec4 noise1d(float scale, float seed) {
  vec2 p = gl_FragCoord.xy * scale + seed;
  float h = hash21(p);
  return vec4(h, h, h, 1.0);
}
`;
}

function generateColorUtilityGLSL(): string {
  return `
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float luminance(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}
`;
}

function generateSmoothNoiseGLSL(): string {
  return `
float hash21_s(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

float smoothNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21_s(i);
  float b = hash21_s(i + vec2(1.0, 0.0));
  float c = hash21_s(i + vec2(0.0, 1.0));
  float d = hash21_s(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 8; i++) {
    value += amplitude * smoothNoise(p);
    p *= lacunarity;
    amplitude *= gain;
  }
  return value;
}
`;
}

function generatePaletteGLSL(): string {
  return `
vec3 palette(float t, int mode) {
  vec3 a, b, c, d;
  if (mode == 0) {
    a = vec3(0.0, 0.0, 0.0); b = vec3(0.4, 0.0, 0.0); c = vec3(1.0, 0.3, 0.0); d = vec3(1.0, 0.7, 0.1);
  } else if (mode == 1) {
    a = vec3(0.5, 0.6, 0.8); b = vec3(0.3, 0.4, 0.6); c = vec3(0.8, 0.7, 0.9); d = vec3(0.2, 0.1, 0.3);
  } else if (mode == 2) {
    a = vec3(0.5, 0.5, 0.5); b = vec3(0.5, 0.5, 0.5); c = vec3(1.0, 1.0, 1.0); d = vec3(0.0, 0.33, 0.67);
  } else if (mode == 3) {
    a = vec3(0.1, 0.05, 0.0); b = vec3(0.5, 0.3, 0.1); c = vec3(0.8, 0.6, 0.2); d = vec3(0.9, 0.7, 0.3);
  } else {
    a = vec3(0.1, 0.0, 0.1); b = vec3(0.5, 0.2, 0.5); c = vec3(0.8, 0.3, 0.8); d = vec3(0.3, 0.5, 0.7);
  }
  return a + b * cos(6.28318 * (c * t + d));
}
`;
}

function generateEdgeDetectGLSL(): string {
  return `
vec4 sobel(sampler2D tex, vec2 uv, vec2 step) {
  float tl = luminance(texture2D(tex, uv + vec2(-step.x, step.y)).rgb);
  float t  = luminance(texture2D(tex, uv + vec2(0.0, step.y)).rgb);
  float tr = luminance(texture2D(tex, uv + vec2(step.x, step.y)).rgb);
  float l  = luminance(texture2D(tex, uv + vec2(-step.x, 0.0)).rgb);
  float r  = luminance(texture2D(tex, uv + vec2(step.x, 0.0)).rgb);
  float bl = luminance(texture2D(tex, uv + vec2(-step.x, -step.y)).rgb);
  float b  = luminance(texture2D(tex, uv + vec2(0.0, -step.y)).rgb);
  float br = luminance(texture2D(tex, uv + vec2(step.x, -step.y)).rgb);
  float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
  float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;
  return vec4(vec3(sqrt(gx*gx + gy*gy)), 1.0);
}
`;
}

export interface VaryingInfo {
  name: string;
  type: string;
}

export interface ShaderMetadata {
  uniforms: { name: string; type: string; semantic: string }[];
  varyings: { name: string; type: string }[];
  output: string;
}

export function describeFragmentGraph(state: GraphState, externalVaryings?: VaryingInfo[]): ShaderMetadata {
  const typeNames = [...state.nodes.values()].map((n) => n.typeName);
  const uniforms = [{ name: "iResolution", type: "vec2", semantic: "resolution" }];
  if (typeNames.includes("Time")) uniforms.push({ name: "iTime", type: "float", semantic: "time" });
  const texCount = [...state.nodes.values()].filter((n) => n.typeName === "Texture" && !!(n.params.url as string)).length;
  for (let i = 0; i < texCount; i++) uniforms.push({ name: `uTexture${i}`, type: "sampler2D", semantic: "texture" });
  const needsBlurTex = [...state.nodes.values()].some((n) =>
    (n.typeName === "Blur" || n.typeName === "EdgeDetect") &&
    [...state.edges.values()].some((e) => e.toNode === n.id && e.toPort === "image" &&
      state.nodes.get(e.fromNode)?.typeName === "Texture")
  );
  if (needsBlurTex) uniforms.push({ name: "uTexture0", type: "sampler2D", semantic: "texture" });
  return { uniforms, varyings: externalVaryings ?? [], output: "gl_FragColor" };
}

export function compileGraph(state: GraphState, externalVaryings?: VaryingInfo[]): CompiledShader {
  const validation = validateGraph(state);
  if (!validation.valid) {
    return {
      source: "",
      valid: false,
      errors: `Graph validation failed:\n${validation.errors.map((e) => `  - ${e.message}`).join("\n")}`,
    };
  }

  const { order } = topologicalSort(state);
  const nodeCode: string[] = [];
  const varNames = new Map<string, string>();

  let varIndex = 0;
  for (const nodeId of order) {
    const node = state.nodes.get(nodeId)!;
    const varName = `v${varIndex++}`;
    varNames.set(nodeId, varName);

    const inputEdges = [...state.edges.values()].filter((e) => e.toNode === nodeId);
    const inputVarMap = new Map<string, string>();
    for (const edge of inputEdges) {
      inputVarMap.set(edge.toPort, varNames.get(edge.fromNode)!);
    }

    switch (node.typeName) {
      case "Texture": {
        const url = node.params.url as string;
        if (url) {
          nodeCode.push(`  vec4 ${varName} = texture2D(uTexture, gl_FragCoord.xy / iResolution);`);
        } else {
          nodeCode.push(`  vec4 ${varName} = vec4(gl_FragCoord.xy / iResolution, 0.0, 1.0);`);
        }
        break;
      }
      case "Noise": {
        nodeCode.push(`  vec4 ${varName} = noise1d(${wiredParam(inputVarMap, node.params, "scale", 1)}, ${wiredParam(inputVarMap, node.params, "seed", 0)});`);
        break;
      }
      case "SmoothNoise": {
        nodeCode.push(`  vec4 ${varName} = vec4(smoothNoise(gl_FragCoord.xy * ${wiredParam(inputVarMap, node.params, "scale", 1)} + ${wiredParam(inputVarMap, node.params, "seed", 0)}));`);
        break;
      }
      case "FractalNoise": {
        nodeCode.push(`  vec4 ${varName} = vec4(fbm(gl_FragCoord.xy * ${wiredParam(inputVarMap, node.params, "scale", 1)} + ${wiredParam(inputVarMap, node.params, "seed", 0)}, ${wiredParam(inputVarMap, node.params, "lacunarity", 2)}, ${wiredParam(inputVarMap, node.params, "gain", 0.5)}));`);
        break;
      }
      case "Time": {
        nodeCode.push(`  vec4 ${varName} = vec4(iTime * ${wiredParam(inputVarMap, node.params, "speed", 1)});`);
        break;
      }
      case "SmoothStep": {
        const value = inputVarMap.get("value") ?? "vec4(0.0)";
        const edge0 = inputVarMap.get("edge0") ?? "vec4(0.0)";
        const edge1 = inputVarMap.get("edge1") ?? "vec4(1.0)";
        nodeCode.push(`  vec4 ${varName} = smoothstep(${edge0}, ${edge1}, ${value});`);
        break;
      }
      case "Palette": {
        const input = inputVarMap.get("value") ?? "vec4(0.0)";
        const mode = (node.params.mode as string) ?? "fire";
        const modeIndex = ["fire", "ice", "rainbow", "gold", "neon"].indexOf(mode);
        nodeCode.push(`  float pal_lum = luminance(${input}.rgb);`);
        nodeCode.push(`  vec4 ${varName} = vec4(palette(pal_lum, ${modeIndex}), 1.0);`);
        break;
      }
      case "SolidColor": {
        const r = (node.params.r as number) ?? 1;
        const g = (node.params.g as number) ?? 1;
        const b = (node.params.b as number) ?? 1;
        const a = (node.params.a as number) ?? 1;
        nodeCode.push(`  vec4 ${varName} = vec4(${toGLSLFloat(r)}, ${toGLSLFloat(g)}, ${toGLSLFloat(b)}, ${toGLSLFloat(a)});`);
        break;
      }
      case "Gradient": {
        const a = inputVarMap.get("colorA") ?? "vec4(0.0)";
        const b = inputVarMap.get("colorB") ?? "vec4(1.0)";
        const angleWired = inputVarMap.get("angle");
        if (angleWired) {
          nodeCode.push(`  float grad_a = ${angleWired}.r * 3.14159 / 180.0;`);
          nodeCode.push(`  vec2 grad_dir = vec2(cos(grad_a), sin(grad_a));`);
        } else {
          const angle = (node.params.angle as number) ?? 0;
          const rad = (angle * Math.PI) / 180;
          nodeCode.push(`  vec2 grad_dir = vec2(${toGLSLFloat(Math.cos(rad))}, ${toGLSLFloat(Math.sin(rad))});`);
        }
        nodeCode.push(`  float grad_t = dot(gl_FragCoord.xy, grad_dir) / dot(iResolution, abs(grad_dir));`);
        nodeCode.push(`  vec4 ${varName} = mix(${a}, ${b}, clamp(grad_t, 0.0, 1.0));`);
        break;
      }
      case "Checkerboard": {
        const a = inputVarMap.get("colorA") ?? "vec4(1.0)";
        const b = inputVarMap.get("colorB") ?? "vec4(0.0)";
        nodeCode.push(`  vec2 cb = floor(${wiredParam(inputVarMap, node.params, "frequency", 4)} * gl_FragCoord.xy / iResolution);`);
        nodeCode.push(`  vec4 ${varName} = mod(cb.x + cb.y, 2.0) < 0.5 ? ${a} : ${b};`);
        break;
      }
      case "Blur": {
        const blurInput = inputVarMap.get("image") ?? "vec4(0.0)";
        const blurSrcNode = inputVarMap.has("image") ? state.nodes.get([...state.edges.values()].find((e) => e.toNode === nodeId && e.toPort === "image")!.fromNode) : null;
        if (blurSrcNode?.typeName === "Texture") {
          nodeCode.push(`  vec2 blur_step = vec2(${wiredParam(inputVarMap, node.params, "radius", 2)}) / iResolution;`);
          nodeCode.push(`  vec2 blur_uv = gl_FragCoord.xy / iResolution;`);
          nodeCode.push(`  vec4 ${varName} = vec4(0.0);`);
          for (const dy of [-1, 0, 1]) {
            for (const dx of [-1, 0, 1]) {
              nodeCode.push(`  ${varName} += texture2D(uTexture, blur_uv + vec2(${dx}.0, ${dy}.0) * blur_step);`);
            }
          }
          nodeCode.push(`  ${varName} /= 9.0;`);
        } else {
          nodeCode.push(`  vec4 ${varName} = ${blurInput};`);
        }
        break;
      }
      case "Glow": {
        const input = inputVarMap.get("image") ?? "vec4(0.0)";
        nodeCode.push(`  float bright = max(${input}.r, max(${input}.g, ${input}.b));`);
        nodeCode.push(`  vec4 ${varName} = ${input} * clamp(bright * ${wiredParam(inputVarMap, node.params, "intensity", 1)}, 0.0, 1.0);`);
        break;
      }
      case "EdgeDetect": {
        const edgeInput = inputVarMap.get("image") ?? "vec4(0.0)";
        const edgeSrcNode = inputVarMap.has("image") ? state.nodes.get([...state.edges.values()].find((e) => e.toNode === nodeId && e.toPort === "image")!.fromNode) : null;
        if (edgeSrcNode?.typeName === "Texture") {
          nodeCode.push(`  vec2 step = vec2(1.0) / iResolution;`);
          nodeCode.push(`  vec2 uv = gl_FragCoord.xy / iResolution;`);
          nodeCode.push(`  vec4 ${varName} = sobel(uTexture, uv, step);`);
        } else {
          nodeCode.push(`  vec4 ${varName} = ${edgeInput};`);
        }
        break;
      }
      case "Displace": {
        const image = inputVarMap.get("image") ?? "vec4(0.0)";
        nodeCode.push(`  vec4 ${varName} = ${image};`);
        break;
      }
      case "BrightnessContrast": {
        const input = inputVarMap.get("image") ?? "vec4(0.0)";
        const b = wiredParam(inputVarMap, node.params, "brightness", 0);
        const c = wiredParam(inputVarMap, node.params, "contrast", 0);
        nodeCode.push(`  vec3 bc_c = ${input}.rgb + ${b};`);
        nodeCode.push(`  bc_c = (259.0 * (255.0 + 255.0 * ${c})) / (255.0 * (259.0 - 255.0 * ${c})) * (bc_c - 0.5) + 0.5;`);
        nodeCode.push(`  vec4 ${varName} = vec4(clamp(bc_c, 0.0, 1.0), ${input}.a);`);
        break;
      }
      case "HueShift": {
        const input = inputVarMap.get("image") ?? "vec4(0.0)";
        nodeCode.push(`  vec3 hs_hsv = rgb2hsv(${input}.rgb);`);
        nodeCode.push(`  hs_hsv.x = fract(hs_hsv.x + ${wiredParam(inputVarMap, node.params, "angle", 0)} / 360.0);`);
        nodeCode.push(`  vec4 ${varName} = vec4(hsv2rgb(hs_hsv), ${input}.a);`);
        break;
      }
      case "Saturation": {
        const input = inputVarMap.get("image") ?? "vec4(0.0)";
        nodeCode.push(`  vec3 sat_hsv = rgb2hsv(${input}.rgb);`);
        nodeCode.push(`  sat_hsv.y = clamp(sat_hsv.y * ${wiredParam(inputVarMap, node.params, "amount", 1)}, 0.0, 1.0);`);
        nodeCode.push(`  vec4 ${varName} = vec4(hsv2rgb(sat_hsv), ${input}.a);`);
        break;
      }
      case "Invert": {
        const input = inputVarMap.get("image") ?? "vec4(0.0)";
        nodeCode.push(`  vec4 ${varName} = vec4(1.0 - ${input}.rgb, ${input}.a);`);
        break;
      }
      case "Threshold": {
        const input = inputVarMap.get("image") ?? "vec4(0.0)";
        nodeCode.push(`  float thresh_lum = luminance(${input}.rgb);`);
        nodeCode.push(`  vec4 ${varName} = vec4(vec3(step(${wiredParam(inputVarMap, node.params, "level", 0.5)}, thresh_lum)), ${input}.a);`);
        break;
      }
      case "Mix": {
        const a = inputVarMap.get("a") ?? "vec4(0.0)";
        const b = inputVarMap.get("b") ?? "vec4(0.0)";
        nodeCode.push(`  vec4 ${varName} = mix(${a}, ${b}, ${wiredParam(inputVarMap, node.params, "factor", 0.5)});`);
        break;
      }
      case "Add": {
        const a = inputVarMap.get("a") ?? "vec4(0.0)";
        const b = inputVarMap.get("b") ?? "vec4(0.0)";
        nodeCode.push(`  vec4 ${varName} = ${a} + ${b};`);
        break;
      }
      case "Subtract": {
        const a = inputVarMap.get("a") ?? "vec4(0.0)";
        const b = inputVarMap.get("b") ?? "vec4(0.0)";
        nodeCode.push(`  vec4 ${varName} = ${a} - ${b};`);
        break;
      }
      case "Multiply": {
        const a = inputVarMap.get("a") ?? "vec4(0.0)";
        const b = inputVarMap.get("b") ?? "vec4(0.0)";
        nodeCode.push(`  vec4 ${varName} = ${a} * ${b};`);
        break;
      }
      case "Mask": {
        const image = inputVarMap.get("image") ?? "vec4(0.0)";
        const mask = inputVarMap.get("mask") ?? "vec4(1.0)";
        const invert = (node.params.invert as number) ?? 0;
        if (invert) {
          nodeCode.push(`  vec4 ${varName} = vec4(${image}.rgb * (1.0 - ${mask}.a), ${image}.a);`);
        } else {
          nodeCode.push(`  vec4 ${varName} = vec4(${image}.rgb * ${mask}.a, ${image}.a);`);
        }
        break;
      }
      case "FromVertex": {
        const vName = (node.params.name as string) ?? "vData";
        const sanitized = vName.replace(/[^a-zA-Z0-9_]/g, "_");
        nodeCode.push(`  vec4 ${varName} = ${sanitized};`);
        break;
      }
      case "DiffuseLight": {
        const normal = inputVarMap.get("normal") ?? "vec4(0.0, 1.0, 0.0, 0.0)";
        const ld = (node.params.lightDir as string) ?? "0.5,1.0,0.5";
        const col = (node.params.color as string) ?? "1.0,0.0,0.0";
        nodeCode.push(`  vec3 dl_n = normalize(${normal}.xyz);`);
        nodeCode.push(`  vec3 dl_l = normalize(vec3(${ld}));`);
        nodeCode.push(`  float dl_dot = max(dot(dl_n, dl_l), 0.0);`);
        nodeCode.push(`  vec4 ${varName} = vec4(vec3(${col}) * dl_dot, 1.0);`);
        break;
      }
      case "AmbientLight": {
        const col = (node.params.color as string) ?? "0.1,0.0,0.0";
        nodeCode.push(`  vec4 ${varName} = vec4(vec3(${col}), 1.0);`);
        break;
      }
      case "Output": {
        const input = inputVarMap.get("source") ?? "vec4(0.0)";
        nodeCode.push(`  gl_FragColor = ${input};`);
        break;
      }
    }
  }

  const typeNames = [...state.nodes.values()].map((n) => n.typeName);
  const needsNoise = typeNames.includes("Noise");
  const needsColorUtil = ["HueShift", "Saturation", "Threshold", "EdgeDetect", "Palette"].some((t) => typeNames.includes(t));
  const needsSmoothNoise = typeNames.includes("SmoothNoise") || typeNames.includes("FractalNoise");
  const needsEdgeDetect = typeNames.includes("EdgeDetect");
  const needsTime = typeNames.includes("Time");
  const needsTexture = [...state.nodes.values()].some((n) =>
    n.typeName === "Texture" && !!(n.params.url as string)
  ) || [...state.nodes.values()].some((n) =>
    (n.typeName === "Blur" || n.typeName === "EdgeDetect") &&
    [...state.edges.values()].some((e) => e.toNode === n.id && e.toPort === "image" &&
      state.nodes.get(e.fromNode)?.typeName === "Texture")
  );

  const parts: string[] = [GLSL_HEADER];
  if (needsTexture) {
    parts.push(`uniform sampler2D uTexture;\n`);
  }
  if (needsTime) {
    parts.push(`uniform float iTime;\n`);
  }
  parts.push(GLSL_UNIFORMS);
  const varyings = externalVaryings ?? [];
  for (const v of varyings) {
    parts.push(`varying ${v.type} ${v.name};\n`);
  }
  if (needsNoise) {
    parts.push(generateNoiseGLSL());
  }
  if (needsSmoothNoise) {
    parts.push(generateSmoothNoiseGLSL());
  }
  if (needsColorUtil) {
    parts.push(generateColorUtilityGLSL());
  }
  if (needsEdgeDetect) {
    parts.push(generateEdgeDetectGLSL());
  }
  if (typeNames.includes("Palette")) {
    parts.push(generatePaletteGLSL());
  }
  parts.push("void main() {\n");
  parts.push(nodeCode.join("\n"));
  parts.push("}\n");

  const metadata = describeFragmentGraph(state, externalVaryings);
  return { source: parts.join(""), valid: true, metadata };
}

export function validateGLSL(source: string): Promise<{ valid: boolean; output: string }> {
  return new Promise((resolve) => {
    const tmpDir = mkdtempSync(join(tmpdir(), "shader-"));
    const shaderPath = join(tmpDir, "shader.frag");
    writeFileSync(shaderPath, source);

    execFile("glslangValidator", [shaderPath], { timeout: 5000 }, (error, _stdout, stderr) => {
      resolve({
        valid: !error,
        output: error ? stderr || error.message : "Valid GLSL",
      });
    });
  });
}
