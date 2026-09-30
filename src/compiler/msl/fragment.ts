import { GraphState, Node } from "../../graph/types.js";
import { validateGraph } from "../../graph/validation.js";
import { topologicalSort, topologicalSortSubset } from "../../graph/operations.js";
import { analyzePasses } from "../../graph/passes.js";
import { colorLiteral } from "../../graph/params.js";
import type { VaryingInfo, ShaderMetadata, ShaderPass } from "../compile.js";
import {
  MSL_PRELUDE,
  MSL_SAMPLER_DECL,
  generateNoiseMSL,
  generateSmoothNoiseMSL,
  generateColorUtilityMSL,
  generatePaletteMSL,
  generateEdgeDetectMSL,
} from "./helpers.js";

export interface CompiledShader {
  source: string;
  valid: boolean;
  errors?: string;
  metadata?: ShaderMetadata & { passes?: ShaderPass[]; entryPoints?: { name: string; passIndex: number; output: boolean }[] };
}

function toMSLFloat(n: number): string {
  const s = n.toString();
  return s.includes(".") ? s : `${s}.0`;
}

function wiredParam(inputVarMap: Map<string, string>, params: Record<string, unknown>, name: string, def: number): string {
  const wired = inputVarMap.get(name);
  if (wired) return `${wired}.r`;
  return toMSLFloat((params[name] as number) ?? def);
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

interface TextureResources {
  byNode: Map<string, number>;
  bufferByName: Map<string, number>;
  inputByIndex: Map<number, number>;
  shadowIndex: number;
  textureArgs: (index: number) => string;
  textureArgsForNode: (nodeId: string) => { name: string; index: number } | null;
  textureArgsForBuffer: (name: string) => { name: string; index: number };
  inputBinding: (inputIndex: number) => number;
}

function collectTextureResources(state: GraphState): TextureResources {
  const byNode = new Map<string, number>();
  let next = 0;
  for (const node of state.nodes.values()) {
    if ((node.typeName === "Texture" || node.typeName === "NormalMap") && !!(node.params.url as string)) {
      byNode.set(node.id, next++);
    }
  }
  const inputByIndex = new Map<number, number>();
  const inputIndices = [...new Set([...state.nodes.values()].filter((n) => n.typeName === "Input").map((n) => (n.params.index as number) ?? 0))].sort((a, b) => a - b);
  for (const idx of inputIndices) inputByIndex.set(idx, next++);
  const analysis = analyzePasses(state);
  const bufferByName = new Map<string, number>();
  for (const buffer of analysis.buffers) {
    bufferByName.set(buffer.name, next++);
  }
  const shadowIndex = next++;
  return {
    byNode,
    bufferByName,
    inputByIndex,
    shadowIndex,
    textureArgs: (index: number) => `texture2d<float> uTexture${index} [[texture(${index})]]`,
    textureArgsForNode: (nodeId: string) => (byNode.has(nodeId) ? { name: `uTexture${byNode.get(nodeId)}`, index: byNode.get(nodeId)! } : null),
    textureArgsForBuffer: (name: string) => ({ name, index: bufferByName.get(name)! }),
    inputBinding: (inputIndex: number) => inputByIndex.get(inputIndex) ?? shadowIndex,
  };
}

function sourceNodeForPort(state: GraphState, nodeId: string, port: string): Node | null {
  for (const edge of state.edges.values()) {
    if (edge.toNode === nodeId && edge.toPort === port) {
      return state.nodes.get(edge.fromNode) ?? null;
    }
  }
  return null;
}

interface EmitContext {
  state: GraphState;
  textures: TextureResources;
  usedTextures: Map<number, string>;
}

function useTexture(ctx: EmitContext, name: string, index: number): void {
  ctx.usedTextures.set(index, name);
}

function emitNodeLines(node: Node, varName: string, inputVarMap: Map<string, string>, ctx: EmitContext): string[] {
  const lines: string[] = [];
  const { state, textures } = ctx;
  const fragCoord = "fragCoord";

  const texSample = (index: number, name: string, uv: string) => {
    useTexture(ctx, name, index);
    return `${name}.sample(_samp, ${uv})`;
  };

  switch (node.typeName) {
    case "Texture": {
      const url = node.params.url as string;
      const uvInput = inputVarMap.get("uv");
      const uv = uvInput ? `${uvInput}.xy` : `${fragCoord} / u.iResolution`;
      if (url) {
        const res = textures.textureArgsForNode(node.id);
        const sample = res ? texSample(res.index, res.name, uv) : `float4(0.0)`;
        lines.push(`  float4 ${varName} = ${sample};`);
      } else {
        lines.push(`  float4 ${varName} = float4(${uv}, 0.0, 1.0);`);
      }
      break;
    }
    case "Input": {
      const idx = (node.params.index as number) ?? 0;
      const name = `uInput${idx}`;
      useTexture(ctx, name, textures.inputBinding(idx));
      lines.push(`  float4 ${varName} = ${name}.sample(_samp, ${fragCoord} / u.iResolution);`);
      break;
    }
    case "ReadBuffer": {
      const name = (node.params.name as string) ?? "";
      const uvInput = inputVarMap.get("uv");
      const uv = uvInput ? `${uvInput}.xy` : `${fragCoord} / u.iResolution`;
      const res = textures.textureArgsForBuffer(name);
      lines.push(`  float4 ${varName} = ${texSample(res.index, name, uv)};`);
      break;
    }
    case "FragCoord": {
      lines.push(`  float4 ${varName} = float4(${fragCoord}, 0.0, 1.0);`);
      break;
    }
    case "Floor": {
      const fInput = inputVarMap.get("value") ?? "float4(0.0)";
      lines.push(`  float4 ${varName} = floor(${fInput});`);
      break;
    }
    case "Mod": {
      const mInput = inputVarMap.get("value") ?? "float4(0.0)";
      lines.push(`  float4 ${varName} = fmod(${mInput}, float4(${wiredParam(inputVarMap, node.params, "divisor", 2)}));`);
      break;
    }
    case "TexelSize": {
      lines.push(`  float4 ${varName} = float4(1.0 / u.iResolution, 0.0, 0.0);`);
      break;
    }
    case "Swizzle": {
      const swInput = inputVarMap.get("input") ?? "float4(0.0)";
      const pattern = (node.params.pattern as string) ?? "xxxx";
      const comps = pattern.split("").map((c) => {
        const idx = "xyzw".indexOf(c);
        return idx >= 0 ? `${swInput}.${c}` : "0.0";
      });
      lines.push(`  float4 ${varName} = float4(${comps.join(", ")});`);
      break;
    }
    case "Noise": {
      lines.push(`  float4 ${varName} = float4(noise1d(${wiredParam(inputVarMap, node.params, "scale", 1)}, ${wiredParam(inputVarMap, node.params, "seed", 0)}, ${fragCoord}));`);
      break;
    }
    case "SmoothNoise": {
      lines.push(`  float4 ${varName} = float4(smoothNoise(${fragCoord} * ${wiredParam(inputVarMap, node.params, "scale", 1)} + ${wiredParam(inputVarMap, node.params, "seed", 0)}));`);
      break;
    }
    case "FractalNoise": {
      lines.push(`  float4 ${varName} = float4(fbm(${fragCoord} * ${wiredParam(inputVarMap, node.params, "scale", 1)} + ${wiredParam(inputVarMap, node.params, "seed", 0)}, ${wiredParam(inputVarMap, node.params, "lacunarity", 2)}, ${wiredParam(inputVarMap, node.params, "gain", 0.5)}));`);
      break;
    }
    case "Time": {
      lines.push(`  float4 ${varName} = float4(u.iTime * ${wiredParam(inputVarMap, node.params, "speed", 1)});`);
      break;
    }
    case "SmoothStep": {
      const value = inputVarMap.get("value") ?? "float4(0.0)";
      const edge0 = inputVarMap.get("edge0") ?? "float4(0.0)";
      const edge1 = inputVarMap.get("edge1") ?? "float4(1.0)";
      lines.push(`  float4 ${varName} = smoothstep(${edge0}, ${edge1}, ${value});`);
      break;
    }
    case "Palette": {
      const input = inputVarMap.get("value") ?? "float4(0.0)";
      const mode = (node.params.mode as string) ?? "fire";
      const modeIndex = ["fire", "ice", "rainbow", "gold", "neon"].indexOf(mode);
      lines.push(`  float pal_lum = luminance(${input}.rgb);`);
      lines.push(`  float4 ${varName} = float4(palette(pal_lum, ${modeIndex}), 1.0);`);
      break;
    }
    case "SolidColor": {
      const r = (node.params.r as number) ?? 1;
      const g = (node.params.g as number) ?? 1;
      const b = (node.params.b as number) ?? 1;
      const a = (node.params.a as number) ?? 1;
      lines.push(`  float4 ${varName} = float4(${toMSLFloat(r)}, ${toMSLFloat(g)}, ${toMSLFloat(b)}, ${toMSLFloat(a)});`);
      break;
    }
    case "Gradient": {
      const a = inputVarMap.get("colorA") ?? "float4(0.0)";
      const b = inputVarMap.get("colorB") ?? "float4(1.0)";
      const angleWired = inputVarMap.get("angle");
      if (angleWired) {
        lines.push(`  float grad_a = ${angleWired}.r * 3.14159 / 180.0;`);
        lines.push(`  float2 grad_dir = float2(cos(grad_a), sin(grad_a));`);
      } else {
        const angle = (node.params.angle as number) ?? 0;
        const rad = (angle * Math.PI) / 180;
        lines.push(`  float2 grad_dir = float2(${toMSLFloat(Math.cos(rad))}, ${toMSLFloat(Math.sin(rad))});`);
      }
      lines.push(`  float grad_t = dot(${fragCoord}, grad_dir) / dot(u.iResolution, abs(grad_dir));`);
      lines.push(`  float4 ${varName} = mix(${a}, ${b}, clamp(grad_t, 0.0, 1.0));`);
      break;
    }
    case "Checkerboard": {
      const a = inputVarMap.get("colorA") ?? "float4(1.0)";
      const b = inputVarMap.get("colorB") ?? "float4(0.0)";
      lines.push(`  float2 cb = floor(${wiredParam(inputVarMap, node.params, "frequency", 4)} * ${fragCoord} / u.iResolution);`);
      lines.push(`  float4 ${varName} = fmod(cb.x + cb.y, 2.0) < 0.5 ? ${a} : ${b};`);
      break;
    }
    case "Blur": {
      const blurInput = inputVarMap.get("image") ?? "float4(0.0)";
      const blurSrcNode = sourceNodeForPort(state, node.id, "image");
      if (blurSrcNode?.typeName === "Texture") {
        const res = textures.textureArgsForNode(blurSrcNode.id);
        if (res) {
          lines.push(`  float2 blur_step = float2(${wiredParam(inputVarMap, node.params, "radius", 2)}) / u.iResolution;`);
          lines.push(`  float2 blur_uv = ${fragCoord} / u.iResolution;`);
          lines.push(`  float4 ${varName} = float4(0.0);`);
          for (const dy of [-1, 0, 1]) {
            for (const dx of [-1, 0, 1]) {
              lines.push(`  ${varName} += ${texSample(res.index, res.name, `blur_uv + float2(${dx}.0, ${dy}.0) * blur_step`)};`);
            }
          }
          lines.push(`  ${varName} /= 9.0;`);
          break;
        }
      }
      lines.push(`  float4 ${varName} = ${blurInput};`);
      break;
    }
    case "Glow": {
      const input = inputVarMap.get("image") ?? "float4(0.0)";
      lines.push(`  float bright = max(${input}.r, max(${input}.g, ${input}.b));`);
      lines.push(`  float4 ${varName} = ${input} * clamp(bright * ${wiredParam(inputVarMap, node.params, "intensity", 1)}, 0.0, 1.0);`);
      break;
    }
    case "EdgeDetect": {
      const edgeInput = inputVarMap.get("image") ?? "float4(0.0)";
      const edgeSrcNode = sourceNodeForPort(state, node.id, "image");
      if (edgeSrcNode?.typeName === "Texture") {
        const res = textures.textureArgsForNode(edgeSrcNode.id);
        if (res) {
          useTexture(ctx, res.name, res.index);
          lines.push(`  float2 step = float2(1.0) / u.iResolution;`);
          lines.push(`  float2 uv = ${fragCoord} / u.iResolution;`);
          lines.push(`  float4 ${varName} = sobel(${res.name}, _samp, uv, step);`);
          break;
        }
      }
      lines.push(`  float4 ${varName} = ${edgeInput};`);
      break;
    }
    case "Displace": {
      const image = inputVarMap.get("image") ?? "float4(0.0)";
      const map = inputVarMap.get("map") ?? "float4(0.0)";
      const dispSrcNode = sourceNodeForPort(state, node.id, "image");
      if (dispSrcNode?.typeName === "Texture") {
        const res = textures.textureArgsForNode(dispSrcNode.id);
        if (res) {
          lines.push(`  float2 disp_uv = ${fragCoord} / u.iResolution + (${map}.rg * ${wiredParam(inputVarMap, node.params, "amount", 0.05)});`);
          lines.push(`  float4 ${varName} = ${texSample(res.index, res.name, "disp_uv")};`);
          break;
        }
      }
      lines.push(`  float4 ${varName} = ${image};`);
      break;
    }
    case "BrightnessContrast": {
      const input = inputVarMap.get("image") ?? "float4(0.0)";
      const b = wiredParam(inputVarMap, node.params, "brightness", 0);
      const c = wiredParam(inputVarMap, node.params, "contrast", 0);
      lines.push(`  float3 bc_c = ${input}.rgb + ${b};`);
      lines.push(`  bc_c = (259.0 * (255.0 + 255.0 * ${c})) / (255.0 * (259.0 - 255.0 * ${c})) * (bc_c - 0.5) + 0.5;`);
      lines.push(`  float4 ${varName} = float4(clamp(bc_c, 0.0, 1.0), ${input}.a);`);
      break;
    }
    case "HueShift": {
      const input = inputVarMap.get("image") ?? "float4(0.0)";
      lines.push(`  float3 hs_hsv = rgb2hsv(${input}.rgb);`);
      lines.push(`  hs_hsv.x = fract(hs_hsv.x + ${wiredParam(inputVarMap, node.params, "angle", 0)} / 360.0);`);
      lines.push(`  float4 ${varName} = float4(hsv2rgb(hs_hsv), ${input}.a);`);
      break;
    }
    case "Saturation": {
      const input = inputVarMap.get("image") ?? "float4(0.0)";
      lines.push(`  float3 sat_hsv = rgb2hsv(${input}.rgb);`);
      lines.push(`  sat_hsv.y = clamp(sat_hsv.y * ${wiredParam(inputVarMap, node.params, "amount", 1)}, 0.0, 1.0);`);
      lines.push(`  float4 ${varName} = float4(hsv2rgb(sat_hsv), ${input}.a);`);
      break;
    }
    case "Invert": {
      const input = inputVarMap.get("image") ?? "float4(0.0)";
      lines.push(`  float4 ${varName} = float4(1.0 - ${input}.rgb, ${input}.a);`);
      break;
    }
    case "Threshold": {
      const input = inputVarMap.get("image") ?? "float4(0.0)";
      lines.push(`  float thresh_lum = luminance(${input}.rgb);`);
      lines.push(`  float4 ${varName} = float4(float3(step(${wiredParam(inputVarMap, node.params, "level", 0.5)}, thresh_lum)), ${input}.a);`);
      break;
    }
    case "Mix": {
      const a = inputVarMap.get("a") ?? "float4(0.0)";
      const b = inputVarMap.get("b") ?? "float4(0.0)";
      lines.push(`  float4 ${varName} = mix(${a}, ${b}, ${wiredParam(inputVarMap, node.params, "factor", 0.5)});`);
      break;
    }
    case "Add": {
      const a = inputVarMap.get("a") ?? "float4(0.0)";
      const b = inputVarMap.get("b") ?? "float4(0.0)";
      lines.push(`  float4 ${varName} = ${a} + ${b};`);
      break;
    }
    case "Subtract": {
      const a = inputVarMap.get("a") ?? "float4(0.0)";
      const b = inputVarMap.get("b") ?? "float4(0.0)";
      lines.push(`  float4 ${varName} = ${a} - ${b};`);
      break;
    }
    case "Multiply": {
      const a = inputVarMap.get("a") ?? "float4(0.0)";
      const b = inputVarMap.get("b") ?? "float4(0.0)";
      lines.push(`  float4 ${varName} = ${a} * ${b};`);
      break;
    }
    case "Mask": {
      const image = inputVarMap.get("image") ?? "float4(0.0)";
      const mask = inputVarMap.get("mask") ?? "float4(1.0)";
      const invert = (node.params.invert as number) ?? 0;
      if (invert) {
        lines.push(`  float4 ${varName} = float4(${image}.rgb * (1.0 - ${mask}.a), ${image}.a);`);
      } else {
        lines.push(`  float4 ${varName} = float4(${image}.rgb * ${mask}.a, ${image}.a);`);
      }
      break;
    }
    case "FromVertex": {
      const vName = (node.params.name as string) ?? "vData";
      const sanitized = vName.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`  float4 ${varName} = in.${sanitized};`);
      break;
    }
    case "DiffuseLight": {
      const normal = inputVarMap.get("normal") ?? "float4(0.0, 1.0, 0.0, 0.0)";
      const ld = (node.params.lightDir as string) ?? "0.5,1.0,0.5";
      const col = colorLiteral(node.params.color, [1, 0, 0, 1]);
      lines.push(`  float3 dl_n = normalize(${normal}.xyz);`);
      lines.push(`  float3 dl_l = normalize(float3(${ld}));`);
      lines.push(`  float dl_dot = max(dot(dl_n, dl_l), 0.0);`);
      lines.push(`  float4 ${varName} = float4(float3(${col}) * dl_dot, 1.0);`);
      break;
    }
    case "AmbientLight": {
      const col = colorLiteral(node.params.color, [0.1, 0, 0, 1]);
      lines.push(`  float4 ${varName} = float4(float3(${col}), 1.0);`);
      break;
    }
    case "NormalMap": {
      const normal = inputVarMap.get("normal") ?? "float4(0.0, 1.0, 0.0, 0.0)";
      const position = inputVarMap.get("position") ?? "float4(0.0)";
      const url = (node.params.url as string) ?? "";
      const intensity = (node.params.intensity as number) ?? 1;
      const res = url ? textures.textureArgsForNode(node.id) : null;
      if (res) {
        lines.push(`  float3 nm_sampled = ${texSample(res.index, res.name, `${fragCoord} / u.iResolution`)}.xyz * 2.0 - 1.0;`);
      } else {
        lines.push(`  float3 nm_sampled = float3(0.0, 0.0, 1.0);`);
      }
      lines.push(`  nm_sampled *= ${toMSLFloat(intensity)};`);
      lines.push(`  float3 nm_tangent = normalize(dfdx(${position}.xyz));`);
      lines.push(`  float3 nm_bitangent = normalize(cross(${normal}.xyz, nm_tangent));`);
      lines.push(`  float3x3 nm_tbn = float3x3(nm_tangent, nm_bitangent, ${normal}.xyz);`);
      lines.push(`  float4 ${varName} = float4(normalize(nm_tbn * nm_sampled), 0.0);`);
      break;
    }
    case "SpecularLight": {
      const normal = inputVarMap.get("normal") ?? "float4(0.0, 1.0, 0.0, 0.0)";
      const viewDir = inputVarMap.get("viewDir") ?? "float4(0.0, 0.0, 1.0, 0.0)";
      const lightDir = inputVarMap.get("lightDir") ?? "float4(0.5, 1.0, 0.5, 0.0)";
      const shininess = (node.params.shininess as number) ?? 32;
      const col = colorLiteral(node.params.color, [1, 1, 1, 1]);
      lines.push(`  float3 sl_n = normalize(${normal}.xyz);`);
      lines.push(`  float3 sl_l = normalize(${lightDir}.xyz);`);
      lines.push(`  float3 sl_v = normalize(${viewDir}.xyz);`);
      lines.push(`  float3 sl_h = normalize(sl_l + sl_v);`);
      lines.push(`  float sl_spec = pow(max(dot(sl_n, sl_h), 0.0), ${toMSLFloat(shininess)});`);
      lines.push(`  float4 ${varName} = float4(float3(${col}) * sl_spec, 1.0);`);
      break;
    }
    case "ShadowMap": {
      const position = inputVarMap.get("position") ?? "float4(0.0)";
      const bias = (node.params.bias as number) ?? 0.005;
      useTexture(ctx, "uShadowMap", textures.shadowIndex);
      lines.push(`  float4 sm_light_pos = u.uLightMVP * ${position};`);
      lines.push(`  float3 sm_proj = sm_light_pos.xyz / sm_light_pos.w;`);
      lines.push(`  sm_proj = sm_proj * 0.5 + 0.5;`);
      lines.push(`  float sm_closest = uShadowMap.sample(_samp, sm_proj.xy).r;`);
      lines.push(`  float sm_current = sm_proj.z - ${toMSLFloat(bias)};`);
      lines.push(`  float sm_shadow = sm_current > sm_closest ? 0.0 : 1.0;`);
      lines.push(`  float4 ${varName} = float4(float3(sm_shadow), 1.0);`);
      break;
    }
    case "PassTarget":
    case "Output": {
      const input = inputVarMap.get("source") ?? "float4(0.0)";
      lines.push(`  return ${input};`);
      break;
    }
  }

  return lines;
}

