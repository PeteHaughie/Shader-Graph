export const MSL_PRELUDE = "#include <metal_stdlib>\nusing namespace metal;\n\n";

export const MSL_SAMPLER_DECL =
  "constexpr sampler _samp(coord::normalized, address::clamp_to_edge, filter::linear);\n";

export function generateNoiseMSL(): string {
  return `
float hash21(float2 p) {
  return fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453123);
}

float noise1d(float scale, float seed, float2 fragCoord) {
  float2 p = fragCoord * scale + seed;
  return hash21(p);
}
`;
}

export function generateSmoothNoiseMSL(): string {
  return `
float hash21_s(float2 p) {
  return fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453123);
}

float smoothNoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21_s(i);
  float b = hash21_s(i + float2(1.0, 0.0));
  float c = hash21_s(i + float2(0.0, 1.0));
  float d = hash21_s(i + float2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(float2 p, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 8; i++) {
    value += amplitude * smoothNoise(p);
    p *= lacunarity;
    amplitude *= gain;
  }
  return value;
}
`;
}

export function generateColorUtilityMSL(): string {
  return `
float3 rgb2hsv(float3 c) {
  float4 K = float4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  float4 p = mix(float4(c.bg, K.wz), float4(c.gb, K.xy), step(c.b, c.g));
  float4 q = mix(float4(p.xyw, c.r), float4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return float3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

float3 hsv2rgb(float3 c) {
  float4 K = float4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  float3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float luminance(float3 c) {
  return dot(c, float3(0.299, 0.587, 0.114));
}
`;
}

export function generatePaletteMSL(): string {
  return `
float3 palette(float t, int mode) {
  float3 a, b, c, d;
  if (mode == 0) {
    a = float3(0.0, 0.0, 0.0); b = float3(0.4, 0.0, 0.0); c = float3(1.0, 0.3, 0.0); d = float3(1.0, 0.7, 0.1);
  } else if (mode == 1) {
    a = float3(0.5, 0.6, 0.8); b = float3(0.3, 0.4, 0.6); c = float3(0.8, 0.7, 0.9); d = float3(0.2, 0.1, 0.3);
  } else if (mode == 2) {
    a = float3(0.5, 0.5, 0.5); b = float3(0.5, 0.5, 0.5); c = float3(1.0, 1.0, 1.0); d = float3(0.0, 0.33, 0.67);
  } else if (mode == 3) {
    a = float3(0.1, 0.05, 0.0); b = float3(0.5, 0.3, 0.1); c = float3(0.8, 0.6, 0.2); d = float3(0.9, 0.7, 0.3);
  } else {
    a = float3(0.1, 0.0, 0.1); b = float3(0.5, 0.2, 0.5); c = float3(0.8, 0.3, 0.8); d = float3(0.3, 0.5, 0.7);
  }
  return a + b * cos(6.28318 * (c * t + d));
}
`;
}

export function generateEdgeDetectMSL(): string {
  return `
float4 sobel(texture2d<float> tex, sampler s, float2 uv, float2 st) {
  float tl = luminance(tex.sample(s, uv + float2(-st.x, st.y)).rgb);
  float t  = luminance(tex.sample(s, uv + float2(0.0, st.y)).rgb);
  float tr = luminance(tex.sample(s, uv + float2(st.x, st.y)).rgb);
  float l  = luminance(tex.sample(s, uv + float2(-st.x, 0.0)).rgb);
  float r  = luminance(tex.sample(s, uv + float2(st.x, 0.0)).rgb);
  float bl = luminance(tex.sample(s, uv + float2(-st.x, -st.y)).rgb);
  float b  = luminance(tex.sample(s, uv + float2(0.0, -st.y)).rgb);
  float br = luminance(tex.sample(s, uv + float2(st.x, -st.y)).rgb);
  float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
  float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;
  return float4(float3(sqrt(gx*gx + gy*gy)), 1.0);
}
`;
}

export function generateVertexNoiseMSL(): string {
  return `
float hash21(float2 p) {
  return fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453123);
}

float noise1d(float scale, float seed, float3 aPosition) {
  float2 p = aPosition.xy * scale + seed;
  return hash21(p);
}
`;
}
