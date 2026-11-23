/* Halaman Lemon Pause — terhubung ke MySQL lewat API.
   Butuh (dimuat SEBELUM file ini): navbar.js  -> requireLogin, renderNav, store, $
                                    api.js     -> authHeaders, handleUnauthorized */

/* ================= STATE & KONFIGURASI =================
   Semua const/let HARUS di atas. initLemonPause() dipanggil di paling bawah file;
   kalau dipanggil sebelum deklarasi ini, JS melempar "Cannot access ... before initialization". */

const BACKEND_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:3000"
  : "https://lemon-aid-web-server.vercel.app";

const SVG_TIMER_ICON = `
  <svg viewBox="0 0 24 24" width="28" height="28" fill="#f5a623" aria-hidden="true">
    <path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 1 1 7 7 7.07 7.07 0 0 1-4.95-2.05l-1.42 1.42A9 9 0 1 0 13 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
  </svg>`;

let timersData = [];       // timer milik user (dari database)
let lastSignature = null;  // penanda perubahan daftar, supaya tidak render ulang tiap detik
let loadFailed = false;    // true kalau gagal ambil data dari server
let activeTimerId = null;  // timer yang sedang tampil di popup
let busy = false;          // true selama request Nope/Buy berjalan (cegah klik ganda)

const currentUser = requireLogin();

/* ================= HELPER ================= */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Hanya izinkan http/https (cegah "javascript:" dsb). Link tanpa protokol dianggap https.
function normalizeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  let v = value.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = "https://" + v;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

const rpList = (n) => "Rp. " + Math.round(Number(n) || 0).toLocaleString("id-ID"); // "Rp. 46.499.000"
const rpPopup = (n) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID"); // "Rp 23.499.000"

function fmt(ms) {
  let s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} ${s === 1 ? "second" : "seconds"}`;
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600);  s %= 3600;
  const m = Math.floor(s / 60);

  const parts = [];
  if (d > 0) parts.push(`${d} ${d > 1 ? "Days" : "Day"}`);
  if (h > 0 || d > 0) parts.push(`${h} ${h > 1 ? "Hours" : "Hour"}`);
  parts.push(`${m} ${m > 1 ? "minutes" : "minute"}`);
  return parts.slice(0, 2).join(" ");
}

// Tanggal lokal (BUKAN toISOString yang UTC: di WIB bisa mundur sehari)
function todayYMD() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const findTimer = (id) => timersData.find((t) => String(t.id) === String(id));

function itemImage(t) {
  const src = normalizeUrl(t.imageUrl);
  const placeholder = () => el("div", "item-img-placeholder");
  if (!src) return placeholder();

  const img = el("img", "item-img");
  img.src = src;
  img.alt = t.name;
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.addEventListener("error", () => img.replaceWith(placeholder()));
  return img;
}

/* ================= DATA ================= */

async function fetchTimers() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/timers`, { headers: authHeaders() });
    if (handleUnauthorized(res)) return;           // token tidak valid -> ke halaman login
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    timersData = Array.isArray(data.timers) ? data.timers : [];
    loadFailed = false;
  } catch (err) {
    console.warn("Gagal mengambil timer dari server:", err);
    loadFailed = true;
  }
}

async function sendAction(timer, action) {
  const res = await fetch(`${BACKEND_URL}/api/timers/${encodeURIComponent(timer.id)}/action`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ action }),
  });
  if (handleUnauthorized(res)) return { ok: false, redirected: true };
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    return { ok: false, message: json.message };
  }
  return { ok: true };
}

/* ================= RENDER ================= */

function waitingCard(t) {
  const card = el("div", "waiting-card");
  card.dataset.id = t.id;

  const left = el("div", "item-left");
  const info = el("div", "item-info");
  const countdown = el("p", "item-countdown", fmt(t.endsAt - Date.now()));
  countdown.dataset.end = t.endsAt; // diperbarui tiap detik tanpa membuat ulang kartu
  info.append(el("h4", "item-name", t.name), el("p", "item-price", rpList(t.price)), countdown);
  left.append(itemImage(t), info);

  const icon = el("div", "timer-icon");
  icon.innerHTML = SVG_TIMER_ICON; // konstanta statis, bukan data user
  card.append(left, icon);
  return card;
}

