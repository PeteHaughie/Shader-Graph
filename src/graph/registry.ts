import { PrimitiveDefinition, PortType } from "./primitives.js";

const PRIMITIVES: PrimitiveDefinition[] = [
  {
    typeName: "Texture",
    inputs: [],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "url", type: "string", default: "" }],
  },
  {
    typeName: "Noise",
    inputs: [],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "scale", type: "float", default: 1, min: 0, max: 100 },
      { name: "seed", type: "float", default: 0, min: 0, max: 100 },
    ],
  },
  {
    typeName: "Blur",
    inputs: [{ name: "image", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "radius", type: "float", default: 2, min: 0, max: 50 }],
  },
  {
    typeName: "Mix",
    inputs: [
      { name: "a", type: PortType.Vec4 },
      { name: "b", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "factor", type: "float", default: 0.5, min: 0, max: 1 }],
  },
  {
    typeName: "Output",
    inputs: [{ name: "source", type: PortType.Vec4 }],
    outputs: [],
    params: [],
  },
];

const BY_NAME = new Map<string, PrimitiveDefinition>(PRIMITIVES.map((p) => [p.typeName, p]));

export function getPrimitive(name: string): PrimitiveDefinition | undefined {
  return BY_NAME.get(name);
}

export function listPrimitives(): PrimitiveDefinition[] {
  return PRIMITIVES;
}
