precision highp float;
uniform float u_time;
uniform vec2 u_resolution;

// Simplex-like noise functions
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * 7.0 * n_);
    vec4 x_ = floor(j * n_);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * n_ + ns.x;
    vec4 y = y_ * n_ + ns.y;
    vec4 t = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(t, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// FBM with multiple octaves
float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 4; i++) {
        value += amplitude * snoise(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 pos = uv * 2.0 - 1.0;
    pos.x *= aspect;

    // Slow-moving lava: time scale is very slow
    float slowTime = u_time * 0.05;

    // Layer 1: large-scale flow (slow horizontal drift)
    vec3 p1 = vec3(pos * 1.5, slowTime * 0.3);
    float n1 = fbm(p1);

    // Layer 2: medium detail (vertical rise)
    vec3 p2 = vec3(pos * 3.0 + 2.0, slowTime * 0.4 + 1.0);
    float n2 = fbm(p2);

    // Layer 3: fine cracks/veins
    vec3 p3 = vec3(pos * 6.0 + 4.0, slowTime * 0.2 + 3.0);
    float n3 = snoise(p3);

    // Combine noise layers
    float lava = n1 * 0.6 + n2 * 0.3 + n3 * 0.1;
    lava = lava * 0.5 + 0.5; // remap to [0,1]

    // Lava color palette: black -> deep red -> bright orange -> white
    vec3 color0 = vec3(0.02, 0.0, 0.0);    // near black
    vec3 color1 = vec3(0.6, 0.02, 0.0);     // deep red
    vec3 color2 = vec3(1.0, 0.3, 0.0);      // orange
    vec3 color3 = vec3(1.0, 0.7, 0.1);      // yellow-orange
    vec3 color4 = vec3(1.0, 0.95, 0.7);     // white-hot

    vec3 finalColor;
    if (lava < 0.3) {
        finalColor = mix(color0, color1, lava / 0.3);
    } else if (lava < 0.55) {
        finalColor = mix(color1, color2, (lava - 0.3) / 0.25);
    } else if (lava < 0.8) {
        finalColor = mix(color2, color3, (lava - 0.55) / 0.25);
    } else {
        finalColor = mix(color3, color4, (lava - 0.8) / 0.2);
    }

    // Emissive glow effect
    float glow = smoothstep(0.4, 1.0, lava);
    finalColor += vec3(0.3, 0.1, 0.0) * glow * glow;

    // Subtle pulsing brightness
    float pulse = 0.95 + 0.05 * sin(u_time * 0.1 + lava * 3.14);
    finalColor *= pulse;

    gl_FragColor = vec4(finalColor, 1.0);
}
