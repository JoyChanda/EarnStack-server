const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// In-memory data storage (for testing without MongoDB)
let users = [
  { email: "admin@earnstack.com", name: "Admin User", role: "admin", coin: 1000, image: "https://i.pravatar.cc/150?u=admin" },
  { email: "worker@earnstack.com", name: "Worker User", role: "worker", coin: 500, image: "https://i.pravatar.cc/150?u=worker" },
  { email: "buyer@earnstack.com", name: "Buyer User", role: "buyer", coin: 800, image: "https://i.pravatar.cc/150?u=buyer" }
];

let tasks = [
  { _id: "1", task_title: "Complete Survey", buyer_email: "buyer@earnstack.com", payable_amount: 50, required_workers: 10 },
  { _id: "2", task_title: "Test Mobile App", buyer_email: "buyer@earnstack.com", payable_amount: 100, required_workers: 5 }
];

let submissions = [];
let notifications = [];

// --- JWT API ---
app.post("/jwt", (req, res) => {
  const user = req.body;
  const token = jwt.sign(user, process.env.JWT_SECRET || "secret_key", { expiresIn: "7d" });
  res.send({ token });
});

// --- USERS API ---
app.post("/users", (req, res) => {
  const user = req.body;
  const existingUser = users.find(u => u.email === user.email);
  
  if (existingUser) {
    return res.send({ message: "User already exists", insertedId: null });
  }
  
  const initialCoins = user.role === "buyer" ? 50 : 10;
  const newUser = { ...user, coin: initialCoins };
  users.push(newUser);
  
  res.send({ acknowledged: true, insertedId: user.email });
});

app.get("/users/:email", (req, res) => {
  const user = users.find(u => u.email === req.params.email);
  res.send(user || {});
});

app.get("/users", (req, res) => {
  res.send(users);
});

// --- TASKS API ---
app.get("/tasks", (req, res) => {
  res.send(tasks.filter(t => t.required_workers > 0));
});

app.get("/tasks/:id", (req, res) => {
  const task = tasks.find(t => t._id === req.params.id);
  res.send(task || {});
});

app.post("/tasks", (req, res) => {
  const { task, totalPayable } = req.body;
  const buyer = users.find(u => u.email === task.buyer_email);
  
  if (!buyer || buyer.coin < totalPayable) {
    return res.send({ error: true, message: "Insufficient coins" });
  }
  
  const newTask = { ...task, _id: Date.now().toString() };
  tasks.push(newTask);
  buyer.coin -= totalPayable;
  
  res.send({ success: true, taskId: newTask._id });
});

// --- SUBMISSIONS API ---
app.post("/submissions", (req, res) => {
  const submission = req.body;
  const newSubmission = {
    ...submission,
    _id: Date.now().toString(),
    status: "pending",
    createdAt: new Date()
  };
  
  submissions.push(newSubmission);
  
  const task = tasks.find(t => t._id === submission.task_id);
  if (task) task.required_workers--;
  
  res.send({ success: true, submissionId: newSubmission._id });
});

app.get("/submissions", (req, res) => {
  const email = req.query.email;
  const userSubmissions = submissions.filter(s => s.worker_email === email);
  res.send({ submissions: userSubmissions, totalCount: userSubmissions.length });
});

// --- NOTIFICATIONS API ---
app.get("/notifications", (req, res) => {
  const email = req.query.email;
  const userNotifications = notifications.filter(n => n.toEmail === email);
  res.send(userNotifications);
});

// --- STATS API ---
app.get("/top-workers", (req, res) => {
  const workers = users.filter(u => u.role === "worker").sort((a, b) => b.coin - a.coin).slice(0, 6);
  res.send(workers);
});

app.get("/worker-stats/:email", (req, res) => {
  const email = req.params.email;
  const userSubmissions = submissions.filter(s => s.worker_email === email);
  const approved = userSubmissions.filter(s => s.status === "approved");
  const totalEarnings = approved.reduce((sum, s) => sum + s.payable_amount, 0);
  
  res.send({
    totalSubmissions: userSubmissions.length,
    pendingSubmissions: userSubmissions.filter(s => s.status === "pending").length,
    totalEarnings
  });
});

// --- BASE API ---
app.get("/", (req, res) => {
  res.send("🚀 EarnStack Server is running! (In-Memory Mode)");
});

app.get("/health", (req, res) => {
  res.send({ 
    status: "OK", 
    mode: "In-Memory (No MongoDB)", 
    timestamp: new Date(),
    users: users.length,
    tasks: tasks.length
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`⚠️  Running in IN-MEMORY mode (no MongoDB connection)`);
  console.log(`💡 To use MongoDB, update MONGO_URI in .env file`);
});
