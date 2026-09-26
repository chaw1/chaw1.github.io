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
      toggle.hidden = reduced();
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
    function seek(i) {
      // Play just that chapter and hold on its last, settled frame.
      const end = i + 1 < chapters.length ? chapters[i + 1].at - 1 : spec.duration;
      started = true;
      if (reduced()) { t = end; pause(); render(); return; }
      t = chapters[i].at; stopAt = end; run();
    }
    if (replay) replay.addEventListener('click', () => play(0));
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
      }, { threshold: 0.35 }).observe(stage);
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
        { x: wide ? pad * 2 + colW : pad, y: wide ? gy0 : gy0 + gridH + 46, zh: '验收二 · 故意少传一片（位置示意）', en: 'Acceptance 2 · one part withheld (position illustrative)', hole: HOLE, sweep0: G0, show: G0 - 200 }
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
        line(L('当时', 'Then'), L('抽查 11 / 77 格报绿，漏掉的一格导致上传 503', 'sampled 11 / 77 cells, green; the missed cell broke upload with a 503'), C.red);
        line(L('之后的规则', 'The rule since'), L('注入全量 · 重启全量 · 逐格核对', 'inject all · restart all · check every cell'), C.ink);
        line(L('已核对', 'Cells checked'), `${checked} / 77`, checked === 77 ? C.green : C.blue, true);
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
      const aR = t < I0 ? 1 : fadeOut(t, I0 + 300);
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
      const aI = t < I0 ? 0 : Math.min(fadeIn(t, I0 + 250), t < H0 ? 1 : fadeOut(t, H0 + 300));
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
        row(L('模型自估 IoU · fp32 / INT8', 'model self-estimated IoU · fp32 / INT8'), '0.686 / 0.692', L('几乎不变，坏了也察觉不到', 'barely moves: the damage is invisible'));
        row(L('INT8 与 fp32 掩码的实际 IoU', 'actual IoU, INT8 vs fp32 masks'), '0.42', L('48–59% 的样本低于 0.5', '48–59% of samples below 0.5'), true);
        row(L('换来的提速', 'what it buys'), '1.7×', L('不值得', 'not worth it'));
        if (wide) text(ctx, L('只看延迟表，会得出“INT8 提速 1.7 倍”的结论。', 'A latency table alone says "INT8: 1.7× faster".'), sx, sy + 4, { size: 11, color: C.red, font: SANS, weight: 600 });
        ctx.globalAlpha = 1;
      }
      // Chapter 3: threads vs latency, minimum at the cgroup quota.
      const aH = t < H0 ? 0 : fadeIn(t, H0 + 250);
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
        note(L('线程数改成配额核数', 'threads set to the quota'), L('640 ms，只改一行 env', '640 ms, a one-line env change'), C.green);
        ctx.globalAlpha = 1;
      }
    }
    mount(el, {
      duration,
      draw,
      chapters: [
        { at: R0, zh: '延迟（实时）', en: 'Latency, live', sayZh: '同一张图、同一台 4 核机器，按真实时长播放：FastSAM + CLIP 6,000 ms，EfficientViT-SAM 640 ms。', sayEn: 'Same image, same 4-core machine, played at real speed: FastSAM + CLIP takes 6,000 ms, EfficientViT-SAM 640 ms.' },
        { at: I0, zh: 'INT8 陷阱', en: 'INT8 trap', sayZh: 'INT8 再快 1.7 倍，但掩码和 fp32 的 IoU 只有 0.42，而模型自估的 IoU 几乎没变：坏了也察觉不到。', sayEn: "INT8 buys another 1.7×, but its masks overlap fp32's at IoU 0.42 while the model's own IoU estimate barely moves: failure you cannot see." },
        { at: H0, zh: '线程数', en: 'Threads', sayZh: '容器看到的是宿主 32 核，真正配额只有 4 核。线程数等于配额时最快：原配置 2 线程 1,242 ms，改成 4 线程 640 ms。', sayEn: 'The container sees the host\u2019s 32 cores, but its quota is 4. Latency bottoms out when threads match the quota: 1,242 ms with the shipped 2 threads, 640 ms with 4.' }
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

  const figs = { queue: figQueue, upload: figUpload, matrix: figMatrix, seg: figSeg, cores: figCores, prompt: figPrompt };
  document.querySelectorAll('[data-fig]').forEach((el) => { const f = figs[el.dataset.fig]; if (f) f(el); });
})();
