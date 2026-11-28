'use strict';

function inspectDocument() {
  const all = s => [...document.querySelectorAll(s)];
  const meta = key => document.querySelector('meta[name="'+key+'"],meta[property="'+key+'"]')?.content?.trim() || '';
  const canonical = document.querySelector('link[rel=canonical]')?.href;
  const expected = 'https://hire.jiawis.com'+location.pathname;
  const headings = all('h1,h2,h3,h4,h5,h6').map(el=>({level:Number(el.tagName.slice(1)), text:el.innerText.trim()}));
  let structured = false;
  try {
    const scripts=all('script[type="application/ld+json"]');
    structured=scripts.length>0 && scripts.every(script=>{
      const doc=JSON.parse(script.textContent);
      const entities=doc['@graph']||[doc];
      return /^https?:\/\/schema.org\/?$/.test(doc['@context']) && entities.length>0 && entities.every(e=>e['@type'] && (e.name || e.headline || e['@id']));
    });
  } catch { structured=false; }
  const seo={title:all('title').length===1 && document.title.trim().length>0, description:Boolean(meta('description')),
    canonical:all('link[rel=canonical]').length===1 && canonical===expected,
    openGraph:['og:title','og:description','og:image','og:type'].every(k=>meta(k)) && meta('og:url')===expected,
    twitter:['twitter:card','twitter:title','twitter:description','twitter:image'].every(k=>meta(k)),
    jsonLD:structured, oneH1:headings.filter(h=>h.level===1).length===1,
    hierarchy:headings[0]?.level===1 && headings.every((h,i)=>!i || h.level<=headings[i-1].level+1)};
  const links=new Set();
  function add(value, base=document.baseURI) {
    if (!value || value.startsWith('data:')) return;
    try {
      const u=new URL(value,base);
      if(u.origin===location.origin || u.origin==='https://hire.jiawis.com') links.add(u.pathname+u.search+u.hash);
    } catch { /* No request target. */ }
  }
  all('[href],[src],[poster],[srcset]').forEach(el=>{
    for(const attr of ['href','src','poster']) add(el.getAttribute(attr));
    if(el.srcset) el.srcset.split(',').forEach(entry=>add(entry.trim().split(/\s+/)[0]));
  });
  for(const k of ['og:image','twitter:image']) add(meta(k));
  for(const sheet of document.styleSheets) {
    function visit(rules) {
      for(const rule of rules) {
        if(rule.cssRules) visit(rule.cssRules);
        if(rule.style) for(const match of rule.style.cssText.matchAll(/url\((['"]?)([^)'"]+)\1\)/g)) add(match[2],sheet.href||location.href);
      }
    }
    if(!sheet.href || new URL(sheet.href).origin===location.origin) visit(sheet.cssRules);
  }
  const skip=document.querySelector('.skip-link');
  const target=skip && document.getElementById(new URL(skip.href).hash.slice(1));
  const a11y={lang:/^(zh|en)(-|$)/.test(document.documentElement.lang),
    header:!!document.querySelector('body > header'),nav:!!document.querySelector('nav'),main:all('main').length===1,
    footer:!!document.querySelector('body > footer'),skipLink:!!target?.matches('main'),
    imageAlt:all('img').every(i=>i.hasAttribute('alt')),uniqueIds:new Set(all('[id]').map(e=>e.id)).size===all('[id]').length};
  return {seo,a11y,metadata:{title:document.title,canonical,headings:headings.map(h=>h.level)},links:[...links].sort()};
}

function inspectLayout() {
  const viewport=document.documentElement.clientWidth;
  const overflow=document.documentElement.scrollWidth;
  const brokenImages=[...document.images].filter(i=>i.getClientRects().length && (!i.complete || !i.naturalWidth)).map(i=>i.getAttribute('src'));
  const badText=[];
  const overlap=[];
  const name=el=>el.id || el.className || el.tagName;
  const content='h1,h2,h3,h4,h5,h6,p,li,figcaption,blockquote,a,button,summary,th,td,pre,code,dt,dd,main strong';
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const boxes=new Map();
  let checkedTextNodes=0;
  function bounds(el) {
    if(!boxes.has(el)) {
      const css=getComputedStyle(el), rect=el.getBoundingClientRect();
      boxes.set(el,{rect,x:css.overflowX,y:css.overflowY,
        scrollX:el.scrollWidth>el.clientWidth,scrollY:el.scrollHeight>el.clientHeight});
    }
    return boxes.get(el);
  }
  // Stop outer clipping checks only for the part that can actually scroll into view.
  // An inner hidden ancestor still clips its content, even within a horizontally scrollable table.
  for(let node=walker.nextNode();node;node=walker.nextNode()) {
    const parent=node.parentElement, owner=parent.closest(content);
    if(!owner || !node.textContent.trim() || parent.closest('svg,canvas,script,style,noscript,[aria-hidden="true"]') ||
      !parent.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})) continue;
    if(parent.closest('.skip-link') && !parent.closest(':focus')) continue;
    const range=document.createRange();
    range.selectNodeContents(node);
    const rects=[...range.getClientRects()].filter(r=>r.width>1 && r.height>1);
    if(!rects.length) continue;
    checkedTextNodes++;
    let clippedBy=null;
    for(const rect of rects) {
      let left=rect.left,right=rect.right,top=rect.top,bottom=rect.bottom;
      for(let ancestor=parent;ancestor && ancestor!==document.documentElement;ancestor=ancestor.parentElement) {
        const box=bounds(ancestor), b=box.rect;
        if(right>left && /^(hidden|clip)$/.test(box.x) && (left<b.left-2 || right>b.right+2)) clippedBy=ancestor;
        if(bottom>top && /^(hidden|clip)$/.test(box.y) && (top<b.top-3 || bottom>b.bottom+3)) clippedBy=ancestor;
        if(clippedBy) break;
        if(box.scrollX && /^(auto|scroll)$/.test(box.x)) {left=Math.max(left,b.left);right=Math.min(right,b.right);}
        if(box.scrollY && /^(auto|scroll)$/.test(box.y)) {top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}
      }
      if(!clippedBy && right>left && (left < -2 || right > viewport+2)) clippedBy=document.documentElement;
      if(clippedBy) break;
    }
    if(clippedBy) badText.push({element:String(name(owner)),clippedBy:String(name(clippedBy)),text:node.textContent.trim().slice(0,64)});
  }
  // Examine adjacent controls sharing a parent; nested labels and their own icons are one control.
  for(const el of document.querySelectorAll('header a,header button, nav a, button, summary')) {
    if(!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})) continue;
    const a=el.getBoundingClientRect();
    for(const other of el.parentElement.children) {
      if(other===el || !(el.compareDocumentPosition(other)&Node.DOCUMENT_POSITION_FOLLOWING) ||
          !other.matches('a,button,summary') || !other.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})) continue;
      const b=other.getBoundingClientRect();
      if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2)
        overlap.push([String(name(el)),String(name(other))]);
    }
  }
  const failures=[];
  if(overflow>viewport) failures.push('horizontal overflow '+overflow+' > '+viewport);
  if(brokenImages.length) failures.push('broken images '+brokenImages.join(', '));
  if(badText.length) failures.push('text clipping '+JSON.stringify(badText.slice(0,6)));
  if(overlap.length) failures.push('overlapping controls '+JSON.stringify(overlap.slice(0,6)));
  return {clientWidth:viewport,scrollWidth:overflow,checkedTextNodes,brokenImages,badText,overlap,failures};
}

