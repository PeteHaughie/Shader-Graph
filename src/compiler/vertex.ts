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

const GLSL_ATTRIBUTES = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aTexCoord;
attribute vec4 aColor;
`;

const GLSL_UNIFORMS = `
uniform mat4 uModelViewProjection;
uniform float iTime;
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

float noise1d(float scale, float seed) {
  vec2 p = aPosition.xy * scale + seed;
  float h = hash21(p);
  return h;
}
`;
}

export function compileVertexGraph(state: GraphState): CompiledShader {
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
      case "VertexPosition": {
        nodeCode.push(`  vec4 ${varName} = vec4(aPosition, 1.0);`);
        break;
      }
      case "VertexNormal": {
        nodeCode.push(`  vec4 ${varName} = vec4(aNormal, 0.0);`);
        break;
      }
      case "VertexTexCoord": {
        nodeCode.push(`  vec4 ${varName} = vec4(aTexCoord, 0.0, 1.0);`);
        break;
      }
      case "VertexColor": {
        nodeCode.push(`  vec4 ${varName} = aColor;`);
        break;
      }
      case "Translate": {
        const input = inputVarMap.get("position") ?? "vec4(0.0)";
        nodeCode.push(`  vec4 ${varName} = ${input} + vec4(${wiredParam(inputVarMap, node.params, "x", 0)}, ${wiredParam(inputVarMap, node.params, "y", 0)}, ${wiredParam(inputVarMap, node.params, "z", 0)}, 0.0);`);
        break;
      }
      case "Rotate": {
        const input = inputVarMap.get("position") ?? "vec4(0.0)";
        const angle = wiredParam(inputVarMap, node.params, "angle", 0);
        const axis = (node.params.axis as string) ?? "y";
        const rad = `${angle} * 3.14159 / 180.0`;
        if (axis === "x") {
          nodeCode.push(`  float rx_cos = cos(${rad}); float rx_sin = sin(${rad});`);
          nodeCode.push(`  vec4 ${varName} = ${input};`);
          nodeCode.push(`  ${varName}.y = ${input}.y * rx_cos - ${input}.z * rx_sin;`);
          nodeCode.push(`  ${varName}.z = ${input}.y * rx_sin + ${input}.z * rx_cos;`);
        } else if (axis === "z") {
          nodeCode.push(`  float rz_cos = cos(${rad}); float rz_sin = sin(${rad});`);
          nodeCode.push(`  vec4 ${varName} = ${input};`);
          nodeCode.push(`  ${varName}.x = ${input}.x * rz_cos - ${input}.y * rz_sin;`);
          nodeCode.push(`  ${varName}.y = ${input}.x * rz_sin + ${input}.y * rz_cos;`);
        } else {
          nodeCode.push(`  float ry_cos = cos(${rad}); float ry_sin = sin(${rad});`);
          nodeCode.push(`  vec4 ${varName} = ${input};`);
          nodeCode.push(`  ${varName}.x = ${input}.x * ry_cos + ${input}.z * ry_sin;`);
          nodeCode.push(`  ${varName}.z = -${input}.x * ry_sin + ${input}.z * ry_cos;`);
        }
        break;
      }
      case "Scale": {
        const input = inputVarMap.get("position") ?? "vec4(0.0)";
        nodeCode.push(`  vec4 ${varName} = ${input} * vec4(${wiredParam(inputVarMap, node.params, "x", 1)}, ${wiredParam(inputVarMap, node.params, "y", 1)}, ${wiredParam(inputVarMap, node.params, "z", 1)}, 1.0);`);
        break;
      }
      case "ModelViewProjection": {
        const input = inputVarMap.get("position") ?? "vec4(0.0)";
        nodeCode.push(`  vec4 ${varName} = uModelViewProjection * ${input};`);
        break;
      }
      case "Wave": {
        const input = inputVarMap.get("position") ?? "vec4(0.0)";
        const amp = wiredParam(inputVarMap, node.params, "amplitude", 0.5);
        const freq = wiredParam(inputVarMap, node.params, "frequency", 2);
        const speed = wiredParam(inputVarMap, node.params, "speed", 1);
        const axis = (node.params.axis as string) ?? "z";
        const axisIdx = { x: 0, y: 1, z: 2 }[axis] ?? 2;
        const comp = ["x", "y", "z"][axisIdx];
        nodeCode.push(`  float wave_val = sin(${input}.y * ${freq} + iTime * ${speed}) * ${amp};`);
        nodeCode.push(`  vec4 ${varName} = ${input};`);
        nodeCode.push(`  ${varName}.${comp} = ${input}.${comp} + wave_val;`);
        break;
      }
      case "NoiseDisplace": {
        const input = inputVarMap.get("position") ?? "vec4(0.0)";
        const amount = wiredParam(inputVarMap, node.params, "amount", 0.5);
        const scale = wiredParam(inputVarMap, node.params, "scale", 2);
        nodeCode.push(`  float nd_n = noise1d(${scale}, ${input}.x + ${input}.y) * 2.0 - 1.0;`);
        nodeCode.push(`  vec4 ${varName} = ${input} + vec4(aNormal * nd_n * ${amount}, 0.0);`);
        break;
      }
      case "Bend": {
        const input = inputVarMap.get("position") ?? "vec4(0.0)";
        const angle = wiredParam(inputVarMap, node.params, "angle", 30);
        const axis = (node.params.axis as string) ?? "y";
        const rad = `${angle} * 3.14159 / 180.0`;
        if (axis === "x") {
          nodeCode.push(`  float bx_cos = cos(${input}.x * ${rad}); float bx_sin = sin(${input}.x * ${rad});`);
          nodeCode.push(`  vec4 ${varName} = ${input};`);
          nodeCode.push(`  ${varName}.y = ${input}.y * bx_cos - ${input}.z * bx_sin;`);
          nodeCode.push(`  ${varName}.z = ${input}.y * bx_sin + ${input}.z * bx_cos;`);
        } else {
          nodeCode.push(`  float by_cos = cos(${input}.y * ${rad}); float by_sin = sin(${input}.y * ${rad});`);
          nodeCode.push(`  vec4 ${varName} = ${input};`);
          nodeCode.push(`  ${varName}.x = ${input}.x * by_cos + ${input}.z * by_sin;`);
          nodeCode.push(`  ${varName}.z = -${input}.x * by_sin + ${input}.z * by_cos;`);
        }
        break;
      }
      case "VertexOutput": {
        const input = inputVarMap.get("position") ?? "vec4(0.0)";
        nodeCode.push(`  gl_Position = ${input};`);
        break;
      }
    }
  }

  const typeNames = [...state.nodes.values()].map((n) => n.typeName);
  const needsNoise = typeNames.includes("NoiseDisplace");

  const parts: string[] = [GLSL_HEADER];
  parts.push(GLSL_ATTRIBUTES);
  parts.push(GLSL_UNIFORMS);
  if (needsNoise) {
    parts.push(generateNoiseGLSL());
  }
  parts.push("void main() {\n");
  parts.push(nodeCode.join("\n"));
  parts.push("}\n");

  return { source: parts.join(""), valid: true };
}

export function validateGLSL(source: string): Promise<{ valid: boolean; output: string }> {
  return new Promise((resolve) => {
    const tmpDir = mkdtempSync(join(tmpdir(), "shader-"));
    const shaderPath = join(tmpDir, "shader.vert");
    writeFileSync(shaderPath, source);

    execFile("glslangValidator", [shaderPath], { timeout: 5000 }, (error, _stdout, stderr) => {
      resolve({
        valid: !error,
        output: error ? stderr || error.message : "Valid GLSL",
      });
    });
  });
}
