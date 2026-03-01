#version 300 es
// Copyright 2021 James Deery
// Released under the MIT licence, https://opensource.org/licenses/MIT

precision highp float;
precision highp int;

uniform sampler2D font;
uniform int useSmooth;
uniform int useSdf;         // 1 = SDF atlas, 0 = blur+threshold atlas (or raw NEAREST)
uniform vec2 fontAtlasSize;
uniform float sdfPxRange;   // SDF half-range in atlas texels (same unit as generation spread)

// SDF rendering parameters (only used when useSdf == 1)
uniform float sdfThreshold; // edge position: 0.5 = neutral, <0.5 thinner, >0.5 bolder
uniform float sdfSoftness;  // 0.0 = adaptive via fwidth (best quality), >0 = fixed half-width

in vec2 fontCoord;
in vec3 colorV;

out vec4 fragColor;

void main() {
    float alpha;
    if (useSmooth == 1) {
        float a = texture(font, fontCoord / fontAtlasSize).r;
        if (useSdf == 1) {
            float hw;
            if (sdfSoftness > 0.0) {
                hw = sdfSoftness;
            } else {
                // Derive edge width from atlas-texel derivatives rather than fwidth(sampledValue),
                // which is unstable near 1x/non-integer scaling and can drop thin strokes.
                vec2 uvTexel = (fontCoord / fontAtlasSize) * fontAtlasSize;
                vec2 dx = dFdx(uvTexel);
                vec2 dy = dFdy(uvTexel);
                float texelsPerPixel = max(length(dx), length(dy));
                hw = texelsPerPixel / max(2.0 * sdfPxRange, 1.0);
                hw = max(hw, 1.0 / 255.0);
            }
            alpha = smoothstep(sdfThreshold - hw, sdfThreshold + hw, a);
        } else {
            // Blur+threshold baked into atlas — read alpha directly.
            alpha = a;
        }
    } else {
        alpha = texelFetch(font, ivec2(fontCoord), 0).r;
    }
    fragColor = vec4(colorV, alpha);
}
