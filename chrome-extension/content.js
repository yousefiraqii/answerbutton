// AnswerButton v2 — يشتغل لوكال أو أونلاين حسب إعدادات الـ popup
(function () {
  if (window.__answerButtonInjected) return;
  window.__answerButtonInjected = true;

  const DEFAULT_BACKEND = 'https://answerbutton.vercel.app';

  function getConfig() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(
          { backendUrl: DEFAULT_BACKEND, backendToken: '' },
          (cfg) => resolve({
            backendUrl: (cfg.backendUrl || DEFAULT_BACKEND).replace(/\/$/, ''),
            backendToken: (cfg.backendToken || '').trim()
          })
        );
      } catch (e) {
        resolve({ backendUrl: DEFAULT_BACKEND, backendToken: '' });
      }
    });
  }

  function getQuestionText() {
    // 1) النص المحدد أولاً (أسرع ومش محتاج صلاحية كليب بورد)
    const sel = (window.getSelection && window.getSelection().toString().trim()) || '';
    if (sel && sel.length >= 2) return Promise.resolve(sel);
    // 2) الكليب بورد كبديل
    if (navigator.clipboard && navigator.clipboard.readText) {
      return navigator.clipboard.readText()
        .then(t => (t || '').trim())
        .catch(() => '');
    }
    return Promise.resolve('');
  }

  // واجهة عائمة — أيقونتين صغيرين: واحدة Paste/حل وواحدة Copy
  const aiBox = document.createElement('div');
  aiBox.style.cssText = 'position:fixed;right:8px;top:50%;transform:translateY(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:6px;pointer-events:none;';

  function createFloatingBtn(icon, bgColor, tooltip) {
    const btn = document.createElement('button');
    btn.innerHTML = icon;
    btn.title = tooltip;
    btn.style.cssText = `width:32px;height:32px;border-radius:50%;border:none;background:${bgColor};color:white;cursor:pointer;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.25);pointer-events:auto;transition:all 0.2s ease;display:flex;align-items:center;justify-content:center;`;
    btn.onmouseover = () => { btn.style.transform = 'scale(1.08)'; };
    btn.onmouseout = () => { btn.style.transform = 'scale(1)'; };
    return btn;
  }

  const solveBtn = createFloatingBtn('📥', '#4A90E2', 'لصق وحل السؤال');
  const copyBtn = createFloatingBtn('📋', '#2ecc71', 'نسخ الإجابة');
  copyBtn.style.display = 'none';

  function mount() {
    if (document.body) document.body.appendChild(aiBox);
    else document.documentElement.appendChild(aiBox);
  }
  aiBox.appendChild(solveBtn);
  aiBox.appendChild(copyBtn);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  let savedAnswer = '';

  solveBtn.onclick = async () => {
    const original = solveBtn.innerHTML;
    solveBtn.innerHTML = '⏳';
    try {
      const cfg = await getConfig();
      const question = await getQuestionText();
      if (!question || question.length < 2) {
        alert('انسخ السؤال أو حدده أولاً (Ctrl+C أو تحديد بالماوس)');
        solveBtn.innerHTML = original;
        return;
      }
      if (question.length > 5000) {
        alert('السؤال طويل جداً (أقصى 5000 حرف)');
        solveBtn.innerHTML = original;
        return;
      }
      const headers = { 'Content-Type': 'application/json' };
      if (cfg.backendToken) headers['x-admin-token'] = cfg.backendToken;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      let response;
      try {
        response = await fetch(`${cfg.backendUrl}/api/solve`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ question }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.answer) {
        savedAnswer = data.answer;
        solveBtn.innerHTML = '✅';
        copyBtn.style.display = 'flex';
        try { await navigator.clipboard.writeText(savedAnswer); } catch (e) { /* تجاهل */ }
        setTimeout(() => { solveBtn.innerHTML = '📥'; }, 2000);
      } else if (response.status === 401) {
        alert('السيرفر محمي بتوكن. افتح الإضافة ← الإعدادات وأدخل التوكن.');
        solveBtn.innerHTML = '❌';
        setTimeout(() => { solveBtn.innerHTML = '📥'; }, 2000);
      } else {
        alert('Error: ' + (data.error || ('HTTP ' + response.status)));
        solveBtn.innerHTML = '❌';
        setTimeout(() => { solveBtn.innerHTML = '📥'; }, 2000);
      }
    } catch (e) {
      const cfg = await getConfig();
      alert(`تعذر الاتصال بالسيرفر (${cfg.backendUrl}).\n1) تأكد أنه شغال\n2) افتح الإضافة ← الإعدادات وتأكد من رابط السيرفر`);
      solveBtn.innerHTML = '📥';
    }
  };

  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(savedAnswer);
      copyBtn.innerHTML = '✔️';
    } catch (e) {
      // fallback للمتصفحات القديمة
      const ta = document.createElement('textarea');
      ta.value = savedAnswer;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); copyBtn.innerHTML = '✔️'; } catch (err) { copyBtn.innerHTML = '❌'; }
      ta.remove();
    }
    setTimeout(() => { copyBtn.innerHTML = '📋'; }, 1500);
  };
})();
