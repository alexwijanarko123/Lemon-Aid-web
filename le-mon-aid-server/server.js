import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import bcrypt from "bcryptjs";
import { analyzeProduct, AnalysisError } from "./lib/analyze.js";
import { pool } from "./lib/db.js";
import { signToken, requireAuth, optionalAuth } from "./lib/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, process.env.FRONTEND_DIR || "../Lemon-Aid");
const PORT = process.env.PORT || 3000;

const MAX_PRICE = 1e12;
const MAX_TIMER_SECONDS = 60 * 60 * 24 * 30; // maksimal 30 hari

const app = express();

// Di belakang proxy (Vercel, Nginx, dll) set TRUST_PROXY=1 di .env supaya rate limiter
// membaca IP asli user. Jangan diaktifkan kalau server diakses langsung (IP bisa dipalsukan).
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);

// CORS hanya aktif kalau CORS_ORIGIN diset di .env (mis. frontend jalan di domain/port lain).
// Karena frontend disajikan dari server yang sama, default-nya tidak perlu CORS.
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(",").map((s) => s.trim()) }));
}
app.use(express.json({ limit: "10kb" }));

// ================= RATE LIMITER =================

// Tiap request memakai kuota Gemini, jadi dibatasi per IP
const limiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Terlalu banyak permintaan. Coba lagi sebentar lagi." },
});

// Limiter khusus login / register / ganti password (anti brute-force)
const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Terlalu banyak percobaan. Coba lagi sebentar lagi." },
});

// ================= HELPER =================

function isValidDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

async function upsertFinance(userId, { income, budget, target }) {
  const [existing] = await pool.query("SELECT id FROM finance WHERE user_id = ? LIMIT 1", [userId]);
  if (existing.length > 0) {
    await pool.query(
      "UPDATE finance SET income = ?, budget = ?, target = ? WHERE user_id = ?",
      [income, budget, target, userId]
    );
  } else {
    await pool.query(
      "INSERT INTO finance (user_id, income, budget, target) VALUES (?, ?, ?, ?)",
      [userId, income, budget, target]
    );
  }
}

// Angka opsional: kalau tidak dikirim -> pakai nilai lama; kalau dikirim tapi tidak valid -> null
function parseMoney(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > MAX_PRICE) return null;
  return n;
}

// ================= ANALYZE PRODUCT =================

app.post("/api/analyze-product", limiter, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : "";
  const merchant = typeof req.body?.merchant === "string" ? req.body.merchant.trim().slice(0, 100) : "";
  const price = Number(req.body?.price);

  if (!name || !Number.isFinite(price) || price <= 0 || price > MAX_PRICE) {
    return res.status(400).json({ message: "Nama dan harga barang harus diisi dengan benar." });
  }

  try {
    const analysis = await analyzeProduct({ name, price, merchant, description: "" });
    res.json({ analysis });
  } catch (err) {
    if (err instanceof AnalysisError) return res.status(502).json({ message: err.message });
    console.error("[server]", err);
    res.status(500).json({ message: "Terjadi kesalahan di server." });
  }
});

// ================= AUTH API (MySQL) =================

// 1. Register
app.post("/api/auth/register", authLimiter, async (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!username || !email || !password) {
    return res.status(400).json({ message: "Semua kolom wajib diisi." });
  }

  if (username.length > 50) {
    return res.status(400).json({ message: "Username maksimal 50 karakter." });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Format email tidak valid." });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: "Password minimal harus 8 karakter." });
  }

  // bcrypt hanya membaca 72 byte pertama
  if (Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({ message: "Password terlalu panjang (maksimal 72 karakter)." });
  }

  try {
    const [existing] = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(username) = ? LIMIT 1",
      [email, username.toLowerCase()]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: "Username atau email sudah digunakan." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
      [username, email, hashedPassword]
    );

    const user = { id: result.insertId, username, email };

    res.status(201).json({
      message: "Registrasi berhasil!",
      user,
      token: signToken(user),
    });
  } catch (err) {
    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ message: "Username atau email sudah digunakan." });
    }
    console.error("[auth/register]", err);
    res.status(500).json({ message: "Gagal mendaftar. Terjadi kesalahan pada server/database." });
  }
});

