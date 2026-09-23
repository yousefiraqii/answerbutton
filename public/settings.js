document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('statusMessage');
  const apiKey = document.getElementById('apiKey');
  const providerUrl = document.getElementById('providerUrl');
  const model = document.getElementById('model');
  const language = document.getElementById('language');
  const answerLength = document.getElementById('answerLength');
  const instructions = document.getElementById('instructions');
  const pdfInput = document.getElementById('pdfFileInput');
  const dropZone = document.getElementById('dropZone');
  const pdfStatus = document.getElementById('pdfStatus');

  // توكن الإدارة: يتخزن في localStorage لو السيرفر محمي بـ ADMIN_TOKEN
  let adminToken = localStorage.getItem('adminToken') || '';
  if (!document.getElementById('adminToken')) {
    const label = document.createElement('label');
    label.textContent = '🔐 توكن الإدارة (لو السيرفر محمي):';
    const input = document.createElement('input');
    input.type = 'password';
    input.id = 'adminToken';
    input.placeholder = 'اتركه فاضي لو السيرفر لوكال بدون حماية';
    input.value = adminToken;
    input.addEventListener('change', () => {
      adminToken = input.value.trim();
      if (adminToken) localStorage.setItem('adminToken', adminToken);
      else localStorage.removeItem('adminToken');
    });
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.parentNode.insertBefore(label, saveBtn);
    saveBtn.parentNode.insertBefore(input, saveBtn);
  } else {
    document.getElementById('adminToken').value = adminToken;
  }

  function headers(extra = {}) {
    const h = { ...extra };
    if ((localStorage.getItem('adminToken') || adminToken)) {
      h['x-admin-token'] = localStorage.getItem('adminToken') || adminToken;
    }
    return h;
  }

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings', { headers: headers() });
      if (res.status === 401) {
        showStatus('السيرفر محمي. أدخل توكن الإدارة ثم أعد التحميل.', 'error');
        return;
      }
      const data = await res.json();
      if (data.providerBaseUrl) providerUrl.value = data.providerBaseUrl;
      if (data.model) model.value = data.model;
      if (data.language) language.value = data.language;
      if (data.answerLength) answerLength.value = data.answerLength;
      if (data.instructions) instructions.value = data.instructions;
      const kbLen = data.knowledgeBaseLength ?? (data.knowledgeBase ? data.knowledgeBase.length : 0);
      pdfStatus.textContent = kbLen ? `✅ تم رفع ملف PDF سابقًا (${kbLen} حرف)` : '📄 لم يتم رفع أي ملف PDF بعد';
      if (data.apiKeyConfigured) {
        apiKey.placeholder = '✅ مفتاح API محفوظ (اتركه فاضي للإبقاء عليه)';
      }
    } catch (e) {
      showStatus('لا يمكن الاتصال بالخادم. تأكد من تشغيل السيرفر.', 'error');
    }
  }
  loadSettings();

  function showStatus(msg, type = 'success') {
    statusEl.textContent = msg;
    statusEl.className = `status ${type}`;
    setTimeout(() => { statusEl.className = 'status'; }, 6000);
  }

  async function uploadPDF(file) {
    if (!file || (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf'))) {
      showStatus('يرجى اختيار ملف PDF صالح', 'error');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      showStatus('الملف أكبر من 15MB', 'error');
      return;
    }
    const formData = new FormData();
    formData.append('pdfFile', file);
    try {
      const res = await fetch('/api/upload-pdf', { method: 'POST', headers: headers(), body: formData });
      const data = await res.json();
      if (data.success) {
        showStatus(`✅ تم رفع واستخراج ${data.textLength} حرف من PDF بنجاح`, 'success');
        pdfStatus.textContent = `✅ تم رفع ملف ${file.name} (${data.textLength} حرف)`;
      } else {
        showStatus('❌ فشل رفع PDF: ' + (data.error || ''), 'error');
      }
    } catch (e) {
      showStatus('❌ خطأ في الاتصال بالخادم', 'error');
    }
  }

  dropZone.addEventListener('click', () => pdfInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#2ecc71'; });
  dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = '#4a90e2'; });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#4a90e2';
    if (e.dataTransfer.files.length) uploadPDF(e.dataTransfer.files[0]);
  });
  pdfInput.addEventListener('change', (e) => {
    if (e.target.files.length) uploadPDF(e.target.files[0]);
  });

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const currentTokenEl = document.getElementById('adminToken');
    if (currentTokenEl) {
      adminToken = currentTokenEl.value.trim();
      if (adminToken) localStorage.setItem('adminToken', adminToken);
      else localStorage.removeItem('adminToken');
    }
    const payload = {
      providerBaseUrl: providerUrl.value.trim(),
      model: model.value.trim(),
      language: language.value,
      answerLength: answerLength.value,
      instructions: instructions.value.trim()
    };
    if (apiKey.value.trim() !== '') payload.apiKey = apiKey.value.trim();
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showStatus('✅ تم حفظ الإعدادات بنجاح', 'success');
        apiKey.value = '';
        loadSettings();
      } else if (res.status === 401) {
        showStatus('❌ توكن الإدارة غلط أو ناقص', 'error');
      } else {
        const data = await res.json().catch(() => ({}));
        showStatus('❌ فشل حفظ الإعدادات: ' + (data.error || ''), 'error');
      }
    } catch (e) {
      showStatus('❌ خطأ في الاتصال بالخادم', 'error');
    }
  });
});
