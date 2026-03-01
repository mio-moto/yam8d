#version 300 es
precision highp float;

// Converts JFA nearest-seed data into a normalised signed distance field.
//
// Output R channel:
//   0.5  = glyph edge
//   >0.5 = inside glyph  (distance to nearest outside pixel, positive)
//   <0.5 = outside glyph (distance to nearest inside pixel, negative)
//
// Normalisation: sdf_normalised = clamp(0.5 + sd / (2.0 * uSpread), 0, 1)
// where sd is signed distance in scaled pixels and uSpread is the half-range.

uniform sampler2D uJFA;   // result of the JFA passes
uniform sampler2D uGlyph; // same bilinearly-upscaled glyph used for seeding
uniform vec2 uSize;       // scaled texture size in pixels
uniform float uSpread;    // SDF half-range in scaled pixels

in vec2 vUv;
out vec4 fragColor;

void main() {
    vec4  jfa    = texture(uJFA, vUv);
    float inside = step(0.5, texture(uGlyph, vUv).r);
    vec2  pixPos = floor(vUv * uSize);

    vec2  inSeed  = jfa.rg * 255.0;
    vec2  outSeed = jfa.ba * 255.0;

    float dIn  = (inSeed.x  < 254.5) ? length(pixPos - inSeed)  : uSpread * 2.0;
    float dOut = (outSeed.x < 254.5) ? length(pixPos - outSeed) : uSpread * 2.0;

    // Positive inside the glyph, negative outside
    float sd = (inside > 0.5) ? dOut : -dIn;

    fragColor = vec4(clamp(0.5 + sd / (2.0 * uSpread), 0.0, 1.0), 0.0, 0.0, 1.0);
}
