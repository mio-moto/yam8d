#version 300 es
// Apollonian fractal raymarching shader
// Ported from Shadertoy format to WebGL2

precision highp float;

uniform float uTime;
uniform vec2 uResolution;

out vec4 fragColor;

#define T (uTime * 1.5 + 5.0 + 1.5 * sin(uTime * 0.5))
#define P(z) (vec3(cos((z) * 0.07) * 16.0, \
                   0.0, (z)))
#define R(a) mat2(cos(a + vec4(0.0, 33.0, 11.0, 0.0)))
#define N normalize

float apollonian(vec3 p) {
    float i, s, w = 1.0;
    vec3 b = vec3(0.5, 1.0, 1.5);
    p.y -= 2.0;
    p.yz = p.zy;
    p /= 16.0;
    for(; i++ < 6.0;) {
        p = mod(p + b, 2.0 * b) - b;
        s = 2.0 / dot(p, p);
        p *= s;
        w *= s;
    }
    return length(p) / w * 6.0;
}

float map(vec3 p) {
    return max(2.0 - length((p - P(p.z)).xy), apollonian(p));
}

void main() {
    float s, d, i, a;
    vec2 u = gl_FragCoord.xy;
    vec3 r = vec3(uResolution, 1.0);
    u = (u - r.xy * 0.5) / r.y;
    
    vec3 e = vec3(0.001, 0.0, 0.0),
         q,
         p = P(T * 2.0),
         ro = p,
         Z = N(P(T * 2.0 + 7.0) - p),
         X = N(vec3(Z.z, 0.0, -Z.x)),
         rd = normalize(vec3(R(sin(uTime * 0.15) * 0.3) * u, 1.0) * mat3(-X, cross(X, Z), Z));
    
    vec4 o = vec4(0.0);
    for(; i++ < 128.0;) {
        p = ro + rd * d;
        d += s = map(p) * 0.8;
        o += (1.0 + cos(0.05 * i + 0.5 * p.z + vec4(6.0, 4.0, 2.0, 0.0))) / max(s, 0.0003);
    }
    
    o = tanh(o / d / 7e4 * exp(vec4(3.0, 2.0, 1.0, 0.0) * d / 4e1));
    
    fragColor = o;
}
