/* Helper Functions & State Data Global */

// Cek login: kembalikan data user, atau arahkan ke halaman login
function requireLogin() {
  try {
    const u = JSON.parse(localStorage.getItem('currentUser'));
    if (u) return u;
  } catch {}
  window.location.replace("loginpage.html");
  return null;
}

// Keluar akun (bisa dipanggil dari halaman Profile nanti)
function logout() {
  try { localStorage.removeItem('currentUser'); } catch {}
  window.location.href = "loginpage.html";
}

// Mock Data User (Dapat disesuaikan dengan data riil)
const USER = {
  name: "Username",
  balance: 5000000,
};

// Utility Selector & Formatter
const $ = (selector) => document.querySelector(selector);

const rp = (amount) => "Rp." + Math.round(amount).toLocaleString("id-ID") + ",-";

const esc = (str) =>
  String(str).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char])
  );

/* Helper Local Storage Wrapper */
const store = {
  get(key, fallback) {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  },
};

// Shorthand Getter & Setter Timer
const getTimers = () => store.get("lemon_timers", []);
const saveTimers = (timers) => store.set("lemon_timers", timers);

/**
 * Render Navbar Otomatis ke dalam elemen `.phone`
 * @param {"home" | "savings" | "timer" | "profile"} active
 */
function renderNav(active) {
  const items = [
    [
      "home",
      "Home",
      "homepage.html",
      '<path d="M7 19L20 7l13 12v14H7z" stroke-linejoin="round"/><path d="M16 33V23h8v10"/>',
    ],
    [
      "savings",
      "Savings",
      "savings.html",
      '<path d="M15 8h10l-2 5c6 3 9 8 9 14 0 4-3 6-7 6H15c-4 0-7-2-7-6 0-6 3-11 9-14z" fill="#fff" stroke-linejoin="round"/><text x="20" y="28" font-size="12" text-anchor="middle" fill="#000" stroke="none" font-weight="700">$</text>',
    ],
    [
      "timer",
      "Timer",
      "lemonpause.html",
      '<circle cx="20" cy="23" r="12"/><path d="M16 6h8M20 23l6-7M32 10l3-3" stroke-linecap="round"/>',
    ],
    [
      "profile",
      "Profile",
      "profile.html",
      '<circle cx="20" cy="20" r="14" fill="#fff"/><circle cx="20" cy="16" r="5.5" fill="#000"/><path d="M9 31c2-6 6-8 11-8s9 2 11 8c-3 3-7 5-11 5s-8-2-11-5z" fill="#000"/>',
    ],
  ];

  const nav = document.createElement("nav");
  nav.className = "nav";
  nav.setAttribute("aria-label", "Navigasi utama");

  nav.innerHTML = items
    .map(
      ([id, label, href, svg]) => `
        <a href="${href}" ${id === active ? 'aria-current="page"' : ""} ${
          href === "#" ? 'title="Halaman belum dibuat"' : ""
        }>
          <svg viewBox="0 0 40 40" fill="none" stroke="#000" stroke-width="2">${svg}</svg>
          ${label}
        </a>`
    )
    .join("");

  // Cegah perpindahan untuk tautan dummy ("#")
  nav.querySelectorAll('a[href="#"]').forEach((a) =>
    a.addEventListener("click", (e) => e.preventDefault())
  );

  const phoneContainer = $(".phone");
  if (phoneContainer) {
    phoneContainer.appendChild(nav);
  }
}