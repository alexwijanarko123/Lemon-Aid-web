/* Khusus Halaman Lemon Pause */

// Inisialisasi Navigasi & Data Timer
renderNav("timer");

let timers = getTimers() || [];

/**
 * Format sisa waktu (milidetik) ke teks yang mudah dibaca.
 */
function fmt(ms) {
  let s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  s %= 3600;
  const m = Math.floor(s / 60);

  const out = [];
  if (d) out.push(`${d} ${d > 1 ? "Days" : "Day"}`);
  if (h || d) out.push(`${h} ${h > 1 ? "Hours" : "Hour"}`);
  if (!d) out.push(`${m} Minutes`);

  return out.map((t) => `<b>${t}</b>`).join(" ");
}

/**
 * Template card produk (Time Up & Waiting)
 */
function card(t, done) {
  const body = done
    ? `<div class="tleft"><b>Time Up</b></div>
       <div class="go">
         <button class="btn-red" data-buy="${t.id}">Buy</button>
         <button class="btn-grey" data-drop="${t.id}">Skip</button>
       </div>`
    : `<div class="tleft">${fmt(t.endsAt - Date.now())}</div>`;

  const imageHtml = t.imageUrl
    ? `<img src="${esc(t.imageUrl)}" alt="${esc(t.name)}" class="pimg-img" />`
    : `<div class="pimg">Product image here</div>`;

  return `
    <div class="item">
      ${imageHtml}
      <div class="meta">
        <div>${esc(t.name)}</div>
        <div>${rp(t.price).replace(",-", "")}</div>
        ${body}
      </div>
    </div>
  `;
}

/**
 * Render list produk yang "Time Up" dan "Waiting"
 */
function render() {
  const now = Date.now();
  const done = timers.filter((t) => t.endsAt <= now);
  const wait = timers.filter((t) => t.endsAt > now).sort((a, b) => a.endsAt - b.endsAt);

  const timeupList = $("#timeup-list");
  const waitingList = $("#waiting-list");

  if (timeupList) {
    timeupList.innerHTML = done.length
      ? done.map((t) => card(t, true)).join("")
      : `<p class="empty">Belum ada produk yang waktunya habis.</p>`;
  }

  if (waitingList) {
    waitingList.innerHTML = wait.length
      ? wait.map((t) => card(t, false)).join("")
      : `<p class="empty">Belum ada timer. Cari produk di Home dulu.</p>`;
  }
}

/* Event Handler: Tombol Buy / Skip pada produk Time Up */
document.addEventListener("click", (e) => {
  const buyId = e.target.dataset.buy;
  const dropId = e.target.dataset.drop;

  if (buyId) {
    const item = timers.find((x) => String(x.id) === String(buyId));
    if (item?.link) {
      window.open(item.link, "_blank", "noopener,noreferrer");
    }
  }

  if (dropId) {
  // Catat harga produk yang di-Skip sebagai uang yang berhasil dihemat
  const dropped = timers.find((x) => String(x.id) === String(dropId));
  if (dropped) {
    const saved = store.get("lemon_savings", []);
    saved.push({ name: dropped.name, price: dropped.price, date: Date.now() });
    store.set("lemon_savings", saved);
  }

  timers = timers.filter((x) => String(x.id) !== String(dropId));
  saveTimers(timers);
  render();
  }
});

// Render awal & update timer otomatis
render();
setInterval(render, 30000); // Perbarui hitung mundur tiap 30 detik