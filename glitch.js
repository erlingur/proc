/*
 * Glitch bursts for the Proc ehf. wordmark.
 *
 * The WebGL shader and burst timeline are ported from Canvas UI's
 * GlitchVanilla component (https://canvasui.dev/docs/components/glitch).
 * The original captures live HTML through Chrome's experimental
 * HTML-in-Canvas API. This port paints the wordmark into a 2D canvas
 * instead, so it runs in any browser with WebGL 2. The h1 stays in the
 * DOM, transparent, for accessibility and selection. Without WebGL 2, or
 * with reduced motion enabled, the plain wordmark is shown.
 *
 * ---------------------------------------------------------------------
 * MIT + Commons Clause License Condition v1.0
 *
 * Copyright (c) 2026 David Haz
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish, and
 * distribute the Software as part of an application, website, or product,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * Commons Clause Restriction
 *
 * You may use this Software, including for any commercial purpose, so
 * long as you do not sell, sublicense, or redistribute the components
 * themselves - whether alone, in a bundle, or as a ported version.
 *
 * No Warranty
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 * ---------------------------------------------------------------------
 */
(() => {
  'use strict';

  const OPTIONS = {
    intensity: 1,   // overall strength of the glitch (0 to 2)
    interval: 3,    // seconds between bursts; 0 keeps it running constantly
    duration: 0.4,  // how long each burst lasts, in seconds
    slices: 24,     // horizontal slices the tear snaps to; lower is chunkier
    shift: 30,      // how far torn slices shift sideways, in CSS pixels
    rgbShift: 4,    // chromatic RGB split during bursts, in CSS pixels
    blocks: 0.5,    // corrupted block artifacts during bursts (0 to 1)
    noise: 0.35,    // analog noise and scanline flicker during bursts (0 to 1)
  };

  // Room around the wordmark so torn slices and colour fringes have
  // somewhere to go, in CSS pixels.
  const BLEED_X = 48;
  const BLEED_Y = 16;

  const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uSeed;
uniform float uAmp;
uniform float uSlices;
uniform float uShift;
uniform float uRgbShift;
uniform float uBlocks;
uniform float uNoise;
uniform float uMaxX;

float hash12 (vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec4 page (vec2 p) {
  p.x = clamp(p.x, 0.0005, uMaxX - 0.0005);
  p.y = clamp(p.y, 0.0005, 0.9995);
  return texture(uContent, vec2(p.x, 1.0 - p.y));
}

void main () {
  vec2 uv = vUv;
  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  float e = uAmp;
  vec2 guv = uv;

  if (e > 0.001) {
    float band = floor(uv.y * uSlices);
    float pick = hash12(vec2(band, uSeed));
    float tear = step(1.0 - 0.3 * min(e, 1.0), pick);
    float dir = hash12(vec2(band, uSeed + 13.0)) * 2.0 - 1.0;
    guv.x += tear * dir * e * uShift / uResolution.x;

    float sub = floor(uv.y * uSlices * 7.0);
    float micro = hash12(vec2(sub, uSeed + 29.0));
    guv.x += (micro - 0.5) * e * uNoise * 3.0 / uResolution.x;

    vec2 cell = floor(guv * vec2(10.0, uSlices * 0.5));
    float br = hash12(cell + uSeed * 0.0173);
    if (br > 1.0 - 0.14 * uBlocks * min(e, 1.0)) {
      vec2 jump = vec2(
        hash12(cell + uSeed + 3.1) - 0.5,
        hash12(cell + uSeed + 7.7) - 0.5
      );
      guv += jump * vec2(0.08, 0.02) * e;
    }
  }

  float split = uRgbShift * e / uResolution.x;
  vec4 c = page(guv);
  float r = page(guv + vec2(split, 0.0)).r;
  float b = page(guv - vec2(split, 0.0)).b;
  vec4 col = vec4(r, c.g, b, c.a);

  if (e > 0.001 && uNoise > 0.001) {
    float grain = hash12(vUv * uResolution + uSeed * 5.3) - 0.5;
    float row = floor(vUv.y * uResolution.y);
    float flicker = hash12(vec2(row, uSeed + 41.0));
    float lines = step(0.985 - 0.01 * uNoise * e, flicker);
    col.rgb += (grain * 0.22 + lines * 0.35) * uNoise * min(e, 1.0) * col.a;
  }

  outColor = vec4(clamp(col.rgb, 0.0, 1.0) * col.a, col.a);
}`;

  const h1 = document.querySelector('h1');
  const span = h1 && h1.querySelector('span');
  if (!h1 || !span) return;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motionQuery.matches) return;

  const output = document.createElement('canvas');
  output.className = 'glitch';
  output.setAttribute('aria-hidden', 'true');
  const gl = output.getContext('webgl2', {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: true,
  });
  if (!gl || gl.isContextLost()) return;

  const source = document.createElement('canvas');
  const ctx = source.getContext('2d');
  if (!ctx) return;

  // ---- GL setup ------------------------------------------------------

  function compile(type, text) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, text);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Glitch shader error:', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  const vertexShader = compile(gl.VERTEX_SHADER, VERT);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vertexShader || !fragmentShader) return;
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Glitch program error:', gl.getProgramInfoLog(program));
    return;
  }

  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    uniforms[info.name] = gl.getUniformLocation(program, info.name);
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const contentTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, contentTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

  // ---- Painting the wordmark into the source canvas ------------------

  let contentDirty = false;

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function paint() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = h1.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(rect.width + BLEED_X * 2));
    const height = Math.max(1, Math.ceil(rect.height + BLEED_Y * 2));
    const pw = Math.round(width * dpr);
    const ph = Math.round(height * dpr);
    if (source.width !== pw || source.height !== ph) {
      source.width = pw;
      source.height = ph;
    }
    if (output.width !== pw || output.height !== ph) {
      output.width = pw;
      output.height = ph;
    }
    output.style.width = width + 'px';
    output.style.height = height + 'px';
    output.style.left = -BLEED_X + 'px';
    output.style.top = -BLEED_Y + 'px';

    const big = getComputedStyle(h1);
    const small = getComputedStyle(span);
    const size = parseFloat(big.fontSize);
    const lineHeight = parseFloat(big.lineHeight) || size;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.textBaseline = 'alphabetic';

    ctx.font = `${big.fontWeight} ${size}px ${big.fontFamily}`;
    if ('letterSpacing' in ctx) {
      ctx.letterSpacing = big.letterSpacing === 'normal' ? '0px' : big.letterSpacing;
    }
    const metrics = ctx.measureText('Proc');
    const ascent = metrics.fontBoundingBoxAscent || size * 0.95;
    const descent = metrics.fontBoundingBoxDescent || size * 0.25;
    // Same placement CSS uses: half-leading above the ascent inside the line box.
    const baseline = BLEED_Y + (lineHeight - (ascent + descent)) / 2 + ascent;
    ctx.fillStyle = cssVar('--ink', '#F6EDE9');
    ctx.fillText('Proc', BLEED_X, baseline);

    const x = BLEED_X + metrics.width + (parseFloat(small.marginLeft) || 0);
    ctx.font = `${small.fontWeight} ${parseFloat(small.fontSize)}px ${small.fontFamily}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillStyle = cssVar('--muted', '#E3B3BA');
    ctx.fillText('ehf.', x, baseline);

    contentDirty = true;
  }

  function uploadContent() {
    if (!contentDirty) return;
    contentDirty = false;
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  // ---- Burst timeline ------------------------------------------------

  const config = Object.assign({}, OPTIONS);
  let time = 0;
  let burstAt = 0.6;
  let burstSeed = 1;
  let envelope = 0;

  function hash(n) {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  }

  function advanceTimeline(delta) {
    time += delta;
    if (config.interval <= 0) {
      envelope = 1;
      return;
    }
    const sinceBurst = time - burstAt;
    const duration = Math.max(config.duration, 0.05);
    if (sinceBurst >= 0 && sinceBurst < duration) {
      const tail = 1 - Math.pow(sinceBurst / duration, 2);
      envelope = tail * (0.7 + 0.3 * hash(burstSeed + Math.floor(time * 24)));
    } else {
      envelope = 0;
      if (sinceBurst >= duration) {
        burstAt = time + Math.max(config.interval, 0.3) * (0.75 + 0.5 * Math.random());
        burstSeed = Math.floor(Math.random() * 1000);
      }
    }
  }

  function render() {
    uploadContent();
    const dpr = output.width / Math.max(output.clientWidth, 1);
    const amp = envelope * Math.max(config.intensity, 0);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.uniform1i(uniforms.uContent, 0);
    gl.uniform2f(uniforms.uResolution, output.width, output.height);
    gl.uniform1f(uniforms.uSeed, Math.floor(time * 24) + burstSeed);
    gl.uniform1f(uniforms.uAmp, amp);
    gl.uniform1f(uniforms.uSlices, Math.max(config.slices, 3));
    gl.uniform1f(uniforms.uShift, Math.max(config.shift, 0) * dpr);
    gl.uniform1f(uniforms.uRgbShift, Math.max(config.rgbShift, 0) * dpr);
    gl.uniform1f(uniforms.uBlocks, Math.min(Math.max(config.blocks, 0), 1));
    gl.uniform1f(uniforms.uNoise, Math.min(Math.max(config.noise, 0), 1));
    gl.uniform1f(uniforms.uMaxX, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, output.width, output.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ---- Frame loop ----------------------------------------------------

  let raf = 0;
  let lastTime = performance.now();
  let running = false;
  let reducedMotion = false;

  function frame(now) {
    const delta = Math.min(Math.max((now - lastTime) / 1000, 0), 1 / 30);
    lastTime = now;
    const wasActive = envelope > 0;
    if (!reducedMotion) advanceTimeline(delta);
    else envelope = 0;
    if (envelope > 0 || wasActive || contentDirty) render();
    if (reducedMotion && !contentDirty) {
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function burst() {
    burstAt = time;
    burstSeed = Math.floor(Math.random() * 1000);
    start();
  }

  function setOptions(next) {
    Object.assign(config, next);
    start();
  }

  function repaint() {
    paint();
    start();
  }

  // ---- Wiring --------------------------------------------------------

  paint();
  h1.append(output);
  h1.classList.add('glitch-on');
  start();

  new ResizeObserver(repaint).observe(h1);
  if (document.fonts) document.fonts.addEventListener('loadingdone', repaint);
  h1.addEventListener('pointerenter', burst);

  motionQuery.addEventListener('change', () => {
    reducedMotion = motionQuery.matches;
    start();
  });

  output.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    cancelAnimationFrame(raf);
    running = true; // keep start() from scheduling frames on a dead context
    h1.classList.remove('glitch-on');
    output.remove();
  });

  window.procGlitch = { burst, setOptions, repaint };
})();
