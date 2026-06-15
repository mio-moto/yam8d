#version 300 es
precision highp float;

uniform sampler2D uM8Screen;
uniform vec2 uResolution;

out vec4 fragColor;

const float GRID_COLS = 40.0;
const float GRID_ROWS = 24.0;
const vec2 GRID = vec2(GRID_COLS, GRID_ROWS);

// Text grid calibration for M8 model 02.
const float TEXT_UV_TOP = 1.044;
const float TEXT_UV_BOTTOM = -0.0059;
const float TEXT_UV_OFFSET_X = 0.0023;

// Text grid calibration for M8 model 01.
//const float TEXT_UV_TOP = 1.005;
//const float TEXT_UV_BOTTOM = 0.0050;
//const float TEXT_UV_OFFSET_X = 0.0045;

const int FINGERPRINT_SX = 4;
const int FINGERPRINT_SY = 6;
const float FP_MOD = 16777216.0;

// Stroke thickness for generated alien glyphs, in normalized cell coordinates.
// Increase these together for a bolder alphabet.
const float STROKE_WIDTH_MIN = 0.050;
const float STROKE_WIDTH_MAX = 0.060;

float hash11(float x) {
    return fract(sin(x * 127.1) * 43758.5453);
}

// Map screen UVs to the calibrated 40x24 M8 text cell grid.
vec2 uvToCell(vec2 uv) {
    float yNorm = (TEXT_UV_TOP - uv.y) / (TEXT_UV_TOP - TEXT_UV_BOTTOM);
    return vec2((uv.x + TEXT_UV_OFFSET_X) * GRID_COLS, yNorm * GRID_ROWS);
}

// Convert a cell/local coordinate back to the source screen UV.
vec2 cellUv(vec2 cell, vec2 local) {
    float yNorm = (cell.y + local.y) / GRID_ROWS;
    return vec2(
        (cell.x + local.x) / GRID_COLS,
        TEXT_UV_TOP - yNorm * (TEXT_UV_TOP - TEXT_UV_BOTTOM)
    );
}

// The M8 background is uniform inside text cells; sampling the bottom-left corner
// avoids averaging over glyph strokes and prevents rectangular background patches.
vec3 cellBgColor(vec2 cell) {
    return texture(uM8Screen, vec2(0.0, 0.0)).rgb;
    //return texture(uM8Screen, cellUv(cell, vec2(0.005, 0.995))).rgb;
}

// Theme-independent ink measure: compare each sample to the local cell background
// instead of relying on absolute luminance or RGB values.
float colorInk(vec3 c, vec3 bg) {
    vec3 d = abs(c - bg);
    float channelDelta = max(max(d.r, d.g), d.b);
    return max(channelDelta, length(d) * 0.72);
}

float inkAt(vec2 cell, vec2 local, vec3 bg) {
    local = clamp(local, vec2(0.01), vec2(0.99));
    return colorInk(texture(uM8Screen, cellUv(cell, local)).rgb, bg);
}

// Cheap early-out so empty cells keep the original screen untouched.
bool cellHasInk(vec2 cell, vec3 bg) {
    const int N = 6;
    for (int j = 0; j < N; j++) {
        for (int i = 0; i < N; i++) {
            vec2 lp = vec2(
                0.1 + 0.8 * (float(i) + 0.5) / float(N),
                0.1 + 0.8 * (float(j) + 0.5) / float(N)
            );
            if (inkAt(cell, lp, bg) > 0.045) return true;
        }
    }
    return false;
}

// Find the approximate ink bounding box. The box is later used to fingerprint
// the character in its own tight coordinate space, which helps E/B/S/2/5/8-like
// glyphs survive small placement changes.
vec4 inkBBox(vec2 cell, vec3 bg, out float mass, out float inkMax) {
    mass = 0.0;
    inkMax = 0.0;
    float xMin = 1.0;
    float yMin = 1.0;
    float xMax = 0.0;
    float yMax = 0.0;

    const int NX = 14;
    const int NY = 12;
    for (int j = 0; j < NY; j++) {
        for (int i = 0; i < NX; i++) {
            vec2 lp = vec2((float(i) + 0.5) / float(NX), (float(j) + 0.5) / float(NY));
            float ink = inkAt(cell, lp, bg);
            inkMax = max(inkMax, ink);
            if (ink > 0.045) {
                xMin = min(xMin, lp.x);
                yMin = min(yMin, lp.y);
                xMax = max(xMax, lp.x);
                yMax = max(yMax, lp.y);
                mass += ink;
            }
        }
    }

    return vec4(xMin, yMin, xMax, yMax);
}

