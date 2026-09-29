import { GraphState } from "../../graph/types.js";
import { validateGraph } from "../../graph/validation.js";
import { topologicalSort } from "../../graph/operations.js";
import type { VaryingInfo, ShaderMetadata } from "../vertex.js";
import { MSL_PRELUDE, generateVertexNoiseMSL } from "./helpers.js";

export interface CompiledVertex {
  source: string;
  valid: boolean;
  errors?: string;
  metadata?: ShaderMetadata;
  varyings?: VaryingInfo[];
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

export function describeMetalVertex(state: GraphState): ShaderMetadata {
  const typeNames = [...state.nodes.values()].map((n) => n.typeName);
  const hasAnimated = typeNames.includes("Wave") || typeNames.includes("NoiseDisplace") || typeNames.includes("Bend");
  const uniforms = [{ name: "uModelViewProjection", type: "float4x4", semantic: "modelViewProjection" }];
  if (hasAnimated) uniforms.push({ name: "iTime", type: "float", semantic: "time" });
  const varyings = [...state.nodes.values()]
    .filter((n) => n.typeName === "PassToFragment")
    .map((n) => ({ name: (n.params.name as string)?.replace(/[^a-zA-Z0-9_]/g, "_") ?? "vData", type: "float4" }));
  return {
    attributes: [
      { name: "aPosition", type: "float3", semantic: "position" },
      { name: "aNormal", type: "float3", semantic: "normal" },
      { name: "aTexCoord", type: "float2", semantic: "texcoord" },
      { name: "aColor", type: "float4", semantic: "color" },
    ],
    uniforms,
    varyings,
    output: "position",
  };
}

function vertexUniformsMSL(typeNames: string[]): string {
  const hasAnimated = typeNames.includes("Wave") || typeNames.includes("NoiseDisplace") || typeNames.includes("Bend");
  const fields = ["  float4x4 uModelViewProjection;"];
  if (hasAnimated) fields.push("  float iTime;");
  return `struct VertexUniforms {\n${fields.join("\n")}\n};\n`;
}

export const VERTEX_IN_MSL = `struct VertexIn {
  float3 aPosition [[attribute(0)]];
  float3 aNormal   [[attribute(1)]];
  float2 aTexCoord [[attribute(2)]];
  float4 aColor    [[attribute(3)]];
};\n`;

function vertexOutMSL(varyings: VaryingInfo[]): string {
  const fields = ["  float4 position [[position]];"];
  for (const v of varyings) fields.push(`  float4 ${v.name};`);
  return `struct VertexOut {\n${fields.join("\n")}\n};\n`;
}

export function compileMetalVertex(state: GraphState, externalVaryings?: VaryingInfo[]): CompiledVertex {
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
  const varyings: VaryingInfo[] = [...(externalVaryings ?? [])];

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
      case "VertexPosition": {
        nodeCode.push(`  float4 ${varName} = float4(in.aPosition, 1.0);`);
        break;
      }
      case "VertexNormal": {
        nodeCode.push(`  float4 ${varName} = float4(in.aNormal, 0.0);`);
        break;
      }
      case "VertexTexCoord": {
        nodeCode.push(`  float4 ${varName} = float4(in.aTexCoord, 0.0, 1.0);`);
        break;
      }
      case "VertexColor": {
        nodeCode.push(`  float4 ${varName} = in.aColor;`);
        break;
      }
      case "Translate": {
        const input = inputVarMap.get("position") ?? "float4(0.0)";
        nodeCode.push(`  float4 ${varName} = ${input} + float4(${wiredParam(inputVarMap, node.params, "x", 0)}, ${wiredParam(inputVarMap, node.params, "y", 0)}, ${wiredParam(inputVarMap, node.params, "z", 0)}, 0.0);`);
        break;
      }
      case "Rotate": {
        const input = inputVarMap.get("position") ?? "float4(0.0)";
        const angle = wiredParam(inputVarMap, node.params, "angle", 0);
        const axis = (node.params.axis as string) ?? "y";
        const rad = `${angle} * 3.14159 / 180.0`;
        if (axis === "x") {
          nodeCode.push(`  float rx_cos = cos(${rad}); float rx_sin = sin(${rad});`);
          nodeCode.push(`  float4 ${varName} = ${input};`);
          nodeCode.push(`  ${varName}.y = ${input}.y * rx_cos - ${input}.z * rx_sin;`);
          nodeCode.push(`  ${varName}.z = ${input}.y * rx_sin + ${input}.z * rx_cos;`);
        } else if (axis === "z") {
          nodeCode.push(`  float rz_cos = cos(${rad}); float rz_sin = sin(${rad});`);
          nodeCode.push(`  float4 ${varName} = ${input};`);
          nodeCode.push(`  ${varName}.x = ${input}.x * rz_cos - ${input}.y * rz_sin;`);
          nodeCode.push(`  ${varName}.y = ${input}.x * rz_sin + ${input}.y * rz_cos;`);
        } else {
          nodeCode.push(`  float ry_cos = cos(${rad}); float ry_sin = sin(${rad});`);
          nodeCode.push(`  float4 ${varName} = ${input};`);
          nodeCode.push(`  ${varName}.x = ${input}.x * ry_cos + ${input}.z * ry_sin;`);
          nodeCode.push(`  ${varName}.z = -${input}.x * ry_sin + ${input}.z * ry_cos;`);
        }
        break;
      }
      case "Scale": {
        const input = inputVarMap.get("position") ?? "float4(0.0)";
        nodeCode.push(`  float4 ${varName} = ${input} * float4(${wiredParam(inputVarMap, node.params, "x", 1)}, ${wiredParam(inputVarMap, node.params, "y", 1)}, ${wiredParam(inputVarMap, node.params, "z", 1)}, 1.0);`);
        break;
      }
      case "ModelViewProjection": {
        const input = inputVarMap.get("position") ?? "float4(0.0)";
        nodeCode.push(`  float4 ${varName} = u.uModelViewProjection * ${input};`);
        break;
      }
      case "Wave": {
        const input = inputVarMap.get("position") ?? "float4(0.0)";
        const amp = wiredParam(inputVarMap, node.params, "amplitude", 0.5);
        const freq = wiredParam(inputVarMap, node.params, "frequency", 2);
        const speed = wiredParam(inputVarMap, node.params, "speed", 1);
        const axis = (node.params.axis as string) ?? "z";
        const axisIdx = { x: 0, y: 1, z: 2 }[axis] ?? 2;
        const comp = ["x", "y", "z"][axisIdx];
        nodeCode.push(`  float wave_val = sin(${input}.y * ${freq} + u.iTime * ${speed}) * ${amp};`);
        nodeCode.push(`  float4 ${varName} = ${input};`);
        nodeCode.push(`  ${varName}.${comp} = ${input}.${comp} + wave_val;`);
        break;
      }
      case "NoiseDisplace": {
        const input = inputVarMap.get("position") ?? "float4(0.0)";
        const amount = wiredParam(inputVarMap, node.params, "amount", 0.5);
        const scale = wiredParam(inputVarMap, node.params, "scale", 2);
        nodeCode.push(`  float nd_n = noise1d(${scale}, ${input}.x + ${input}.y, in.aPosition) * 2.0 - 1.0;`);
        nodeCode.push(`  float4 ${varName} = ${input} + float4(in.aNormal * nd_n * ${amount}, 0.0);`);
        break;
      }
      case "Bend": {
        const input = inputVarMap.get("position") ?? "float4(0.0)";
        const angle = wiredParam(inputVarMap, node.params, "angle", 30);
        const axis = (node.params.axis as string) ?? "y";
        const rad = `${angle} * 3.14159 / 180.0`;
        if (axis === "x") {
          nodeCode.push(`  float bx_cos = cos(${input}.x * ${rad}); float bx_sin = sin(${input}.x * ${rad});`);
          nodeCode.push(`  float4 ${varName} = ${input};`);
          nodeCode.push(`  ${varName}.y = ${input}.y * bx_cos - ${input}.z * bx_sin;`);
          nodeCode.push(`  ${varName}.z = ${input}.y * bx_sin + ${input}.z * bx_cos;`);
        } else {
          nodeCode.push(`  float by_cos = cos(${input}.y * ${rad}); float by_sin = sin(${input}.y * ${rad});`);
          nodeCode.push(`  float4 ${varName} = ${input};`);
          nodeCode.push(`  ${varName}.x = ${input}.x * by_cos + ${input}.z * by_sin;`);
          nodeCode.push(`  ${varName}.z = -${input}.x * by_sin + ${input}.z * by_cos;`);
        }
        break;
      }
      case "VertexOutput": {
        const input = inputVarMap.get("position") ?? "float4(0.0)";
        nodeCode.push(`  out.position = ${input};`);
        break;
      }
      case "PassToFragment": {
        const input = inputVarMap.get("value") ?? "float4(0.0)";
        const vName = (node.params.name as string) ?? "vData";
        const sanitized = vName.replace(/[^a-zA-Z0-9_]/g, "_");
        varyings.push({ name: sanitized, type: "vec4", sourceNodeId: node.id });
        nodeCode.push(`  out.${sanitized} = ${input};`);
        break;
      }
    }
  }

  const typeNames = [...state.nodes.values()].map((n) => n.typeName);
  const needsNoise = typeNames.includes("NoiseDisplace");

  const parts: string[] = [MSL_PRELUDE];
  parts.push(vertexUniformsMSL(typeNames));
  parts.push(VERTEX_IN_MSL);
  parts.push(vertexOutMSL(varyings));
  if (needsNoise) parts.push(generateVertexNoiseMSL());
  parts.push(`vertex VertexOut vertex_main(VertexIn in [[stage_in]],\n`);
  parts.push(`                             constant VertexUniforms& u [[buffer(0)]]) {\n`);
  parts.push(`  VertexOut out;\n`);
  parts.push(nodeCode.join("\n"));
  parts.push(`\n  return out;\n`);
  parts.push(`}\n`);

  const metadata = describeMetalVertex(state);
  return { source: parts.join(""), valid: true, varyings, metadata };
}