async function checkLinks(page,origin,targets) {
  const paths=new Map();
  for(const target of targets) {
    const u=new URL(target,origin);
    if(u.origin!==origin) throw new Error('Unexpected audit destination');
    const pathname=u.pathname+u.search;
    if(!paths.has(pathname)) paths.set(pathname,new Set());
    if(u.hash) paths.get(pathname).add(decodeURIComponent(u.hash.slice(1)));
  }
  const failures=[],resources=[];
  for(const [pathname,anchors] of paths) {
    const response=await page.request.get(origin+pathname,{maxRedirects:0});
    const bytes=await response.body();
    const result={path:pathname,status:response.status(),bytes:bytes.length,anchors:[...anchors]};
    if(response.status()!==200 || !bytes.length) failures.push(pathname+' returned '+response.status()+' / '+bytes.length+' bytes');
    if(pathname.split('?')[0].endsWith('.pdf') && !bytes.subarray(0,5).equals(Buffer.from('%PDF-'))) failures.push(pathname+' invalid PDF');
    if(anchors.size) {
      const missing=await page.evaluate(({html,anchors})=>{
        const parsed=new DOMParser().parseFromString(html,'text/html');
        return anchors.filter(id=>!parsed.getElementById(id) && !parsed.getElementsByName(id).length);
      },{html:bytes.toString(),anchors:[...anchors]});
      if(missing.length) failures.push(pathname+' missing fragment '+missing.join(', '));
    }
    resources.push(result);
    await response.dispose();
  }
  return {resources,failures};
}