// 2. Login
app.post("/api/auth/login", authLimiter, async (req, res) => {
  const identifier = (typeof req.body?.identifier === "string"
    ? req.body.identifier
    : typeof req.body?.username === "string"
    ? req.body.username
    : typeof req.body?.email === "string"
    ? req.body.email
    : "").trim().toLowerCase();
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!identifier || !password) {
    return res.status(400).json({ message: "Isi username/email dan password." });
  }

  try {
    const [rows] = await pool.query(
      "SELECT id, username, email, password FROM users WHERE LOWER(username) = ? OR LOWER(email) = ? LIMIT 1",
      [identifier, identifier]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Username/Email atau Password salah!" });
    }

    const user = rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Username/Email atau Password salah!" });
    }

    let userFinance = null;
    try {
      const [finances] = await pool.query(
        "SELECT income, budget, target FROM finance WHERE user_id = ? LIMIT 1",
        [user.id]
      );
      if (finances.length > 0) userFinance = finances[0];
    } catch (finErr) {
      console.warn("[auth/login/finance]", finErr?.message || finErr);
    }

    res.json({
      message: "Login berhasil!",
      token: signToken(user),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
      finance: userFinance,
      hasFinance: userFinance !== null && Number(userFinance.income) > 0 && Number(userFinance.budget) > 0,
    });
  } catch (err) {
    console.error("[auth/login]", err);
    res.status(500).json({ message: "Gagal login. Terjadi kesalahan pada server/database." });
  }
});

// 2b. Change Password
app.post("/api/auth/change-password", authLimiter, requireAuth, async (req, res) => {
  const userId = req.userId;
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Semua kolom password wajib diisi." });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ message: "Password baru minimal harus 8 karakter." });
  }

  if (Buffer.byteLength(newPassword, "utf8") > 72) {
    return res.status(400).json({ message: "Password baru terlalu panjang (maksimal 72 karakter)." });
  }

  try {
    const [rows] = await pool.query(
      "SELECT id, password FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }

    const isCurrentMatch = await bcrypt.compare(currentPassword, rows[0].password);

    if (!isCurrentMatch) {
      return res.status(401).json({ message: "Current Password yang Anda masukkan salah!" });
    }

    const hashedNew = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password = ? WHERE id = ?", [hashedNew, userId]);

    res.json({ message: "Password berhasil diubah!" });
  } catch (err) {
    console.error("[auth/change-password]", err);
    res.status(500).json({ message: "Gagal mengubah password di server/database." });
  }
});

// ================= PROFILE & FINANCE API (MySQL) =================

// 3. Simpan / perbarui data finance (Complete Profile)
app.post("/api/finance", requireAuth, async (req, res) => {
  const userId = req.userId;
  const income = parseMoney(req.body?.income, 0);
  const budget = parseMoney(req.body?.budget, 0);
  const target = parseMoney(req.body?.target, 0);

  if (income === null || budget === null || target === null) {
    return res.status(400).json({ message: "Nilai income, budget, atau target tidak valid." });
  }

  try {
    await upsertFinance(userId, { income, budget, target });
    res.json({ message: "Data keuangan berhasil disimpan di database!", finance: { income, budget, target } });
  } catch (err) {
    console.error("[finance/save]", err);
    res.status(500).json({ message: "Gagal menyimpan data keuangan ke database." });
  }
});

// 4. Update profile & finance (Edit Profile)
app.post("/api/user/profile", requireAuth, async (req, res) => {
  const userId = req.userId;
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";

  if (!username) {
    return res.status(400).json({ message: "Username wajib diisi." });
  }

  if (username.length > 50) {
    return res.status(400).json({ message: "Username maksimal 50 karakter." });
  }

  try {
    const [taken] = await pool.query(
      "SELECT id FROM users WHERE LOWER(username) = ? AND id != ? LIMIT 1",
      [username.toLowerCase(), userId]
    );

    if (taken.length > 0) {
      return res.status(400).json({ message: "Username sudah digunakan oleh akun lain." });
    }

    // Field finance yang tidak dikirim tetap memakai nilai lama (tidak di-reset ke 0)
    const [current] = await pool.query(
      "SELECT income, budget, target FROM finance WHERE user_id = ? LIMIT 1",
      [userId]
    );
    const old = current[0] || { income: 0, budget: 0, target: 0 };

    const income = parseMoney(req.body?.income, Number(old.income));
    const budget = parseMoney(req.body?.budget, Number(old.budget));
    const target = parseMoney(req.body?.target, Number(old.target));

    if (income === null || budget === null || target === null) {
      return res.status(400).json({ message: "Nilai income, budget, atau target tidak valid." });
    }

    await pool.query(
      "UPDATE users SET username = ? WHERE id = ?",
      [username, userId]
    );

    await upsertFinance(userId, { income, budget, target });

    res.json({
      message: "Profil dan keuangan berhasil diperbarui!",
      user: { id: userId, username },
      finance: { income, budget, target },
    });
  } catch (err) {
    console.error("[profile/update]", err);
    res.status(500).json({ message: "Gagal memperbarui profil di database." });
  }
});

