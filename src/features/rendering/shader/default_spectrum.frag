#version 300 es
precision highp float;

out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform vec4 uMouse;
uniform float uAudioLevel;
uniform sampler2D uAudioSpectrum;
uniform float uAudioSpectrumBins;
uniform sampler2D uPreviousFrame;
uniform int uFrameCount;
uniform sampler2D uM8Screen;
// Optional: declare uM8Screen to receive the current M8 screen as a texture.
// When declared, it is pre-rendered before this shader runs so you can sample it:
//   uniform sampler2D uM8Screen;
//   vec4 m8 = texture(uM8Screen, uv);
// The M8 content is still composited on top of your output afterwards.

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

float getSmoothBand(float freqNorm) {
    if (uAudioSpectrumBins <= 0.0) return 0.0;
    
    // Exact floating-point position on the texture
    float x = clamp(freqNorm, 0.0, 1.0) * (uAudioSpectrumBins - 1.0);
    
    // The two closest integer indices
    int i0 = int(floor(x));
    int i1 = int(min(float(i0) + 1.0, uAudioSpectrumBins - 1.0));
    
    // The fractional part between the two (e.g., if x = 4.3, fractX = 0.3)
    float fractX = fract(x);
    
    // Read the two adjacent bands
    float v0 = texelFetch(uAudioSpectrum, ivec2(i0, 0), 0).r;
    float v1 = texelFetch(uAudioSpectrum, ivec2(i1, 0), 0).r;
    
    // Very smooth blending (smoothstep) to round out the curve
    return mix(v0, v1, smoothstep(0.0, 1.0, fractX));
}

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
    vec2 m = (uMouse.xy - 0.5 * uResolution.xy) / uResolution.y;

    // ==========================================
    // 1. SMOOTHED AUDIO SAMPLING
    // ==========================================
    float bass   = getSmoothBand(0.05);
    float mids   = getSmoothBand(0.40);
    float treble = getSmoothBand(0.85);

    // For the wave around the circle
    float angle = atan(p.y, p.x);
    float normAngle = (angle + 3.14159265) / 6.28318530;
    float specCoord = abs(normAngle * 2.0 - 1.0);
    
    // We use the smoothed reading to erase the staircase effect
    float localSpec = getSmoothBand(specCoord);

    // ==========================================
    // 2. SHAPE AND GEOMETRY
    // ==========================================
    vec2 center = mix(vec2(0.0), m, 0.8); // use 80% of mouse position to move the center
    center += vec2(sin(uTime * 10.0), cos(uTime * 12.0)) * (treble * 0.05);

    float d = length(p - center);

    float timePulse = sin(uTime * 2.0) * 0.02;
    float baseRadius = 0.2 + timePulse + (bass * 0.2);
    
    float edgeDeformation = (localSpec * 0.1) + (sin(angle * 8.0 - uTime * 3.0) * (mids * 0.05));
    float radius = baseRadius + edgeDeformation;

    // Smooth line (preventing division by zero)
    float ringDistance = max(abs(d - radius), 0.002);
    float ring = 0.004 / ringDistance;
    
    // ==========================================
    // 3. RAINBOW COLORS
    // ==========================================
    // Elegant rainbow gradient that rotates over time
    vec3 colorTheme = 0.5 + 0.5 * cos(uTime * 0.5 + normAngle * 6.28 + vec3(0.0, 2.0, 4.0));
    
    vec3 col = colorTheme * ring;

    // Central glow amplified by the bass
    col += colorTheme * (0.01 / max(d, 0.001)) * (bass + 0.1);

    // ==========================================
    // 4. FEEDBACK (TRAILS)
    // ==========================================
    vec2 prevUv = uv - 0.5;
    
    float rotSpeed = 0.01 + (mids * 0.02);
    prevUv *= rot(rotSpeed * sin(uTime * 0.5));
    
    float zoom = 0.98 - (bass * 0.03);
    prevUv *= zoom;
    prevUv += 0.5;

    vec3 feedback = texture(uPreviousFrame, prevUv).rgb;
    feedback *= 0.92; // Dissipation / Fade out

    // ==========================================
    // 4b. M8 SCREEN SOFT GLOW
    // Three-ring radial blur spreads a diffuse halo from the M8 UI into the
    // background. Weights fall off with distance for a Gaussian-like softness.
    // ==========================================
    vec3 m8Glow = vec3(0.0);
    float glowR1 = (18.0 + bass *  8.0) / uResolution.y;
    float glowR2 = (38.0 + bass * 16.0) / uResolution.y;
    float glowR3 = (64.0 + bass * 24.0) / uResolution.y;
    for (int i = 0; i < 8; i++) {
        float a = float(i) * (6.28318530 / 8.0);
        vec2 dir = vec2(cos(a), sin(a));
        m8Glow += texture(uM8Screen, uv + dir * glowR1).rgb * 0.50;
        m8Glow += texture(uM8Screen, uv + dir * glowR2).rgb * 0.30;
        m8Glow += texture(uM8Screen, uv + dir * glowR3).rgb * 0.20;
    }
    m8Glow /= 8.0;
    // Gently tint towards the ring's color theme
    float m8Luma = dot(m8Glow, vec3(0.299, 0.587, 0.114));
    m8Glow = mix(m8Glow, colorTheme * m8Luma, 0.35);

    // ==========================================
    // 5. FINAL COMPOSITION
    // ==========================================
    vec3 finalColor = col + feedback;
    finalColor += m8Glow * (0.30 + bass * 0.18); // subtle bloom, gently bass-reactive
    finalColor *= 1.0 - 0.3 * length(uv - 0.5); // Vignette effect
    finalColor = finalColor / (1.0 + finalColor * 0.5); // Tone mapping

    fragColor = vec4(finalColor, 1.0);
}
