'use strict';

const fs = require('node:fs');
const http = require('node:http');
const {createHash} = require('node:crypto');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium} = require('playwright');
const {inspectDocument, inspectLayout, inspectContrast, inspectKeyboard, auditAxe, auditSiteSEO, checkLinks} = require('./audit-page.cjs');
const {exercise, withoutJS} = require('./audit-interactions.cjs');

const selected = process.env.AUDIT_CASE ? new RegExp(process.env.AUDIT_CASE) : null;
const root = path.resolve(__dirname, '..');
if (!process.argv[2]) throw new Error('Usage: node scripts/audit.cjs <external-output-directory>');
const requestedOutput = path.resolve(process.argv[2]);
let ancestor = requestedOutput;
while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
const realOutput = path.resolve(fs.realpathSync(ancestor),path.relative(ancestor,requestedOutput));
if (!path.relative(root,realOutput).startsWith('..' + path.sep)) {
  throw new Error('Choose a report directory outside the site checkout.');
}
// A filtered diagnostic must never overwrite a full acceptance run.
const output = selected ? path.join(realOutput,'filtered',createHash('sha256')
  .update(selected.source).digest('hex').slice(0,12)) : realOutput;
fs.mkdirSync(output, {recursive: true});
const reports = path.join(output, 'reports');
const screenshots = path.join(output, 'screenshots');
for (const dir of [reports, screenshots]) fs.mkdirSync(dir, {recursive: true});
const pages = [{name: 'home', route: '/'}, {name: 'benchmarks', route: '/datakeel-benchmarks/'}];
const viewports = [[1440, 900], [768, 1024], [390, 844], [320, 568]];
const baselineRef = process.env.AUDIT_BASE_REF || '51bab48';
const budgets = {cls: 0.1, maxResource: 800 * 1024, totalBytes: 2500 * 1024, requests: 65,
  addedBytes: 160 * 1024, addedRequests: 6, paintMs: 2500};
const mime = {html:'text/html; charset=utf-8', css:'text/css', js:'text/javascript', svg:'image/svg+xml',
  png:'image/png', jpg:'image/jpeg', webp:'image/webp', json:'application/json', xml:'application/xml', txt:'text/plain', pdf:'application/pdf'};

async function serve(dir) {
  const server = http.createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const full = fs.realpathSync(path.join(dir, pathname, pathname.endsWith('/') ? 'index.html' : ''));
      if (!full.startsWith(dir + path.sep) || !fs.statSync(full).isFile()) throw new Error();
      res.writeHead(200, {'content-type': mime[path.extname(full).slice(1)] || 'application/octet-stream',
        'content-length': fs.statSync(full).size, 'cache-control': 'no-store'});
      fs.createReadStream(full).pipe(res);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  return {origin: 'http://127.0.0.1:' + server.address().port, close: () => { server.close(); server.closeAllConnections(); }};
}

async function newContext(browser, origin, options) {
  const context = await browser.newContext({...options, serviceWorkers:'block', bypassCSP:false,
    permissions:['clipboard-read', 'clipboard-write']});
  const network = {external:[], failed:[], responses:[], errors:[]};
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    network.external.push(url.href);
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*', socket => {
    network.external.push(socket.url());
    socket.close();
  });
  context.on('response', response => network.responses.push({status:response.status(), url:response.url().replace(origin,'')}));
  context.on('requestfailed', request => network.failed.push({url:request.url().replace(origin,''),error:request.failure()?.errorText}));
  context.on('page', page => {
    page.on('console', msg => { if (msg.type() === 'error') network.errors.push(msg.text().replaceAll(origin,'')); });
    page.on('pageerror', e => network.errors.push(e.message));
  });
  return {context, network};
}

// Accumulate CLS session windows as defined by Web Vitals. Input-initiated shifts are excluded.
function observePaint() {
  const m = window.auditPaint = {lcp: null, cls: 0, supported: PerformanceObserver.supportedEntryTypes};
  let start = -Infinity, last = -Infinity, score = 0;
  if (m.supported.includes('largest-contentful-paint')) new PerformanceObserver(list => {
    for (const e of list.getEntries()) m.lcp = e.startTime;
  }).observe({type:'largest-contentful-paint', buffered:true});
  if (m.supported.includes('layout-shift')) new PerformanceObserver(list => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      if (e.startTime - last >= 1000 || e.startTime - start >= 5000) { start = e.startTime; score = 0; }
      last = e.startTime; score += e.value; m.cls = Math.max(m.cls, score);
    }
  }).observe({type:'layout-shift', buffered:true});
}