// 5. Ambil profile & finance milik user yang login
app.get("/api/user/profile", requireAuth, async (req, res) => {
  const userId = req.userId;

  try {
    const [users] = await pool.query(
      "SELECT id, username, email FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }

    const [finances] = await pool.query(
      "SELECT income, budget, target FROM finance WHERE user_id = ? LIMIT 1",
      [userId]
    );

    res.json({
      user: users[0],
      finance: finances.length > 0 ? finances[0] : { income: 0, budget: 0, target: 0 },
    });
  } catch (err) {
    console.error("[profile/get]", err);
    res.status(500).json({ message: "Gagal mengambil data profil dari database." });
  }
});

// ================= SPENDING API (MySQL) =================

// Simpan pengeluaran baru
app.post("/api/spending", requireAuth, async (req, res) => {
  const userId = req.userId;
  const category = typeof req.body?.category === "string" ? req.body.category : "";
  const price = Number(req.body?.price);
  const date = typeof req.body?.date === "string" ? req.body.date.trim() : "";

  if (
    !["food", "shopping", "others"].includes(category) ||
    !Number.isFinite(price) || price <= 0 || price > MAX_PRICE ||
    !isValidDate(date)
  ) {
    return res.status(400).json({ message: "Data spending tidak lengkap atau tidak valid (tanggal harus YYYY-MM-DD)." });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO spending (user_id, category, price, date) VALUES (?, ?, ?, ?)",
      [userId, category, price, date]
    );

    res.status(201).json({
      message: "Pengeluaran berhasil disimpan!",
      spending: { id: result.insertId, category, price, date },
    });
  } catch (err) {
    console.error("[spending/create]", err);
    res.status(500).json({ message: "Gagal menyimpan pengeluaran ke database." });
  }
});

// Ringkasan spending bulan ini per kategori
app.get("/api/spending", requireAuth, async (req, res) => {
  const userId = req.userId;

  try {
    const [rows] = await pool.query(
      `SELECT category, SUM(price) AS total
       FROM spending
       WHERE user_id = ?
         AND date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
         AND date < DATE_FORMAT(CURDATE() + INTERVAL 1 MONTH, '%Y-%m-01')
       GROUP BY category`,
      [userId]
    );

    const summary = { food: 0, shopping: 0, others: 0 };
    rows.forEach((r) => {
      if (Object.hasOwn(summary, r.category)) {
        summary[r.category] = Number(r.total);
      }
    });

    res.json({ spending: summary });
  } catch (err) {
    console.error("[spending/list]", err);
    res.status(500).json({ message: "Gagal mengambil data spending dari database." });
  }
});

// ================= TIMER / LEMON PAUSE API (MySQL) =================

