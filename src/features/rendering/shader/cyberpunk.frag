#version 300 es
precision highp float;

// ============================================================================
// YAM8D - Shader Demo "CYBERPUNK DATASTREAM"
// Visible particles, controlled glow, soft vignette
// ============================================================================

// --- Standard Uniforms -------------------------------------------------------
uniform float     uTime;               // Current shader time
uniform float     uGlobalTime;         // Global application time
uniform int       uFrameCount;         // Shader frame count
uniform int       uGlobalFrameCount;   // Global frame count
uniform vec2      uResolution;         // Render resolution
uniform vec4      uMouse;              // Mouse position and click state

// --- Visual Feedback --------------------------------------------------------
uniform sampler2D uPreviousFrame;      // Previous frame for motion blur

// --- M8 Screen --------------------------------------------------------------
uniform sampler2D uM8Screen;           // Overlay screen texture (chromakeyed)

// --- Audio ------------------------------------------------------------------
uniform float     uAudioLevel;         // Overall audio amplitude
uniform sampler2D uAudioSpectrum;      // Audio frequency spectrum
uniform float     uAudioSpectrumBins;  // Number of spectrum bins

// --- Video ------------------------------------------------------------------
uniform sampler2D uVideoTexture;       // Video input texture

// --- GPGPU State ------------------------------------------------------------
uniform sampler2D uStateTexture;       // Particle state texture
uniform vec2      uStateSize;          // State texture dimensions

