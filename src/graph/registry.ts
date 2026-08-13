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
      { name: "scale", type: "float", default: 1, min: 0, max: 100, isInput: true },
      { name: "seed", type: "float", default: 0, min: 0, max: 100, isInput: true },
    ],
  },
  {
    typeName: "SmoothNoise",
    inputs: [],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "scale", type: "float", default: 1, min: 0, max: 100, isInput: true },
      { name: "seed", type: "float", default: 0, min: 0, max: 100, isInput: true },
    ],
  },
  {
    typeName: "FractalNoise",
    inputs: [],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "scale", type: "float", default: 1, min: 0, max: 100, isInput: true },
      { name: "seed", type: "float", default: 0, min: 0, max: 100, isInput: true },
      { name: "octaves", type: "int", default: 4, min: 1, max: 8, isInput: true },
      { name: "lacunarity", type: "float", default: 2, min: 1, max: 5, isInput: true },
      { name: "gain", type: "float", default: 0.5, min: 0, max: 1, isInput: true },
    ],
  },
  {
    typeName: "SolidColor",
    inputs: [],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "r", type: "float", default: 1, min: 0, max: 1 },
      { name: "g", type: "float", default: 1, min: 0, max: 1 },
      { name: "b", type: "float", default: 1, min: 0, max: 1 },
      { name: "a", type: "float", default: 1, min: 0, max: 1 },
    ],
  },
  {
    typeName: "Gradient",
    inputs: [
      { name: "colorA", type: PortType.Vec4 },
      { name: "colorB", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "angle", type: "float", default: 0, min: 0, max: 360, isInput: true }],
  },
  {
    typeName: "Checkerboard",
    inputs: [
      { name: "colorA", type: PortType.Vec4 },
      { name: "colorB", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "frequency", type: "float", default: 4, min: 0.1, max: 50, isInput: true }],
  },
  {
    typeName: "Blur",
    inputs: [{ name: "image", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "radius", type: "float", default: 2, min: 0, max: 50, isInput: true }],
  },
  {
    typeName: "Glow",
    inputs: [{ name: "image", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "intensity", type: "float", default: 1, min: 0, max: 5, isInput: true }],
  },
  {
    typeName: "EdgeDetect",
    inputs: [{ name: "image", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "strength", type: "float", default: 1, min: 0, max: 5, isInput: true }],
  },
  {
    typeName: "Displace",
    inputs: [
      { name: "image", type: PortType.Vec4 },
      { name: "map", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "amount", type: "float", default: 0.05, min: 0, max: 1, isInput: true }],
  },
  {
    typeName: "BrightnessContrast",
    inputs: [{ name: "image", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "brightness", type: "float", default: 0, min: -1, max: 1, isInput: true },
      { name: "contrast", type: "float", default: 0, min: -1, max: 1, isInput: true },
    ],
  },
  {
    typeName: "HueShift",
    inputs: [{ name: "image", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "angle", type: "float", default: 0, min: 0, max: 360, isInput: true }],
  },
  {
    typeName: "Saturation",
    inputs: [{ name: "image", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "amount", type: "float", default: 1, min: 0, max: 2, isInput: true }],
  },
  {
    typeName: "Invert",
    inputs: [{ name: "image", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [],
  },
  {
    typeName: "Threshold",
    inputs: [{ name: "image", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "level", type: "float", default: 0.5, min: 0, max: 1, isInput: true }],
  },
  {
    typeName: "Time",
    inputs: [],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "speed", type: "float", default: 1, min: 0, max: 10, isInput: true }],
  },
  {
    typeName: "SmoothStep",
    inputs: [
      { name: "value", type: PortType.Vec4 },
      { name: "edge0", type: PortType.Vec4 },
      { name: "edge1", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [],
  },
  {
    typeName: "Palette",
    inputs: [{ name: "value", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "mode", type: "string", default: "fire" }],
  },
  {
    typeName: "Mix",
    inputs: [
      { name: "a", type: PortType.Vec4 },
      { name: "b", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "factor", type: "float", default: 0.5, min: 0, max: 1, isInput: true }],
  },
  {
    typeName: "Add",
    inputs: [
      { name: "a", type: PortType.Vec4 },
      { name: "b", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [],
  },
  {
    typeName: "Subtract",
    inputs: [
      { name: "a", type: PortType.Vec4 },
      { name: "b", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [],
  },
  {
    typeName: "Multiply",
    inputs: [
      { name: "a", type: PortType.Vec4 },
      { name: "b", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [],
  },
  {
    typeName: "Mask",
    inputs: [
      { name: "image", type: PortType.Vec4 },
      { name: "mask", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "invert", type: "int", default: 0, min: 0, max: 1 }],
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
