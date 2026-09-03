import { execFile } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GraphState, Node } from "../graph/types.js";
import { getPrimitive } from "../graph/registry.js";
import { validateGraph } from "../graph/validation.js";
import { topologicalSort, topologicalSortSubset } from "../graph/operations.js";
import { analyzePasses } from "../graph/passes.js";
import { getTarget, isValidTarget } from "./targets.js";
import type { Target, TargetDef } from "./targets.js";

interface CompiledShader {
  source: string;
  valid: boolean;
  errors?: string;
  metadata?: ShaderMetadata;
}

const GLSL_UNIFORMS = `
uniform vec2 iResolution;
`;

function glslHeader(target: TargetDef): string {
  return `${target.version}\n${target.precision}`;
}

function toGLSLFloat(n: number): string {
  const s = n.toString();
  return s.includes(".") ? s : `${s}.0`;
}

function wiredParam(inputVarMap: Map<string, string>, params: Record<string, unknown>, name: string, def: number): string {
  const wired = inputVarMap.get(name);
  if (wired) return `${wired}.r`;
  return toGLSLFloat((params[name] as number) ?? def);
}

function buildInputVarMap(state: GraphState, nodeId: string, varNames: Map<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const edge of state.edges.values()) {
    if (edge.toNode === nodeId) {
      map.set(edge.toPort, varNames.get(edge.fromNode)!);
    }
  }
  return map;
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

