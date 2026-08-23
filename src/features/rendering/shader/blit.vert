#version 300 es
// Copyright 2021 James Deery
// Released under the MIT licence, https://opensource.org/licenses/MIT

layout(location = 0) in float vertexId; // unused value — exists only so location 0 is a real, active attribute

uniform vec2 size;
out vec2 srcCoord;

const vec2 corners[] = vec2[](
    vec2(0, 0),
    vec2(0, 1),
    vec2(1, 0),
    vec2(1, 1));

void main() {
    vec2 pos = corners[int(vertexId)] * vec2(2.0, 2.0) + vec2(-1.0, -1.0);
    gl_Position = vec4(pos, 0.0, 1.0);
    srcCoord = corners[int(vertexId)] * size;
}