async function inspectKeyboard(page) {
  const stops=[],failures=[];
  const max=await page.locator('a[href],button,input,summary,[tabindex="0"]').count()+4;
  for(let i=0;i<max;i++) {
    await page.keyboard.press('Tab');
    const stop=await page.evaluate(()=>{
      const el=document.activeElement;
      if(!el || el===document.body) return null;
      const style=getComputedStyle(el), r=el.getBoundingClientRect();
      return {element:el.id || el.tagName+':'+(el.getAttribute('aria-label') || el.innerText || '').trim().slice(0,45),
        isSkip:el.matches('.skip-link'), focusVisible:el.matches(':focus-visible'),
        indicator:(style.outlineStyle!=='none' && parseFloat(style.outlineWidth)>0) || style.boxShadow!=='none',
        onscreen:r.width>0 && r.height>0 && r.right>0 && r.left<innerWidth};
    });
    if(!stop || (i>0 && stop.isSkip)) break;
    stops.push(stop);
  }
  if(!stops[0]?.isSkip || stops.length<4) failures.push('keyboard traversal / skip link');
  const bad=stops.filter(s=>!(s.focusVisible && s.indicator && s.onscreen));
  if(bad.length) failures.push('keyboard focus '+JSON.stringify(bad.slice(0,4)));
  await page.evaluate(()=>{document.activeElement?.blur(); scrollTo({top:0,behavior:'instant'});});
  return {stops,failures};
}

async function auditAxe(page) {
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const result=await page.evaluate(async()=>{
    const result=await axe.run({runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});
    const serialize=v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target,
      message:n.failureSummary, checks:[...n.any,...n.all,...n.none].map(c=>({id:c.id,data:c.data}))}))});
    return {violations:result.violations.map(serialize),incomplete:result.incomplete.map(v=>({id:v.id,nodes:v.nodes.length})),
      passes:result.passes.map(v=>({id:v.id,nodes:v.nodes.length}))};
  });
  for(const impact of ['critical','serious']) result[impact]=result.violations.filter(v=>v.impact===impact).reduce((sum,v)=>sum+v.nodes.length,0);
  result.failures=result.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+' ('+v.nodes.length+')');
  return result;
}

