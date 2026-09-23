/*
 * A small, dependency-free WebGL LiDAR scene.
 * 1. Build a street out of boxes and spheres (seeded, so every visit looks the same).
 * 2. Cast rays from a virtual 64-beam spinning LiDAR and keep the first hit of each ray.
 * 3. Render the hits as points with a rotating sweep, plus a 3D annotation cuboid.
 */
(() => {
  'use strict';

  const figure = document.getElementById('scan');
  const canvas = document.getElementById('scan-canvas');
  if (!figure || !canvas) return;
  const label = document.getElementById('scan-label');
  const fpsEl = document.getElementById('scan-fps');
  const ptsEl = document.getElementById('scan-points');
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => Boolean(motionQuery && motionQuery.matches);

  const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) { figure.classList.add('no-webgl'); return; }

  /* ---------------- scene ---------------- */
  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(20250919);
  const GROUND = -1.73;
  const KIND = { ground: 0, building: 1, car: 2, tree: 3, pole: 4, target: 5 };
  const boxes = [];
  const spheres = [];
  const box = (x0, y0, z0, x1, y1, z1, kind) => boxes.push({ min: [x0, y0, z0], max: [x1, y1, z1], kind });

  // Building blocks on both sides of the street, with gaps for side streets.
  for (const side of [-1, 1]) {
    let x = -64;
    while (x < 64) {
      const len = 8 + rand() * 14;
      if (Math.abs(x + len / 2) > 6 || side > 0) {
        const depth = 8 + rand() * 6;
        const near = 12.5 + rand() * 2.5;
        const h = 6 + rand() * 16;
        if (side < 0) box(x, -near - depth, GROUND, x + len, -near, GROUND + h, KIND.building);
        else box(x, near, GROUND, x + len, near + depth, GROUND + h, KIND.building);
      }
      x += len + (rand() < 0.25 ? 6 + rand() * 4 : 0.6);
    }
  }
  // Cars: [x, y, yaw-free]. The first one is the annotated target.
  const cars = [[9.5, -2.7], [-10, 2.9], [19, 3.1], [-21, -3.0], [31, -2.6], [-34, 5.6], [-27, 5.6], [24, -5.6], [42, 5.5], [-46, -5.5]];
  const car = { l: 4.5, w: 1.9, h: 1.5 };
  cars.forEach(([cx, cy], i) => {
    const kind = i === 0 ? KIND.target : KIND.car;
    box(cx - car.l / 2, cy - car.w / 2, GROUND + 0.22, cx + car.l / 2, cy + car.w / 2, GROUND + 0.9, kind);
    box(cx - car.l / 2 + 0.9, cy - car.w / 2 + 0.08, GROUND + 0.9, cx + car.l / 2 - 1.1, cy + car.w / 2 - 0.08, GROUND + car.h, kind);
  });
  // Poles, trees and pedestrians along the sidewalks.
  for (let x = -60; x <= 60; x += 15) {
    for (const side of [-1, 1]) {
      const px = x + (side > 0 ? 7 : 0);
      box(px - 0.12, side * 8.2 - 0.12, GROUND, px + 0.12, side * 8.2 + 0.12, GROUND + 7, KIND.pole);
      const tx = px + 5;
      box(tx - 0.2, side * 9.8 - 0.2, GROUND, tx + 0.2, side * 9.8 + 0.2, GROUND + 2.6, KIND.tree);
      spheres.push({ c: [tx, side * 9.8, GROUND + 4.1], r: 1.7 + rand() * 0.8, kind: KIND.tree });
    }
  }
  [[4, 8.9], [5.2, 9.3], [-6, -9.1], [14, -8.8], [-15, 9.0]].forEach(([x, y]) => box(x - 0.25, y - 0.25, GROUND, x + 0.25, y + 0.25, GROUND + 1.72, KIND.pole));

  function hitBox(o, d, b, tMax) {
    let t0 = 0.3, t1 = tMax;
    for (let a = 0; a < 3; a += 1) {
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < b.min[a] || o[a] > b.max[a]) return -1; continue; }
      const inv = 1 / d[a];
      let n = (b.min[a] - o[a]) * inv, f = (b.max[a] - o[a]) * inv;
      if (n > f) { const s = n; n = f; f = s; }
      if (n > t0) t0 = n;
      if (f < t1) t1 = f;
      if (t0 > t1) return -1;
    }
    return t0;
  }
  function hitSphere(o, d, s, tMax) {
    const ox = o[0] - s.c[0], oy = o[1] - s.c[1], oz = o[2] - s.c[2];
    const b = ox * d[0] + oy * d[1] + oz * d[2];
    const c = ox * ox + oy * oy + oz * oz - s.r * s.r;
    const disc = b * b - c;
    if (disc < 0) return -1;
    const t = -b - Math.sqrt(disc);
    return t > 0.3 && t < tMax ? t : -1;
  }

  function scan(beams, steps) {
    const origin = [0, 0, 0];
    const maxRange = 72;
    const out = [];
    const elev = [];
    for (let i = 0; i < beams; i += 1) {
      const u = i / (beams - 1);
      elev.push((-25 + 40 * Math.pow(u, 0.9)) * Math.PI / 180);
    }
    for (let s = 0; s < steps; s += 1) {
      const az = (s / steps) * Math.PI * 2;
      const ca = Math.cos(az), sa = Math.sin(az);
      for (let bIdx = 0; bIdx < beams; bIdx += 1) {
        const e = elev[bIdx] + (rand() - 0.5) * 0.0015;
        const ce = Math.cos(e);
        const d = [ca * ce, sa * ce, Math.sin(e)];
        let best = maxRange, kind = -1;
        if (d[2] < 0) {
          const t = GROUND / d[2];
          if (t < best) { best = t; kind = KIND.ground; }
        }
        for (let k = 0; k < boxes.length; k += 1) {
          const t = hitBox(origin, d, boxes[k], best);
          if (t > 0 && t < best) { best = t; kind = boxes[k].kind; }
        }
        for (let k = 0; k < spheres.length; k += 1) {
          const t = hitSphere(origin, d, spheres[k], best);
          if (t > 0 && t < best) { best = t; kind = spheres[k].kind; }
        }
        if (kind < 0) continue;
        if (kind === KIND.tree && rand() < 0.35) continue; // foliage lets some beams through
        const noise = 1 + (rand() - 0.5) * 0.006;
        const x = d[0] * best * noise, y = d[1] * best * noise;
        let z = d[2] * best * noise;
        if (kind === KIND.ground) z += Math.sin(x * 0.21) * 0.03 + Math.cos(y * 0.37) * 0.03;
        out.push(x, y, z, kind);
      }
    }
    return new Float32Array(out);
  }

  const small = Math.min(window.innerWidth, window.innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4;
  const points = scan(small ? 48 : 64, small ? 900 : 1500);
  const count = points.length / 4;
  if (ptsEl) ptsEl.textContent = count.toLocaleString('en-US');

  /* ---------------- GL programs ---------------- */
  const pointVS = `
    attribute vec4 aPoint;
    uniform mat4 uMVP;
    uniform vec3 uEye;
    uniform float uSweep, uSize, uDpr;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec3 p = aPoint.xyz;
      float kind = aPoint.w;
      gl_Position = uMVP * vec4(p, 1.0);
      float dist = length(p - uEye);
      float h = clamp((p.z + 1.8) / 16.0, 0.0, 1.0);
      vec3 low = vec3(0.16, 0.36, 0.72);
      vec3 mid = vec3(0.30, 0.78, 0.98);
      vec3 high = vec3(0.86, 0.95, 1.0);
      vec3 c = mix(low, mid, smoothstep(0.0, 0.35, h));
      c = mix(c, high, smoothstep(0.45, 1.0, h));
      if (kind < 0.5) c = mix(vec3(0.20, 0.30, 0.42), vec3(0.33, 0.55, 0.78), clamp(1.0 - length(p.xy) / 60.0, 0.0, 1.0));
      else if (kind > 1.5 && kind < 2.5) c = vec3(0.55, 0.86, 1.0);
      else if (kind > 2.5 && kind < 3.5) c = vec3(0.36, 0.84, 0.66);
      else if (kind > 4.5) c = vec3(1.0, 0.72, 0.30);
      float az = atan(p.y, p.x);
      float lag = mod(uSweep - az, 6.2831853);
      float glow = exp(-lag * 1.35);
      float range = clamp(1.15 - length(p.xy) / 80.0, 0.35, 1.0);
      vColor = c * (0.52 + 0.95 * glow) * range + vec3(0.25, 0.35, 0.4) * glow * 0.35;
      vAlpha = (kind < 0.5 ? 0.62 : 0.92) * range;
      gl_PointSize = uSize * uDpr * clamp(22.0 / dist, 0.55, 2.4) * (kind > 4.5 ? 1.25 : 1.0);
    }`;
  const pointFS = `
    precision mediump float;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec2 q = gl_PointCoord * 2.0 - 1.0;
      float r = dot(q, q);
      if (r > 1.0) discard;
      gl_FragColor = vec4(vColor, vAlpha * (1.0 - r * 0.55));
    }`;
  const lineVS = `
    attribute vec3 aPos;
    uniform mat4 uMVP;
    void main() { gl_Position = uMVP * vec4(aPos, 1.0); }`;
  const lineFS = `
    precision mediump float;
    uniform vec4 uColor;
    void main() { gl_FragColor = uColor; }`;

  function program(vs, fs) {
    const make = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  let pointProg, lineProg;
  try {
    pointProg = program(pointVS, pointFS);
    lineProg = program(lineVS, lineFS);
  } catch (err) {
    figure.classList.add('no-webgl');
    return;
  }
  const pointBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf);
  gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);

  // Annotation cuboid around the target car, a heading tick, and the ego vehicle outline.
  const [tx, ty] = cars[0];
  const cub = { x0: tx - car.l / 2 - 0.12, x1: tx + car.l / 2 + 0.12, y0: ty - car.w / 2 - 0.1, y1: ty + car.w / 2 + 0.1, z0: GROUND + 0.02, z1: GROUND + car.h + 0.12 };
  const edges = (b) => {
    const c = [
      [b.x0, b.y0, b.z0], [b.x1, b.y0, b.z0], [b.x1, b.y1, b.z0], [b.x0, b.y1, b.z0],
      [b.x0, b.y0, b.z1], [b.x1, b.y0, b.z1], [b.x1, b.y1, b.z1], [b.x0, b.y1, b.z1]
    ];
    const idx = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
    return idx.flatMap((i) => c[i]);
  };
  const cubLines = edges(cub).concat([cub.x1, (cub.y0 + cub.y1) / 2, cub.z1, cub.x1 + 1.1, (cub.y0 + cub.y1) / 2, cub.z1]);
  const egoLines = edges({ x0: -2.3, x1: 2.3, y0: -0.95, y1: 0.95, z0: GROUND + 0.2, z1: -0.25 });
  const ring = [];
  for (let i = 0; i < 96; i += 1) {
    const a0 = (i / 96) * Math.PI * 2, a1 = ((i + 1) / 96) * Math.PI * 2;
    ring.push(Math.cos(a0) * 6, Math.sin(a0) * 6, GROUND, Math.cos(a1) * 6, Math.sin(a1) * 6, GROUND);
  }
  const lineBufs = [
    { data: new Float32Array(cubLines), color: [1, 0.71, 0.28, 1] },
    { data: new Float32Array(egoLines), color: [0.9, 0.95, 1, 0.45] },
    { data: new Float32Array(ring), color: [0.37, 0.83, 1, 0.18] }
  ].map((l) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, l.data, gl.STATIC_DRAW);
    return { buf: b, n: l.data.length / 3, color: l.color };
  });

  const loc = {
    aPoint: gl.getAttribLocation(pointProg, 'aPoint'),
    uMVP: gl.getUniformLocation(pointProg, 'uMVP'),
    uEye: gl.getUniformLocation(pointProg, 'uEye'),
    uSweep: gl.getUniformLocation(pointProg, 'uSweep'),
    uSize: gl.getUniformLocation(pointProg, 'uSize'),
    uDpr: gl.getUniformLocation(pointProg, 'uDpr'),
    aPos: gl.getAttribLocation(lineProg, 'aPos'),
    uMVPl: gl.getUniformLocation(lineProg, 'uMVP'),
    uColor: gl.getUniformLocation(lineProg, 'uColor')
  };

  /* ---------------- math ---------------- */
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function lookAt(eye, target, up) {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let len = Math.hypot(zx, zy, zz); zx /= len; zy /= len; zz /= len;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz); xx /= len; xy /= len; xz /= len;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1];
  }
  function multiply(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function project(m, p, w, h) {
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const ww = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (ww <= 0) return null;
    return [(x / ww * 0.5 + 0.5) * w, (1 - (y / ww * 0.5 + 0.5)) * h];
  }

  /* ---------------- camera & input ---------------- */
  const cam = { az: -2.35, el: 0.58, dist: 36 };
  let dragging = false, lastX = 0, lastY = 0, idleUntil = 0, dpr = 1, width = 1, height = 1;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    cam.az -= (e.clientX - lastX) * 0.006;
    cam.el = Math.max(0.16, Math.min(1.25, cam.el + (e.clientY - lastY) * 0.004));
    lastX = e.clientX; lastY = e.clientY;
    idleUntil = performance.now() + 2600;
    if (!running) draw(performance.now());
  });
  const endDrag = () => { dragging = false; idleUntil = performance.now() + 2600; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, small ? 1.75 : 2);
    width = Math.max(1, Math.round(rect.width * dpr));
    height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const aspect = width / height;
    cam.dist = aspect < 1.05 ? 44 : 36;
    if (!running) draw(performance.now());
  }

  /* ---------------- render loop ---------------- */
  let running = false, raf = 0, last = 0, sweep = 0.4, frames = 0, fpsStart = 0;
  function draw(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (running && !reduced()) {
      sweep = (sweep + dt * 2.2) % (Math.PI * 2);
      if (!dragging && now > idleUntil) cam.az += dt * 0.085;
    }
    const target = [2, 0, -0.6];
    const eye = [target[0] + Math.cos(cam.az) * Math.cos(cam.el) * cam.dist, target[1] + Math.sin(cam.az) * Math.cos(cam.el) * cam.dist, target[2] + Math.sin(cam.el) * cam.dist];
    const proj = perspective(0.78, width / height, 0.5, 400);
    const mvp = multiply(proj, lookAt(eye, target, [0, 0, 1]));

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    gl.useProgram(lineProg);
    gl.uniformMatrix4fv(loc.uMVPl, false, mvp);
    gl.enableVertexAttribArray(loc.aPos);
    lineBufs.slice(1).forEach((l) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, l.buf);
      gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.uniform4fv(loc.uColor, l.color);
      gl.drawArrays(gl.LINES, 0, l.n);
    });
    gl.disableVertexAttribArray(loc.aPos);

    gl.useProgram(pointProg);
    gl.uniformMatrix4fv(loc.uMVP, false, mvp);
    gl.uniform3fv(loc.uEye, eye);
    gl.uniform1f(loc.uSweep, sweep);
    gl.uniform1f(loc.uSize, small ? 2.1 : 1.9);
    gl.uniform1f(loc.uDpr, dpr);
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf);
    gl.enableVertexAttribArray(loc.aPoint);
    gl.vertexAttribPointer(loc.aPoint, 4, gl.FLOAT, false, 0, 0);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.disableVertexAttribArray(loc.aPoint);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(lineProg);
    gl.enableVertexAttribArray(loc.aPos);
    const cube = lineBufs[0];
    gl.bindBuffer(gl.ARRAY_BUFFER, cube.buf);
    gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(loc.uColor, cube.color);
    gl.drawArrays(gl.LINES, 0, cube.n);
    gl.disableVertexAttribArray(loc.aPos);

    if (label) {
      const cssW = width / dpr, cssH = height / dpr;
      const anchor = project(mvp, [(cub.x0 + cub.x1) / 2, (cub.y0 + cub.y1) / 2, cub.z1 + 0.25], cssW, cssH);
      if (anchor && anchor[0] > 40 && anchor[0] < cssW - 40 && anchor[1] > 40 && anchor[1] < cssH - 60) {
        label.style.transform = `translate(${anchor[0].toFixed(1)}px, ${anchor[1].toFixed(1)}px) translate(-50%, -100%)`;
        label.classList.add('is-on');
      } else label.classList.remove('is-on');
    }

    if (running) {
      frames += 1;
      if (!fpsStart) fpsStart = now;
      if (now - fpsStart >= 1000) {
        if (fpsEl) fpsEl.textContent = String(Math.round((frames * 1000) / (now - fpsStart)));
        frames = 0; fpsStart = now;
      }
    }
  }
  function loop(now) {
    if (!running) return;
    draw(now);
    raf = requestAnimationFrame(loop);
  }
  function start() {
    if (running || reduced()) { draw(performance.now()); return; }
    running = true; last = 0; frames = 0; fpsStart = 0;
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    if (fpsEl) fpsEl.textContent = reduced() ? '—' : fpsEl.textContent;
  }

  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible && !document.hidden) start(); else stop();
    }, { threshold: 0.05 }).observe(figure);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (visible) start(); });
  if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', () => { stop(); start(); });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); figure.classList.add('no-webgl'); });

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);
  resize();
  start();
})();
