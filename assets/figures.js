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
  // Wrap a string to maxW (CJK breaks anywhere, Latin at spaces); returns the y below the last line.
  function wrapText(ctx, str, x, y, maxW, lineH, o = {}) {
    ctx.font = `${o.weight || 400} ${o.size || 11}px ${o.font || MONO}`;
    const lines = []; let line = '';
    const tokens = str.match(/[\u2E80-\u9FFF\uFF00-\uFFEF]|[^\s\u2E80-\u9FFF\uFF00-\uFFEF]+|\s+/g) || [];
    tokens.forEach((tk) => {
      const next = line + tk;
      if (line && ctx.measureText(next.trimEnd()).width > maxW) { lines.push(line.trimEnd()); line = tk.trimStart(); }
      else line = next;
    });
    if (line.trim()) lines.push(line.trimEnd());
    lines.forEach((ln, i) => text(ctx, ln, x, y + i * lineH, o));
    return y + lines.length * lineH;
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
    let stopAt = spec.duration;
    // Pause / continue sits next to Replay; its label follows the clock.
    let toggle = null;
    if (replay) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'fig-replay fig-toggle';
      replay.before(toggle);
      toggle.addEventListener('click', () => {
        if (playing) pause();
        else if (t >= spec.duration) play(0);
        else resume();
      });
    }
    function syncToggle() {
      if (!toggle) return;
      const done = t >= spec.duration;
      toggle.hidden = reduced() || (!playing && t >= spec.duration);
      toggle.innerHTML = playing
        ? `<i class="icon i-pause" aria-hidden="true"></i><span class="zh">暂停</span><span class="en">Pause</span>`
        : `<i class="icon i-play" aria-hidden="true"></i><span class="zh">${done ? '从头播放' : '继续'}</span><span class="en">${done ? 'Play again' : 'Continue'}</span>`;
    }
    function frame(now) {
      raf = 0;
      if (!playing) return;
      t = Math.min(stopAt, t + Math.min(64, now - last));
      last = now;
      render();
      if (t >= stopAt) { playing = false; syncToggle(); return; }
      if (visible) raf = requestAnimationFrame(frame);
    }
    function run() {
      playing = true; last = performance.now(); syncToggle();
      if (!raf) raf = requestAnimationFrame(frame);
    }
    function pause() { playing = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } syncToggle(); }
    function resume() { stopAt = spec.duration; if (reduced()) { t = spec.duration; render(); syncToggle(); return; } run(); }
    function play(from) {
      started = true; stopAt = spec.duration;
      if (reduced()) { t = spec.duration; pause(); render(); return; }
      t = from; run();
    }
    function reveal() {
      const r = stage.getBoundingClientRect();
      const vis = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 72));
      if (vis < Math.min(r.height, window.innerHeight) * 0.5) stage.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    }
    function seek(i) {
      reveal();
      // Play just that chapter and hold on its last, settled frame.
      const end = i + 1 < chapters.length ? chapters[i + 1].at - 1 : spec.duration;
      started = true;
      if (reduced()) { t = end; pause(); render(); return; }
      t = chapters[i].at; stopAt = end; run();
    }
    if (replay) replay.addEventListener('click', () => { reveal(); play(0); });
    if (motionQuery && motionQuery.addEventListener) {
      motionQuery.addEventListener('change', () => { if (reduced()) { pause(); t = spec.duration; render(); } syncToggle(); });
    }

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
      }, { threshold: 0.15 }).observe(stage);
    } else { t = spec.duration; started = true; }
    if (reduced()) { t = spec.duration; started = true; }

    if (spec.hover) {
      const move = (e) => { const r = canvas.getBoundingClientRect(); api.pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; render(); };
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerleave', () => { api.pointer = null; render(); });
    }
    langHooks.push(() => { syncChrome.force = true; render(); syncToggle(); });
    resize();
  }

  /* =====================================================================
   * FIG.A — chunk table → workers → staging manifest → one version.
   * A worker dies mid-batch; its lease runs out; another worker finishes
   * the batch, skipping files already staged. Artifacts are verified before
   * anything is committed, so the failure never reaches COMMITTING.
   * ===================================================================== */
  function figQueue(el) {
    const N = 157; const B = 4; const T0 = 1500; const FILES = 10025;
    const rand = mulberry32(20417);
    const chunks = [...Array(N)].map((_, i) => ({ i, files: i === N - 1 ? 41 : 64, appear: 120 + (i / N) * 900 + rand() * 80, runs: [] }));
    let acc = 0; chunks.forEach((c) => { c.base = acc; acc += c.files; });
    const ws = [1, 2, 3, 4, 5].map((id) => ({ id, free: id === 5 ? Infinity : T0 + (id - 1) * 150, on: true, spans: [], claims: [] }));
    let next = 0; let orphan = null; let DIE = 0; let LEASE = 0;
    const work = () => 160 + rand() * 120;
    for (let guard = 0; guard < 4000; guard += 1) {
      let wk = null;
      ws.forEach((x) => { if (x.on && (!wk || x.free < wk.free)) wk = x; });
      if (!wk || wk.free === Infinity) break;
      const claim = wk.free;
      let batch; let reclaim = false;
      if (wk.id === 5 && orphan && !orphan.taken) { batch = orphan.list; orphan.taken = true; reclaim = true; }
      else if (next < N) { batch = []; while (batch.length < B && next < N) batch.push(next++); }
      else { wk.on = false; continue; }
      wk.claims.push({ at: claim, batch });
      let cur = claim + 140; let died = false;
      const doomed = wk.id === 3 && !orphan && claim >= 4200 && batch.length === B;
      for (let k = 0; k < batch.length; k += 1) {
        const c = chunks[batch[k]];
        if (reclaim) {
          const prev = c.runs[0];
          if (prev.kind === 'run') { c.runs.push({ w: 5, claim, start: cur, end: cur + 180, kind: 'skip', from: 1 }); cur += 180; continue; }
          const from = prev.start != null ? prev.frac : 0;
          const d = prev.start != null ? prev.d * (1 - from) + 60 : work();
          c.runs.push({ w: 5, claim, start: cur, end: cur + d, kind: 'run', from, skipTo: from });
          wk.spans.push({ i: c.i, start: cur, end: cur + d }); cur += d;
          continue;
        }
        const d = work();
        if (doomed && k === 2) {
          DIE = cur + d * 0.6; LEASE = DIE + 1800;
          for (let j = k; j < batch.length; j += 1) {
            const cc = chunks[batch[j]]; const here = j === k;
            cc.runs.push({ w: 3, claim, start: here ? cur : null, d, frac: here ? 0.6 : 0, kind: 'stall' });
          }
          wk.spans.push({ i: c.i, start: cur, end: DIE });
          orphan = { list: batch, taken: false };
          ws[4].free = LEASE; wk.on = false; died = true; break;
        }
        c.runs.push({ w: wk.id, claim, start: cur, end: cur + d, kind: 'run', from: 0 });
        wk.spans.push({ i: c.i, start: cur, end: cur + d }); cur += d;
      }
      if (!died) wk.free = cur + 80;
    }
    let tDone = 0;
    chunks.forEach((c) => c.runs.forEach((r) => { if (r.end) tDone = Math.max(tDone, r.end); }));
    const FLY = 520;
    const tVerify = tDone + FLY + 150; const tCommit = tVerify + 1300; const tReady = tCommit + 1100; const duration = tReady + 800;

    // Per file: when it was staged, by whom, and whether a later run skipped it by key.
    chunks.forEach((c) => {
      const [r1, r2] = c.runs; c.ft = [];
      for (let f = 0; f < c.files; f += 1) {
        const q = (f + 0.5) / c.files;
        let t = null; let by = null; let skip = null;
        if (r1.kind === 'run') { t = r1.start + q * (r1.end - r1.start); by = r1.w; }
        else if (r1.start != null && q < r1.frac) { t = r1.start + q * r1.d; by = 3; }
        if (r2) {
          if (t != null) skip = r2.kind === 'skip' ? r2.start + q * (r2.end - r2.start) : r2.start + (q / Math.max(r2.from, 0.01)) * 120;
          else { const u = (q - r2.from) / (1 - r2.from); t = r2.start + 120 + u * (r2.end - r2.start - 120); by = 5; }
        }
        c.ft.push({ t, by, skip });
      }
    });
    const orphanSet = new Set(orphan ? orphan.list : []);

    const events = [
      { at: 0, s: 0, zh: `submit   task#20417 files=10,025 → ${N} 个 chunk 与任务状态同一事务写入，0.89 s 返回`, en: `submit   task#20417 files=10,025 → ${N} chunks written in the same transaction as task state; returns in 0.89 s` },
      { at: T0, s: 1, zh: 'claim    worker-1..4 各用一次短事务 SKIP LOCKED 领一批，之后按租约处理', en: 'claim    workers 1–4 each claim a batch in one short SKIP LOCKED transaction, then work under a lease' },
      { at: T0 + 900, s: 2, zh: 'build    产物写入 staging，逐个校验非空 / 类型 / SHA-256', en: 'build    artifacts to staging, each checked: non-empty / type / SHA-256' },
      { at: DIE, s: 2, cls: 'warn', fail: true, zh: 'WARN     worker-3 心跳中断（Pod 重启）；它那一批停在物化阶段，等租约到期', en: 'WARN     worker-3 heartbeat lost (pod restart); its batch waits in MATERIALIZING for the lease to expire' },
      { at: LEASE, s: 2, cls: 'dim', zh: 'reclaim  租约到期，worker-5 接手整批；已在 staging 的文件按 task+file 键跳过，只补余下的', en: 'reclaim  lease expired; worker-5 takes the batch, skips files already staged (key task+file), fills in the rest' },
      { at: tVerify, s: 3, zh: 'verify   10,025 / 10,025 个产物校验通过，才进入提交', en: 'verify   10,025 / 10,025 artifacts check out; only now does it commit' },
      { at: tCommit, s: 4, zh: 'version  LakeFS commit 一次，血缘事件闭合', en: 'version  one LakeFS commit, lineage events closed' },
      { at: tReady, s: 5, cls: 'ok', zh: 'READY    产物可读 · 版本落账 · 血缘闭合 — 数据集版本数 = 1', en: 'READY    readable · versioned · lineage closed — dataset versions = 1' }
    ];

    function draw(ctx, w, h, t) {
      const wide = w >= 760;
      const pad = wide ? 22 : 14;
      const head = 34;
      // Regions.
      let Lr; let Mr; let Rr;
      if (wide) {
        const colW = w - pad * 2; const gap = 30;
        const lw = colW * 0.36; const mw = colW * 0.2; const rw = colW - lw - mw - gap * 2;
        Lr = { x: pad, y: head, w: lw, h: h - head - pad };
        Mr = { x: pad + lw + gap, y: head, w: mw, h: h - head - pad };
        Rr = { x: pad + lw + mw + gap * 2, y: head, w: rw, h: h - head - pad };
      } else {
        const lh = Math.ceil(N / 20) * ((w - pad * 2) / 20); const mh = 44; const rh = h - 3 * 26 - lh - mh - 6;
        Lr = { x: pad, y: 26, w: w - pad * 2, h: lh };
        Mr = { x: pad, y: 26 * 2 + lh, w: w - pad * 2, h: mh };
        Rr = { x: pad, y: 26 * 3 + lh + mh, w: w - pad * 2, h: rh };
      }
      const capY = (r) => r.y - (wide ? 14 : 10);
      const caption = (r, n, zh, en) => {
        const a = text(ctx, n, r.x, capY(r), { size: 10.5, color: C.blue, weight: 600 });
        text(ctx, L(zh, en), r.x + a + 8, capY(r), { size: 11, color: C.muted });
      };
      caption(Lr, '01', 'chunk 表 · MySQL', 'chunk table · MySQL');
      caption(Mr, '02', 'Worker · Redis 心跳', 'workers · Redis heartbeat');
      caption(Rr, '03', 'staging 清单 → LakeFS', 'staging manifest → LakeFS');

      /* --- 01 chunk tiles, each a 8×8 texture of its files --- */
      const cols = wide ? 13 : 20; const rows = Math.ceil(N / cols);
      const tile = Math.min(Lr.w / cols, Lr.h / rows);
      const gap = Math.max(2, tile * 0.16); const inner = tile - gap; const pitch = inner / 8; const dot = Math.max(1, pitch * 0.66);
      const tpos = (i) => ({ x: Lr.x + (i % cols) * tile, y: Lr.y + Math.floor(i / cols) * tile });
      const verifyP = (g) => clamp((t - tVerify - (g / FILES) * 900) / 160);
      let staged = 0;
      chunks.forEach((c) => {
        if (t < c.appear) return;
        const a = clamp((t - c.appear) / 260);
        const { x, y } = tpos(c.i);
        const [r1, r2] = c.runs;
        const leased = r1 && ((t >= r1.claim && t < (r1.kind === 'stall' ? DIE : r1.end)) || (r2 && t >= r2.claim && t < r2.end));
        const waiting = orphanSet.has(c.i) && r1.kind === 'stall' && t >= DIE && t < LEASE;
        ctx.globalAlpha = a;
        for (let f = 0; f < c.files; f += 1) {
          const e = c.ft[f];
          let col = C.line2;
          if (e.t != null && t >= e.t) { staged += 1; const v = verifyP(c.base + f); col = v > 0 ? mix(C.blue, C.green, v) : C.blue; }
          else if (waiting) col = alpha(C.amber, 0.55);
          else if (leased) col = C.blueSoft;
          ctx.fillStyle = col; ctx.fillRect(x + (f % 8) * pitch, y + Math.floor(f / 8) * pitch, dot, dot);
        }
        if (leased || waiting) {
          ctx.strokeStyle = waiting ? C.amber : C.blue; ctx.lineWidth = 1.2;
          ctx.strokeRect(x - 1.5, y - 1.5, inner + 2.5, inner + 2.5);
        }
        // End frame keeps a quiet mark on the recovered batch.
        if (orphanSet.has(c.i) && t >= LEASE) {
          ctx.strokeStyle = alpha(C.amber, 0.7); ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
          ctx.strokeRect(x - 3, y - 3, inner + 5.5, inner + 5.5); ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;
      });

      /* --- 02 workers --- */
      const wy = (k) => (wide ? Mr.y + (Mr.h / 5) * (k + 0.5) : Mr.y + Mr.h / 2);
      const wx = (k) => (wide ? Mr.x : Mr.x + (Mr.w / 5) * k);
      const rowW = wide ? Mr.w : Mr.w / 5 - 6;
      const anchorOut = (k) => ({ x: wide ? Mr.x + Math.min(Mr.w - 10, 150) : wx(k) + rowW / 2, y: wide ? wy(k) - 4 : Mr.y + Mr.h - 4 });
      ws.forEach((wk, k) => {
        const x = wx(k); const y = wy(k);
        const dead = wk.id === 3 && t >= DIE; const standby = wk.id === 5 && t < LEASE;
        const reclaiming = wk.id === 5 && t >= LEASE && orphan && chunks[orphan.list[orphan.list.length - 1]].runs[1] && t < chunks[orphan.list[orphan.list.length - 1]].runs[1].end;
        const span = wk.spans.find((sp) => t >= sp.start && t < sp.end);
        const beat = !dead && !standby && t >= T0 - 400 ? ((t - wk.id * 173) % 800 + 800) % 800 : -1;
        // status dot: steady, with a small pulse on each heartbeat
        const dc = dead ? C.red : standby ? C.faint : reclaiming ? C.amber : span ? C.blue : C.quiet;
        if (beat >= 0 && beat < 380) { const q = beat / 380; ctx.strokeStyle = alpha(dc, 0.5 * (1 - q)); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + 5, y - 4, 4 + q * 6, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = dc; ctx.beginPath(); ctx.arc(x + 5, y - 4, 4, 0, Math.PI * 2); ctx.fill();
        text(ctx, wide ? `worker-${wk.id}` : `w${wk.id}`, x + 16, y, { size: wide ? 12 : 11, color: dead ? C.red : standby ? C.faint : C.ink, weight: 600 });
        let status = ''; let sc = C.quiet;
        if (dead && t < LEASE) { status = L('心跳中断', 'heartbeat lost'); sc = C.red; }
        else if (dead) { status = L('已由 worker-5 接手', 'taken over by worker-5'); sc = C.faint; }
        else if (standby) { status = L('待命', 'standby'); sc = C.faint; }
        else if (reclaiming) { status = L('接手 · 跳过已存在', 'reclaim · skip existing'); sc = C.amberInk; }
        else if (span) { status = `chunk ${String(span.i + 1).padStart(3, '0')}`; sc = C.muted; }
        else if (t >= T0) status = L('空闲', 'idle');
        if (wide) text(ctx, status, x + 16, y + 17, { size: 11, color: sc });
        else if (dead || reclaiming || standby) text(ctx, dead ? (t < LEASE ? L('中断', 'lost') : L('已接手', 'taken')) : reclaiming ? L('接手', 'reclaim') : L('待命', 'idle'), x + 16, y + 15, { size: 10, color: sc });
        // Lease bar for the dead worker, marked as compressed time.
        if (dead && t < LEASE && wide) {
          const q = 1 - (t - DIE) / (LEASE - DIE);
          ctx.fillStyle = C.line2; ctx.fillRect(x + 16, y + 26, rowW - 24, 3);
          ctx.fillStyle = C.amber; ctx.fillRect(x + 16, y + 26, (rowW - 24) * q, 3);
          text(ctx, L('租约剩余 · 时间压缩示意', 'lease left · time compressed'), x + 16, y + 42, { size: 10, color: C.amberInk });
        }
        // Claim: one short transaction, drawn as a brief link from the batch to the worker.
        wk.claims.forEach((cl) => {
          const q = (t - cl.at) / 420;
          if (q < 0 || q > 1) return;
          cl.batch.forEach((i) => {
            const p = tpos(i);
            const x0 = wide ? p.x + inner + 2 : p.x + inner / 2; const y0 = wide ? p.y + inner / 2 : p.y + inner + 2;
            const x1 = wide ? x - 4 : x + rowW / 2; const y1 = wide ? y - 4 : Mr.y + 2;
            ctx.strokeStyle = alpha(wk.id === 5 ? C.amber : C.blue, 0.55 * (1 - q)); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x0, y0);
            if (wide) ctx.bezierCurveTo(x0 + (x1 - x0) * 0.5, y0, x0 + (x1 - x0) * 0.5, y1, x1, y1);
            else ctx.bezierCurveTo(x0, y0 + (y1 - y0) * 0.5, x1, y0 + (y1 - y0) * 0.5, x1, y1);
            ctx.stroke();
          });
        });
      });

      /* --- 03 staging manifest: one cell per file, in file order --- */
      const verH = wide ? 92 : 70;
      const S = { x: Rr.x, y: Rr.y, w: Rr.w, h: Rr.h - verH };
      const scols = Math.max(40, Math.floor(Math.sqrt(FILES * S.w / S.h)));
      const srows = Math.ceil(FILES / scols);
      const sp = Math.min(S.w / scols, S.h / srows); const sd = Math.max(1, sp * 0.72);
      const sx = (g) => S.x + (g % scols) * sp; const sy = (g) => S.y + Math.floor(g / scols) * sp;
      ctx.fillStyle = '#fbfbf8'; ctx.fillRect(S.x - 4, S.y - 4, scols * sp + 8, srows * sp + 8);
      ctx.strokeStyle = C.line2; ctx.lineWidth = 1; ctx.strokeRect(S.x - 4.5, S.y - 4.5, scols * sp + 9, srows * sp + 9);
      const landed = []; const flying = [];
      chunks.forEach((c) => {
        for (let f = 0; f < c.files; f += 1) {
          const e = c.ft[f]; if (e.t == null || t < e.t) continue;
          if (t < e.t + FLY) flying.push([c, f, e]); else landed.push(c.base + f);
        }
      });
      ctx.fillStyle = C.blue;
      landed.forEach((g) => { const v = verifyP(g); if (v > 0) return; ctx.fillRect(sx(g), sy(g), sd, sd); });
      ctx.fillStyle = C.green;
      landed.forEach((g) => { const v = verifyP(g); if (v <= 0) return; ctx.globalAlpha = 0.35 + 0.65 * v; ctx.fillRect(sx(g), sy(g), sd, sd); });
      ctx.globalAlpha = 1;
      // Files that a later run skipped by key: outline the region they occupy.
      if (orphan && t >= LEASE) {
        let gmin = Infinity; let gmax = -1;
        orphan.list.forEach((i) => { const c = chunks[i]; c.ft.forEach((e, f) => { if (e.skip != null) { gmin = Math.min(gmin, c.base + f); gmax = Math.max(gmax, c.base + f); } }); });
        if (gmax >= 0) {
          const y0 = sy(gmin) - 2; const y1 = sy(gmax) + sp + 2;
          const q = clamp((t - LEASE) / 400);
          ctx.strokeStyle = alpha(C.amber, 0.9 * q); ctx.lineWidth = 1.2;
          ctx.strokeRect(S.x - 2, y0, scols * sp + 4, y1 - y0);
          const lx = wide ? S.x + scols * sp + 8 : S.x;
          if (wide && lx + 60 < w) {
            text(ctx, L('已存在', 'present'), lx, y0 + 9, { size: 10, color: C.amberInk, alpha: q });
            text(ctx, L('按键跳过', 'skipped'), lx, y0 + 21, { size: 10, color: C.amberInk, alpha: q });
          }
        }
      }
      // In flight: short dots on one fixed path per worker — a curve to the manifest edge, then straight in.
      const entry = (k) => (wide ? { x: S.x - 10, y: S.y + ((k + 0.5) / 5) * srows * sp } : { x: S.x + ((k + 0.5) / 5) * scols * sp, y: S.y - 10 });
      const pathAt = (k, u) => {
        const a0 = anchorOut(k); const e1 = entry(k);
        const m = 1 - u;
        if (wide) { const c1 = a0.x + (e1.x - a0.x) * 0.55; return { x: m * m * m * a0.x + 3 * m * m * u * c1 + 3 * m * u * u * c1 + u * u * u * e1.x, y: m * m * m * a0.y + 3 * m * m * u * a0.y + 3 * m * u * u * e1.y + u * u * u * e1.y }; }
        const c1 = a0.y + (e1.y - a0.y) * 0.55; return { x: m * m * m * a0.x + 3 * m * m * u * a0.x + 3 * m * u * u * e1.x + u * u * u * e1.x, y: m * m * m * a0.y + 3 * m * m * u * c1 + 3 * m * u * u * c1 + u * u * u * e1.y };
      };
      const busy = new Set(flying.map(([, , e]) => e.by - 1));
      busy.forEach((k) => {
        ctx.strokeStyle = alpha(k === 4 ? C.amber : C.blue, 0.22); ctx.lineWidth = 1; ctx.beginPath();
        for (let q = 0; q <= 1.0001; q += 0.05) { const pt = pathAt(k, q); if (q === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); }
        ctx.stroke();
      });
      // Every fourth file is drawn as a packet; they stop at the manifest edge and the slot lights up.
      flying.forEach(([c, f, e]) => {
        if (f % 4) return;
        const u = (t - e.t) / FLY; const k = e.by - 1;
        const pt = pathAt(k, easeInOut(u));
        ctx.fillStyle = e.by === 5 ? C.amber : C.blue; ctx.globalAlpha = 0.9 * (1 - Math.max(0, u - 0.85) / 0.15);
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 1.8, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      // Verification sweep line.
      if (t >= tVerify && t < tVerify + 1000) {
        const g = Math.min(FILES - 1, Math.floor(((t - tVerify) / 900) * FILES));
        ctx.strokeStyle = C.green; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(S.x - 4, sy(g) + sp); ctx.lineTo(S.x + scols * sp + 4, sy(g) + sp); ctx.stroke();
      }
      text(ctx, `${staged.toLocaleString('en-US')} / 10,025`, S.x, S.y + srows * sp + 22, { size: wide ? 13 : 11.5, color: C.ink, weight: 650, font: SANS });
      text(ctx, t >= tVerify + 900 ? L('全部校验通过', 'all verified') : L('已落 staging', 'staged'), S.x + scols * sp, S.y + srows * sp + 22, { size: 10.5, color: t >= tVerify + 900 ? C.green : C.quiet, align: 'right' });

      /* --- version line: main, with one new commit --- */
      const gy = Rr.y + Rr.h - (wide ? 18 : 12);
      const gx0 = Rr.x; const gx1 = Rr.x + scols * sp; const cx = lerp(gx0, gx1, 0.78);
      ctx.strokeStyle = C.faint; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(gx0, gy); ctx.lineTo(gx1, gy); ctx.stroke();
      [0.1, 0.32, 0.54].forEach((q) => { ctx.fillStyle = '#fff'; ctx.strokeStyle = C.faint; ctx.beginPath(); ctx.arc(lerp(gx0, gx1, q), gy, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
      text(ctx, 'main', gx0, gy - 9, { size: 10, color: C.quiet });
      if (t >= tCommit) {
        const q = easeOut(clamp((t - tCommit) / 500));
        // Bracket from the manifest to the commit: metadata points at the verified objects, nothing moves.
        ctx.strokeStyle = alpha(C.green, 0.6 * q); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(S.x, S.y + srows * sp + 30); ctx.lineTo(S.x, S.y + srows * sp + 36); ctx.lineTo(gx1, S.y + srows * sp + 36); ctx.lineTo(gx1, S.y + srows * sp + 30); ctx.moveTo(cx, S.y + srows * sp + 36); ctx.lineTo(cx, gy - 6); ctx.stroke();
        ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(cx, gy, 3.5 + 2.5 * q, 0, Math.PI * 2); ctx.fill();
        text(ctx, L('1 次 commit · 数据集版本 +1', '1 commit · dataset version +1'), cx - 10, gy - 10, { size: 10.5, color: C.green, weight: 600, align: 'right', alpha: q });
      } else {
        ctx.strokeStyle = C.faint; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(cx, gy, 5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    // State rail and the current event line follow the same clock; the full log is a disclosure.
    const rail = [...el.querySelectorAll('.machine-rail li')];
    const now = el.querySelector('.machine-now');
    const log = el.querySelector('.machine-log');
    let shown = -1; let shownLang = '';
    function dom(t) {
      const n = events.filter((ev) => t >= ev.at).length;
      if (n === shown && lang() === shownLang) return;
      shown = n; shownLang = lang();
      const cur = n ? events[n - 1] : null;
      if (now) { now.textContent = cur ? L(cur.zh, cur.en) : ''; now.className = `machine-now mono ${cur && cur.cls ? cur.cls : ''}`; }
      if (log) {
        log.textContent = '';
        events.slice(0, n).forEach((ev) => { const s2 = document.createElement('span'); if (ev.cls) s2.className = ev.cls; s2.textContent = `${L(ev.zh, ev.en)}\n`; log.appendChild(s2); });
      }
      const s = cur ? cur.s : -1;
      rail.forEach((li, i) => {
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
      footAfter: el.querySelector('.machine-rail'),
      chapters: [
        { at: 0, zh: '提交', en: 'Submit', sayZh: '10,025 个文件切成 157 个 chunk，与任务状态在同一个 MySQL 事务里写入，0.89 秒返回。', sayEn: '10,025 files become 157 chunks, written in the same MySQL transaction as the task state; the call returns in 0.89 s.' },
        { at: T0, zh: '领取', en: 'Claim', sayZh: '每个 Worker 用一次短事务 FOR UPDATE SKIP LOCKED 领一批，之后按租约处理，产物逐个写进 staging。', sayEn: 'Each worker claims a batch in one short FOR UPDATE SKIP LOCKED transaction, then works under a lease, writing artifacts to staging one by one.' },
        { at: DIE, zh: '中断', en: 'Failure', sayZh: 'worker-3 的 Pod 重启，心跳中断。它那一批停在物化阶段，要等租约到期才能被别人接手。', sayEn: "worker-3's pod restarts and its heartbeat stops. Its batch waits in the materializing stage until the lease expires." },
        { at: LEASE, zh: '接手', en: 'Reclaim', sayZh: 'worker-5 接手整批。已经在 staging 里的文件按 task + file 键跳过，只补上缺的部分。', sayEn: 'worker-5 takes over the batch. Files already in staging are skipped by the task + file key; only the missing ones are produced.' },
        { at: tVerify, zh: '校验与落账', en: 'Verify, commit', sayZh: '全部产物校验通过后才提交：一次 LakeFS commit，版本与血缘同时落账。故障从头到尾没有越过物化阶段。', sayEn: 'Only after every artifact checks out does it commit: one LakeFS commit, version and lineage recorded together. The failure never got past materializing.' }
      ]
    });
  }

  /* =====================================================================
   * FIG.B — control flow and data flow, separated.
   * Browser, backend and object storage. The old path pushes bytes through the
   * backend and dies at the gateway's 60 s timeout. The new path asks the backend
   * only for signatures; the bytes go straight to storage. Completion lists the
   * prefix itself: 310 / 310 merges, 309 / 310 is refused. Both results stay.
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
    // Timeline (ms).
    const P0 = 200; const P1 = 2600;            // old proxy path, cut at 60 s
    const S0 = 2900; const S1 = 4100;           // signing round trip
    const D0 = 4300; const D1 = 8900;           // direct upload, 237 s compressed
    const C0 = 9100; const C1 = 10500;          // complete: list + verify, merge
    const G0 = 10800; const G1 = 12400;         // second acceptance with a gap
    const duration = 13400;
    const simAt = (t) => win(t, D0, D1) * TOTAL;

    function draw(ctx, w, h, t) {
      const wide = w >= 700; const pad = wide ? 22 : 14;
      /* --- actors --- */
      const topH = wide ? h * 0.5 : h * 0.46;
      const ax = wide ? [pad + 80, w / 2, w - pad - 90] : [pad + 44, w / 2, w - pad - 46];
      const ay = wide ? 58 : 50;
      const boxW = wide ? 150 : 84; const boxH = wide ? 50 : 44;
      const actor = (x, zh, en, subZh, subEn, color) => {
        ctx.fillStyle = '#fff'; rr(ctx, x - boxW / 2, ay - boxH / 2, boxW, boxH, 4); ctx.fill();
        ctx.strokeStyle = color || C.line; ctx.lineWidth = 1.2; rr(ctx, x - boxW / 2 + 0.5, ay - boxH / 2 + 0.5, boxW - 1, boxH - 1, 4); ctx.stroke();
        text(ctx, L(zh, en), x, ay - 2, { size: wide ? 12.5 : 11, color: C.ink, weight: 650, align: 'center', font: SANS });
        text(ctx, L(subZh, subEn), x, ay + 14, { size: wide ? 10 : 9, color: C.quiet, align: 'center' });
      };
      actor(ax[0], '浏览器', 'Browser', '约 10 GB 压缩包', '~10 GB archive');
      actor(ax[1], '后端', 'Backend', '签名 · 校验', 'sign · verify', t >= P1 - 200 && t < S0 ? C.red : null);
      actor(ax[2], '对象存储', 'Object storage', 'staging/part-*', 'staging/part-*');
      const edge = (i, side) => ({ x: ax[i] + side * boxW / 2, y: ay });

      // Paths: proxy (through the backend, above), direct (below, bypassing it), signing (between browser and backend).
      const proxyA = [edge(0, 1), edge(1, -1)]; const proxyB = [edge(1, 1), edge(2, -1)];
      const directY = ay + (wide ? 92 : 78);
      const directPath = (u) => {
        // browser bottom → down → across → up into storage bottom
        const x0 = ax[0]; const x1 = ax[2]; const yb = ay + boxH / 2;
        const segs = [[x0, yb, x0, directY], [x0, directY, x1, directY], [x1, directY, x1, yb]];
        const lens = segs.map(([a, b, c, d]) => Math.hypot(c - a, d - b)); const tot = lens.reduce((s, v) => s + v, 0);
        let dist = u * tot;
        for (let i = 0; i < 3; i += 1) { if (dist <= lens[i]) { const [a, b, c, d] = segs[i]; const q = dist / lens[i]; return { x: lerp(a, c, q), y: lerp(b, d, q) }; } dist -= lens[i]; }
        return { x: x1, y: yb };
      };
      // static rails
      const proxyCut = t >= P1;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = proxyCut ? alpha(C.red, 0.35) : C.line; ctx.setLineDash(proxyCut ? [3, 3] : []);
      ctx.beginPath(); ctx.moveTo(proxyA[0].x, ay); ctx.lineTo(proxyA[1].x, ay); ctx.moveTo(proxyB[0].x, ay); ctx.lineTo(proxyB[1].x, ay); ctx.stroke(); ctx.setLineDash([]);
      if (wide) text(ctx, L('① 旧路径：字节经后端转发', '① old path: bytes relayed by the backend'), (ax[1] + ax[2]) / 2, ay - 12, { size: wide ? 10.5 : 9, color: proxyCut ? C.red : C.muted, align: 'center' });
      const directOn = t >= D0 - 200;
      ctx.strokeStyle = directOn ? alpha(C.blue, 0.35) : C.line2; ctx.lineWidth = directOn ? 2 : 1.2;
      ctx.beginPath(); ctx.moveTo(ax[0], ay + boxH / 2); ctx.lineTo(ax[0], directY); ctx.lineTo(ax[2], directY); ctx.lineTo(ax[2], ay + boxH / 2); ctx.stroke();
      text(ctx, wide ? L('③ 新路径：浏览器按片直传，不经后端', '③ new path: parts go straight from the browser, not through the backend') : L('③ 直传，不经后端', '③ direct, bypassing the backend'), w / 2, directY + 16, { size: wide ? 10.5 : 9, color: directOn ? C.blue : C.quiet, align: 'center' });

      // ① proxy packets, then the cut.
      if (t >= P0 && t < P1 + 600) {
        const n = 14;
        for (let k = 0; k < n; k += 1) {
          const u = ((t - P0) / 900 + k / n) % 1;
          if (t >= P1) break;
          const total = (proxyA[1].x - proxyA[0].x) + (proxyB[1].x - proxyB[0].x);
          let d = u * total; let x;
          if (d < proxyA[1].x - proxyA[0].x) x = proxyA[0].x + d; else { d -= proxyA[1].x - proxyA[0].x; x = proxyB[0].x + d; if (x > ax[1] + boxW / 2 && x < ax[1] - boxW / 2) continue; }
          ctx.fillStyle = C.faint; ctx.beginPath(); ctx.arc(x, ay, 2, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (t >= P0 && t < S0) {
        const secs = Math.min(60, Math.round(win(t, P0, P1) * 60));
        text(ctx, `${secs} s`, ax[1], ay - boxH / 2 - 10, { size: 12, color: secs >= 60 ? C.red : C.muted, weight: 650, align: 'center' });
      }
      if (proxyCut) {
        const cx = (ax[1] + boxW / 2 + ax[2] - boxW / 2) / 2;
        cross(ctx, cx, ay, 5, C.red, 2);
        text(ctx, wide ? L('网关 60 s 超时，连接被掐断', 'gateway timeout at 60 s: connection cut') : L('60 s 超时', '60 s timeout'), cx, wide ? ay + 18 : ay - boxH / 2 - 8, { size: wide ? 10.5 : 9, color: C.red, align: 'center', alpha: win(t, P1, P1 + 300) });
      }
      // ② signing round trip: a thin dashed request and a response carrying 310 URLs.
      if (t >= S0) {
        const q = easeInOut(win(t, S0, S0 + 500)); const r = easeInOut(win(t, S0 + 600, S1));
        const yq = ay + 12; const x0 = ax[0] + boxW / 2; const x1 = ax[1] - boxW / 2;
        ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.strokeStyle = C.ink;
        ctx.beginPath(); ctx.moveTo(x0, yq); ctx.lineTo(lerp(x0, x1, q), yq); ctx.stroke();
        if (r > 0) { ctx.strokeStyle = C.green; ctx.beginPath(); ctx.moveTo(x1, yq + 8); ctx.lineTo(lerp(x1, x0, r), yq + 8); ctx.stroke(); }
        ctx.setLineDash([]);
        text(ctx, wide ? L('② 只要签名：每片一个预签名 URL', '② signatures only: one presigned URL per part') : L('② 只要签名', '② sign only'), (x0 + x1) / 2, yq + 24, { size: wide ? 10 : 9, color: C.muted, align: 'center', alpha: q });
      }
      // ③ direct upload packets.
      const sim = simAt(t);
      if (t >= D0 && t < D1 + 400) {
        parts.forEach((p) => {
          if (sim < p.start || sim > p.end + 6) return;
          const u = clamp((sim - p.start) / (p.end - p.start + 6));
          const a = directPath(u); const b = directPath(Math.max(0, u - 0.035));
          ctx.strokeStyle = C.blue; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.stroke();
        });
      }
      if (t >= D0) {
        text(ctx, `${Math.round(sim)} s`, ax[0] - (wide ? 0 : 0), directY + (wide ? 34 : 30), { size: wide ? 16 : 13, color: C.ink, weight: 650, font: SANS, align: 'center' });
        text(ctx, L('时间压缩示意', 'time compressed'), ax[0], directY + (wide ? 50 : 44), { size: 9.5, color: C.quiet, align: 'center' });
        if (sim >= TOTAL) text(ctx, '41.8 MiB/s', ax[2], directY + (wide ? 34 : 30), { size: wide ? 16 : 13, color: C.blue, weight: 650, font: SANS, align: 'center' });
      }
      // ④ complete: the backend lists the prefix itself — its own lane, below the old path.
      if (t >= C0) {
        const q = win(t, C0, C0 + 400);
        const x0 = ax[1]; const x1 = ax[2]; const y0 = ay + boxH / 2; const yl = ay + (wide ? 50 : 44);
        ctx.setLineDash([3, 3]); ctx.strokeStyle = alpha(C.green, q); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, yl); ctx.lineTo(x1 - boxW / 2 - 8, yl); ctx.lineTo(x1 - boxW / 2 - 8, y0 - 6); ctx.stroke(); ctx.setLineDash([]);
        text(ctx, wide ? L('④ complete：后端自己列目录，核对片数与字节', '④ complete: the backend lists the prefix, checks parts and bytes') : L('④ 列目录核对', '④ list & check'), (x0 + x1) / 2 - boxW / 4, yl + 14, { size: wide ? 10 : 9, color: C.green, align: 'center', alpha: q });
      }

      /* --- two acceptance runs, side by side, both kept --- */
      const gy0 = directY + (wide ? 84 : 78);
      void topH;
      const colW = wide ? (w - pad * 3) / 2 : w - pad * 2;
      const gcols = wide ? 31 : 31; const grows = Math.ceil(PARTS / gcols);
      const gridH = wide ? h - gy0 - 40 : (h - gy0 - 90) / 2;
      const cell = Math.min(colW / gcols, gridH / grows); const gap = Math.max(1, cell * 0.16); const s = cell - gap;
      const runs = [
        { x: pad, y: gy0, zh: '验收一 · 生产', en: 'Acceptance 1 · production', hole: -1, sweep0: C0, show: D0 },
        { x: wide ? pad * 2 + colW : pad, y: wide ? gy0 : gy0 + gridH + 46, zh: wide ? '验收二 · 故意少传一片（位置示意）' : '验收二 · 少传一片（示意）', en: wide ? 'Acceptance 2 · one part withheld (position illustrative)' : 'Acceptance 2 · one part withheld', hole: HOLE, sweep0: G0, show: G0 - 200 }
      ];
      runs.forEach((run, ri) => {
        const vis = win(t, run.show, run.show + 300);
        ctx.globalAlpha = ri === 0 ? 1 : Math.max(0.35, vis);
        text(ctx, L(run.zh, run.en), run.x, run.y - 8, { size: wide ? 10.5 : 9.5, color: C.muted });
        const sweepEnd = run.sweep0 + 1000;
        const swept = Math.floor(win(t, run.sweep0, sweepEnd) * PARTS);
        for (let i = 0; i < PARTS; i += 1) {
          const x = run.x + (i % gcols) * cell; const y = run.y + Math.floor(i / gcols) * cell;
          let col = C.line2; let hole = false;
          if (ri === 0) {
            if (sim >= parts[i].end) col = C.blue; else if (sim >= parts[i].start && t >= D0) col = C.blueMid;
            if (t >= run.sweep0 && i < swept) col = C.green;
          } else if (t >= run.show) {
            if (i === run.hole) hole = true; else col = t >= run.sweep0 && i < swept ? C.green : C.blue;
          }
          if (hole) {
            const hit = t >= run.sweep0 && swept >= HOLE;
            ctx.strokeStyle = hit ? C.red : C.faint; ctx.lineWidth = hit ? 1.5 : 1; ctx.setLineDash(hit ? [] : [2, 2]);
            ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1); ctx.setLineDash([]);
            if (hit) { ctx.fillStyle = C.redSoft; ctx.fillRect(x + 1, y + 1, s - 2, s - 2); }
            continue;
          }
          ctx.fillStyle = col; ctx.fillRect(x, y, s, s);
        }
        ctx.globalAlpha = 1;
        // verdict chips
        const cy = run.y + grows * cell + 18;
        if (ri === 0) {
          text(ctx, `${parts.filter((p) => sim >= p.end).length} / 310`, run.x, cy + 4, { size: wide ? 13 : 11.5, color: C.ink, weight: 650, font: SANS });
          if (t >= C0 + 1000) chip(ctx, L('片数与字节一致 → 合并', 'parts and bytes match → merged'), run.x + colW, cy, C.green, C.greenSoft, { align: 'right', alpha: win(t, C0 + 1000, C0 + 1300) });
        } else if (t >= run.show) {
          const hit = t >= run.sweep0 + (HOLE / PARTS) * 1000;
          text(ctx, hit ? '309 / 310' : `${Math.min(swept, 309)} / 310`, run.x, cy + 4, { size: wide ? 13 : 11.5, color: hit ? C.red : C.ink, weight: 650, font: SANS });
          if (hit) chip(ctx, L('缺片 → 拒绝合并', 'gap → merge refused'), run.x + colW, cy, C.red, C.redSoft, { align: 'right', alpha: win(t, run.sweep0 + 400, run.sweep0 + 700) });
        }
      });
    }

    mount(el, {
      duration,
      draw,
      chapters: [
        { at: 0, zh: '旧路径', en: 'Old path', sayZh: '字节经后端转发，慢客户端撞上网关 60 秒超时，连接被掐断。', sayEn: 'Bytes relayed by the backend: slow clients hit the gateway’s 60-second timeout and are cut off.' },
        { at: S0 - 100, zh: '只要签名', en: 'Sign', sayZh: '浏览器只向后端要签名：每片一个预签名 URL。后端不再经手文件字节。', sayEn: 'The browser asks the backend only for signatures, one presigned URL per part. The backend no longer touches the bytes.' },
        { at: D0 - 100, zh: '直传', en: 'Direct', sayZh: '310 片 × 32 MiB 从浏览器直传对象存储：237 秒、平均 41.8 MiB/s、零中断。', sayEn: '310 × 32 MiB parts go straight from the browser to object storage: 237 s, 41.8 MiB/s on average, no interruptions.' },
        { at: C0 - 100, zh: 'complete 核对', en: 'Complete', sayZh: 'complete 不信会话记录：后端自己列目录，片数和总字节都对上才合并。', sayEn: 'Completion ignores session records: the backend lists the prefix itself and merges only when part count and total bytes match.' },
        { at: G0 - 300, zh: '缺片守卫', en: 'Gap guard', sayZh: '第二次验收故意少传一片：列目录发现缺口，服务端拒绝合并（309 / 310）。两次结果都留在图上。', sayEn: 'The second acceptance run withholds one part: the listing finds the gap and the server refuses to merge (309 / 310). Both results stay on the figure.' }
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
      const gh = h - pad - 34 - (wide ? 26 : 190);
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
            if (isMiss) { ctx.strokeStyle = C.red; ctx.lineWidth = 1.6; rr(ctx, x - 2, y - 2, s + 4, s + 4, 3); ctx.stroke(); }
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
            ctx.fillStyle = '#f3f3ee'; rr(ctx, x, y, s, s, 2); ctx.fill();
          }
        }
      }
      // Sample bracket around the first column during the first chapter.
      if (t >= S0) {
        ctx.strokeStyle = alpha(C.blue, 0.85); ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
        rr(ctx, gx - 4, gy - 4, s + 8, R * cell - gap + 8, 3); ctx.stroke(); ctx.setLineDash([]);
        text(ctx, L('当时抽查的范围', 'what was sampled'), gx + s / 2, gy + R * cell + 14, { size: 10, color: C.blue, align: 'center' });
      }
      // Side panel.
      const sx = wide ? Math.min(w - pad - sideW, gx + Q * cell + 56) : pad; let sy = wide ? gy + 4 : gy + R * cell + 40;
      const line = (k2, v, color, big) => {
        if (wide) { text(ctx, k2, sx, sy, { size: 10.5 }); text(ctx, v, sx, sy + 24, { size: big ? 22 : 14, color, weight: 650, font: SANS }); sy += big ? 52 : 44; }
        else { text(ctx, k2, sx, sy, { size: 10 }); sy = wrapText(ctx, v, sx, sy + 16, w - pad * 2, 16, { size: 11.5, color, weight: 600, font: SANS }) + 8; }
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
            wrapText(ctx, L('上传链路 503：抽查没看到的那一格', 'upload path 503: the cell the sample skipped'), sx, sy + 4, w - pad * 2, 16, { size: 11, color: C.red, weight: 600, font: SANS });
          }
        }
      } else {
        line(L('当时', 'Then'), L('抽查 11 / 77 格报绿，漏掉的一格导致上传 503', 'sampled 11 / 77 cells, green; the missed cell broke upload with a 503'), C.red);
        line(L('之后的规则', 'The rule since'), L('依赖它的模块一次性注入、重启 · 逐格核对', 'inject and restart every dependent at once · check every cell'), C.ink);
        line(L('已核对', 'Cells checked'), `${checked} / 77`, checked === 77 ? C.green : C.blue, true);
      }
    }
    mount(el, {
      duration,
      draw,
      chapters: [
        { at: 0, zh: '抽查', en: 'Sample', sayZh: '发版后第一轮验证：每个 Pod 只查了 1 个变量，11 格全绿，就报了通过。', sayEn: 'The first post-release check read one variable per pod: 11 green cells, reported as a pass.' },
        { at: F0, zh: '漏掉的一格', en: 'The gap', sayZh: '用户侧上传报 503：一个模块少了一个 token。它在 77 格里，不在抽查的 11 格里。', sayEn: 'Users hit a 503 on upload: one module was missing one token. It sat in the 77, not in the 11 that were sampled.' },
        { at: V0, zh: '全矩阵', en: 'Full matrix', sayZh: '之后的规则：改共享凭证时，一次性注入并重启依赖它的全部模块，11 × 7 = 77 格逐格核对，不抽样。', sayEn: 'The rule since: when a shared credential changes, inject it into and restart every module that depends on it at once, and check all 11 × 7 = 77 cells. No sampling.' }
      ]
    });
  }

  /* =====================================================================
   * FIG.D — why not the option that looks fastest.
   * Three panels that stay on screen: latency on one scale (played at real
   * speed), mask agreement for INT8, and threads against the core quota.
   * ===================================================================== */
  function figSeg(el) {
    const R0 = 300; const FAST = 6000; const EVIT = 640;
    const Q0 = 6900; const H0 = 9300; const duration = 11800;
    const thr = [[1, 2402], [2, 1242], [4, 640], [8, 755], [16, 796], [32, 1007]];

    // Abstract object outline, reused for both masks (unit coordinates).
    const shape = [[0.18, 0.72], [0.22, 0.46], [0.36, 0.40], [0.46, 0.22], [0.66, 0.2], [0.76, 0.38], [0.86, 0.44], [0.88, 0.72]];
    function poly(ctx, X, Y, W, H, pts) { ctx.beginPath(); pts.forEach(([u, v], i) => { const x = X + u * W; const y = Y + v * H; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); }
    function blobPath(ctx, X, Y, W, H) {
      ctx.beginPath();
      for (let k = 0; k <= 72; k += 1) {
        const th = (k / 72) * Math.PI * 2;
        const r = 1 + 0.2 * Math.sin(th * 3 + 0.6) + 0.1 * Math.sin(th * 7 + 2);
        const x = X + (0.44 + Math.cos(th) * 0.24 * r) * W; const y = Y + (0.5 + Math.sin(th) * 0.3 * r) * H;
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
    }
    function panelTitle(ctx, x, y, n, zh, en, wide) {
      const a = text(ctx, n, x, y, { size: 10.5, color: C.blue, weight: 600 });
      text(ctx, L(zh, en), x + a + 8, y, { size: wide ? 11.5 : 10.5, color: C.ink, weight: 650, font: SANS });
    }

    function draw(ctx, w, h, t) {
      const wide = w >= 720; const pad = wide ? 22 : 14;
      let SP; let QP; let TP;
      if (wide) {
        const topH = h * 0.54; const gap = 30;
        SP = { x: pad, y: 18, w: (w - pad * 2 - gap) * 0.46, h: topH };
        QP = { x: pad + SP.w + gap, y: 18, w: w - pad * 2 - gap - SP.w, h: topH };
        TP = { x: pad, y: 18 + topH + 26, w: w - pad * 2, h: h - topH - 18 - 26 - 10 };
      } else {
        const u = (h - 60) / 3;
        SP = { x: pad, y: 16, w: w - pad * 2, h: u * 0.8 };
        QP = { x: pad, y: 16 + u * 0.8 + 24, w: w - pad * 2, h: u * 1.2 };
        TP = { x: pad, y: 16 + u * 2 + 48, w: w - pad * 2, h: u - 8 };
      }

      /* --- 1. latency, same scale, real time --- */
      panelTitle(ctx, SP.x, SP.y + 8, '01', '同图同机延迟（4 核，按真实时长播放）', 'Latency, same image and machine (4 cores, real time)', wide);
      const el0 = Math.max(0, t - R0);
      const lanes = [
        { name: 'FastSAM + CLIP', sub: 'PyTorch', ms: FAST, col: C.faint },
        { name: 'EfficientViT-SAM-L0', sub: 'OpenVINO fp32', ms: EVIT, col: C.blue }
      ];
      const bx = SP.x; const bw = SP.w - (wide ? 90 : 76);
      lanes.forEach((ln, j) => {
        const y = SP.y + 44 + j * (wide ? 64 : 50);
        text(ctx, ln.name, bx, y, { size: wide ? 12 : 11, color: C.ink, weight: 600, font: SANS });
        text(ctx, ln.sub, bx, y + 15, { size: 10, color: C.quiet });
        const e = Math.min(el0, ln.ms);
        ctx.fillStyle = C.line2; ctx.fillRect(bx, y + 22, bw, 8);
        ctx.fillStyle = ln.col; ctx.fillRect(bx, y + 22, (e / FAST) * bw, 8);
        text(ctx, `${fmt(e)} ms`, bx + bw + 10, y + 30, { size: wide ? 14 : 12, color: e >= ln.ms ? (j ? C.blue : C.ink) : C.muted, weight: 650, font: SANS });
      });
      if (el0 >= EVIT) {
        const y = SP.y + 44 + 2 * (wide ? 64 : 50);
        text(ctx, L(`快 ${(FAST / EVIT).toFixed(1)} 倍`, `${(FAST / EVIT).toFixed(1)}× faster`), bx, y + 4, { size: wide ? 22 : 17, color: C.blue, weight: 700, font: SANS, alpha: win(el0, EVIT, EVIT + 400) });
        if (wide) text(ctx, L('FastSAM 的文字提示还只是重排 50 个候选框，并不过滤', 'and FastSAM’s text prompt only re-ranks 50 candidates; it never filters'), bx, y + 24, { size: 10.5, color: C.muted, alpha: win(el0, FAST, FAST + 400) });
      }

      /* --- 2. INT8: looks the same to the model --- */
      const qa = t < Q0 - 300 ? 0.25 : win(t, Q0 - 300, Q0 + 200);
      ctx.globalAlpha = qa;
      panelTitle(ctx, QP.x, QP.y + 8, '02', 'INT8 量化后的掩码质量', 'Mask quality after INT8 quantization', wide);
      const tileW = wide ? Math.min(QP.w * 0.46, (QP.h - 40) * 1.2) : QP.w * 0.42; const tileH = wide ? QP.h - 40 : QP.h - 34;
      const tx = QP.x; const ty = QP.y + 26;
      ctx.fillStyle = '#f1f1ec'; rr(ctx, tx, ty, tileW, tileH, 4); ctx.fill();
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; rr(ctx, tx + 0.5, ty + 0.5, tileW - 1, tileH - 1, 4); ctx.stroke();
      ctx.fillStyle = alpha(C.blue, 0.22); poly(ctx, tx, ty, tileW, tileH, shape); ctx.fill();
      ctx.strokeStyle = C.blue; ctx.lineWidth = 1.6; poly(ctx, tx, ty, tileW, tileH, shape); ctx.stroke();
      const bp = easeOut(win(t, Q0 + 200, Q0 + 900));
      if (bp > 0) {
        ctx.save(); ctx.globalAlpha = qa * bp; ctx.fillStyle = alpha(C.amber, 0.28); blobPath(ctx, tx, ty, tileW, tileH); ctx.fill();
        ctx.strokeStyle = C.amber; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]); blobPath(ctx, tx, ty, tileW, tileH); ctx.stroke(); ctx.restore(); ctx.globalAlpha = qa;
      }
      text(ctx, 'fp32', tx + 8, ty + 16, { size: 10, color: C.blue, weight: 600 });
      text(ctx, 'INT8', tx + 44, ty + 16, { size: 10, color: C.amberInk, weight: 600 });
      text(ctx, L('形状示意', 'shapes illustrative'), tx + tileW - 8, ty + tileH - 8, { size: 9.5, color: C.quiet, align: 'right' });
      const nx = tx + tileW + (wide ? 22 : 14); let ny = ty + (wide ? 8 : 6);
      const stat = (k, v, note, big, col) => {
        text(ctx, k, nx, ny + 4, { size: wide ? 10.5 : 9.5, color: C.quiet });
        const vw = text(ctx, v, nx, ny + (big ? 32 : 24), { size: big ? (wide ? 28 : 22) : (wide ? 16 : 13), color: col || C.ink, weight: 700, font: SANS });
        if (note && wide) text(ctx, note, nx + vw + 8, ny + (big ? 32 : 24), { size: 10.5, color: C.muted });
        ny += big ? (wide ? 52 : 42) : (wide ? 42 : 34);
      };
      stat(L('模型自估 IoU · fp32 / INT8', 'model’s own IoU · fp32 / INT8'), '0.686 / 0.692', L('几乎不变', 'barely moves'));
      stat(L('与 fp32 掩码的实际 IoU', 'actual IoU vs fp32 masks'), '0.42', L('48–59% 的样本低于 0.5', '48–59% of samples below 0.5'), true, C.amberInk);
      stat(L('换来的提速', 'what it buys'), '1.7×', L('不值得：坏了也察觉不到', 'not worth it: failure is invisible'));
      ctx.globalAlpha = 1;

      /* --- 3. threads vs the core quota (secondary) --- */
      const ta = t < H0 - 300 ? 0.25 : win(t, H0 - 300, H0 + 200);
      ctx.globalAlpha = ta;
      ctx.strokeStyle = C.line2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(TP.x, TP.y - 14); ctx.lineTo(TP.x + TP.w, TP.y - 14); ctx.stroke();
      panelTitle(ctx, TP.x, TP.y + 6, '03', '推理线程数 × 4 核配额', 'Inference threads vs the 4-core quota', wide);
      const noteW = wide ? 300 : 0;
      const cx0 = TP.x + (wide ? 40 : 34); const cW = TP.w - (wide ? 40 : 34) - noteW - (wide ? 24 : 6);
      const cy0 = TP.y + 22; const cH = TP.h - (wide ? 44 : 40);
      const xs = (n) => cx0 + (Math.log2(n) / 5) * cW; const ys = (ms) => cy0 + cH - (ms / 2600) * cH;
      [0, 1000, 2000].forEach((v) => { ctx.strokeStyle = C.line2; ctx.beginPath(); ctx.moveTo(cx0, ys(v) + 0.5); ctx.lineTo(cx0 + cW, ys(v) + 0.5); ctx.stroke(); text(ctx, fmt(v), cx0 - 6, ys(v) + 4, { size: 9, color: C.faint, align: 'right' }); });
      thr.forEach(([n]) => text(ctx, `${n}`, xs(n), cy0 + cH + 14, { size: 9.5, align: 'center', color: C.quiet }));
      ctx.fillStyle = alpha(C.green, 0.08); ctx.fillRect(xs(4) - 12, cy0, 24, cH);
      const lp = easeInOut(win(t, H0 + 100, H0 + 1300)); const upto = lp * (thr.length - 1);
      ctx.strokeStyle = C.blue; ctx.lineWidth = 1.8; ctx.beginPath();
      thr.forEach(([n, ms], i) => {
        if (i > Math.ceil(upto)) return;
        let px = xs(n); let py = ys(ms);
        if (i > upto) { const [n0, m0] = thr[i - 1]; const f = upto - (i - 1); px = lerp(xs(n0), px, f); py = lerp(ys(m0), py, f); }
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      });
      ctx.stroke();
      thr.forEach(([n, ms], i) => {
        if (i > upto + 0.001) return;
        const best = n === 4; const old = n === 2;
        ctx.fillStyle = best ? C.green : old ? C.amber : C.blue; ctx.beginPath(); ctx.arc(xs(n), ys(ms), best || old ? 4 : 2.8, 0, Math.PI * 2); ctx.fill();
        if (best || old || wide) text(ctx, fmt(ms), xs(n) + (old ? -8 : 6), ys(ms) - 7, { size: 9.5, align: old ? 'right' : 'left', color: best ? C.green : old ? C.amberInk : C.muted, weight: best || old ? 650 : 400 });
      });
      if (wide) {
        let ny2 = TP.y + 24; const nx2 = TP.x + TP.w - noteW + 10;
        [[L('容器里 os.cpu_count()', 'os.cpu_count() in the container'), L('32（宿主核数）', '32 (the host)'), C.ink],
          [L('原配置 OMP_NUM_THREADS=2', 'shipped OMP_NUM_THREADS=2'), L('1,242 ms，慢 1.94 倍', '1,242 ms, 1.94× slower'), C.amberInk],
          [L('改成配额核数 4', 'set to the quota, 4'), L('640 ms，只改一行 env', '640 ms, a one-line change'), C.green]].forEach(([k, v, col]) => {
          text(ctx, k, nx2, ny2, { size: 10, color: C.quiet }); text(ctx, v, nx2, ny2 + 17, { size: 12, color: col, weight: 650, font: SANS }); ny2 += 38;
        });
      }
      ctx.globalAlpha = 1;
    }
    mount(el, {
      duration,
      draw,
      chapters: [
        { at: 0, zh: '延迟（实时）', en: 'Latency, live', sayZh: '同一张图、同一台 4 核机器，按真实时长播放：FastSAM + CLIP 6,000 ms，EfficientViT-SAM 640 ms。', sayEn: 'Same image, same 4-core machine, played at real speed: FastSAM + CLIP takes 6,000 ms, EfficientViT-SAM 640 ms.' },
        { at: Q0 - 300, zh: 'INT8 陷阱', en: 'INT8 trap', sayZh: 'INT8 再快 1.7 倍，但掩码和 fp32 的 IoU 只有 0.42，而模型自估的 IoU 几乎没变：坏了也察觉不到，所以不上。', sayEn: "INT8 buys another 1.7×, but its masks overlap fp32's at IoU 0.42 while the model's own IoU estimate barely moves. Failure would be invisible, so it doesn't ship." },
        { at: H0 - 300, zh: '线程数', en: 'Threads', sayZh: '容器看到的是宿主 32 核，真正配额只有 4 核。线程数等于配额时最快：原配置 2 线程 1,242 ms，改成 4 线程 640 ms。', sayEn: 'The container sees the host’s 32 cores, but its quota is 4. Latency bottoms out when threads match the quota: 1,242 ms with the shipped 2 threads, 640 ms with 4.' }
      ]
    });
  }

  /* =====================================================================
   * FIG.E — the same images on three machines: 16 cores, 32 cores, 32 cores fixed.
   * Thread pools scale with the core count; one nproc line runs across all three.
   * The end frame keeps the before-and-after side by side.
   * ===================================================================== */
  function figCores(el) {
    const A0 = 200; const A1 = 2600; const B0 = 3000; const B1 = 6400; const F0 = 6800; const F1 = 9000; const duration = 9800;
    const cols = [
      { zh: '验证机', en: 'Test machine', cores: 16, units: 96, t0: A0, t1: A1 },
      { zh: '客户现场', en: 'Customer site', cores: 32, units: 192, t0: B0, t1: B1 },
      { zh: '钉死线程数之后', en: 'Threads pinned', cores: 32, units: 24, t0: F0, t1: F1, fixed: true }
    ];
    const MAXU = 210; const LIMIT = 150; // illustrative heights; only cores and restarts are measured
    const svc = ['#6f8fe8', '#2255ee', '#15309a'];
    function draw(ctx, w, h, t) {
      const wide = w >= 640; const pad = wide ? 22 : 12; const gap = wide ? 28 : 10;
      const colW = (w - pad * 2 - gap * 2) / 3;
      const top = 20; const gridTop = top + (wide ? 34 : 40);
      const cell = Math.min((colW - 8) / 8, wide ? 16 : 10); const cg = Math.max(1.5, cell * 0.18);
      const gridH = 4 * cell;
      const barTop = gridTop + gridH + (wide ? 36 : 26); const barBot = h - (wide ? 64 : 58);
      const barH = barBot - barTop;
      const yOf = (u) => barBot - (u / MAXU) * barH;
      // nproc line across all columns.
      const ly = yOf(LIMIT);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.3; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(pad, ly); ctx.lineTo(w - pad, ly); ctx.stroke(); ctx.setLineDash([]);
      if (wide) text(ctx, L('nproc 上限（高度示意）', 'nproc limit (height illustrative)'), w - pad, ly - 6, { size: 10.5, color: C.ink, align: 'right', weight: 600 });
      else text(ctx, 'nproc', pad, ly - 5, { size: 9.5, color: C.ink, weight: 600 });
      cols.forEach((c, k) => {
        const x = pad + k * (colW + gap);
        const on = t >= c.t0 - 200;
        const a = on ? win(t, c.t0 - 200, c.t0 + 200) : 0.18;
        ctx.globalAlpha = a;
        text(ctx, L(c.zh, c.en), x, top + 10, { size: wide ? 12.5 : 10.5, color: C.ink, weight: 650, font: SANS });
        text(ctx, wide ? L(`${c.cores} 核 · 同一套镜像`, `${c.cores} cores · same images`) : L(`${c.cores} 核`, `${c.cores} cores`), x, top + (wide ? 27 : 24), { size: wide ? 10.5 : 9, color: C.quiet });
        for (let i = 0; i < 32; i += 1) {
          const cx = x + (i % 8) * cell; const cy = gridTop + Math.floor(i / 8) * cell;
          ctx.fillStyle = i < c.cores ? C.ink : C.line2; if (i >= c.cores) ctx.globalAlpha = a * 0.6;
          ctx.fillRect(cx, cy, cell - cg, cell - cg); ctx.globalAlpha = a;
        }
        // Threads: one stacked bar, three services, each two pools sized by cores (or pinned).
        const grow = easeOut(win(t, c.t0, c.t0 + (c.t1 - c.t0) * 0.55));
        const units = c.units * grow;
        const bw = Math.min(colW * 0.42, 90); const bx = x + (wide ? 0 : 0);
        let acc = 0;
        for (let sv = 0; sv < 3; sv += 1) {
          const u = Math.min(units - acc, c.units / 3); if (u <= 0) break;
          const y0 = yOf(acc + u); const y1 = yOf(acc);
          ctx.fillStyle = c.fixed ? mix(C.green, '#ffffff', sv * 0.25) : svc[sv];
          ctx.fillRect(bx, y0, bw, y1 - y0 - 1);
          acc += u;
        }
        const over = units > LIMIT && !c.fixed;
        if (over) { ctx.fillStyle = alpha(C.red, 0.18); ctx.fillRect(bx - 3, yOf(units), bw + 6, ly - yOf(units)); ctx.strokeStyle = C.red; ctx.lineWidth = 1.5; ctx.strokeRect(bx - 3, yOf(units), bw + 6, ly - yOf(units)); }
        if (wide) text(ctx, L('线程数', 'threads'), bx + bw + 8, barBot - 2, { size: 9.5, color: C.quiet });
        if (wide) text(ctx, c.fixed ? L('按配置固定', 'fixed by config') : L('∝ 核数', '∝ cores'), bx + bw + 8, barBot - 16, { size: 9.5, color: C.quiet });
        // Services: three pills.
        const sy = barBot + (wide ? 22 : 20);
        const crash = over && t >= c.t0 + (c.t1 - c.t0) * 0.45;
        const restarts = crash ? Math.min(60, Math.floor((t - c.t0 - (c.t1 - c.t0) * 0.45) / 30)) : 0;
        const pillW = wide ? (colW - 16) / 3 : colW;
        for (let sv = 0; sv < (wide ? 3 : 1); sv += 1) {
          const px = x + sv * (pillW + (wide ? 8 : 2));
          const bad = crash; const ok = on && grow > 0.9 && !bad;
          ctx.fillStyle = bad ? C.redSoft : ok ? C.greenSoft : C.line2; rr(ctx, px, sy - 11, pillW, 20, 3); ctx.fill();
          text(ctx, bad ? (wide ? 'CrashLoop' : 'CrashLoop ×3') : ok ? (wide ? 'Running' : 'Running ×3') : '…', px + pillW / 2, sy + 3, { size: wide ? 9.5 : 8.5, color: bad ? C.red : ok ? C.green : C.quiet, align: 'center', weight: 600 });
        }
        if (restarts) text(ctx, `${L('重启', 'restarts')} ${restarts}${restarts >= 60 ? '+' : ''}`, x, sy + (wide ? 30 : 28), { size: wide ? 12 : 10.5, color: C.red, weight: 650 });
        else if (on && grow > 0.9) text(ctx, c.fixed ? L('稳定', 'stable') : L('全绿', 'all green'), x, sy + (wide ? 30 : 28), { size: wide ? 12 : 10.5, color: C.green, weight: 650 });
        ctx.globalAlpha = 1;
      });
    }
    mount(el, {
      duration,
      draw,
      footAfter: el.querySelector('.fig-code'),
      chapters: [
        { at: 0, zh: '验证机 16 核', en: '16-core test box', sayZh: '与客户同款 OS 的验证机，16 核：每个库按核数起线程，总数还在 nproc 上限以内，整套平台全绿。', sayEn: 'A test machine on the customer’s OS, 16 cores: each library starts a thread per core, the total stays under the nproc limit, and the platform is green.' },
        { at: B0, zh: '现场 32 核', en: '32 cores on site', sayZh: '同一套镜像到了 32 核的客户机器，线程数跟着翻倍，越过 nproc 上限，三个 Python 服务重启 60+ 次。', sayEn: 'The same images on the customer’s 32-core machine: thread counts double, cross the nproc limit, and three Python services restart 60+ times.' },
        { at: F0, zh: '钉死线程数', en: 'Pin the threads', sayZh: '这次的修复：所有算力容器显式设置线程数，并放开该部署的 nproc 限制。从此验证机必须与客户机同规格，核数也要对齐。', sayEn: 'This case\u2019s fix: explicit thread counts in every compute container and a raised nproc limit for that deployment. Test machines must now match the customer\u2019s, core count included.' }
      ]
    });
  }

  /* =====================================================================
   * FIG.F — why the cache stopped where it did.
   * A prompt cache reuses only the prefix that matches the previous turn.
   * Before: a block that changes every turn sat near the front, so the prefix
   * broke there. After: stable sections first, the volatile block trimmed and
   * moved last. Segment widths are illustrative, balanced to the measured
   * per-prompt means (12,726 → 9,631 tokens); results are measured.
   * ===================================================================== */
  function figPrompt(el) {
    const R0 = 3000; const R1 = 5200; const X0 = 6200; const duration = 9400;
    const SEG = {
      S: { c: '#5d6168', zh: '系统', en: 'system' },
      T: { c: '#6f8fe8', zh: '工具目录', en: 'tools' },
      K: { c: '#8e959c', zh: 'Skill', en: 'skills' },
      H: { c: '#c9ccc6', zh: '对话历史', en: 'history' },
      V: { c: C.amber, zh: '进行中任务', en: 'task state' }
    };
    const before = [['S', 1500], ['T', 7280], ['V', 1085], ['K', 900], ['H', 1961]];
    const after = [['S', 1500], ['T', 5200], ['K', 900], ['H', 1961], ['V', 70]];
    const MAX = 12726;
    function place(list) { let x = 0; const o = {}; list.forEach(([k, v]) => { o[k] = { x, w: v }; x += v; }); return o; }
    const PB = place(before); const PA = place(after);

    function bar(ctx, X, y, W, bh, pos, ticks, label, note, noteColor, cut, cached) {
      const sc = W / MAX;
      text(ctx, label, X, y - 10, { size: 11, color: C.ink, weight: 650, font: SANS });
      ['S', 'T', 'K', 'H', 'V'].forEach((k) => {
        const p = pos[k]; const x = X + p.x * sc; const wd = Math.max(2, p.w * sc - 1);
        ctx.fillStyle = SEG[k].c; ctx.fillRect(x, y, wd, bh);
        if (k === 'T') {
          ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.beginPath();
          for (let j = 1; j < ticks; j += 1) { const tx = x + (wd / ticks) * j; ctx.moveTo(tx + 0.5, y + 3); ctx.lineTo(tx + 0.5, y + bh - 3); }
          ctx.stroke();
        }
      });
      // Reusable prefix bracket, then the break.
      if (cached > 0) {
        const bx1 = X + cached * sc; const by = y + bh + 8;
        ctx.strokeStyle = C.green; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(X, by - 4); ctx.lineTo(X, by); ctx.lineTo(bx1, by); ctx.lineTo(bx1, by - 4); ctx.stroke();
        text(ctx, L('可复用的缓存前缀', 'reusable cache prefix'), X, by + 15, { size: 10.5, color: C.green, weight: 600 });
      }
      if (cut != null) {
        const cx = X + cut * sc;
        ctx.strokeStyle = C.red; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - 3, y - 6); ctx.lineTo(cx + 3, y + bh * 0.33); ctx.lineTo(cx - 3, y + bh * 0.66); ctx.lineTo(cx + 3, y + bh + 6); ctx.stroke();
      }
      if (note) text(ctx, note, X + W + 14, y + bh / 2 + 5, { size: 12, color: noteColor, weight: 650, font: SANS });
    }

    function draw(ctx, w, h, t) {
      const wide = w >= 700; const pad = wide ? 22 : 14;
      const noteW = wide ? 150 : 0;
      const X = pad; const W = w - pad * 2 - noteW;
      const bh = wide ? 26 : 20;
      const y1 = wide ? 52 : 46;
      // Reading direction.
      ctx.strokeStyle = C.quiet; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X, 18); ctx.lineTo(X + 60, 18); ctx.lineTo(X + 55, 14); ctx.moveTo(X + 60, 18); ctx.lineTo(X + 55, 22); ctx.stroke();
      text(ctx, wide ? L('读取方向：缓存只复用与上一轮完全相同的前缀', 'read direction: a cache reuses only the prefix identical to the previous turn') : L('读取方向', 'read direction'), X + 70, 22, { size: wide ? 10.5 : 9, color: C.quiet });

      // Before: always shown. The prefix bracket grows to the break.
      const gb = easeOut(win(t, 300, 1500));
      bar(ctx, X, y1, W, bh, PB, 28, L('改前', 'Before'), wide ? L('命中 51.0%', 'hit 51.0%') : null, C.amberInk, t >= 1500 ? PB.V.x : null, (PB.S.w + PB.T.w) * gb);
      if (t >= 1500) {
        const cx = X + PB.V.x * (W / MAX);
        if (wide) text(ctx, L('每轮都变，缓存在这里断开', 'changes every turn: the cache breaks here'), cx + 8, y1 - 10, { size: 10.5, color: C.red, weight: 600, alpha: win(t, 1500, 1800) });
        else text(ctx, L('缓存在这里断开', 'cache breaks here'), Math.min(cx, w - pad), y1 - 8, { size: 9.5, color: C.red, weight: 600, align: 'right', alpha: win(t, 1500, 1800) });
      }

      // After: morphs out of the before layout during the reorder chapter.
      const y2 = y1 + bh + (wide ? 78 : 66);
      if (t >= R0 - 200) {
        const q = easeInOut(win(t, R0, R1));
        const pos = {};
        Object.keys(PB).forEach((k) => { pos[k] = { x: lerp(PB[k].x, PA[k].x, q), w: lerp(PB[k].w, PA[k].w, q) }; });
        const ticks = Math.round(lerp(28, 20, q));
        const cached = q >= 1 ? PA.V.x * easeOut(win(t, R1, R1 + 800)) : 0;
        ctx.globalAlpha = win(t, R0 - 200, R0 + 100);
        bar(ctx, X, y2, W, bh, pos, ticks, L('改后', 'After'), q >= 1 && wide ? L('前缀一直延伸到末尾', 'prefix runs to the end') : null, C.green, q >= 1 ? PA.V.x : null, cached);
        ctx.globalAlpha = 1;
        if (q > 0.2) {
          const sc = W / MAX;
          text(ctx, L(`工具目录 ${ticks} 个`, `${ticks} tools`), X + (pos.T.x + pos.T.w / 2) * sc, y2 + bh / 2 + 4, { size: wide ? 10.5 : 9, color: '#fff', align: 'center', weight: 600 });
          if (q >= 1 && wide) text(ctx, L('进行中任务 3,320 → 211 字符，挪到末尾', 'task state 3,320 → 211 chars, moved last'), X + PA.V.x * sc, y2 - 10, { size: wide ? 10.5 : 9, color: C.amberInk, align: 'right', weight: 600 });
        }
      }

      // Results, measured on the regression set after the whole harness pass.
      if (t >= X0 - 200) {
        const a = win(t, X0 - 200, X0 + 200);
        ctx.globalAlpha = a;
        const y0 = y2 + bh + (wide ? 70 : 60);
        ctx.strokeStyle = C.line2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad, y0 - 22); ctx.lineTo(w - pad, y0 - 22); ctx.stroke();
        text(ctx, wide ? L('整轮 harness 调优后的实测结果（重排是其中一项）', 'Measured after the full harness pass (the reorder is one part of it)') : L('整轮调优后的实测结果', 'Measured after the full pass'), pad, y0 - 4, { size: 10.5, color: C.muted });
        const metrics = [
          { k: L('输入 token', 'input tokens'), a: L('159.0 万', '1.59 M'), b: L('89.6 万', '0.896 M'), va: 1590, vb: 896, d: '−43.6%' },
          { k: L('单个 prompt', 'per prompt'), a: '12,726', b: '9,631', va: 12726, vb: 9631, d: '−24.3%' },
          { k: L('回归失败', 'regression failures'), a: '53', b: '20', va: 53, vb: 20, d: '53 → 36 → 20' },
          { k: L('任务通过', 'tasks passed'), a: '5', b: '7', va: 5, vb: 7, d: '+2', up: true }
        ];
        const colN = wide ? 4 : 2; const cw = (w - pad * 2) / colN; const ch = wide ? 84 : 96;
        metrics.forEach((m, i) => {
          const x = pad + (i % colN) * cw; const y = y0 + 20 + Math.floor(i / colN) * ch;
          const qq = easeOut(win(t, X0 + i * 150, X0 + 700 + i * 150));
          text(ctx, m.k, x, y, { size: 10.5 });
          const maxV = Math.max(m.va, m.vb); const bw = cw - 24;
          ctx.fillStyle = C.line2; ctx.fillRect(x, y + 10, (m.va / maxV) * bw, 5);
          ctx.fillStyle = m.up ? C.green : C.blue; ctx.fillRect(x, y + 19, (lerp(m.va, m.vb, qq) / maxV) * bw, 5);
          const aw = text(ctx, m.a, x, y + 46, { size: 12, color: C.faint, font: SANS });
          text(ctx, '→', x + aw + 6, y + 46, { size: 12, color: C.faint, font: SANS });
          text(ctx, m.b, x + aw + 22, y + 46, { size: wide ? 20 : 16, color: C.ink, weight: 700, font: SANS });
          text(ctx, m.d, x, y + 63, { size: 10.5, color: m.up ? C.green : C.blue, weight: 600 });
        });
        ctx.globalAlpha = 1;
      }
    }
    mount(el, {
      duration,
      draw,
      footAfter: el.querySelector('.fig-legend'),
      chapters: [
        { at: 0, zh: '改前', en: 'Before', sayZh: '进行中任务每轮都变，却排在 Skill 和对话历史前面，缓存前缀在这里断开，后面每轮都要重算。实测命中 51.0%。', sayEn: 'The task-state block changes every turn yet sat ahead of skills and history, so the cache prefix broke there and everything after it was recomputed each turn. Measured hit rate: 51.0%.' },
        { at: R0, zh: '重排', en: 'Reorder', sayZh: '稳定段挪到前面，易变段从 3,320 字符压到 211 并放到末尾；工具目录 28 → 20。可复用的前缀一直延伸到末尾。', sayEn: 'Stable sections move first; the volatile block shrinks from 3,320 to 211 characters and goes last; the tool catalog drops from 28 to 20. The reusable prefix now runs to the end.' },
        { at: X0, zh: '结果', en: 'Result', sayZh: '整轮 harness 调优后，同一套 24 例回归：输入 token 降 43.6%，失败 53 → 20，任务通过 5 → 7。', sayEn: 'After the full harness pass, on the same 24-case regression: 43.6% fewer input tokens, failures 53 → 20, tasks passed 5 → 7.' }
      ]
    });
  }

  const figs = { queue: figQueue, upload: figUpload, matrix: figMatrix, seg: figSeg, cores: figCores, prompt: figPrompt };
  document.querySelectorAll('[data-fig]').forEach((el) => { const f = figs[el.dataset.fig]; if (f) f(el); });
})();
