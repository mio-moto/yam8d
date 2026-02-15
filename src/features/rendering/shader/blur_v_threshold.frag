#version 300 es
precision highp float;

uniform sampler2D uBlurred;
uniform vec2 uTexelSize;
uniform float uBlurRadius;
uniform float uThreshold;
uniform float uSmoothness;
uniform int uAlphaMode; // 0 = color mode (screen), 1 = alpha mask mode (font)

in vec2 vUv;
out vec4 fragColor;

void main() {
    float sigma = max(uBlurRadius / 3.0, 0.001);
    float invSigma2 = 1.0 / (2.0 * sigma * sigma);
    float totalWeight = 0.0;
    vec4 color = vec4(0.0);

    int taps = min(int(ceil(uBlurRadius)), 16);

    for (int i = -taps; i <= taps; i++) {
        float y = float(i);
        float weight = exp(-y * y * invSigma2);
        color += texture(uBlurred, vUv + vec2(0.0, y * uTexelSize.y)) * weight;
        totalWeight += weight;
    }

    color /= totalWeight;

    float lo = uThreshold - uSmoothness;
    float hi = uThreshold + uSmoothness;

    if (uAlphaMode == 1) {
        // Font alpha mask: clean smoothstep transition for crisp edges
        float a = smoothstep(lo, hi, color.r);
        fragColor = vec4(a, 0.0, 0.0, 1.0);
    } else {
        // Screen post-process: preserve color fidelity
        fragColor = vec4(
            color.r * smoothstep(lo, hi, color.r),
            color.g * smoothstep(lo, hi, color.g),
            color.b * smoothstep(lo, hi, color.b),
            1.0
        );
    }
}
