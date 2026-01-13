#version 300 es
// Copyright 2021 James Deery
// Released under the MIT licence, https://opensource.org/licenses/MIT

precision highp float;

in vec3 colorV;

out vec4 fragColor;

void main() {
    fragColor = vec4(colorV, 1.0);
}
