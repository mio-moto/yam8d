#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform vec2 uTexelSize;
uniform float uBlurRadius;
uniform vec4 uUvClamp; // (minU, minV, maxU, maxV) — prevents blur bleed across glyph boundaries
uniform int uUseChromaKey;
uniform vec3 uChromaKeyColor;
uniform float uChromaKeyThreshold;

in vec2 vUv;
out vec4 fragColor;

void main() {
    float sigma = max(uBlurRadius / 3.0, 0.001);
    float invSigma2 = 1.0 / (2.0 * sigma * sigma);
    float totalWeight = 0.0;
    vec4 color = vec4(0.0);

    int taps = min(int(ceil(uBlurRadius)), 16);

    for (int i = -taps; i <= taps; i++) {
        float x = float(i);
        float weight = exp(-x * x * invSigma2);
        vec2 samplePos = vUv + vec2(x * uTexelSize.x, 0.0);
        samplePos = clamp(samplePos, uUvClamp.xy, uUvClamp.zw);
        color += texture(uScene, samplePos) * weight;
        totalWeight += weight;
    }

    vec4 outColor = color / totalWeight;
    if (uUseChromaKey == 1 && distance(outColor.rgb, uChromaKeyColor) <= uChromaKeyThreshold) {
        outColor.a = 0.0;
    }
    fragColor = outColor;
}