// --- Outputs ----------------------------------------------------------------
layout(location = 0) out vec4 fragColor; // Final color output
layout(location = 1) out vec4 fragState; // Particle state for next frame

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Simple pseudo-random hash function for procedural generation
float hash(vec2 p)
{
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Smooth 2D noise using bilinear interpolation of hashed grid points
float noise(vec2 p)
{
    vec2 i = floor(p);
    vec2 f = fract(p);

    // Smoothstep interpolation
    f = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(hash(i),                  hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

// 2D rotation matrix helper
mat2 rotate(float a)
{
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
}

// ============================================================================
// MAIN
// ============================================================================

void main()
{
    vec2 uv          = gl_FragCoord.xy / uResolution;
    vec2 pixel       = gl_FragCoord.xy;

    // --- M8 SCREEN SAMPLING --------------------------------------------------
    vec4  m8Sample   = texture(uM8Screen, uv);

    // Chromakey: pixel (0,0) of M8Screen is used as key color
    vec4  m8KeyColor = texelFetch(uM8Screen, ivec2(0, 0), 0);
    float m8Alpha    = 1.0 - step(distance(m8Sample.rgb, m8KeyColor.rgb), 0.05);

    // --- VIDEO SAMPLING -----------------------------------------------------
    vec4 videoSample = texture(uVideoTexture, uv);
    //!! with previous line, video texture is upside down,
    // if you want to display it upright, use this instead :
    // vec4 videoSample = texture(uVideoTexture, vec2(uv.x, 1.0 - uv.y));

    // --- GPGPU STATE READING -----------------------------------------------
    vec4  state             = texture(uStateTexture, uv);
    float particleAge       = state.r;    // Particle lifetime
    float particleEnergy    = state.g;    // Particle energy/glow
    vec2  particleVelocity  = state.ba;   // Particle movement vector

    // --- AUDIO ANALYSIS (three-band frequency split) -----------------------
    float bassStrength = 0.0; // Low frequencies
    float midStrength  = 0.0; // Mid frequencies
    float highStrength = 0.0; // High frequencies

    if (uAudioSpectrumBins > 0.0)
    {
        float bins = uAudioSpectrumBins;

        // Sample first 15% of bins for bass
        for (float i = 0.0; i < bins * 0.15; i += 1.0)
        {
            bassStrength += texture(uAudioSpectrum, vec2(i / bins, 0.5)).r;
        }
        bassStrength /= max(bins * 0.15, 1.0);

        // Sample 15-50% for mids
        for (float i = bins * 0.15; i < bins * 0.5; i += 1.0)
        {
            midStrength += texture(uAudioSpectrum, vec2(i / bins, 0.5)).r;
        }
        midStrength /= max(bins * 0.35, 1.0);

        // Sample 50-100% for highs
        for (float i = bins * 0.5; i < bins; i += 1.0)
        {
            highStrength += texture(uAudioSpectrum, vec2(i / bins, 0.5)).r;
        }
        highStrength /= max(bins * 0.5, 1.0);
    }

    // --- MOUSE PROCESSING ---------------------------------------------------
    vec2  mousePos    = uMouse.xy / uResolution;
    float mouseClick  = uMouse.z;
    float mouseDist   = length(uv - mousePos);

    // Strong influence when clicked, subtle when hovering
    float mouseInfluence =
        smoothstep(0.3, 0.0, mouseDist) *
        (mouseClick > 0.5 ? 1.5 : 0.2);

    // ============================================================================
    // VISUAL EFFECTS
    // ============================================================================

    // --- CYBERPUNK GRID ------------------------------------------------------
    // Fine grid at 32px spacing
    vec2  gridUV    = uv * uResolution / 32.0;
    float grid      = abs(sin(gridUV.x + uTime * 0.5) * sin(gridUV.y + uTime * 0.3));
    grid            = 1.0 - smoothstep(0.95, 1.0, grid);

    // Larger grid elements
    float gridLarge = abs(sin(uv.x * 16.0 + uTime) * sin(uv.y * 9.0 + uTime * 0.7));
    gridLarge       = 1.0 - smoothstep(0.92, 1.0, gridLarge) * 0.3;

    // --- EVOLVING PARTICLES (GPGPU) -----------------------------------------
    // Spawn new particles based on noise and audio level
    float newParticle =
        step(hash(pixel + uTime * 100.0), 0.0005 + uAudioLevel * 0.005);

    float age = particleAge - 0.008; // Natural decay per frame

    // Reset particle on spawn or mouse click proximity
    if (newParticle > 0.5 || (mouseClick > 0.5 && mouseDist < 0.05))
    {
        age = 1.0;

        // Velocity varies with position and time, boosted by audio
        particleVelocity = vec2(
            sin(uv.y * 2.0 + uTime) * 0.005,
            cos(uv.x * 2.0 + uTime) * 0.005
        ) * (1.0 + uAudioLevel * 3.0);

        particleEnergy = 1.0;
    }

    // Advection: particles move based on their velocity
    vec2 advectedUV = uv - particleVelocity * 0.3;
    advectedUV      = fract(advectedUV); // Wrap around edges

    // --- SCANLINES -----------------------------------------------------------
    float scanline = sin(uv.y * uResolution.y * 0.7) * 0.08 + 0.92;

    // --- VIGNETTE (VERY SOFT) ------------------------------------------------
    float vignette = 1.0 - length(uv - 0.5) * 0.8;
    vignette       = smoothstep(0.0, 0.95, vignette) * 0.3 + 0.7;

    // --- CYBERPUNK COLOR PALETTE --------------------------------------------
    vec3 cyberPink   = vec3(1.0, 0.1, 0.5);
    vec3 cyberBlue   = vec3(0.0, 0.7, 1.0);
    vec3 cyberPurple = vec3(0.5, 0.0, 0.8);
    vec3 cyberGreen  = vec3(0.0, 0.9, 0.3);

    // ============================================================================
    // COMPOSITION (REDUCED GLOW)
    // ============================================================================

    // Base dark cyberpunk background
    vec3 color = vec3(0.02, 0.0, 0.05);

    // Grid overlay (reduced opacity)
    color += grid      * 0.02  * cyberBlue;
    color += gridLarge * 0.015 * cyberPink;

    // PARTICLES (MUCH MORE VISIBLE)
    float particleGlow  = age * particleEnergy;
    float particleShape = exp(-length(uv - advectedUV) * 30.0); // Point-like particle

    vec3 particleColor = mix(
        cyberPink,
        cyberBlue,
        sin(advectedUV.x * 20.0 + uGlobalTime * 0.001) * 0.5 + 0.5
    );

    // Render particles as luminous points
    color += particleGlow * 0.6 * particleColor * particleShape;

    // Motion blur trail (reduced to keep particles visible)
    vec3 previousColor = texture(uPreviousFrame, uv - vec2(0.0005, -0.0005)).rgb;
    color = mix(color, previousColor, 0.92);

    // Audio-reactive coloring
    float audioReactive = bassStrength * 0.15 + midStrength * 0.05;
    color += audioReactive * cyberPurple * (1.0 - mouseDist * 0.5);

    // --- VIDEO OVERLAY (REDUCED OPACITY) -------------------------------------
    float videoLuma      = dot(videoSample.rgb, vec3(0.299, 0.587, 0.114));
    vec3  videoTinted    = videoSample.rgb * cyberGreen;
    color                = mix(color, videoTinted, 0.18 + audioReactive * 0.405);

    // --- M8 SCREEN OVERLAY --------------------------------------------------
    color = mix(color, m8Sample.rgb, m8Alpha * 0.6);

    // Subtle M8 border effect
    if (m8Alpha > 0.01)
    {
        float border = abs(m8Alpha - 0.5) * 5.0;
        color += border * 0.1 * cyberPink;
    }

    // --- MOUSE INTERACTION (REDUCED GLOW) -----------------------------------
    float mouseGlow = exp(-mouseDist * 4.0) * (mouseClick > 0.5 ? 0.3 : 0.08);
    color += mouseGlow * cyberPink * (1.0 + uAudioLevel * 0.5);

    // Concentric ripples
    float ripple = sin(mouseDist * 30.0 - uTime * 5.0) * 0.5 + 0.5;
    ripple *= exp(-mouseDist * 2.5);
    color  += ripple * 0.06 * cyberBlue * mouseClick;

    // Fine crosshair
    float crosshairX = abs(uv.x - mousePos.x) < 0.001 ? 1.0 : 0.0;
    float crosshairY = abs(uv.y - mousePos.y) < 0.001 ? 1.0 : 0.0;
    color += (crosshairX + crosshairY) * 0.2;

    // --- POST-PROCESSING ----------------------------------------------------
    color *= scanline;
    color *= vignette;

    // Subtle chromatic aberration
    float aberration = length(uv - 0.5) * 0.01;
    color.r += aberration * sin(uTime * 2.0);
    color.b -= aberration * cos(uTime * 1.7);

    // Dynamic saturation based on high frequencies
    float saturation = 1.0 + highStrength * 1.5;
    float gray        = dot(color, vec3(0.299, 0.587, 0.114));
    color             = mix(vec3(gray), color, saturation);

    // --- DISCREET INFO BARS ------------------------------------------------
    // Audio level indicator at bottom
    if (uv.y < 0.015)
    {
        float levelWidth = uAudioLevel * 0.8;

        color = mix(
            color,
            cyberPink * 0.3,
            step(0.1, uv.x) *
            step(uv.x, 0.1 + levelWidth) *
            step(0.0, uv.y) *
            step(uv.y, 0.015) *
            0.3
        );
    }

    // ============================================================================
    // OUTPUT
    // ============================================================================

    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);

    // Save particle state for next frame
    fragState = vec4(
        max(age, 0.0),
        particleEnergy * 0.99 + newParticle * 0.01,
        particleVelocity
    );
}
