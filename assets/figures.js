/*
 * Case-file figures. Hand-written Canvas 2D, no libraries.
 * Every figure is a pure function of time t (ms): draw(ctx, w, h, t). That makes it
 * replayable, seekable by chapter, and cheap to render as a single final frame when
 * the reader prefers reduced motion. Numbers come from the measured records cited
 * in each figure's note; shapes and proportions that are only illustrative say so.
 */
(() => {
  'use strict';

  const root = document.documentElement;
  const lang = () => (root.dataset.lang === 'en' ? 'en' : 'zh');
  const L = (zh, en) => (lang() === 'zh' ? zh : en);
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => Boolean(motionQuery && motionQuery.matches);

  /* ---------------- palette & helpers (mirrors site.css) ---------------- */
  const C = {
    paper: '#f7f7f2', line: '#d6d7d1', line2: '#e4e5df', ink: '#17191c', muted: '#5d6168', quiet: '#6a7078', faint: '#a3a8ae',
    blue: '#2255ee', blueSoft: '#e6ecfd', blueMid: '#9db4f6', green: '#16734b', greenSoft: '#e2f2ea', greenMid: '#7cc4a0',
    amber: '#e39a2d', amberSoft: '#fbf0db', amberInk: '#8a5a00', red: '#b3362f', redSoft: '#f8e4e2'
  };
  const MONO = '"SFMono-Regular", ui-monospace, Menlo, Consolas, "Liberation Mono", monospace';
  const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, p) => a + (b - a) * p;
  const win = (t, a, b) => clamp((t - a) / (b - a));
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, p) => { const A = rgb(a); const B = rgb(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], p))).join(',')})`; };
  const alpha = (h, a) => `rgba(${rgb(h).join(',')},${a})`;
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rr(ctx, x, y, w, h, r) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q);
    ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
  }
  function text(ctx, s, x, y, o = {}) {
    ctx.font = `${o.weight || 400} ${o.size || 11}px ${o.font || MONO}`;
    ctx.fillStyle = o.color || C.quiet;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.base || 'alphabetic';
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.fillText(s, x, y);
    if (o.alpha != null) ctx.globalAlpha = 1;
    return ctx.measureText(s).width;
  }
  function chip(ctx, s, x, y, fg, bg, o = {}) {
    ctx.font = `600 ${o.size || 10.5}px ${MONO}`;
    const w = ctx.measureText(s).width + 12;
    const h = (o.size || 10.5) + 9;
    const x0 = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.fillStyle = bg; rr(ctx, x0, y - h / 2, w, h, 3); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(s, x0 + 6, y + 0.5);
    ctx.globalAlpha = 1;
    return w;
  }
  function tick(ctx, cx, cy, s, color, lw = 1.6) {
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy); ctx.lineTo(cx - s * 0.12, cy + s * 0.38); ctx.lineTo(cx + s * 0.55, cy - s * 0.42); ctx.stroke();
  }
  function cross(ctx, cx, cy, s, color, lw = 1.8) {
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s); ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s); ctx.stroke();
  }
  function hatch(ctx, x, y, w, h, color, gap = 4) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
    for (let k = -h; k < w; k += gap) { ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y); }
    ctx.stroke(); ctx.restore();
  }

  /* ---------------- mount: canvas, clock, chapters ---------------- */
  const langHooks = [];
  new MutationObserver(() => langHooks.forEach((fn) => fn())).observe(root, { attributes: true, attributeFilter: ['data-lang'] });

  function mount(el, spec) {
    const stage = el.querySelector('.fig-stage');
    const canvas = stage && stage.querySelector('canvas');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const say = el.querySelector('.fig-say');
    const replay = el.querySelector('.fig-replay');
    let w = 0; let h = 0; let dpr = 1;
    let t = 0; let playing = false; let started = false; let visible = false; let raf = 0; let last = 0;
    const api = { pointer: null };

    // Chapter strip: a progress line plus one button per chapter.
    let buttons = []; let bar = null;
    const chapters = spec.chapters || [];
    if (chapters.length) {
      const foot = document.createElement('div');
      foot.className = 'fig-foot';
      foot.innerHTML = '<div class="fig-progress" aria-hidden="true"><i></i></div><ol class="fig-chapters"></ol>';
      bar = foot.querySelector('.fig-progress i');
      const list = foot.querySelector('.fig-chapters');
      chapters.forEach((c, i) => {
        const li = document.createElement('li');
        li.style.flexGrow = String(((chapters[i + 1] ? chapters[i + 1].at : spec.duration) - c.at) / 1000);
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = `<span class="mono">${String(i + 1).padStart(2, '0')}</span><span class="zh">${c.zh}</span><span class="en">${c.en}</span>`;
        b.addEventListener('click', () => seek(i));
        li.appendChild(b); list.appendChild(li); buttons.push(b);
        const edge = document.createElement('span');
        edge.className = 'fig-tick';
        edge.style.left = `${(c.at / spec.duration) * 100}%`;
        foot.querySelector('.fig-progress').appendChild(edge);
      });
      stage.after(foot);
      if (spec.footAfter) spec.footAfter.after(foot);
    }
    let lastChapter = -1;
    function syncChrome() {
      if (bar) bar.style.transform = `scaleX(${(t / spec.duration).toFixed(4)})`;
      let idx = 0;
      chapters.forEach((c, i) => { if (t >= c.at) idx = i; });
      if (idx !== lastChapter || syncChrome.force) {
        buttons.forEach((b, i) => { if (i === idx) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); b.classList.toggle('is-past', i < idx); });
        if (say && chapters[idx]) say.textContent = L(chapters[idx].sayZh, chapters[idx].sayEn);
        lastChapter = idx; syncChrome.force = false;
      }
    }
    function render() {
      if (!w || !h) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      spec.draw(ctx, w, h, t, api);
      if (spec.dom) spec.dom(t);
      syncChrome();
    }
    function frame(now) {
      raf = 0;
      if (!playing) return;
      t = Math.min(spec.duration, t + Math.min(64, now - last));
      last = now;
      render();
      if (t >= spec.duration) { playing = false; return; }
      if (visible) raf = requestAnimationFrame(frame);
    }
    function play(from) {
      started = true;
      if (reduced()) { t = spec.duration; playing = false; render(); return; }
      t = from; playing = true; last = performance.now();
      if (!raf) raf = requestAnimationFrame(frame);
    }
    function seek(i) {
      if (reduced()) {
        // Show the settled state at the end of that chapter.
        const end = i + 1 < chapters.length ? chapters[i + 1].at - 1 : spec.duration;
        started = true; t = end; render(); return;
      }
      play(chapters[i].at);
    }
    if (replay) replay.addEventListener('click', () => play(0));

    function resize() {
      const r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      render();
    }
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
    else window.addEventListener('resize', resize);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          visible = e.isIntersecting;
          if (!visible) return;
          resize();
          if (!started) play(0);
          else if (playing && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
        });
      }, { threshold: 0.35 }).observe(stage);
    } else { t = spec.duration; started = true; }
    if (reduced()) { t = spec.duration; started = true; }

    if (spec.hover) {
      const move = (e) => { const r = canvas.getBoundingClientRect(); api.pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; render(); };
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerleave', () => { api.pointer = null; render(); });
    }
    langHooks.push(() => { syncChrome.force = true; render(); });
    resize();
  }

  /* =====================================================================
   * FIG.A — MySQL queue: SKIP LOCKED claiming, a dead worker, idempotent reclaim.
   * ===================================================================== */
  function figQueue(el) {
    const N = 157; const B = 4; const T0 = 1300;
    const rand = mulberry32(20417);
    const chunks = [...Array(N)].map((_, i) => ({ i, files: i === N - 1 ? 41 : 64, appear: 80 + (i / N) * 700 + rand() * 90, runs: [] }));
    const ws = [1, 2, 3, 4, 5].map((id) => ({ id, free: id === 5 ? Infinity : T0 + (id - 1) * 120, on: true, spans: [] }));
    let next = 0; let orphan = null; let DIE = 0; let LEASE = 0;
    const work = () => 100 + rand() * 105;
    for (let guard = 0; guard < 4000; guard += 1) {
      let wk = null;
      ws.forEach((x) => { if (x.on && (!wk || x.free < wk.free)) wk = x; });
      if (!wk || wk.free === Infinity) break;
      const claim = wk.free;
      let batch; let reclaim = false;
      if (wk.id === 5 && orphan && !orphan.taken) { batch = orphan.list; orphan.taken = true; reclaim = true; }
      else if (next < N) { batch = []; while (batch.length < B && next < N) batch.push(next++); }
      else { wk.on = false; continue; }
      let cur = claim + 50; let died = false;
      // worker-3 dies inside the first batch it claims after ~3.9 s: two chunks done, the third half-way.
      const doomed = wk.id === 3 && !orphan && claim >= 3900 && batch.length === B;
      for (let k = 0; k < batch.length; k += 1) {
        const c = chunks[batch[k]];
        if (reclaim) {
          const prev = c.runs[0];
          if (prev.kind === 'run') { c.runs.push({ w: 5, claim, start: cur, end: cur + 90, kind: 'skip' }); cur += 90; continue; }
          const d = prev.start != null ? prev.d * (1 - prev.frac) + 30 : work();
          c.runs.push({ w: 5, claim, start: cur, end: cur + d, kind: 'run', from: prev.start != null ? prev.frac : 0 });
          wk.spans.push({ i: c.i, start: cur, end: cur + d }); cur += d;
          continue;
        }
        const d = work();
        if (doomed && k === 2) {
          DIE = cur + d * 0.6; LEASE = DIE + 1500;
          for (let j = k; j < batch.length; j += 1) {
            const cc = chunks[batch[j]]; const startedHere = j === k;
            cc.runs.push({ w: 3, claim, start: startedHere ? cur : null, d, frac: startedHere ? 0.6 : 0, kind: 'stall' });
          }
          wk.spans.push({ i: c.i, start: cur, end: DIE });
          orphan = { list: batch, taken: false };
          ws[4].free = LEASE; wk.on = false; died = true; break;
        }
        c.runs.push({ w: wk.id, claim, start: cur, end: cur + d, kind: 'run' });
        wk.spans.push({ i: c.i, start: cur, end: cur + d }); cur += d;
      }
      if (!died) wk.free = cur + 40;
    }
    let tDone = 0;
    chunks.forEach((c) => c.runs.forEach((r) => { if (r.end) tDone = Math.max(tDone, r.end); }));
    const tCommit = tDone + 260; const tReady = tCommit + 900; const duration = tReady + 500;
    const hits = orphan ? orphan.list.reduce((s, i) => { const r = chunks[i].runs[0]; return s + (r.kind === 'run' ? chunks[i].files : Math.round(r.frac * chunks[i].files)); }, 0) : 0;
    const k = orphan ? orphan.list.length : 0;

    function state(c, t) {
      if (t < c.appear) return null;
      const [r1, r2] = c.runs;
      if (!r1 || t < r1.claim) return { s: 'queued' };
      if (r1.kind === 'run') {
        if (t < r1.start) return { s: 'locked', w: r1.w };
        if (t < r1.end) return { s: 'run', p: (t - r1.start) / (r1.end - r1.start), w: r1.w };
        if (r2 && t >= r2.claim && t < r2.end + 420) return { s: 'skip', p: clamp((t - r2.claim) / (r2.end + 420 - r2.claim)) };
        return { s: 'done' };
      }
      if (t < DIE) {
        if (r1.start != null && t >= r1.start) return { s: 'run', p: (t - r1.start) / r1.d, w: 3 };
        return { s: 'locked', w: 3 };
      }
      if (!r2 || t < r2.claim) return { s: 'stall', p: r1.frac };
      if (t < r2.start) return { s: 'locked', w: 5 };
      if (t < r2.end) return { s: 'run', p: r2.from + (1 - r2.from) * (t - r2.start) / (r2.end - r2.start), w: 5 };
      return { s: 'done' };
    }
    const alive = (id, tau) => (id === 3 ? tau >= T0 - 400 && tau < DIE : id === 5 ? tau >= LEASE : tau >= T0 - 400);
    function beat(id, tau) {
      const x = ((tau - id * 131) % 620 + 620) % 620;
      if (x < 36) return -Math.sin((x / 36) * Math.PI);
      if (x < 64) return Math.sin(((x - 36) / 28) * Math.PI) * 0.35;
      return 0;
    }

    function draw(ctx, w, h, t) {
      const wide = w >= 640;
      const cols = wide ? 20 : 16; const rows = Math.ceil(N / cols);
      const G = wide ? { x: 18, y: 38, w: w * 0.56 - 18, h: h - 38 - 40 } : { x: 14, y: 32, w: w - 28, h: h * 0.52 - 40 };
      const P = wide ? { x: w * 0.62, y: 38, w: w * 0.38 - 18, h: h - 38 - 40 } : { x: 14, y: h * 0.52 + 22, w: w - 28, h: h * 0.48 - 22 - 36 };
      const cell = Math.min(G.w / cols, G.h / rows); const gap = Math.max(2, cell * 0.17); const s = cell - gap;
      const gx = G.x + (G.w - cell * cols) / 2 * (wide ? 0 : 1); const gy = G.y;
      text(ctx, L('chunk 表 · FOR UPDATE SKIP LOCKED', 'chunk table · FOR UPDATE SKIP LOCKED'), gx, G.y - 14, { size: 10.5 });
      text(ctx, L('Worker · Redis 心跳', 'Workers · Redis heartbeats'), P.x, P.y - 14, { size: 10.5 });

      const pos = (i) => ({ x: gx + (i % cols) * cell, y: gy + Math.floor(i / cols) * cell });
      const center = (i) => { const p = pos(i); return { x: p.x + s / 2, y: p.y + s / 2 }; };
      let done = 0; let locked = 0;
      const pulse = 0.55 + 0.45 * Math.sin(t / 140);
      chunks.forEach((c) => {
        const st = state(c, t);
        if (!st) return;
        const { x, y } = pos(c.i);
        const a = clamp((t - c.appear) / 220);
        ctx.globalAlpha = a;
        if (st.s === 'queued') { ctx.fillStyle = C.line2; rr(ctx, x, y, s, s, 2); ctx.fill(); }
        else if (st.s === 'locked') { locked += 1; ctx.fillStyle = '#fff'; rr(ctx, x, y, s, s, 2); ctx.fill(); ctx.strokeStyle = C.blue; ctx.lineWidth = 1.2; rr(ctx, x + 0.6, y + 0.6, s - 1.2, s - 1.2, 2); ctx.stroke(); }
        else if (st.s === 'run') {
          locked += 1;
          ctx.fillStyle = C.blueSoft; rr(ctx, x, y, s, s, 2); ctx.fill();
          ctx.save(); rr(ctx, x, y, s, s, 2); ctx.clip(); ctx.fillStyle = C.blue; ctx.fillRect(x, y + s * (1 - st.p), s, s * st.p); ctx.restore();
        } else if (st.s === 'stall') {
          locked += 1;
          ctx.fillStyle = C.amberSoft; rr(ctx, x, y, s, s, 2); ctx.fill();
          if (st.p) { ctx.save(); rr(ctx, x, y, s, s, 2); ctx.clip(); ctx.fillStyle = alpha(C.amber, 0.55); ctx.fillRect(x, y + s * (1 - st.p), s, s * st.p); ctx.restore(); }
          ctx.strokeStyle = alpha(C.amber, pulse); ctx.lineWidth = 1.6; rr(ctx, x + 0.8, y + 0.8, s - 1.6, s - 1.6, 2); ctx.stroke();
        } else if (st.s === 'skip') {
          done += 1;
          const g = Math.sin(st.p * Math.PI);
          ctx.fillStyle = mix(C.blue, C.greenSoft, g); rr(ctx, x, y, s, s, 2); ctx.fill();
          ctx.strokeStyle = alpha(C.green, g); ctx.lineWidth = 1.5; rr(ctx, x + 0.75, y + 0.75, s - 1.5, s - 1.5, 2); ctx.stroke();
          ctx.globalAlpha = a * g; tick(ctx, x + s / 2, y + s / 2, s * 0.55, C.green, 1.6);
        } else {
          done += 1;
          const col = c.i % cols; const row = Math.floor(c.i / cols);
          const wave = clamp((t - tCommit - (col + row) * 22) / 260);
          ctx.fillStyle = mix(C.blue, C.green, wave); rr(ctx, x, y, s, s, 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      });

      // Worker rows: label, a scrolling heartbeat trace, and the chunk in hand.
      const rowH = P.h / 5;
      const labelW = wide ? 68 : 64; const statusW = wide ? 92 : 98;
      ws.forEach((wk, j) => {
        const cy = P.y + rowH * (j + 0.5);
        const dead = wk.id === 3 && t >= DIE; const standby = wk.id === 5 && t < LEASE;
        const col = dead ? C.amberInk : standby ? C.faint : C.ink;
        text(ctx, `worker-${wk.id}`, P.x, cy + 4, { size: 11, color: col, weight: 500 });
        const tx = P.x + labelW; const tw = Math.max(40, P.w - labelW - statusW);
        ctx.strokeStyle = C.line2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tx, cy + 0.5); ctx.lineTo(tx + tw, cy + 0.5); ctx.stroke();
        ctx.beginPath();
        for (let px = 0; px <= tw; px += 1.5) {
          const tau = t - (1 - px / tw) * 2400;
          const v = alive(wk.id, tau) ? beat(wk.id, tau) : 0;
          const y = cy - v * rowH * 0.26;
          if (px === 0) ctx.moveTo(tx + px, y); else ctx.lineTo(tx + px, y);
        }
        ctx.strokeStyle = dead ? C.amber : standby ? C.faint : C.blue; ctx.lineWidth = 1.3; ctx.stroke();
        ctx.fillStyle = dead ? alpha(C.amber, pulse) : standby ? C.faint : C.blue;
        ctx.beginPath(); ctx.arc(tx + tw, cy, 2.6, 0, Math.PI * 2); ctx.fill();
        const span = wk.spans.find((sp) => t >= sp.start && t < sp.end);
        let status = ''; let sc = C.quiet;
        if (dead && t < LEASE) { status = L('心跳中断', 'no heartbeat'); sc = C.amberInk; }
        else if (dead) { status = L('已被接手', 'reclaimed'); sc = C.faint; }
        else if (standby) { status = L('待命', 'standby'); sc = C.faint; }
        else if (span) { status = `chunk #${String(span.i + 1).padStart(3, '0')}`; sc = C.ink; }
        else if (t >= T0) { status = L('空闲', 'idle'); }
        text(ctx, status, P.x + P.w, cy + 4, { size: 10.5, color: sc, align: 'right' });
        // Claim lines from the worker to the chunk it is holding.
        const anchor = wide ? { x: P.x - 8, y: cy } : { x: P.x + 30, y: cy - 10 };
        const targets = [];
        if (span && !dead) targets.push({ i: span.i, c: C.blue, dash: false });
        if (wk.id === 3 && t >= DIE && t < LEASE && orphan) orphan.list.forEach((i) => { if (chunks[i].runs[0].kind === 'stall') targets.push({ i, c: C.amber, dash: true }); });
        targets.forEach((tg) => {
          const p = center(tg.i);
          ctx.strokeStyle = alpha(tg.c, tg.dash ? 0.75 : 0.4); ctx.lineWidth = 1; ctx.setLineDash(tg.dash ? [3, 3] : []);
          ctx.beginPath(); ctx.moveTo(anchor.x, anchor.y);
          if (wide) ctx.bezierCurveTo(anchor.x - 60, anchor.y, p.x + 60, p.y, p.x + s / 2, p.y);
          else ctx.bezierCurveTo(anchor.x, anchor.y - 40, p.x, p.y + 40, p.x, p.y + s / 2);
          ctx.stroke(); ctx.setLineDash([]);
        });
      });

      const versions = t >= tCommit + 200 ? 1 : 0;
      const by = h - 16;
      const items = [
        [L('已完成', 'done'), `${done} / ${N}`, C.ink],
        [L('持锁', 'locked'), String(locked), locked ? C.blue : C.quiet],
        [L('数据集版本', 'dataset versions'), String(versions), versions ? C.green : C.quiet]
      ];
      let bx = wide ? 18 : 14;
      items.forEach(([k2, v, c2]) => { bx += text(ctx, `${k2} `, bx, by, { size: wide ? 10.5 : 9.5 }); bx += text(ctx, v, bx, by, { size: wide ? 11.5 : 10.5, color: c2, weight: 600 }) + (wide ? 18 : 10); });
      if (wide && t >= tReady) chip(ctx, 'READY', w - 18, by - 4, C.green, C.greenSoft, { align: 'right' });
    }

    // The five-stage rail and the log below the canvas follow the same clock.
    const rail = [...el.querySelectorAll('.machine-rail li')];
    const log = el.querySelector('.machine-log');
    const steps = [
      { at: 0, s: 0, zh: `submit  task#20417  files=10,025 → ${N} 个 chunk 入队，0.89 s 返回`, en: `submit  task#20417  files=10,025 → ${N} chunks queued, returned in 0.89 s` },
      { at: T0, s: 1, zh: 'claim   worker-1..4 并发领取，SKIP LOCKED 让彼此不等锁', en: 'claim   workers 1–4 claim concurrently; SKIP LOCKED means nobody waits on a lock' },
      { at: T0 + 900, s: 2, zh: 'build   产物写入 staging，逐个校验非空 / 类型 / SHA-256', en: 'build   artifacts to staging, each checked: non-empty / type / SHA-256' },
      { at: DIE, s: 3, fail: true, cls: 'warn', zh: `WARN    worker-3 心跳中断（Pod 重启），它锁住的 ${k} 个 chunk 停住`, en: `WARN    worker-3 heartbeat lost (pod restart); its ${k} locked chunks stall` },
      { at: LEASE, s: 3, cls: 'dim', zh: `reclaim 租约到期，worker-5 接手；幂等键 task+file 命中 ${hits} 个已提交文件，跳过`, en: `reclaim lease expired, worker-5 takes over; key task+file matched ${hits} committed files, skipped` },
      { at: tCommit, s: 4, zh: 'version LakeFS commit 一次，血缘事件闭合', en: 'version one LakeFS commit, lineage events closed' },
      { at: tReady, s: 5, cls: 'ok', zh: 'READY   产物可读 · 版本落账 · 血缘闭合 — 数据集版本数 = 1', en: 'READY   readable · versioned · lineage closed — dataset versions = 1' }
    ];
    let shown = -1; let shownLang = '';
    function dom(t) {
      const n = steps.filter((st) => t >= st.at).length;
      if (n === shown && lang() === shownLang) return;
      shown = n; shownLang = lang();
      if (log) {
        log.textContent = '';
        steps.slice(Math.max(0, n - 7), n).forEach((st) => {
          const span = document.createElement('span');
          if (st.cls) span.className = st.cls;
          span.textContent = `${L(st.zh, st.en)}\n`;
          log.appendChild(span);
        });
      }
      const cur = n ? steps[n - 1] : null;
      rail.forEach((li, i) => {
        const s = cur ? cur.s : -1;
        li.classList.toggle('done', i < s || (s === 5 && i === 5));
        li.classList.toggle('now', i === s && !(cur && cur.fail) && s !== 5);
        li.classList.toggle('fail', i === s && Boolean(cur && cur.fail));
        if (i === s) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      });
    }

    mount(el, {
      duration,
      draw,
      dom,
      footAfter: el.querySelector('.machine-log'),
      chapters: [
        { at: 0, zh: '提交', en: 'Submit', sayZh: '10,025 个文件切成 157 个 chunk 写进 MySQL，同一事务里记下任务状态，0.89 秒返回。', sayEn: '10,025 files become 157 chunk rows in MySQL, written in the same transaction as task state; the call returns in 0.89 s.' },
        { at: T0, zh: '并发领取', en: 'Claim', sayZh: '每个 Worker 用 FOR UPDATE SKIP LOCKED 领一批：被别人锁住的行直接跳过，谁也不等谁。', sayEn: 'Each worker claims a batch with FOR UPDATE SKIP LOCKED: rows locked by someone else are skipped, so nobody waits.' },
        { at: DIE, zh: 'Worker 中断', en: 'Worker dies', sayZh: 'worker-3 的 Pod 重启，Redis 心跳断了。它手里的 chunk 还锁着，要等租约到期。', sayEn: "worker-3's pod restarts and its Redis heartbeat stops. Its chunks stay locked until the lease runs out." },
        { at: LEASE, zh: '接手与幂等', en: 'Reclaim', sayZh: 'worker-5 接手整批。已经提交过的文件按 task + file 幂等键命中，直接跳过，不会重复产出。', sayEn: 'worker-5 takes over the batch. Files already committed hit the task + file idempotency key and are skipped, never produced twice.' },
        { at: tCommit, zh: '落账', en: 'Commit', sayZh: '全部产物校验通过后只做一次 LakeFS commit。READY 的条件是：产物可读、版本落账、血缘闭合。', sayEn: 'Once every artifact checks out, exactly one LakeFS commit. READY means readable, versioned and lineage-closed.' }
      ]
    });
  }

  /* =====================================================================
   * FIG.B — 310 presigned parts, a proxy that times out, and the completion guard.
   * ===================================================================== */
  function figUpload(el) {
    const PARTS = 310; const K = 6; const TOTAL = 237; const HOLE = 196;
    const rand = mulberry32(310);
    const slots = new Array(K).fill(0); const parts = [];
    for (let i = 0; i < PARTS; i += 1) {
      let m = 0; for (let j = 1; j < K; j += 1) if (slots[j] < slots[m]) m = j;
      const d = 1 + (rand() - 0.5) * 0.7; parts.push({ start: slots[m], end: slots[m] + d }); slots[m] += d;
    }
    const scale = TOTAL / Math.max(...slots);
    parts.forEach((p) => { p.start *= scale; p.end *= scale; });
    const A0 = 200; const A1 = 1500; const D0 = 2100; const D1 = 6900; const S0 = 7100; const S1 = 8100; const M0 = 8900; const M1 = 9900;
    const duration = 11000;
    const AXIS = 250;

    function draw(ctx, w, h, t) {
      const wide = w >= 640;
      const pad = wide ? 20 : 14;
      // Lanes: proxy vs direct, on one time axis.
      const labW = wide ? 132 : 62;
      const lx = pad + labW; const lw = w - pad - lx - (wide ? 40 : 18);
      const X = (sec) => lx + (sec / AXIS) * lw;
      const laneY = [pad + 22, pad + 54];
      const bh = 12;
      text(ctx, wide ? L('① 经后端代理', '① Via the proxy') : L('① 代理', '① Proxy'), pad, laneY[0] + 4, { size: wide ? 11 : 10, color: C.ink });
      text(ctx, wide ? L('③ 预签名直传', '③ Presigned direct') : L('③ 直传', '③ Direct'), pad, laneY[1] + 4, { size: wide ? 11 : 10, color: C.ink });
      [0, 60, 120, 180, 240].forEach((sec) => {
        ctx.strokeStyle = C.line2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(sec) + 0.5, laneY[0] - 12); ctx.lineTo(X(sec) + 0.5, laneY[1] + 12); ctx.stroke();
        text(ctx, `${sec} s`, X(sec), laneY[1] + 26, { size: 9.5, align: sec === 0 ? 'left' : 'center', color: C.faint });
      });
      [0, 1].forEach((j) => { ctx.fillStyle = C.line2; ctx.fillRect(lx, laneY[j] - bh / 2, lw, bh); });
      const proxyS = easeOut(win(t, A0, A1)) * 60;
      const cut = t >= A1;
      ctx.fillStyle = cut ? alpha(C.red, 0.28) : C.faint; ctx.fillRect(lx, laneY[0] - bh / 2, X(proxyS) - lx, bh);
      if (cut) {
        cross(ctx, X(60), laneY[0], 5, C.red, 2);
        text(ctx, wide ? L('网关 60 s 超时，连接被掐断', 'gateway timeout at 60 s, connection cut') : L('60 s 超时', '60 s timeout'), X(60) + 12, laneY[0] + 4, { size: 10.5, color: C.red, alpha: win(t, A1, A1 + 300) });
      }
      const simS = win(t, D0, D1) * TOTAL;
      ctx.fillStyle = C.blue; ctx.fillRect(lx, laneY[1] - bh / 2, X(simS) - lx, bh);
      if (simS >= TOTAL) text(ctx, '237 s', X(TOTAL) + 6, laneY[1] + 4, { size: 10.5, color: C.blue, weight: 600 });

      // Part grid.
      const gy0 = laneY[1] + 62;
      const cols = wide ? 31 : 20; const rows = Math.ceil(PARTS / cols);
      const sideW = wide ? 190 : 0;
      const gw = w - pad * 2 - sideW - (wide ? 24 : 0); const gh = h - gy0 - (wide ? 34 : 66);
      const cell = Math.min(gw / cols, gh / rows); const gap = Math.max(1.5, cell * 0.16); const s = cell - gap;
      const gx0 = pad;
      text(ctx, L('分片 · 每片 32 MiB · 固定编号的 staging key', 'parts · 32 MiB each · fixed, numbered staging keys'), gx0, gy0 - 10, { size: 10.5 });
      const second = t >= M0 - 500;
      const fadeSecond = win(t, M0 - 500, M0 - 100);
      const sweepA = Math.floor(win(t, S0, S1) * PARTS);
      const sweepB = Math.floor(win(t, M0, M1) * PARTS);
      let doneN = 0;
      for (let i = 0; i < PARTS; i += 1) {
        const x = gx0 + (i % cols) * cell; const y = gy0 + Math.floor(i / cols) * cell;
        const p = parts[i];
        if (second) {
          const isHole = i === HOLE;
          if (isHole) {
            const hit = t >= M0 && sweepB >= HOLE;
            ctx.fillStyle = hit ? C.redSoft : '#fff'; rr(ctx, x, y, s, s, 1.5); ctx.fill();
            ctx.strokeStyle = hit ? C.red : C.faint; ctx.lineWidth = hit ? 1.6 : 1; ctx.setLineDash(hit ? [] : [2, 2]); rr(ctx, x + 0.5, y + 0.5, s - 1, s - 1, 1.5); ctx.stroke(); ctx.setLineDash([]);
            continue;
          }
          const checked = t >= M0 && i <= Math.min(sweepB, HOLE - 1);
          ctx.fillStyle = checked ? C.greenMid : mix(C.blue, C.blueMid, fadeSecond); rr(ctx, x, y, s, s, 1.5); ctx.fill();
          continue;
        }
        if (simS >= p.end) {
          doneN += 1;
          const checked = t >= S0 && i <= sweepA;
          ctx.fillStyle = checked ? mix(C.blue, C.green, clamp((t - S0 - (i / PARTS) * (S1 - S0)) / 180)) : C.blue;
          rr(ctx, x, y, s, s, 1.5); ctx.fill();
        } else if (simS >= p.start && t >= D0) {
          const q = (simS - p.start) / (p.end - p.start);
          ctx.fillStyle = C.blueSoft; rr(ctx, x, y, s, s, 1.5); ctx.fill();
          ctx.save(); rr(ctx, x, y, s, s, 1.5); ctx.clip(); ctx.fillStyle = C.blue; ctx.fillRect(x, y, s * q, s); ctx.restore();
        } else { ctx.fillStyle = C.line2; rr(ctx, x, y, s, s, 1.5); ctx.fill(); }
      }
      // Sweep cursor.
      const sweeping = (t >= S0 && t < S1 + 100) ? sweepA : (t >= M0 && t < M1 && sweepB <= HOLE) ? sweepB : -1;
      if (sweeping >= 0 && sweeping < PARTS) {
        const x = gx0 + (sweeping % cols) * cell; const y = gy0 + Math.floor(sweeping / cols) * cell;
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; rr(ctx, x - 1.5, y - 1.5, s + 3, s + 3, 2); ctx.stroke();
      }

      // Readouts.
      const rx = wide ? w - pad - sideW : pad; const ry = wide ? gy0 + 4 : gy0 + rows * cell + 22;
      const rows2 = [];
      if (!second) {
        rows2.push([L('已到分片', 'parts landed'), `${doneN} / ${PARTS}`, C.ink]);
        rows2.push([L('耗时', 'elapsed'), t >= D0 ? `${Math.round(simS)} s` : '—', C.ink]);
        rows2.push([L('平均吞吐', 'mean throughput'), simS >= TOTAL ? '41.8 MiB/s' : '—', C.blue]);
      } else {
        rows2.push([L('验收二', 'Acceptance 2'), L('故意缺第 197 片', 'part 197 withheld'), C.ink]);
        rows2.push([L('列目录核对', 'prefix listing'), `${Math.min(sweepB + (sweepB >= HOLE ? 0 : 1), 309)} / ${PARTS}`, C.ink]);
      }
      if (wide) {
        rows2.forEach(([k2, v, c2], j) => {
          text(ctx, k2, rx, ry + j * 44, { size: 10.5 });
          text(ctx, v, rx, ry + j * 44 + 22, { size: 18, color: c2, weight: 650, font: SANS });
        });
      } else {
        let bx = rx;
        rows2.forEach(([k2, v, c2]) => { bx += text(ctx, `${k2} `, bx, ry, { size: 10 }); bx += text(ctx, v, bx, ry, { size: 11, color: c2, weight: 600 }) + 12; });
      }
      const stampY = wide ? ry + rows2.length * 44 + 14 : ry + 26;
      if (!second && t >= S1) chip(ctx, L('complete 通过 · 310 / 310', 'complete accepted · 310 / 310'), rx, stampY, C.green, C.greenSoft, { alpha: win(t, S1, S1 + 250) });
      if (second && t >= M0 && sweepB >= HOLE) chip(ctx, L('拒绝 · 309 / 310，缺片', 'rejected · 309 / 310, gap'), rx, stampY, C.red, C.redSoft, { alpha: win(t, M0 + (HOLE / PARTS) * (M1 - M0), M0 + (HOLE / PARTS) * (M1 - M0) + 250) });
    }

    mount(el, {
      duration,
      draw,
      chapters: [
        { at: 0, zh: '代理上传', en: 'Proxy', sayZh: '经后端代理上传时，网关 60 秒超时会直接掐断慢客户端。', sayEn: 'Uploading through the backend proxy, the gateway cuts slow clients off at its 60-second timeout.' },
        { at: D0 - 100, zh: '分片直传', en: 'Direct', sayZh: '每片签一个 URL，浏览器直传对象存储：310 片 × 32 MiB，237 秒，零中断。', sayEn: 'One presigned URL per part, straight from the browser to object storage: 310 × 32 MiB parts in 237 s, no interruptions.' },
        { at: S0, zh: 'complete 核对', en: 'Complete', sayZh: 'complete 不信会话记录，直接列目录，核对片数与总字节，全对才合并。', sayEn: 'Completion ignores session records: it lists the prefix and checks part count and total bytes before merging.' },
        { at: M0 - 500, zh: '缺片守卫', en: 'Gap guard', sayZh: '第二次验收故意少传一片。列到缺口，服务端拒绝：309 / 310。', sayEn: 'The second acceptance run withholds one part. The listing finds the gap and the server refuses: 309 / 310.' }
      ]
    });
  }

  /* =====================================================================
   * FIG.C — the 11 × 7 credential matrix: a sample that passed, a gap it missed.
   * ===================================================================== */
  function figMatrix(el) {
    const R = 11; const Q = 7; const MISS = { r: 3, c: 4 };
    const S0 = 200; const S1 = 2000; const F0 = 2400; const V0 = 4300; const V1 = 7000; const duration = 7900;
    function draw(ctx, w, h, t) {
      const wide = w >= 640;
      const pad = wide ? 20 : 14;
      const labW = wide ? 62 : 44;
      const sideW = wide ? Math.min(300, w * 0.36) : 0;
      const gw = w - pad * 2 - labW - sideW - (wide ? 28 : 0);
      const gh = h - pad - 34 - (wide ? 26 : 70);
      const cell = Math.min(gw / Q, gh / R, 40); const gap = Math.max(2, cell * 0.14); const s = cell - gap;
      const gx = pad + labW; const gy = pad + 30;
      for (let c = 0; c < Q; c += 1) text(ctx, `T${c + 1}`, gx + c * cell + s / 2, gy - 10, { size: 10, align: 'center', color: c === 0 && t < V0 ? C.blue : C.quiet, weight: c === 0 && t < V0 ? 600 : 400 });
      for (let r = 0; r < R; r += 1) text(ctx, `${L('模块', 'mod')} ${String(r + 1).padStart(2, '0')}`, gx - 8, gy + r * cell + s / 2 + 4, { size: 10, align: 'right', color: r === MISS.r && t >= F0 && t < V1 ? C.red : C.quiet });
      let checked = 0; let red = false;
      for (let r = 0; r < R; r += 1) {
        for (let c = 0; c < Q; c += 1) {
          const x = gx + c * cell; const y = gy + r * cell;
          const idx = r * Q + c;
          const vAt = V0 + (idx / (R * Q)) * (V1 - V0);
          const sAt = S0 + (r / R) * (S1 - S0);
          const inSample = c === 0;
          const isMiss = r === MISS.r && c === MISS.c;
          if (t >= vAt) {
            checked += 1;
            const p = clamp((t - vAt) / 200);
            ctx.fillStyle = mix('#ffffff', C.greenSoft, p); rr(ctx, x, y, s, s, 2); ctx.fill();
            ctx.strokeStyle = alpha(C.green, 0.5 * p); ctx.lineWidth = 1; rr(ctx, x + 0.5, y + 0.5, s - 1, s - 1, 2); ctx.stroke();
            ctx.globalAlpha = p; tick(ctx, x + s / 2, y + s / 2, s * 0.42, C.green, 1.5); ctx.globalAlpha = 1;
          } else if (isMiss && t >= F0) {
            red = true;
            const pulse = 0.6 + 0.4 * Math.sin((t - F0) / 150);
            ctx.fillStyle = C.redSoft; rr(ctx, x, y, s, s, 2); ctx.fill();
            ctx.strokeStyle = alpha(C.red, pulse); ctx.lineWidth = 1.8; rr(ctx, x + 0.9, y + 0.9, s - 1.8, s - 1.8, 2); ctx.stroke();
            cross(ctx, x + s / 2, y + s / 2, s * 0.18, C.red, 1.6);
          } else if (inSample && t >= sAt) {
            if (t < V0) checked += 1;
            const p = clamp((t - sAt) / 200);
            ctx.fillStyle = mix('#ffffff', C.greenSoft, p); rr(ctx, x, y, s, s, 2); ctx.fill();
            ctx.globalAlpha = p; tick(ctx, x + s / 2, y + s / 2, s * 0.42, C.green, 1.5); ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = '#fbfbf8'; rr(ctx, x, y, s, s, 2); ctx.fill();
            hatch(ctx, x, y, s, s, alpha(C.line, 0.9), 5);
          }
        }
      }
      // Sample bracket around the first column during the first chapter.
      if (t >= S0 && t < V0) {
        ctx.strokeStyle = alpha(C.blue, 0.8 * (1 - win(t, V0 - 300, V0))); ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
        rr(ctx, gx - 3, gy - 3, s + 6, R * cell - gap + 6, 3); ctx.stroke(); ctx.setLineDash([]);
      }
      // Side panel.
      const sx = wide ? Math.min(w - pad - sideW, gx + Q * cell + 56) : pad; let sy = wide ? gy + 4 : gy + R * cell + 18;
      const line = (k2, v, color, big) => {
        if (wide) { text(ctx, k2, sx, sy, { size: 10.5 }); text(ctx, v, sx, sy + 24, { size: big ? 22 : 14, color, weight: 650, font: SANS }); sy += big ? 52 : 44; }
        else { const a = text(ctx, `${k2} `, sx, sy, { size: 10 }); text(ctx, v, sx + a, sy, { size: 11, color, weight: 600 }); sy += 18; }
      };
      if (t < V0) {
        line(L('第一轮验证', 'First check'), L('1 个变量 × 11 个 Pod', '1 variable × 11 pods'), C.ink);
        line(L('已核对', 'Cells checked'), `${Math.min(checked, 11)} / 77`, C.blue, true);
        if (t >= S1) chip(ctx, L('报绿', 'reported green'), sx, sy - (wide ? 8 : 4), C.green, C.greenSoft);
        if (red) {
          const cxm = gx + MISS.c * cell + s; const cym = gy + MISS.r * cell + s / 2;
          ctx.strokeStyle = alpha(C.red, 0.7); ctx.lineWidth = 1;
          if (wide) {
            const ty = gy + R * cell - 6;
            ctx.beginPath(); ctx.moveTo(cxm + 4, cym); ctx.lineTo(sx - 12, cym); ctx.stroke();
            text(ctx, L('上传链路 503', 'upload path: 503'), sx, cym + 4, { size: 12, color: C.red, weight: 600, font: SANS });
            text(ctx, L('这个模块少注入一个 token，', 'one module was missing a token,'), sx, cym + 24, { size: 10.5, color: C.muted });
            text(ctx, L('而抽查恰好没看这一列。', 'in a column the sample never read.'), sx, cym + 40, { size: 10.5, color: C.muted });
            void ty;
          } else {
            text(ctx, L('上传链路 503：抽查没看到的那一格', 'upload path 503: the cell the sample skipped'), sx, sy + 4, { size: 10.5, color: C.red, weight: 600 });
          }
        }
      } else {
        line(L('规则', 'Rule'), L('注入全量 · 重启全量 · 逐格核对', 'inject all · restart all · check every cell'), C.ink);
        line(L('已核对', 'Cells checked'), `${checked} / 77`, checked === 77 ? C.green : C.blue, true);
        if (checked === 77) chip(ctx, L('全矩阵通过', 'full matrix passes'), sx, sy - (wide ? 8 : 4), C.green, C.greenSoft);
      }
    }
    mount(el, {
      duration,
      draw,
      chapters: [
        { at: 0, zh: '抽查', en: 'Sample', sayZh: '发版后第一轮验证：每个 Pod 只查了 1 个变量，11 格全绿，就报了通过。', sayEn: 'The first post-release check read one variable per pod: 11 green cells, reported as a pass.' },
        { at: F0, zh: '漏掉的一格', en: 'The gap', sayZh: '用户侧上传报 503：一个模块少了一个 token。它在 77 格里，不在抽查的 11 格里。', sayEn: 'Users hit a 503 on upload: one module was missing one token. It sat in the 77, not in the 11 that were sampled.' },
        { at: V0, zh: '全矩阵', en: 'Full matrix', sayZh: '之后的规则：共享凭证一次性注入全部、重启全部，11 × 7 = 77 格逐格核对，不抽样。', sayEn: 'The rule since: inject a shared credential everywhere, restart everything, and check all 11 × 7 = 77 cells. No sampling.' }
      ]
    });
  }

  /* =====================================================================
   * FIG.D — CPU segmentation: a real-time latency race, the INT8 trap, thread count.
   * ===================================================================== */
  function figSeg(el) {
    const R0 = 0; const R1 = 6600; const I0 = 6900; const I1 = 9800; const H0 = 10100; const duration = 13200;
    const FAST = 6000; const EVIT = 640;
    const rand = mulberry32(42);
    const boxes = [...Array(50)].map(() => { const bw = 0.08 + rand() * 0.35; const bh = 0.08 + rand() * 0.4; return [rand() * (1 - bw), rand() * (1 - bh), bw, bh]; });
    // Scene in unit coordinates: a car and a person on a road.
    function carPath(ctx, X, Y, Wd, Ht, dx = 0, dy = 0, sc = 1) {
      const P = (u, v) => [X + (dx + 0.14 + u * 0.46 * sc) * Wd, Y + (dy + 0.48 + v * 0.30 * sc) * Ht];
      ctx.beginPath();
      const pts = [[0, 0.62], [0.04, 0.42], [0.2, 0.36], [0.33, 0.06], [0.68, 0.04], [0.82, 0.34], [0.97, 0.4], [1, 0.62], [0.98, 0.86], [0, 0.86]];
      pts.forEach(([u, v], i) => { const [px, py] = P(u, v); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.closePath();
    }
    function personPath(ctx, X, Y, Wd, Ht) {
      const cx = X + 0.76 * Wd; const top = Y + 0.3 * Ht;
      ctx.beginPath();
      ctx.arc(cx, top + 0.05 * Ht, 0.045 * Ht, 0, Math.PI * 2);
      // Body as a rounded rect added to the same path (rr() would start a new one and drop the head).
      const bx = cx - 0.045 * Wd; const by = top + 0.11 * Ht; const bw = 0.09 * Wd; const bh = 0.33 * Ht; const q = 0.03 * Wd;
      ctx.moveTo(bx + q, by); ctx.arcTo(bx + bw, by, bx + bw, by + bh, q); ctx.arcTo(bx + bw, by + bh, bx, by + bh, q);
      ctx.arcTo(bx, by + bh, bx, by, q); ctx.arcTo(bx, by, bx + bw, by, q); ctx.closePath();
    }
    function scene(ctx, X, Y, Wd, Ht) {
      ctx.save(); rr(ctx, X, Y, Wd, Ht, 3); ctx.clip();
      const g = ctx.createLinearGradient(0, Y, 0, Y + Ht); g.addColorStop(0, '#eceee9'); g.addColorStop(0.62, '#e1e3dd'); g.addColorStop(0.63, '#cfd1cb'); g.addColorStop(1, '#c4c6c0');
      ctx.fillStyle = g; ctx.fillRect(X, Y, Wd, Ht);
      ctx.fillStyle = '#d6d8d2'; for (let i = 0; i < 6; i += 1) ctx.fillRect(X + (0.02 + i * 0.17) * Wd, Y + (0.12 + (i % 3) * 0.05) * Ht, 0.12 * Wd, (0.5 - (i % 3) * 0.05) * Ht);
      ctx.fillStyle = '#9ea39f'; carPath(ctx, X, Y, Wd, Ht); ctx.fill();
      ctx.fillStyle = '#5f6563'; [0.26, 0.74].forEach((u) => { ctx.beginPath(); ctx.arc(X + (0.14 + u * 0.46) * Wd, Y + (0.48 + 0.86 * 0.3) * Ht, 0.045 * Ht, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = '#8a8f8b'; personPath(ctx, X, Y, Wd, Ht); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; rr(ctx, X + 0.5, Y + 0.5, Wd - 1, Ht - 1, 3); ctx.stroke();
    }
    function mask(ctx, X, Y, Wd, Ht, a, color = C.blue) {
      ctx.save(); rr(ctx, X, Y, Wd, Ht, 3); ctx.clip();
      ctx.globalAlpha = a; ctx.fillStyle = alpha(color, 0.38); carPath(ctx, X, Y, Wd, Ht); ctx.fill(); personPath(ctx, X, Y, Wd, Ht); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.6; carPath(ctx, X, Y, Wd, Ht); ctx.stroke(); personPath(ctx, X, Y, Wd, Ht); ctx.stroke();
      ctx.restore(); ctx.globalAlpha = 1;
    }
    function blob(ctx, X, Y, Wd, Ht, a) {
      // An INT8-style mask: plausible from afar, off by more than half up close.
      ctx.save(); rr(ctx, X, Y, Wd, Ht, 3); ctx.clip(); ctx.globalAlpha = a;
      const cx = X + 0.44 * Wd; const cy = Y + 0.64 * Ht;
      ctx.beginPath();
      for (let k = 0; k <= 64; k += 1) {
        const th = (k / 64) * Math.PI * 2;
        const r = 1 + 0.18 * Math.sin(th * 3 + 0.7) + 0.1 * Math.sin(th * 7 + 2.1);
        const px = cx + Math.cos(th) * 0.27 * Wd * r; const py = cy + Math.sin(th) * 0.17 * Ht * r;
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fillStyle = alpha(C.amber, 0.35); ctx.fill(); ctx.strokeStyle = C.amber; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore(); ctx.globalAlpha = 1;
    }
    const fadeIn = (t, a) => win(t, a, a + 300);
    const fadeOut = (t, b) => 1 - win(t, b - 300, b);

    function draw(ctx, w, h, t) {
      const wide = w >= 640; const pad = wide ? 20 : 14;
      // Chapter 1: the race, in real time.
      const aR = t < R1 ? 1 : fadeOut(t, R1 + 300);
      if (aR > 0) {
        ctx.globalAlpha = aR;
        const el2 = Math.max(0, t - R0 - 300);
        const lanes = [
          { name: 'FastSAM + CLIP', sub: 'PyTorch', ms: FAST, color: C.faint },
          { name: 'EfficientViT-SAM-L0', sub: 'OpenVINO fp32', ms: EVIT, color: C.blue }
        ];
        const colW = wide ? (w - pad * 3) / 2 : w - pad * 2;
        lanes.forEach((ln, j) => {
          const X = wide ? pad + j * (colW + pad) : pad;
          const Y = wide ? pad + 8 : pad + 8 + j * (h - pad) / 2;
          const imgH = wide ? h - pad - 118 : (h - pad) / 2 - 92;
          const imgW = colW;
          text(ctx, ln.name, X, Y + 8, { size: 12.5, color: C.ink, weight: 650, font: SANS });
          text(ctx, ln.sub, X, Y + 25, { size: 10.5 });
          const elapsed = Math.min(el2, ln.ms); const done = el2 >= ln.ms;
          text(ctx, `${fmt(elapsed)} ms`, X + imgW, Y + 12, { size: wide ? 22 : 18, color: done ? (j ? C.blue : C.ink) : C.muted, weight: 650, font: SANS, align: 'right' });
          const iy = Y + 38;
          scene(ctx, X, iy, imgW, imgH);
          if (!done && el2 > 0) {
            const sx = X + ((el2 % 900) / 900) * imgW;
            const g = ctx.createLinearGradient(sx - 40, 0, sx, 0); g.addColorStop(0, alpha(C.blue, 0)); g.addColorStop(1, alpha(C.blue, 0.18));
            ctx.fillStyle = g; ctx.fillRect(Math.max(X, sx - 40), iy, Math.min(40, sx - X), imgH);
          }
          if (done) {
            const p = clamp((el2 - ln.ms) / 350);
            if (j === 0) {
              ctx.save(); rr(ctx, X, iy, imgW, imgH, 3); ctx.clip();
              ctx.strokeStyle = alpha(C.ink, 0.22 * p); ctx.lineWidth = 1;
              boxes.forEach(([bx, by, bw, bh]) => ctx.strokeRect(X + bx * imgW, iy + by * imgH, bw * imgW, bh * imgH));
              ctx.restore();
              text(ctx, L('50 个候选框：CLIP 只重排，不过滤', '50 candidates: CLIP re-ranks, never filters'), X + 8, iy + imgH - 10, { size: 10.5, color: C.ink, alpha: p });
            } else mask(ctx, X, iy, imgW, imgH, p);
          }
          // Progress track on a shared 0–6,000 ms scale.
          const ty = iy + imgH + 18;
          ctx.fillStyle = C.line2; ctx.fillRect(X, ty, imgW, 5);
          ctx.fillStyle = ln.color; ctx.fillRect(X, ty, (elapsed / FAST) * imgW, 5);
          if (j === 1 && done) text(ctx, L(`快 ${(FAST / EVIT).toFixed(1)} 倍`, `${(FAST / EVIT).toFixed(1)}× faster`), X + (EVIT / FAST) * imgW + 8, ty + 6, { size: 11, color: C.blue, weight: 650, alpha: clamp((el2 - EVIT) / 300) });
        });
        ctx.globalAlpha = 1;
      }
      // Chapter 2: INT8 looks fine to the model and is wrong to the eye.
      const aI = t < I0 ? 0 : Math.min(fadeIn(t, I0), t < I1 ? 1 : fadeOut(t, I1 + 300));
      if (aI > 0) {
        ctx.globalAlpha = aI;
        const imgW = wide ? w * 0.46 : w - pad * 2; const imgH = wide ? h - pad * 2 - 16 : h * 0.46;
        const X = pad; const Y = pad + 8;
        scene(ctx, X, Y, imgW, imgH);
        mask(ctx, X, Y, imgW, imgH, 0.9);
        blob(ctx, X, Y, imgW, imgH, easeOut(win(t, I0 + 250, I0 + 900)) * aI);
        chip(ctx, 'fp32', X + 10, Y + 16, C.blue, '#fff'); chip(ctx, 'INT8', X + 54, Y + 16, C.amberInk, '#fff');
        const sx = wide ? X + imgW + 32 : pad; let sy = wide ? Y + 18 : Y + imgH + 26;
        const row = (k2, a, b, big) => {
          text(ctx, k2, sx, sy, { size: 10.5 });
          const aw = text(ctx, a, sx, sy + (big ? 30 : 22), { size: big ? 26 : 15, color: C.ink, weight: 650, font: SANS });
          if (b) text(ctx, b, sx + aw + 10, sy + (big ? 30 : 22), { size: 11, color: C.muted });
          sy += big ? 58 : 46;
        };
        row(L('模型自估 IoU · fp32 / INT8', 'model self-estimated IoU · fp32 / INT8'), '0.686 / 0.692', L('几乎不变', 'barely moves'));
        row(L('INT8 与 fp32 掩码的实际 IoU', 'actual IoU, INT8 vs fp32 masks'), '0.42', L('48–59% 的样本低于 0.5', '48–59% of samples below 0.5'), true);
        row(L('换来的提速', 'what it buys'), '1.7×', L('不值得', 'not worth it'));
        if (wide) text(ctx, L('只看延迟表，会得出“INT8 提速 1.7 倍”的结论。', 'A latency table alone says "INT8: 1.7× faster".'), sx, sy + 4, { size: 11, color: C.red, font: SANS, weight: 600 });
        ctx.globalAlpha = 1;
      }
      // Chapter 3: threads vs latency, minimum at the cgroup quota.
      const aH = t < H0 ? 0 : fadeIn(t, H0);
      if (aH > 0) {
        ctx.globalAlpha = aH;
        const data = [[1, 2402], [2, 1242], [4, 640], [8, 755], [16, 796], [32, 1007]];
        const X = pad + (wide ? 56 : 44); const Y = pad + 26; const Wd = w - X - pad - (wide ? 230 : 10); const Ht = wide ? h - Y - 44 : (h - Y) * 0.58;
        const xs = (n) => X + (Math.log2(n) / 5) * Wd; const ys = (ms) => Y + Ht - (ms / 2600) * Ht;
        [0, 500, 1000, 1500, 2000, 2500].forEach((v) => {
          ctx.strokeStyle = C.line2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, ys(v) + 0.5); ctx.lineTo(X + Wd, ys(v) + 0.5); ctx.stroke();
          text(ctx, `${fmt(v)}`, X - 8, ys(v) + 4, { size: 9.5, align: 'right', color: C.faint });
        });
        text(ctx, 'ms', X - 8, Y - 10, { size: 9.5, align: 'right', color: C.faint });
        data.forEach(([n]) => text(ctx, String(n), xs(n), Y + Ht + 18, { size: 10, align: 'center' }));
        text(ctx, L('推理线程数', 'inference threads'), X + Wd, Y + Ht + 34, { size: 10, align: 'right' });
        // Quota band.
        ctx.fillStyle = alpha(C.green, 0.08); ctx.fillRect(xs(4) - 14, Y, 28, Ht);
        text(ctx, L('= cgroup 配额 4 核', '= cgroup quota, 4 cores'), xs(4), Y - 8, { size: 10.5, color: C.green, align: 'center', weight: 600 });
        const p = easeInOut(win(t, H0 + 200, H0 + 1600));
        const upto = p * (data.length - 1);
        ctx.strokeStyle = C.blue; ctx.lineWidth = 2; ctx.beginPath();
        data.forEach(([n, ms], i) => {
          if (i > Math.ceil(upto)) return;
          let px = xs(n); let py = ys(ms);
          if (i > upto) { const [n0, m0] = data[i - 1]; const f = upto - (i - 1); px = lerp(xs(n0), px, f); py = lerp(ys(m0), py, f); }
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        });
        ctx.stroke();
        data.forEach(([n, ms], i) => {
          if (i > upto + 0.001) return;
          const best = n === 4; const old = n === 2;
          ctx.fillStyle = best ? C.green : old ? C.amber : C.blue;
          ctx.beginPath(); ctx.arc(xs(n), ys(ms), best || old ? 4.5 : 3.2, 0, Math.PI * 2); ctx.fill();
          if (wide || best || old) text(ctx, fmt(ms), xs(n) + (n === 1 ? 10 : n === 2 ? -10 : 0), ys(ms) - (n === 2 ? 2 : 10), { size: 10.5, align: n === 1 ? 'left' : n === 2 ? 'right' : 'center', color: best ? C.green : old ? C.amberInk : C.ink, weight: best || old ? 650 : 400 });
        });
        const sx = wide ? w - pad - 206 : pad; let sy = wide ? Y + 20 : Y + Ht + 56;
        const note = (a, b, c2) => { text(ctx, a, sx, sy, { size: 10.5 }); text(ctx, b, sx, sy + 19, { size: 12, color: c2, weight: 600, font: SANS }); sy += wide ? 48 : 38; };
        const q = win(t, H0 + 1600, H0 + 2000);
        ctx.globalAlpha = aH * q;
        note(L('容器里 os.cpu_count()', 'os.cpu_count() in the container'), L('32（宿主核数）', '32 (the host)'), C.ink);
        note(L('原配置 OMP_NUM_THREADS=2', 'shipped OMP_NUM_THREADS=2'), L('1,242 ms，慢 1.94 倍', '1,242 ms, 1.94× slower'), C.amberInk);
        note(L('改成配额核数', 'set to the quota'), L('640 ms，只改一行 env', '640 ms, a one-line env change'), C.green);
        ctx.globalAlpha = 1;
      }
    }
    mount(el, {
      duration,
      draw,
      chapters: [
        { at: R0, zh: '延迟（实时）', en: 'Latency, live', sayZh: '同一张图、同一台 4 核机器，按真实时长播放：FastSAM + CLIP 6,000 ms，EfficientViT-SAM 640 ms。', sayEn: 'Same image, same 4-core machine, played at real speed: FastSAM + CLIP takes 6,000 ms, EfficientViT-SAM 640 ms.' },
        { at: I0, zh: 'INT8 陷阱', en: 'INT8 trap', sayZh: 'INT8 再快 1.7 倍，但掩码和 fp32 的 IoU 只有 0.42，而模型自估的 IoU 几乎没变：坏了也察觉不到。', sayEn: "INT8 buys another 1.7×, but its masks overlap fp32's at IoU 0.42 while the model's own IoU estimate barely moves: failure you cannot see." },
        { at: H0, zh: '线程数', en: 'Threads', sayZh: '容器看到的是宿主 32 核，真正配额是 4 核。线程数等于配额时最快。', sayEn: 'The container sees the host’s 32 cores; its real quota is 4. Latency bottoms out when threads match the quota.' }
      ]
    });
  }

  /* =====================================================================
   * FIG.E — 16 cores green, 32 cores crash-looping: threads per core vs nproc.
   * ===================================================================== */
  function figCores(el) {
    const A1 = 2700; const B0 = 3000; const B1 = 6400; const P0 = 6700; const duration = 9800;
    const ENV = ['OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS', 'ulimits.nproc'];
    function draw(ctx, w, h, t) {
      const wide = w >= 640; const pad = wide ? 20 : 14;
      const grow = easeInOut(win(t, B0, B0 + 900));
      const pinned = easeInOut(win(t, P0 + 400, P0 + 1400));
      const cores = Math.round(16 + 16 * grow);
      // Host box with a core grid.
      const hostW = wide ? w * 0.24 : w - pad * 2; const hostH = wide ? h - pad * 2 - 20 : h * 0.24;
      const hx = pad; const hy = pad + 18;
      text(ctx, L(t < B0 ? '验证机 · 鲲鹏 aarch64' : '客户现场 · 鲲鹏 aarch64', t < B0 ? 'test machine · Kunpeng aarch64' : 'customer site · Kunpeng aarch64'), hx, hy - 8, { size: 10.5 });
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; rr(ctx, hx + 0.5, hy + 0.5, hostW - 1, hostH - 1, 3); ctx.stroke();
      const gc = wide ? 4 : 8; const gr = Math.ceil(32 / gc);
      const cs = Math.min((hostW - 24) / gc, (hostH - 48) / gr); const cg = cs * 0.2;
      for (let i = 0; i < 32; i += 1) {
        const x = hx + 12 + (i % gc) * cs; const y = hy + 12 + Math.floor(i / gc) * cs;
        const on = i < cores; const a = on ? (i < 16 ? 1 : clamp((grow * 16 - (i - 16)) / 1)) : 0;
        ctx.fillStyle = on ? alpha(C.ink, 0.8 * a) : C.line2; if (!on) { ctx.globalAlpha = 0.5; }
        rr(ctx, x, y, cs - cg, cs - cg, 2); ctx.fill(); ctx.globalAlpha = 1;
      }
      text(ctx, L(`${cores} 核`, `${cores} cores`), hx + 12, hy + hostH - 12, { size: wide ? 20 : 15, color: C.ink, weight: 650, font: SANS });

      // Three Python services, each spawning threads per visible core.
      const sx0 = wide ? hx + hostW + 28 : pad; const sy0 = wide ? hy : hy + hostH + 26;
      const gaugeW = wide ? 120 : 0;
      const sw = wide ? w - sx0 - pad - gaugeW - 24 : w - pad * 2; const sh = wide ? (hostH - 24 - 34) / 3 : (h - sy0 - pad - 60) / 3;
      const crashFrom = B0 + 1100; const restarts = t < crashFrom ? 0 : Math.min(60, Math.floor((Math.min(t, P0 + 900) - crashFrom) / 38));
      const crashing = t >= crashFrom && t < P0 + 900;
      for (let k = 0; k < 3; k += 1) {
        const y = sy0 + k * (sh + 12);
        const status = crashing ? 'CrashLoopBackOff' : 'Running';
        const col = crashing ? C.red : C.green;
        ctx.fillStyle = crashing ? alpha(C.red, 0.05) : '#fff'; rr(ctx, sx0, y, sw, sh, 3); ctx.fill();
        ctx.strokeStyle = crashing ? alpha(C.red, 0.5) : C.line; ctx.lineWidth = 1; rr(ctx, sx0 + 0.5, y + 0.5, sw - 1, sh - 1, 3); ctx.stroke();
        text(ctx, L(`Python 算力服务 ${k + 1}`, `Python compute service ${k + 1}`), sx0 + 12, y + 18, { size: 11, color: C.ink, weight: 500 });
        chip(ctx, status, sx0 + sw - 10, y + 15, col, crashing ? C.redSoft : C.greenSoft, { align: 'right', size: 9.5 });
        if (restarts) text(ctx, `↻ ${restarts}${restarts >= 60 ? '+' : ''}`, sx0 + sw - 10, y + sh - 10, { size: 11, color: crashing ? C.red : C.quiet, align: 'right', weight: 600 });
        // Thread dots: one pool per library, each sized by core count until pinned.
        const threads = Math.round(lerp(cores, 4, pinned));
        const dotR = Math.max(1.6, Math.min(3, sh / 26));
        const perRow = Math.floor((sw - 90) / (dotR * 3.2));
        const libs = ['OpenBLAS', 'OMP'];
        libs.forEach((lib, li) => {
          const ly = y + 34 + li * (dotR * 3.4 + 6);
          if (ly > y + sh - 8) return;
          text(ctx, lib, sx0 + 12, ly + 3, { size: 9.5, color: C.faint });
          for (let d = 0; d < Math.min(threads, perRow); d += 1) {
            ctx.fillStyle = crashing ? C.red : pinned > 0.5 ? C.green : C.blue;
            ctx.globalAlpha = crashing ? 0.5 + 0.5 * Math.sin(t / 90 + d) : 1;
            ctx.beginPath(); ctx.arc(sx0 + 78 + d * dotR * 3.2, ly, dotR, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
        });
      }
      // Gauge: threads in the container against the nproc ceiling.
      if (wide) {
        const gx = w - pad - gaugeW; const gy = hy; const gh = hostH; const bw = 34;
        text(ctx, L('线程总数', 'total threads'), gx, gy - 8, { size: 10.5 });
        ctx.fillStyle = C.line2; ctx.fillRect(gx, gy, bw, gh);
        const level = lerp(lerp(0.52, 1.04, grow), 0.16, pinned);
        const fillH = Math.min(1, level) * gh;
        const over = level > 0.78;
        ctx.fillStyle = over ? C.red : pinned > 0.5 ? C.green : C.blue; ctx.fillRect(gx, gy + gh - fillH, bw, fillH);
        const limY = gy + gh * (1 - 0.78);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(gx - 6, limY); ctx.lineTo(gx + bw + 6, limY); ctx.stroke(); ctx.setLineDash([]);
        text(ctx, L('nproc 上限', 'nproc limit'), gx + bw + 10, limY + 4, { size: 10.5, color: C.ink, weight: 600 });
        text(ctx, L('∝ 核数', '∝ cores'), gx + bw + 10, gy + gh - 4, { size: 10, color: C.faint });
      }
      // The fix, typed in.
      if (t >= P0) {
        const lines = ENV.map((e, i) => (i < 4 ? `${e}=N` : L('ulimits.nproc 放开', 'ulimits.nproc raised')));
        const n = Math.floor(win(t, P0, P0 + 1100) * lines.length * 1.0001);
        const px = wide ? sx0 : pad; const py = wide ? hy + hostH - 6 : h - pad - 22;
        const shownLines = lines.slice(0, Math.max(1, n));
        text(ctx, L('每个算力容器：', 'every compute container:'), px, py - (wide ? 0 : 14), { size: 10.5, color: C.green, weight: 600 });
        if (wide) { ctx.save(); ctx.beginPath(); ctx.rect(px, py - 14, sw, 20); ctx.clip(); text(ctx, shownLines.join('  '), px + 118, py, { size: w > 1100 ? 10.5 : 9.5, color: C.ink }); ctx.restore(); }
        else text(ctx, shownLines.slice(0, 2).join('  ') + (shownLines.length > 2 ? '  …' : ''), px, py + 4, { size: 9.5, color: C.ink });
      }
      if (t >= A1 - 400 && t < B0 + 200) chip(ctx, L('全绿', 'all green'), hx + hostW - 10, hy + hostH - 18, C.green, C.greenSoft, { align: 'right', alpha: win(t, A1 - 400, A1 - 100) });
    }
    mount(el, {
      duration,
      draw,
      chapters: [
        { at: 0, zh: '验证机 16 核', en: '16-core test box', sayZh: '与客户同款 OS 的验证机，16 核，整套平台全绿。', sayEn: 'A test machine on the customer’s OS: 16 cores, the whole platform green.' },
        { at: B0, zh: '现场 32 核', en: '32 cores on site', sayZh: '客户现场是 32 核。OpenBLAS / OMP 按核数起线程，撞上 nproc 上限，三个 Python 服务重启 60+ 次。', sayEn: 'On site: 32 cores. OpenBLAS and OMP start a thread per core, hit the nproc limit, and three Python services restart 60+ times.' },
        { at: P0, zh: '钉死线程数', en: 'Pin the threads', sayZh: '所有算力容器显式钉死线程数并放开 nproc；验证机从此必须与客户机同规格，核数也要对齐。', sayEn: 'Every compute container gets explicit thread counts and a raised nproc; test machines must now match the customer’s, core count included.' }
      ]
    });
  }

  /* =====================================================================
   * FIG.F — prompt layout and the cache prefix, before and after.
   * ===================================================================== */
  function figPrompt(el) {
    const M0 = 3400; const M1 = 5200; const R0 = 6600; const duration = 10200;
    // Illustrative segment sizes (tokens), chosen so the per-prompt means match 12,726 → 9,631.
    const H = [1061, 1661, 2261, 2861];
    const seg = {
      S: { zh: '系统', en: 'system', b: 1500, a: 1500, c: '#5d6168' },
      T: { zh: '工具目录', en: 'tool catalog', b: 7280, a: 5200, c: '#6f8fe8' },
      V: { zh: '进行中任务', en: 'task state', b: 1085, a: 70, c: C.amber },
      K: { zh: 'Skill', en: 'skills', b: 900, a: 900, c: '#8e959c' }
    };
    const orderB = ['S', 'T', 'V', 'K', 'H']; const orderA = ['S', 'T', 'K', 'H', 'V'];
    function layout(turn, p) {
      // Positions for each segment, blending the before/after order and sizes.
      const sizes = { S: lerp(seg.S.b, seg.S.a, p), T: lerp(seg.T.b, seg.T.a, p), V: lerp(seg.V.b, seg.V.a, p), K: seg.K.b, H: H[turn] };
      const at = (order) => { let x = 0; const o = {}; order.forEach((k) => { o[k] = x; x += sizes[k]; }); return o; };
      const xb = at(orderB); const xa = at(orderA);
      const pos = {}; Object.keys(sizes).forEach((k) => { pos[k] = lerp(xb[k], xa[k], easeInOut(p)); });
      const total = Object.values(sizes).reduce((a, b) => a + b, 0);
      // Cached prefix: identical to the previous turn up to the first volatile token.
      let cached = 0;
      if (turn > 0) cached = p < 0.5 ? xb.V : sizes.S + sizes.T + sizes.K + H[turn - 1];
      return { sizes, pos, total, cached };
    }
    function draw(ctx, w, h, t) {
      const wide = w >= 640; const pad = wide ? 20 : 14;
      const p = win(t, M0, M1);
      const resP = win(t, R0, R0 + 500);
      const labW = wide ? 64 : 44;
      const X = pad + labW; const Wd = w - X - pad - (wide ? 150 : 8);
      const maxTok = 13626; const sc = Wd / maxTok;
      const top = pad + 26;
      const rowH = wide ? Math.min(46, (h * (resP > 0 ? 0.52 : 0.8) - top) / 4) : Math.min(34, (h * (resP > 0 ? 0.46 : 0.7) - top) / 4);
      const bh = Math.min(20, rowH * 0.46);
      text(ctx, p < 0.5 ? (wide ? L('改前：易变段排在稳定段之前', 'Before: volatile content ahead of stable sections') : L('改前：易变段在前', 'Before: volatile first')) : (wide ? L('改后：稳定段在前，易变段压缩后放末尾', 'After: stable first, volatile content trimmed and moved last') : L('改后：稳定段在前', 'After: stable first')), pad, pad + 8, { size: wide ? 11 : 10.5, color: C.ink, weight: 600 });
      let cachedSum = 0; let totalSum = 0;
      for (let k = 0; k < 4; k += 1) {
        const y = top + k * rowH + 10;
        const lt = layout(k, p);
        cachedSum += lt.cached; totalSum += lt.total;
        text(ctx, L(`第 ${k + 1} 轮`, `turn ${k + 1}`), X - 10, y + bh / 2 + 4, { size: 10, align: 'right' });
        ['S', 'T', 'K', 'H', 'V'].forEach((key) => {
          const x = X + lt.pos[key] * sc; const wd = lt.sizes[key] * sc;
          const color = key === 'H' ? '#c9ccc6' : seg[key].c;
          ctx.fillStyle = color; ctx.fillRect(x, y, Math.max(0, wd - 1), bh);
          if (key === 'T') {
            const n = Math.round(lerp(28, 20, p)); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.beginPath();
            for (let j = 1; j < n; j += 1) { const tx = x + (wd / n) * j; ctx.moveTo(tx + 0.5, y + 3); ctx.lineTo(tx + 0.5, y + bh - 3); }
            ctx.stroke();
          }
        });
        // Cache underline: green for the reusable prefix, amber for the rest.
        const uy = y + bh + 4;
        ctx.fillStyle = alpha(C.amber, 0.8); ctx.fillRect(X, uy, lt.total * sc, 3);
        if (lt.cached) { ctx.fillStyle = C.green; ctx.fillRect(X, uy, lt.cached * sc, 3); }
        if (wide) text(ctx, fmt(lt.total), X + lt.total * sc + 8, y + bh / 2 + 4, { size: 10, color: C.muted });
      }
      // Legend.
      const ly = top + 4 * rowH + 20;
      let lx = pad;
      [['S', seg.S.c], ['T', seg.T.c], ['K', seg.K.c], ['H', '#c9ccc6'], ['V', seg.V.c]].forEach(([k2, c2]) => {
        ctx.fillStyle = c2; ctx.fillRect(lx, ly - 8, 10, 10);
        const name = k2 === 'H' ? L('对话历史', 'history') : L(seg[k2].zh, seg[k2].en);
        lx += 16 + text(ctx, name, lx + 16, ly + 1, { size: wide ? 10 : 9 }) + (wide ? 16 : 7);
      });
      if (wide) {
        ctx.fillStyle = C.green; ctx.fillRect(lx, ly - 4, 14, 3); lx += 20 + text(ctx, L('可命中缓存', 'cache hit'), lx + 20, ly + 1, { size: 10 }) + 14;
        ctx.fillStyle = C.amber; ctx.fillRect(lx, ly - 4, 14, 3); text(ctx, L('每轮重算', 'recomputed'), lx + 20, ly + 1, { size: 10 });
      }
      // Right-hand readouts.
      if (wide && resP === 0) {
        const rx = w - pad - 130; let ry = top + 16;
        text(ctx, L('工具目录', 'tool catalog'), rx, ry, { size: 10.5 }); text(ctx, `${Math.round(lerp(28, 20, p))} ${L('个', 'tools')}`, rx, ry + 22, { size: 18, color: C.ink, weight: 650, font: SANS }); ry += 50;
        text(ctx, L('进行中任务段', 'task-state block'), rx, ry, { size: 10.5 }); text(ctx, `${fmt(lerp(3320, 211, p))} ${L('字符', 'chars')}`, rx, ry + 22, { size: 18, color: p > 0.5 ? C.green : C.amberInk, weight: 650, font: SANS }); ry += 50;
        if (p < 0.5) { text(ctx, L('缓存命中（实测）', 'cache hit (measured)'), rx, ry, { size: 10.5 }); text(ctx, '51.0%', rx, ry + 22, { size: 18, color: C.amberInk, weight: 650, font: SANS }); }
        void cachedSum; void totalSum;
      }
      // Results.
      if (resP > 0) {
        ctx.globalAlpha = resP;
        const y0 = ly + 26; const colN = wide ? 4 : 2; const cw = (w - pad * 2) / colN; const ch = wide ? h - y0 - pad : (h - y0 - pad) / 2;
        const metrics = [
          { k: L('输入 token', 'input tokens'), a: L('159.0 万', '1.59 M'), b: L('89.6 万', '0.896 M'), va: 1590, vb: 896, d: '−43.6%' },
          { k: L('单个 prompt', 'per prompt'), a: '12,726', b: '9,631', va: 12726, vb: 9631, d: '−24.3%' },
          { k: wide ? L('24 例回归失败', 'regression failures, 24 cases') : L('回归失败', 'regression fails'), a: '53', b: '20', va: 53, vb: 20, d: '53 → 36 → 20' },
          { k: L('任务通过', 'tasks passed'), a: '5', b: '7', va: 5, vb: 7, d: '+2', up: true }
        ];
        metrics.forEach((m, i) => {
          const x = pad + (i % colN) * cw; const y = y0 + Math.floor(i / colN) * ch;
          text(ctx, m.k, x, y + 4, { size: 10.5 });
          const q = easeOut(win(t, R0 + 200 + i * 180, R0 + 900 + i * 180));
          const maxV = Math.max(m.va, m.vb); const bw = cw - 24;
          ctx.fillStyle = C.line2; ctx.fillRect(x, y + 16, (m.va / maxV) * bw, 6);
          ctx.fillStyle = m.up ? C.green : C.blue; ctx.fillRect(x, y + 26, (lerp(m.va, m.vb, q) / maxV) * bw, 6);
          const aw = text(ctx, m.a, x, y + 54, { size: 12, color: C.faint, weight: 500, font: SANS });
          text(ctx, '→', x + aw + 6, y + 54, { size: 12, color: C.faint, font: SANS });
          text(ctx, m.b, x + aw + 22, y + 54, { size: wide ? 20 : 16, color: C.ink, weight: 700, font: SANS });
          text(ctx, m.d, x, y + 72, { size: 10.5, color: m.up ? C.green : C.blue, weight: 600 });
        });
        ctx.globalAlpha = 1;
      }
    }
    mount(el, {
      duration,
      draw,
      chapters: [
        { at: 0, zh: '改前', en: 'Before', sayZh: 'prompt 缓存只能复用“与上一轮完全相同的前缀”。进行中任务每轮都变，却排在 Skill 和历史前面，缓存到这里就断了。实测命中 51.0%。', sayEn: 'A prompt cache only reuses the prefix identical to the previous turn. The task-state block changes every turn yet sat ahead of skills and history, so the cache broke there. Measured hit rate: 51.0%.' },
        { at: M0, zh: '重排', en: 'Reorder', sayZh: '稳定段挪到前面，易变段从 3,320 字符压到 211 并放到末尾；工具目录 28 → 20。可复用的前缀一下变长。', sayEn: 'Stable sections move first; the volatile block shrinks from 3,320 to 211 characters and goes last; the tool catalog drops from 28 to 20. The reusable prefix grows.' },
        { at: R0, zh: '结果', en: 'Result', sayZh: '同一套 24 例回归：输入 token 降 43.6%，失败 53 → 20，任务通过 5 → 7。', sayEn: 'On the same 24-case regression: 43.6% fewer input tokens, failures 53 → 20, tasks passed 5 → 7.' }
      ]
    });
  }

  /* =====================================================================
   * FIG.P — astock-research: every pre-registered test against its matched control.
   * ===================================================================== */
  function figForest(el) {
    const rows = [
      { g: 0, zh: '连板 · 持有 5 日', en: 'Limit-up streak · 5-day', e: -13.79, lo: -17.63, hi: -9.74, v: 'x', src: 'v8' },
      { g: 0, zh: '连板 · 持有 20 日', en: 'Limit-up streak · 20-day', e: -9.31, lo: -11.93, hi: -6.76, v: 'x', src: 'v8' },
      { g: 0, zh: '放量启动 · 5 日', en: 'Volume breakout · 5-day', e: -5.56, lo: -11.30, hi: -0.03, v: 'xn', src: 'v8' },
      { g: 0, zh: '趋势动量 · 20 日', en: 'Trend momentum · 20-day', e: -2.91, lo: -5.61, hi: -0.47, v: 'xn', src: 'v8' },
      { g: 1, zh: '行业 1 月动量 · 前 3', en: 'Sector 1-month momentum · top 3', e: -13.56, lo: -21.20, hi: -5.99, v: 'x', src: 'v13' },
      { g: 1, zh: '行业 3 月动量 · 前 3', en: 'Sector 3-month momentum · top 3', e: -11.00, lo: -17.84, hi: -4.63, v: 'x', src: 'v13' },
      { g: 1, zh: '行业 6-1 月动量 · 前 3', en: 'Sector 6-1 momentum · top 3', e: -4.66, lo: -10.63, hi: 1.82, v: 'n', src: 'v13' },
      { g: 2, zh: '小市值 · 30 只', en: 'Small cap · 30 names', e: 9.05, lo: -4.45, hi: 28.57, v: 'i', src: 'v12.1', was: { e: 13.93, lo: -1.40, hi: 42.71 } },
      { g: 2, zh: '12-1 动量 · 30 只', en: '12-1 momentum · 30 names', e: -12.80, lo: -26.76, hi: 3.61, v: 'i', src: 'v12.1' },
      { g: 2, zh: '低 PB · 30 只', en: 'Low P/B · 30 names', e: -7.41, lo: -25.91, hi: 9.23, v: 'i', src: 'v12.1' },
      { g: 2, zh: '低波动 · 30 只', en: 'Low volatility · 30 names', e: -0.73, lo: -20.41, hi: 15.89, v: 'i', src: 'v12.1' },
      { g: 3, zh: '主动基金 · 近 3 年业绩前组', en: 'Active funds · top 3-year record', e: -0.24, lo: -4.90, hi: 4.94, v: 'i', src: 'v9' },
      { g: 3, zh: '主动基金 · 质量评分', en: 'Active funds · quality score', e: -0.72, lo: -6.64, hi: 5.22, v: 'i', src: 'v9' },
      { g: 3, zh: 'ETF 组合 · 10% 回撤止损', en: 'ETF basket · 10% stop-loss', e: -4.05, lo: -9.32, hi: 0.08, v: 'i', src: 'v7' }
    ];
    const groups = [['短线', 'Short-term'], ['行业轮动', 'Sector rotation'], ['个股因子', 'Stock factors'], ['基金与 ETF', 'Funds & ETFs']];
    const MIN = -30; const MAX = 30;
    const D1 = 2400; const SH0 = 3000; const SH1 = 4200; const duration = 5000;
    let hot = -1;
    const readout = el.querySelector('.fig-readout');
    const verdict = { x: ['证伪', 'Falsified', C.red], n: ['排除实用价值', 'No practical value', C.amberInk], xn: ['证伪 / 排除', 'Falsified / no value', C.red], i: ['证据不足', 'Insufficient', C.quiet] };
    function draw(ctx, w, h, t, api) {
      const wide = w >= 640; const pad = wide ? 16 : 12;
      const labW = wide ? Math.min(230, w * 0.34) : 0;
      const verW = wide ? 96 : 0;
      const X = pad + labW; const Wd = w - X - pad - verW - 8;
      const xs = (v) => X + ((clamp(v, MIN, MAX) - MIN) / (MAX - MIN)) * Wd;
      const top = 30; const rowH = (h - top - 26) / (rows.length + groups.length * 0.6);
      [-30, -20, -10, 0, 10, 20, 30].forEach((v) => {
        ctx.strokeStyle = v === 0 ? C.ink : C.line2; ctx.lineWidth = v === 0 ? 1.2 : 1;
        ctx.beginPath(); ctx.moveTo(xs(v) + 0.5, top - 8); ctx.lineTo(xs(v) + 0.5, h - 22); ctx.stroke();
        text(ctx, v > 0 ? `+${v}` : String(v), xs(v), h - 8, { size: 9.5, align: 'center', color: v === 0 ? C.ink : C.faint });
      });
      text(ctx, L('← 跑输对照', '← worse than control'), xs(-1.5), top - 14, { size: 10, align: 'right', color: C.red });
      text(ctx, L('跑赢对照 →', 'better than control →'), xs(1.5), top - 14, { size: 10, color: C.green });
      if (wide) text(ctx, L('判定', 'verdict'), w - pad, top - 14, { size: 10, align: 'right' });
      let y = top; let g = -1; hot = -1;
      rows.forEach((r, i) => {
        if (r.g !== g) { g = r.g; y += rowH * 0.6; text(ctx, L(groups[g][0], groups[g][1]).toUpperCase(), pad, y - 2, { size: 9.5, color: C.blue, weight: 600 }); }
        const cy = wide ? y + rowH / 2 : y + rowH * 0.72;
        const p = easeOut(win(t, 150 + i * (D1 / rows.length), 150 + i * (D1 / rows.length) + 500));
        if (api.pointer && api.pointer.y >= y && api.pointer.y < y + rowH) hot = i;
        if (hot === i) { ctx.fillStyle = alpha(C.blue, 0.06); ctx.fillRect(pad - 4, y, w - pad * 2 + 8, rowH); }
        const [vz, ve, vc] = verdict[r.v];
        if (wide) text(ctx, L(r.zh, r.en), X - 12, cy + 4, { size: 11.5, align: 'right', color: C.ink, font: SANS });
        else text(ctx, `${L(r.zh, r.en)} · ${L(verdict[r.v][0], verdict[r.v][1])}`, pad, y + rowH * 0.36, { size: 10, color: C.ink, font: SANS });
        let e = r.e; let lo = r.lo; let hi = r.hi;
        if (r.was) {
          const q = easeInOut(win(t, SH0, SH1));
          e = lerp(r.was.e, r.e, q); lo = lerp(r.was.lo, r.lo, q); hi = lerp(r.was.hi, r.hi, q);
          if (q > 0) { // ghost of the contaminated estimate
            ctx.globalAlpha = 0.7 * p; ctx.strokeStyle = C.faint; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
            ctx.beginPath(); ctx.moveTo(xs(r.was.lo), cy); ctx.lineTo(xs(r.was.hi), cy); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(xs(r.was.e), cy, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = C.faint; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(xs(r.was.e), cy, 3.5, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
            if (wide) text(ctx, L('剔除北交所后', 'after removing BSE'), xs(r.was.e) + 8, cy - 7, { size: 9.5, color: C.muted, alpha: q });
          }
        }
        const mid = e;
        const l2 = lerp(mid, lo, p); const h2 = lerp(mid, hi, p);
        ctx.strokeStyle = vc; ctx.lineWidth = 2; ctx.globalAlpha = p;
        ctx.beginPath(); ctx.moveTo(xs(l2), cy); ctx.lineTo(xs(h2), cy); ctx.stroke();
        if (hi > MAX && p > 0.9) { ctx.beginPath(); ctx.moveTo(xs(MAX) - 5, cy - 4); ctx.lineTo(xs(MAX), cy); ctx.lineTo(xs(MAX) - 5, cy + 4); ctx.stroke(); }
        ctx.fillStyle = vc; ctx.beginPath(); ctx.arc(xs(mid), cy, 4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        if (wide) text(ctx, L(vz, ve), w - pad, cy + 4, { size: 10, align: 'right', color: vc, weight: 600, alpha: p });
        r.cy = cy;
        y += rowH;
      });
      if (readout) {
        const r = rows[hot];
        readout.textContent = r
          ? `${L(r.zh, r.en)} · ${r.e > 0 ? '+' : ''}${r.e.toFixed(2)} ${L('点', 'pts')} [${r.lo.toFixed(2)}, ${r.hi > 0 ? '+' : ''}${r.hi.toFixed(2)}] · ${L(verdict[r.v][0], verdict[r.v][1])} · ${r.src}`
          : L('悬停任一行查看估计值、区间与出处', 'Hover a row for its estimate, interval and source');
      }
    }
    mount(el, { duration, draw, hover: true });
  }

  const figs = { queue: figQueue, upload: figUpload, matrix: figMatrix, seg: figSeg, cores: figCores, prompt: figPrompt, forest: figForest };
  document.querySelectorAll('[data-fig]').forEach((el) => { const f = figs[el.dataset.fig]; if (f) f(el); });
})();
