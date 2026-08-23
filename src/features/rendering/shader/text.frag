#version 300 es
// Copyright 2021 James Deery
// Released under the MIT licence, https://opensource.org/licenses/MIT

precision highp float;
precision highp int;

uniform sampler2D fontRaw;               // raw NEAREST bitmap — non-smooth path (was: 'font')
uniform mediump sampler2DArray fontAtlas; // processed SDF/blur atlas — one glyph per layer
uniform int useSmooth;
uniform int useSdf;          // 1 = SDF atlas, 0 = blur+threshold atlas
uniform vec2 fontGlyphSize;  // per-layer size, used to normalize into fontAtlas
uniform float sdfPxRange;    // SDF half-range in atlas texels

uniform float sdfThreshold;
uniform float sdfSoftness;

in vec2 fontCoord;
flat in float fontLayer;
in vec3 colorV;

out vec4 fragColor;

void main() {
    float alpha;
    if (useSmooth == 1) {
        vec2 uv = fontCoord / fontGlyphSize;
        float a = texture(fontAtlas, vec3(uv, fontLayer)).r;
        if (useSdf == 1) {
            float hw;
            if (sdfSoftness > 0.0) {
                hw = sdfSoftness;
            } else {
                vec2 uvTexel = uv * fontGlyphSize;
                vec2 dx = dFdx(uvTexel);
                vec2 dy = dFdy(uvTexel);
                float texelsPerPixel = max(length(dx), length(dy));
                hw = texelsPerPixel / max(2.0 * sdfPxRange, 1.0);
                hw = max(hw, 1.0 / 255.0);
            }
            alpha = smoothstep(sdfThreshold - hw, sdfThreshold + hw, a);
        } else {
            alpha = a;
        }
    } else {
        alpha = texelFetch(fontRaw, ivec2(fontCoord), 0).r;
    }
    fragColor = vec4(colorV, alpha);
}