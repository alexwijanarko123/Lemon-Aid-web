/* Data keuangan + helper. Muat SETELAH navbar.js dan SEBELUM profile.js / savings.js */
const FINANCE_DEFAULTS = {
  income: 10000000,
  budget: 3000000,
  target: 13000000000, // 13 M (miliar)
  spending: { food: 670000, shopping: 650000, others: 445433 }, // data contoh
};

function getSavedTotal() {
  // diisi saat user menekan "Skip" di Lemon Pause (lihat catatan)
  return store.get("lemon_savings", []).reduce((sum, x) => sum + (Number(x.price) || 0), 0);
}

function getFinance() {
  const f = store.get("lemon_finance", {});
  const spending = { ...FINANCE_DEFAULTS.spending, ...(f.spending || {}) };
  const income = Number(f.income) || FINANCE_DEFAULTS.income;
  const budget = Number(f.budget) || FINANCE_DEFAULTS.budget;
  const spent = spending.food + spending.shopping + spending.others;
  return { income, budget, spending, spent, remaining: budget - spent,
           saved: getSavedTotal(), target: FINANCE_DEFAULTS.target };
}

/* Tampilkan / sembunyikan nominal (tombol mata di Profile) */
let hideAmounts = store.get("lemon_hide", false);

function renderAmounts() {
  document.querySelectorAll("[data-amt]").forEach((el) => {
    el.textContent = hideAmounts ? "Rp.•••••" : rp(Number(el.dataset.amt));
  });
}
function setHidden(value) {
  hideAmounts = value;
  store.set("lemon_hide", value);
  renderAmounts();
}

/* Isi elemen berdasarkan id: { "f-income": angka, ... } */
function fillAmounts(map) {
  Object.entries(map).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.dataset.amt = value;
  });
  renderAmounts();
}
function fillFinance(f) {
  fillAmounts({ "f-income": f.income, "f-budget": f.budget, "f-remaining": f.remaining, "s-saved": f.saved });
}