function fragmentUniformsMSL(typeNames: string[]): string {
  const fields = ["  float2 iResolution;"];
  if (typeNames.includes("Time")) fields.push("  float iTime;");
  if (typeNames.includes("ShadowMap")) fields.push("  float4x4 uLightMVP;");
  return `struct Uniforms {\n${fields.join("\n")}\n};\n`;
}

function fragInMSL(varyings: VaryingInfo[]): string {
  const fields = ["  float4 position [[position]];"];
  for (const v of varyings) fields.push(`  float4 ${v.name};`);
  return `struct FragIn {\n${fields.join("\n")}\n};\n`;
}

function emitPass(
  state: GraphState,
  passNodes: string[],
  ctx: EmitContext,
  funcName: string,
  varyings: VaryingInfo[],
): string {
  ctx.usedTextures = new Map();
  const { order } = passNodes.length > 0 ? topologicalSortSubset(state, new Set(passNodes)) : { order: [] as string[] };
  const varNames = new Map<string, string>();
  const body: string[] = [];
  let varIndex = 0;
  for (const nodeId of order) {
    const node = state.nodes.get(nodeId)!;
    const varName = `v${varIndex++}`;
    varNames.set(nodeId, varName);
    const inputVarMap = buildInputVarMap(state, nodeId, varNames);
    body.push(...emitNodeLines(node, varName, inputVarMap, ctx));
  }
  const args = [`FragIn in [[stage_in]]`, `constant Uniforms& u [[buffer(0)]]`];
  const used = [...ctx.usedTextures.entries()].sort((a, b) => a[0] - b[0]);
  for (const [index, name] of used) {
    args.push(`texture2d<float> ${name} [[texture(${index})]]`);
  }
  const lines: string[] = [];
  lines.push(`fragment float4 ${funcName}(${args.join(",\n                               ")}) {`);
  lines.push(`  float2 fragCoord = in.position.xy;`);
  lines.push(...body);
  lines.push(`}`);
  return lines.join("\n") + "\n";
}