async function auditSiteSEO(page,origin,pages) {
  // Parse XML on a blank audit page so a visit to the homepage cannot preload its assets.
  const [robots,sitemap]=await Promise.all(['/robots.txt','/sitemap.xml'].map(p=>page.request.get(origin+p,{maxRedirects:0})));
  const rules=await robots.text(), xml=await sitemap.text();
  const parsed=await page.evaluate(xml=>{
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    return {valid:doc.documentElement.namespaceURI==='http://www.sitemaps.org/schemas/sitemap/0.9' && !doc.querySelector('parsererror'),
      urls:[...doc.querySelectorAll('url')].map(u=>({loc:u.querySelector('loc')?.textContent, lastmod:u.querySelector('lastmod')?.textContent}))};
  },xml);
  const today=new Date().toISOString().slice(0,10);
  const checks={http:robots.status()===200 && sitemap.status()===200,
    robots:/^User-agent:\s*\*\s*$/im.test(rules) && /^Allow:\s*\/\s*$/im.test(rules) && !/^Disallow:\s*\/\s*$/im.test(rules),
    sitemapDirective:/^Sitemap:\s*https:\/\/hire\.jiawis\.com\/sitemap\.xml\s*$/im.test(rules),
    sitemapXML:parsed.valid,unique:parsed.urls.length===new Set(parsed.urls.map(u=>u.loc)).size,
    dates:parsed.urls.every(u=>/^20\d\d-\d\d-\d\d$/.test(u.lastmod) && u.lastmod<=today && !Number.isNaN(Date.parse(u.lastmod))),
    currentCorePages:pages.every(p=>parsed.urls.some(u=>u.loc==='https://hire.jiawis.com'+p.route && u.lastmod>='2026-11-28'))};
  for(const u of parsed.urls) {
    const target=new URL(u.loc);
    if(target.origin!=='https://hire.jiawis.com') {checks.sitemapTargets=false; break;}
    const response=await page.request.get(origin+target.pathname,{maxRedirects:0});
    checks.sitemapTargets=(checks.sitemapTargets??true) && response.status()===200;
    await response.dispose();
  }
  return {checks,entries:parsed.urls,failures:Object.keys(checks).filter(k=>!checks[k])};
}

module.exports={inspectDocument,inspectLayout,inspectKeyboard,auditAxe,auditSiteSEO,checkLinks};

function inspectContrast() {
  const samples=[];
  const values=css=>css.match(/[\d.]+/g)?.map(Number);
  const blend=(fg,bg)=>fg.slice(0,3).map((v,i)=>v*(fg[3]??1)+bg[i]*(1-(fg[3]??1)));
  const luminance=rgb=>rgb.slice(0,3).reduce((sum,x,i)=>{
    const s=x/255;
    return sum+[0.2126,0.7152,0.0722][i]*(s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4);
  },0);
  const selectors=['h1','[data-set-lang="en"]','[data-set-lang="zh"]','.button','.copy-email','.hero-chips li',
    '.nav-contact','.menu-toggle .icon','.dk-ver','.dek','.release strong','.cover-chart .serial','.cover-chart .hero-stat',
    '.cover-chart a','.contents a','.source-id','.be-section h2','.be-section summary','.bar-track .after-bar'];
  for(const selector of selectors) {
    const e=document.querySelector(selector);
    if(!e || !e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})) continue;
    const chain=[];
    for(let n=e;n;n=n.parentElement) chain.unshift(n);
    const graphic=selector.endsWith('.after-bar') || selector.endsWith('.icon');
    let bg=[255,255,255];
    // Evaluate composited solid surfaces. Axe separately evaluates gradients and other text nodes.
    for(const n of (graphic?chain.slice(0,-1):chain)) {
      const color=values(getComputedStyle(n).backgroundColor);
      if(color) bg=blend(color,bg);
    }
    const style=getComputedStyle(e);
    const fg=blend(values(graphic?style.backgroundColor:style.color),bg);
    const a=luminance(fg),b=luminance(bg), ratio=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
    const large=parseFloat(style.fontSize)>=24 || (parseFloat(style.fontSize)>=18.66 && Number(style.fontWeight)>=700);
    const required=graphic||large?3:4.5;
    samples.push({selector,foreground:fg.map(Math.round),background:bg.map(Math.round),ratio:Number(ratio.toFixed(3)),required,pass:ratio>=required});
  }
  return samples;
}

module.exports.inspectContrast=inspectContrast;