// Convert a detected M8 character into a stable procedural glyph id.
// The fingerprint combines a tight bitmap, row/column profiles, and aspect ratio.
float computeGlyphId(vec2 cell, vec3 bg, out float inkTotal) {
    inkTotal = 0.0;
    if (!cellHasInk(cell, bg)) return -1.0;

    float inkMax;
    vec4 bbox = inkBBox(cell, bg, inkTotal, inkMax);
    if (inkTotal < 0.14) return -1.0;

    vec2 bbMin = bbox.xy;
    vec2 bbMax = bbox.zw;
    vec2 bbSize = max(bbMax - bbMin, vec2(0.05));

    float density = inkTotal / (bbSize.x * bbSize.y * float(14 * 12));
    if (density > 0.985) return -1.0;
    if (bbSize.x < 0.04 && bbSize.y < 0.04) return -1.0;

    float threshold = max(0.032, inkMax * 0.28);
    float fp = 0.0;

    for (int j = 0; j < FINGERPRINT_SY; j++) {
        for (int i = 0; i < FINGERPRINT_SX; i++) {
            vec2 lp = bbMin + bbSize * vec2(
                (float(i) + 0.5) / float(FINGERPRINT_SX),
                (float(j) + 0.5) / float(FINGERPRINT_SY)
            );
            float bit = inkAt(cell, lp, bg) > threshold ? 1.0 : 0.0;
            fp = mod(fp * 2.0 + bit, FP_MOD);
        }
    }

    for (int j = 0; j < 5; j++) {
        float rowInk = 0.0;
        for (int i = 0; i < 5; i++) {
            vec2 lp = bbMin + bbSize * vec2((float(i) + 0.5) / 5.0, (float(j) + 0.5) / 5.0);
            if (inkAt(cell, lp, bg) > threshold) rowInk += 1.0;
        }
        fp = mod(fp * 4.0 + min(rowInk, 3.0), FP_MOD);
    }

    for (int i = 0; i < 5; i++) {
        float colInk = 0.0;
        for (int j = 0; j < 5; j++) {
            vec2 lp = bbMin + bbSize * vec2((float(i) + 0.5) / 5.0, (float(j) + 0.5) / 5.0);
            if (inkAt(cell, lp, bg) > threshold) colInk += 1.0;
        }
        fp = mod(fp * 4.0 + min(colInk, 3.0), FP_MOD);
    }

    float ar = bbSize.x / bbSize.y;
    fp = mod(fp * 8.0 + floor(clamp(ar * 2.0, 0.0, 7.0)), FP_MOD);
    return fp;
}

// Average only detected ink pixels so the generated glyph keeps the original
// character color without inheriting the cell background.
vec3 cellTint(vec2 cell, vec3 bg) {
    vec3 sum = vec3(0.0);
    float w = 0.0;
    const int N = 5;
    for (int j = 0; j < N; j++) {
        for (int i = 0; i < N; i++) {
            vec2 lp = vec2(
                0.15 + 0.7 * (float(i) + 0.5) / float(N),
                0.15 + 0.7 * (float(j) + 0.5) / float(N)
            );
            vec3 c = texture(uM8Screen, cellUv(cell, lp)).rgb;
            float ink = inkAt(cell, lp, bg);
            if (ink > 0.045) {
                sum += c * ink;
                w += ink;
            }
        }
    }
    return w > 0.001 ? sum / w : vec3(1.0);
}

float sdSeg(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.00001), 0.0, 1.0);
    return length(pa - ba * h);
}

// Quadratic Bezier helpers used to bridge semi-open segments at a shared node.
vec2 bez(vec2 p0, vec2 p1, vec2 p2, float t) {
    float u = 1.0 - t;
    return u * u * p0 + 2.0 * u * t * p1 + t * t * p2;
}

float sdBezier(vec2 pos, vec2 p0, vec2 p1, vec2 p2) {
    float minD = 1e9;
    const int STEPS = 7;
    vec2 prev = p0;
    for (int i = 1; i <= STEPS; i++) {
        vec2 curr = bez(p0, p1, p2, float(i) / float(STEPS));
        vec2 ab = curr - prev;
        vec2 ap = pos - prev;
        float tt = clamp(dot(ap, ab) / max(dot(ab, ab), 0.00001), 0.0, 1.0);
        minD = min(minD, length(ap - tt * ab));
        prev = curr;
    }
    return minD;
}

