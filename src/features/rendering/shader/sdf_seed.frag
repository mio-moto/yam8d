#version 300 es
precision highp float;

// Initialises Jump Flooding Algorithm (JFA) seeds from a binary glyph.
//
// Each output pixel stores two "nearest seed" positions, encoded as
// pixel_coordinate / 255.0 packed into RGBA8:
//   rg = nearest inside-seed (glyph pixel)
//   ba = nearest outside-seed (background pixel)
// The sentinel value vec2(1.0) == (255,255) means "no seed found yet".
//
// The glyph texture is sampled bilinearly (the viewport is set to the
// upscaled size so the GPU upscales implicitly), then thresholded at 0.5
// to produce a clean binary inside/outside mask.

uniform sampler2D uGlyph; // small padded glyph, bilinearly upscaled by the viewport
uniform vec2 uSize;       // output (scaled) texture size in pixels

in vec2 vUv;
out vec4 fragColor;

void main() {
    float inside = step(0.5, texture(uGlyph, vUv).r);
    vec2 pixPos = floor(vUv * uSize);
    vec2 enc    = pixPos / 255.0;
    const vec2 INF = vec2(1.0); // sentinel: (255,255) = no seed
    // inside pixel: seed itself as inside-seed, outside-seed unknown
    // outside pixel: inside-seed unknown, seed itself as outside-seed
    fragColor = (inside > 0.5) ? vec4(enc, INF) : vec4(INF, enc);
}
