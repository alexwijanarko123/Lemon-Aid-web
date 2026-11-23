const surveyView = document.getElementById('survey-view');
const responseView = document.getElementById('response-view');
const surveyForm = document.getElementById('survey-form');
const geminiOutput = document.getElementById('gemini-output');
const askBtn = document.getElementById('ask-btn');

const BACKEND_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:3000"
  : "https://lemon-aid-web-server.vercel.app";
// Ambil userId jika user sudah login dan tersimpan di localStorage (opsional)
function getCurrentUserId() {
  try {
    const rawUser = localStorage.getItem('currentUser');
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
      const res = await fetch(`${BACKEND_URL}/api/timers`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: itemName,
          price,
          url: link,
          imageUrl: null,
          reason,
          durationSeconds: 86400,
        }),
      });
      if (handleUnauthorized(res)) return;

      if (res.ok) {
        alert('Item disimpan ke Lemon Pause (24 jam)! 🍋');
        window.location.href = 'lemonpause.html';
        return;
      }

      const data = await res.json().catch(() => ({}));
      alert(data.message || 'Gagal menyimpan item.');
    } catch {
      alert('Tidak bisa terhubung ke server.');
    }
  } else {
    alert('Isi nama barang dan harga yang valid, dan pastikan kamu sudah login ya.');
  }
});

document.getElementById('buy-btn').addEventListener('click', () => {
  const link = document.getElementById('product-link').value.trim();
  if (link) {
    window.open(link, '_blank', 'noopener,noreferrer');
  } else {
    alert('Dicatat sebagai "Buy anyways". Pastikan tetap sesuai budget ya!');
    window.location.href = 'homepage.html';
  }
});