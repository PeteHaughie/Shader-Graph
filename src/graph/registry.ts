import { PrimitiveDefinition, PortType, GraphType } from "./primitives.js";

const PRIMITIVES: PrimitiveDefinition[] = [
  {
    graphType: GraphType.Fragment,
    typeName: "Texture",
    inputs: [{ name: "uv", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "url", type: "string", default: "" }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Noise",
    inputs: [],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "scale", type: "float", default: 1, min: 0, max: 100, isInput: true },
      { name: "seed", type: "float", default: 0, min: 0, max: 100, isInput: true },
    ],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "SmoothNoise",
    inputs: [],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "scale", type: "float", default: 1, min: 0, max: 100, isInput: true },
      { name: "seed", type: "float", default: 0, min: 0, max: 100, isInput: true },
    ],
  },
  {
    graphType: GraphType.Fragment,
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
    graphType: GraphType.Fragment,
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
    graphType: GraphType.Fragment,
    typeName: "Gradient",
    inputs: [
      { name: "colorA", type: PortType.Vec4 },
      { name: "colorB", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "angle", type: "float", default: 0, min: 0, max: 360, isInput: true }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Checkerboard",
    inputs: [
      { name: "colorA", type: PortType.Vec4 },
      { name: "colorB", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "frequency", type: "float", default: 4, min: 0.1, max: 50, isInput: true }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Blur",
    inputs: [{ name: "image", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "radius", type: "float", default: 2, min: 0, max: 50, isInput: true }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Glow",
    inputs: [{ name: "image", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "intensity", type: "float", default: 1, min: 0, max: 5, isInput: true }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "EdgeDetect",
    inputs: [{ name: "image", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "strength", type: "float", default: 1, min: 0, max: 5, isInput: true }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Displace",
    inputs: [
      { name: "image", type: PortType.Vec4 },
      { name: "map", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "amount", type: "float", default: 0.05, min: 0, max: 1, isInput: true }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "BrightnessContrast",
    inputs: [{ name: "image", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "brightness", type: "float", default: 0, min: -1, max: 1, isInput: true },
      { name: "contrast", type: "float", default: 0, min: -1, max: 1, isInput: true },
    ],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "HueShift",
    inputs: [{ name: "image", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "angle", type: "float", default: 0, min: 0, max: 360, isInput: true }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Saturation",
    inputs: [{ name: "image", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "amount", type: "float", default: 1, min: 0, max: 2, isInput: true }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Invert",
    inputs: [{ name: "image", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Threshold",
    inputs: [{ name: "image", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "level", type: "float", default: 0.5, min: 0, max: 1, isInput: true }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Time",
    inputs: [],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "speed", type: "float", default: 1, min: 0, max: 10, isInput: true }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "FragCoord",
    inputs: [],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Floor",
    inputs: [{ name: "value", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Mod",
    inputs: [{ name: "value", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [      { name: "divisor", type: "float", default: 2, min: 0.01, max: 2000, isInput: true }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "TexelSize",
    inputs: [],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Swizzle",
    inputs: [{ name: "input", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "pattern", type: "string", default: "xxxx" }],
  },
  {
    graphType: GraphType.Fragment,
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
    graphType: GraphType.Fragment,
    typeName: "Palette",
    inputs: [{ name: "value", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "mode", type: "string", default: "fire" }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Mix",
    inputs: [
      { name: "a", type: PortType.Vec4 },
      { name: "b", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "factor", type: "float", default: 0.5, min: 0, max: 1, isInput: true }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Add",
    inputs: [
      { name: "a", type: PortType.Vec4 },
      { name: "b", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Subtract",
    inputs: [
      { name: "a", type: PortType.Vec4 },
      { name: "b", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Multiply",
    inputs: [
      { name: "a", type: PortType.Vec4 },
      { name: "b", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Mask",
    inputs: [
      { name: "image", type: PortType.Vec4 },
      { name: "mask", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "invert", type: "int", default: 0, min: 0, max: 1 }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "ShadowMap",
    inputs: [{ name: "position", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "bias", type: "float", default: 0.005, min: 0, max: 0.1 },
    ],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "Output",
    inputs: [{ name: "source", type: PortType.Vec4 }],
    outputs: [],
    params: [],
  },
  {
    graphType: GraphType.Vertex,
    typeName: "VertexPosition",
    inputs: [],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [],
  },
  {
    graphType: GraphType.Vertex,
    typeName: "VertexNormal",
    inputs: [],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [],
  },
  {
    graphType: GraphType.Vertex,
    typeName: "VertexTexCoord",
    inputs: [],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [],
  },
  {
    graphType: GraphType.Vertex,
    typeName: "VertexColor",
    inputs: [],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [],
  },
  {
    graphType: GraphType.Vertex,
    typeName: "Translate",
    inputs: [{ name: "position", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "x", type: "float", default: 0, min: -10, max: 10, isInput: true },
      { name: "y", type: "float", default: 0, min: -10, max: 10, isInput: true },
      { name: "z", type: "float", default: 0, min: -10, max: 10, isInput: true },
    ],
  },
  {
    graphType: GraphType.Vertex,
    typeName: "Rotate",
    inputs: [{ name: "position", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "angle", type: "float", default: 0, min: 0, max: 360, isInput: true },
      { name: "axis", type: "string", default: "y" },
    ],
  },
  {
    graphType: GraphType.Vertex,
    typeName: "Scale",
    inputs: [{ name: "position", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "x", type: "float", default: 1, min: 0, max: 10, isInput: true },
      { name: "y", type: "float", default: 1, min: 0, max: 10, isInput: true },
      { name: "z", type: "float", default: 1, min: 0, max: 10, isInput: true },
    ],
  },
  {
    graphType: GraphType.Vertex,
    typeName: "ModelViewProjection",
    inputs: [{ name: "position", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [],
  },
  {
    graphType: GraphType.Vertex,
    typeName: "Wave",
    inputs: [{ name: "position", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "amplitude", type: "float", default: 0.5, min: 0, max: 5, isInput: true },
      { name: "frequency", type: "float", default: 2, min: 0, max: 10, isInput: true },
      { name: "speed", type: "float", default: 1, min: 0, max: 5, isInput: true },
      { name: "axis", type: "string", default: "z" },
    ],
  },
  {
    graphType: GraphType.Vertex,
    typeName: "NoiseDisplace",
    inputs: [{ name: "position", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "amount", type: "float", default: 0.5, min: 0, max: 5, isInput: true },
      { name: "scale", type: "float", default: 2, min: 0, max: 10, isInput: true },
    ],
  },
  {
    graphType: GraphType.Vertex,
    typeName: "Bend",
    inputs: [{ name: "position", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "angle", type: "float", default: 30, min: 0, max: 180, isInput: true },
      { name: "axis", type: "string", default: "y" },
    ],
  },
  {
    graphType: GraphType.Vertex,
    typeName: "VertexOutput",
    inputs: [{ name: "position", type: PortType.Vec4 }],
    outputs: [],
    params: [],
  },
  {
    graphType: GraphType.Vertex,
    typeName: "PassToFragment",
    inputs: [{ name: "value", type: PortType.Vec4 }],
    outputs: [],
    params: [{ name: "name", type: "string", default: "vData" }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "FromVertex",
    inputs: [],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "name", type: "string", default: "vData" }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "DiffuseLight",
    inputs: [{ name: "normal", type: PortType.Vec4 }],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "lightDir", type: "string", default: "0.5,1,0.5" },
      { name: "color", type: "string", default: "1.0,0.0,0.0" },
    ],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "AmbientLight",
    inputs: [],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [{ name: "color", type: "string", default: "0.1,0.0,0.0" }],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "NormalMap",
    inputs: [
      { name: "normal", type: PortType.Vec4 },
      { name: "position", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "url", type: "string", default: "" },
      { name: "intensity", type: "float", default: 1, min: 0, max: 5 },
    ],
  },
  {
    graphType: GraphType.Fragment,
    typeName: "SpecularLight",
    inputs: [
      { name: "normal", type: PortType.Vec4 },
      { name: "viewDir", type: PortType.Vec4 },
      { name: "lightDir", type: PortType.Vec4 },
    ],
    outputs: [{ name: "out", type: PortType.Vec4 }],
    params: [
      { name: "shininess", type: "float", default: 32, min: 1, max: 256 },
      { name: "color", type: "string", default: "1.0,1.0,1.0" },
    ],
  },
];

const BY_NAME = new Map<string, PrimitiveDefinition>(PRIMITIVES.map((p) => [p.typeName, p]));

export function getPrimitive(name: string): PrimitiveDefinition | undefined {
  return BY_NAME.get(name);
}

export function listPrimitives(): PrimitiveDefinition[] {
  return PRIMITIVES;
}
