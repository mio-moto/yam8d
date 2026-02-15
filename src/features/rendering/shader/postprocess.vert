#version 300 es

out vec2 vUv;

const vec2 corners[] = vec2[](
    vec2(0, 0),
    vec2(0, 1),
    vec2(1, 0),
    vec2(1, 1));

void main() {
    gl_Position = vec4(corners[gl_VertexID] * 2.0 - 1.0, 0.0, 1.0);
    vUv = corners[gl_VertexID];
}
