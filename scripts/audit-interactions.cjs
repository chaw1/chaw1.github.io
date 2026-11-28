'use strict';

const {inspectLayout, auditAxe}=require('./audit-page.cjs');

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
    await attempt('controlCoverage',async()=>page.locator('button:not([data-set-lang]),input,select,textarea').count().then(n=>n===0));
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
      await page.locator('#read-en').check();
      bilingual=chinese!==await heading.innerText() && (await heading.innerText()).includes('Under load');
    }
    return bilingual && await page.locator('h1').isVisible() && core.every(word=>readable.includes(word)) && !network.external.length;
  } finally {await context.close();}
}

module.exports={exercise,withoutJS};
