/* Khusus Halaman Home */
const MAX_SIDE = 400;      // sisi terpanjang gambar (px)
let imageDataUrl = "";

const currentUser = requireLogin();
if (currentUser) initHome();

const DEFAULT_PURCHASES = [
  { category: "Food", date: "16 December 2025", amount: 1000000 },
  { category: "Food", date: "7 December 2025", amount: 700000 },
  { category: "Food", date: "29 November 2025", amount: 30000 },
];

function initHome() {
  renderNav("home");
  $("#username").textContent = currentUser.username;
  $("#balance").textContent = rp(USER.balance);
  $("#image-input").addEventListener("change", onImagePicked);
  $("#search-form").addEventListener("submit", onSubmit);
  renderRecentPurchases();
}

function renderRecentPurchases() {
  const container = $("#recent-purchases-list");
  if (!container) return;

  const purchases = store.get("lemon_history", DEFAULT_PURCHASES);
  const items = Array.isArray(purchases) && purchases.length ? purchases.slice(0, 3) : DEFAULT_PURCHASES;

  container.innerHTML = items
    .map((item) => {
      const priceText = typeof item.amount === "number"
        ? `Rp ${item.amount.toLocaleString("id-ID")}`
        : typeof item.price === "number"
        ? `Rp ${item.price.toLocaleString("id-ID")}`
        : item.amount || item.price || "Rp 0";

      return `
        <div class="purchase-row">
          <span class="p-category">${esc(item.category || item.name || "Food")}</span>
          <span class="p-date">${esc(item.date || "Today")}</span>
          <span class="p-amount">${esc(priceText)}</span>
        </div>
      `;
    })
    .join("");
}

/* Perkecil gambar dulu: foto HP bisa beberapa MB, sedangkan localStorage hanya ~5 MB */
function fileToSmallDataUrl(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(blobUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error("Gambar tidak bisa dibaca.")); };
    img.src = blobUrl;
  });
}

async function onImagePicked(e) {
  const err = $("#search-error");
  const file = e.target.files[0];
  err.textContent = "";
  imageDataUrl = "";
  $("#image-preview").hidden = true;
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    err.style.color = "var(--red)";
    err.textContent = "File harus berupa gambar.";
    return;
  }
  try {
    imageDataUrl = await fileToSmallDataUrl(file);
    const preview = $("#image-preview");
    preview.src = imageDataUrl;
    preview.hidden = false;
  } catch (error) {
    err.style.color = "var(--red)";
    err.textContent = error.message;
  }
}

function onSubmit(e) {
  e.preventDefault();
  const err = $("#search-error");
  err.style.color = "var(--red)";
  err.textContent = "";

  let url;
  try {
    url = new URL($("#link-input").value.trim());
    if (!/^https?:$/.test(url.protocol)) throw new Error("Invalid protocol");
  } catch {
    err.textContent = "Link tidak valid. Tempel link lengkap, misalnya https://...";
    return;
  }

  // Mau gambar wajib? Hapus tanda komentar di bawah:
  //if (!imageDataUrl) { err.textContent = "Tambahkan gambar barang dulu."; return; }

  store.set("lemon_current", {
    id: Date.now(),
    link: url.href,
    merchant: url.hostname.replace(/^www\./, ""),
    imageUrl: imageDataUrl,
  });
  window.location.href = "productdesc.html";
}