// 6. Simpan timer baru (produk + timer dalam satu transaksi)
app.post("/api/timers", requireAuth, async (req, res) => {
  const userId = req.userId;
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 150) : "";
  const price = Number(req.body?.price);
  const url = typeof req.body?.url === "string" && req.body.url.trim() ? req.body.url.trim().slice(0, 500) : null;
  const imageUrl = typeof req.body?.imageUrl === "string" && req.body.imageUrl.trim() ? req.body.imageUrl.trim().slice(0, 500) : null;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";
  const durationSeconds = Number(req.body?.durationSeconds);

  if (
    !name ||
    !Number.isFinite(price) || price <= 0 || price > MAX_PRICE ||
    !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_TIMER_SECONDS
  ) {
    return res.status(400).json({ message: "Data timer tidak lengkap atau tidak valid." });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [productResult] = await conn.query(
      "INSERT INTO products (user_id, name, price, url, image_url, reason) VALUES (?, ?, ?, ?, ?, ?)",
      [userId, name, price, url, imageUrl, reason]
    );
    const productId = productResult.insertId;

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + durationSeconds * 1000);

    const [timerResult] = await conn.query(
      "INSERT INTO timer (user_id, product_id, start_time, end_time, status) VALUES (?, ?, ?, ?, 'waiting')",
      [userId, productId, startTime, endTime]
    );

    await conn.commit();

    res.status(201).json({
      message: "Timer berhasil disimpan!",
      timer: {
        id: timerResult.insertId,
        productId,
        name,
        price,
        imageUrl,
        url,
        reason,
        endsAt: endTime.getTime(),
        status: "waiting",
      },
    });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch {}
    }
    console.error("[timers/create]", err);
    res.status(500).json({ message: "Gagal menyimpan timer ke database." });
  } finally {
    if (conn) conn.release();
  }
});

// 7. Ambil semua timer aktif milik user yang login
app.get("/api/timers", requireAuth, async (req, res) => {
  const userId = req.userId;

  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.product_id AS productId, t.start_time, t.end_time, t.status,
              p.name, p.price, p.url, p.image_url AS imageUrl, p.reason
       FROM timer t
       JOIN products p ON t.product_id = p.id
       WHERE t.user_id = ? AND t.status = 'waiting'
       ORDER BY t.end_time ASC`,
      [userId]
    );

    const timers = rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      name: r.name,
      price: Number(r.price),
      link: r.url,
      imageUrl: r.imageUrl,
      reason: r.reason,
      endsAt: new Date(r.end_time).getTime(),
      status: r.status,
    }));

    res.json({ timers });
  } catch (err) {
    console.error("[timers/list]", err);
    res.status(500).json({ message: "Gagal mengambil data timer dari database." });
  }
});

// 8. Update status timer (Buy / Skip)
app.post("/api/timers/:id/action", requireAuth, async (req, res) => {
  const userId = req.userId;
  const timerId = Number(req.params.id);
  const action = typeof req.body?.action === "string" ? req.body.action : "";

  if (!timerId || !["bought", "skipped"].includes(action)) {
    return res.status(400).json({ message: "Data aksi tidak valid." });
  }

  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.product_id, p.name, p.price
       FROM timer t JOIN products p ON t.product_id = p.id
       WHERE t.id = ? AND t.user_id = ? AND t.status = 'waiting' LIMIT 1`,
      [timerId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Timer tidak ditemukan atau sudah diproses." });
    }

    // Kondisi status = 'waiting' dicek lagi supaya aman dari klik ganda
    const [upd] = await pool.query(
      "UPDATE timer SET status = ? WHERE id = ? AND user_id = ? AND status = 'waiting'",
      [action, timerId, userId]
    );

    if (upd.affectedRows === 0) {
      return res.status(404).json({ message: "Timer tidak ditemukan atau sudah diproses." });
    }

    res.json({
      message: action === "bought" ? "Barang ditandai sebagai dibeli." : "Barang berhasil di-skip! Uang berhasil dihemat.",
      timer: { id: timerId, status: action, name: rows[0].name, price: Number(rows[0].price) },
    });
  } catch (err) {
    console.error("[timers/action]", err);
    res.status(500).json({ message: "Gagal memperbarui status timer." });
  }
});

// ================= MINI SURVEY GEMINI INSIGHT API =================