export function describeMetalFragment(
  state: GraphState,
  externalVaryings?: VaryingInfo[],
): ShaderMetadata & { passes?: ShaderPass[]; entryPoints?: { name: string; passIndex: number; output: boolean }[] } {
  const typeNames = [...state.nodes.values()].map((n) => n.typeName);
  const uniforms: { name: string; type: string; semantic: string }[] = [
    { name: "iResolution", type: "float2", semantic: "resolution" },
  ];
  if (typeNames.includes("Time")) uniforms.push({ name: "iTime", type: "float", semantic: "time" });
  const textures = collectTextureResources(state);
  for (const [nodeId, index] of [...textures.byNode.entries()].sort((a, b) => a[1] - b[1])) {
    const node = state.nodes.get(nodeId);
    uniforms.push({ name: `uTexture${index}`, type: "texture2d<float>", semantic: node?.typeName === "NormalMap" ? "normalMap" : "texture" });
  }
  for (const [inputIndex] of [...textures.inputByIndex.entries()].sort((a, b) => a[1] - b[1])) {
    uniforms.push({ name: `uInput${inputIndex}`, type: "texture2d<float>", semantic: "input" });
  }
  for (const [name, index] of [...textures.bufferByName.entries()].sort((a, b) => a[1] - b[1])) {
    uniforms.push({ name, type: "texture2d<float>", semantic: "buffer" });
  }
  if (typeNames.includes("ShadowMap")) {
    uniforms.push({ name: "uShadowMap", type: "texture2d<float>", semantic: "shadowMap" });
    uniforms.push({ name: "uLightMVP", type: "float4x4", semantic: "lightModelViewProjection" });
  }

  const analysis = analyzePasses(state);
  const passes: ShaderPass[] = [];
  const entryPoints: { name: string; passIndex: number; output: boolean }[] = [];
  if (analysis.passes.length > 0) {
    for (const pass of analysis.passes) {
      const output = pass.sinkType === "Output";
      const name = `fragment_pass${pass.index}`;
      passes.push({
        index: pass.index,
        type: "fragment",
        target: pass.target,
        persistent: pass.persistent,
        float: pass.float,
        format: pass.format,
        width: pass.width,
        height: pass.height,
        output,
        nodes: pass.nodes,
        entryPoint: name,
      } as ShaderPass);
      entryPoints.push({ name, passIndex: pass.index, output });
    }
  }
  const result: any = { uniforms, varyings: externalVaryings ?? [], output: "fragment" };
  if (passes.length > 0) {
    result.passes = passes;
    result.entryPoints = entryPoints;
  }
  return result;
}

