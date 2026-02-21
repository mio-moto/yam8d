#version 300 es
// Gyroid plasma raymarching shader
// Ported from Shadertoy format to WebGL2

precision highp float;

uniform float uTime;
uniform vec2 uResolution;

out vec4 fragColor;

void main() {
    vec2 R = uResolution.xy;
    vec2 I = gl_FragCoord.xy;
    vec2 u = abs(I + I - R) / R;
    
    vec3 p; // Ray position
    vec3 r = normalize(vec3(I + I, 0.0) - R.xyy); // Ray direction
    vec3 a = normalize(tan(uTime * 0.2 + vec3(0.0, 1.0, 2.0))); // Rotation axis
    
    float i; // Iterator
    float t; // Distance
    float v; // Density
    float l; // Length^2
    float g; // Gyroid plasma
    float n; // Noise iterator
    
    vec4 O = vec4(0.0);
    
    // Raymarching loop
    for (O *= 1.0; i++ < 70.0; t += v * 0.04) {
        p = t * r;
        // Move camera back
        p.z += 6.0;
        // Rotate around rotation axis
        p = a * dot(a, p) * 2.0 - p;
        // Store length^2
        l = dot(p, p);
        // Apply log transform to xy coordinates
        p.xy = log(abs(p.xy) + 0.01);
        // Gyroid plasma for highlights
        g = abs(dot(cos(p * 3.0), vec3(1.0))) + 0.03;
        // Turbulence
        for (n = 0.5; n++ < 7.0; p += 2.0 * sin(p.zxy * n + uTime * n) / n);
        // Density based on distance to sphere
        v = max(abs(length(p) - 0.9) + 0.05, g);
        // Color accumulation based on iteration and density
        O += vec4(2.0, 3.0, 1.0, 0.0) * exp(sin(i * 0.3 + vec4(0.0, 2.0, 4.0, 0.0))) / v + vec4(6.0, 9.0, 3.0, 0.0) / l;
    }
    
    // Tone mapping
    O = tanh(O / 300.0
    // Rainbow border
    + 0.01 / min(exp(sin(u.y * 3.0 + uTime * 5.0 + vec4(0.0, 2.0, 4.0, 0.0))) * abs(u.x - 1.0), exp(sin(u.x * 3.0 + uTime * 5.0 + vec4(0.0, 2.0, 4.0, 0.0))) * abs(u.y - 1.0))
    );
    
    fragColor = O;
}
