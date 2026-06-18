#version 300 es
precision highp float;

out vec4 fragColor;

// ============================================================================
// YAM8D - Shader Demo "VIDEO BACKGROUND SHADER"
// Full-screen video with "cover" fit (like CSS background-size: cover)
// ============================================================================

// --- Inputs -----------------------------------------------------------------
uniform vec2      uResolution;   // Canvas resolution in pixels
uniform sampler2D uVideoTexture; // Source video texture

void main() {
    // ========================================================================
    // SETUP
    // ========================================================================

    // Query video dimensions directly from the bound texture (LOD 0).
    vec2 videoSize  = vec2(textureSize(uVideoTexture, 0));
    vec2 canvasSize = uResolution;

    // Aspect ratios used to decide which axis must be cropped.
    float videoAspect  = videoSize.x / videoSize.y;
    float canvasAspect = canvasSize.x / canvasSize.y;

    // Pixel coordinates -> normalized UV in [0,1].
    vec2 uv = gl_FragCoord.xy / canvasSize;
    // Flip Y because video textures are typically top-left origin,
    // while OpenGL texture coordinates are bottom-left origin.
    uv.y = 1.0 - uv.y;

    // ========================================================================
    // COVER FIT COMPUTATION
    // ========================================================================

    // Compute per-axis scale so the video fills the whole canvas.
    // One axis may be cropped depending on aspect ratio mismatch.
    vec2 scale;
    if (videoAspect > canvasAspect)
    {
        // Video is wider than canvas:
        // keep full height, crop left/right.
        scale = vec2(canvasAspect / videoAspect, 1.0);
    }
    else
    {
        // Video is taller (or narrower) than canvas:
        // keep full width, crop top/bottom.
        scale = vec2(1.0, videoAspect / canvasAspect);
    }

    // Recenter around 0.5, apply cover scaling, then return to [0,1] space.
    uv = (uv - 0.5) / scale + 0.5;

    // ========================================================================
    // OUTPUT
    // ========================================================================

    // Sample the video at adjusted UVs.
    fragColor = texture(uVideoTexture, uv);
}