app.post("/api/mini-survey-insight", limiter, optionalAuth, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: "GEMINI_API_KEY belum diset di file .env." });
  }

  const userId = req.userId || null; // dari token, bukan dari body
  const itemName = typeof req.body?.itemName === "string" ? req.body.itemName.trim().slice(0, 150) : "";
  const itemPrice = typeof req.body?.itemPrice === "string"
    ? req.body.itemPrice.trim().slice(0, 60)
    : Number(req.body?.itemPrice) || "";
  const similarItems = typeof req.body?.similarItems === "string" ? req.body.similarItems.trim().slice(0, 200) : "";
  const buyTime = typeof req.body?.buyTime === "string" ? req.body.buyTime.trim().slice(0, 100) : "";
  const buyReason = typeof req.body?.buyReason === "string" ? req.body.buyReason.trim().slice(0, 500) : "";
  const productLink = typeof req.body?.productLink === "string" ? req.body.productLink.trim().slice(0, 500) : "";

  if (!itemName || !itemPrice || !similarItems || !buyReason) {
    return res.status(400).json({ message: "Field survei bertanda (*) wajib diisi." });
  }

  // Opsional: konteks keuangan user jika sedang login
  let financeContext = "";
  if (userId) {
    try {
      const [finRows] = await pool.query(
        "SELECT income, budget, target FROM finance WHERE user_id = ? LIMIT 1",
        [userId]
      );
      const [spendRows] = await pool.query(
        `SELECT category, SUM(price) AS total
         FROM spending
         WHERE user_id = ?
           AND date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
           AND date < DATE_FORMAT(CURDATE() + INTERVAL 1 MONTH, '%Y-%m-01')
         GROUP BY category`,
        [userId]
      );

      const totalSpent = spendRows.reduce((acc, row) => acc + Number(row.total || 0), 0);
      if (finRows.length > 0) {
        const f = finRows[0];
        financeContext = `
Konteks Keuangan User Bulan Ini (dari database):
- Income: ${Number(f.income || 0)}
- Budget: ${Number(f.budget || 0)}
- Target tabungan/goal: ${Number(f.target || 0)}
- Total pengeluaran tercatat bulan ini: ${totalSpent}
`;
      }
    } catch (dbErr) {
      console.warn("[mini-survey-insight/finance-context]", dbErr?.message || dbErr);
    }
  }

  const prompt = `
Kamu adalah "Le Mon-Aid", asisten keuangan cerdas yang ramah, jujur, dan sedikit jenaka untuk mencegah pembelian impulsif (impulse buying).
Analisis rencana pembelian user berdasarkan data Mini Survey berikut:

- Barang yang ingin dibeli: ${itemName}
- Harga: ${itemPrice}
- Punya barang dengan fungsi serupa?: ${similarItems}
- Rencana waktu beli: ${buyTime || "Tidak disebutkan"}
- Alasan membeli: ${buyReason}
- Link produk: ${productLink || "Tidak ada"}
${financeContext}
Tugasmu:
1. Berikan penilaian singkat (apakah ini kebutuhan mendesak atau keinginan impulsif).
2. Berikan 2-3 poin pertimbangan logis berdasarkan harga, barang serupa, dan kondisi keuangan (jika ada).
3. Berikan saran keputusan yang suportif namun tegas (misal: sarankan "Lemon Pause" / "Save for later" jika terlihat impulsif).
Gunakan bahasa Indonesia yang santai, hangat, dan mudah dibaca (maksimal 160 kata).
  `.trim();

  try {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const geminiRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey, // lewat header, bukan di URL
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const data = await geminiRes.json().catch(() => ({}));
    if (!geminiRes.ok) {
      console.error("[mini-survey-insight/gemini]", geminiRes.status, data?.error?.message);
      return res.status(502).json({ message: "Gagal mendapatkan respons dari layanan AI. Coba lagi nanti." });
    }

    const insight = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    if (!insight) {
      return res.status(502).json({ message: "Gemini tidak mengembalikan teks insight." });
    }

    return res.json({ insight });
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return res.status(504).json({ message: "Layanan AI terlalu lama merespons. Coba lagi." });
    }
    console.error("[mini-survey-insight]", err);
    return res.status(500).json({ message: "Gagal menghubungi layanan Gemini AI." });
  }
});

// ================= STATIC FILES =================

app.use("/images", express.static(path.resolve(__dirname, "../images")));

// Frontend disajikan dari server yang sama -> /api tidak kena masalah CORS
app.use(express.static(FRONTEND_DIR, { index: "loginpage.html" }));

app.listen(PORT, async () => {
  console.log(`Le Mon-Aid jalan di http://localhost:${PORT}`);
  console.log(`Frontend: ${FRONTEND_DIR}`);
  if (process.env.DEV_FAKE_DATA === "true") console.log("MODE DEV: data produk palsu aktif");
  try {
    await pool.query("SELECT 1");
    console.log("Database MySQL terhubung!");
  } catch (err) {
    console.warn("Peringatan: Tidak bisa konek ke MySQL:", err?.message || err);
  }
});