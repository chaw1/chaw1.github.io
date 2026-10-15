/*
 * AI chapter, parts 2 and 3.
 * - Harness anatomy: where one agent call's tokens go (measured: 982 main-chat calls,
 *   per-segment shares calibrated against provider token counts), plus the tuning results.
 * - Agent workbench: the skills I run day to day, generalized; each plays a scripted
 *   "ideal path" run in a terminal. The runs are illustrative and labelled so.
 */
(() => {
  'use strict';

  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => Boolean(motionQuery && motionQuery.matches);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const both = (zh, en) => `<span class="zh">${esc(zh)}</span><span class="en">${esc(en)}</span>`;
  const onView = (el, fn, threshold = 0.3) => {
    if (!('IntersectionObserver' in window)) { fn(true); return; }
    new IntersectionObserver((es) => es.forEach((e) => fn(e.isIntersecting)), { threshold }).observe(el);
  };

  /* ---------------- harness anatomy ---------------- */
  const anatomy = document.getElementById('anatomy');
  if (anatomy) {
    const G = {
      tool: { zh: '工具定义', en: 'Tool definitions', share: 40.5 },
      sys: { zh: 'system 骨架', en: 'System scaffold', share: 31.7 },
      conv: { zh: '会话内容', en: 'Conversation', share: 27.8 }
    };
    // share of all prompt tokens, % (BASELINE, 2026-08-21)
    const SEG = [
      ['tool_schema', 21.1, 'tool', '#b4532f', '工具参数结构，每次都整份发送', 'Parameter schemas, sent in full every call'],
      ['tool_description', 13.2, 'tool', '#cf7a58', '工具说明文字', 'Tool descriptions'],
      ['tool_directory', 2.6, 'tool', '#e3a68c', '扩展工具目录', 'Extended tool directory'],
      ['tool_metadata', 2.2, 'tool', '#eecbbb', '工具元数据', 'Tool metadata'],
      ['skill', 9.5, 'sys', '#3e3c38', '25 个 Skill 的说明', 'Instructions for 25 skills'],
      ['behavior', 8.3, 'sys', '#5e5d59', '行为规范', 'Behavior rules'],
      ['safety', 4.6, 'sys', '#75736c', '安全规则', 'Safety rules'],
      ['memory', 3.0, 'sys', '#97958d', '长期记忆', 'Long-term memory'],
      ['identity', 2.4, 'sys', '#bdbab1', '身份设定', 'Identity'],
      ['task', 2.3, 'sys', '#d2d0c6', '进行中任务', 'Task state'],
      ['tool_result', 16.1, 'conv', '#4f7fae', '工具返回结果', 'Tool results'],
      ['history', 8.8, 'conv', '#8db4dc', '对话历史 —— 大家一直在省的这部分', 'Chat history — the part everyone tries to save on'],
      ['其余 8 段', 5.9, 'other', '#e8e6dc', '其余 8 个段位合计', 'Eight smaller segments']
    ];
    const bar = anatomy.querySelector('.ax-bar');
    const tip = anatomy.querySelector('.ax-tip');
    bar.innerHTML = SEG.map(([k, v, g, col], i) => `<button type="button" class="ax-seg" data-i="${i}" style="--w:${v}%;--c:${col};--d:${i * 55}ms" aria-label="${esc(k)} ${v}%"><span class="mono">${v >= 6 ? esc(k) : ''}</span><b class="mono">${v >= 4 ? v + '%' : ''}</b></button>`).join('');
    const show = (i) => {
      const [k, v, g, col, zh, en] = SEG[i];
      const grp = G[g];
      tip.innerHTML = `<i style="background:${col}"></i><span class="mono">${esc(k)} · ${v}%</span><span>${both(zh, en)}</span>${grp ? `<span class="ax-tip-g">${both(`属于「${grp.zh}」，合计 ${grp.share}%`, `Part of "${grp.en}", ${grp.share}% in total`)}</span>` : ''}`;
      bar.querySelectorAll('.ax-seg').forEach((b, j) => b.classList.toggle('is-on', j === i));
    };
    bar.addEventListener('mouseover', (e) => { const b = e.target.closest('.ax-seg'); if (b) show(+b.dataset.i); });
    bar.addEventListener('focusin', (e) => { const b = e.target.closest('.ax-seg'); if (b) show(+b.dataset.i); });
    bar.addEventListener('click', (e) => { const b = e.target.closest('.ax-seg'); if (b) show(+b.dataset.i); });
    show(0);

    // tuning results: [label zh, label en, before, after, unit, better]
    const RES = [
      ['同批任务输入 token', 'Input tokens, same task set', 159.0, 89.6, ['万', '×10k'], 'down', (v) => v.toFixed(1)],
      ['单个 prompt', 'Single prompt', 12726, 9631, ['token', 'tokens'], 'down', (v) => Math.round(v).toLocaleString('en-US')],
      ['24 例回归失败数', 'Failures, 24-case regression', 53, 20, ['', ''], 'down', (v) => Math.round(v)],
      ['反思调用失败率', 'Reflection-call failure rate', 34.7, 0, ['%', '%'], 'down', (v) => v.toFixed(1).replace(/\.0$/, '')],
      ['任务通过数', 'Tasks passed', 5, 7, ['', ''], 'up', (v) => Math.round(v)],
      ['可缓存的稳定前缀', 'Cacheable stable prefix', 888, 2777, ['字符', 'chars'], 'up', (v) => Math.round(v).toLocaleString('en-US')]
    ];
    const list = anatomy.querySelector('.ax-res');
    list.innerHTML = RES.map(([zh, en, a, b, u, dir, f]) => {
      const max = Math.max(a, b);
      return `<li class="${dir}"><p>${both(zh, en)}</p><div class="ax-pair"><span class="ax-b ax-before" style="--w:${(a / max) * 100}%"></span><span class="ax-b ax-after" style="--w:${Math.max(1.5, (b / max) * 100)}%"></span></div><p class="mono ax-num"><s>${f(a)}</s><span>→</span><strong data-to="${b}" data-from="${a}">${f(b)}</strong> ${both(u[0], u[1])}</p></li>`;
    }).join('');
    const fmts = RES.map((r) => r[6]);
    let played = false;
    onView(anatomy, (on) => {
      if (!on || played) return;
      played = true;
      anatomy.classList.add('is-in');
      if (reduced()) return;
      list.querySelectorAll('strong[data-to]').forEach((el, i) => {
        const a = +el.dataset.from, b = +el.dataset.to, t0 = performance.now() + 500 + i * 120;
        const step = (now) => {
          const p = Math.min(1, Math.max(0, (now - t0) / 1100)), e = 1 - Math.pow(1 - p, 3);
          el.textContent = fmts[i](a + (b - a) * e);
          if (p < 1) requestAnimationFrame(step);
        };
        el.textContent = fmts[i](a);
        requestAnimationFrame(step);
      });
    }, 0.25);
  }

  /* ---------------- agent workbench ---------------- */
  const wb = document.getElementById('workbench');
  if (!wb) return;
  // [cmd, zh, en, guard zh, guard en, lines: [kind, zh, en]]  kind: run|ok|warn|stop|note
  const SK = [
    ['/ship-to-prod', '发版到生产', 'Ship to production', '先推镜像再同步，digest 逐个核对，AI 署名不进提交', 'Push before sync, check every digest, no AI attribution in commits', [
      ['note', '对比待上线清单：3 个镜像领先生产', 'Release diff: 3 images ahead of production'],
      ['ok', '镜像已推送到生产仓库', 'Images pushed to the production registry'],
      ['ok', 'digest 逐个核对一致 3/3', 'Digests verified one by one, 3/3'],
      ['stop', '护栏：提交信息含 AI 署名，已拦截并改写', 'Guard: a commit message carried AI attribution; blocked and rewritten'],
      ['ok', 'GitOps 同步完成，滚动更新 3/3', 'GitOps sync done, rolling update 3/3'],
      ['ok', '冒烟 12/12 通过，发布记录已写入', 'Smoke tests 12/12, release log written']]],
    ['/rollback', '一行回滚', 'One-line rollback', '只改一行 tag；回滚后必须冒烟', 'Change one tag line; smoke-test after every rollback', [
      ['note', '定位上一个健康版本 v2.41.3', 'Found the last healthy tag v2.41.3'],
      ['ok', '部署清单改写 1 行', 'Deployment manifest: 1 line changed'],
      ['ok', 'GitOps 自动同步，旧版本就绪 2/2', 'GitOps synced, previous version ready 2/2'],
      ['ok', '冒烟 8/8 通过', 'Smoke tests 8/8'],
      ['note', '回滚原因与时间线已附在工单', 'Reason and timeline attached to the ticket']]],
    ['/env-check', '环境体检', 'Environment check', '全程只读：不重启、不删除、不写库', 'Read-only: no restarts, no deletes, no writes', [
      ['note', '只读模式启动，覆盖 3 套环境', 'Read-only mode, 3 environments'],
      ['ok', '模型服务 16/16 健康（实时探活，不读状态位）', 'Model services 16/16 healthy (live probes, not status flags)'],
      ['ok', '生产集群 Pod 41/41 Running', 'Production pods 41/41 Running'],
      ['warn', '预发：1 个 Worker 重启 3 次，日志已附上', 'Staging: one worker restarted 3 times, logs attached'],
      ['ok', '体检报告已生成', 'Report generated']]],
    ['/diagnose-403', '权限排障', 'Permission triage', '先查角色关联是否被误删；修复先预览，用真实角色复验', 'Check for deleted role links first; preview fixes; re-test with real roles', [
      ['note', '决策树第 1 步：角色菜单关联是否被软删？', 'Decision tree, step 1: were role-menu links soft-deleted?'],
      ['ok', '命中：保存角色时误删 2 条关联', 'Hit: saving the role dropped 2 links'],
      ['note', '修复 SQL 已生成，先预览、等确认', 'Fix SQL generated, previewed, awaiting approval'],
      ['ok', '确认后执行，回读通过', 'Applied after approval, read-back passed'],
      ['ok', '用真实角色复验通过，没用管理员', 'Re-tested with a real role, not admin']]],
    ['/queue-triage', '队列堵塞', 'Queue triage', '先找优先级倒挂；插队 / 清积压 / 扩容三板斧', 'Look for priority inversion first; then reprioritize, drain, scale', [
      ['warn', '排队 40,282 · 运行 1', 'Queued 40,282 · running 1'],
      ['ok', '根因：自动缩略图优先级 30–60，压过用户任务 0', 'Root cause: auto-thumbnail priority 30–60 above user jobs at 0'],
      ['ok', '用户任务已插队，积压分批清理', 'User jobs moved ahead, backlog drained in batches'],
      ['ok', 'Worker 扩到 16 副本，队列回落', 'Workers scaled to 16, queue falling']]],
    ['/migrate', '平台迁移', 'Platform migration', '6 类“看起来好了其实没好”的静默故障判据，逐条回读', 'Six silent-failure checks for "looks done but isn\'t", every record read back', [
      ['note', '只读抽取 → 媒体上传 → 数据版本 → 项目 / 批次 / 任务包', 'Read-only extract → media → dataset version → projects / batches / packages'],
      ['ok', '1,284 个文件入库，回读 1,284/1,284', '1,284 files ingested, read back 1,284/1,284'],
      ['stop', '门禁：批次命名与源平台不一致，停下等确认', 'Gate: batch names differ from the source; paused for approval'],
      ['ok', '按源平台命名重组，6 类判据全部通过', 'Renamed to match the source; all six checks pass']]],
    ['/codex-task', '派单与验收', 'Delegate & accept', '任务包可验证、可断点续跑；不信自报，复算验收', 'Verifiable, resumable task packages; recompute instead of trusting self-reports', [
      ['note', '规格：目标 · 边界 · 可证伪的验收条件', 'Spec: goal · boundaries · falsifiable acceptance criteria'],
      ['ok', '任务包与启动语已生成，Codex 开工', 'Task package and kickoff written, Codex started'],
      ['ok', 'Codex 交付：12 个文件、34 个用例', 'Codex delivered: 12 files, 34 tests'],
      ['stop', '验收：自报“全绿”，复算发现 1 个用例被跳过', 'Acceptance: "all green" self-report; recompute found 1 skipped test'],
      ['ok', '打回补齐，复验通过', 'Sent back, fixed, re-verified']]],
    ['/read', '阅读入库', 'Read & file', '核验写在总结里，疑点不抹平', 'Verification goes into the summary; doubts stay visible', [
      ['ok', '正文 + 3 张配图 OCR', 'Article text + OCR on 3 images'],
      ['ok', '四段总结：主旨 · 要点 · 配图信息 · 核验与疑点', 'Four-part summary: thesis · points · image notes · checks & doubts'],
      ['ok', '已入 Obsidian 阅读库，标签「Agent 开发」', 'Filed to the Obsidian library, tagged "Agent dev"']]],
    ['/work-log', '工作日志', 'Work log', '一句话触发，不追问', 'One word triggers it, no follow-up questions', [
      ['ok', '汇总今天的提交、会话与交付', 'Collected today\'s commits, sessions and deliveries'],
      ['ok', '已写入 Notion 工作日志（日历视图）', 'Written to the Notion work log (calendar view)']]]
  ];
  const listEl = wb.querySelector('.wb-skills');
  const term = wb.querySelector('.wb-term-body');
  const termTitle = wb.querySelector('.wb-term-title');
  const guardEl = wb.querySelector('.wb-guard');
  listEl.innerHTML = SK.map(([cmd, zh, en], i) => `<li><button type="button" data-i="${i}"><span class="mono">${esc(cmd)}</span><strong>${both(zh, en)}</strong></button></li>`).join('');
  const MARK = { ok: '✓', warn: '!', stop: '⛔', note: '→', run: '·' };
  let cur = -1, timers = [], auto = true, visible = false;
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  function play(i, fromUser) {
    clear();
    cur = i;
    if (fromUser) auto = false;
    const [cmd, zh, en, gz, ge, lines] = SK[i];
    listEl.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    termTitle.textContent = cmd;
    guardEl.innerHTML = `<span class="mono">${both('护栏', 'GUARDRAIL')}</span>${both(gz, ge)}`;
    term.innerHTML = `<p class="wb-cmd"><b>$</b> ${esc(cmd)}</p>` + lines.map(([k, lz, le]) => `<p class="wb-line ${k}"><b>${MARK[k]}</b>${both(lz, le)}</p>`).join('') + '<p class="wb-line wb-caret"><b>$</b><i></i></p>';
    const ps = [...term.querySelectorAll('.wb-line')];
    if (reduced()) { ps.forEach((p) => p.classList.add('is-in')); return; }
    ps.forEach((p, j) => timers.push(setTimeout(() => p.classList.add('is-in'), 380 + j * 520)));
    if (auto) timers.push(setTimeout(() => { if (auto && visible) play((cur + 1) % SK.length); }, 380 + ps.length * 520 + 2600));
  }
  listEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) play(+b.dataset.i, true); });
  onView(wb, (on) => {
    visible = on;
    if (on && cur < 0) play(0);
    else if (on && auto && !timers.length) play(cur);
    else if (!on) clear();
  }, 0.3);
})();
