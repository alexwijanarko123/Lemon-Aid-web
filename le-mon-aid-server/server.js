import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeProduct, AnalysisError } from "./lib/analyze.js";
import cors from "cors";
import bcrypt from "bcryptjs";
import { pool } from "./lib/db.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, process.env.FRONTEND_DIR || "../Lemon-Aid");
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors()); // Allow requests from your frontend domain
app.use(express.json({ limit: "10kb" }));

// Tiap request memakai kuota Gemini, jadi dibatasi per IP
const limiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Terlalu banyak permintaan. Coba lagi sebentar lagi." },
});

app.post("/api/analyze-product", limiter, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : "";
  const merchant = typeof req.body?.merchant === "string" ? req.body.merchant.trim().slice(0, 100) : "";
  const price = Number(req.body?.price);

  if (!name || !Number.isFinite(price) || price <= 0 || price > 1e12) {
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

// 1. Register Endpoint
app.post("/api/auth/register", async (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!username || !email || !password) {
    return res.status(400).json({ message: "Semua kolom wajib diisi." });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Format email tidak valid." });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: "Password minimal harus 8 karakter." });
  }

  try {
    // Cek apakah username atau email sudah ada
    const [existing] = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(username) = ? LIMIT 1",
      [email, username.toLowerCase()]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: "Username atau email sudah digunakan." });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Simpan user baru
    const [result] = await pool.query(
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
      [username, email, hashedPassword]
    );

    res.status(201).json({
      message: "Registrasi berhasil!",
      user: { id: result.insertId, username, email },
    });
  } catch (err) {
    console.error("[auth/register]", err);
    res.status(500).json({ message: "Gagal mendaftar. Terjadi kesalahan pada server/database." });
  }
});