export function compileMetalFragment(state: GraphState, externalVaryings?: VaryingInfo[]): CompiledShader {
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

  const typeNames = [...state.nodes.values()].map((n) => n.typeName);
  const textures = collectTextureResources(state);
  const ctx: EmitContext = { state, textures, usedTextures: new Map() };
  const varyings = externalVaryings ?? [];

  const needsNoise = typeNames.includes("Noise");
  const needsSmoothNoise = typeNames.includes("SmoothNoise") || typeNames.includes("FractalNoise");
  const needsColorUtil = ["HueShift", "Saturation", "Threshold", "EdgeDetect", "Palette"].some((t) => typeNames.includes(t));
  const needsEdgeDetect = typeNames.includes("EdgeDetect");
  const needsPalette = typeNames.includes("Palette");

  const parts: string[] = [MSL_PRELUDE];
  parts.push(fragmentUniformsMSL(typeNames));
  parts.push(fragInMSL(varyings));
  parts.push(MSL_SAMPLER_DECL);
  if (needsNoise) parts.push(generateNoiseMSL());
  if (needsSmoothNoise) parts.push(generateSmoothNoiseMSL());
  if (needsColorUtil) parts.push(generateColorUtilityMSL());
  if (needsEdgeDetect) parts.push(generateEdgeDetectMSL());
  if (needsPalette) parts.push(generatePaletteMSL());

  const hasPassTargets = analysis.passes.some((p) => p.sinkType === "PassTarget");
  if (hasPassTargets) {
    for (const pass of analysis.passes) {
      parts.push(emitPass(state, pass.nodes, ctx, `fragment_pass${pass.index}`, varyings));
    }
  } else {
    const { order } = topologicalSort(state);
    const nodes = order.length > 0 ? order : [...state.nodes.keys()];
    parts.push(emitPass(state, nodes, ctx, "fragment_main", varyings));
  }

  const metadata = describeMetalFragment(state, externalVaryings);
  return { source: parts.join(""), valid: true, metadata };
}
