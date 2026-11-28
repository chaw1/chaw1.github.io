(() => {
  'use strict';
  const root = document.documentElement;
  const key = 'jiawis-lang';
  const copyMessage = {
    zh: { copied: '已复制', manual: '已选中命令，请手动复制。' },
    en: { copied: 'Copied', manual: 'Command selected. Copy it manually.' }
  };

  function updateCopyStatus(status) {
    status.textContent = copyMessage[root.dataset.lang][status.dataset.result] || '';
  }

  function selectLanguage(language) {
    const english = language === 'en';
    root.lang = english ? 'en' : 'zh-CN';
    root.dataset.lang = english ? 'en' : 'zh';
    document.title = english
      ? 'Datakeel v0.28.0 engineering notes & benchmarks | Jiawei Zhang'
      : 'Datakeel v0.28.0 工程笔记与实测基准 | Jiawei Zhang';
    document.querySelectorAll('[data-set-lang]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.setLang === root.dataset.lang));
    });
    document.querySelectorAll('.be-command-tools [role="status"]').forEach(updateCopyStatus);
  }

  function attachCommandButtons() {
    const template = document.getElementById('command-tools');
    document.querySelectorAll('pre > code').forEach((code, index) => {
      const pre = code.parentElement;
      pre.id = 'command-' + (index + 1);
      const bar = template.content.firstElementChild.cloneNode(true);
      const button = bar.querySelector('button');
      const status = bar.querySelector('[role="status"]');
      button.setAttribute('aria-controls', pre.id);
      button.addEventListener('click', async () => {
        let copied = false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          try {
            await navigator.clipboard.writeText(code.textContent);
            copied = true;
          } catch { /* Try copying the selected command below. */ }
        }
        if (!copied) {
          const range = document.createRange();
          range.selectNodeContents(code);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          try { copied = document.execCommand('copy'); } catch { /* Keep the text selected. */ }
          if (copied) selection.removeAllRanges();
        }
        status.dataset.result = copied ? 'copied' : 'manual';
        updateCopyStatus(status);
      });
      pre.before(bar);
    });
  }

  function attachChartFilters() {
    const controls = document.querySelector('[data-chart-controls]');
    const buttons = controls.querySelectorAll('[data-chart-filter]');
    const series = document.querySelectorAll('[data-chart-db]');
    buttons.forEach(button => button.addEventListener('click', () => {
      const selected = button.dataset.chartFilter;
      buttons.forEach(option => option.setAttribute('aria-pressed', String(option === button)));
      series.forEach(item => { item.hidden = selected !== 'all' && item.dataset.chartDb !== selected; });
    }));
    controls.hidden = false;
  }

  // Apply the saved language before the first paint.
  try {
    if (localStorage.getItem(key) === 'en') selectLanguage('en');
  } catch { /* Browser storage may be unavailable. */ }

  document.addEventListener('DOMContentLoaded', () => {
    root.classList.add('js');
    selectLanguage(root.dataset.lang);
    attachCommandButtons();
    attachChartFilters();
    document.querySelectorAll('[data-set-lang]').forEach(button => {
      button.addEventListener('click', () => {
        selectLanguage(button.dataset.setLang);
        try { localStorage.setItem(key, root.dataset.lang); } catch { /* Continue in memory. */ }
      });
    });
  });
})();
