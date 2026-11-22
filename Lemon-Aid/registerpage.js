const form = document.querySelector('form');
const errorMessage = document.getElementById('errorMessage');

if (form && errorMessage) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMessage.textContent = "";

    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // 1. Validasi Input
    if (!username || !email || !password || !confirmPassword) {
      return showError("Please fill in all fields.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return showError("Please enter a valid email address.");
    }
    if (password.length < 8) {
      return showError("Password must be at least 8 characters long.");
    }
    if (password !== confirmPassword) {
      return showError("Passwords do not match.");
    }

    // 2. Kirim ke Server Database
    try {
      const BACKEND_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? "http://localhost:3000"
        : "https://lemon-aid-web-server.vercel.app";

      const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        return showError(data.message || "Gagal mendaftar.");
      }

      alert("Registrasi berhasil! Silakan login.");
      window.location.href = "loginpage.html";
    } catch (err) {
      showError("Tidak dapat terhubung ke server database.");
    }
  });
}

function showError(message) {
  errorMessage.textContent = message;
}