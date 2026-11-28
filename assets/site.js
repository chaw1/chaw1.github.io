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
  const navLinks = $$('a[data-nav]');
  const navIds = new Set(navLinks.map((a) => a.hash.slice(1)));
  const sections = $$('main [id]').filter((el) => navIds.has(el.id));
  function updateCurrent() {
    const line = (header ? header.offsetHeight : 0) + 16;
    let current = null;
    sections.forEach((s) => { if (s.getBoundingClientRect().top <= line) current = s.id; });
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) current = 'contact';
    navLinks.forEach((a) => {
      if (a.getAttribute('href') === `#${current}`) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', updateCurrent, { passive: true });
  window.addEventListener('resize', updateCurrent);
  languageListeners.push(updateCurrent);
  updateCurrent();

  /* ---------------- reveal + count-up ---------------- */
  const revealTargets = $$('.section-intro, .case-dir, .stats, .heatmap-card, .milestones, .arch, .casebook, .loop, .ledger, .principles, .project-grid, .project-list, .pj-feature, .pj-mini, .caps, .experience, .contact > div');
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
    // On narrow screens the grid scrolls sideways; open on the recent months, where the peaks are.
    const heatScroll = heat.closest('.heatmap-scroll');
    if (heatScroll && heatScroll.scrollWidth > heatScroll.clientWidth) heatScroll.scrollLeft = heatScroll.scrollWidth;

    const cells = $$('.heat-cell:not(.pad)', grid);
    let hot = null;
    const defaultReadout = () => {
      if (readout) readout.textContent = t('悬停或聚焦任一天查看提交数', 'Hover or focus a day to see its commits');
    };
    const describe = (cell) => {
      const n = Number(cell.dataset.n);
      return language === 'zh' ? `${cell.dataset.date} · ${n} 个提交` : `${cell.dataset.date} · ${n} commit${n === 1 ? '' : 's'}`;
    };
    // Each day is a focusable image with its own accessible name (the visible readout mirrors it).
    const labelCells = () => cells.forEach((c) => c.setAttribute('aria-label', describe(c)));
    cells.forEach((c) => c.setAttribute('role', 'img'));
    labelCells();
    const show = (cell) => {
      if (hot) hot.classList.remove('is-hot');
      hot = cell;
      if (!cell) { defaultReadout(); return; }
      cell.classList.add('is-hot');
      if (readout) readout.textContent = describe(cell);
    };
    const focusedDay = () => grid.contains(document.activeElement) ? document.activeElement : null;
    const hoverDay = (e) => {
      if (e.target.matches('.heat-cell:not(.pad)')) show(e.target);
    };
    grid.addEventListener('pointerover', (e) => { if (!focusedDay()) hoverDay(e); });
    grid.addEventListener('pointermove', (e) => { if (e.movementX || e.movementY) hoverDay(e); });
    grid.addEventListener('pointerleave', () => show(focusedDay()));
    // Keyboard: one roving tab stop, arrow keys move by day / week.
    let focusIndex = counts.indexOf(Math.max(...counts));
    cells.forEach((c, i) => c.setAttribute('tabindex', i === focusIndex ? '0' : '-1'));
    grid.addEventListener('focusin', (e) => {
      if (!e.target.classList.contains('heat-cell')) return;
      // Keep the roving tab stop on the day that was actually focused (e.g. by click).
      const i = cells.indexOf(e.target);
      if (i >= 0 && i !== focusIndex) { cells[focusIndex].setAttribute('tabindex', '-1'); focusIndex = i; e.target.setAttribute('tabindex', '0'); }
      show(e.target);
    });
    grid.addEventListener('focusout', () => show(null));
    grid.addEventListener('keydown', (e) => {
      const deltas = { ArrowRight: 7, ArrowLeft: -7, ArrowDown: 1, ArrowUp: -1 };
      let next;
      if (e.key in deltas) next = focusIndex + deltas[e.key];
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = cells.length - 1;
      else return;
      e.preventDefault();
      next = Math.max(0, Math.min(cells.length - 1, next));
      cells[focusIndex].setAttribute('tabindex', '-1');
      focusIndex = next;
      cells[next].setAttribute('tabindex', '0');
      cells[next].focus();
    });
    defaultReadout();
    languageListeners.push(() => { monthLabels(); labelCells(); show(hot); });
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
      body: ['图像、文本、音频、视频、点云、医学、时序、具身等 10 类模态的标注工具，以微前端方式挂载，React 与 Vue 双栈各自独立部署。点云工具在生产真机上承载百万级点。', 'Annotation tools for ten modalities, from images and text to point clouds, medical imaging, time series and embodied data, mounted as micro-frontends with React and Vue shipped independently. In production, the point-cloud tool handles frames of over a million points.'],
      facts: [[['工具入口 / 模态（含占位入口）', 'Tool entries / modalities (incl. placeholders)'], '21 / 10'], [['118 万点首帧', 'First frame, 1.18 M points'], '≤ 1.4 s', P], [['拖动帧率', 'Orbit frame rate'], '119–120 FPS', P]]
    },
    desktop: {
      kicker: 'CLIENTS / DESKTOP',
      title: ['桌面端', 'Desktop client'],
      body: ['为本地大数据与离线场景立项的 Electron 客户端：Rust + NAPI-RS 自研点云八叉树，Go 写 BFF。我定下“桌面端只做宿主，工具只有一份实现”，一个 5,432 行的视图拆包后剩 259 行，已交付公司内部与工业、具身方向客户使用。', 'An Electron client for local data and offline work, with a Rust + NAPI-RS point-cloud octree and a Go BFF. I set the rule that the desktop is only a host and every tool has exactly one implementation; a 5,432-line view shrank to 259 lines, shipped for internal teams and industrial / embodied customers.'],
      facts: [[['我的桌面端提交', 'My desktop commits'], '703'], [['LOD 更新 P95', 'LOD update P95'], '0.32 ms', L], [['Vitest 用例', 'Vitest cases'], '1,432 / 0 fail', L]]
    },
    gateway: {
      kicker: 'EDGE / GATEWAY',
      title: ['网关 · 认证 · 多租户', 'Gateway · auth · tenancy'],
      body: ['所有请求的统一入口。多租户做成三层纵深：数据访问层自动加租户条件、入口处 fail-closed 与按任务鉴权文件网关 + 预览票据（配合 Go 水印媒体代理）、网络层用 HMAC 签名保护内部调用，并有每日权限漂移哨兵自动比对。', 'The single entry point. Multi-tenancy in three layers: data-access filters, task-scoped file gateway & preview tickets (backed by a Go watermarked media proxy), HMAC-signed internal calls, and a daily permission drift sentinel.'],
      facts: [[['生产基线租户 / 有效授权', 'Tenants / active grants'], '48 / 5,804', P], [['治理复合漏洞修复上线', 'Governance fixes shipped'], '26 / 26', P], [['发版凭证矩阵全验', 'Credential matrix verified'], '77 / 77', P]]
    },
    modules: {
      kicker: 'SERVICES / DOMAIN',
      title: ['10 个业务模块', 'Ten domain modules'],
      body: ['模块化单体加网关，而不是彻底微服务：由团队规模和交付节奏决定。与 QApex 双平台拆分后保留独立网关与数据库，并牵头全平台语义统一与 211 条黄金样例三端 CI 门禁。', 'A modular monolith behind a gateway driven by team size and pace. Spun off QApex with independent gateways and databases, and enforced 211 golden semantic-contract checks across Java, Python and frontend CI.'],
      facts: [[['Controller / 自研 starter', 'Controllers / starters'], '210 / 17'], [['语义合同格式 / CI 样例', 'Formats / golden CI cases'], '40 / 211'], [['后端仓提交', 'Backend commits'], '2,793']]
    },
    agent: {
      kicker: 'SERVICES / AGENT',
      title: ['SolarClaw Agent', 'SolarClaw agent'],
      body: ['拆读 OpenClaw 自研 3,000+ 行 Java 主循环（源码审计排除外部框架无多租户与远程 Skill RCE 风险）：MCP 网关接 150+ 工具与参数绑定一次性写审批；982 次调用埋点调优定位跨轮失败与缓存瓶颈。', '3,000+ line Java main loop modeled on OpenClaw after rejecting external frameworks over missing tenancy and Skill RCE; 150+ MCP tools with parameter-bound approvals, tuned via 982-call segment traces.'],
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
      title: ['DAG Worker 与执行隔离', 'DAG workers & isolation'],
      body: ['Python DAG 引擎执行 53 个内置算子；将 Python 执行沙箱隔离边界下沉至容器层（K8s NetworkPolicy 白名单、非 root、收回 Linux 能力、seccomp），交付状态机把“算完了”和“交付了”严格拆开。', 'A Python DAG engine running 53 built-in operators, with custom execution isolation enforced at the container layer (NetworkPolicy allowlists, non-root, dropped Linux capabilities, seccomp) and a delivery state machine separating computed from delivered.'],
      facts: [[['生产内置算子', 'Built-in operators'], '53', P], [['算子 × 模式全部真跑 READY', 'Operator × mode cells READY'], '112 / 112', L], [['Worker 副本', 'Worker replicas'], '16', L]]
    },
    models: {
      kicker: 'EXECUTION / MODELS',
      title: ['模型服务与 GPU 准入', 'Model serving & GPU admission'],
      body: ['把散落 GPU 服务统一 behind /infer 与 /health：按需唤醒与空闲缩容至 0，设计 GPU 准入（错误分级、按卡排队限流、显存巡检、全链路超时对齐）并修复冷启动实例误回收竞态，健康只信实时探活。', 'Unified scattered model units behind /infer and /health with scale-to-zero, per-GPU queuing & admission, VRAM checks, aligned timeouts, a cold-start reclamation race fix, and live health probes.'],
      facts: [[['统一模型入口', 'Unified model entries'], '16', L], [['scale-to-zero 冷启动', 'Cold start from zero'], '34 s', L], [['CPU 分割延迟', 'CPU segmentation latency'], '6,000 → 640 ms', L]]
    },
    storage: {
      kicker: 'DATA / STORAGE',
      title: ['元数据 · 标注 · 版本 · 对象', 'Metadata · labels · versions · objects'],
      body: ['MySQL 存元数据（367 表）与权限，MongoDB 存标注正文，LakeFS 做数据版本，对象存储承载 TB 级分片直传（1 TiB 上限）；面向十万小时多模态与具身一期做六层容量规划，血缘回填 18,370 条全等对账。', 'MySQL (367 tables), MongoDB, LakeFS and object storage with 1 TiB presigned multipart caps; six-layer capacity plan for 100k multimodal hours and phase-1 embodied pipelines, with 18,370 reconciled lineage events.'],
      facts: [[['约 10 GB 直传', '~10 GB direct upload'], '41.8 MiB/s', P], [['血缘事件回填，对账全等', 'Lineage events, reconciled'], '18,370', P], [['密集标注单图打开', '1,035-label image open'], '5 min → 2.4 s', L]]
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
      facts: [[['access log 行数', 'Access-log lines'], '−94.6%', P], [['告警有效覆盖', 'Effective alert coverage'], '64 / 64', P], [['15 天探针可用性', 'Availability, 15-day probe'], '99.9975%', P]]
    }
  };
  const archNodes = $$('.arch-node');
  const archDetail = $('#arch-detail');
  let archActive = 'queue';
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

  // Paths through the map: highlight the nodes a request actually crosses.
  const archPaths = {
    deliver: { nodes: ['web', 'gateway', 'modules', 'queue', 'worker', 'models', 'storage'], focus: 'queue',
      zh: '任务交付：提交在一个事务里写入任务与队列 → Worker 用 SKIP LOCKED 领取 → 调模型服务 → 产物校验后一次提交版本与血缘。', en: 'Task delivery: submission writes task and queue in one transaction → workers claim with SKIP LOCKED → call model serving → artifacts verified, then one commit of version and lineage.' },
    ingest: { nodes: ['web', 'gateway', 'modules', 'storage'], focus: 'storage',
      zh: '大包入库：浏览器只向后端要签名，分片直传对象存储；后端自己列目录核对后合并，再建数据版本。', en: 'Archive ingest: the browser asks the backend only for signatures and uploads parts straight to object storage; the backend lists and checks before merging, then versions the data.' }
  };
  const pathButtons = $$('[data-path]');
  const pathNote = $('.arch-path-note');
  let activePath = null;
  function renderPath() {
    const path = activePath ? archPaths[activePath] : null;
    archNodes.forEach((n) => {
      n.classList.toggle('on-path', Boolean(path && path.nodes.includes(n.dataset.node)));
      n.classList.toggle('off-path', Boolean(path && !path.nodes.includes(n.dataset.node)));
    });
    pathButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.path === activePath)));
    if (pathNote) pathNote.textContent = path ? t(path.zh, path.en) : '';
  }
  pathButtons.forEach((b) => b.addEventListener('click', () => {
    activePath = activePath === b.dataset.path ? null : b.dataset.path;
    if (activePath) { archActive = archPaths[activePath].focus; renderArch(true); }
    renderPath();
    drawWires();
  }));
  // Selecting a component outside the current path leaves path mode, so nothing stays greyed out.
  archNodes.forEach((n) => n.addEventListener('click', () => {
    if (activePath && !archPaths[activePath].nodes.includes(n.dataset.node)) { activePath = null; renderPath(); drawWires(); }
  }));
  languageListeners.push(renderPath);

  // Wires: an SVG layer that routes the active path through the map, with packets flowing along it.
  const archMap = $('.arch-map');
  let wireSvg = null, wirePath = null, wireGlow = null, packets = [], wireLen = 0, wireRaf = 0, wireVisible = false;
  if (archMap) {
    const NS = 'http://www.w3.org/2000/svg';
    wireSvg = document.createElementNS(NS, 'svg');
    wireSvg.setAttribute('class', 'arch-wires');
    wireSvg.setAttribute('aria-hidden', 'true');
    wireGlow = document.createElementNS(NS, 'path'); wireGlow.setAttribute('class', 'wire-glow');
    wirePath = document.createElementNS(NS, 'path'); wirePath.setAttribute('class', 'wire');
    wireSvg.append(wireGlow, wirePath);
    for (let i = 0; i < 4; i++) { const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', i ? '3' : '4.5'); c.setAttribute('class', 'packet'); wireSvg.append(c); packets.push(c); }
    archMap.prepend(wireSvg);
  }
  function drawWires() {
    if (!wireSvg) return;
    const box = archMap.getBoundingClientRect();
    wireSvg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    const path = activePath ? archPaths[activePath] : null;
    archMap.classList.toggle('has-path', Boolean(path));
    if (!path) { wirePath.setAttribute('d', ''); wireGlow.setAttribute('d', ''); wireLen = 0; return; }
    const pts = path.nodes.map((id) => {
      const r = archMap.querySelector(`[data-node="${id}"]`).getBoundingClientRect();
      return [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2];
    });
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      if (Math.abs(y1 - y0) < 4) d += ` L${x1},${y1}`;
      else { const my = (y0 + y1) / 2; d += ` L${x0},${my} L${x1},${my} L${x1},${y1}`; }
    }
    wirePath.setAttribute('d', d); wireGlow.setAttribute('d', d);
    wireLen = wirePath.getTotalLength();
    wirePath.style.setProperty('--len', wireLen);
    wirePath.classList.remove('is-drawing'); void wirePath.getBBox(); wirePath.classList.add('is-drawing');
    if (!wireRaf && wireVisible) wireRaf = requestAnimationFrame(tickWires);
  }
  function tickWires(now) {
    wireRaf = 0;
    if (!wireLen || !wireVisible) { packets.forEach((c) => c.setAttribute('opacity', '0')); return; }
    const period = Math.max(2600, wireLen * 4.5);
    packets.forEach((c, i) => {
      const f = ((now / period) + i * 0.09) % 1;
      const pt = wirePath.getPointAtLength(f * wireLen);
      c.setAttribute('cx', pt.x); c.setAttribute('cy', pt.y);
      c.setAttribute('opacity', String((i ? 0.55 - i * 0.12 : 1) * Math.min(1, f * 8, (1 - f) * 8)));
    });
    if (!reducedMotion()) wireRaf = requestAnimationFrame(tickWires);
  }
  if (archMap) {
    window.addEventListener('resize', () => requestAnimationFrame(drawWires));
    languageListeners.push(() => requestAnimationFrame(drawWires));
    const startPath = () => { if (!activePath) { activePath = 'deliver'; archActive = archPaths.deliver.focus; renderArch(false); renderPath(); } drawWires(); };
    if ('IntersectionObserver' in window) {
      let started = false;
      new IntersectionObserver((es) => es.forEach((e) => {
        wireVisible = e.isIntersecting;
        if (wireVisible && !started) { started = true; startPath(); }
        else if (wireVisible && !wireRaf) wireRaf = requestAnimationFrame(tickWires);
      }), { threshold: 0.25 }).observe(archMap);
    } else { wireVisible = true; startPath(); }
  }

  /* ---------------- case tabs ---------------- */
  const tabs = $$('.case-tabs [role="tab"]');
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
  function selectTab(tab, focus, options = {}) {
    tabs.forEach((other, i) => {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      other.setAttribute('tabindex', selected ? '0' : '-1');
      panels[i].hidden = !selected;
      panels[i].classList.toggle('is-active', selected);
    });
    if (focus) tab.focus();
    const hash = '#' + tab.getAttribute('aria-controls');
    if (options.historyMode && window.location.hash !== hash) {
      history[options.historyMode === 'replace' ? 'replaceState' : 'pushState'](null, '', hash);
    }
    if (tabList && window.innerWidth <= 980) {
      const offset = tab.getBoundingClientRect().left - tabList.getBoundingClientRect().left;
      tabList.scrollLeft += offset - (tabList.clientWidth - tab.offsetWidth) / 2;
    }
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab, false, { historyMode: 'push' }));
    tab.addEventListener('keydown', (e) => {
      // The list is vertical on desktop and a horizontal strip on small screens; accept both axes.
      let target = null;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') target = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') target = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') target = tabs[0];
      else if (e.key === 'End') target = tabs[tabs.length - 1];
      if (target) { e.preventDefault(); selectTab(target, true, { historyMode: 'replace' }); }
    });
  });
  const tabList = $('.case-tabs');
  const setOrientation = () => { if (tabList) tabList.setAttribute('aria-orientation', window.innerWidth > 980 ? 'vertical' : 'horizontal'); };
  setOrientation();
  window.addEventListener('resize', setOrientation, { passive: true });
  if (tabs.length) {
    const fromHash = tabs.find((tab) => `#${tab.getAttribute('aria-controls')}` === window.location.hash);
    selectTab(fromHash || tabs[0]);
    if (fromHash) requestAnimationFrame(() => document.getElementById(fromHash.getAttribute('aria-controls')).scrollIntoView({ block: 'start', behavior: 'auto' }));
    // Back / forward and pasted links: keep the open case in step with the URL.
    const syncCaseFromLocation = () => {
      const tab = tabs.find((x) => '#' + x.getAttribute('aria-controls') === window.location.hash) || (!window.location.hash ? tabs[0] : null);
      if (tab && tab.getAttribute('aria-selected') !== 'true') selectTab(tab, false);
    };
    window.addEventListener('hashchange', syncCaseFromLocation);
    window.addEventListener('popstate', syncCaseFromLocation);
  }
  // Capability evidence links open the matching case.
  $$('[data-case]').forEach((link) => link.addEventListener('click', (e) => {
    const tab = document.getElementById(link.dataset.case);
    if (!tab) return;
    e.preventDefault();
    selectTab(tab, false, { historyMode: 'push' });
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    const target = window.innerWidth <= 980 ? $('#casebook') : panel;
    target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    window.setTimeout(() => panel.focus({ preventScroll: true }), reducedMotion() ? 0 : 500);
  }));

  // The delivery machine in case A is driven by assets/figures.js (FIG.A).

  /* ---------------- case sharing ---------------- */
  const shareTimers = new WeakMap();
  $$('[data-copy-case]').forEach((button) => button.addEventListener('click', async () => {
    const status = button.parentElement.querySelector('.case-share-status');
    const url = new URL(window.location.pathname, window.location.origin);
    url.hash = button.dataset.copyCase;
    button.disabled = true;
    let ok = false;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url.href);
      ok = true;
    } catch (_) {
      const area = document.createElement('textarea');
      area.value = url.href;
      area.readOnly = true;
      area.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(area);
      area.select();
      try { ok = document.execCommand('copy'); } catch (_) { /* use the visible URL */ }
      area.remove();
      button.focus({ preventScroll: true });
    } finally { button.disabled = false; }
    clearTimeout(shareTimers.get(button));
    status.textContent = ok ? t('链接已复制', 'Link copied') : t('复制失败，可复制地址栏中的链接。', 'Copy failed. Copy the link from the address bar.');
    if (!ok) history.replaceState(null, '', url.hash);
    shareTimers.set(button, setTimeout(() => { status.textContent = ''; }, 5000));
  }));
  languageListeners.push(() => $$('.case-share-status').forEach((status) => { status.textContent = ''; }));

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

  /* ---------------- print ---------------- */
  // Print every job in full, then restore whichever disclosures the reader had open.
  let openBeforePrint = null;
  window.addEventListener('beforeprint', () => {
    if (openBeforePrint) return; // already prepared; keep the reader's original state
    const jobs = $$('details.job');
    openBeforePrint = jobs.map((d) => d.open);
    jobs.forEach((d) => { d.open = true; });
  });
  window.addEventListener('afterprint', () => {
    if (!openBeforePrint) return;
    $$('details.job').forEach((d, i) => { d.open = openBeforePrint[i]; });
    openBeforePrint = null;
  });

  const year = $('#year-now');
  if (year) year.textContent = String(new Date().getFullYear());

  applyLanguage(language, false);
  window.__siteLanguage = () => language;
})();
