#version 300 es
precision highp float;

out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform vec4 uMouse;              // xy = mouse position in pixels, z = mouse button down
uniform float uAudioLevel;        // overall loudness / energy estimate
uniform sampler2D uAudioSpectrum; // log mapped audio spectrum
uniform float uAudioSpectrumBins; // number of bands in the spectrum texture (64 / 128 / 256)

// Sample the already log-mapped spectrum texture at normalized x.
float spectrumAt(float x) {
  if (uAudioSpectrumBins <= 0.0) return 0.0;
  return texture(uAudioSpectrum, vec2(clamp(x, 0.0, 1.0), 0.5)).r;
}

// Small smoothing so 64-band spectra feel less chunky.
float smoothSpectrumAt(float x) {
  float dx = 0.008;
  return (
    spectrumAt(x - dx) +
    spectrumAt(x) +
    spectrumAt(x + dx)
  ) / 3.0;
}

// Simple 2D rotation.
mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

// Tiny pseudo-random helper.
float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

// Soft glowing particle.
float spark(vec2 p, vec2 center, float size) {
  return exp(-size * dot(p - center, p - center));
}

void main() {
  // Screen-space coordinates.
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= res.x / res.y;

  // Mouse in centered coordinates.
  vec2 mouse = uMouse.xy / res;
  vec2 mouseCentered = mouse * 2.0 - 1.0;
  float mouseDown = uMouse.z;
  float t = uTime;

  // Scene wobble / steering.
  vec2 scene = p;
  scene *= rot(0.16 * sin(t * 0.35) + mouseCentered.x * 0.24);
  scene.y += mouseCentered.y * 0.18;

  float radius = length(scene);
  float angle = atan(scene.y, scene.x);

  float bloom = exp(-4.4 * radius) * (0.16 + uAudioLevel * 0.95);
  float swirl = 0.5 + 0.5 * sin(angle * 5.0 - t * 1.25 + radius * 9.5);
  float rainbowPulse = 0.5 + 0.5 * sin(t * 1.6 + radius * 11.0 - angle * 2.8);

  vec3 skyA = vec3(0.07, 0.03, 0.16);
  vec3 skyB = vec3(0.02, 0.18, 0.38);
  vec3 skyC = vec3(0.60, 0.16, 0.42);
  vec3 skyD = vec3(0.10, 0.48, 0.42);

  vec3 color = mix(skyA, skyB, uv.y);
  color = mix(color, skyC, 0.22 * swirl);
  color += skyD * (0.03 + 0.05 * rainbowPulse) * exp(-2.8 * radius);
  color += vec3(1.0, 0.72, 0.30) * bloom * 0.55;

  // Wobbly floor glow.
  float floorY = -0.72 + 0.03 * sin(t * 0.7 + scene.x * 4.0);
  float floorGlow = smoothstep(0.38, 0.0, abs(scene.y - floorY));
  color += vec3(0.04, 0.10, 0.18) * floorGlow;

  float barsGlow = 0.0;
  float sparks = 0.0;
  float discoBits = 0.0;

  const int SAMPLES = 56;
  for (int i = 0; i < SAMPLES; i++) {
    float fi = float(i);
    float x = (fi + 0.5) / float(SAMPLES);

    // Spectrum is already log-frequency mapped.
    float band = pow(max(smoothSpectrumAt(x), 0.0), 1.05);

    float barX = mix(-0.95, 0.95, x);
    float perspective = mix(1.18, 0.55, x);
    float width = mix(0.028, 0.012, x);

    float top = -0.68 + band * (0.18 + perspective * 0.90);

    float side = smoothstep(width, width * 0.35, abs(scene.x - barX));
    float vertical = smoothstep(0.025, -0.01, scene.y - top);
    float body = side * vertical * smoothstep(-0.88, -0.58, scene.y);

    float hue = x * 1.03 + 0.08 * sin(t * 1.2 + fi * 0.35);
    vec3 barColor = 0.55 + 0.45 * cos(6.28318 * (hue + vec3(0.0, 0.33, 0.66)));

    barColor = pow(barColor, vec3(0.95));

    color += barColor * body * (0.48 + band * 0.95);

    barsGlow += band
      * exp(-22.0 * abs(scene.x - barX))
      * exp(-5.5 * abs(scene.y + 0.50));

    // Sparkles mostly for highs
    float highWeight = smoothstep(0.58, 1.0, x);
    float sparkleStrength = band * highWeight * (0.22 + uAudioLevel * 0.85);

    if (sparkleStrength > 0.01) {
      float seed = fi * 17.13;

      vec2 sparkPos = vec2(
        barX + (hash(seed + floor(t * 8.0)) - 0.5) * 0.07,
        top + 0.05 + hash(seed + 11.0 + floor(t * 11.0)) * (0.12 + band * 0.18)
      );

      sparks += spark(scene, sparkPos, 180.0) * sparkleStrength;
      sparks += spark(scene, sparkPos + vec2(0.012, -0.010), 420.0) * sparkleStrength * 0.55;
      sparks += spark(scene, sparkPos + vec2(-0.010, 0.008), 360.0) * sparkleStrength * 0.40;

      vec2 dustPos = sparkPos + vec2(
        (hash(seed + 23.0) - 0.5) * 0.04,
        (hash(seed + 29.0) - 0.5) * 0.04
      );
      discoBits += spark(scene, dustPos, 520.0) * sparkleStrength * 0.22;
    }
  }

  // spectrum glow
  vec3 spectrumGlowColor = mix(
    vec3(0.10, 0.72, 0.68),
    vec3(0.82, 0.34, 0.20),
    uv.x
  );
  color += spectrumGlowColor * barsGlow * (0.22 + uAudioLevel * 0.75);

  // particle highlights
  color += vec3(1.0, 0.93, 0.55) * sparks * 0.45;
  color += vec3(0.58, 0.82, 1.0) * sparks * 0.28;
  color += vec3(0.85, 0.45, 1.0) * discoBits * 0.30;

  // Mouse light
  float mouseLight = exp(
    -6.5 * distance(scene, mouseCentered * vec2(res.x / res.y, 1.0))
  ) * (0.10 + 0.22 * mouseDown);

  color += vec3(0.80, 0.68, 0.95) * mouseLight;

  // Falling confetti
  float confetti = 0.0;
  float confettiColorMix = 0.0;

  for (int i = 0; i < 18; i++) {
    float fi = float(i);

    float lane = hash(fi * 2.7 + floor(t * 0.6));
    float drift = fract(hash(fi * 9.1) + t * (0.05 + 0.03 * hash(fi + 3.0)));

    vec2 pos = vec2(
      mix(-1.1, 1.1, lane),
      mix(1.1, -1.0, drift)
    );

    pos.x += 0.05 * sin(t * (1.5 + hash(fi * 4.0) * 2.0) + fi * 3.1);

    vec2 delta = scene - pos;

    float piece = exp(-160.0 * dot(delta, delta))
      * smoothstep(0.68, 1.0, smoothSpectrumAt(fract(fi * 0.07 + 0.55)));

    confetti += piece;
    confettiColorMix += piece * lane;
  }

  vec3 confettiColor = mix(
    vec3(0.95, 0.40, 0.78),
    vec3(0.22, 0.85, 0.76),
    clamp(confettiColorMix, 0.0, 1.0)
  );

  color += confettiColor * confetti * 0.35;

  // Very subtle shimmer.
  float shimmer = 0.5 + 0.5 * sin(uv.y * 120.0 + t * 6.0 + uv.x * 18.0);
  color += vec3(0.05, 0.02, 0.08) * shimmer * barsGlow * 0.04;

  // Edge darkening.
  float vignette = smoothstep(1.45, 0.15, length(scene));
  color *= vignette;

  // Tiny ambient glue.
  color += vec3(0.01, 0.015, 0.03) * barsGlow * 0.05;

  // Final tone shaping:
  // > 1.0 darkens a little and helps avoid the "too bright" look.
  color = pow(color, vec3(1.08));

  fragColor = vec4(color, 1.0);
}