// 4x4 internal glyph grid. Most glyphs sit on a baseline and use either full
// height or 3/4 height; centerMode is a rare compact variant.
vec2 glyphNode(int ix, int iy, float heightMode, float centerMode) {
    float left = mix(0.23, 0.34, centerMode);
    float right = mix(0.77, 0.66, centerMode);
    float baseline = mix(0.80, 0.66, centerMode);
    float topFull = mix(0.20, 0.34, centerMode);
    float topShort = mix(0.34, 0.38, centerMode);
    float top = mix(topShort, topFull, heightMode);

    return vec2(
        mix(left, right, float(ix) / 3.0),
        mix(top, baseline, float(iy) / 3.0)
    );
}

// Rasterize a line or curve SDF into a soft binary field.
float lineField(vec2 uv, vec2 a, vec2 b, float strokeW) {
    return 1.0 - smoothstep(strokeW * 0.68, strokeW, sdSeg(uv, a, b));
}

float curveField(vec2 uv, vec2 a, vec2 b, vec2 c, float strokeW) {
    return 1.0 - smoothstep(strokeW * 0.68, strokeW, sdBezier(uv, a, b, c));
}

// Draw a dominant A-B-C path. Most endpoints are "semi-integer": they stop just
// short of their grid node; if both segments stop around B, a Bezier bridge is added.
float drawPath3(vec2 uv, vec2 a, vec2 b, vec2 c, float seed, float strokeW) {
    float gap = 0.060;
    float semiA = 1.0 - step(0.75, hash11(seed + 1.0));
    float semiB0 = 1.0 - step(0.75, hash11(seed + 2.0));
    float semiB1 = 1.0 - step(0.75, hash11(seed + 3.0));
    float semiC = 1.0 - step(0.75, hash11(seed + 4.0));

    vec2 abA = mix(a, b, gap * semiA);
    vec2 abB = mix(b, a, gap * semiB0);
    vec2 bcB = mix(b, c, gap * semiB1);
    vec2 bcC = mix(c, b, gap * semiC);

    float field = 0.0;
    field = max(field, lineField(uv, abA, abB, strokeW));
    field = max(field, lineField(uv, bcB, bcC, strokeW));

    if (semiB0 * semiB1 > 0.5) {
        field = max(field, curveField(uv, abB, b, bcB, strokeW));
    }

    return field;
}

// Longer A-B-C-D strokes are used sparingly, mostly for vertical glyphs.
float drawPath4(vec2 uv, vec2 a, vec2 b, vec2 c, vec2 d, float strokeW) {
    float gap = 0.060;
    float field = 0.0;
    field = max(field, lineField(uv, mix(a, b, gap), mix(b, a, gap), strokeW));
    field = max(field, lineField(uv, mix(b, c, gap), mix(c, b, gap), strokeW));
    field = max(field, lineField(uv, mix(c, d, gap), mix(d, c, gap), strokeW));
    return field;
}

// Rare detached accent stroke.
float drawShortSegment(vec2 uv, vec2 a, vec2 b, float seed, float strokeW) {
    float gap = 0.060;
    float semiA = 1.0 - step(0.75, hash11(seed + 1.0));
    float semiB = 1.0 - step(0.75, hash11(seed + 2.0));
    return lineField(uv, mix(a, b, gap * semiA), mix(b, a, gap * semiB), strokeW);
}

// Rare point/accent mark.
float dotField(vec2 uv, vec2 p, float strokeW) {
    return 1.0 - smoothstep(strokeW * 0.55, strokeW * 0.95, length(uv - p));
}

