# Le Mon-Aid Server

Backend untuk endpoint `POST /api/analyze-product` (ambil data produk dari link, lalu analisis Gemini).
Server ini juga menyajikan frontend, jadi tidak ada masalah CORS.


## Menjalankan

    cd le-mon-aid-server
    npm install
    cp .env.example .env      
    npm start

Buka http://localhost:3000 (jangan buka file HTML langsung dari folder).

## Tes tanpa scraping

Di `.env`, aktifkan `DEV_FAKE_DATA=true`. Nama produk diambil dari slug link, harga dari `FAKE_PRICE`.
Tanpa `GEMINI_API_KEY`, analisis berupa contoh tetap. Dengan key, analisis asli dari Gemini tetap jalan.
Matikan mode ini di produksi.

## Bagian yang kamu isi

`lib/productSource.js` -> `shopeeResolver()`: ambil data produk dari sumber pilihanmu
(API resmi, browser headless, dll.) lalu kembalikan `{ name, price, imageUrl, description, merchant }`.
Toko lain yang menyediakan JSON-LD atau Open Graph biasanya sudah terbaca oleh pembaca generik.

## Keamanan

- API key hanya ada di server (`.env`, sudah di `.gitignore`).
- Link dicek supaya tidak mengarah ke localhost / IP privat (SSRF), termasuk setiap redirect.
  Celah yang belum ditutup: DNS rebinding. Kalau server dipakai publik, jalankan di jaringan
  yang membatasi akses keluar ke alamat internal.
- Endpoint dibatasi 10 request/menit per IP karena tiap request memakai kuota Gemini.
- Teks halaman toko dikirim ke Gemini sebagai data, dengan instruksi untuk mengabaikan perintah di dalamnya.

## Kalau frontend dan server beda alamat

Pasang paket `cors` dan izinkan alamat frontend, atau ubah `fetch("/api/analyze-product")`
di `home.js` menjadi URL server lengkap.
