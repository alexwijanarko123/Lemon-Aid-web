# Lemon-Aid 
adalah sebuat AI powered web apps yang memberikan akses kepada user untul lebih bijak dalam berbelanja, dengan memberikan waktu untuk berpikir dan mempertimbangkan segala keputusan sebelum membeli barang.

## App Goal
- Mencegah Impulsive buying terutama pada Gen Z.
- membantu mengelola keuangan, terutama untuk mahasiwa yang memiliki penghasilan terbatas.
- Sebagai Financial tracker yang bertujuan membentuk prinsip thinking before buying. comparing before choosing.
- Sebagai apps yang diharapkan bisa membentuk prinsip untuk menabung sejak dini agar bisa mencapai target keuangan di masa depan.

## Fitur
- Lemon-Pause : merupakan fitur utama yang memeberikan kesempatan untuk berpikir lebih matang sebelum belanja. Lemon pause menyediakan Timer sebagai jeda waktu berpikir sebelum mengambil keputusan
- AI analysis : Fitur dimana AI akan membantu memberikan saran kepada user berdasarkan income, harga barang yang akan dibeli dan alasan user untuk membeli barang tersebut. Dimana AI ini diharapkan bisa membantu memberikan saran agar user bisa lebih bijak membeli barang
- Financial tracker : fitur yang berfungsi membantu user dalam mengelola keuangannya. fitur ini melakukan tracking dari aspek Income user, berapa budget belanja user dan berapa target financial user. fitur ini bisa membantu user agar tidak melakukan impulsive buying dan berakhir overspend sehingga kondisi keuangan user bisa tetap terjaga.

## User-FLow
1. User melakukan registrasi dengan mengisi data data yang dibutuhkan lalu login ke akun yang sudah didaftarkan.
2. User Dialihkan ke Home page lalu user bisa mulai mentrack apa saja yang akan dibelanjakan. 
3. Apabila user ingin membeli barang secara online user bisa memasukan link produknya serta gambar dari produknya di home page.
4. setelah mengklik lanjut user bisa mengisi data lebih lanjut seperti nama produk, harga produk dan alasan membeli produk tersebut.
5. Apablia user bimbang user juga bisa meminta saran kepada AI dengan mengklik minta saran AI.
6. Apablia User memutuskan ingin langsung beli user bisa mengklik buy anyway dan akan dialihkan langsung ke link yang sudah diinput sebelumnya apabila produk tersebut dibeli secara online.
7. namun Apablia user masih bimbang user bisa menentukan waktu jeda dan memilih timer yang sudah tersedia. Dengan jangka waktu 1 jam, 3 Jam, 6 jam, 12 Jam, 1 hari, hingga seminggu.
8. setelah memilih timer user akan dialihkan ke halaman lemon-pause disitu terdapat list waiting list dari product yang di buat user sebelumnya.
9. jika waktu timer sudah habis user akan menerima notifikasi.
10. Terakhir user bisa mengkonfirmasi apakah jadi untuk membeli barang tersebut. Jika iya user mengklik buy dan akan dialihkan ke link yang sudah diinput dan budget akan dikurangi sesuai nominal belanja. jika tidak jadi user bisa mengklik skip dan budget tidak akan dikurangi.
11. user juga bisa melihat shopping history dengan mengklik profile lalu shopping history. disana terdapat list produk produk yang diinput sebelumnya. baik yang dibeli maupun yang batal dibeli.


## Keamanan

- API key hanya ada di server (`.env`, sudah di `.gitignore`).
- Link dicek supaya tidak mengarah ke localhost / IP privat (SSRF), termasuk setiap redirect.
  Celah yang belum ditutup: DNS rebinding. Kalau server dipakai publik, jalankan di jaringan
  yang membatasi akses keluar ke alamat internal.
- Endpoint dibatasi 10 request/menit per IP karena tiap request memakai kuota Gemini.
- Teks halaman toko dikirim ke Gemini sebagai data, dengan instruksi untuk mengabaikan perintah di dalamnya.