function generateEdgeDetectGLSL(tf: string): string {
  return `
vec4 sobel(sampler2D tex, vec2 uv, vec2 step) {
  float tl = luminance(${tf}(tex, uv + vec2(-step.x, step.y)).rgb);
  float t  = luminance(${tf}(tex, uv + vec2(0.0, step.y)).rgb);
  float tr = luminance(${tf}(tex, uv + vec2(step.x, step.y)).rgb);
  float l  = luminance(${tf}(tex, uv + vec2(-step.x, 0.0)).rgb);
  float r  = luminance(${tf}(tex, uv + vec2(step.x, 0.0)).rgb);
  float bl = luminance(${tf}(tex, uv + vec2(-step.x, -step.y)).rgb);
  float b  = luminance(${tf}(tex, uv + vec2(0.0, -step.y)).rgb);
  float br = luminance(${tf}(tex, uv + vec2(step.x, -step.y)).rgb);
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

export interface ShaderPass {
  index?: number;
  type: string;
  description?: string;
  target?: string;
  persistent?: boolean;
  float?: boolean;
  width?: string;
  height?: string;
  output?: boolean;
  nodes?: string[];
}

interface EmitContext {
  state: GraphState;
  target: TargetDef;
  textureIndexMap: Map<string, number>;
  texCounter: { value: number };
}

function emitNodeLines(node: Node, varName: string, inputVarMap: Map<string, string>, ctx: EmitContext): string[] {
  const lines: string[] = [];
  const { state, target, textureIndexMap, texCounter } = ctx;

  switch (node.typeName) {
    case "Texture": {
      const url = node.params.url as string;
      const uvInput = inputVarMap.get("uv");
      const defaultUV = "gl_FragCoord.xy / iResolution";
      const uv = uvInput ? `${uvInput}.xy` : defaultUV;
      if (url) {
        const ti = textureIndexMap.get(node.id) ?? 0;
        lines.push(`  vec4 ${varName} = ${target.textureFunc}(uTexture${ti}, ${uv});`);
      } else {
        lines.push(`  vec4 ${varName} = vec4(${uv}, 0.0, 1.0);`);
      }
      break;
    }
    case "ReadBuffer": {
      const name = (node.params.name as string) ?? "";
      const uvInput = inputVarMap.get("uv");
      const uv = uvInput ? `${uvInput}.xy` : "gl_FragCoord.xy / iResolution";
      lines.push(`  vec4 ${varName} = ${target.textureFunc}(${name}, ${uv});`);
      break;
    }
    case "FragCoord": {
      lines.push(`  vec4 ${varName} = vec4(gl_FragCoord.xy, 0.0, 1.0);`);
      break;
    }
    case "Floor": {
      const fInput = inputVarMap.get("value") ?? "vec4(0.0)";
      lines.push(`  vec4 ${varName} = floor(${fInput});`);
      break;
    }
    case "Mod": {
      const mInput = inputVarMap.get("value") ?? "vec4(0.0)";
      lines.push(`  vec4 ${varName} = mod(${mInput}, ${wiredParam(inputVarMap, node.params, "divisor", 2)});`);
      break;
    }
    case "TexelSize": {
      lines.push(`  vec4 ${varName} = vec4(1.0 / iResolution, 0.0, 0.0);`);
      break;
    }
    case "Swizzle": {
      const swInput = inputVarMap.get("input") ?? "vec4(0.0)";
      const pattern = (node.params.pattern as string) ?? "xxxx";
      const comps = pattern.split("").map((c) => {
        const idx = "xyzw".indexOf(c);
        return idx >= 0 ? `${swInput}.${c}` : "0.0";
      });
      lines.push(`  vec4 ${varName} = vec4(${comps.join(", ")});`);
      break;
    }
    case "Noise": {
      lines.push(`  vec4 ${varName} = noise1d(${wiredParam(inputVarMap, node.params, "scale", 1)}, ${wiredParam(inputVarMap, node.params, "seed", 0)});`);
      break;
    }
    case "SmoothNoise": {
      lines.push(`  vec4 ${varName} = vec4(smoothNoise(gl_FragCoord.xy * ${wiredParam(inputVarMap, node.params, "scale", 1)} + ${wiredParam(inputVarMap, node.params, "seed", 0)}));`);
      break;
    }
    case "FractalNoise": {
      lines.push(`  vec4 ${varName} = vec4(fbm(gl_FragCoord.xy * ${wiredParam(inputVarMap, node.params, "scale", 1)} + ${wiredParam(inputVarMap, node.params, "seed", 0)}, ${wiredParam(inputVarMap, node.params, "lacunarity", 2)}, ${wiredParam(inputVarMap, node.params, "gain", 0.5)}));`);
      break;
    }
    case "Time": {
      lines.push(`  vec4 ${varName} = vec4(iTime * ${wiredParam(inputVarMap, node.params, "speed", 1)});`);
      break;
    }
    case "SmoothStep": {
      const value = inputVarMap.get("value") ?? "vec4(0.0)";
      const edge0 = inputVarMap.get("edge0") ?? "vec4(0.0)";
      const edge1 = inputVarMap.get("edge1") ?? "vec4(1.0)";
      lines.push(`  vec4 ${varName} = smoothstep(${edge0}, ${edge1}, ${value});`);
      break;
    }
    case "Palette": {
      const input = inputVarMap.get("value") ?? "vec4(0.0)";
      const mode = (node.params.mode as string) ?? "fire";
      const modeIndex = ["fire", "ice", "rainbow", "gold", "neon"].indexOf(mode);
      lines.push(`  float pal_lum = luminance(${input}.rgb);`);
      lines.push(`  vec4 ${varName} = vec4(palette(pal_lum, ${modeIndex}), 1.0);`);
      break;
    }
    case "SolidColor": {
      const r = (node.params.r as number) ?? 1;
      const g = (node.params.g as number) ?? 1;
      const b = (node.params.b as number) ?? 1;
      const a = (node.params.a as number) ?? 1;
      lines.push(`  vec4 ${varName} = vec4(${toGLSLFloat(r)}, ${toGLSLFloat(g)}, ${toGLSLFloat(b)}, ${toGLSLFloat(a)});`);
      break;
    }
    case "Gradient": {
      const a = inputVarMap.get("colorA") ?? "vec4(0.0)";
      const b = inputVarMap.get("colorB") ?? "vec4(1.0)";
      const angleWired = inputVarMap.get("angle");
      if (angleWired) {
        lines.push(`  float grad_a = ${angleWired}.r * 3.14159 / 180.0;`);
        lines.push(`  vec2 grad_dir = vec2(cos(grad_a), sin(grad_a));`);
      } else {
        const angle = (node.params.angle as number) ?? 0;
        const rad = (angle * Math.PI) / 180;
        lines.push(`  vec2 grad_dir = vec2(${toGLSLFloat(Math.cos(rad))}, ${toGLSLFloat(Math.sin(rad))});`);
      }
      lines.push(`  float grad_t = dot(gl_FragCoord.xy, grad_dir) / dot(iResolution, abs(grad_dir));`);
      lines.push(`  vec4 ${varName} = mix(${a}, ${b}, clamp(grad_t, 0.0, 1.0));`);
      break;
    }
    case "Checkerboard": {
      const a = inputVarMap.get("colorA") ?? "vec4(1.0)";
      const b = inputVarMap.get("colorB") ?? "vec4(0.0)";
      lines.push(`  vec2 cb = floor(${wiredParam(inputVarMap, node.params, "frequency", 4)} * gl_FragCoord.xy / iResolution);`);
      lines.push(`  vec4 ${varName} = mod(cb.x + cb.y, 2.0) < 0.5 ? ${a} : ${b};`);
      break;
    }
    case "Blur": {
      const blurInput = inputVarMap.get("image") ?? "vec4(0.0)";
      const blurSrcNode = inputVarMap.has("image") ? state.nodes.get([...state.edges.values()].find((e) => e.toNode === node.id && e.toPort === "image")!.fromNode) : null;
      if (blurSrcNode?.typeName === "Texture") {
        const ti = textureIndexMap.get(blurSrcNode.id) ?? 0;
        lines.push(`  vec2 blur_step = vec2(${wiredParam(inputVarMap, node.params, "radius", 2)}) / iResolution;`);
        lines.push(`  vec2 blur_uv = gl_FragCoord.xy / iResolution;`);
        lines.push(`  vec4 ${varName} = vec4(0.0);`);
        for (const dy of [-1, 0, 1]) {
          for (const dx of [-1, 0, 1]) {
            lines.push(`  ${varName} += ${target.textureFunc}(uTexture${ti}, blur_uv + vec2(${dx}.0, ${dy}.0) * blur_step);`);
          }
        }
        lines.push(`  ${varName} /= 9.0;`);
      } else {
        lines.push(`  vec4 ${varName} = ${blurInput};`);
      }
      break;
    }
    case "Glow": {
      const input = inputVarMap.get("image") ?? "vec4(0.0)";
      lines.push(`  float bright = max(${input}.r, max(${input}.g, ${input}.b));`);
      lines.push(`  vec4 ${varName} = ${input} * clamp(bright * ${wiredParam(inputVarMap, node.params, "intensity", 1)}, 0.0, 1.0);`);
      break;
    }
    case "EdgeDetect": {
      const edgeInput = inputVarMap.get("image") ?? "vec4(0.0)";
      const edgeSrcNode = inputVarMap.has("image") ? state.nodes.get([...state.edges.values()].find((e) => e.toNode === node.id && e.toPort === "image")!.fromNode) : null;
      if (edgeSrcNode?.typeName === "Texture") {
        const ti = textureIndexMap.get(edgeSrcNode.id) ?? 0;
        lines.push(`  vec2 step = vec2(1.0) / iResolution;`);
        lines.push(`  vec2 uv = gl_FragCoord.xy / iResolution;`);
        lines.push(`  vec4 ${varName} = sobel(uTexture${ti}, uv, step);`);
      } else {
        lines.push(`  vec4 ${varName} = ${edgeInput};`);
      }
      break;
    }
    case "Displace": {
      const image = inputVarMap.get("image") ?? "vec4(0.0)";
      const map = inputVarMap.get("map") ?? "vec4(0.0)";
      const dispSrcNode = inputVarMap.has("image")
        ? state.nodes.get([...state.edges.values()].find((e) => e.toNode === node.id && e.toPort === "image")!.fromNode)
        : null;
      if (dispSrcNode?.typeName === "Texture") {
        const ti = textureIndexMap.get(dispSrcNode.id) ?? 0;
        lines.push(`  vec2 disp_uv = gl_FragCoord.xy / iResolution + (${map}.rg * ${wiredParam(inputVarMap, node.params, "amount", 0.05)});`);
        lines.push(`  vec4 ${varName} = ${target.textureFunc}(uTexture${ti}, disp_uv);`);
      } else {
        lines.push(`  vec4 ${varName} = ${image};`);
      }
      break;
    }
    case "BrightnessContrast": {
      const input = inputVarMap.get("image") ?? "vec4(0.0)";
      const b = wiredParam(inputVarMap, node.params, "brightness", 0);
      const c = wiredParam(inputVarMap, node.params, "contrast", 0);
      lines.push(`  vec3 bc_c = ${input}.rgb + ${b};`);
      lines.push(`  bc_c = (259.0 * (255.0 + 255.0 * ${c})) / (255.0 * (259.0 - 255.0 * ${c})) * (bc_c - 0.5) + 0.5;`);
      lines.push(`  vec4 ${varName} = vec4(clamp(bc_c, 0.0, 1.0), ${input}.a);`);
      break;
    }
    case "HueShift": {
      const input = inputVarMap.get("image") ?? "vec4(0.0)";
      lines.push(`  vec3 hs_hsv = rgb2hsv(${input}.rgb);`);
      lines.push(`  hs_hsv.x = fract(hs_hsv.x + ${wiredParam(inputVarMap, node.params, "angle", 0)} / 360.0);`);
      lines.push(`  vec4 ${varName} = vec4(hsv2rgb(hs_hsv), ${input}.a);`);
      break;
    }
    case "Saturation": {
      const input = inputVarMap.get("image") ?? "vec4(0.0)";
      lines.push(`  vec3 sat_hsv = rgb2hsv(${input}.rgb);`);
      lines.push(`  sat_hsv.y = clamp(sat_hsv.y * ${wiredParam(inputVarMap, node.params, "amount", 1)}, 0.0, 1.0);`);
      lines.push(`  vec4 ${varName} = vec4(hsv2rgb(sat_hsv), ${input}.a);`);
      break;
    }
    case "Invert": {
      const input = inputVarMap.get("image") ?? "vec4(0.0)";
      lines.push(`  vec4 ${varName} = vec4(1.0 - ${input}.rgb, ${input}.a);`);
      break;
    }
    case "Threshold": {
      const input = inputVarMap.get("image") ?? "vec4(0.0)";
      lines.push(`  float thresh_lum = luminance(${input}.rgb);`);
      lines.push(`  vec4 ${varName} = vec4(vec3(step(${wiredParam(inputVarMap, node.params, "level", 0.5)}, thresh_lum)), ${input}.a);`);
      break;
    }
    case "Mix": {
      const a = inputVarMap.get("a") ?? "vec4(0.0)";
      const b = inputVarMap.get("b") ?? "vec4(0.0)";
      lines.push(`  vec4 ${varName} = mix(${a}, ${b}, ${wiredParam(inputVarMap, node.params, "factor", 0.5)});`);
      break;
    }
    case "Add": {
      const a = inputVarMap.get("a") ?? "vec4(0.0)";
      const b = inputVarMap.get("b") ?? "vec4(0.0)";
      lines.push(`  vec4 ${varName} = ${a} + ${b};`);
      break;
    }
    case "Subtract": {
      const a = inputVarMap.get("a") ?? "vec4(0.0)";
      const b = inputVarMap.get("b") ?? "vec4(0.0)";
      lines.push(`  vec4 ${varName} = ${a} - ${b};`);
      break;
    }
    case "Multiply": {
      const a = inputVarMap.get("a") ?? "vec4(0.0)";
      const b = inputVarMap.get("b") ?? "vec4(0.0)";
      lines.push(`  vec4 ${varName} = ${a} * ${b};`);
      break;
    }
    case "Mask": {
      const image = inputVarMap.get("image") ?? "vec4(0.0)";
      const mask = inputVarMap.get("mask") ?? "vec4(1.0)";
      const invert = (node.params.invert as number) ?? 0;
      if (invert) {
        lines.push(`  vec4 ${varName} = vec4(${image}.rgb * (1.0 - ${mask}.a), ${image}.a);`);
      } else {
        lines.push(`  vec4 ${varName} = vec4(${image}.rgb * ${mask}.a, ${image}.a);`);
      }
      break;
    }
    case "FromVertex": {
      const vName = (node.params.name as string) ?? "vData";
      const sanitized = vName.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`  vec4 ${varName} = ${sanitized};`);
      break;
    }
    case "DiffuseLight": {
      const normal = inputVarMap.get("normal") ?? "vec4(0.0, 1.0, 0.0, 0.0)";
      const ld = (node.params.lightDir as string) ?? "0.5,1.0,0.5";
      const col = (node.params.color as string) ?? "1.0,0.0,0.0";
      lines.push(`  vec3 dl_n = normalize(${normal}.xyz);`);
      lines.push(`  vec3 dl_l = normalize(vec3(${ld}));`);
      lines.push(`  float dl_dot = max(dot(dl_n, dl_l), 0.0);`);
      lines.push(`  vec4 ${varName} = vec4(vec3(${col}) * dl_dot, 1.0);`);
      break;
    }
    case "AmbientLight": {
      const col = (node.params.color as string) ?? "0.1,0.0,0.0";
      lines.push(`  vec4 ${varName} = vec4(vec3(${col}), 1.0);`);
      break;
    }
    case "NormalMap": {
      const normal = inputVarMap.get("normal") ?? "vec4(0.0, 1.0, 0.0, 0.0)";
      const position = inputVarMap.get("position") ?? "vec4(0.0)";
      const url = (node.params.url as string) ?? "";
      const intensity = (node.params.intensity as number) ?? 1;
      const ti = textureIndexMap.size;
      if (url) textureIndexMap.set(node.id, texCounter.value++);
      const texName = url ? `uTexture${textureIndexMap.get(node.id) ?? ti}` : null;
      if (texName) {
        lines.push(`  vec3 nm_sampled = ${target.textureFunc}(${texName}, gl_FragCoord.xy / iResolution).xyz * 2.0 - 1.0;`);
      } else {
        lines.push(`  vec3 nm_sampled = vec3(0.0, 0.0, 1.0);`);
      }
      lines.push(`  nm_sampled *= ${toGLSLFloat(intensity)};`);
      lines.push(`  vec3 nm_tangent = normalize(dFdx(${position}.xyz));`);
      lines.push(`  vec3 nm_bitangent = normalize(cross(${normal}.xyz, nm_tangent));`);
      lines.push(`  mat3 nm_tbn = mat3(nm_tangent, nm_bitangent, ${normal}.xyz);`);
      lines.push(`  vec4 ${varName} = vec4(normalize(nm_tbn * nm_sampled), 0.0);`);
      break;
    }
    case "SpecularLight": {
      const normal = inputVarMap.get("normal") ?? "vec4(0.0, 1.0, 0.0, 0.0)";
      const viewDir = inputVarMap.get("viewDir") ?? "vec4(0.0, 0.0, 1.0, 0.0)";
      const lightDir = inputVarMap.get("lightDir") ?? "vec4(0.5, 1.0, 0.5, 0.0)";
      const shininess = (node.params.shininess as number) ?? 32;
      const col = (node.params.color as string) ?? "1.0,1.0,1.0";
      lines.push(`  vec3 sl_n = normalize(${normal}.xyz);`);
      lines.push(`  vec3 sl_l = normalize(${lightDir}.xyz);`);
      lines.push(`  vec3 sl_v = normalize(${viewDir}.xyz);`);
      lines.push(`  vec3 sl_h = normalize(sl_l + sl_v);`);
      lines.push(`  float sl_spec = pow(max(dot(sl_n, sl_h), 0.0), ${toGLSLFloat(shininess)});`);
      lines.push(`  vec4 ${varName} = vec4(vec3(${col}) * sl_spec, 1.0);`);
      break;
    }
    case "ShadowMap": {
      const position = inputVarMap.get("position") ?? "vec4(0.0)";
      const bias = (node.params.bias as number) ?? 0.005;
      lines.push(`  vec4 sm_light_pos = uLightMVP * ${position};`);
      lines.push(`  vec3 sm_proj = sm_light_pos.xyz / sm_light_pos.w;`);
      lines.push(`  sm_proj = sm_proj * 0.5 + 0.5;`);
      lines.push(`  float sm_closest = ${target.textureFunc}(uShadowMap, sm_proj.xy).r;`);
      lines.push(`  float sm_current = sm_proj.z - ${toGLSLFloat(bias)};`);
      lines.push(`  float sm_shadow = sm_current > sm_closest ? 0.0 : 1.0;`);
      lines.push(`  vec4 ${varName} = vec4(vec3(sm_shadow), 1.0);`);
      break;
    }
    case "PassTarget": {
      const input = inputVarMap.get("source") ?? "vec4(0.0)";
      lines.push(`  ${target.fragOutputName} = ${input};`);
      break;
    }
    case "Output": {
      const input = inputVarMap.get("source") ?? "vec4(0.0)";
      lines.push(`  ${target.fragOutputName} = ${input};`);
      break;
    }
  }

  return lines;
}

export function describeFragmentGraph(state: GraphState, externalVaryings?: VaryingInfo[]): ShaderMetadata & { passes?: ShaderPass[] } {
  const typeNames = [...state.nodes.values()].map((n) => n.typeName);
  const uniforms = [{ name: "iResolution", type: "vec2", semantic: "resolution" }];
  if (typeNames.includes("Time")) uniforms.push({ name: "iTime", type: "float", semantic: "time" });
  const texCount = [...state.nodes.values()].filter((n) =>
    (n.typeName === "Texture" || n.typeName === "NormalMap") && !!(n.params.url as string)
  ).length;
  const blurTexCount = [...state.nodes.values()].filter((n) =>
    (n.typeName === "Blur" || n.typeName === "EdgeDetect") &&
    [...state.edges.values()].some((e) => e.toNode === n.id && e.toPort === "image" &&
      state.nodes.get(e.fromNode)?.typeName === "Texture")
  ).length;
  const displaceTexCount = [...state.nodes.values()].filter((n) =>
    n.typeName === "Displace" &&
    [...state.edges.values()].some((e) => e.toNode === n.id && e.toPort === "image" &&
      state.nodes.get(e.fromNode)?.typeName === "Texture")
  ).length;
  for (let i = 0; i < texCount + blurTexCount + displaceTexCount; i++) {
    uniforms.push({ name: `uTexture${i}`, type: "sampler2D", semantic: "texture" });
  }
  const passes: ShaderPass[] = [];
  if (typeNames.includes("ShadowMap")) {
    uniforms.push({ name: "uShadowMap", type: "sampler2D", semantic: "shadowMap" });
    uniforms.push({ name: "uLightMVP", type: "mat4", semantic: "lightModelViewProjection" });
    passes.push({ type: "depth", description: "Render scene from light POV to depth texture, bind to uShadowMap" });
  }
  const analysis = analyzePasses(state);
  const hasMultiPass = analysis.passes.some((p) => p.sinkType === "PassTarget");
  if (hasMultiPass) {
    uniforms.push({ name: "PASSINDEX", type: "int", semantic: "passIndex" });
    for (const pass of analysis.passes) {
      if (!pass.target) continue;
      uniforms.push({ name: pass.target, type: "sampler2D", semantic: "buffer" });
    }
    for (const pass of analysis.passes) {
      passes.push({
        index: pass.index,
        type: "fragment",
        target: pass.target,
        persistent: pass.persistent,
        float: pass.float,
        width: pass.width,
        height: pass.height,
        output: pass.sinkType === "Output",
        nodes: pass.nodes,
      });
    }
  }
  const result: any = { uniforms, varyings: externalVaryings ?? [], output: "fragment" };
  if (passes.length > 0) result.passes = passes;
  return result;
}

export function compileGraph(state: GraphState, externalVaryings?: VaryingInfo[], targetName: string = "es100"): CompiledShader {
  const target = getTarget(isValidTarget(targetName) ? targetName : "es100");
  const validation = validateGraph(state);
  if (!validation.valid) {
    return {
      source: "",
      valid: false,
      errors: `Graph validation failed:\n${validation.errors.map((e) => `  - ${e.message}`).join("\n")}`,
    };
  }

  const analysis = analyzePasses(state);
  if (analysis.errors.length > 0) {
    return {
      source: "",
      valid: false,
      errors: `Pass analysis failed:\n${analysis.errors.map((e) => `  - ${e}`).join("\n")}`,
    };
  }

  const ctx: EmitContext = {
    state,
    target,
    textureIndexMap: new Map<string, number>(),
    texCounter: { value: 0 },
  };
  for (const node of state.nodes.values()) {
    if (node.typeName === "Texture" && !!(node.params.url as string)) {
      ctx.textureIndexMap.set(node.id, ctx.texCounter.value++);
    }
  }

  const typeNames = [...state.nodes.values()].map((n) => n.typeName);
  const needsNoise = typeNames.includes("Noise");
  const needsColorUtil = ["HueShift", "Saturation", "Threshold", "EdgeDetect", "Palette"].some((t) => typeNames.includes(t));
  const needsSmoothNoise = typeNames.includes("SmoothNoise") || typeNames.includes("FractalNoise");
  const needsEdgeDetect = typeNames.includes("EdgeDetect");
  const needsTime = typeNames.includes("Time");
  const texCount = [...state.nodes.values()].filter((n) =>
    (n.typeName === "Texture" || n.typeName === "NormalMap") && !!(n.params.url as string)
  ).length;
  const blurTexCount = [...state.nodes.values()].filter((n) =>
    (n.typeName === "Blur" || n.typeName === "EdgeDetect") &&
    [...state.edges.values()].some((e) => e.toNode === n.id && e.toPort === "image" &&
      state.nodes.get(e.fromNode)?.typeName === "Texture")
  ).length;
  const displaceTexCount = [...state.nodes.values()].filter((n) =>
    n.typeName === "Displace" &&
    [...state.edges.values()].some((e) => e.toNode === n.id && e.toPort === "image" &&
      state.nodes.get(e.fromNode)?.typeName === "Texture")
  ).length;

  const parts: string[] = [glslHeader(target)];
  if (target.fragOutputDecl) parts.push(target.fragOutputDecl);
  if (typeNames.includes("NormalMap") && target.derivativesExt) {
    parts.push(target.derivativesExt);
  }
  for (let i = 0; i < texCount + blurTexCount + displaceTexCount; i++) {
    parts.push(`uniform sampler2D uTexture${i};\n`);
  }
  if (typeNames.includes("ShadowMap")) {
    parts.push(`uniform sampler2D uShadowMap;\n`);
    parts.push(`uniform mat4 uLightMVP;\n`);
  }
  if (needsTime) {
    parts.push(`uniform float iTime;\n`);
  }
  parts.push(GLSL_UNIFORMS);
  const isMultiPass = analysis.passes.length > 1;
  if (isMultiPass) {
    parts.push(`uniform int PASSINDEX;\n`);
    for (const pass of analysis.passes) {
      if (pass.target) parts.push(`uniform sampler2D ${pass.target};\n`);
    }
  }
  const varyings = externalVaryings ?? [];
  for (const v of varyings) {
    parts.push(`${target.varyingIn} ${v.type} ${v.name};\n`);
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
    parts.push(generateEdgeDetectGLSL(target.textureFunc));
  }
  if (typeNames.includes("Palette")) {
    parts.push(generatePaletteGLSL());
  }

  parts.push("void main() {\n");
  if (isMultiPass) {
    analysis.passes.forEach((pass, i) => {
      const { order } = topologicalSortSubset(state, new Set(pass.nodes));
      parts.push(i === 0 ? `if (PASSINDEX == ${pass.index}) {` : `else if (PASSINDEX == ${pass.index}) {`);
      const passNodeCode: string[] = [];
      const varNames = new Map<string, string>();
      let varIndex = 0;
      for (const nodeId of order) {
        const node = state.nodes.get(nodeId)!;
        const varName = `v${varIndex++}`;
        varNames.set(nodeId, varName);
        const inputVarMap = buildInputVarMap(state, nodeId, varNames);
        passNodeCode.push(...emitNodeLines(node, varName, inputVarMap, ctx));
      }
      parts.push(passNodeCode.join("\n"));
      parts.push("}\n");
    });
  } else {
    const { order } = topologicalSort(state);
    const nodeCode: string[] = [];
    const varNames = new Map<string, string>();
    let varIndex = 0;
    for (const nodeId of order) {
      const node = state.nodes.get(nodeId)!;
      const varName = `v${varIndex++}`;
      varNames.set(nodeId, varName);
      const inputVarMap = buildInputVarMap(state, nodeId, varNames);
      nodeCode.push(...emitNodeLines(node, varName, inputVarMap, ctx));
    }
    parts.push(nodeCode.join("\n"));
  }
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