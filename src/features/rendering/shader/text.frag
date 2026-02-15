#version 300 es
// Copyright 2021 James Deery
// Released under the MIT licence, https://opensource.org/licenses/MIT

precision highp float;
precision highp int;

uniform sampler2D font;
uniform int useSmooth;
uniform vec2 fontAtlasSize;

in vec2 fontCoord;
in vec3 colorV;

out vec4 fragColor;

void main() {
    float alpha;
    if (useSmooth == 1) {
        alpha = texture(font, fontCoord / fontAtlasSize).r;
    } else {
        alpha = texelFetch(font, ivec2(fontCoord), 0).r;
    }
    fragColor = vec4(colorV, alpha);
}
