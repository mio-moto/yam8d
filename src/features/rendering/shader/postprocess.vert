#version 300 es

layout(location = 0) in float vertexId; // unused value — exists only so location 0 is a real, active attribute

out vec2 vUv;

const vec2 corners[] = vec2[](
    vec2(0, 0),
    vec2(0, 1),
    vec2(1, 0),
    vec2(1, 1));

void main() {
    gl_Position = vec4(corners[int(vertexId)] * 2.0 - 1.0, 0.0, 1.0);
    vUv = corners[int(vertexId)];
}