// Ten hand-shaped path templates. They avoid most crossings while still giving
// the fingerprint enough variation to read as a coherent alien alphabet.
void templatePath(float templateId, int pathIndex, out ivec2 a, out ivec2 b, out ivec2 c) {
    float t = templateId;

    if (t < 0.5) {
        if (pathIndex == 0) { a = ivec2(0, 3); b = ivec2(0, 2); c = ivec2(0, 1); }
        else { a = ivec2(0, 2); b = ivec2(1, 2); c = ivec2(2, 1); }
    } else if (t < 1.5) {
        if (pathIndex == 0) { a = ivec2(3, 3); b = ivec2(3, 2); c = ivec2(3, 1); }
        else { a = ivec2(3, 2); b = ivec2(2, 2); c = ivec2(1, 1); }
    } else if (t < 2.5) {
        if (pathIndex == 0) { a = ivec2(0, 3); b = ivec2(1, 2); c = ivec2(2, 1); }
        else { a = ivec2(2, 1); b = ivec2(2, 2); c = ivec2(2, 3); }
    } else if (t < 3.5) {
        if (pathIndex == 0) { a = ivec2(3, 3); b = ivec2(2, 2); c = ivec2(1, 1); }
        else { a = ivec2(1, 1); b = ivec2(1, 2); c = ivec2(1, 3); }
    } else if (t < 4.5) {
        if (pathIndex == 0) { a = ivec2(0, 3); b = ivec2(1, 2); c = ivec2(2, 2); }
        else { a = ivec2(2, 2); b = ivec2(3, 1); c = ivec2(3, 0); }
    } else if (t < 5.5) {
        if (pathIndex == 0) { a = ivec2(0, 1); b = ivec2(0, 2); c = ivec2(1, 3); }
        else { a = ivec2(1, 3); b = ivec2(2, 3); c = ivec2(3, 2); }
    } else if (t < 6.5) {
        if (pathIndex == 0) { a = ivec2(0, 2); b = ivec2(1, 1); c = ivec2(2, 1); }
        else { a = ivec2(2, 1); b = ivec2(3, 2); c = ivec2(3, 3); }
    } else if (t < 7.5) {
        if (pathIndex == 0) { a = ivec2(1, 3); b = ivec2(1, 2); c = ivec2(1, 1); }
        else { a = ivec2(1, 2); b = ivec2(2, 1); c = ivec2(3, 1); }
    } else if (t < 8.5) {
        if (pathIndex == 0) { a = ivec2(0, 2); b = ivec2(1, 3); c = ivec2(2, 2); }
        else { a = ivec2(2, 2); b = ivec2(3, 1); c = ivec2(3, 0); }
    } else {
        if (pathIndex == 0) { a = ivec2(0, 3); b = ivec2(0, 2); c = ivec2(1, 2); }
        else { a = ivec2(1, 2); b = ivec2(2, 2); c = ivec2(2, 1); }
    }
}

