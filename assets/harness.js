/*
 * Solar Harness film. Hand-written WebGL2, no libraries.
 * 2,400 camera frames are GPU instances. Their whole choreography —
 * drift, assemble into a wall, scan and drop, pre-label wave, review fly-out, compress
 * into the v3 cube — is computed in the vertex shader from one uniform t (seconds), so the
 * film is a pure function of time: it can pause, scrub and jump to chapters.
 * HUD text is DOM (crisp, bilingual); a 2D overlay draws the scan beam and the review close-up.
 * The frames are real highway photos (Wikimedia Commons, credited on the page) with boxes from an
 * offline Faster R-CNN run; dataset totals are illustrative and labelled so on the page.
 */
(() => {
  'use strict';

  const film = document.getElementById('harness-film');
  if (!film) return;

  const root = document.documentElement;
  const lang = () => (root.dataset.lang === 'en' ? 'en' : 'zh');
  const L = (zh, en) => (lang() === 'zh' ? zh : en);
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => Boolean(motionQuery && motionQuery.matches);

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, p) => a + (b - a) * p;
  const win = (t, a, b) => clamp((t - a) / (b - a));
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- script ---------------- */
  const T = 40;
  const TM = { asm: 7.4, clean: 11.2, scanA: 11.6, scanB: 15.6, label: 16.2, waveA: 16.5, waveB: 20.6, rev: 21.6, outA: 21.8, featA: 23.0, featB: 27.4, green: 26.4, backA: 27.3, cube: 28.6, final: 32.4 };
  const COLS = 60, ROWS = 40, N = COLS * ROWS;
  const RAW = N, BLUR = 141, DUP = 91, KEPT = RAW - BLUR - DUP, BOXES = 9412, REVIEW = 37;
  const CH = [
    { at: 0, zh: '需求', en: 'Request', sub: () => L('自然语言 → 任务', 'plain language → task') },
    { at: 5.6, zh: '规划 · 确认', en: 'Plan · approve', sub: () => 'dataset.get · workflow · approval' },
    { at: TM.clean, zh: '清洗', en: 'Clean', sub: () => 'preprocess.filter · blur · dedupe' },
    { at: TM.label, zh: '预标注', en: 'Pre-label', sub: () => 'model.predict · vehicle · person' },
    { at: TM.rev, zh: '人工复核', en: 'Human review', sub: () => 'review.route · conf < 0.5' },
    { at: TM.cube, zh: '打包交付', en: 'Package', sub: () => 'export.coco → v3' }
  ];
  const PROMPT = {
    zh: '把上周导入的高速路采集数据清洗一下：去掉模糊和重复帧，车辆、行人做预标注，置信度低于 0.5 的送人工复核，最后打一个 COCO 包给标注组。',
    en: "Clean up last week's highway capture: drop blurry and duplicate frames, pre-label vehicles and pedestrians, send anything under 0.5 confidence to human review, then ship a COCO package to the labeling team."
  };
  const TYPE_A = 0.7, TYPE_B = 4.9, SEND = 5.3;
  const LOG = [
    { at: 5.7, end: 6.4, zh: () => `dataset.get  highway-0412 → v2 · ${fmt(RAW)} 张`, en: () => `dataset.get  highway-0412 → v2 · ${fmt(RAW)} frames` },
    { at: 6.5, end: 6.5, zh: () => '工作流 4 步：清洗 → 预标注 → 复核 → 导出 v3', en: () => 'workflow, 4 steps: clean → pre-label → review → export v3' },
    { at: 7.9, end: 7.9, zh: () => '确认通过 · 生成 v3，v2 原样保留', en: () => 'approved · create v3, keep v2 untouched' },
    { at: TM.scanA - 0.2, end: TM.scanB + 0.3, zh: (d) => (d ? `preprocess.filter  −${BLUR} 模糊 · −${DUP} 重复` : 'preprocess.filter  blur · dedupe'), en: (d) => (d ? `preprocess.filter  −${BLUR} blurry · −${DUP} dupes` : 'preprocess.filter  blur · dedupe') },
    { at: TM.waveA - 0.2, end: TM.waveB + 0.3, zh: (d) => (d ? `model.predict  ${fmt(BOXES)} 个框` : 'model.predict  vehicle · person'), en: (d) => (d ? `model.predict  ${fmt(BOXES)} boxes` : 'model.predict  vehicle · person') },
    { at: TM.rev, end: TM.rev + 0.6, zh: () => `review.route  conf < 0.5 → ${REVIEW} 张`, en: () => `review.route  conf < 0.5 → ${REVIEW} frames` },
    { at: TM.rev + 0.7, end: TM.featB, zh: (d) => (d ? `review.wait  ${REVIEW}/${REVIEW} 已复核 · 修正 6 处` : 'review.wait  复核员处理中'), en: (d) => (d ? `review.wait  ${REVIEW}/${REVIEW} reviewed · 6 fixes` : 'review.wait  reviewer at work') },
    { at: TM.cube, end: 31.4, zh: () => 'export.coco  v3 · sha256 9f3c…e21a', en: () => 'export.coco  v3 · sha256 9f3c…e21a' },
    { at: 32.0, end: 32.0, zh: () => '完成 · 每一步已落盘，可回放', en: () => 'done · every step logged, replayable' }
  ];

  /* ---------------- DOM ---------------- */
  const $ = (s) => film.querySelector(s);
  const canvas = $('.hx-gl');
  const over = $('.hx-over');
  const octx = over.getContext('2d');
  const playBtn = $('.hf-play');
  const range = $('.hf-range');
  const timeEl = $('.hf-time');
  const chaptersEl = $('.hf-chapters');
  const H = {
    stepN: $('.hx-step-n'), stepT: $('.hx-step-t'), stepS: $('.hx-step-s'),
    frames: $('[data-m="frames"]'), boxes: $('[data-m="boxes"]'), review: $('[data-m="review"]'), ver: $('[data-m="ver"]'),
    log: $('.hx-log'), typed: $('.hx-typed'), approve: $('.hx-approve'), final: $('.hx-final'), fade: $('.hx-fade')
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const both = (zh, en) => `<span class="zh">${esc(zh)}</span><span class="en">${esc(en)}</span>`;
  chaptersEl.innerHTML = CH.map((c, i) => `<button type="button" data-ch="${i}"><span class="mono">${String(i + 1).padStart(2, '0')}</span>${both(c.zh, c.en)}</button>`).join('');

  /* ---------------- real frames ---------------- */
  // 32 highway photos from Wikimedia Commons (credits on the page), plus their mirror images:
  // 64 atlas cells. Boxes come from a COCO-pretrained Faster R-CNN run on these photos offline.
  const VAR = 64, AC = 8;
  const FEAT_VARIANT = 17; // the A5 Autobahn photo where the detector disagrees with itself
  const BASE = 'assets/harness/';
  let FR = null; // frames.json
  const boxesOf = (v) => {
    const f = FR.frames[v % 32].boxes;
    return v < 32 ? f : f.map(([c, s, x, y, w, h]) => [c, s, 1 - x - w, y, w, h]);
  };
  function buildAtlases(img) {
    const [cw, chh] = FR.cell;
    const mk = () => { const cv = document.createElement('canvas'); cv.width = cw * AC; cv.height = chh * AC; return cv; };
    const blur = mk(), box = mk();
    const bc = blur.getContext('2d'), xc = box.getContext('2d');
    const tmp = document.createElement('canvas'); tmp.width = 22; tmp.height = 15;
    const tc = tmp.getContext('2d');
    bc.imageSmoothingEnabled = true; bc.imageSmoothingQuality = 'high';
    for (let v = 0; v < VAR; v++) {
      const ox = (v % AC) * cw, oy = Math.floor(v / AC) * chh;
      tc.drawImage(img, ox, oy, cw, chh, 0, 0, 22, 15);
      bc.drawImage(tmp, ox, oy, cw, chh);
      xc.strokeStyle = '#fff'; xc.lineWidth = 2.5; xc.fillStyle = '#fff';
      for (const [, sc, x, y, w, h] of boxesOf(v)) {
        if (sc < 0.5) continue;
        xc.strokeRect(ox + x * cw, oy + y * chh, w * cw, h * chh);
        xc.fillRect(ox + x * cw - 1.25, oy + y * chh - 6, Math.min(22, w * cw * 0.7), 6);
      }
    }
    return { blur, box };
  }

  /* ---------------- instances ---------------- */
  const R = mulberry32(20261015);
  const order = Array.from({ length: N }, (_, i) => i).sort(() => R() - 0.5);
  const flags = new Uint8Array(N);
  order.slice(0, BLUR).forEach((i) => { flags[i] = 1; });
  order.slice(BLUR, BLUR + DUP).forEach((i) => { flags[i] = 2; });
  // low-confidence frames: kept frames inside the central band so they read when they lift out
  const lowList = [];
  for (const i of order.slice(BLUR + DUP)) {
    const col = i % COLS, row = Math.floor(i / COLS);
    if (lowList.length < REVIEW && col > 8 && col < 52 && row > 5 && row < 35) { flags[i] |= 4; lowList.push(i); }
  }
  const FEAT_SLOT = 18;
  const FEAT = lowList[FEAT_SLOT];
  const variantOf = new Uint8Array(N);
  for (let i = 0; i < N; i++) variantOf[i] = Math.floor(R() * VAR);
  // the close-up frame needs a clear vehicle
  variantOf[FEAT] = FEAT_VARIANT;

  const PITCH_X = 1.12, PITCH_Y = 0.78;
  const STRIDE = 20;
  const inst = new Float32Array(N * STRIDE);
  let kept = 0, slot = 0;
  for (let i = 0; i < N; i++) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const rnd = R();
    const o = i * STRIDE;
    inst[o] = i; inst[o + 1] = variantOf[i]; inst[o + 2] = flags[i]; inst[o + 3] = rnd;
    // cloud: a wide drifting shell around the camera path
    const th = R() * Math.PI * 2, ph = Math.acos(2 * R() - 1), rad = 26 + R() * 34;
    inst[o + 4] = rad * Math.sin(ph) * Math.cos(th); inst[o + 5] = rad * Math.cos(ph) * 0.55; inst[o + 6] = rad * Math.sin(ph) * Math.sin(th) - 10;
    const wx = (col - (COLS - 1) / 2) * PITCH_X, wy = ((ROWS - 1) / 2 - row) * PITCH_Y;
    inst[o + 7] = wx; inst[o + 8] = wy; inst[o + 9] = 0;
    let cx = 0, cy = 0, cz = 0;
    if (!(flags[i] & 3)) {
      const m = kept++;
      cx = (m % 13) - 6; cy = (Math.floor(m / 13) % 13) - 6; cz = Math.floor(m / 169) - 6;
    }
    inst[o + 10] = cx * 1.3; inst[o + 11] = cy * 1.3; inst[o + 12] = cz * 1.3;
    const scanT = lerp(TM.scanA, TM.scanB, col / (COLS - 1));
    const d = Math.hypot(wx / 34, wy / 16) / Math.SQRT2;
    const labelT = lerp(TM.waveA, TM.waveB - 0.5, d) + rnd * 0.25;
    let s = -1;
    if (flags[i] & 4) s = slot++;
    inst[o + 13] = scanT; inst[o + 14] = labelT; inst[o + 15] = s; inst[o + 16] = Math.hypot(cx, cy, cz) / 10.4;
    const k = Math.max(0, s);
    inst[o + 17] = ((k % 8) - 3.5) * 2.05; inst[o + 18] = (2 - Math.floor(k / 8)) * 1.42; inst[o + 19] = 17;
  }
  const slotPos = (k) => [((k % 8) - 3.5) * 2.05, (2 - Math.floor(k / 8)) * 1.42, 17];

  /* ---------------- GL ---------------- */
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!gl) { film.classList.add('no-webgl'); return; }

  const DEFS = Object.entries(TM).map(([k, v]) => `#define T_${k.toUpperCase()} ${v.toFixed(3)}`).join('\n');
  const VS = `#version 300 es
precision highp float;
${DEFS}
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aA;
layout(location=2) in vec3 aCloud;
layout(location=3) in vec3 aWall;
layout(location=4) in vec3 aCube;
layout(location=5) in vec4 aTimes;
layout(location=6) in vec3 aSlot;
uniform mat4 uVP; uniform vec3 uEye; uniform float uT; uniform float uFeatHide; uniform vec3 uRight; uniform vec3 uUp;
out vec2 vLocal; out vec2 vUV; out float vBlur; out float vBox; out vec3 vBoxCol; out vec4 vTint; out vec3 vGlow; out float vAlpha; out float vFog;
float sstep(float a, float b, float x){ float p = clamp((x-a)/(b-a),0.,1.); return p*p*(3.-2.*p); }
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
void main(){
  float idx = aA.x, variant = aA.y, rnd = aA.w;
  int fl = int(aA.z + .5);
  bool isBlur = (fl & 1) != 0, isDup = (fl & 2) != 0, isLow = (fl & 4) != 0, drop = isBlur || isDup;
  float t = uT;
  float alpha = 1.;
  vec3 tintC = vec3(0.); float tintA = 0.; vec3 glow = vec3(0.);

  // 1. drift → wall
  float as = sstep(T_ASM + rnd*1.8, T_ASM + rnd*1.8 + 1.5, t);
  vec3 cloud = aCloud + vec3(sin(t*.25 + rnd*40.)*1.5, cos(t*.21 + rnd*30.)*1.2, sin(t*.18 + rnd*20.)*1.5);
  vec3 p = mix(cloud, aWall, as);
  float ry = (1.-as) * (rnd*6.283 + t*.35), rx = (1.-as) * (rnd*2.4 - 1.2);
  float scale = mix(.85, 1., as);
  alpha *= mix(.55 + .45*rnd, 1., as);

  // 2. scan & drop
  float sc = aTimes.x;
  float beam = exp(-pow((t - sc) * 5., 2.)) * step(T_SCANA - .3, t) * step(t, T_SCANB + .3);
  glow += vec3(1.,.72,.55) * beam * .9;
  tintC += vec3(1.,.82,.68) * beam; tintA += beam * .5;
  if (drop) {
    float f = sstep(sc, sc + .15, t);
    tintC = mix(tintC, vec3(1.,.22,.18), f); tintA = max(tintA, f * .55);
    glow += vec3(1.,.25,.2) * f * (1. - sstep(sc + .8, sc + 1.8, t)) * 1.2;
    float fall = max(0., t - (sc + .55));
    p.y -= 7. * fall * fall; p.z += 5. * fall; p.x += (rnd - .5) * 6. * fall;
    rx += fall * (rnd - .5) * 7.; ry += fall * (rnd - .3) * 4.;
    alpha *= 1. - sstep(.2, 1.6, fall);
  }

  // 3. pre-label wave
  float lt = aTimes.y;
  vBox = sstep(lt, lt + .35, t);
  float pop = exp(-pow((t - lt - .2) * 3.5, 2.));
  p.z += 1.6 * pop;
  glow += vec3(.45,.62,.95) * pop * .8;
  vBoxCol = vec3(.45,.66,.92);

  // 4. review: low frames lift out, get fixed, go back
  if (isLow) {
    float k = aTimes.z;
    float outS = sstep(T_OUTA + k*.03, T_OUTA + k*.03 + 1.1, t);
    float back = sstep(T_BACKA + k*.015, T_BACKA + k*.015 + 1., t);
    float s = outS * (1. - back);
    p = mix(p, aSlot, s);
    scale *= mix(1., 1.75, s);
    float ok = sstep(T_GREEN + k*.02, T_GREEN + k*.02 + .3, t);
    vec3 amber = vec3(1.,.66,.18), green = vec3(.56,.82,.54);
    vBoxCol = mix(vBoxCol, mix(amber, green, ok), sstep(T_REV, T_REV + .4, t));
    glow += mix(amber, green, ok) * sstep(T_REV, T_REV + .5, t) * (1. - back*.85) * 1.1;
    if (abs(idx - ${FEAT}.0) < .5) alpha *= 1. - uFeatHide;
  } else {
    // everything else dims while review is in focus
    float dimR = sstep(T_OUTA, T_OUTA + .8, t) * (1. - sstep(T_BACKA, T_BACKA + .8, t));
    alpha *= 1. - .55 * dimR;
  }

  // 5. compress into the v3 cube, which keeps turning
  float cs = sstep(T_CUBE + aTimes.w*1.4, T_CUBE + aTimes.w*1.4 + 1.3, t);
  float ang = max(0., t - T_CUBE) * .32;
  vec3 cubeP = rotY(ang) * rotX(.42) * aCube;
  p = mix(p, cubeP, cs);
  ry = mix(ry, ang, cs); rx = mix(rx, .42, cs);
  scale *= mix(1., .88, cs);
  glow += vec3(.85,.5,.35) * cs * .35;

  vec2 c = aCorner * 1.3;                 // quad grows 30% past the frame for the glow
  vec3 local = vec3(c.x * .5, c.y * .33, 0.) * scale;
  // in the cube every frame turns to face the camera, so the lattice reads as images, not slivers
  vec3 bill = uRight * local.x + uUp * local.y;
  vec3 world = p + mix(rotY(ry) * rotX(rx) * local, bill, cs);
  gl_Position = uVP * vec4(world, 1.);
  vLocal = c;
  vec2 cell = vec2(mod(variant, 8.), floor(variant / 8.));
  vUV = (cell + (clamp(c, -1., 1.) * vec2(.5, -.5) + .5)) / 8.;
  vBlur = isBlur ? 1. : 0.;
  vTint = vec4(tintC, clamp(tintA, 0., .8));
  vGlow = glow;
  vAlpha = alpha;
  vFog = clamp((length(world - uEye) - 30.) / 70., 0., .85);
}`;
  const FS = `#version 300 es
precision highp float;
in vec2 vLocal; in vec2 vUV; in float vBlur; in float vBox; in vec3 vBoxCol; in vec4 vTint; in vec3 vGlow; in float vAlpha; in float vFog;
uniform sampler2D uImg; uniform sampler2D uBlurT; uniform sampler2D uBoxT; uniform float uPass;
out vec4 o;
void main(){
  vec2 a = abs(vLocal);
  float inside = step(max(a.x, a.y), 1.);
  if (uPass < .5) {
    if (inside < .5 || vAlpha < .01) discard;
    vec3 col = vBlur > .5 ? texture(uBlurT, vUV).rgb : texture(uImg, vUV).rgb;
    float m = texture(uBoxT, vUV).r * vBox;
    col = mix(col, vBoxCol, m);
    col = mix(col, vTint.rgb, vTint.a);
    float edge = smoothstep(.93, 1., max(a.x, a.y));
    col += edge * .18;
    col = mix(col, vec3(.06,.055,.05), vFog);
    o = vec4(col * vAlpha, vAlpha);
  } else {
    float d = (max(a.x, a.y) - 1.) / .3;
    float g = inside > .5 ? 0. : pow(clamp(1. - d, 0., 1.), 2.2);
    float s = g * vAlpha * (1. - vFog);
    if (s * max(vGlow.r, max(vGlow.g, vGlow.b)) < .004) discard;
    o = vec4(vGlow * s, 0.);
  }
}`;
  // background: floor grid + dust
  const BG_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aP;
