export enum PortType {
  Vec4 = "vec4",
  Vec2 = "vec2",
  Mat4 = "mat4",
  Float = "float",
  Bool = "bool",
}

export interface PortSpec {
  name: string;
  type: PortType;
  optional?: boolean;
}

export type ParamType = "float" | "int" | "string" | "color" | "enum";

export interface ParamSpec {
  name: string;
  type: ParamType;
  default: unknown;
  min?: number;
  max?: number;
  isInput?: boolean;
  variants?: string[];
  optional?: boolean;
}

export enum GraphType {
  Fragment = "fragment",
  Vertex = "vertex",
}

export interface PrimitiveDefinition {
  typeName: string;
  graphType: GraphType;
  inputs: PortSpec[];
  outputs: PortSpec[];
  params: ParamSpec[];
}
