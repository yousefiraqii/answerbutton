document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('backendUrl');
  const tokenInput = document.getElementById('backendToken');
  const status = document.getElementById('status');

  chrome.storage.sync.get(
    { backendUrl: 'https://answerbutton.vercel.app', backendToken: '' },
    (cfg) => {
      urlInput.value = cfg.backendUrl;
      tokenInput.value = cfg.backendToken;
    }
  );

  function setStatus(msg, ok) {
    status.textContent = msg;
    status.className = ok === true ? 'ok' : ok === false ? 'err' : '';
  }

  document.getElementById('saveBtn').addEventListener('click', () => {
    const backendUrl = urlInput.value.trim().replace(/\/$/, '') || 'https://answerbutton.vercel.app';
    const backendToken = tokenInput.value.trim();
    chrome.storage.sync.set({ backendUrl, backendToken }, () => {
      setStatus('✅ اتحفظ', true);
    });
  });

  document.getElementById('testBtn').addEventListener('click', async () => {
    const backendUrl = urlInput.value.trim().replace(/\/$/, '') || 'https://answerbutton.vercel.app';
    setStatus('⏳ بجرب الاتصال...');
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${backendUrl}/api/health`, { signal: controller.signal });
      clearTimeout(t);
      if (res.ok) {
        const data = await res.json();
        setStatus(`✅ السيرفر شغال (uptime ${Math.round(data.uptime || 0)}s)`, true);
      } else {
        setStatus(`❌ السيرفر رد بكود ${res.status}`, false);
      }
    } catch (e) {
      setStatus('❌ مش قادر أوصل للسيرفر', false);
    }
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    const backendUrl = urlInput.value.trim().replace(/\/$/, '') || 'https://answerbutton.vercel.app';
    chrome.tabs.create({ url: `${backendUrl}/settings.html` });
  });
});
