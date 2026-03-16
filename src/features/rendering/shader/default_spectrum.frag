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
    // 5. FINAL COMPOSITION
    // ==========================================
    vec3 finalColor = col + feedback;
    finalColor *= 1.0 - 0.3 * length(uv - 0.5); // Vignette effect
    finalColor = finalColor / (1.0 + finalColor * 0.5); // Tone mapping

    fragColor = vec4(finalColor, 1.0);
}
