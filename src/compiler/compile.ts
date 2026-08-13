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

export function compileGraph(state: GraphState): CompiledShader {
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
        const scale = (node.params.scale as number) ?? 1;
        const seed = (node.params.seed as number) ?? 0;
        nodeCode.push(`  vec4 ${varName} = noise1d(${toGLSLFloat(scale)}, ${toGLSLFloat(seed)});`);
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
        const angle = (node.params.angle as number) ?? 0;
        const rad = (angle * Math.PI) / 180;
        nodeCode.push(`  vec2 grad_dir = vec2(${toGLSLFloat(Math.cos(rad))}, ${toGLSLFloat(Math.sin(rad))});`);
        nodeCode.push(`  float grad_t = dot(gl_FragCoord.xy, grad_dir) / dot(iResolution, abs(grad_dir));`);
        nodeCode.push(`  vec4 ${varName} = mix(${a}, ${b}, clamp(grad_t, 0.0, 1.0));`);
        break;
      }
      case "Checkerboard": {
        const a = inputVarMap.get("colorA") ?? "vec4(1.0)";
        const b = inputVarMap.get("colorB") ?? "vec4(0.0)";
        const freq = (node.params.frequency as number) ?? 4;
        nodeCode.push(`  vec2 cb = floor(${toGLSLFloat(freq)} * gl_FragCoord.xy / iResolution);`);
        nodeCode.push(`  vec4 ${varName} = mod(cb.x + cb.y, 2.0) < 0.5 ? ${a} : ${b};`);
        break;
      }
      case "Blur": {
        const radius = (node.params.radius as number) ?? 2;
        const r = toGLSLFloat(radius);
        nodeCode.push(`  vec2 blur_step = vec2(${r}) / iResolution;`);
        nodeCode.push(`  vec2 blur_uv = gl_FragCoord.xy / iResolution;`);
        nodeCode.push(`  vec4 ${varName} = vec4(0.0);`);
        nodeCode.push(`  ${varName} += texture2D(uTexture, blur_uv + vec2(-blur_step.x, -blur_step.y));`);
        nodeCode.push(`  ${varName} += texture2D(uTexture, blur_uv + vec2(0.0, -blur_step.y));`);
        nodeCode.push(`  ${varName} += texture2D(uTexture, blur_uv + vec2(blur_step.x, -blur_step.y));`);
        nodeCode.push(`  ${varName} += texture2D(uTexture, blur_uv + vec2(-blur_step.x, 0.0));`);
        nodeCode.push(`  ${varName} += texture2D(uTexture, blur_uv + vec2(0.0, 0.0));`);
        nodeCode.push(`  ${varName} += texture2D(uTexture, blur_uv + vec2(blur_step.x, 0.0));`);
        nodeCode.push(`  ${varName} += texture2D(uTexture, blur_uv + vec2(-blur_step.x, blur_step.y));`);
        nodeCode.push(`  ${varName} += texture2D(uTexture, blur_uv + vec2(0.0, blur_step.y));`);
        nodeCode.push(`  ${varName} += texture2D(uTexture, blur_uv + vec2(blur_step.x, blur_step.y));`);
        nodeCode.push(`  ${varName} /= 9.0;`);
        break;
      }
      case "Glow": {
        const input = inputVarMap.get("image") ?? "vec4(0.0)";
        const intensity = (node.params.intensity as number) ?? 1;
        nodeCode.push(`  float bright = max(${input}.r, max(${input}.g, ${input}.b));`);
        nodeCode.push(`  vec4 ${varName} = ${input} * clamp(bright * ${toGLSLFloat(intensity)}, 0.0, 1.0);`);
        break;
      }
      case "EdgeDetect": {
        const input = inputVarMap.get("image") ?? "vec4(0.0)";
        nodeCode.push(`  vec2 step = vec2(1.0) / iResolution;`);
        nodeCode.push(`  vec2 uv = gl_FragCoord.xy / iResolution;`);
        nodeCode.push(`  vec4 ${varName} = sobel(uTexture, uv, step);`);
        break;
      }
      case "Displace": {
        const image = inputVarMap.get("image") ?? "vec4(0.0)";
        nodeCode.push(`  vec4 ${varName} = ${image};`);
        break;
      }
      case "BrightnessContrast": {
        const input = inputVarMap.get("image") ?? "vec4(0.0)";
        const brightness = (node.params.brightness as number) ?? 0;
        const contrast = (node.params.contrast as number) ?? 0;
        const cf = (259.0 * (255.0 + 255.0 * contrast)) / (255.0 * (259.0 - 255.0 * contrast));
        nodeCode.push(`  vec3 bc_c = ${input}.rgb + ${toGLSLFloat(brightness)};`);
        nodeCode.push(`  bc_c = ${toGLSLFloat(cf)} * (bc_c - 0.5) + 0.5;`);
        nodeCode.push(`  vec4 ${varName} = vec4(clamp(bc_c, 0.0, 1.0), ${input}.a);`);
        break;
      }
      case "HueShift": {
        const input = inputVarMap.get("image") ?? "vec4(0.0)";
        const angle = (node.params.angle as number) ?? 0;
        nodeCode.push(`  vec3 hs_hsv = rgb2hsv(${input}.rgb);`);
        nodeCode.push(`  hs_hsv.x = fract(hs_hsv.x + ${toGLSLFloat(angle)} / 360.0);`);
        nodeCode.push(`  vec4 ${varName} = vec4(hsv2rgb(hs_hsv), ${input}.a);`);
        break;
      }
      case "Saturation": {
        const input = inputVarMap.get("image") ?? "vec4(0.0)";
        const amount = (node.params.amount as number) ?? 1;
        nodeCode.push(`  vec3 sat_hsv = rgb2hsv(${input}.rgb);`);
        nodeCode.push(`  sat_hsv.y = clamp(sat_hsv.y * ${toGLSLFloat(amount)}, 0.0, 1.0);`);
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
        const level = (node.params.level as number) ?? 0.5;
        nodeCode.push(`  float thresh_lum = luminance(${input}.rgb);`);
        nodeCode.push(`  vec4 ${varName} = vec4(vec3(step(${toGLSLFloat(level)}, thresh_lum)), ${input}.a);`);
        break;
      }
      case "Mix": {
        const a = inputVarMap.get("a") ?? "vec4(0.0)";
        const b = inputVarMap.get("b") ?? "vec4(0.0)";
        const factor = (node.params.factor as number) ?? 0.5;
        nodeCode.push(`  vec4 ${varName} = mix(${a}, ${b}, ${toGLSLFloat(factor)});`);
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
      case "Output": {
        const input = inputVarMap.get("source") ?? "vec4(0.0)";
        nodeCode.push(`  gl_FragColor = ${input};`);
        break;
      }
    }
  }

  const typeNames = [...state.nodes.values()].map((n) => n.typeName);
  const needsNoise = typeNames.includes("Noise");
  const needsColorUtil = ["HueShift", "Saturation", "Threshold", "EdgeDetect"].some((t) => typeNames.includes(t));
  const needsEdgeDetect = typeNames.includes("EdgeDetect");
  const needsTexture = typeNames.includes("Texture") && [...state.nodes.values()].some((n) => n.typeName === "Texture" && !!(n.params.url as string));
  const needsDisplace = typeNames.includes("Displace") && !typeNames.includes("Texture");
  const needsEdgeTexture = typeNames.includes("EdgeDetect") || typeNames.includes("Blur");

  const parts: string[] = [GLSL_HEADER];
  if (needsTexture || needsEdgeTexture) {
    parts.push(`uniform sampler2D uTexture;\n`);
  }
  parts.push(GLSL_UNIFORMS);
  if (needsNoise) {
    parts.push(generateNoiseGLSL());
  }
  if (needsColorUtil) {
    parts.push(generateColorUtilityGLSL());
  }
  if (needsEdgeDetect) {
    parts.push(generateEdgeDetectGLSL());
  }
  parts.push("void main() {\n");
  parts.push(nodeCode.join("\n"));
  parts.push("}\n");

  return { source: parts.join(""), valid: true };
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
