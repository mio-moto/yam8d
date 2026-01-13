#version 300 es
// Copyright 2021 James Deery
// Released under the MIT licence, https://opensource.org/licenses/MIT

precision highp float;

uniform sampler2D font;

in vec2 fontCoord;
in vec3 colorV;

out vec4 fragColor;

void main() {
    vec4 fontTexel = texelFetch(font, ivec2(fontCoord), 0);
    fragColor = vec4(colorV, fontTexel.r);
}
