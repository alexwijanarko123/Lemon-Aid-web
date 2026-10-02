import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeProduct, AnalysisError } from "./lib/analyze.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, process.env.FRONTEND_DIR || "../le-mon-aid");
const PORT = process.env.PORT || 3000;

const app = express();
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

// Frontend disajikan dari server yang sama -> /api tidak kena masalah CORS
app.use(express.static(FRONTEND_DIR, { index: "loginpage.html" }));

app.listen(PORT, () => {
  console.log(`Le Mon-Aid jalan di http://localhost:${PORT}`);
  console.log(`Frontend: ${FRONTEND_DIR}`);
  if (process.env.DEV_FAKE_DATA === "true") console.log("MODE DEV: data produk palsu aktif");
});
