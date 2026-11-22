/* Khusus halaman Savings — terhubung ke MySQL */
const currentUser = requireLogin();
if (currentUser) initSavings();

const BACKEND_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:3000"
  : "https://lemon-aid-web-server.vercel.app";

async function initSavings() {
  renderNav("savings");

  // 1. Tampilkan data dari cache lokal terlebih dahulu
  updateSavingsUI();

  // 2. Ambil data finance + spending dari Database
  if (currentUser?.id) {
    try {
      const [profileRes, spendingRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/user/profile/${currentUser.id}`),
        fetch(`${BACKEND_URL}/api/spending/${currentUser.id}`),
      ]);

      if (profileRes.ok) {
        const data = await profileRes.json();
        if (data?.finance) {
          const currentFinance = store.get("lemon_finance", {});
          store.set("lemon_finance", {
            ...currentFinance,
            income: Number(data.finance.income) || 0,
            budget: Number(data.finance.budget) || 0,
            target: Number(data.finance.target) || 0,
          });
        }
      }

      if (spendingRes.ok) {
        const spendData = await spendingRes.json();
        if (spendData?.spending) {
          const currentFinance = store.get("lemon_finance", {});
          store.set("lemon_finance", {
            ...currentFinance,
            spending: spendData.spending,
          });
        }
      }

      // Perbarui tampilan dengan data terbaru dari database
      updateSavingsUI();
    } catch (err) {
      console.warn("Tidak dapat mengambil data dari DB:", err);
    }
  }

  // 3. Popup Add Spending
  setupPopup();
}

/* ========== Update UI ========== */
function updateSavingsUI() {
  const f = getFinance();
  fillFinance(f);

  const targetEl = document.getElementById("s-target");
  if (targetEl) {
    targetEl.textContent = rp(f.target);
  }

  const pct = f.target > 0 ? (f.saved / f.target) * 100 : 0;
  const label = pct === 0 ? "0" : pct < 0.01 ? "<0,01" : pct.toFixed(2).replace(".", ",");
  const progressEl = $("#s-progress");
  if (progressEl) {
    progressEl.textContent = `Progress : ${label}%`;
  }

  drawDonut(f.spending);
}

/* ========== Diagram Donat SVG ========== */
function drawDonut(s) {
  const parts = [
    ["Food", s?.food || 0, "#e36a00"],
    ["Shopping", s?.shopping || 0, "#ffb600"],
    ["Others", s?.others || 0, "#93c878"],
  ];
  const total = parts.reduce((sum, p) => sum + p[1], 0) || 1;
  const R = 40, C = 2 * Math.PI * R;
  let offset = 0, svg = "";

  parts.forEach(([, value, color]) => {
    const frac = value / total, len = frac * C;
    svg += `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${color}" stroke-width="22"
      stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"/>`;
    if (frac > 0.05) {
      const mid = ((offset + len / 2) / C) * 2 * Math.PI - Math.PI / 2;
      svg += `<text x="${60 + R * Math.cos(mid)}" y="${60 + R * Math.sin(mid)}">${Math.round(frac * 100)}%</text>`;
    }
    offset += len;
  });

  const donutEl = $("#donut");
  if (donutEl) donutEl.innerHTML = svg;

  const legendEl = $("#legend");
  if (legendEl) {
    legendEl.innerHTML = parts
      .map(([name, , color]) => `<li><i style="background:${color}"></i>${esc(name)}</li>`)
      .join("");
  }
}

/* ========== Pop Up Add Spending ========== */
function setupPopup() {
  const overlay = document.getElementById("popupOverlay");
  const addBtn = document.getElementById("AddSpending");
  const popupAddBtn = document.getElementById("popupAddBtn");
  const priceInput = document.getElementById("spendPrice");
  const dateInput = document.getElementById("spendDate");
  const categorySelect = document.getElementById("spendCategory");

  if (!overlay || !addBtn) return;

  // Set default date ke hari ini
  dateInput.value = new Date().toISOString().split("T")[0];

  // Buka popup
  addBtn.addEventListener("click", () => {
    overlay.classList.add("active");
  });

  // Tutup popup klik di luar box
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.classList.remove("active");
    }
  });

  // Format harga saat diketik
  priceInput.addEventListener("input", (e) => {
    const n = Number(String(e.target.value).replace(/\D/g, "").slice(0, 12)) || 0;
    e.target.value = n ? n.toLocaleString("id-ID") : "";
  });

  // Tombol Add → simpan ke database
  popupAddBtn.addEventListener("click", async () => {
    const category = categorySelect.value;
    const rawPrice = Number(String(priceInput.value).replace(/\D/g, "")) || 0;
    const date = dateInput.value;

    if (!category) return alert("Pilih kategori terlebih dahulu.");
    if (rawPrice <= 0) return alert("Masukkan harga yang valid.");
    if (!date) return alert("Pilih tanggal pengeluaran.");

    popupAddBtn.disabled = true;
    popupAddBtn.textContent = "Menyimpan...";

    try {
      const res = await fetch(`${BACKEND_URL}/api/spending`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          category,
          price: rawPrice,
          date,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(json.message || "Gagal menyimpan pengeluaran.");
        popupAddBtn.disabled = false;
        popupAddBtn.textContent = "Add";
        return;
      }

      // Update spending di localStorage
      const currentFinance = store.get("lemon_finance", {});
      const spending = currentFinance.spending || { food: 0, shopping: 0, others: 0 };
      spending[category] = (spending[category] || 0) + rawPrice;
      store.set("lemon_finance", { ...currentFinance, spending });

      // Perbarui UI
      updateSavingsUI();

      // Reset form & tutup popup
      categorySelect.value = "";
      priceInput.value = "";
      dateInput.value = new Date().toISOString().split("T")[0];
      overlay.classList.remove("active");
      popupAddBtn.disabled = false;
      popupAddBtn.textContent = "Add";
    } catch (err) {
      console.error("Gagal simpan spending:", err);
      alert("Tidak bisa terhubung ke server. Coba lagi.");
      popupAddBtn.disabled = false;
      popupAddBtn.textContent = "Add";
    }
  });
}
