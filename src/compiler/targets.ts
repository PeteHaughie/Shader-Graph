export type GLSLTarget = "es100" | "es300" | "gl150";
export type MetalTarget = "metal";
export type Target = GLSLTarget | MetalTarget;
export type Language = "glsl" | "msl";

export interface TargetDef {
  version: string;
  precision: string;
  attribKeyword: string;
  varyingIn: string;
  varyingOut: string;
  textureFunc: string;
  fragOutputDecl: string;
  fragOutputName: string;
  derivativesExt: string;
}

const TARGETS: Record<GLSLTarget, TargetDef> = {
  es100: {
    version: "#version 100",
    precision: "precision highp float;\n",
    attribKeyword: "attribute",
    varyingIn: "varying",
    varyingOut: "varying",
    textureFunc: "texture2D",
    fragOutputDecl: "",
    fragOutputName: "gl_FragColor",
    derivativesExt: "#extension GL_OES_standard_derivatives : enable\n",
  },
  es300: {
    version: "#version 300 es",
    precision: "precision highp float;\n",
    attribKeyword: "in",
    varyingIn: "in",
    varyingOut: "out",
    textureFunc: "texture",
    fragOutputDecl: "out vec4 fragColor;\n",
    fragOutputName: "fragColor",
    derivativesExt: "",
  },
  gl150: {
    version: "#version 150",
    precision: "",
    attribKeyword: "in",
    varyingIn: "in",
    varyingOut: "out",
    textureFunc: "texture",
    fragOutputDecl: "out vec4 fragColor;\n",
    fragOutputName: "fragColor",
    derivativesExt: "",
  },
};

export const METAL_TARGETS: MetalTarget[] = ["metal"];
export const METAL_STD = "metal3.0";

export function getTarget(target: Target): TargetDef {
  if (target === "metal") {
    throw new Error("metal has no GLSL TargetDef; use the MSL backend");
  }
  return TARGETS[target];
}

export function isGLSLTarget(t: string): t is GLSLTarget {
  return t === "es100" || t === "es300" || t === "gl150";
}

export function isMetalTarget(t: string): t is MetalTarget {
  return t === "metal";
}

export function isValidTarget(t: string): t is Target {
  return isGLSLTarget(t) || isMetalTarget(t);
}

export function languageOf(t: Target): Language {
  return t === "metal" ? "msl" : "glsl";
}

export function targetList(): string[] {
  return [...Object.keys(TARGETS), ...METAL_TARGETS];
}
