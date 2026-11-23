function authHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Kalau token kadaluarsa / tidak valid, balik ke login
function handleUnauthorized(res) {
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    window.location.href = 'loginpage.html';
    return true;
  }
  return false;
}