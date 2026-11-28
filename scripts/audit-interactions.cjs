'use strict';

const assert = require('node:assert/strict');
const {inspectLayout, auditAxe}=require('./audit-page.cjs');

async function checkDocumentDestinations(page, lang) {
  const docs = 'https://datakeel.jiawis.com';
  const expected = docs + (lang === 'zh' ? '/zh/' : '/');
  for (const section of ['#planner', 'footer']) {
    const links = page.locator(section + ' a[href^="' + docs + '/"]:visible');
    assert.deepEqual(await links.evaluateAll(nodes => nodes.map(link => link.href)), [expected], section);
  }
  for (const [section, path] of [['#capacity', '/docs/capacity/'], ['#hashing', '/docs/rust-accel/']]) {
    assert(await page.locator(section + ' a[href="' + docs + path + '"]').isVisible(), path);
  }
  return true;
}

async function openDisclosures(page) {
  for (const details of await page.locator('details').all()) {
    if (await details.getAttribute('open') === null) {
      await details.locator(':scope > summary').click();
    }
  }
}

async function checkChartData(page, mode) {
  for (const [db, label] of [['sqlite', 'SQLite'], ['postgres', 'PostgreSQL']]) {
    const shown = mode === 'all' || mode === db;
    const charts = page.locator('#contention figure[data-chart-db="' + db + '"]');
    const table = page.locator('#contention table[data-chart-db="' + db + '"]');
    assert.equal(await charts.count(), 2, db + ' save and claim charts');
    for (const chart of await charts.all()) {
      assert((await chart.locator('figcaption').textContent()).includes(label), db);
      assert.equal(await chart.isVisible(), shown, db + ' chart visibility');
    }
    assert.equal(await table.count(), 1, db + ' minute table');
    assert((await table.locator('caption').textContent()).includes(label), db);
    assert.equal(await table.locator('tbody tr:visible').count(), shown ? 10 : 0, db + ' visible minute rows');
  }
}

async function checkCopyCommands(page, lang, mode) {
  const buttons = page.locator('button[data-copy-command]');
  const blocks = page.locator('pre > code');
  const count = await blocks.count();
  assert(count >= 4, 'All four benchmark families need reproduction commands');
  assert.equal(await buttons.count(), count);
  const name = lang === 'zh' ? '复制命令' : 'Copy';
  assert.equal(await page.getByRole('button', {name, exact: true}).count(), count);
  const seen = new Set();
  await page.evaluate(() => navigator.clipboard.writeText('clipboard audit'));
  await page.evaluate(mode => {
    if (mode !== 'clipboard') {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: async () => { throw new DOMException('Access denied', 'NotAllowedError'); }
      });
    }
    if (mode !== 'fallback') {
      Object.defineProperty(document, 'execCommand', {configurable: true, value: () => false});
    }
  }, mode);
  try {
    for (const button of await buttons.all()) {
      const id = await button.getAttribute('aria-controls');
      assert(id && !seen.has(id), 'Each button must target a different command block');
      seen.add(id);
      const code = page.locator('pre[id="' + id + '"] > code');
      assert(await code.isVisible(), id);
      const command = await code.textContent();
      assert(command.trim(), id);
      const status = button.locator('..').locator('[aria-live="polite"]');
      await button.press('Enter');
      const feedback = mode === 'manual'
        ? (lang === 'zh' ? '手动复制' : 'manually')
        : (lang === 'zh' ? '已复制' : 'Copied');
      await status.filter({hasText: feedback}).waitFor({state: 'visible'});
      assert((await status.innerText()).includes(feedback), id + ' localized status');
      if (mode === 'manual') {
        assert.equal(await page.evaluate(() => getSelection().toString()), command, id);
      } else {
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), command, id);
      }
    }
  } finally {
    await page.evaluate(() => {
      delete navigator.clipboard.writeText;
      delete document.execCommand;
    });
  }
  return [...seen];
}