// Compose one synthetic glyph from two main strokes plus rare structural extras.
// Rarity gates keep the result calligraphic instead of noisy.
float drawRune(vec2 uv, float id) {
    float templateId = floor(mod(id, 10.0));
    float seed = id * 0.137 + 7.3;
    float heightMode = step(0.38, hash11(seed + 10.0));
    float centerMode = step(0.93, hash11(seed + 11.0));
    float strokeW = mix(STROKE_WIDTH_MIN, STROKE_WIDTH_MAX, hash11(seed + 12.0));

    ivec2 ia;
    ivec2 ib;
    ivec2 ic;

    templatePath(templateId, 0, ia, ib, ic);
    vec2 a = glyphNode(ia.x, ia.y, heightMode, centerMode);
    vec2 b = glyphNode(ib.x, ib.y, heightMode, centerMode);
    vec2 c = glyphNode(ic.x, ic.y, heightMode, centerMode);
    float field = drawPath3(uv, a, b, c, seed + 20.0, strokeW);

    templatePath(templateId, 1, ia, ib, ic);
    a = glyphNode(ia.x, ia.y, heightMode, centerMode);
    b = glyphNode(ib.x, ib.y, heightMode, centerMode);
    c = glyphNode(ic.x, ic.y, heightMode, centerMode);
    field = max(field, drawPath3(uv, a, b, c, seed + 40.0, strokeW));

    float complexKind = hash11(seed + 70.0);
    if (complexKind > 0.42) {
        int ix = int(floor(hash11(seed + 71.0) * 4.0));
        ix = clamp(ix, 0, 3);
        vec2 v0 = glyphNode(ix, 3, heightMode, centerMode);
        vec2 v1 = glyphNode(ix, 2, heightMode, centerMode);
        vec2 v2 = glyphNode(ix, 1, heightMode, centerMode);
        vec2 v3 = glyphNode(ix, 0, heightMode, centerMode);
        field = max(field, drawPath4(uv, v0, v1, v2, v3, strokeW));
    }

    if (complexKind > 0.72) {
        int iy = int(floor(hash11(seed + 72.0) * 3.0)) + 1;
        iy = clamp(iy, 1, 3);
        vec2 h0 = glyphNode(0, iy, heightMode, centerMode);
        vec2 h1 = glyphNode(1, iy, heightMode, centerMode);
        vec2 h2 = glyphNode(2, iy, heightMode, centerMode);
        vec2 h3 = glyphNode(3, iy, heightMode, centerMode);
        field = max(field, drawPath4(uv, h0, h1, h2, h3, strokeW));
    }

    if (complexKind > 0.90) {
        int fx = int(floor(hash11(seed + 73.0) * 2.0)) + 1;
        int fy = int(floor(hash11(seed + 74.0) * 2.0)) + 1;
        vec2 anchor = glyphNode(fx, fy, heightMode, centerMode);
        vec2 branchA = glyphNode(clamp(fx - 1, 0, 3), clamp(fy - 1, 0, 3), heightMode, centerMode);
        vec2 branchB = glyphNode(clamp(fx + 1, 0, 3), fy, heightMode, centerMode);
        vec2 branchC = glyphNode(fx, clamp(fy + 1, 0, 3), heightMode, centerMode);
        field = max(field, drawShortSegment(uv, anchor, branchA, seed + 120.0, strokeW));
        field = max(field, drawShortSegment(uv, anchor, branchB, seed + 130.0, strokeW));
        field = max(field, drawShortSegment(uv, anchor, branchC, seed + 140.0, strokeW));
    }

    if (complexKind > 0.985) {
        vec2 x0 = glyphNode(0, 1, heightMode, centerMode);
        vec2 x1 = glyphNode(1, 2, heightMode, centerMode);
        vec2 x2 = glyphNode(2, 1, heightMode, centerMode);
        field = max(field, drawPath3(uv, x0, x1, x2, seed + 160.0, strokeW));
    }

    if (hash11(seed + 150.0) > 0.88) {
        int iy = int(floor(hash11(seed + 151.0) * 2.0)) + 1;
        vec2 d0 = glyphNode(0, iy, heightMode, centerMode);
        vec2 d1 = glyphNode(1, iy, heightMode, centerMode);
        field = max(field, drawShortSegment(uv, d0, d1, seed + 152.0, strokeW));
    }

    if (hash11(seed + 170.0) > 0.80) {
        int px = int(floor(hash11(seed + 171.0) * 4.0));
        int py = int(floor(hash11(seed + 172.0) * 4.0));
        field = max(field, dotField(uv, glyphNode(px, py, heightMode, centerMode), strokeW));
    }

    if (hash11(seed + 60.0) > 0.82) {
        vec2 p0 = glyphNode(1, 3, heightMode, centerMode);
        vec2 p1 = glyphNode(2, 3, heightMode, centerMode);
        field = max(field, lineField(uv, mix(p0, p1, 0.10), mix(p1, p0, 0.10), strokeW));
    }

    return field;
}

// Only erase the original ink under cells that are actually replaced.
float localInkMask(vec2 cell, vec2 local, vec3 bg) {
    float ink = inkAt(cell, local, bg);
    return smoothstep(0.045, 0.12, ink);
}

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec3 scene = texture(uM8Screen, uv).rgb;

    vec2 cellF = uvToCell(uv);
    vec2 cell = floor(cellF);
    vec2 local = fract(cellF);
    bool inGrid = all(greaterThanEqual(cell, vec2(0.0))) && all(lessThan(cell, GRID));
    if (!inGrid) {
        fragColor = vec4(scene, 1.0);
        return;
    }

    vec3 bg = cellBgColor(cell);
    float inkTotal;
    float gid = computeGlyphId(cell, bg, inkTotal);

    if (gid < 0.0) {
        fragColor = vec4(scene, 1.0);
        return;
    }

    vec3 tint = cellTint(cell, bg);
    float field = drawRune(local, gid);

    // Remove the source glyph only where the generated glyph does not cover it,
    // then paint the alien stroke with the original character tint.
    float originalInk = localInkMask(cell, local, bg);
    float erase = originalInk * (1.0 - field);
    vec3 cleanScene = mix(scene, bg, erase);
    vec3 col = mix(cleanScene, tint, field);
    fragColor = vec4(col, 1.0);
}