async function capturePerf(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const timing = [nav, ...performance.getEntriesByType('resource')].filter(e => /^https?:/.test(e.name));
    const assets = timing.map(e => ({path:new URL(e.name).pathname, bytes:e.transferSize})).sort((a,b) => b.bytes-a.bytes);
    const round = n => typeof n === 'number' ? Math.round(n*100)/100 : null;
    return {dcl:round(nav.domContentLoadedEventEnd), load:round(nav.loadEventEnd),
      fcp:round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime),
      lcp:round(window.auditPaint.lcp), cls:window.auditPaint.cls,
      clsSupported:window.auditPaint.supported.includes('layout-shift'), requests:assets.length,
      bytes:assets.reduce((n,a) => n+a.bytes,0), largest:assets[0], assets};
  });
}

async function snapshot(page, key) {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Trigger lazy media and intersection observers throughout the document.
    for (let y=0; y<document.documentElement.scrollHeight; y+=Math.max(320,innerHeight-160)) {
      scrollTo({top:y,behavior:'instant'});
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    scrollTo({top:0,behavior:'instant'});
    await Promise.all([...document.images].filter(i => i.getClientRects().length).map(i => i.decode().catch(() => {})));
  });
  await page.waitForLoadState('networkidle');
  await page.screenshot({path:path.join(screenshots,key+'-viewport.png'), animations:'disabled', scale:'device'});
  await page.screenshot({path:path.join(screenshots,key+'-full.png'), fullPage:true, animations:'disabled', scale:'css'});
}

function replaceReport(file, content) {
  const tmp = file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,content);
  fs.renameSync(tmp,file);
}
function save(name, data) {
  replaceReport(path.join(reports,name+'.json'), JSON.stringify(data,null,2)+'\n');
}

