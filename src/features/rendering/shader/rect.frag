#version 300 es
// Copyright 2021 James Deery
// Released under the MIT licence, https://opensource.org/licenses/MIT

precision highp float;

in vec4 colorV;

out vec4 fragColor;

void main() {
    fragColor = colorV;
}
