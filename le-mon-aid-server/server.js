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
