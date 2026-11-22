const surveyView = document.getElementById('survey-view');
const responseView = document.getElementById('response-view');
const surveyForm = document.getElementById('survey-form');
const geminiOutput = document.getElementById('gemini-output');
const askBtn = document.getElementById('ask-btn');

// Ambil userId jika user sudah login dan tersimpan di localStorage (opsional)
function getCurrentUserId() {
  try {
    const rawUser = localStorage.getItem('user') || localStorage.getItem('lemonAidUser');
    if (!rawUser) return null;
    const parsed = JSON.parse(rawUser);
    return Number(parsed?.id || parsed?.userId) || null;
  } catch {
    return null;
  }
}

async function fetchGeminiInsight(surveyData) {
  const response = await fetch('/api/mini-survey-insight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: getCurrentUserId(),
      ...surveyData,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || `Request gagal (${response.status})`);
  }

  if (!payload.insight) {
    throw new Error('Insight kosong dari server.');
  }

  return payload.insight;
}

surveyForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const surveyData = {
    itemName: document.getElementById('item-name').value.trim(),
    itemPrice: document.getElementById('item-price').value.trim(),
    similarItems: document.getElementById('similar-items').value.trim(),
    buyTime: document.getElementById('buy-time').value.trim(),
    buyReason: document.getElementById('buy-reason').value.trim(),
    productLink: document.getElementById('product-link').value.trim(),
  };

  if (!surveyData.itemName || !surveyData.itemPrice || !surveyData.similarItems || !surveyData.buyReason) {
    return;
  }

  askBtn.disabled = true;
  surveyView.classList.add('hidden');
  responseView.classList.remove('hidden');
  geminiOutput.innerHTML = `<span class="loading-dots">Gemini sedang menganalisis jawabanmu</span>`;

  try {
    const aiReply = await fetchGeminiInsight(surveyData);
    geminiOutput.textContent = aiReply;
  } catch (error) {
    geminiOutput.textContent = `Oops! Gagal mengambil insight dari Gemini.\nDetail: ${error.message}`;
  } finally {
    askBtn.disabled = false;
  }
});

document.getElementById('back-btn').addEventListener('click', () => {
  responseView.classList.add('hidden');
  surveyView.classList.remove('hidden');
});

document.getElementById('reset-btn').addEventListener('click', () => {
  surveyForm.reset();
});

document.getElementById('save-btn').addEventListener('click', async () => {
  const userId = getCurrentUserId();
  const itemName = document.getElementById('item-name').value.trim();
  const rawPrice = document.getElementById('item-price').value.replace(/[^\d]/g, '');
  const price = Number(rawPrice) || 0;
  const reason = document.getElementById('buy-reason').value.trim();
  const link = document.getElementById('product-link').value.trim() || null;

  // Kalau user login & harga valid, bisa sekalian simpan ke /api/timers (default 24 jam = 86400 detik)
  if (userId && itemName && price > 0) {
    try {
      const res = await fetch('/api/timers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          name: itemName,
          price,
          url: link,
          imageUrl: null,
          reason,
          durationSeconds: 86400,
        }),
      });
      if (res.ok) {
        alert('Item disimpan ke Lemon Pause (24 jam) di database! 🍋');
        return;
      }
    } catch {
      // Fallback ke notifikasi lokal jika gagal
    }
  }

  alert('Item disimpan ke daftar Lemon Pause (Save for later)! 🍋');
});

document.getElementById('buy-btn').addEventListener('click', () => {
  const link = document.getElementById('product-link').value.trim();
  if (link) {
    window.open(link, '_blank', 'noopener,noreferrer');
  } else {
    alert('Dicatat sebagai "Buy anyways". Pastikan tetap sesuai budget ya!');
  }
});