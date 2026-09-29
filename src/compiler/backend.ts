import { GraphState } from "../graph/types.js";
import { Target, Language, languageOf } from "./targets.js";
import {
  compileGraph,
  validateGLSL,
  describeFragmentGraph,
  VaryingInfo as FragVarying,
  ShaderMetadata as FragShaderMetadata,
  ShaderPass,
} from "./compile.js";
import {
  compileVertexGraph,
  validateGLSL as validateGLSLVert,
  describeVertexGraph,
  VaryingInfo as VertVarying,
  ShaderMetadata as VertShaderMetadata,
} from "./vertex.js";
import { compileMetalFragment, describeMetalFragment } from "./msl/fragment.js";
import { compileMetalVertex, describeMetalVertex, VERTEX_IN_MSL } from "./msl/vertex.js";
import { MSL_PRELUDE } from "./msl/helpers.js";
import { validateMetal } from "./msl/validate.js";
import { getTarget, isGLSLTarget } from "./targets.js";

export interface EntryPoint {
  name: string;
  passIndex: number;
  output: boolean;
}

export type FragmentMetadata = FragShaderMetadata & { passes?: ShaderPass[]; entryPoints?: EntryPoint[] };

export interface CompiledShader {
  source: string;
  valid: boolean;
  errors?: string;
  metadata?: FragmentMetadata;
}

export interface CompiledVertex {
  source: string;
  valid: boolean;
  errors?: string;
  metadata?: VertShaderMetadata;
  varyings?: VertVarying[];
}

export type Stage = "frag" | "vert";

export interface Backend {
  language: Language;
  compileFragment(state: GraphState, varyings: FragVarying[] | undefined, target: Target): CompiledShader;
  compileVertex(state: GraphState, varyings: VertVarying[] | undefined, target: Target): CompiledVertex;
  describeFragment(state: GraphState, varyings?: FragVarying[]): FragmentMetadata;
  describeVertex(state: GraphState): VertShaderMetadata;
  validate(source: string, stage: Stage): Promise<{ valid: boolean; output: string }>;
  depthPass(target: Target): { vertex: string; fragment: string };
}

function glslDepthPass(targetName: string): { vertex: string; fragment: string } {
  const tgt = getTarget(isGLSLTarget(targetName) ? targetName : "es100");
  const vertSrc = `${tgt.version}\n${tgt.precision}${tgt.attribKeyword} vec3 aPosition;\nuniform mat4 uLightMVP;\nvoid main() {\n  gl_Position = uLightMVP * vec4(aPosition, 1.0);\n}`;
  const fragSrc = `${tgt.version}\n${tgt.precision}void main() {\n  gl_FragColor = vec4(1.0);\n}`;
  return { vertex: vertSrc, fragment: fragSrc };
}

function mslDepthPass(): { vertex: string; fragment: string } {
  const vertSrc =
    MSL_PRELUDE +
    VERTEX_IN_MSL +
    `struct DepthOut {\n  float4 position [[position]];\n};\n\n` +
    `vertex DepthOut vertex_depth(VertexIn in [[stage_in]],\n` +
    `                             constant float4x4& uLightMVP [[buffer(0)]]) {\n` +
    `  DepthOut out;\n  out.position = uLightMVP * float4(in.aPosition, 1.0);\n  return out;\n}\n`;
  const fragSrc = `${MSL_PRELUDE}fragment float4 depth_fragment() {\n  return float4(1.0);\n}\n`;
  return { vertex: vertSrc, fragment: fragSrc };
}

const glslBackend: Backend = {
  language: "glsl",
  compileFragment: (state, varyings, target) =>
    compileGraph(state, varyings, target) as CompiledShader,
  compileVertex: (state, varyings, target) =>
    compileVertexGraph(state, varyings, target) as CompiledVertex,
  describeFragment: (state, varyings) =>
    describeFragmentGraph(state, varyings) as FragmentMetadata,
  describeVertex: (state) => describeVertexGraph(state),
  validate: (source, stage) => (stage === "frag" ? validateGLSL(source) : validateGLSLVert(source)),
  depthPass: (target) => glslDepthPass(target),
};

const mslBackend: Backend = {
  language: "msl",
  compileFragment: (state, varyings) => compileMetalFragment(state, varyings),
  compileVertex: (state, varyings) => compileMetalVertex(state, varyings),
  describeFragment: (state, varyings) => describeMetalFragment(state, varyings),
  describeVertex: (state) => describeMetalVertex(state),
  validate: (source) => validateMetal(source),
  depthPass: () => mslDepthPass(),
};

export function getBackend(target: Target): Backend {
  return languageOf(target) === "msl" ? mslBackend : glslBackend;
}