function timeUpCard(t) {
  const card = el("button", "timeup-card");
  card.type = "button";
  card.dataset.id = t.id;
  card.setAttribute("aria-label", `${t.name}, waktu habis. Buka untuk memutuskan.`);

  const info = el("div", "item-info");
  info.append(
    el("h4", "item-name", t.name),
    el("p", "item-price", rpList(t.price)),
    el("span", "timeup-badge", "Time's up! Tap to decide")
  );
  card.append(itemImage(t), info);
  return card;
}

function messageCard(text, withRetry) {
  const box = el("div", "no-timeup-card");
  box.append(el("p", "", text));
  if (withRetry) {
    const btn = el("button", "retry-btn", "Coba lagi");
    btn.type = "button";
    btn.addEventListener("click", reload);
    box.append(btn);
  }
  return box;
}

function renderLists(done, wait) {
  const timeupList = $("#timeup-list");
  const waitingList = $("#waiting-list");

  timeupList.replaceChildren(
    ...(done.length
      ? done.map(timeUpCard)
      : [messageCard("Currently no item with countdown reached 0")])
  );

  const empty = el("div", "empty-waiting");
  empty.append("Currently no items in waiting list.", document.createElement("br"),
    "Tambahkan barang yang ingin dibeli dari Home.");
  waitingList.replaceChildren(...(wait.length ? wait.map(waitingCard) : [empty]));
}

// Dipanggil tiap detik. Daftar hanya dibangun ulang kalau isinya berubah
// (item baru habis / dihapus); selain itu cukup update teks hitung mundur.
function tick() {
  if (loadFailed) return;

  const now = Date.now();
  const done = timersData.filter((t) => t.endsAt <= now).sort((a, b) => a.endsAt - b.endsAt);
  const wait = timersData.filter((t) => t.endsAt > now).sort((a, b) => a.endsAt - b.endsAt);

  const signature = done.map((t) => t.id).join(",") + "|" + wait.map((t) => t.id).join(",");
  if (signature !== lastSignature) {
    lastSignature = signature;
    renderLists(done, wait);
  } else {
    document.querySelectorAll("[data-end]").forEach((node) => {
      node.textContent = fmt(Number(node.dataset.end) - now);
    });
  }

  // Kalau item di popup sudah tidak ada (mis. sudah diproses), tutup popup
  if (activeTimerId !== null && !findTimer(activeTimerId)) closeModal();
}

function showLoadError() {
  $("#timeup-list").replaceChildren(
    messageCard("Gagal memuat data timer dari server.", true)
  );
  $("#waiting-list").replaceChildren();
}

/* ================= POPUP ================= */

function openModal(id) {
  const t = findTimer(id);
  if (!t) return;
  activeTimerId = t.id;

  const imgBox = $("#modal-img");
  const src = normalizeUrl(t.imageUrl);
  imgBox.replaceChildren();
  if (src) {
    const img = el("img");
    img.src = src;
    img.alt = t.name;
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => img.remove());
    imgBox.append(img);
  }

  $("#modal-name").textContent = t.name;
  $("#modal-price").textContent = rpPopup(t.price);

  const linkEl = $("#modal-link");
  const hasLink = typeof t.link === "string" && t.link.trim() !== "";
  linkEl.textContent = hasLink ? t.link : "Tidak ada link produk";
  linkEl.classList.toggle("is-empty", !hasLink);

  $("#buy-modal").hidden = false;
  $("#btn-later").focus(); // fokus ke tombol paling aman, bukan Buy
}

function closeModal() {
  activeTimerId = null;
  $("#buy-modal").hidden = true;
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll(".btn-modal").forEach((b) => { b.disabled = value; });
}

function removeTimer(id) {
  timersData = timersData.filter((t) => String(t.id) !== String(id));
  lastSignature = null; // paksa render ulang
  tick();
}

