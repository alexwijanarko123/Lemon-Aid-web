/* Khusus Halaman Onboarding / Complete Profile (Financial Info Only) */
const currentUser = requireLogin();
if (currentUser) initCompleteProfile();

function parsePrice(text) {
  return Number(String(text).replace(/\D/g, "").slice(0, 14)) || 0;
}

function formatNumberInput(inputEl) {
  if (!inputEl) return;
  inputEl.addEventListener("input", (e) => {
    const val = parsePrice(e.target.value);
    e.target.value = val ? val.toLocaleString("id-ID") : "";
  });
}

function initCompleteProfile() {
  const filled = typeof getFinance === "function" ? getFinance() : store.get("lemon_finance", {});
  if (filled.income > 0 && filled.budget > 0) {
    window.location.replace("homepage.html");
    return;
  }
  const form = document.getElementById("profileForm");
  const errorEl = document.getElementById("errorMessage");
  const incomeInput = document.getElementById("income");
  const budgetInput = document.getElementById("budget");
  const targetInput = document.getElementById("target");

  // Format angka rupiah otomatis saat user mengetik (e.g. 5000000 -> 5.000.000)
  formatNumberInput(incomeInput);
  formatNumberInput(budgetInput);
  formatNumberInput(targetInput);

  // Jika sebelumnya sudah ada data tersimpan, tampilkan sebagai nilai awal
  const f = typeof getFinance === "function" ? getFinance() : store.get("lemon_finance", {});
  if (f.income > 0) incomeInput.value = f.income.toLocaleString("id-ID");
  if (f.budget > 0) budgetInput.value = f.budget.toLocaleString("id-ID");
  if (f.target > 0) targetInput.value = f.target.toLocaleString("id-ID");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.textContent = "";

    const userIncome = parsePrice(incomeInput.value);
    const userBudget = parsePrice(budgetInput.value);
    const userTarget = parsePrice(targetInput.value);

    // Validasi
    if (userIncome <= 0) {
      if (errorEl) errorEl.textContent = "Mohon masukkan nominal Monthly Income Anda.";
      return;
    }

    if (userBudget > userIncome && userIncome > 0) {
      if (errorEl) errorEl.textContent = "Spending budget tidak boleh melebihi monthly income.";
      return;
    }

    // 1. Simpan ke database MySQL jika user memiliki ID
    if (currentUser?.id) {
      try {
        const BACKEND_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
          ? "http://localhost:3000"
          : "https://lemon-aid-web-server.vercel.app";

        await fetch(`${BACKEND_URL}/api/finance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: currentUser.id,
            income: userIncome,
            budget: userBudget,
            target: userTarget,
          }),
        });
      } catch (err) {
        console.warn("Koneksi server gagal, menyimpan secara lokal:", err);
      }
    }

    // 2. Simpan cache lokal di browser (lemon_finance)
    const currentFinance = store.get("lemon_finance", {});
    store.set("lemon_finance", {
      ...currentFinance,
      income: userIncome,
      budget: userBudget,
      target: userTarget,
    });

    // Setelah submit, langsung diarahkan ke Home Page
    window.location.href = "homepage.html";
  });
}