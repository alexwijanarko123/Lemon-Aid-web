/* Khusus Halaman Change Password */
const currentUser = requireLogin();
if (currentUser) initChangePassword();

function initChangePassword() {
  const form = document.getElementById("change-password-form");
  const errorEl = document.getElementById("errorMessage");
  const currentPasswordInput = document.getElementById("current-password");
  const newPasswordInput = document.getElementById("new-password");
  const confirmPasswordInput = document.getElementById("confirm-password");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.textContent = "";

    const currentPassword = currentPasswordInput?.value || "";
    const newPassword = newPasswordInput?.value || "";
    const confirmPassword = confirmPasswordInput?.value || "";

    // 1. Validasi Input Form
    if (!currentPassword || !newPassword || !confirmPassword) {
      if (errorEl) errorEl.textContent = "Semua kolom password wajib diisi.";
      return;
    }

    if (newPassword.length < 8) {
      if (errorEl) errorEl.textContent = "Password baru minimal harus 8 karakter.";
      return;
    }

    if (newPassword !== confirmPassword) {
      if (errorEl) errorEl.textContent = "Konfirmasi password baru tidak cocok.";
      return;
    }

    if (currentPassword === newPassword) {
      if (errorEl) errorEl.textContent = "Password baru tidak boleh sama dengan password lama.";
      return;
    }

    // 2. Kirim ke Database MySQL jika ada sesi user ID
    if (currentUser?.id) {
      try {
        const BACKEND_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
          ? "http://localhost:3000"
          : "https://lemon-aid-web-server.vercel.app";

        const res = await fetch(`${BACKEND_URL}/api/auth/change-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: currentUser.id,
            currentPassword,
            newPassword,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          if (errorEl) errorEl.textContent = data.message || "Gagal mengubah password.";
          return;
        }

        alert("Password berhasil diubah!");
        window.location.href = "editprofile.html";
        return;
      } catch (err) {
        if (errorEl) errorEl.textContent = "Tidak dapat terhubung ke server database.";
        return;
      }
    }

    // Fallback lokal jika user offline/demo tanpa ID database
    const users = store.get("registeredUsers", []);
    const userIndex = users.findIndex((u) => u.email === currentUser.email);

    if (userIndex !== -1) {
      if (users[userIndex].password !== currentPassword) {
        if (errorEl) errorEl.textContent = "Current Password yang Anda masukkan salah!";
        return;
      }
      users[userIndex].password = newPassword;
      store.set("registeredUsers", users);
    }

    alert("Password berhasil diubah!");
    window.location.href = "editprofile.html";
  });
}
