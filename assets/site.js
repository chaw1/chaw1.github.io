(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reducedMotion = () => Boolean(motionQuery && motionQuery.matches);
  const t = (zh, en) => (language === 'zh' ? zh : en);

  let language = 'zh';
  try {
    const saved = localStorage.getItem('jiawis-lang');
    if (saved === 'zh' || saved === 'en') language = saved;
  } catch (_) { /* storage unavailable: keep default */ }

  /* ---------------- language ---------------- */
  const languageListeners = [];
  function applyLanguage(next, persist) {
    language = next;
    root.dataset.lang = next;
    root.lang = next === 'zh' ? 'zh-CN' : 'en';
    $$('[data-set-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setLang === next)));
    if (persist) {
      try { localStorage.setItem('jiawis-lang', next); } catch (_) { /* ignore */ }
    }
    updateMenuLabel();
    languageListeners.forEach((fn) => fn());
  }
  $$('[data-set-lang]').forEach((b) => b.addEventListener('click', () => applyLanguage(b.dataset.setLang, true)));

  /* ---------------- navigation ---------------- */
  const menuButton = $('#menu-toggle');
  const nav = $('#site-nav');
  const header = $('.site-header');
  function updateMenuLabel() {
    if (!menuButton) return;
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-label', open ? t('关闭导航', 'Close navigation') : t('打开导航', 'Open navigation'));
  }
  function setMenu(open, restoreFocus) {
    if (!menuButton || !nav) return;
    menuButton.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    updateMenuLabel();
    if (open) {
      const first = nav.querySelector('a');
      if (first) first.focus();
    } else if (restoreFocus) menuButton.focus();
  }
  if (menuButton) menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuButton && menuButton.getAttribute('aria-expanded') === 'true') setMenu(false, true);
  });
  $$('a[data-nav]').forEach((a) => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('click', (e) => {
    if (!nav || !nav.classList.contains('is-open')) return;
    if (!nav.contains(e.target) && !menuButton.contains(e.target)) setMenu(false);
  });

  const onScroll = () => { if (header) header.classList.toggle('is-scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Active section in the navigation.
  const navLinks = $$('.site-nav a[data-nav]');
  const sectionIds = navLinks.map((a) => a.getAttribute('href').slice(1)).filter((id) => id !== 'contact');
  const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean);
  function updateCurrent() {
    const line = window.innerHeight * 0.35;
    let current = null;
    sections.forEach((s) => { if (s.getBoundingClientRect().top <= line) current = s.id; });
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) current = 'contact';
    navLinks.forEach((a) => {
      if (a.getAttribute('href') === `#${current}`) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', updateCurrent, { passive: true });
  updateCurrent();

  /* ---------------- reveal + count-up ---------------- */
  const revealTargets = $$('.section-intro, .stats, .heatmap-card, .milestones, .arch, .casebook, .loop, .ledger, .principles, .project-grid, .capabilities, .experience, .contact > div');
  const countTargets = $$('[data-count]');
  function formatNumber(n) { return n.toLocaleString('en-US'); }
  function countUp(el) {
    const end = Number(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    if (reducedMotion() || !Number.isFinite(end)) { el.textContent = formatNumber(end) + suffix; return; }
    const start = performance.now();
    const duration = 1400;
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = formatNumber(Math.round(end * eased)) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  if ('IntersectionObserver' in window) {
    revealTargets.forEach((el) => el.classList.add('reveal'));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        $$('[data-count]', entry.target).forEach(countUp);
        if (entry.target.classList.contains('heatmap-card')) $('#heatmap').classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealTargets.forEach((el) => io.observe(el));
  } else {
    countTargets.forEach((el) => { el.textContent = formatNumber(Number(el.dataset.count)) + (el.dataset.suffix || ''); });
  }

  /* ---------------- heatmap ---------------- */
  const heat = $('#heatmap');
  const readout = $('#heat-readout');
  if (heat) {
    const counts = heat.dataset.days.split(',').map(Number);
    const [y, m, d] = heat.dataset.start.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, d));
    const level = (n) => (n === 0 ? 0 : n <= 7 ? 1 : n <= 17 ? 2 : n <= 31 ? 3 : n <= 59 ? 4 : 5);
    const leading = (start.getUTCDay() + 6) % 7; // Monday-first rows
    const monthsZh = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const body = document.createElement('div');
    body.className = 'heat-body';
    const monthsRow = document.createElement('div');
    monthsRow.className = 'heat-months';
    monthsRow.setAttribute('aria-hidden', 'true');
    const grid = document.createElement('div');
    grid.className = 'heat-grid';

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < leading; i += 1) {
      const pad = document.createElement('span');
      pad.className = 'heat-cell pad';
      fragment.appendChild(pad);
    }
    const monthStarts = [];
    counts.forEach((n, i) => {
      const date = new Date(start.getTime() + i * 86400000);
      if (date.getUTCDate() === 1) monthStarts.push({ col: Math.floor((i + leading) / 7), month: date.getUTCMonth() });
      const cell = document.createElement('span');
      cell.className = `heat-cell l${level(n)}`;
      cell.dataset.n = String(n);
      cell.dataset.date = date.toISOString().slice(0, 10);
      cell.style.setProperty('--i', String(Math.floor((i + leading) / 7) * 7));
      fragment.appendChild(cell);
    });
    grid.appendChild(fragment);
    const monthLabels = () => {
      const names = language === 'zh' ? monthsZh : monthsEn;
      const cols = Math.ceil((counts.length + leading) / 7);
      monthsRow.innerHTML = monthStarts.map((s) => `<span style="left:${(s.col / cols * 100).toFixed(2)}%">${names[s.month]}</span>`).join('');
    };
    body.append(monthsRow, grid);
    heat.append(body);
    monthLabels();

    const cells = $$('.heat-cell:not(.pad)', grid);
    let hot = null;
    const defaultReadout = () => {
      if (readout) readout.textContent = t('悬停或聚焦任一天查看提交数', 'Hover or focus a day to see its commits');
    };
    const show = (cell) => {
      if (hot) hot.classList.remove('is-hot');
      hot = cell;
      if (!cell) { defaultReadout(); return; }
      cell.classList.add('is-hot');
      const n = Number(cell.dataset.n);
      readout.textContent = language === 'zh' ? `${cell.dataset.date} · ${n} 个提交` : `${cell.dataset.date} · ${n} commit${n === 1 ? '' : 's'}`;
    };
    grid.addEventListener('pointerover', (e) => { if (e.target.classList.contains('heat-cell') && !e.target.classList.contains('pad')) show(e.target); });
    grid.addEventListener('pointerleave', () => show(null));
    // Keyboard: one roving tab stop, arrow keys move by day / week.
    let focusIndex = counts.indexOf(Math.max(...counts));
    cells.forEach((c, i) => c.setAttribute('tabindex', i === focusIndex ? '0' : '-1'));
    grid.setAttribute('role', 'grid');
    grid.addEventListener('focusin', (e) => { if (e.target.classList.contains('heat-cell')) show(e.target); });
    grid.addEventListener('focusout', () => show(null));
    grid.addEventListener('keydown', (e) => {
      const deltas = { ArrowRight: 7, ArrowLeft: -7, ArrowDown: 1, ArrowUp: -1 };
      if (!(e.key in deltas)) return;
      e.preventDefault();
      const next = Math.max(0, Math.min(cells.length - 1, focusIndex + deltas[e.key]));
      cells[focusIndex].setAttribute('tabindex', '-1');
      focusIndex = next;
      cells[next].setAttribute('tabindex', '0');
      cells[next].focus();
    });
    defaultReadout();
    languageListeners.push(() => { monthLabels(); show(hot); });
    if (!('IntersectionObserver' in window) || reducedMotion()) heat.classList.add('is-in');
  }

  /* ---------------- architecture map ---------------- */
  const P = { zh: '生产', en: 'PROD', cls: 'prod' };
  const L = { zh: '内网', en: 'LAB', cls: 'lab' };
  const archData = {
    web: {
      kicker: 'CLIENTS / WEB',
      title: ['Web 主前端', 'Web application'],
      body: ['Vue 3 + TypeScript 的主前端，覆盖 15 个业务域：数据集、治理、项目任务流、模型与 Agent、考培。我在第一天提交了它的骨架。', 'The main Vue 3 + TypeScript frontend across 15 business domains: datasets, governance, project workflows, models and agents, training. I committed its skeleton on day one.'],
      facts: [[['业务域页面', 'Business domains'], '15'], [['前端仓提交', 'Frontend commits'], '1,613'], [['主前端测试接入门禁', 'Frontend tests gated in CI'], '1,219', L]]
    },
    tools: {
      kicker: 'CLIENTS / ANNOTATION',
      title: ['标注工具矩阵', 'Annotation tool suite'],
      body: ['图像、文本、音频、视频、点云、医学、时序、具身等 10 类模态的标注工具，以微前端方式挂载，React 与 Vue 双栈各自独立部署。点云工具在生产真机上承载百万级点。', 'Annotation tools for ten modalities, from images and text to point clouds, medical imaging, time series and embodied data, mounted as micro-frontends with React and Vue shipped independently. The point-cloud tool handles a million points in production.'],
      facts: [[['标注工具 / 模态', 'Tools / modalities'], '21 / 10'], [['118 万点首帧', 'First frame, 1.18 M points'], '≤ 1.4 s', P], [['拖动帧率', 'Orbit frame rate'], '119–120 FPS', P]]
    },
    desktop: {
      kicker: 'CLIENTS / DESKTOP',
      title: ['桌面端', 'Desktop client'],
      body: ['为本地大数据与离线场景立项的 Electron 客户端：Rust + NAPI-RS 自研点云八叉树，Go 写 BFF。我定下“桌面端只做宿主，工具只有一份实现”，一个 5,432 行的视图拆包后剩 259 行。截至 2026-08 仍处于内网集成态。', 'An Electron client for local data and offline work, with a Rust + NAPI-RS point-cloud octree and a Go BFF. I set the rule that the desktop is a host and every tool has exactly one implementation; a 5,432-line view shrank to 259 lines after packaging. As of Aug 2026 it was still in internal integration.'],
      facts: [[['我的桌面端提交', 'My desktop commits'], '703'], [['LOD 更新 P95', 'LOD update P95'], '0.32 ms', L], [['Vitest 用例', 'Vitest cases'], '1,432 / 0 fail', L]]
    },
    gateway: {
      kicker: 'EDGE / GATEWAY',
      title: ['网关 · 认证 · 多租户', 'Gateway · auth · tenancy'],
      body: ['所有请求的统一入口。多租户做成三层纵深：数据访问层自动加租户条件、入口处 fail-closed 校验资源归属、网络层用 HMAC 签名保护内部调用。另有每日权限漂移哨兵，自动比对快照并生成修复 SQL。', 'The single entry point. Multi-tenancy in three layers: tenant filters in data access, fail-closed ownership checks at the entry, and HMAC-signed internal calls at the network layer. A daily drift sentinel diffs permission snapshots and generates fix-up SQL.'],
      facts: [[['生产基线租户 / 有效授权', 'Tenants / active grants'], '48 / 5,804', P], [['治理复合漏洞修复上线', 'Governance fixes shipped'], '26 / 26', P], [['发版凭证矩阵全验', 'Credential matrix verified'], '77 / 77', P]]
    },
    modules: {
      kicker: 'SERVICES / DOMAIN',
      title: ['10 个业务模块', 'Ten domain modules'],
      body: ['模块化单体加网关，而不是彻底微服务：由团队规模和交付节奏决定。数据集、治理、项目、AI、Agent、BPM、考培等模块共用 17 个自研 starter。代价也写进了我自己的架构评审。', 'A modular monolith behind a gateway rather than full microservices, a choice driven by team size and delivery pace. Datasets, governance, projects, AI, agents, BPM and training share 17 in-house starters. The trade-offs are listed in my own architecture review.'],
      facts: [[['Controller / 自研 starter', 'Controllers / starters'], '210 / 17'], [['生产库表', 'Production tables'], '367', P], [['后端仓提交', 'Backend commits'], '2,793']]
    },
    agent: {
      kicker: 'SERVICES / AGENT',
      title: ['SolarClaw Agent', 'SolarClaw agent'],
      body: ['平台内置 Agent：MCP 网关接管 150+ 工具，25 个 Skill，8 个确定性工作流。我负责架构、质量审计与 harness 优化，定位出多轮失败与缓存命中低的真实原因。', 'The built-in agent: an MCP gateway exposing 150+ tools, 25 skills and 8 deterministic workflows. I owned its architecture, quality audit and harness tuning, and traced the real causes of multi-turn failures and low cache hits.'],
      facts: [[['输入 token', 'Input tokens'], '−43.6%', L], [['reflection 失败率', 'Reflection failures'], '34.7% → 0', L], [['一个 MCP 工具平均耗时', 'One MCP tool, mean latency'], '72 s → 3.4 s', L]]
    },
    queue: {
      kicker: 'EXECUTION / QUEUE',
      title: ['四级任务队列', 'Four-lane task queue'],
      body: ['队列放在 MySQL，与任务状态同一事务：SKIP LOCKED 并发领取，Redis 心跳与 GPU 限流，outbox 发事件。按资源分 cpu / io / gpu / preview 四级，试跑走独立高优队列，不再被大批量任务堵住。', 'The queue lives in MySQL, in the same transaction as task state: SKIP LOCKED claiming, Redis heartbeats and GPU throttling, an outbox for events. Four lanes by resource (cpu / io / gpu / preview); previews get their own high-priority lane and are never stuck behind bulk work.'],
      facts: [[['万级任务提交', '10k-task submission'], '0.89 s', L], [['280 次重试产出版本', 'Versions after 280 retries'], '1', L], [['预览领取 P95', 'Preview claim P95'], '0.176 s', L]]
    },
    worker: {
      kicker: 'EXECUTION / WORKERS',
      title: ['DAG Worker 与五态交付', 'DAG workers, five-stage delivery'],
      body: ['Python DAG 引擎执行缩略图、转码、清洗、脱敏、OCR/ASR、检测分割预标注等算子。算子契约是一份 manifest，生成 Worker 与 Java 两侧定义。交付状态机把“算完了”和“交付了”拆开。', 'A Python DAG engine runs operators from thumbnails and transcoding to cleaning, redaction, OCR/ASR and detection or segmentation pre-labels. A single manifest defines the operator contract for both the workers and Java. The delivery state machine separates "computed" from "delivered".'],
      facts: [[['生产内置算子', 'Built-in operators'], '53', P], [['算子 × 模式全部真跑 READY', 'Operator × mode cells READY'], '112 / 112', L], [['Worker 副本', 'Worker replicas'], '16', L]]
    },
    models: {
      kicker: 'EXECUTION / MODELS',
      title: ['模型服务', 'Model serving'],
      body: ['把散落在 GPU 机上的模型统一成最小契约：只暴露 /infer 与 /health，网关按需扩容、空闲缩到 0。健康状态改成实时探活，不再相信数据库里的状态位。', 'Scattered GPU services unified behind a minimal contract, just /infer and /health, with the gateway scaling on demand and down to zero when idle. Health now comes from live probes instead of a status column in the database.'],
      facts: [[['统一模型入口', 'Unified model entries'], '16', L], [['scale-to-zero 冷启动', 'Cold start from zero'], '34 s', L], [['CPU 分割延迟', 'CPU segmentation latency'], '6,000 → 640 ms', L]]
    },
    storage: {
      kicker: 'DATA / STORAGE',
      title: ['元数据 · 标注 · 版本 · 对象', 'Metadata · labels · versions · objects'],
      body: ['MySQL 存元数据与权限，MongoDB 存标注正文，LakeFS 做数据版本（branch / commit / tag，零拷贝），对象存储承载原始数据。血缘用资产引用加事件建模，导出物可回溯到源数据集版本。', 'MySQL for metadata and permissions, MongoDB for annotation bodies, LakeFS for data versions (branch / commit / tag, zero-copy) and object storage for raw data. Lineage is modelled as asset references plus events, so every export traces back to a source version.'],
      facts: [[['9.9 GiB 直传', '9.9 GiB direct upload'], '41.8 MiB/s', P], [['血缘事件回填，对账全等', 'Lineage events, reconciled'], '18,370', P], [['12 GB 事故重新入湖', '12 GB incident re-ingest'], '6 min', L]]
    },
    delivery: {
      kicker: 'RUNTIME / DELIVERY',
      title: ['发布与交付', 'Release & delivery'],
      body: ['云上单机 k3s + Argo CD GitOps，CI 是唯一出图口，回滚是改一行 tag。另一条线是离线私有化：x86 compose 包与国产 ARM64 + 麒麟现场交付，出包前必须在同规格机器真装。', 'Cloud production on single-node k3s with Argo CD GitOps; CI is the only source of images and rollback is a one-line tag change. The other line is offline on-prem: x86 compose packages and ARM64 + Kylin on site, always installed on matching hardware before shipping.'],
      facts: [[['GitOps 纳管 Deployment', 'Deployments under GitOps'], '28+', P], [['连续 baseline 版本', 'Consecutive baselines'], '8'], [['ARM64 包镜像', 'ARM64 package images'], '27']]
    },
    observe: {
      kicker: 'RUNTIME / OBSERVABILITY',
      title: ['可观测', 'Observability'],
      body: ['request id 贯穿、日志护栏与错误分级、Loki + Prometheus + Grafana、飞书告警与自愈。一次生产假死 3 天无人报障，原因是探针只探 JVM 存活；之后探针改为打业务路径。', 'Request IDs end to end, logging guardrails and error grading, Loki + Prometheus + Grafana, alerting and self-healing. Once, production hung for three days unnoticed because probes only checked that the JVM was alive; probes now exercise real business paths.'],
      facts: [[['日志量', 'Log volume'], '−84.9%', P], [['告警有效覆盖', 'Effective alert coverage'], '64 / 64', P], [['15 天探针可用性', 'Availability, 15-day probe'], '99.9975%', P]]
    }
  };
  const archNodes = $$('.arch-node');
  const archDetail = $('#arch-detail');
  let archActive = 'gateway';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function renderArch(animate) {
    const item = archData[archActive];
    if (!item || !archDetail) return;
    const pick = (pair) => (language === 'zh' ? pair[0] : pair[1]);
    $('#arch-kicker').textContent = item.kicker;
    $('#arch-title').textContent = pick(item.title);
    $('#arch-body').textContent = pick(item.body);
    $('#arch-facts').innerHTML = item.facts.map(([label, value, tag]) => {
      const tagHtml = tag ? `<span class="tag ${tag.cls}">${esc(language === 'zh' ? tag.zh : tag.en)}</span>` : '';
      return `<li><span>${esc(pick(label))}</span><strong>${esc(value)}${tagHtml}</strong></li>`;
    }).join('');
    archNodes.forEach((n) => n.setAttribute('aria-pressed', String(n.dataset.node === archActive)));
    if (animate && !reducedMotion()) {
      archDetail.classList.remove('is-swapping');
      void archDetail.offsetWidth;
      archDetail.classList.add('is-swapping');
    }
  }
  archNodes.forEach((n) => n.addEventListener('click', () => {
    archActive = n.dataset.node;
    renderArch(true);
    if (window.innerWidth <= 1180 && archDetail) {
      const rect = archDetail.getBoundingClientRect();
      if (rect.top > window.innerHeight - 120) archDetail.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
    }
  }));
  languageListeners.push(() => renderArch(false));

  /* ---------------- case tabs ---------------- */
  const tabs = $$('.case-tabs [role="tab"]');
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
  function selectTab(tab, focus) {
    tabs.forEach((other, i) => {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      other.setAttribute('tabindex', selected ? '0' : '-1');
      panels[i].hidden = !selected;
      panels[i].classList.toggle('is-active', selected);
    });
    if (focus) tab.focus();
    if (tab.scrollIntoView && window.innerWidth <= 980) {
      tab.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (e) => {
      const vertical = window.innerWidth > 980;
      const nextKey = vertical ? 'ArrowDown' : 'ArrowRight';
      const prevKey = vertical ? 'ArrowUp' : 'ArrowLeft';
      let target = null;
      if (e.key === nextKey) target = tabs[(i + 1) % tabs.length];
      else if (e.key === prevKey) target = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') target = tabs[0];
      else if (e.key === 'End') target = tabs[tabs.length - 1];
      if (target) { e.preventDefault(); selectTab(target, true); }
    });
  });
  if (tabs.length) {
    const fromHash = tabs.find((tab) => `#${tab.getAttribute('aria-controls')}` === window.location.hash);
    selectTab(fromHash || tabs[0]);
  }
  // Capability evidence links open the matching case.
  $$('[data-case]').forEach((link) => link.addEventListener('click', (e) => {
    const tab = document.getElementById(link.dataset.case);
    if (!tab) return;
    e.preventDefault();
    selectTab(tab);
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    const target = window.innerWidth <= 980 ? $('#casebook') : panel;
    target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${panel.id}`);
    window.setTimeout(() => panel.focus({ preventScroll: true }), reducedMotion() ? 0 : 500);
  }));

  /* ---------------- delivery machine ---------------- */
  const machine = $('#machine');
  const playBtn = $('#machine-play');
  const log = $('#machine-log');
  if (machine && playBtn && log) {
    const rail = $$('.machine-rail li', machine);
    const script = [
      { at: 0, s: 0, zh: 'submit  task#20417  files=10,025  → 已入队，0.89 s 返回', en: 'submit  task#20417  files=10,025  → queued, returned in 0.89 s' },
      { at: 700, s: 1, zh: 'claim   worker-3 领取 chunk 1..64（FOR UPDATE SKIP LOCKED）', en: 'claim   worker-3 took chunks 1..64 (FOR UPDATE SKIP LOCKED)' },
      { at: 1500, s: 2, zh: 'build   产物写入 staging，逐个校验非空 / 类型 / SHA-256', en: 'build   artifacts to staging, each checked: non-empty / type / SHA-256' },
      { at: 2300, s: 3, fail: true, cls: 'warn', zh: 'WARN    worker-3 心跳超时（Pod 重启），任务停在 COMMITTING', en: 'WARN    worker-3 heartbeat lost (pod restart), task held at COMMITTING' },
      { at: 3300, s: 3, cls: 'dim', zh: 'reclaim worker-5 接手；幂等键 task+file 命中 9,812 条，跳过已提交', en: 'reclaim worker-5 resumes; idempotency key task+file matched 9,812, skipping committed' },
      { at: 4200, s: 4, zh: 'version LakeFS commit 一次，血缘事件闭合', en: 'version one LakeFS commit, lineage events closed' },
      { at: 5000, s: 5, cls: 'ok', zh: 'READY   产物可读 · 版本落账 · 血缘闭合 — 数据集版本数 = 1', en: 'READY   readable · versioned · lineage closed — dataset versions = 1' }
    ];
    let timers = [];
    let running = false;
    const stop = () => { timers.forEach(clearTimeout); timers = []; running = false; };
    const setRail = (s, fail) => rail.forEach((li, i) => {
      li.classList.toggle('done', i < s || (s === 5 && i === 5));
      li.classList.toggle('now', i === s && !fail && s !== 5);
      li.classList.toggle('fail', i === s && Boolean(fail));
    });
    const setButton = () => {
      playBtn.innerHTML = running
        ? `<i class="icon i-reset" aria-hidden="true"></i>${t('重新播放', 'Replay')}`
        : `<i class="icon i-play" aria-hidden="true"></i>${t(machine.dataset.played ? '重新播放' : '播放一次交付', machine.dataset.played ? 'Replay' : 'Run a delivery')}`;
    };
    const line = (step) => {
      const span = document.createElement('span');
      if (step.cls) span.className = step.cls;
      span.textContent = `${t(step.zh, step.en)}\n`;
      log.appendChild(span);
      while (log.childNodes.length > 7) log.removeChild(log.firstChild);
    };
    const play = () => {
      stop();
      running = true;
      machine.dataset.played = '1';
      log.textContent = '';
      setRail(-1);
      setButton();
      const speed = reducedMotion() ? 0 : 1;
      script.forEach((step, idx) => {
        timers.push(setTimeout(() => {
          line(step);
          setRail(step.s, step.fail);
          if (idx === script.length - 1) { running = false; setButton(); }
        }, step.at * speed));
      });
    };
    playBtn.addEventListener('click', play);
    languageListeners.push(() => { setButton(); if (!machine.dataset.played) log.textContent = t('按“播放”看一次包含 Worker 中断与恢复的交付过程。', 'Press "Run" to watch a delivery that survives a worker restart.'); });
    // Auto-play once when first visible.
    if ('IntersectionObserver' in window && !reducedMotion()) {
      const mio = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !machine.dataset.played && !machine.closest('[hidden]')) { play(); mio.disconnect(); }
        });
      }, { threshold: 0.6 });
      mio.observe(machine);
    }
  }

  /* ---------------- email copy ---------------- */
  const copyButton = $('#copy-email');
  const copyStatus = $('#copy-status');
  let copyTimer = null;
  if (copyButton && copyStatus) {
    copyButton.addEventListener('click', async () => {
      const email = copyButton.dataset.email;
      let ok = false;
      try {
        if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(email); ok = true; }
      } catch (_) { ok = false; }
      if (!ok) {
        const area = document.createElement('textarea');
        area.value = email;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
        area.remove();
      }
      copyStatus.style.color = ok ? '' : 'var(--red)';
      copyStatus.textContent = ok ? t('已复制邮箱地址', 'Email address copied') : t('复制失败，请直接使用上方邮箱链接', 'Copy failed. Please use the email link above.');
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { copyStatus.textContent = ''; }, 3200);
    });
  }

  const year = $('#year-now');
  if (year) year.textContent = String(new Date().getFullYear());

  applyLanguage(language, false);
  window.__siteLanguage = () => language;
})();
