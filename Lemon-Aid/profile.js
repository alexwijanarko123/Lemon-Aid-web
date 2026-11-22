/* Khusus halaman Profile */
const currentUser = requireLogin();
if (currentUser) initProfile();

function initProfile() {
  renderNav("profile");

  // Tampilkan data user dari sesi aktif
  $("#username").textContent = currentUser.username || "User";
  $("#email").textContent = currentUser.email || "";

  // Ambil data terbaru langsung dari Database MySQL jika user memiliki ID
  if (currentUser?.id) {
    const BACKEND_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "http://localhost:3000"
      : "https://lemon-aid-web-server.vercel.app";

    fetch(`${BACKEND_URL}/api/user/profile/${currentUser.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.user) return;

        if (data.user.username) {
          $("#username").textContent = data.user.username;
        }
        if (data.user.email) {
          $("#email").textContent = data.user.email;
        }

        store.set("currentUser", {
          ...currentUser,
          username: data.user.username || currentUser.username,
          email: data.user.email || currentUser.email,
          gender: data.user.gender,
        });
      })
      .catch((err) => console.warn("Tidak dapat mengambil profil dari DB:", err));
  }

  // Logout handler
  $("#logout").addEventListener("click", logout);

  // Upgrade banner click
  $("#upgrade-plan")?.addEventListener("click", (e) => {
    e.preventDefault();
    alert("Fitur Upgrade plan akan segera hadir!");
  });
}
