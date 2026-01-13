#version 300 es
// Copyright 2021 James Deery
// Released under the MIT licence, https://opensource.org/licenses/MIT

layout(location = 0) in vec3 color;
layout(location = 1) in float char;


// text 1: M8:01 small font
// text 2: M8:01 large font
// text 3: M8:02 small font
// text 4: M8:02 large font
// text 5: M8:02 large font without scope

// text 1: vec2(5.0, 7.0)
// text 2: vec2(8.0, 9.0)
// text 3: vec2(9.0,  9.0)
// text 4: vec2(10.0, 10.0)
// text 5: vec2(12.0, 12.0)
uniform vec2 size;

// text 1: vec2(8.0, 10.0)
// text 2: vec2(10.0,  12.0)
// text 3: vec2(12.0,  14.0)
// text 4: vec2(12.0,  14.0) 
// text 5: vec2(15.0,  16.0)
uniform vec2 spacing;

// text 1: vec2(0.0, 3.0)
// text 2: vec2(0.0, 0.0)
// text 3: vec2(0.0, 3.0)
// text 4: vec2(0.0, 2.0)
// text 5: vec2(0.0, -2.0)
uniform vec2 posOffset;

// text 1: 0.0
// text 2: -3.0
// text 3: 0.0
// text 4: 0.0
// text 5: -3.0
uniform float rowOffset;

// additional offset on the first row of text
// text 1: vec2(0.0, 0.0)
// text 2: vec2(0.0, 5.0)
// text 3: vec2(0.0, 0.0)
// text 4: vec2(0.0, 0.0)
// text 5: vec2(0.0, 5.0)
uniform vec2 posOffsetRow0;

// text 1,2:   vec2(320.0, 240.0)
// text 3,4,5: vec2(480.0, 320.0)
uniform vec2 camSize;

out vec3 colorV;
out vec2 fontCoord;

const vec2 corners[] = vec2[](
    vec2(0, 0),
    vec2(0, 1),
    vec2(1, 0),
    vec2(1, 1));

void main() {
    vec2 camScale = vec2(2.0 / camSize.x, -2.0 / camSize.y);
    vec2 camOffset = vec2(-camSize.x / 2.0, -camSize.y / 2.0);

    float row;
    float col = modf(float(gl_InstanceID) / 40.0, row) * 40.0;
    row = row + rowOffset;
    vec2 pos = vec2(col, row) * spacing + posOffset;

    if(row == 0.0) {
        pos = pos + posOffsetRow0; 
    }

    pos = ((corners[gl_VertexID] * size + pos) + camOffset) * camScale;

    gl_Position = vec4(char == 0.0 ? vec2(2.0) : pos, 0.0, 1.0);
    colorV = color;
    fontCoord = (vec2(char - 1.0, 0.0) + corners[gl_VertexID]) * size;
}