async function exercise(page,origin,target,lang) {
  const checks={}, evidence={};
  const attempt=async (name,fn)=>{
    try {const value=await fn();checks[name]=value===true; if(typeof value!=='boolean') evidence[name]=value;}
    catch(e) {checks[name]=false;evidence[name]=e.message.split('\n').slice(0,4).join(' ');}
  };
  await page.reload();
  const other=lang==='zh'?'en':'zh';
  const documentLanguage=async l=>page.evaluate(l=>{
    const active=document.querySelector('h1 .'+l);
    const inactive=document.querySelector('h1 .'+(l==='zh'?'en':'zh'));
    return document.documentElement.dataset.lang===l && document.documentElement.lang.startsWith(l) &&
      localStorage.getItem('jiawis-lang')===l && active?.checkVisibility() && !!active.innerText.trim() &&
      inactive && !inactive.checkVisibility() &&
      document.querySelector('[data-set-lang="'+l+'"]')?.getAttribute('aria-pressed')==='true';
  },l);
  await attempt('languageToggleAndPersistence',async()=>{
    await page.locator('[data-set-lang="'+other+'"]').click();
    if(!await documentLanguage(other)) return false;
    await page.reload();
    if(!await documentLanguage(other)) return false;
    await page.locator('[data-set-lang="'+lang+'"]').click();
    await page.reload();
    return documentLanguage(lang);
  });
  await attempt('keyboardSkip',async()=>{
    await page.keyboard.press('Tab');
    const first=await page.locator(':focus').getAttribute('href');
    if(!first?.startsWith('#') || !await page.locator('main'+first).count()) return false;
    await page.keyboard.press('Enter');
    return new URL(page.url()).hash===first;
  });
  await attempt('reducedMotion',async()=>{
    return page.evaluate(()=>{
      const animations=document.getAnimations().filter(a=>a.playState==='running' &&
        a.effect?.getComputedTiming().iterations===Infinity && (a.effect?.getComputedTiming().duration||0)>1);
      return matchMedia('(prefers-reduced-motion: reduce)').matches &&
        getComputedStyle(document.documentElement).scrollBehavior!=='smooth' && !animations.length &&
        (!document.querySelector('#scan-toggle') || !document.querySelector('#scan-toggle').getClientRects().length);
    });
  });

  if(target.name==='home') {
    await attempt('githubSnapshotAndProjectEntry', async () => {
      const stars = /380\+\s*★/;
      const source = 'a[href="https://github.com/chaw1/datakeel"]:visible';
      for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
        assert.match(await page.locator(selector).getAttribute('content'), stars, selector);
      }
      for (const selector of ['.hero-copy .eyebrow', '.hero-lede', '.hero-ticker > div:nth-child(4) dd']) {
        assert.match(await page.locator(selector).innerText(), stars, selector);
      }
      const heading = page.locator('#projects .dk-head h3');
      assert.match(await heading.innerText(), /^Datakeel\s+v0\.28\.0/i);
      const badge = heading.locator(source);
      assert.equal(await badge.innerText(), '★ 380');
      for (const attribute of ['aria-label', 'title']) {
        const label = await badge.getAttribute(attribute);
        assert.match(label, /★ 380/);
        assert.match(label, /2026-11-28/);
        assert.match(label, /仓库星标/);
        assert.match(label, /repository stars/i);
      }
      const note = page.locator('.ticker-note');
      assert.match(await note.innerText(), /2026[-.]11[-.]28|Nov(?:ember)?\.? 28,? 2026/i);
      const snapshotText = lang === 'zh' ? '380 个 GitHub 星标' : '380 GitHub stars';
      assert.equal((await note.locator(source).innerText()).trim(), snapshotText);
      for (const section of ['.hero-actions', '#projects .dk-links']) {
        assert(await page.locator(section + ' a[href="/datakeel-benchmarks/"]').isVisible(), section);
      }
      evidence.projectMetrics = await page.locator('#projects .dk-metrics > li:visible').count();
      return [5, 6].includes(evidence.projectMetrics);
    });
    const menu=page.locator('#menu-toggle');
    if(await menu.isVisible()) await attempt('mobileMenuEscape',async()=>{
      await menu.click();
      if(await menu.getAttribute('aria-expanded')!=='true' || !await page.locator('#site-nav a:focus').count()) return false;
      await page.keyboard.press('Escape');
      return await menu.getAttribute('aria-expanded')==='false' && await page.locator('#menu-toggle:focus').count()===1;
    });
    await attempt('navigationHighlights',async()=>{
      if(await menu.isVisible()) await menu.click();
      await page.locator('#site-nav a[href="#agent"]').click();
      await page.waitForFunction(()=>document.querySelector('#site-nav a[href="#agent"]')?.getAttribute('aria-current')==='true');
      return new URL(page.url()).hash==='#agent';
    });
    await attempt('webGLPointCloud',async()=>{
      await page.emulateMedia({reducedMotion:'no-preference'});
      await page.reload();
      await page.locator('#scan').scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>/\d/.test(document.querySelector('#scan-points')?.textContent??''));
      const button=page.locator('#scan-toggle');
      const initial=await button.getAttribute('aria-pressed');
      await button.click();
      const changed=await button.getAttribute('aria-pressed');
      await button.click();
      await page.emulateMedia({reducedMotion:'reduce'});
      return changed!==initial && !await page.locator('#scan.no-webgl').count();
    });
    await attempt('agentDemo',async()=>{
      await page.locator('#harness-film').scrollIntoViewIfNeeded();
      await page.locator('#harness-film.is-ready').waitFor();
      const controls=page.locator('.hf-chapters button');
      await controls.nth(1).click();
      const progress=await page.locator('.hf-range').inputValue();
      const list=page.locator('.wb button[data-i]');
      await list.nth(1).click();
      return Number(progress)>0 && await list.nth(1).getAttribute('aria-pressed')==='true';
    });
    await attempt('caseTabs',async()=>{
      await page.locator('#tab-upload').click();
      return await page.locator('#tab-upload').getAttribute('aria-selected')==='true' && await page.locator('#case-upload').isVisible();
    });
    await attempt('heatmapKeyboard',async()=>{
      await page.mouse.move(0,0);
      const cell=page.locator('#heatmap .heat-cell[tabindex="0"]');
      await cell.focus();
      await page.keyboard.press('Home');
      const before=await cell.getAttribute('data-date');
      await page.keyboard.press('ArrowDown');
      const after=await cell.getAttribute('data-date');
      const readout=await page.locator('#heat-readout').innerText();
      evidence.heatmap={before,after,readout};
      return before!==after && readout.includes(after);
    });
    await attempt('resumeDownloads',async()=>{
      const assets=page.locator('[data-resume][download]');
      if(await assets.count()!==2) return false;
      for(const link of await assets.all()) {
        const download=page.waitForEvent('download');
        await link.click();
        const file=await download;
        if (!file.suggestedFilename().endsWith('.pdf') || await file.failure()) return false;
      }
      return true;
    });
    await attempt('copyEmail',async()=>{
      const b=page.locator('#copy-email');
      await b.click();
      await page.waitForFunction(()=>/已复制|copied/i.test(document.querySelector('#copy-status').textContent));
      return await page.evaluate(()=>navigator.clipboard.readText())===await b.getAttribute('data-email');
    });
    await attempt('projectLinkSharesLanguage',async()=>{
      await page.locator('#projects a[href="/datakeel-benchmarks/"]').first().click();
      await page.waitForURL(origin+'/datakeel-benchmarks/');
      await page.waitForLoadState('load');
      return documentLanguage(lang);
    });
  } else {
    await attempt('completeFeatureGrid', async () => {
      const grids = await page.locator('#features .feature-grid').evaluateAll(nodes => nodes.map(grid => {
        const rows = new Map();
        for (const card of grid.querySelectorAll(':scope > article')) {
          const top = Math.round(card.getBoundingClientRect().top);
          rows.set(top, (rows.get(top) || 0) + 1);
        }
        return [...rows.values()];
      }));
      evidence.featureRows = grids;
      const columns = grids[0]?.[0];
      assert.equal(grids.length, 2, 'Wave 1 and Wave 2');
      if (page.viewportSize().width === 1440) assert.equal(columns, 3, 'desktop columns');
      return grids.every(rows => rows.reduce((a, b) => a + b, 0) === 6 && rows.every(n => n === columns));
    });
    await attempt('benchmarkLinks',async()=>{
      const same=await page.locator('main a[href^="#"],header a[href^="#"],footer a[href^="#"]').all();
      const tested=new Set();
      for(const link of same) {
        if(!await link.isVisible()) continue;
        const href=await link.getAttribute('href');
        if(tested.has(href)) continue;
        await link.click();
        if(new URL(page.url()).hash!==href) return false;
        tested.add(href);
      }
      evidence.anchors=[...tested];return tested.size>0;
    });
    await attempt('disclosures',async()=>{
      const parts=await page.locator('details').all();
      for(const details of parts) {
        const summary=details.locator(':scope > summary');
        await summary.focus();
        if(await details.evaluate(d=>d.open)) await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        if(!await details.evaluate(d=>d.open && [...d.children].some(e=>e.tagName!=='SUMMARY' && e.getClientRects().length))) return false;
        await page.keyboard.press('Space');
        if(await details.evaluate(d=>d.open)) return false;
        await page.keyboard.press('Enter');
      }
      evidence.disclosures=parts.length;
      const expanded=await page.evaluate(inspectLayout);
      evidence.expandedLayout=expanded;
      const axe=await auditAxe(page);
      evidence.expandedAxe=axe;
      for(const details of parts) {
        await details.locator(':scope > summary').focus();
        await page.keyboard.press('Enter');
      }
      return parts.length>0 && !expanded.failures.length && !axe.failures.length;
    });
    await openDisclosures(page);
    await attempt('languageDocumentDestinations', () => checkDocumentDestinations(page, lang));
    await attempt('minuteChartFilters', async () => {
      const filters = page.locator('#contention button[data-chart-filter]');
      assert.equal(await filters.count(), 3);
      const active = filters.and(page.locator('[aria-pressed="true"]'));
      assert.equal(await active.getAttribute('data-chart-filter'), 'all');
      await checkChartData(page, 'all');
      for (const mode of ['sqlite', 'postgres', 'all']) {
        const button = page.locator('#contention button[data-chart-filter="' + mode + '"]');
        await button.press('Space');
        assert.equal(await active.getAttribute('data-chart-filter'), mode);
        await checkChartData(page, mode);
      }
      return true;
    });
    for (const [mode, name] of [['clipboard', 'copyCommands'], ['fallback', 'copyCommandsFallback'], ['manual', 'copyCommandsManualSelection']]) {
      await attempt(name, async () => {
        evidence[name] = await checkCopyCommands(page, lang, mode);
        return true;
      });
    }
    await attempt('controlCoverage', async () => {
      const extra = page.locator('button:not([data-set-lang],[data-copy-command],[data-chart-filter]),input,select,textarea');
      return await extra.count() === 0;
    });
    await attempt('projectReturnSharesLanguage',async()=>{
      const link=page.locator('a[href="/#projects"],a[href="../#projects"]').first();
      await link.click();
      await page.waitForURL(origin+'/#projects');
      await page.waitForLoadState('load');
      return documentLanguage(lang);
    });
  }
  return {checks,evidence,failures:Object.keys(checks).filter(k=>!checks[k])};
}

