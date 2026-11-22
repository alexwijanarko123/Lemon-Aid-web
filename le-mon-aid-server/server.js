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
