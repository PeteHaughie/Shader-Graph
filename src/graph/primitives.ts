export enum PortType {
  Vec4 = "vec4",
  Float = "float",
}

export interface PortSpec {
  name: string;
  type: PortType;
}

export interface ParamSpec {
  name: string;
  type: "float" | "int" | "string";
  default: unknown;
  min?: number;
  max?: number;
  isInput?: boolean;
}

export interface PrimitiveDefinition {
  typeName: string;
  inputs: PortSpec[];
  outputs: PortSpec[];
  params: ParamSpec[];
}
