/* Khusus Halaman Lemon Pause — terhubung ke MySQL via API */
const currentUser = requireLogin();
if (currentUser) initLemonPause();

const BACKEND_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:3000"
  : "https://lemon-aid-web-server.vercel.app";

let timersData = []; // Data timer dari database

async function initLemonPause() {
  renderNav("timer");

  // 1. Ambil timer dari database
  await fetchTimers();

  // 2. Render pertama kali
  render();

  // 3. Perbarui hitung mundur setiap detik
  setInterval(render, 1000);
}

/* ---------- Fetch Timer dari Database ---------- */
async function fetchTimers() {
  if (!currentUser?.id) return;

  try {
    const res = await fetch(`${BACKEND_URL}/api/timers/${currentUser.id}`);
    if (res.ok) {
      const data = await res.json();
      timersData = data.timers || [];
      // Simpan ke localStorage sebagai cache
      saveTimers(timersData);
    } else {
      console.warn("Gagal mengambil timer dari DB, gunakan cache lokal.");
      timersData = getTimers() || [];
    }
  } catch (err) {
    console.warn("Tidak bisa konek ke server, pakai cache lokal:", err);
    timersData = getTimers() || [];
  }
}

/* ---------- Format Waktu ---------- */
function fmt(ms) {
  if (ms <= 0) return "Time Up";
  let s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  s %= 3600;
  const m = Math.floor(s / 60);

  const parts = [];
  if (d > 0) parts.push(`${d} ${d > 1 ? "Days" : "Day"}`);
  if (h > 0 || d > 0) parts.push(`${h} ${h > 1 ? "Hours" : "Hour"}`);
  parts.push(`${m} ${m > 1 ? "minutes" : "minute"}`);

  return parts.slice(0, 2).join(" ");
}

/* ---------- Card: Waiting (Hitung mundur masih jalan) ---------- */
function waitingCard(t) {
  const imageHtml = t.imageUrl
    ? `<img src="${esc(t.imageUrl)}" alt="${esc(t.name)}" class="item-img" />`
    : `<div class="item-img-placeholder"></div>`;

  return `
    <div class="waiting-card">
      <div class="item-left">
        ${imageHtml}
        <div class="item-info">
          <h4 class="item-name">${esc(t.name)}</h4>
          <p class="item-price">${rp(t.price).replace(",-", "")}</p>
          <p class="item-countdown">${fmt(t.endsAt - Date.now())}</p>
        </div>
      </div>
      <div class="timer-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="#f5a623">
          <path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 1 1 7 7 7.07 7.07 0 0 1-4.95-2.05l-1.42 1.42A9 9 0 1 0 13 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
        </svg>
      </div>
    </div>
  `;
}

/* ---------- Card: Time Up (Sudah habis, tampilkan Buy/Skip) ---------- */
function timeUpCard(t) {
  const imageHtml = t.imageUrl
    ? `<img src="${esc(t.imageUrl)}" alt="${esc(t.name)}" class="item-img" />`
    : `<div class="item-img-placeholder"></div>`;

  return `
    <div class="timeup-card">
      <div class="item-left">
        ${imageHtml}
        <div class="item-info">
          <h4 class="item-name">${esc(t.name)}</h4>
          <p class="item-price">${rp(t.price).replace(",-", "")}</p>
          <span class="timeup-badge">Time Up!</span>
        </div>
      </div>
      <div class="timeup-actions">
        <button class="btn-buy" data-buy="${t.id}">Buy</button>
        <button class="btn-skip" data-drop="${t.id}">Skip</button>
      </div>
    </div>
  `;
}

/* ---------- Render Semua Timer ---------- */
function render() {
  const now = Date.now();
  const done = timersData.filter((t) => t.endsAt <= now);
  const wait = timersData.filter((t) => t.endsAt > now).sort((a, b) => a.endsAt - b.endsAt);

  const timeupList = document.getElementById("timeup-list");
  const waitingList = document.getElementById("waiting-list");

  // Bagian "Still wanna buy?"
  if (timeupList) {
    timeupList.innerHTML = done.length > 0
      ? done.map((t) => timeUpCard(t)).join("")
      : `
        <div class="no-timeup-card">
          <p>Currently no item with countdown reached 0</p>
        </div>
      `;
  }

  // Bagian "Waiting List"
  if (waitingList) {
    waitingList.innerHTML = wait.length > 0
      ? wait.map((t) => waitingCard(t)).join("")
      : `
        <div class="empty-waiting">
          Currently no items in waiting list.<br>Tambahkan barang yang ingin dibeli dari Home.
        </div>
      `;
  }
}

/* ---------- Event Handler: Buy & Skip (kirim ke database) ---------- */
document.addEventListener("click", async (e) => {
  const buyId = e.target.dataset.buy;
  const dropId = e.target.dataset.drop;

  if (buyId) {
    e.target.disabled = true;
    e.target.textContent = "...";

    const item = timersData.find((x) => String(x.id) === String(buyId));

    try {
      const res = await fetch(`${BACKEND_URL}/api/timers/${buyId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, action: "bought" }),
      });

      if (res.ok) {
        // Buka link produk jika ada
        if (item && item.link) {
          window.open(item.link, "_blank", "noopener,noreferrer");
        }

        // Catat ke riwayat belanja lokal
        if (item) {
          const history = store.get("lemon_history", []);
          history.unshift({
            category: item.name,
            name: item.name,
            amount: item.price,
            date: "Today",
          });
          store.set("lemon_history", history);
        }

        // Hapus dari array lokal dan render ulang
        timersData = timersData.filter((x) => String(x.id) !== String(buyId));
        saveTimers(timersData);
        render();
      } else {
        const json = await res.json().catch(() => ({}));
        alert(json.message || "Gagal memproses pembelian.");
        e.target.disabled = false;
        e.target.textContent = "Buy";
      }
    } catch (err) {
      console.error("Error saat Buy:", err);
      alert("Tidak bisa terhubung ke server.");
      e.target.disabled = false;
      e.target.textContent = "Buy";
    }
  }

  if (dropId) {
    e.target.disabled = true;
    e.target.textContent = "...";

    const dropped = timersData.find((x) => String(x.id) === String(dropId));

    try {
      const res = await fetch(`${BACKEND_URL}/api/timers/${dropId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, action: "skipped" }),
      });

      if (res.ok) {
        // Catat penghematan
        if (dropped) {
          const saved = store.get("lemon_savings", []);
          saved.push({ name: dropped.name, price: dropped.price, date: Date.now() });
          store.set("lemon_savings", saved);
        }

        // Hapus dari array lokal dan render ulang
        timersData = timersData.filter((x) => String(x.id) !== String(dropId));
        saveTimers(timersData);
        render();
      } else {
        const json = await res.json().catch(() => ({}));
        alert(json.message || "Gagal memproses skip.");
        e.target.disabled = false;
        e.target.textContent = "Skip";
      }
    } catch (err) {
      console.error("Error saat Skip:", err);
      alert("Tidak bisa terhubung ke server.");
      e.target.disabled = false;
      e.target.textContent = "Skip";
    }
  }
});