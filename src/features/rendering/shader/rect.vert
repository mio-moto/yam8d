#version 300 es
// Copyright 2021 James Deery
// Released under the MIT licence, https://opensource.org/licenses/MIT

layout(location = 0) in vec4 shape;
layout(location = 1) in vec3 color;

uniform vec2 size;

out vec3 colorV;

const vec2 corners[] = vec2[](
    vec2(0, 0),
    vec2(0, 1),
    vec2(1, 0),
    vec2(1, 1));

void main() {
    vec2 camScale = vec2(2.0 / size.x, -2.0 / size.y);
    vec2 camOffset = vec2(-size.x / 2.0, -size.y / 2.0);
    vec2 pos = shape.xy;
    vec2 size = shape.zw;
    pos = ((corners[gl_VertexID] * size + pos) + camOffset) * camScale;
    pos += vec2(0, camScale.y * -3.0);
    gl_Position = vec4(pos, 0.0, 1.0);
    colorV = color;
}
