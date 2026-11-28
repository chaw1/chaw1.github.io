(() => {
  'use strict';
  const root = document.documentElement;
  const key = 'jiawis-lang';
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
  }

  // Apply the saved language before the first paint.
  try {
    if (localStorage.getItem(key) === 'en') selectLanguage('en');
  } catch { /* Browser storage may be unavailable. */ }

  document.addEventListener('DOMContentLoaded', () => {
    root.classList.add('js');
    selectLanguage(root.dataset.lang);
    document.querySelectorAll('[data-set-lang]').forEach(button => {
      button.addEventListener('click', () => {
        selectLanguage(button.dataset.setLang);
        try { localStorage.setItem(key, root.dataset.lang); } catch { /* Continue in memory. */ }
      });
    });
  });
})();
