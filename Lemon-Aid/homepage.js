/* Khusus Halaman Home */
const currentUser = requireLogin();
if (currentUser) initHome();

const DEFAULT_PURCHASES = [
];

function initHome() {
  renderNav("home");
  $("#username").textContent = currentUser.username;

  // Ambil saldo dari data keuangan yang diinput user
  const f = typeof getFinance === "function" ? getFinance() : store.get("lemon_finance", {});
  const userBalance = Number.isFinite(f.remaining) ? f.remaining : (Number(f.budget) || Number(f.income) || 0);
  $("#balance").textContent = rp(userBalance);

  // Tombol YES → redirect ke productdesc.html
  $("#search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    store.set("lemon_current", {
      id: Date.now(),
      link: "",
      merchant: "",
      imageUrl: "",
    });
    window.location.href = "AI_insight.html";
  });

  renderRecentPurchases();
}

function renderRecentPurchases() {
  const container = $("#recent-purchases-list");
  if (!container) return;

  const purchases = store.get("lemon_history", DEFAULT_PURCHASES);
  const items = Array.isArray(purchases) && purchases.length ? purchases.slice(0, 3) : DEFAULT_PURCHASES;

  container.innerHTML = items
    .map((item) => {
      const priceText = typeof item.amount === "number"
        ? `Rp ${item.amount.toLocaleString("id-ID")}`
        : typeof item.price === "number"
        ? `Rp ${item.price.toLocaleString("id-ID")}`
        : item.amount || item.price || "Rp 0";

      return `
        <div class="purchase-row">
          <span class="p-category">${esc(item.category || item.name || "Food")}</span>
          <span class="p-date">${esc(item.date || "Today")}</span>
          <span class="p-amount">${esc(priceText)}</span>
        </div>
      `;
    })
    .join("");
}