async function withoutJS(browser,newContext,origin,target) {
  const {context,network}=await newContext(browser,origin,{javaScriptEnabled:false});
  try {
    const page=await context.newPage();
    await page.goto(origin+target.route);
    const readable=(await page.locator('main').innerText()).replace(/\s+/g,'');
    const core=target.name==='home' ? ['Datakeel'] : ['SQLite','PostgreSQL','Rust','20/20'];
    let bilingual=true;
    if(target.name!=='home') {
      const heading=page.locator('h1'); const chinese=await heading.innerText();
      await openDisclosures(page);
      assert.equal(await page.locator('[data-copy-command]:visible,[data-chart-controls]:visible').count(), 0);
      assert.equal(await page.locator('pre > code:visible').count(), await page.locator('pre > code').count());
      await checkChartData(page, 'all');
      await checkDocumentDestinations(page, 'zh');
      await page.locator('#read-en').check();
      await checkDocumentDestinations(page, 'en');
      await checkChartData(page, 'all');
      bilingual=chinese!==await heading.innerText() && (await heading.innerText()).includes('Under load');
    }
    return bilingual && await page.locator('h1').isVisible() && core.every(word=>readable.includes(word)) && !network.external.length;
  } finally {await context.close();}
}

module.exports={exercise,withoutJS};