// 2. Login Endpoint
app.post("/api/auth/login", async (req, res) => {
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

    // Cek apakah user sudah punya data finance di DB
    let userFinance = null;
    try {
      const [finances] = await pool.query(
        "SELECT income, budget, target FROM finance WHERE user_id = ? LIMIT 1",
        [user.id]
      );
      if (finances.length > 0) userFinance = finances[0];
    } catch {}

    res.json({
      message: "Login berhasil!",
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

// 2b. Change Password Endpoint
app.post("/api/auth/change-password", async (req, res) => {
  const userId = Number(req.body?.userId);
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

  if (!userId || !currentPassword || !newPassword) {
    return res.status(400).json({ message: "Semua kolom password wajib diisi." });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ message: "Password baru minimal harus 8 karakter." });
  }

  try {
    const [rows] = await pool.query(
      "SELECT id, password FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }

    const user = rows[0];
    const isCurrentMatch = await bcrypt.compare(currentPassword, user.password);

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

// 3. Simpan / Perbarui Data Finance dari Complete Profile
app.post("/api/finance", async (req, res) => {
  const userId = Number(req.body?.userId);
  const income = Number(req.body?.income) || 0;
  const budget = Number(req.body?.budget) || 0;
  const target = Number(req.body?.target) || 0;

  if (!userId) {
    return res.status(400).json({ message: "User ID wajib disertakan." });
  }

  try {
    const [existing] = await pool.query(
      "SELECT id FROM finance WHERE user_id = ? LIMIT 1",
      [userId]
    );

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

    res.json({ message: "Data keuangan berhasil disimpan di database!", finance: { income, budget, target } });
  } catch (err) {
    console.error("[finance/save]", err);
    res.status(500).json({ message: "Gagal menyimpan data keuangan ke database." });
  }
});

// 4. Update Profile & Finance dari Edit Profile
app.post("/api/user/profile", async (req, res) => {
  const userId = Number(req.body?.userId);
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const gender = typeof req.body?.gender === "string" ? req.body.gender : "";
  const income = Number(req.body?.income) || 0;
  const budget = Number(req.body?.budget) || 0;
  const target = Number(req.body?.target) || 0;

  if (!userId || !username) {
    return res.status(400).json({ message: "User ID dan Username wajib diisi." });
  }

  try {
    // Cek apakah username baru sudah dipakai orang lain
    const [taken] = await pool.query(
      "SELECT id FROM users WHERE LOWER(username) = ? AND id != ? LIMIT 1",
      [username.toLowerCase(), userId]
    );

    if (taken.length > 0) {
      return res.status(400).json({ message: "Username sudah digunakan oleh akun lain." });
    }

    // Update users
    await pool.query(
      "UPDATE users SET username = ?, gender = ? WHERE id = ?",
      [username, gender, userId]
    );

    // Update / Insert finance
    const [existing] = await pool.query(
      "SELECT id FROM finance WHERE user_id = ? LIMIT 1",
      [userId]
    );

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

    res.json({
      message: "Profil dan keuangan berhasil diperbarui!",
      user: { id: userId, username, gender },
      finance: { income, budget, target },
    });
  } catch (err) {
    console.error("[profile/update]", err);
    res.status(500).json({ message: "Gagal memperbarui profil di database." });
  }
});

// 5. Get Profile & Finance by User ID (untuk halaman Profile)
app.get("/api/user/profile/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId) {
    return res.status(400).json({ message: "User ID tidak valid." });
  }

  try {
    const [users] = await pool.query(
      "SELECT id, username, email, gender FROM users WHERE id = ? LIMIT 1",
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
app.post("/api/spending", async (req, res) => {
  const userId = Number(req.body?.userId);
  const category = typeof req.body?.category === "string" ? req.body.category : "";
  const price = Number(req.body?.price) || 0;
  const date = typeof req.body?.date === "string" ? req.body.date.trim() : "";

  if (!userId || !["food", "shopping", "others"].includes(category) || price <= 0 || !date) {
    return res.status(400).json({ message: "Data spending tidak lengkap." });
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

// Ambil ringkasan spending bulan ini per kategori
app.get("/api/spending/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId) {
    return res.status(400).json({ message: "User ID tidak valid." });
  }

  try {
    // Ambil total per kategori untuk bulan ini
    const [rows] = await pool.query(
      `SELECT category, SUM(price) AS total
       FROM spending
       WHERE user_id = ? AND MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE())
       GROUP BY category`,
      [userId]
    );

    const summary = { food: 0, shopping: 0, others: 0 };
    rows.forEach((r) => {
      if (summary.hasOwnProperty(r.category)) {
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

// 6. Simpan Timer baru (dari productdesc.js saat user klik "Set Timer")
app.post("/api/timers", async (req, res) => {
  const userId = Number(req.body?.userId);
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 150) : "";
  const price = Number(req.body?.price) || 0;
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : null;
  const imageUrl = typeof req.body?.imageUrl === "string" ? req.body.imageUrl.trim().slice(0, 500) : null;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const durationSeconds = Number(req.body?.durationSeconds) || 0;

  if (!userId || !name || price <= 0 || durationSeconds <= 0) {
    return res.status(400).json({ message: "Data timer tidak lengkap." });
  }

  try {
    // 1. Simpan produk ke tabel products
    const [productResult] = await pool.query(
      "INSERT INTO products (user_id, name, price, url, image_url, reason) VALUES (?, ?, ?, ?, ?, ?)",
      [userId, name, price, url, imageUrl, reason]
    );
    const productId = productResult.insertId;

    // 2. Hitung end_time
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + durationSeconds * 1000);

    // 3. Simpan timer ke tabel timer
    const [timerResult] = await pool.query(
      "INSERT INTO timer (user_id, product_id, start_time, end_time, status) VALUES (?, ?, ?, ?, 'waiting')",
      [userId, productId, startTime, endTime]
    );

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
    console.error("[timers/create]", err);
    res.status(500).json({ message: "Gagal menyimpan timer ke database." });
  }
});

// 7. Ambil semua timer milik user (untuk lemonpause.js)
app.get("/api/timers/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId) {
    return res.status(400).json({ message: "User ID tidak valid." });
  }

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
app.post("/api/timers/:id/action", async (req, res) => {
  const timerId = Number(req.params.id);
  const action = typeof req.body?.action === "string" ? req.body.action : "";
  const userId = Number(req.body?.userId);

  if (!timerId || !userId || !["bought", "skipped"].includes(action)) {
    return res.status(400).json({ message: "Data aksi tidak valid." });
  }

  try {
    // Pastikan timer milik user ini dan masih berstatus waiting
    const [rows] = await pool.query(
      "SELECT t.id, t.product_id, p.name, p.price FROM timer t JOIN products p ON t.product_id = p.id WHERE t.id = ? AND t.user_id = ? AND t.status = 'waiting' LIMIT 1",
      [timerId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Timer tidak ditemukan atau sudah diproses." });
    }

    await pool.query("UPDATE timer SET status = ? WHERE id = ?", [action, timerId]);

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

app.post("/api/mini-survey-insight", limiter, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: "GEMINI_API_KEY belum diset di file .env." });
  }

  const userId = Number(req.body?.userId) || null;
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

  // Opsional: ambil konteks keuangan user jika userId tersedia
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
         WHERE user_id = ? AND MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE())
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
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const geminiRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    const data = await geminiRes.json();
    if (!geminiRes.ok) {
      return res.status(geminiRes.status).json({
        message: data?.error?.message || "Gagal mendapatkan respons dari Gemini API.",
      });
    }

    const insight = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    if (!insight) {
      return res.status(502).json({ message: "Gemini tidak mengembalikan teks insight." });
    }

    return res.json({ insight });
  } catch (err) {
    console.error("[mini-survey-insight]", err);
    return res.status(500).json({ message: "Gagal menghubungi layanan Gemini AI." });
  }
});

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