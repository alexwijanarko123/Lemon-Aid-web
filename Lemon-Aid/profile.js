/* Khusus halaman Profile */
const currentUser = requireLogin();
if (currentUser) initProfile();

function initProfile() {
  renderNav("profile");
  $("#username").textContent = currentUser.username;
  fillFinance(getFinance());

  const eye = $("#eye");
  const syncEye = () => {
    eye.setAttribute("aria-pressed", String(hideAmounts));
    eye.setAttribute("aria-label", hideAmounts ? "Tampilkan nominal uang" : "Sembunyikan nominal uang");
  };
  syncEye();
  eye.addEventListener("click", () => { setHidden(!hideAmounts); syncEye(); });

  $("#logout").addEventListener("click", logout);

  // Menu "More" belum punya halaman: cegah pindah sampai halamannya dibuat
  document.querySelectorAll('.menu a[href="#"]').forEach((a) =>
    a.addEventListener("click", (e) => e.preventDefault())
  );
}