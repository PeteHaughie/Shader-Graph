export type Target = "es100" | "es300" | "gl150";

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

const TARGETS: Record<Target, TargetDef> = {
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

export function getTarget(target: Target): TargetDef {
  return TARGETS[target];
}

export function isValidTarget(t: string): t is Target {
  return t in TARGETS;
}