uniform mat4 uVP; out vec3 vW;
void main(){ vec3 w = vec3(aP.x * 220., -24., aP.y * 220. - 40.); vW = w; gl_Position = uVP * vec4(w, 1.); }`;
  const BG_FS = `#version 300 es
precision highp float;
in vec3 vW; uniform vec3 uEye; uniform float uT; out vec4 o;
void main(){
  vec2 g = abs(fract(vW.xz / 6. - .5) - .5) / fwidth(vW.xz / 6.);
  float line = 1. - min(min(g.x, g.y), 1.);
  float d = length(vW.xz - uEye.xz);
  float fade = exp(-d * .018);
  float pulse = .5 + .5 * sin(d * .12 - uT * 1.6);
  float a = line * fade * (.16 + .1 * pulse);
  o = vec4(vec3(.85,.47,.34) * a, a);
}`;
  const DUST_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aD;
uniform mat4 uVP; uniform float uT; uniform float uDpr; out float vA;
void main(){
  vec3 p = aD.xyz + vec3(sin(uT*.07 + aD.w*9.)*3., sin(uT*.1 + aD.w*13.)*2., cos(uT*.05 + aD.w*7.)*3.);
  vec4 c = uVP * vec4(p, 1.);
  gl_Position = c;
  gl_PointSize = (1. + aD.w * 2.2) * uDpr * clamp(60. / c.w, .6, 3.);
  vA = (.25 + .5 * aD.w) * clamp(1.2 - c.w / 120., 0., 1.);
}`;
  const DUST_FS = `#version 300 es
precision highp float;
in float vA; out vec4 o;
void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d) * vA; o = vec4(vec3(1.,.85,.72) * a, 0.); }`;

  function prog(vs, fs) {
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  }
  let P, BG, DU;
  try { P = prog(VS, FS); BG = prog(BG_VS, BG_FS); DU = prog(DUST_VS, DUST_FS); }
  catch (e) { console.error(e); film.classList.add('no-webgl'); return; }

  const tileVao = gl.createVertexArray();
  gl.bindVertexArray(tileVao);
  const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
  [[1, 4, 0], [2, 3, 4], [3, 3, 7], [4, 3, 10], [5, 4, 13], [6, 3, 17]].forEach(([loc, size, off]) => {
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE * 4, off * 4); gl.vertexAttribDivisor(loc, 1);
  });
  const bgVao = gl.createVertexArray(); gl.bindVertexArray(bgVao);
  const bb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const DN = 1400; const dust = new Float32Array(DN * 4);
  for (let i = 0; i < DN; i++) { dust[i * 4] = (R() - 0.5) * 160; dust[i * 4 + 1] = (R() - 0.5) * 70; dust[i * 4 + 2] = (R() - 0.5) * 140 - 10; dust[i * 4 + 3] = R(); }
  const dustVao = gl.createVertexArray(); gl.bindVertexArray(dustVao);
  const db = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, db); gl.bufferData(gl.ARRAY_BUFFER, dust, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  function tex(unit, src) {
    const tx = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (src) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([18, 22, 28, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const af = gl.getExtension('EXT_texture_filter_anisotropic');
    if (af && src) gl.texParameterf(gl.TEXTURE_2D, af.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(af.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  }
  tex(0); tex(1); tex(2);
  let featImg = null, ready = false;

  /* ---------------- camera ---------------- */
  const v3 = { sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }, dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], mix: (a, b, p) => [lerp(a[0], b[0], p), lerp(a[1], b[1], p), lerp(a[2], b[2], p)] };
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function lookAt(eye, tgt) {
    const z = v3.norm(v3.sub(eye, tgt)), x = v3.norm(v3.cross([0, 1, 0], z)), y = v3.cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -v3.dot(x, eye), -v3.dot(y, eye), -v3.dot(z, eye), 1];
  }
  function mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  // [t, eye, target, fov°]
  const KEYS = [
    [0, [18, 6, 64], [0, 0, -6], 52],
    [6.5, [-10, 3, 58], [0, 0, -4], 50],
    [10.2, [0, 0, 50], [0, 0, 0], 48],
    [11.6, [0, 0, 47], [-8, 0, 0], 48],
    [15.6, [6, -1, 45], [8, 0, 0], 48],
    [17.6, [-44, 9, 36], [4, -1, 0], 50],
    [20.6, [-26, 5, 24], [6, 0, 0], 52],
    [22.4, [0, 1.5, 38], [0, 1.2, 10], 46],
    [27.0, [1.5, 1.2, 37], [0.5, 1.2, 10], 46],
    [28.6, [0, 2, 44], [0, 0, 0], 50]
  ];
  function camera(t, aspect) {
    let eye, tgt, fov;
    let i = 0; while (i < KEYS.length - 1 && t >= KEYS[i + 1][0]) i++;
    if (i >= KEYS.length - 1) { eye = KEYS[i][1]; tgt = KEYS[i][2]; fov = KEYS[i][3]; }
    else {
      const a = KEYS[i], b = KEYS[i + 1], p = easeInOut(win(t, a[0], b[0]));
      eye = v3.mix(a[1], b[1], p); tgt = v3.mix(a[2], b[2], p); fov = lerp(a[3], b[3], p);
    }
    if (t > TM.cube) {
      const p = easeInOut(win(t, TM.cube, TM.cube + 2.2));
      const ang = (t - TM.cube) * 0.16 - 0.25;
      const fin = easeInOut(win(t, TM.final - 0.6, TM.final + 1.2));
      const r = lerp(50, 46, fin);
      const orbit = [Math.sin(ang) * r, 13 - fin * 3, Math.cos(ang) * r];
      eye = v3.mix(eye, orbit, p);
      // in the final shot the cube sits left of centre to make room for the package card
      const wide = aspect > 1.2;
      const right = v3.norm(v3.cross([0, 1, 0], v3.norm(orbit)));
      const shift = fin * (wide ? 8 : 0);
      tgt = v3.mix(tgt, [right[0] * shift, wide ? 0 : -fin * 7, right[2] * shift], p);
    }
    const drift = 0.35;
    eye = [eye[0] + Math.sin(t * 0.5) * drift, eye[1] + Math.sin(t * 0.37) * drift * 0.6, eye[2]];
    let fy = fov * Math.PI / 180;
    const ref = 16 / 9;
    if (aspect < ref) fy = 2 * Math.atan(Math.tan(fy / 2) * Math.min(1.9, ref / aspect));
    const vp = mul(perspective(fy, aspect, 0.5, 400), lookAt(eye, tgt));
    const zf = v3.norm(v3.sub(eye, tgt)), rt = v3.norm(v3.cross([0, 1, 0], zf)), up = v3.cross(zf, rt);
    return { vp, eye, right: rt, up };
  }
  function project(vp, p) {
    const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
    const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
    const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
    return [(x / w * 0.5 + 0.5) * W, (1 - (y / w * 0.5 + 0.5)) * Hh];
  }

  /* ---------------- render ---------------- */
  let W = 0, Hh = 0, dpr = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(280, r.width); Hh = Math.max(200, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
    over.width = canvas.width; over.height = canvas.height;
  }

  const featIn = (t) => easeInOut(win(t, TM.featA, TM.featA + 0.9));
  const featOut = (t) => easeInOut(win(t, TM.featB - 0.7, TM.featB));
  const featHide = (t) => (t > TM.featA && t < TM.featB ? 1 : 0);

  function drawGL(t, cam) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(BG.p); gl.bindVertexArray(bgVao);
    gl.uniformMatrix4fv(BG.u.uVP, false, cam.vp); gl.uniform3fv(BG.u.uEye, cam.eye); gl.uniform1f(BG.u.uT, t);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(DU.p); gl.bindVertexArray(dustVao);
    gl.uniformMatrix4fv(DU.u.uVP, false, cam.vp); gl.uniform1f(DU.u.uT, t); gl.uniform1f(DU.u.uDpr, dpr);
    gl.drawArrays(gl.POINTS, 0, DN);
    // frames: solid pass with depth, then additive glow pass
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(P.p); gl.bindVertexArray(tileVao);
    gl.uniformMatrix4fv(P.u.uVP, false, cam.vp); gl.uniform3fv(P.u.uEye, cam.eye); gl.uniform1f(P.u.uT, t);
    gl.uniform1i(P.u.uImg, 0); gl.uniform1i(P.u.uBlurT, 1); gl.uniform1i(P.u.uBoxT, 2);
    gl.uniform1f(P.u.uFeatHide, featHide(t)); gl.uniform3fv(P.u.uRight, cam.right); gl.uniform3fv(P.u.uUp, cam.up);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.uniform1f(P.u.uPass, 0);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N);
    gl.depthMask(false); gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniform1f(P.u.uPass, 1);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N);
    gl.depthMask(true);
    gl.bindVertexArray(null);
  }

  // The review case is real detector output: one van, three overlapping guesses (truck 0.67 / car 0.65 / car 0.42).
  const iou = (a, b) => {
    const x1 = Math.max(a[2], b[2]), y1 = Math.max(a[3], b[3]), x2 = Math.min(a[2] + a[4], b[2] + b[4]), y2 = Math.min(a[3] + a[5], b[3] + b[5]);
    const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    return i / (a[4] * a[5] + b[4] * b[5] - i);
  };
  let REV = null;
  function reviewCase() {
    if (REV) return REV;
    const all = boxesOf(FEAT_VARIANT);
    const low = all.find((b) => b[1] < 0.5 && b[0] !== 'person');
    const conflict = all.filter((b) => b[0] !== 'person' && iou(b, low) > 0.45).sort((a, b) => b[1] - a[1]);
    const others = all.filter((b) => !conflict.includes(b) && b[1] >= 0.6);
    REV = { conflict, others, keep: conflict[0] };
    return REV;
  }

  const MONO = '"SFMono-Regular", ui-monospace, Menlo, Consolas, monospace';
  function tagBox(c, x, y, w, h, col, label, o = {}) {
    c.save();
    c.shadowColor = col; c.shadowBlur = 12;
    c.strokeStyle = col; c.lineWidth = o.lw || 2;
    if (o.dash) c.setLineDash([6, 4]);
    c.strokeRect(x, y, w, h);
    c.restore();
    c.strokeStyle = col; c.lineWidth = 2.5; const k = Math.min(10, w / 4, h / 4);
    [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(([px, py, sx, sy]) => { c.beginPath(); c.moveTo(px + sx * k, py); c.lineTo(px, py); c.lineTo(px, py + sy * k); c.stroke(); });
    if (label) {
      c.font = `600 11px ${MONO}`;
      const tw = c.measureText(label).width + 12;
      c.fillStyle = col; c.fillRect(x - 1, y - 20, tw, 19);
      c.fillStyle = '#0f0e0d'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(label, x + 5, y - 10);
    }
  }

  function drawOverlay(t, cam) {
    const c = octx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, Hh);
    // scan beam: a vertical light plane crossing the wall
    if (t > TM.scanA - 0.2 && t < TM.scanB + 0.3) {
      const p = clamp((t - TM.scanA) / (TM.scanB - TM.scanA));
      const x = lerp(-(COLS - 1) / 2 * PITCH_X, (COLS - 1) / 2 * PITCH_X, p);
      const top = project(cam.vp, [x, ROWS / 2 * PITCH_Y + 1.2, 0.2]);
      const bot = project(cam.vp, [x, -ROWS / 2 * PITCH_Y - 1.2, 0.2]);
      const a = Math.min(win(t, TM.scanA - 0.2, TM.scanA + 0.2), 1 - win(t, TM.scanB, TM.scanB + 0.3));
      c.globalAlpha = a;
      const g = c.createLinearGradient(top[0] - 70, 0, top[0], 0);
      g.addColorStop(0, 'rgba(217,119,87,0)'); g.addColorStop(1, 'rgba(217,119,87,.24)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(top[0] - 70, top[1]); c.lineTo(top[0], top[1]); c.lineTo(bot[0], bot[1]); c.lineTo(bot[0] - 70, bot[1]); c.closePath(); c.fill();
      c.save(); c.shadowColor = '#d97757'; c.shadowBlur = 18; c.strokeStyle = '#ffe2d2'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(top[0], top[1]); c.lineTo(bot[0], bot[1]); c.stroke(); c.restore();
      c.font = `600 11px ${MONO}`; c.fillStyle = '#ffe2d2'; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText('blur · dedupe', top[0] + 8, top[1] + 12);
      c.globalAlpha = 1;
    }
    // v3 cube: a glowing frame around the lattice once it has formed
    const wf = win(t, TM.cube + 1.6, TM.cube + 2.6);
    if (wf > 0) {
      const ang = (t - TM.cube) * 0.32, e = 6 * 1.3 + 0.7;
      const ca = Math.cos(ang), sa = Math.sin(ang), cx = Math.cos(0.42), sx = Math.sin(0.42);
      const xf = (v) => { const y1 = v[1] * cx - v[2] * sx, z1 = v[1] * sx + v[2] * cx; return [v[0] * ca + z1 * sa, y1, -v[0] * sa + z1 * ca]; };
      const P = [];
      for (let k = 0; k < 8; k++) P.push(project(cam.vp, xf([k & 1 ? e : -e, k & 2 ? e : -e, k & 4 ? e : -e])));
      const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
      c.save(); c.globalAlpha = wf * 0.9; c.strokeStyle = '#a8dc9a'; c.lineWidth = 1.2; c.shadowColor = '#8fd18a'; c.shadowBlur = 14;
      c.beginPath(); E.forEach(([a, b2]) => { const q = easeOut(wf); c.moveTo(P[a][0], P[a][1]); c.lineTo(lerp(P[a][0], P[b2][0], q), lerp(P[a][1], P[b2][1], q)); }); c.stroke();
      c.fillStyle = '#a8dc9a'; P.forEach((q) => { c.beginPath(); c.arc(q[0], q[1], 2.2, 0, Math.PI * 2); c.fill(); });
      const top = P.reduce((a, q) => (q[1] < a[1] ? q : a));
      c.shadowBlur = 0; c.font = `700 12px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillStyle = '#e3f2d6';
      c.fillText(`v3 · ${fmt(KEPT)} ${L('帧', 'frames')}`, top[0], top[1] - 10);
      c.restore();
    }
    // review close-up: the frame leaves its slot, is corrected, and goes back
    if (t > TM.featA && t < TM.featB) {
      const fi = featIn(t), fo = featOut(t);
      const sp = slotPos(FEAT_SLOT);
      const tl = project(cam.vp, [sp[0] - 0.5 * 1.75, sp[1] + 0.33 * 1.75, sp[2]]);
      const br = project(cam.vp, [sp[0] + 0.5 * 1.75, sp[1] - 0.33 * 1.75, sp[2]]);
      const compact = W < 640;
      const tw = compact ? W * 0.86 : Math.min(W * 0.46, Hh * 0.9);
      const th = tw * (FR.cell[1] / FR.cell[0]);
      const tx = compact ? (W - tw) / 2 : W * 0.55 - tw / 2, ty = compact ? Hh * 0.3 : (Hh - th) / 2 + 10;
      const p = fi * (1 - fo);
      const x = lerp(tl[0], tx, p), y = lerp(tl[1], ty, p), w = lerp(br[0] - tl[0], tw, p), h = lerp(br[1] - tl[1], th, p);
      c.globalAlpha = 0.55 * p; c.fillStyle = '#0d0c0b'; c.fillRect(0, 0, W, Hh); c.globalAlpha = 1;
      c.save();
      c.shadowColor = 'rgba(255,170,60,.45)'; c.shadowBlur = 40 * p;
      c.drawImage(featImg, x, y, w, h);
      c.restore();
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (p > 0.95) {
        const R2 = reviewCase();
        R2.others.forEach((o) => tagBox(c, x + o[2] * w, y + o[3] * h, o[4] * w, o[5] * h, '#8cbcf5', null, { lw: 1.2 }));
        // 1) three overlapping guesses on one van  2) duplicates removed  3) box tightened  4) class set to van
        const merge = easeInOut(win(t, 24.5, 25.0));
        const fit = easeInOut(win(t, 25.0, 25.5));
        const relabel = t >= 26.0, ok = t >= TM.green;
        const k = R2.keep;
        const cf = R2.conflict;
        const lx0 = Math.min(...cf.map((q) => q[2])), ly0 = Math.min(...cf.map((q) => q[3]));
        const lx1 = Math.max(...cf.map((q) => q[2] + q[4])), ly1 = Math.max(...cf.map((q) => q[3] + q[5]));
        const bx = { x: lerp(lx0, k[2], fit), y: lerp(ly0, k[3], fit), w: lerp(lx1 - lx0, k[4], fit), h: lerp(ly1 - ly0, k[5], fit) };
        R2.conflict.slice(1).forEach((o, i) => {
          if (merge >= 1) return;
          c.globalAlpha = 1 - merge;
          const lx = x + o[2] * w, ly = y + o[3] * h;
          tagBox(c, lx, ly, o[4] * w, o[5] * h, '#ffaa33', null, { dash: true, lw: 1.6 });
          c.font = `600 11px ${MONO}`; c.textAlign = 'left'; c.textBaseline = 'middle';
          const s2 = `${o[0]} ${o[1].toFixed(2)}`, tw2 = c.measureText(s2).width + 12;
          const ty2 = ly + o[5] * h + 4 + i * 21;
          c.fillStyle = 'rgba(255,170,51,.9)'; c.fillRect(lx - 1, ty2, tw2, 19);
          c.fillStyle = '#140d02'; c.fillText(s2, lx + 5, ty2 + 10);
          c.globalAlpha = 1;
        });
        const col = ok ? '#8fd18a' : '#ffaa33';
        tagBox(c, x + bx.x * w, y + bx.y * h, bx.w * w, bx.h * h, col, ok ? L('van ✓ 已复核', 'van ✓ reviewed') : relabel ? 'van' : `${k[0]} ${k[1].toFixed(2)}`, { lw: 2.5 });
        const b = bx;
        c.font = `600 12px ${MONO}`; c.textBaseline = 'middle'; c.fillStyle = '#f0eee6'; c.textAlign = 'left';
        c.fillText(merge < 1 ? L('复核 · 同一辆车 3 个冲突框', 'REVIEW · 3 conflicting boxes, one vehicle') : L('复核 · 合并为 1 个框', 'REVIEW · merged into one box'), x, y - 16);
        if (!compact) c.textAlign = 'right', c.fillStyle = '#a8a59c', c.fillText(L('模型类别里没有 van', 'the model has no "van" class'), x + w, y - 16);
        if (t > 25.5 && t < TM.green) {
          const px = x + (b.x + b.w) * w + 10, py = y + b.y * h;
          const items = ['car', 'truck', 'van'];
          c.globalAlpha = easeOut(win(t, 25.5, 25.7));
          c.fillStyle = 'rgba(30,27,24,.95)'; c.strokeStyle = 'rgba(255,255,255,.2)';
          c.fillRect(px, py, 96, 76); c.strokeRect(px + 0.5, py + 0.5, 96, 76);
          items.forEach((s, k) => {
            const on = (s === 'van' && relabel) || (s === k[0] && !relabel);
            if (on) { c.fillStyle = s === 'van' ? 'rgba(217,119,87,.4)' : 'rgba(255,255,255,.08)'; c.fillRect(px + 3, py + 3 + k * 23, 90, 23); }
            c.textAlign = 'left'; c.fillStyle = on ? '#fff' : '#a8a59c'; c.font = `500 12px ${MONO}`; c.fillText(s, px + 12, py + 15 + k * 23);
          });
          c.globalAlpha = 1;
        }
        const cin = win(t, 23.9, 24.2) * (1 - win(t, 26.6, 26.9));
        if (cin > 0) {
          const corner = [x + (b.x + b.w) * w, y + (b.y + b.h) * h];
          const dup = [x + R2.conflict[1][2] * w + 30, y + (R2.conflict[1][3] + R2.conflict[1][5]) * h + 14];
          let px = lerp(x + w * 0.92, dup[0], easeInOut(win(t, 24.0, 24.4)));
          let py = lerp(y + h * 0.98, dup[1], easeInOut(win(t, 24.0, 24.4)));
          if (t > 24.6) { const q = easeInOut(win(t, 24.6, 25.0)); px = lerp(dup[0], corner[0], q); py = lerp(dup[1], corner[1], q); }
          if (t > 25.5) { const q = easeInOut(win(t, 25.55, 25.95)); px = lerp(corner[0], x + (b.x + b.w) * w + 60, q); py = lerp(corner[1], y + b.y * h + 61, q); }
          c.globalAlpha = cin; c.save(); c.translate(px, py);
          c.fillStyle = '#fff'; c.strokeStyle = '#0f0e0d'; c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 16); c.lineTo(4.2, 11.6); c.lineTo(7.4, 18); c.lineTo(10, 17); c.lineTo(6.9, 10.6); c.lineTo(12.2, 10.6); c.closePath(); c.stroke(); c.fill();
          c.restore(); c.globalAlpha = 1;
        }
      }
    }
  }

  /* ---------------- HUD ---------------- */
  const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
  const stepEl = $('.hx-step');
  let lastLog = '';
  function renderHud(t) {
    let ci = 0; CH.forEach((ch, i) => { if (t >= ch.at) ci = i; });
    const ch = CH[ci];
    const n = String(ci + 1).padStart(2, '0');
    if (H.stepN.textContent !== n) { H.stepN.textContent = n; stepEl.classList.remove('is-new'); void stepEl.offsetWidth; stepEl.classList.add('is-new'); }
    const title = L(ch.zh, ch.en); if (H.stepT.textContent !== title) H.stepT.textContent = title;
    const sub = ch.sub(); if (H.stepS.textContent !== sub) H.stepS.textContent = sub;

    const dropped = Math.round((BLUR + DUP) * easeInOut(win(t, TM.scanA + 0.6, TM.scanB + 0.9)));
    H.frames.textContent = fmt(RAW - dropped);
    H.boxes.textContent = fmt(BOXES * easeInOut(win(t, TM.waveA, TM.waveB)));
    H.review.textContent = `${Math.floor(REVIEW * win(t, TM.featA, TM.featB))}/${REVIEW}`;
    H.ver.textContent = t >= 31.4 ? 'v3' : 'v2';
    film.classList.toggle('is-v3', t >= 31.4);
    film.classList.toggle('show-metrics', t >= 6.2);

    const full = PROMPT[lang()];
    const s = full.slice(0, Math.round(full.length * win(t, TYPE_A, TYPE_B)));
    if (H.typed.textContent !== s) H.typed.textContent = s;
    film.classList.toggle('is-typing', t < SEND);
    film.classList.toggle('is-docked', t >= SEND);
    film.classList.toggle('is-gone', t >= SEND + 1);

    H.approve.classList.toggle('is-in', t >= 6.6 && t < 8.9);
    H.approve.classList.toggle('is-ok', t >= 7.9);
    H.final.classList.toggle('is-in', t >= TM.final);
    H.fade.style.opacity = String(Math.max(1 - win(t, 0, 0.8), win(t, T - 0.9, T)));

    const lines = LOG.filter((l) => t >= l.at).slice(-4).map((l) => {
      const done = t >= l.end;
      const mark = done ? '✓' : SPIN[Math.floor(t * 12) % SPIN.length];
      return `<li class="${done ? 'ok' : 'run'}"><b>${mark}</b>${esc(l[lang()](done))}</li>`;
    }).join('');
    if (lines !== lastLog) { H.log.innerHTML = lines; lastLog = lines; }
  }

  /* ---------------- player ---------------- */
  let t = 0, playing = false, last = 0, raf = 0, visible = false, userPaused = false;
  function render() {
    if (ready) { const cam = camera(t, W / Hh); drawGL(t, cam); drawOverlay(t, cam); }
    renderHud(t);
    range.value = String(Math.round(t * 10));
    timeEl.textContent = `0:${String(Math.floor(t)).padStart(2, '0')} / 0:${String(T).padStart(2, '0')}`;
    let cur = 0; CH.forEach((ch, i) => { if (t >= ch.at) cur = i; });
    chaptersEl.querySelectorAll('button').forEach((b, i) => { b.classList.toggle('is-on', i === cur); b.classList.toggle('is-past', i < cur); });
  }
  function frame(now) {
    raf = 0;
    if (!playing) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    t += dt; if (t >= T) t = 0;
    render();
    raf = requestAnimationFrame(frame);
  }
  function setPlaying(on) {
    playing = on;
    film.classList.toggle('is-playing', on);
    playBtn.setAttribute('aria-pressed', String(on));
    if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  function play() { userPaused = false; if (visible && ready) setPlaying(true); }
  function pause() { userPaused = true; setPlaying(false); }
  function seek(v) { t = clamp(v, 0, T - 0.01); render(); }

  playBtn.addEventListener('click', () => (playing ? pause() : play()));
  range.max = String(T * 10);
  range.addEventListener('input', () => seek(+range.value / 10));
  chaptersEl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { seek(CH[+b.dataset.ch].at + 0.01); play(); }));
  new MutationObserver(() => { lastLog = ''; render(); }).observe(root, { attributes: true, attributeFilter: ['data-lang'] });
  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { resize(); render(); }); });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setPlaying(false); film.classList.add('no-webgl'); });

  resize();
  const loadImg = (src) => new Promise((ok, no) => { const im = new Image(); im.decoding = 'async'; im.onload = () => ok(im); im.onerror = no; im.src = src; });
  Promise.all([fetch(BASE + 'frames.json').then((r) => r.json()), loadImg(BASE + 'atlas.jpg'), loadImg(BASE + 'feature.jpg')]).then(([fr, atlas, feat]) => {
    FR = fr; featImg = feat;
    const a = buildAtlases(atlas);
    tex(0, atlas); tex(1, a.blur); tex(2, a.box);
    ready = true;
    film.classList.add('is-ready');
    if (reduced()) { userPaused = true; seek(35); } else seek(t);
    if (visible && !userPaused) setPlaying(true);
  }).catch((e) => { console.error(e); film.classList.add('no-webgl'); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        visible = e.isIntersecting;
        if (!visible) setPlaying(false);
        else if (!userPaused && ready) setPlaying(true);
      });
    }, { threshold: 0.3 }).observe(film);
  } else { visible = true; }
  film.harness = { seek, pause, play };
})();
