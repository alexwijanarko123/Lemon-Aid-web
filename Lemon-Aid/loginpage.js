const form = document.querySelector('form');
const errorMessage = document.getElementById('errorMessage');

if (form && errorMessage) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMessage.textContent = "";

    const usernameInput = (document.getElementById('username')?.value || "").trim();
    const emailInput = (document.getElementById('email')?.value || "").trim();
    const password = document.getElementById('password')?.value || "";

    const identifier = usernameInput || emailInput;

    // Kolom wajib terisi
    if (!identifier || !password) {
      errorMessage.textContent = "Isi username/email dan password.";
      return;
    }

    try {
      const BACKEND_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? "http://localhost:3000"
        : "https://lemon-aid-web-server.vercel.app";

      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        errorMessage.textContent = data.message || "Username/Email atau Password salah!";
        return;
      }

      // Simpan sesi login user aktif
      try {
        localStorage.setItem('currentUser', JSON.stringify({
          id: data.user.id,
          username: data.user.username,
          email: data.user.email,
        }));

        // Cek data keuangan khusus akun ini dari database:
        if (data.hasFinance && data.finance) {
          // Akun lama (sudah punya finance di DB) -> simpan ke localStorage dan ke Home
          localStorage.setItem('lemon_finance', JSON.stringify({
            income: Number(data.finance.income) || 0,
            budget: Number(data.finance.budget) || 0,
            target: Number(data.finance.target) || 0,
          }));
          window.location.href = "homepage.html";
        } else {
          // Akun baru (belum ada data di DB) -> HAPUS data finance bekas akun sebelumnya!
          localStorage.removeItem('lemon_finance');
          window.location.href = "completeprofile.html";
        }
      } catch {
        errorMessage.textContent = "Tidak bisa menyimpan sesi. Cek pengaturan browser.";
        return;
      }
    } catch (err) {
      errorMessage.textContent = "Tidak dapat terhubung ke server database.";
    }
  });
}