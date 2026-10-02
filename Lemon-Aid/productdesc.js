/* Khusus Halaman Product Desc */
const DURATIONS = [
  ["1 Hour", 1 * 3600], ["3 Hours", 3 * 3600],
  ["12 Hours", 12 * 3600], ["24 Hours", 24 * 3600],
  ["3 Days", 3 * 86400], ["1 Week", 7 * 86400],
];

const currentUser = requireLogin();
const product = store.get("lemon_current", null);   // {id, link, merchant, imageUrl}
let chosenSeconds = null;

if (currentUser) {
  if (!product) window.location.replace("homepage.html");
  else initProduct();
}

function initProduct() {
  $("#p-link").textContent = product.link;
  renderImage(product.imageUrl);
  buildDurations();

  $("#p-name-input").addEventListener("input", onFormChange);
  $("#p-price-input").addEventListener("input", (e) => {
    const n = parsePrice(e.target.value);
    e.target.value = n ? n.toLocaleString("id-ID") : "";   // 1250000 -> 1.250.000
    onFormChange();
  });
  $("#ai-btn").addEventListener("click", askAI);
  $("#buy-anyway").addEventListener("click", () =>
    window.open(product.link, "_blank", "noopener,noreferrer"));
  $("#set-timer").addEventListener("click", setTimer);
  onFormChange();
}

/* ---------- Form nama & harga ---------- */
// Fungsi biasa (bukan const) supaya aman dipanggil dari bagian atas file
function parsePrice(text) {
  return Number(String(text).replace(/\D/g, "").slice(0, 12)) || 0;
}

function readForm() {
  const name = $("#p-name-input").value.trim();
  const price = parsePrice($("#p-price-input").value);
  return name && price > 0 ? { name, price } : null;
}

function onFormChange() {
  const price = parsePrice($("#p-price-input").value);
  const balance = USER?.balance || 1;
  $("#p-cost").textContent = price > 0
    ? `Cost Percentage : ${((price / balance) * 100).toFixed(1).replace(".", ",")}%`
    : "Cost Percentage : ...%";
  $("#ai-btn").disabled = !readForm();
  $("#insight").hidden = true;          // pendapat lama tidak berlaku untuk data baru
  refreshSetTimer();
}

function refreshSetTimer() {
  $("#set-timer").disabled = !(readForm() && chosenSeconds);
}

/* ---------- Gambar (hanya data:image dari Home) ---------- */
function renderImage(src) {
  if (!src || !src.startsWith("data:image/")) return;
  const box = document.querySelector(".pimg");
  const img = document.createElement("img");
  img.src = src;
  img.alt = "Foto barang";
  box.textContent = "";
  box.appendChild(img);
}

/* ---------- Pendapat AI (hanya dari nama + harga) ---------- */
async function askAI() {
  const data = readForm();
  if (!data) return;
  const btn = $("#ai-btn");
  const msg = $("#ai-error");
  btn.disabled = true;
  btn.textContent = "Menganalisis...";
  msg.textContent = "";

  try {
    const res = await fetch("/api/analyze-product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: data.name, price: data.price, merchant: product.merchant || "" }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.analysis) throw new Error(json.message || "Gagal meminta pendapat AI.");
    renderInsight(json.analysis);
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    btn.textContent = "Minta pendapat AI";
    btn.disabled = !readForm();
  }
}

function renderInsight(a) {
  $("#ai-summary").textContent = a.summary || "Tidak ada ringkasan analisis.";
  $("#ai-reco").textContent = a.recommendation || "N/A";

  const score = Math.min(10, Math.max(0, Number(a.impulseScore) || 0));
  $("#ai-score").textContent = score > 0 ? `${score}/10` : "N/A";
  $("#ai-bar").style.width = `${score * 10}%`;
  $("#ai-bar").dataset.level = score >= 7 ? "high" : score >= 4 ? "mid" : "low";

  fillList($("#ai-pros"), a.pros);
  fillList($("#ai-cons"), a.cons);
  $("#insight").hidden = false;
}

function fillList(ul, items) {
  ul.textContent = "";
  (Array.isArray(items) && items.length ? items : ["-"]).forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    ul.appendChild(li);
  });
}

/* ---------- Durasi & Set Timer ---------- */
function buildDurations() {
  const box = $("#times");
  DURATIONS.forEach(([label, secs]) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.setAttribute("aria-pressed", "false");
    btn.onclick = () => {
      chosenSeconds = secs;
      box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === btn));
      refreshSetTimer();
    };
    box.appendChild(btn);
  });
}

function setTimer() {
  const data = readForm();
  if (!data || !chosenSeconds) return;

  const timers = getTimers() || [];
  timers.push({
    id: product.id,
    name: data.name,
    price: data.price,
    link: product.link,
    imageUrl: product.imageUrl || "",
    reason: ($("#p-reason")?.value || "").trim(),
    endsAt: Date.now() + chosenSeconds * 1000,
  });
  saveTimers(timers);
  store.remove("lemon_current");
  window.location.href = "lemonpause.html";
}