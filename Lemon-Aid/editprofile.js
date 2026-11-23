/* Khusus Halaman Edit Profile */
const currentUser = requireLogin();
if (currentUser) initEditProfile();

function parsePrice(text) {
  return Number(String(text).replace(/\D/g, "").slice(0, 14)) || 0;
}

function formatNumberInput(inputEl) {
  inputEl.addEventListener("input", (e) => {
    const val = parsePrice(e.target.value);
    e.target.value = val ? val.toLocaleString("id-ID") : "";
  });
}

function initEditProfile() {
  renderNav("profile");

  const form = document.getElementById("edit-form");
  const errorEl = document.getElementById("errorMessage");
  const usernameInput = document.getElementById("username");
  const incomeInput = document.getElementById("income");
  const budgetInput = document.getElementById("budget");
  const targetInput = document.getElementById("target");

  // Format currency fields as user types
  formatNumberInput(incomeInput);
  formatNumberInput(budgetInput);
  formatNumberInput(targetInput);

  // 1. Pre-fill Username 
  usernameInput.value = currentUser.username || "";

  // 2. Pre-fill Financial Data
  const f = getFinance();
  if (f.income > 0) incomeInput.value = f.income.toLocaleString("id-ID");
  if (f.budget > 0) budgetInput.value = f.budget.toLocaleString("id-ID");
  if (f.target > 0) targetInput.value = f.target.toLocaleString("id-ID");

  // Ambil data terbaru langsung dari Database MySQL jika user memiliki ID
  if (currentUser?.id) {
    const BACKEND_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "http://localhost:3000"
      : "https://lemon-aid-web-server.vercel.app";

    fetch(`${BACKEND_URL}/api/user/profile/${currentUser.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;

        if (data.user?.username) usernameInput.value = data.user.username;

        if (data.finance) {
          if (Number(data.finance.income) > 0) incomeInput.value = Number(data.finance.income).toLocaleString("id-ID");
          if (Number(data.finance.budget) > 0) budgetInput.value = Number(data.finance.budget).toLocaleString("id-ID");
          if (Number(data.finance.target) > 0) targetInput.value = Number(data.finance.target).toLocaleString("id-ID");
        }
      })
      .catch((err) => console.warn("Tidak dapat mengambil profil dari DB:", err));
  }

  // 3. Handler Tombol Change Password
  const changePasswordBtn = document.querySelector(".change_password") || document.getElementById("cancelBtn") || document.getElementById("changePasswordBtn");
  if (changePasswordBtn) {
    changePasswordBtn.addEventListener("click", () => {
      window.location.href = "changepassword.html";
    });
  }

  // 4. Form Submit Handler
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";

    const newUsername = usernameInput.value.trim();
    const userIncome = parsePrice(incomeInput.value);
    const userBudget = parsePrice(budgetInput.value);
    const userTarget = parsePrice(targetInput.value);

    // Validations
    if (!newUsername) {
      errorEl.textContent = "Username tidak boleh kosong.";
      return;
    }

    if (userBudget > userIncome && userIncome > 0) {
      errorEl.textContent = "Spending budget tidak boleh melebihi monthly income.";
      return;
    }

    // 4. Kirim pembaruan ke Database MySQL jika ada koneksi/ID
    if (currentUser?.id) {
      try {
        const BACKEND_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
          ? "http://localhost:3000"
          : "https://lemon-aid-web-server.vercel.app";

        const res = await fetch(`${BACKEND_URL}/api/user/profile`, {
          method: "POST",
          headers:  authHeaders(),
          body: JSON.stringify({
            userId: currentUser.id,
            username: newUsername,
            income: userIncome,
            budget: userBudget,
            target: userTarget,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          errorEl.textContent = data.message || "Gagal memperbarui profil di server.";
          return;
        }
      } catch (err) {
        console.warn("Koneksi server gagal, menyimpan secara lokal:", err);
      }
    }

    // 5. Save Financial Data to localStorage (lemon_finance)
    const currentFinance = store.get("lemon_finance", {});
    store.set("lemon_finance", {
      ...currentFinance,
      income: userIncome,
      budget: userBudget,
      target: userTarget,
    });

    // 6. Update registeredUsers list (fallback lokal)
    const allUsers = store.get("registeredUsers", []);
    const userIndex = allUsers.findIndex((u) => u.email === currentUser.email);
    if (userIndex !== -1) {
      allUsers[userIndex].username = newUsername;
      store.set("registeredUsers", allUsers);
    }

    // 7. Update currentUser session
    store.set("currentUser", {
      ...currentUser,
      username: newUsername,
    });

    // 8. Return to Profile Page
    window.location.href = "profile.html";
  });
}