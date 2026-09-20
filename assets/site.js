(() => {
  'use strict';

  const root = document.documentElement;
  const languageButtons = [...document.querySelectorAll('[data-set-lang]')];
  const menuButton = document.querySelector('#menu-toggle');
  const navigation = document.querySelector('#site-nav');
  const navLinks = [...document.querySelectorAll('a[data-nav]')];
  const flow = document.querySelector('#flow-demo');
  const stepButtons = [...document.querySelectorAll('button[data-step]')];
  const playButton = document.querySelector('#flow-play');
  const resetButton = document.querySelector('#flow-reset');
  const flowStatus = document.querySelector('#flow-status');
  const copyButton = document.querySelector('#copy-email');
  const copyStatus = document.querySelector('#copy-status');
  const motionPreference = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  const steps = [
    {
      zh: '提交', en: 'Submit',
      descriptionZh: '校验输入，明确请求边界。',
      descriptionEn: 'Validate input and establish the request boundary.'
    },
    {
      zh: '排队', en: 'Queue',
      descriptionZh: '用队列组织等待中的工作。',
      descriptionEn: 'Organize pending work through a queue.'
    },
    {
      zh: '执行', en: 'Execute',
      descriptionZh: '把任务交给执行节点。',
      descriptionEn: 'Pass the task to a worker.'
    },
    {
      zh: '完成', en: 'Complete',
      descriptionZh: '汇总状态，让结果可追踪。',
      descriptionEn: 'Collect status updates and make the result traceable.'
    }
  ];

  let language = 'zh';
  let activeStep = 0;
  let playing = false;
  let flowState = 'idle';
  let timer = null;
  let copyState = 'idle';

  try {
    const savedLanguage = localStorage.getItem('jiawis-lang');
    if (savedLanguage === 'zh' || savedLanguage === 'en') language = savedLanguage;
  } catch (_) {
    // The page remains usable when browser storage is unavailable.
  }

  function setText(selector, text) {
    const element = document.querySelector(selector);
    if (element) element.textContent = text;
  }

  function updateMenuLabel() {
    if (!menuButton) return;
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-label', language === 'zh'
      ? (open ? '关闭导航' : '打开导航')
      : (open ? 'Close navigation' : 'Open navigation'));
  }

  function setMenu(open) {
    if (!menuButton || !navigation) return;
    menuButton.setAttribute('aria-expanded', String(open));
    navigation.classList.toggle('is-open', open);
    navigation.dataset.open = String(open);
    root.dataset.menuOpen = String(open);
    updateMenuLabel();
  }

  function renderFlow() {
    if (!flow) return;
    const step = steps[activeStep];
    flow.dataset.activeStep = String(activeStep);
    flow.dataset.playing = String(playing);
    stepButtons.forEach(button => {
      const selected = Number(button.dataset.step) === activeStep;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('is-active', selected);
      button.classList.toggle('is-complete', Number(button.dataset.step) < activeStep);
    });

    setText('#flow-title-zh', step.zh);
    setText('#flow-title-en', step.en);
    setText('#flow-description-zh', step.descriptionZh);
    setText('#flow-description-en', step.descriptionEn);

    if (playButton) {
      const finished = activeStep === steps.length - 1;
      setText('#flow-play .zh', playing ? '暂停演示' : (finished ? '重新演示' : (flowState === 'paused' ? '继续演示' : '播放演示')));
      setText('#flow-play .en', playing ? 'Pause demo' : (finished ? 'Replay demo' : (flowState === 'paused' ? 'Resume demo' : 'Play demo')));
      playButton.setAttribute('aria-pressed', String(playing));
    }

    if (flowStatus) {
      const number = `${activeStep + 1} / ${steps.length}`;
      const messages = language === 'zh' ? {
        idle: '交互示意 · 点击节点查看流程',
        selected: `交互示意 · 步骤 ${number}：${step.zh}`,
        playing: `交互示意 · 正在演示 ${number}：${step.zh}`,
        paused: `交互示意 · 已暂停于 ${number}：${step.zh}`,
        complete: '交互示意 · 演示完成，可重新播放',
        reduced: '交互示意 · 已展示最终步骤，遵循减少动态效果设置'
      } : {
        idle: 'Interactive illustration · Select a step to explore',
        selected: `Interactive illustration · Step ${number}: ${step.en}`,
        playing: `Interactive illustration · Playing ${number}: ${step.en}`,
        paused: `Interactive illustration · Paused at ${number}: ${step.en}`,
        complete: 'Interactive illustration · Complete. Ready to replay',
        reduced: 'Interactive illustration · Final step shown with reduced motion'
      };
      flowStatus.textContent = messages[flowState];
    }
  }

  function stopPlayback() {
    window.clearTimeout(timer);
    timer = null;
    playing = false;
  }

  function advancePlayback() {
    timer = window.setTimeout(() => {
      activeStep += 1;
      if (activeStep === steps.length - 1) {
        stopPlayback();
        flowState = 'complete';
      }
      renderFlow();
      if (playing) advancePlayback();
    }, 1100);
  }

  function renderCopyStatus() {
    if (!copyStatus) return;
    const messages = language === 'zh' ? {
      idle: '', copying: '正在复制…', success: '邮箱已复制',
      failed: '未能复制，请使用邮箱链接联系我。'
    } : {
      idle: '', copying: 'Copying…', success: 'Email copied',
      failed: 'Could not copy. Please use the email link to get in touch.'
    };
    copyStatus.textContent = messages[copyState];
  }

  function setLanguage(nextLanguage) {
    if (nextLanguage !== 'zh' && nextLanguage !== 'en') return;
    language = nextLanguage;
    root.dataset.lang = language;
    root.lang = language === 'zh' ? 'zh-CN' : 'en';
    languageButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.setLang === language));
    });
    try {
      localStorage.setItem('jiawis-lang', language);
    } catch (_) {
      // Language switching does not depend on persistence.
    }
    updateMenuLabel();
    renderFlow();
    renderCopyStatus();
    scheduleNavigationUpdate();
  }

  languageButtons.forEach(button => {
    button.addEventListener('click', () => setLanguage(button.dataset.setLang));
  });

  if (menuButton && navigation) {
    menuButton.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') !== 'true';
      setMenu(open);
      if (open) navigation.querySelector('a[href]')?.focus({ preventScroll: true });
    });
    navigation.addEventListener('click', event => {
      const link = event.target.closest('a[href^="#"]');
      if (!link || menuButton.getAttribute('aria-expanded') !== 'true') return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = document.getElementById(link.getAttribute('href').slice(1));
      setMenu(false);
      if (target) {
        window.requestAnimationFrame(() => {
          const heading = target.querySelector('h1, h2, h3') || target;
          if (!heading.hasAttribute('tabindex')) {
            heading.setAttribute('tabindex', '-1');
            heading.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true });
          }
          heading.focus({ preventScroll: true });
        });
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
        event.preventDefault();
        setMenu(false);
        menuButton.focus();
      }
    });
    setMenu(false);
  }

  stepButtons.forEach(button => {
    button.addEventListener('click', () => {
      const nextStep = Number(button.dataset.step);
      if (!Number.isInteger(nextStep) || nextStep < 0 || nextStep >= steps.length) return;
      stopPlayback();
      activeStep = nextStep;
      flowState = 'selected';
      renderFlow();
    });
  });

  if (playButton) {
    playButton.addEventListener('click', () => {
      if (playing) {
        stopPlayback();
        flowState = 'paused';
      } else if (motionPreference && motionPreference.matches) {
        activeStep = steps.length - 1;
        flowState = 'reduced';
      } else {
        if (activeStep === steps.length - 1) activeStep = 0;
        playing = true;
        flowState = 'playing';
        advancePlayback();
      }
      renderFlow();
    });
  }

  if (resetButton) {
    resetButton.addEventListener('click', () => {
      stopPlayback();
      activeStep = 0;
      flowState = 'idle';
      renderFlow();
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) {
      stopPlayback();
      flowState = 'paused';
      renderFlow();
    }
  });

  const onMotionChange = event => {
    if (event.matches && playing) {
      stopPlayback();
      activeStep = steps.length - 1;
      flowState = 'reduced';
      renderFlow();
    }
  };
  if (motionPreference) {
    if (motionPreference.addEventListener) motionPreference.addEventListener('change', onMotionChange);
    else if (motionPreference.addListener) motionPreference.addListener(onMotionChange);
  }

  function copyWithSelection(text) {
    const previousFocus = document.activeElement;
    const selection = window.getSelection();
    const ranges = [];
    if (selection) {
      for (let index = 0; index < selection.rangeCount; index += 1) {
        ranges.push(selection.getRangeAt(index).cloneRange());
      }
    }
    const field = document.createElement('textarea');
    field.value = text;
    field.readOnly = true;
    field.setAttribute('aria-label', language === 'zh' ? '联系邮箱' : 'Contact email');
    field.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none;font-size:16px;';
    document.body.appendChild(field);
    try {
      field.select();
      field.setSelectionRange(0, field.value.length);
      if (!document.execCommand || !document.execCommand('copy')) throw new Error('Copy unavailable');
    } finally {
      field.remove();
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus({ preventScroll: true });
      if (selection) {
        selection.removeAllRanges();
        ranges.forEach(range => selection.addRange(range));
      }
    }
  }

  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      if (copyState === 'copying') return;
      const email = copyButton.dataset.email;
      copyButton.setAttribute('aria-busy', 'true');
      copyState = 'copying';
      renderCopyStatus();
      try {
        if (!email) throw new Error('Email unavailable');
        try {
          if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
          await navigator.clipboard.writeText(email);
        } catch (_) {
          copyWithSelection(email);
        }
        copyState = 'success';
      } catch (_) {
        copyState = 'failed';
      } finally {
        copyButton.removeAttribute('aria-busy');
        renderCopyStatus();
      }
    });
  }

  function setCurrentSection(id) {
    navLinks.forEach(link => {
      if (link.getAttribute('href') === `#${id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  const sectionNavigation = [
    ['intro', ''],
    ['selected-work', 'selected-work'],
    ['projects', 'selected-work'],
    ['skills', 'skills'],
    ['work', 'work'],
    ['contact', 'contact']
  ].map(([id, navigationId]) => ({ element: document.getElementById(id), navigationId }))
    .filter(section => section.element);
  const header = document.querySelector('.site-header');
  let navigationFrame = null;

  function updateCurrentSection() {
    navigationFrame = null;
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 12);
    const readingLine = (header ? header.getBoundingClientRect().bottom : 72) + 64;
    let current = '';
    sectionNavigation.forEach(section => {
      if (section.element.getBoundingClientRect().top <= readingLine) current = section.navigationId;
    });
    const atPageEnd = window.scrollY > 0
      && Math.ceil(window.scrollY + window.innerHeight) >= root.scrollHeight - 2;
    if (atPageEnd && document.getElementById('contact')) current = 'contact';
    setCurrentSection(current);
  }

  function scheduleNavigationUpdate() {
    if (navigationFrame === null) navigationFrame = window.requestAnimationFrame(updateCurrentSection);
  }

  window.addEventListener('scroll', scheduleNavigationUpdate, { passive: true });
  window.addEventListener('resize', scheduleNavigationUpdate);
  window.addEventListener('hashchange', scheduleNavigationUpdate);
  window.addEventListener('pageshow', scheduleNavigationUpdate);
  window.addEventListener('load', scheduleNavigationUpdate);
  document.addEventListener('toggle', scheduleNavigationUpdate, true);
  scheduleNavigationUpdate();

  setText('#year', String(new Date().getFullYear()));
  setLanguage(language);
})();
