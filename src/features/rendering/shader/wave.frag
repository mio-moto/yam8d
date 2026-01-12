#version 300 es
// Copyright 2021 James Deery
// Released under the MIT licence, https://opensource.org/licenses/MIT

precision highp float;

uniform vec3 color;

out vec4 fragColor;

void main() {
    fragColor = vec4(color, 1.0);
}
