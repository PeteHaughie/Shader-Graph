export enum PortType {
  Vec4 = "vec4",
  Float = "float",
}

export interface PortSpec {
  name: string;
  type: PortType;
  optional?: boolean;
}

export interface ParamSpec {
  name: string;
  type: "float" | "int" | "string";
  default: unknown;
  min?: number;
  max?: number;
  isInput?: boolean;
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
