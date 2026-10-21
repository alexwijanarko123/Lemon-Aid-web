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

  // 1. Pre-fill Username & Gender
  usernameInput.value = currentUser.username || "";

  const users = store.get("registeredUsers", []);
  const currentUserRecord = users.find((u) => u.email === currentUser.email);
  if (currentUserRecord?.gender) {
    const genderRadio = document.querySelector(`input[name="gender"][value="${currentUserRecord.gender}"]`);
    if (genderRadio) genderRadio.checked = true;
  }

  // 2. Pre-fill Financial Data
  const f = getFinance();
  if (f.income > 0) incomeInput.value = f.income.toLocaleString("id-ID");
  if (f.budget > 0) budgetInput.value = f.budget.toLocaleString("id-ID");
  if (f.target > 0) targetInput.value = f.target.toLocaleString("id-ID");

  // 3. Form Submit Handler
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errorEl.textContent = "";

    const newUsername = usernameInput.value.trim();
    const genderInput = document.querySelector('input[name="gender"]:checked');
    const newGender = genderInput ? genderInput.value : "";
    const userIncome = parsePrice(incomeInput.value);
    const userBudget = parsePrice(budgetInput.value);
    const userTarget = parsePrice(targetInput.value);

    // Validations
    if (!newUsername) {
      errorEl.textContent = "Username tidak boleh kosong.";
      return;
    }

    // Check if new username is taken by another account
    const allUsers = store.get("registeredUsers", []);
    const usernameTaken = allUsers.some(
      (u) => u.email !== currentUser.email && u.username.toLowerCase() === newUsername.toLowerCase()
    );

    if (usernameTaken) {
      errorEl.textContent = "Username ini sudah digunakan oleh akun lain.";
      return;
    }

    if (userBudget > userIncome && userIncome > 0) {
      errorEl.textContent = "Spending budget tidak boleh melebihi monthly income.";
      return;
    }

    // 4. Save Financial Data to localStorage (lemon_finance)
    const currentFinance = store.get("lemon_finance", {});
    store.set("lemon_finance", {
      ...currentFinance,
      income: userIncome,
      budget: userBudget,
      target: userTarget,
    });

    // 5. Update registeredUsers list
    const userIndex = allUsers.findIndex((u) => u.email === currentUser.email);
    if (userIndex !== -1) {
      allUsers[userIndex].username = newUsername;
      if (newGender) allUsers[userIndex].gender = newGender;
      store.set("registeredUsers", allUsers);
    }

    // 6. Update currentUser session
    store.set("currentUser", {
      ...currentUser,
      username: newUsername,
      gender: newGender || currentUser.gender,
    });

    // 7. Return to Profile Page
    window.location.href = "profile.html";
  });
}