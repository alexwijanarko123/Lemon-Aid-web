let username = document.getElementById('username');
let password = document.getElementById('password');
let confirmPassword = document.getElementById('confirmPassword');
let email = document.getElementById('email');
let gender = document.getElementsByName('gender');

// SAMAKAN DENGAN ID DI HTML (errorMessage)
let errorMessage = document.getElementById('errorMessage');

let form = document.querySelector('form');

if (form) {
    form.addEventListener('submit', function(e) {
        // Reset pesan error setiap kali tombol Register diklik
        errorMessage.textContent = "";

        // Validasi 1: Jika password kurang dari 8 karakter
        
        if (username.value.trim() === "" || email.value.trim() === "" || password.value.trim() === "" || confirmPassword.value.trim() === "" || !Array.from(gender).some(g => g.checked)) {
            e.preventDefault();
            errorMessage.textContent = "Please fill in all fields.";
        // Validasi 2: Jika password dan konfirmasi password tidak cocok
        } if (password.value.length < 8) {
            e.preventDefault(); // Batalkan refresh halaman
            errorMessage.textContent = "Password must be at least 8 characters long.";
        
        }else if (password.value !== confirmPassword.value) {
            e.preventDefault(); // Batalkan refresh halaman
            errorMessage.textContent = "Passwords do not match.";
        }
        else {
            // --- SIMPAN DATA DEMO KE LOCALSTORAGE ---
            let registeredUsers = JSON.parse(localStorage.getItem('registeredUsers')) || [];

            // Buat data user baru
            let newUser = {
                username: username.value.trim(),
                email: email.value.trim(),
                password: password.value
            };

            // Masukkan ke array user
            registeredUsers.push(newUser);

            // Simpan ke memori browser
            localStorage.setItem('registeredUsers', JSON.stringify(registeredUsers));
            alert("datamu selesai disimpan dengan username: " + newUser.username + " dan email: " + newUser.email + " dan password: " + newUser.password);
            alert("Registration successful! You can now log in.");
            e.preventDefault(); // Batalkan refresh halaman
            window.location.href = "loginpage.html"; // Redirect ke halaman login setelah registrasi berhasil
        }
    });
}