/* ================= AKSI: NOPE / LATER / BUY ================= */

// Nope = skip. Uang tidak jadi keluar, dicatat sebagai penghematan.
async function handleNope() {
  const t = findTimer(activeTimerId);
  if (!t || busy) return;

  setBusy(true);
  try {
    const r = await sendAction(t, "skipped");
    if (r.redirected) return;
    if (!r.ok) return alert(r.message || "Gagal memproses skip.");

    const saved = store.get("lemon_savings", []);
    saved.push({ name: t.name, price: t.price, date: Date.now() });
    store.set("lemon_savings", saved);

    removeTimer(t.id);
    closeModal();
  } catch (err) {
    console.error("Error saat Nope:", err);
    alert("Tidak bisa terhubung ke server.");
  } finally {
    setBusy(false);
  }
}

// Later = tutup popup. Item tetap ada di "Still wanna buy?" dan bisa diputuskan nanti.
function handleLater() {
  if (!busy) closeModal();
}

// Buy = tandai dibeli, kurangi budget, lalu buka link produk.
async function handleBuy() {
  const t = findTimer(activeTimerId);
  if (!t || busy) return;

  // Tab baru dibuka SEKARANG (masih di dalam klik user), baru diarahkan setelah server OK.
  // Kalau window.open dipanggil setelah await, popup-blocker sering memblokirnya.
  const url = normalizeUrl(t.link);
  const tab = url ? window.open("about:blank", "_blank") : null;
  if (tab) tab.opener = null;

  setBusy(true);
  try {
    const r = await sendAction(t, "bought");
    if (r.redirected) { if (tab) tab.close(); return; }
    if (!r.ok) {
      if (tab) tab.close();
      return alert(r.message || "Gagal memproses pembelian.");
    }

    // Riwayat belanja (dibaca halaman Home)
    const history = store.get("lemon_history", []);
    history.unshift({
      category: t.name,
      name: t.name,
      amount: t.price,
      date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    });
    store.set("lemon_history", history);

    // Kurangi budget: dicatat sebagai pengeluaran kategori "shopping"
    // (sisa budget = budget - total spending, lihat finance.js)
    await recordSpending(t);

    removeTimer(t.id);
    closeModal();

    if (url) {
      if (tab) tab.location.href = url;   // tab yang tadi dibuka
      else window.location.href = url;    // popup diblokir -> pindah di tab ini
    }
  } catch (err) {
    console.error("Error saat Buy:", err);
    if (tab) tab.close();
    alert("Tidak bisa terhubung ke server.");
  } finally {
    setBusy(false);
  }
}

async function recordSpending(t) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/spending`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ category: "shopping", price: t.price, date: todayYMD() }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.warn("Gagal mencatat spending:", err);
    alert("Pembelian tercatat, tetapi budget gagal diperbarui. Tambahkan manual di halaman Savings ya.");
  }
}

/* ================= INIT ================= */

function bindEvents() {
  // Klik item di "Still wanna buy?" -> buka popup (delegasi, karena kartu dibuat ulang)
  $("#timeup-list").addEventListener("click", (e) => {
    const card = e.target.closest(".timeup-card");
    if (card) openModal(card.dataset.id);
  });

  $("#btn-nope").addEventListener("click", handleNope);
  $("#btn-later").addEventListener("click", handleLater);
  $("#btn-buy").addEventListener("click", handleBuy);

  // Klik area gelap di luar popup = Later
  $("#buy-modal").addEventListener("click", (e) => {
    if (e.target.id === "buy-modal") handleLater();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#buy-modal").hidden) handleLater();
  });
}

async function reload() {
  await fetchTimers();
  if (loadFailed) return showLoadError();
  lastSignature = null;
  tick();
}

async function initLemonPause() {
  renderNav("timer");
  bindEvents();
  await reload();
  setInterval(tick, 1000);
}

// Paling bawah: semua const/let di atas sudah terinisialisasi.
if (currentUser) initLemonPause();