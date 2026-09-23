const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "replace-this-secret";
const DB_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DB_DIR, "db.json");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

function defaultDb() {
  return {
    users: [],
    plans: [
      { id: 1, name: "Plan 1", price: 499, daily: 104.79, days: 120, total: 12574.80, image: "plan1" },
      { id: 2, name: "Plan 2", price: 1299, daily: 350.73, days: 120, total: 42087.60, image: "plan2" },
      { id: 3, name: "Plan 3", price: 4999, daily: 1420.00, days: 120, total: 170400.00, image: "plan3" },
      { id: 4, name: "Plan 4", price: 9999, daily: 3050.00, days: 120, total: 366000.00, image: "plan4" }
    ],
    transactions: [],
    purchases: [],
    counters: { user: 1, transaction: 1, purchase: 1 }
  };
}

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    const db = defaultDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    return db;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    const db = defaultDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    return db;
  }
}

let db = loadDb();

function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function seedAdmin() {
  const phone = process.env.ADMIN_PHONE || "9999999999";
  if (!db.users.some(u => u.phone === phone)) {
    const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
    db.users.push({
      id: db.counters.user++,
      name: process.env.ADMIN_NAME || "Admin",
      phone,
      email: "admin@northwest.local",
      upi: "",
      bank: { account: "", ifsc: "", holder: "" },
      passwordHash: bcrypt.hashSync(password, 10),
      withdrawalPasswordHash: bcrypt.hashSync(password, 10),
      referralCode: "NWADMIN",
      invitedBy: "",
      balance: 0,
      recharge: 0,
      totalIncome: 0,
      role: "admin",
      createdAt: new Date().toISOString()
    });
    saveDb();
  }
}
seedAdmin();

function createToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}

function currentUser(req) {
  const token = req.cookies.nw_token;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return db.users.find(u => u.id === payload.id) || null;
  } catch {
    return null;
  }
}

function requireUser(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.redirect("/login");
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = currentUser(req);
  if (!user || user.role !== "admin") return res.redirect("/login");
  req.user = user;
  next();
}

function flash(res, type, message) {
  const q = encodeURIComponent(`${type}|${message}`);
  return q;
}

function parseFlash(req) {
  if (!req.query.msg) return null;
  const [type, ...rest] = decodeURIComponent(req.query.msg).split("|");
  return { type, message: rest.join("|") };
}

function makeReferralCode(name, id) {
  const clean = String(name || "USER").replace(/[^A-Za-z0-9]/g, "").slice(0, 5).toUpperCase() || "USER";
  return `${clean}${String(id).padStart(4, "0")}`;
}

function nextId(type) {
  const id = db.counters[type]++;
  return id;
}

function findUser(id) {
  return db.users.find(u => u.id === Number(id));
}

function teamFor(user) {
  const direct = db.users.filter(u => u.invitedBy === user.referralCode);
  const l2 = db.users.filter(u => direct.some(d => d.referralCode === u.invitedBy));
  const l3 = db.users.filter(u => l2.some(d => d.referralCode === u.invitedBy));
  return { l1: direct, l2, l3 };
}

app.use((req, res, next) => {
  res.locals.siteName = process.env.SITE_NAME || "Northwest Investment";
  res.locals.user = currentUser(req);
  res.locals.flash = parseFlash(req);
  next();
});

app.get("/", (req, res) => {
  if (currentUser(req)) return res.redirect("/home");
  res.render("welcome");
});

app.get("/login", (req, res) => res.render("login"));
app.get("/register", (req, res) => res.render("register"));

