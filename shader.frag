precision highp float;
uniform vec2 iResolution;
uniform float iTime;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = p * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    vec2 p = uv * 2.5;

    float t = iTime;

    float n1 = fbm(p + vec2(t * 0.03, t * 0.01));
    float n2 = fbm(p * 1.8 - vec2(t * 0.02, t * 0.02));
    float n = mix(n1, n2, 0.5);

    n = n * 1.2 - 0.1;

    vec3 col;
    if (n < 0.3) {
        col = mix(vec3(0.0, 0.0, 0.0), vec3(0.4, 0.0, 0.0), n / 0.3);
    } else if (n < 0.55) {
        col = mix(vec3(0.4, 0.0, 0.0), vec3(1.0, 0.3, 0.0), (n - 0.3) / 0.25);
    } else if (n < 0.75) {
        col = mix(vec3(1.0, 0.3, 0.0), vec3(1.0, 0.7, 0.1), (n - 0.55) / 0.2);
    } else {
        col = mix(vec3(1.0, 0.7, 0.1), vec3(1.0, 0.95, 0.6), (n - 0.75) / 0.25);
    }

    col += vec3(0.05, 0.01, 0.0) * fbm(p * 3.0 + vec2(t * 0.05));
    col = clamp(col, 0.0, 1.0);

    gl_FragColor = vec4(col, 1.0);
}
