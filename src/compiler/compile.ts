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
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec4 noise1d(float scale, float seed) {
  vec2 p = gl_FragCoord.xy * scale + seed;
  float h = hash(p);
  return vec4(h, h, h, 1.0);
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
    const def = getPrimitive(node.typeName)!;
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
      case "Blur": {
        const input = inputVarMap.get("image") ?? "vec4(0.0)";
        const radius = (node.params.radius as number) ?? 2;
        nodeCode.push(`  vec4 ${varName} = ${input};`);
        break;
      }
      case "Mix": {
        const a = inputVarMap.get("a") ?? "vec4(0.0)";
        const b = inputVarMap.get("b") ?? "vec4(0.0)";
        const factor = (node.params.factor as number) ?? 0.5;
        nodeCode.push(`  vec4 ${varName} = mix(${a}, ${b}, ${toGLSLFloat(factor)});`);
        break;
      }
      case "Output": {
        const input = inputVarMap.get("source") ?? "vec4(0.0)";
        nodeCode.push(`  gl_FragColor = ${input};`);
        break;
      }
    }
  }

  const needsNoise = [...state.nodes.values()].some((n) => n.typeName === "Noise");
  const needsTexture = [...state.nodes.values()].some((n) => n.typeName === "Texture" && !!(n.params.url as string));

  const parts: string[] = [GLSL_HEADER];
  if (needsTexture) {
    parts.push(`uniform sampler2D uTexture;\n`);
  }
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
