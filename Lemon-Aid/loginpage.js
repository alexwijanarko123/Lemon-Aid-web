const form = document.querySelector('form');
const errorMessage = document.getElementById('errorMessage');

if (form && errorMessage) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorMessage.textContent = "";

    const usernameInput = (document.getElementById('username')?.value || "").trim().toLowerCase();
    const emailInput = (document.getElementById('email')?.value || "").trim().toLowerCase();
    const password = document.getElementById('password')?.value || "";

    // Kolom wajib terisi
    if ((!usernameInput && !emailInput) || !password) {
      errorMessage.textContent = "Isi username/email dan password.";
      return;
    }

    const user = loadUsers().find((u) =>
      ((usernameInput && (u.username || "").toLowerCase() === usernameInput) ||
       (emailInput && (u.email || "").toLowerCase() === emailInput)) &&
      u.password === password
    );

    if (!user) {
      errorMessage.textContent = "Username/Email atau Password salah!";
      return;
    }

    // Simpan siapa yang login (TANPA password)
    try {
      localStorage.setItem('currentUser', JSON.stringify({
        username: user.username,
        email: user.email,
      }));
    } catch {
      errorMessage.textContent = "Tidak bisa menyimpan sesi. Cek pengaturan browser.";
      return;
    }

    window.location.href = "homepage.html";
  });
}

function loadUsers() {
  try {
    const data = JSON.parse(localStorage.getItem('registeredUsers'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}