app.post("/register", async (req, res) => {
  const { name, phone, email, upi, account, ifsc, holder, password, withdrawalPassword, referral } = req.body;
  if (!name || !phone || !email || !password || !withdrawalPassword) {
    return res.redirect("/register?msg=" + flash(res, "error", "Please fill all required fields."));
  }
  if (db.users.some(u => u.phone === phone)) {
    return res.redirect("/register?msg=" + flash(res, "error", "Phone number already registered."));
  }
  if (db.users.some(u => u.email.toLowerCase() === String(email).toLowerCase())) {
    return res.redirect("/register?msg=" + flash(res, "error", "Email already registered."));
  }
  if (referral && !db.users.some(u => u.referralCode === referral)) {
    return res.redirect("/register?msg=" + flash(res, "error", "Invalid invitation code."));
  }
  const id = nextId("user");
  const user = {
    id,
    name,
    phone,
    email,
    upi: upi || "",
    bank: { account: account || "", ifsc: ifsc || "", holder: holder || name },
    passwordHash: await bcrypt.hash(password, 10),
    withdrawalPasswordHash: await bcrypt.hash(withdrawalPassword, 10),
    referralCode: makeReferralCode(name, id),
    invitedBy: referral || "",
    balance: 0,
    recharge: 0,
    totalIncome: 0,
    role: "user",
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  saveDb();
  res.redirect("/login?msg=" + flash(res, "success", "Registration successful. Please login."));
});

app.post("/login", async (req, res) => {
  const { phone, password } = req.body;
  const user = db.users.find(u => u.phone === phone);
  if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
    return res.redirect("/login?msg=" + flash(res, "error", "Invalid phone or password."));
  }
  res.cookie("nw_token", createToken(user), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.redirect(user.role === "admin" ? "/admin" : "/home");
});

app.post("/logout", (req, res) => {
  res.clearCookie("nw_token");
  res.redirect("/");
});

app.get("/home", requireUser, (req, res) => {
  const plans = db.plans;
  const purchases = db.purchases.filter(p => p.userId === req.user.id);
  res.render("home", { plans, purchases });
});

app.get("/recharge", requireUser, (req, res) => {
  const pending = db.transactions.filter(t => t.userId === req.user.id && t.type === "recharge" && t.status === "pending");
  res.render("recharge", {
    pending,
    upiId: process.env.UPI_ID || "your-upi@bank",
    upiName: process.env.UPI_NAME || "Northwest Investment"
  });
});

app.post("/recharge", requireUser, (req, res) => {
  const amount = Number(req.body.amount);
  const utr = String(req.body.utr || "").trim();
  if (!Number.isFinite(amount) || amount < 100) {
    return res.redirect("/recharge?msg=" + flash(res, "error", "Minimum recharge is ₹100."));
  }
  if (!utr || utr.length < 6) {
    return res.redirect("/recharge?msg=" + flash(res, "error", "Enter a valid UTR/reference number."));
  }
  const duplicate = db.transactions.some(t => t.utr === utr);
  if (duplicate) return res.redirect("/recharge?msg=" + flash(res, "error", "This UTR has already been submitted."));
  db.transactions.push({
    id: nextId("transaction"),
    userId: req.user.id,
    type: "recharge",
    amount,
    utr,
    status: "pending",
    createdAt: new Date().toISOString()
  });
  saveDb();
  res.redirect("/recharge?msg=" + flash(res, "success", "Recharge submitted for admin verification."));
});

app.get("/withdraw", requireUser, (req, res) => {
  const tx = db.transactions.filter(t => t.userId === req.user.id && t.type === "withdrawal").slice().reverse();
  res.render("withdraw", { transactions: tx });
});

app.post("/withdraw", requireUser, async (req, res) => {
  const amount = Number(req.body.amount);
  const password = String(req.body.withdrawalPassword || "");
  if (!Number.isFinite(amount) || amount < 100) {
    return res.redirect("/withdraw?msg=" + flash(res, "error", "Minimum withdrawal is ₹100."));
  }
  if (amount > req.user.balance) {
    return res.redirect("/withdraw?msg=" + flash(res, "error", "Insufficient balance."));
  }
  if (!(await bcrypt.compare(password, req.user.withdrawalPasswordHash))) {
    return res.redirect("/withdraw?msg=" + flash(res, "error", "Invalid withdrawal password."));
  }
  if (!req.user.upi && !req.user.bank.account) {
    return res.redirect("/profile?msg=" + flash(res, "error", "Add UPI or bank details before withdrawing."));
  }
  db.transactions.push({
    id: nextId("transaction"),
    userId: req.user.id,
    type: "withdrawal",
    amount,
    utr: "",
    status: "pending",
    createdAt: new Date().toISOString()
  });
  saveDb();
  res.redirect("/withdraw?msg=" + flash(res, "success", "Withdrawal request submitted."));
});

app.get("/income", requireUser, (req, res) => {
  const tx = db.transactions.filter(t => t.userId === req.user.id && (t.type === "income" || t.type === "recharge" || t.type === "withdrawal")).slice().reverse();
  res.render("income", { transactions: tx });
});

app.get("/team", requireUser, (req, res) => {
  const team = teamFor(req.user);
  res.render("team", { team });
});

app.get("/profile", requireUser, (req, res) => {
  res.render("profile");
});

app.post("/profile", requireUser, async (req, res) => {
  const { name, email, phone, upi, account, ifsc, holder, password, withdrawalPassword } = req.body;
  if (!name || !email || !phone) return res.redirect("/profile?msg=" + flash(res, "error", "Name, email and phone are required."));
  const phoneTaken = db.users.some(u => u.id !== req.user.id && u.phone === phone);
  if (phoneTaken) return res.redirect("/profile?msg=" + flash(res, "error", "Phone already used by another account."));
  req.user.name = name;
  req.user.email = email;
  req.user.phone = phone;
  req.user.upi = upi || "";
  req.user.bank = { account: account || "", ifsc: ifsc || "", holder: holder || name };
  if (password) req.user.passwordHash = await bcrypt.hash(password, 10);
  if (withdrawalPassword) req.user.withdrawalPasswordHash = await bcrypt.hash(withdrawalPassword, 10);
  saveDb();
  res.redirect("/profile?msg=" + flash(res, "success", "Profile updated successfully."));
});

app.post("/plan/:id/buy", requireUser, (req, res) => {
  const plan = db.plans.find(p => p.id === Number(req.params.id));
  if (!plan) return res.redirect("/home?msg=" + flash(res, "error", "Plan not found."));
  if (req.user.balance < plan.price) return res.redirect("/recharge?msg=" + flash(res, "error", "Insufficient balance. Recharge first."));
  const active = db.purchases.find(p => p.userId === req.user.id && p.planId === plan.id && p.status === "active");
  if (active) return res.redirect("/home?msg=" + flash(res, "error", "This plan is already active."));
  req.user.balance -= plan.price;
  const purchase = {
    id: nextId("purchase"),
    userId: req.user.id,
    planId: plan.id,
    price: plan.price,
    daily: plan.daily,
    days: plan.days,
    total: plan.total,
    status: "active",
    createdAt: new Date().toISOString()
  };
  db.purchases.push(purchase);
  db.transactions.push({
    id: nextId("transaction"),
    userId: req.user.id,
    type: "plan_purchase",
    amount: plan.price,
    utr: "",
    status: "completed",
    createdAt: new Date().toISOString(),
    note: plan.name
  });
  saveDb();
  res.redirect("/home?msg=" + flash(res, "success", `${plan.name} activated.`));
});

/* ---------------- ADMIN ---------------- */

app.get("/admin", requireAdmin, (req, res) => {
  const stats = {
    users: db.users.filter(u => u.role === "user").length,
    recharge: db.transactions.filter(t => t.type === "recharge" && t.status === "completed").reduce((s,t) => s+t.amount, 0),
    pendingRecharge: db.transactions.filter(t => t.type === "recharge" && t.status === "pending").reduce((s,t) => s+t.amount, 0),
    pendingWithdraw: db.transactions.filter(t => t.type === "withdrawal" && t.status === "pending").reduce((s,t) => s+t.amount, 0),
    activePlans: db.purchases.filter(p => p.status === "active").length
  };
  const transactions = db.transactions.slice().reverse().slice(0, 10).map(t => ({...t, user: findUser(t.userId)}));
  res.render("admin", { stats, transactions });
});

app.get("/admin/users", requireAdmin, (req, res) => {
  res.render("admin-users", { users: db.users.filter(u => u.role === "user").slice().reverse() });
});

app.get("/admin/transactions", requireAdmin, (req, res) => {
  const transactions = db.transactions.slice().reverse().map(t => ({...t, user: findUser(t.userId)}));
  res.render("admin-transactions", { transactions });
});

app.get("/admin/plans", requireAdmin, (req, res) => {
  res.render("admin-plans", { plans: db.plans });
});

app.post("/admin/plans/:id", requireAdmin, (req, res) => {
  const plan = db.plans.find(p => p.id === Number(req.params.id));
  if (!plan) return res.redirect("/admin/plans");
  plan.name = req.body.name || plan.name;
  plan.price = Number(req.body.price) || plan.price;
  plan.daily = Number(req.body.daily) || plan.daily;
  plan.days = Number(req.body.days) || plan.days;
  plan.total = Number(req.body.total) || plan.total;
  saveDb();
  res.redirect("/admin/plans?msg=" + flash(res, "success", "Plan updated."));
});

app.post("/admin/transaction/:id/approve", requireAdmin, (req, res) => {
  const tx = db.transactions.find(t => t.id === Number(req.params.id));
  if (!tx || tx.status !== "pending") return res.redirect("/admin/transactions");
  const user = findUser(tx.userId);
  if (!user) return res.redirect("/admin/transactions");
  tx.status = "completed";
  tx.reviewedAt = new Date().toISOString();
  if (tx.type === "recharge") {
    user.balance += tx.amount;
    user.recharge += tx.amount;
  } else if (tx.type === "withdrawal") {
    if (user.balance < tx.amount) {
      tx.status = "rejected";
      tx.note = "Insufficient balance at approval time.";
    } else {
      user.balance -= tx.amount;
    }
  }
  saveDb();
  res.redirect("/admin/transactions?msg=" + flash(res, "success", "Transaction reviewed."));
});

app.post("/admin/transaction/:id/reject", requireAdmin, (req, res) => {
  const tx = db.transactions.find(t => t.id === Number(req.params.id));
  if (!tx || tx.status !== "pending") return res.redirect("/admin/transactions");
  tx.status = "rejected";
  tx.reviewedAt = new Date().toISOString();
  tx.note = req.body.note || "Rejected by admin.";
  saveDb();
  res.redirect("/admin/transactions?msg=" + flash(res, "success", "Transaction rejected."));
});

app.use((req, res) => res.status(404).render("404"));

app.listen(PORT, () => {
  console.log(`Northwest Investment running on port ${PORT}`);
});
