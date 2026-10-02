const form = document.querySelector('form');
const errorMessage = document.getElementById('errorMessage');

if (form && errorMessage) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();               // selalu ditangani lewat JS
    errorMessage.textContent = "";

    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const genderInput = document.querySelector('input[name="gender"]:checked');

    // Validasi satu per satu, berhenti di error pertama
    if (!username || !email || !password || !confirmPassword || !genderInput) {
      return showError("Please fill in all fields.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return showError("Please enter a valid email address.");
    }
    if (password.length < 8) {
      return showError("Password must be at least 8 characters long.");
    }
    if (password !== confirmPassword) {
      return showError("Passwords do not match.");
    }

    // --- Simpan data demo ke localStorage ---
    const users = loadUsers();

    if (users.some((u) => u.email === email)) {
      return showError("This email is already registered.");
    }
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return showError("This username is already taken.");
    }

    users.push({ username, email, gender: genderInput.value, password });
    try {
      localStorage.setItem('registeredUsers', JSON.stringify(users));
    } catch {
      return showError("Could not save your data. Please check your browser settings.");
    }

    alert("Registration successful! You can now log in.");
    window.location.href = "loginpage.html";
  });
}

function showError(message) {
  errorMessage.textContent = message;
}

function loadUsers() {
  try {
    const data = JSON.parse(localStorage.getItem('registeredUsers'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}