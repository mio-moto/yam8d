#version 300 es
// Copyright 2021 James Deery
// Released under the MIT licence, https://opensource.org/licenses/MIT

layout(location = 0) in vec3 colour;
layout(location = 1) in float char;

// text4: vec2(10.0,  10.0)
// text5: vec2(12.0, 12.0)
uniform vec2 size;

// text 4: vec2(12.0,  14.0) 
// text 5: vec2(15.0, 16.0)
uniform vec2 posScale;

// text 4: vec2(0.0, 2.0)
// text 5: vec2(0.0, -2.0)
uniform vec2 posOffset;

// additional offset on the first row of text
// text 4: vec2(0.0, 0.0)
// text 5: vec2(0.0, 5.0)
uniform vec2 posOffsetRow0;

// text 4: 0.0
// text 5: 3.0
uniform float rowOffset;

out vec3 colourV;
out vec2 fontCoord;

const vec2 corners[] = vec2[](
    vec2(0, 0),
    vec2(0, 1),
    vec2(1, 0),
    vec2(1, 1));

const vec2 camScale = vec2(2.0 / 480.0, -2.0 / 320.0);
const vec2 camOffset = vec2(-240.0, -160.0);

void main() {
    float row;
    float col = modf(float(gl_InstanceID) / 40.0, row) * 40.0;
    row = row + rowOffset;
    vec2 pos = vec2(col, row) * posScale + posOffset;

    if(row == 0.0) {
        pos = pos + posOffsetRow0; 
    }

    pos = ((corners[gl_VertexID] * size + pos) + camOffset) * camScale;

    gl_Position = vec4(char == 0.0 ? vec2(2.0) : pos, 0.0, 1.0);
    colourV = colour;
    fontCoord = (vec2(char - 1.0, 0.0) + corners[gl_VertexID]) * size;
}
