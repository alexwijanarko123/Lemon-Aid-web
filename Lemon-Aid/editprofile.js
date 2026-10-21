const user_income = parsePrice($("#income").value);   // angka saja, misalnya 10000000
const user_budget = parsePrice($("#budget").value);
const user_target = parsePrice($("#target").value);

if (user_income <= 0 || user_budget <= 0 || user_target <= 0) { /* tampilkan error */ return; }
if (user_budget > user_income) { /* budget tidak boleh melebihi income */ return; }

const finance = store.get("lemon_finance", {});
store.set("lemon_finance", { ...finance, income: user_income, budget: user_budget, target: user_target });

const users = store.get("registeredusers", []);
const i = users.findIndex((u) => u.email === currentUserEmail);
if (i === -1) return; // user tidak ditemukan, seharusnya tidak terjadi

const taken = users.some((u, idx) => idx !== i && u.username.toLowerCase() === username.toLowerCase());
if (taken) { /* tampilkan error */ return; }

users[i].username = newUsername;
users[i].gender = newGender;
store.set("registeredusers", users);
store.set ("currentUser",{...currentUser, username: newUsername, gender: newGender});

const f = getFinance();                       // dari finance.js
$("#income").value = f.income;
$("#budget").value = f.budget;
$("#target").value = f.target;
$("#username").value = currentUser.username;