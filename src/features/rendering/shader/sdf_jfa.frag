#version 300 es
precision highp float;

// One pass of the Jump Flooding Algorithm (JFA).
//
// Each pixel looks at the 8 neighbours at ±uStep texels and independently
// propagates the nearest inside-seed (rg) and nearest outside-seed (ba).
// Positions are encoded as pixel_coord / 255.0 in RGBA8 (no float FBO needed).
// Sentinel (1.0, 1.0) == (255, 255) means "no valid seed".
//
// Run ceil(log2(max(width, height))) passes with step halving each time,
// starting from the largest power-of-two that fits the texture.

uniform sampler2D uJFA;
uniform vec2 uTexelSize; // 1.0 / vec2(scaledW, scaledH)
uniform float uStep;     // current jump distance in texels
uniform vec2 uSize;      // texture size in pixels (to decode positions)

in vec2 vUv;
out vec4 fragColor;

void main() {
    vec4 best    = texture(uJFA, vUv);
    vec2 pixPos  = floor(vUv * uSize);

    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) continue;
            vec4 n = texture(uJFA, vUv + vec2(float(dx), float(dy)) * uTexelSize * uStep);

            // -- propagate inside seed (rg) --
            vec2 nIn = n.rg * 255.0;
            if (nIn.x < 254.5) {
                vec2 bIn = best.rg * 255.0;
                if (bIn.x >= 254.5 || length(pixPos - nIn) < length(pixPos - bIn))
                    best.rg = n.rg;
            }

            // -- propagate outside seed (ba) --
            vec2 nOut = n.ba * 255.0;
            if (nOut.x < 254.5) {
                vec2 bOut = best.ba * 255.0;
                if (bOut.x >= 254.5 || length(pixPos - nOut) < length(pixPos - bOut))
                    best.ba = n.ba;
            }
        }
    }

    fragColor = best;
}
