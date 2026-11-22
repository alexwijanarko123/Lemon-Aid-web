import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  throw new Error("JWT_SECRET belum diset atau terlalu pendek (min 32 karakter).");
}

export function signToken(user) {
  return jwt.sign({ sub: user.id }, SECRET, { expiresIn: "7d" });
}

function readToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

// Wajib login
export function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ message: "Silakan login terlebih dahulu." });
  try {
    req.userId = Number(jwt.verify(token, SECRET).sub);
    next();
  } catch {
    res.status(401).json({ message: "Sesi tidak valid atau sudah berakhir. Login ulang ya." });
  }
}

// Login opsional (untuk endpoint yang boleh diakses tanpa login)
export function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (token) {
    try { req.userId = Number(jwt.verify(token, SECRET).sub); } catch {}
  }
  next();
}