function writeResults(runs, info, finished) {
  const expected = viewports.flatMap(([width,height])=>['zh','en'].flatMap(lang=>
    pages.map(page=>[page.name,lang,width+'x'+height].join('-'))));
  const sections = ['seo','performance','accessibility','integrity','interaction'];
  const completeCases = runs.filter(row=>sections.every(name=>row[name])).map(row=>row.key);
  const missing = expected.filter(key=>!completeCases.includes(key));
  const complete = finished && !selected && !missing.length && runs.some(row=>row.key==='site' && row.seo);
  const issues = {};
  for (const name of sections) {
    const rows = runs.filter(r => r[name]).map(r => ({case:r.key,...r[name]}));
    save(name,{completed:complete, ...info, budgets: name==='performance'?budgets:undefined, rows});
    const failed = rows.flatMap(row => (row.failures || []).map(f => [row.case,f]));
    issues[name] = failed.length;
    const md = ['# '+name, '', 'Revision `'+info.siteRevision+'` ('+(info.siteDirty?'dirty':'clean')+').',
      '', 'Completed: '+complete+'. Failed assertions: '+failed.length+'.', ''];
    if (name==='performance') {
      md.push('Cold local HTTP, no compression, normal motion. Navigation + Resource Timing transferSize includes headers. CLS uses the largest session window, observed through load and network idle. Home is compared with the baseline checkout on the same browser, language and viewport.', '',
        '| Case | DCL ms | Load ms | FCP ms | LCP ms | CLS | Requests | Bytes | Largest bytes | Baseline bytes |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
      for(const r of rows) if (r.metrics) { const m=r.metrics; md.push('| '+[r.case,m.dcl,m.load,m.fcp,m.lcp,m.cls.toFixed(4),m.requests,m.bytes,m.largest.bytes,r.baseline?.bytes??'—'].join(' | ')+' |'); }
    } else {
      md.push('| Case | Result | Checks or findings |','|---|---|---|');
      for(const r of rows) {
        const notes = r.summary || Object.keys(r.checks || {}).join(', ');
        md.push('| '+r.case+' | '+(r.failures?.length?'FAIL':'PASS')+' | '+notes.replaceAll('|',' / ')+' |');
      }
    }
    if (failed.length) md.push('', ...failed.map(([k,f]) => '- '+k+' — '+f));
    replaceReport(path.join(reports,name+'.md'),md.join('\n')+'\n');
  }
  const index = {completed:complete, finished, ...info, issues, missing, cases:runs.map(r=>r.key)};
  save('index',index);
  const requested = expected.filter(key=>!selected || selected.test(key));
  return finished && requested.length>0 && requested.every(key=>completeCases.includes(key)) && Object.values(issues).every(n=>n===0);
}

function evaluatePerf(metrics, baseline, external) {
  const checks = {timings:[metrics.dcl,metrics.load,metrics.fcp,metrics.lcp].every(n=>n>0),
    cls:metrics.clsSupported && metrics.cls<=budgets.cls, largest:metrics.largest.bytes<=budgets.maxResource,
    totalBytes:metrics.bytes<=budgets.totalBytes, requests:metrics.requests<=budgets.requests, external:external.length===0,
    paint:metrics.fcp<=budgets.paintMs && metrics.lcp<=budgets.paintMs};
  if (baseline) {
    checks.homeBytes=metrics.bytes<=baseline.bytes+budgets.addedBytes;
    checks.homeRequests=metrics.requests<=baseline.requests+budgets.addedRequests;
  }
  return {checks,failures:Object.keys(checks).filter(k=>!checks[k]),metrics,baseline,external:[...external]};
}

async function run() {
  const started = new Date().toISOString();
  const siteRevision = execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const siteDirty = Boolean(execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}).trim());
  const source = {started, siteRevision, siteDirty, caseFilter:process.env.AUDIT_CASE || null};
  save('index',{completed:false,finished:false,...source,issues:{},cases:[]});
  const ref = execFileSync('git',['-C',root,'rev-parse','--verify',baselineRef+'^{commit}'],{encoding:'utf8'}).trim();
  const baselineDir = fs.mkdtempSync(path.join(output,'.audit-baseline-'));
  const running = [];
  let browser;
  try {
    execFileSync('tar',['-x','-C',baselineDir],{input:execFileSync('git',['-C',root,'archive',ref],{maxBuffer:64*1024*1024})});
    const baselineSite = await serve(baselineDir); running.push(baselineSite);
    const site = await serve(root); running.push(site);
    const launch = process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} :
      (process.env.AUDIT_BROWSER === 'chromium' ? {} : {channel:'chrome'});
    browser = await chromium.launch({...launch,args:['--enable-unsafe-swiftshader',
      '--disable-background-networking','--disable-component-update','--no-pings']});
    const info = {...source, baseline:ref, browser:browser.version(), playwright:require('playwright/package.json').version,
      axe:require('axe-core/package.json').version};
    const runs=[];
    writeResults(runs,info,false);
    const siteRow={key:'site'};
    runs.push(siteRow);
    const jsFiles=['assets','scripts'].flatMap(dir=>fs.readdirSync(path.join(root,dir))
      .filter(file=>/\.(?:mjs|cjs|js)$/.test(file)).map(file=>path.join(dir,file)));
    const staticFailures=[];
    for(const file of jsFiles) {
      try {execFileSync(process.execPath,['--check',file],{cwd:root,stdio:'pipe'});}
      catch {staticFailures.push('syntax '+file);}
    }
    try {execFileSync('git',['diff','--check',ref],{cwd:root,stdio:'pipe'});}
    catch {staticFailures.push('diff whitespace');}
    siteRow.interaction={checks:{nodeSyntax:!staticFailures.some(f=>f.startsWith('syntax ')),
      diffWhitespace:!staticFailures.includes('diff whitespace')},files:jsFiles,failures:staticFailures};
    const temp=await newContext(browser,site.origin,{});
    try {
      const page=await temp.context.newPage();
      siteRow.seo=await auditSiteSEO(page,site.origin,pages);
    } finally {await temp.context.close();}
    for (const [width,height] of viewports) for (const lang of ['zh','en']) for (const target of pages) {
      const key=[target.name,lang,width+'x'+height].join('-');
      if (selected && !selected.test(key)) continue;
      const row={key}; runs.push(row);
      const opts={viewport:{width,height},deviceScaleFactor:2,locale:lang==='zh'?'zh-CN':'en-US',reducedMotion:'no-preference'};
      const initLang=async context=>{
        await context.addInitScript(({lang})=>{if(location.protocol==='http:' && !localStorage.getItem('jiawis-lang')) localStorage.setItem('jiawis-lang',lang);},{lang});
        await context.addInitScript(observePaint);
      };
      let baseline;
      if (target.name === 'home') {
        const base=await newContext(browser,baselineSite.origin,opts);
        try {
          await initLang(base.context); const p=await base.context.newPage(); await p.goto(baselineSite.origin+'/');
          baseline=await capturePerf(p);
        } finally {await base.context.close();}
      }
      const {context,network}=await newContext(browser,site.origin,opts);
      try {
        await initLang(context);
        const page=await context.newPage(); page.setDefaultTimeout(8000); page.setDefaultNavigationTimeout(25000);
        await page.goto(site.origin+target.route);
        row.performance=evaluatePerf(await capturePerf(page),baseline,network.external);
        await snapshot(page,key);
        const afterScroll=await capturePerf(page);
        row.performance.afterScroll={bytes:afterScroll.bytes,requests:afterScroll.requests,largest:afterScroll.largest,assets:afterScroll.assets};
        if(afterScroll.largest.bytes>budgets.maxResource || afterScroll.bytes>budgets.totalBytes) row.performance.failures.push('full-page asset budget');
        const doc=await page.evaluate(inspectDocument);
        row.seo={checks:doc.seo,failures:Object.keys(doc.seo).filter(k=>!doc.seo[k]),metadata:doc.metadata};
        const layout=await page.evaluate(inspectLayout);
        const links=await checkLinks(page,site.origin,doc.links);
        const keyboard=await inspectKeyboard(page);
        const axe=await auditAxe(page);
        const contrast=await page.evaluate(inspectContrast);
        row.accessibility={keyboard,axe,contrast,checks:doc.a11y,
          failures:[...Object.keys(doc.a11y).filter(k=>!doc.a11y[k]),...keyboard.failures,...axe.failures,...contrast.filter(c=>!c.pass).map(c=>c.selector+' contrast '+c.ratio)],
          summary:axe.critical+' critical, '+axe.serious+' serious; '+keyboard.stops.length+' keyboard stops; '+axe.incomplete.length+' rules with incomplete nodes'};
        row.interaction=await exercise(page,site.origin,target,lang);
        if(width===1440 && lang==='zh') {
          const noJS=await withoutJS(browser,newContext,site.origin,target);
          row.interaction.checks.noJS=noJS;
          if (!noJS) row.interaction.failures.push('noJS');
        }
        row.integrity={layout,links,network,failures:[...layout.failures,...links.failures]};
      } catch (error) {
        row.integrity ||= {failures:[]};
        row.integrity.failures.push(error.message);
      } finally {await context.close();}
      row.integrity.network=network;
      const badResponses=network.responses.filter(r=>r.status!==200);
      for(const [name,items] of Object.entries({external:network.external, failedRequests:network.failed.filter(f=>f.error!=='net::ERR_ABORTED'),badResponses,errors:network.errors}))
        if (items.length) row.integrity.failures.push(name+' '+JSON.stringify(items));
      // A cancelled navigation can occur on reload; all discovered internal targets are separately requested and checked.
      row.integrity.summary=(row.integrity.layout?.clientWidth??'—')+'px; '+network.external.length+' external; '+network.errors.length+' browser errors';
      writeResults(runs,info,false);
      console.log(key, Object.entries(row).filter(([,v])=>v?.failures?.length).map(([k,v])=>k+': '+v.failures.slice(0,2).join(', ')).join(' | ') || 'PASS');
    }
    if (!writeResults(runs,info,true)) process.exitCode=1;
  } finally {
    running.forEach(s=>s.close());
    fs.rmSync(baselineDir,{recursive:true,force:true});
    if(browser) await browser.close();
  }
}

run().catch(error=>{console.error(error);process.exitCode=1;});
