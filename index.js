const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require("jsonwebtoken");
require("dotenv").config();

// Middleware
const verifyJWT = require("./middleware/verifyJWT");
const verifyAdmin = require("./middleware/verifyAdmin");
const verifyBuyer = require("./middleware/verifyBuyer");
const verifyWorker = require("./middleware/verifyWorker");

const app = express();
app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  connectTimeoutMS: 5000,
  serverSelectionTimeoutMS: 5000
});

const db = client.db("earnstackDB");
const usersCollection = db.collection("users");
const tasksCollection = db.collection("tasks");
const submissionsCollection = db.collection("submissions");
const paymentsCollection = db.collection("payments");
const withdrawalsCollection = db.collection("withdrawals");
const notificationsCollection = db.collection("notifications");

async function run() {
  try {
    // Connect the client to the server
    await client.connect();

    // Ping to confirm connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
  }
}
run().catch(console.dir);

// --- JWT API ---
app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "7d" });
      res.send({ token });
    });

    // --- TASKS API ---
    // Add a new task (Buyer only)
    app.post("/tasks", verifyJWT, verifyBuyer, async (req, res) => {
      const { task, totalPayable } = req.body;

      // Find the buyer
      const buyer = await usersCollection.findOne({ email: task.buyer_email });

      if (!buyer || buyer.coin < totalPayable) {
        return res.send({ error: true, message: "Insufficient coins" });
      }

      // 1. Insert Task
      const result = await tasksCollection.insertOne({
        ...task,
        status: "pending", // Default status for new tasks
      });

      // 2. Deduct Coins from Buyer
      const updateResult = await usersCollection.updateOne(
        { email: task.buyer_email },
        { $inc: { coin: -totalPayable } }
      );

      res.send({ success: true, taskId: result.insertedId });
    });

    // Get all tasks (Public/Explore)
    app.get("/tasks", async (req, res) => {
      const result = await tasksCollection.find({ required_workers: { $gt: 0 } }).sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    // Get single task by ID
    app.get("/tasks/:id", async (req, res) => {
      const id = req.params.id;
      const result = await tasksCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Admin: Get all tasks
    app.get("/admin/tasks", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await tasksCollection.find().sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    // Buyer: Get their own tasks
    app.get("/tasks/buyer/:email", verifyJWT, verifyBuyer, async (req, res) => {
      const email = req.params.email;
      const result = await tasksCollection.find({ buyer_email: email }).sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    // Buyer: Update a task
    app.patch("/tasks/:id", verifyJWT, verifyBuyer, async (req, res) => {
      const id = req.params.id;
      const updates = req.body;
      // Only allow updating non-financial fields
      const allowed = ['task_title', 'task_detail', 'task_image_url', 'submission_info', 'completion_date'];
      const updateData = {};
      allowed.forEach(key => { if (updates[key] !== undefined) updateData[key] = updates[key]; });
      const result = await tasksCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );
      res.send(result);
    });

    // Buyer: Delete a task with coin refund for remaining worker slots
    app.delete("/tasks/buyer/:id", verifyJWT, verifyBuyer, async (req, res) => {
      const id = req.params.id;
      const task = await tasksCollection.findOne({ _id: new ObjectId(id) });
      if (!task) return res.status(404).send({ message: "Task not found" });

      // Refund coins for remaining unfilled worker slots
      const refundAmount = task.required_workers * task.payable_amount;
      if (refundAmount > 0) {
        await usersCollection.updateOne(
          { email: task.buyer_email },
          { $inc: { coin: refundAmount } }
        );
      }

      const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) });
      res.send({ success: true, refundAmount });
    });

    // Admin: Delete task
    app.delete("/tasks/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // --- SUBMISSIONS REVIEW API ---
    // Approve a submission
    app.patch("/submissions/approve/:id", verifyJWT, verifyBuyer, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      
      const submission = await submissionsCollection.findOne(query);
      if (!submission) return res.status(404).send({ message: "Submission not found" });

      // 1. Update submission status
      await submissionsCollection.updateOne(query, { $set: { status: "approved" } });

      // 2. Add coins to worker
      await usersCollection.updateOne(
        { email: submission.worker_email },
        { $inc: { coin: submission.payable_amount } }
      );

      // 3. Create Notification for Worker
      await notificationsCollection.insertOne({
        message: `You earned ${submission.payable_amount} coins from ${submission.buyer_email} for "${submission.task_title}"`,
        toEmail: submission.worker_email,
        actionRoute: "/dashboard/my-submissions",
        time: new Date(),
        unread: true
      });

      res.send({ success: true });
    });

    // Reject a submission
    app.patch("/submissions/reject/:id", verifyJWT, verifyBuyer, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const submission = await submissionsCollection.findOne(query);
      if (!submission) return res.status(404).send({ message: "Submission not found" });

      // 1. Update submission status
      await submissionsCollection.updateOne(query, { $set: { status: "rejected" } });

      // 2. Increase required_workers in task
      await tasksCollection.updateOne(
        { _id: new ObjectId(submission.task_id) },
        { $inc: { required_workers: 1 } }
      );

      // 3. Create Notification for Worker
      await notificationsCollection.insertOne({
        message: `Your submission for "${submission.task_title}" was rejected by ${submission.buyer_email}`,
        toEmail: submission.worker_email,
        actionRoute: "/dashboard/my-submissions",
        time: new Date(),
        unread: true
      });

      res.send({ success: true });
    });

    // --- WORKER SUBMISSIONS API ---
    // Submit work for a task (Worker only)
    app.post("/submissions", verifyJWT, verifyWorker, async (req, res) => {
      const submission = req.body;
      
      // 1. Insert Submission
      const result = await submissionsCollection.insertOne({
        ...submission,
        status: "pending",
        createdAt: new Date(),
      });

      // 2. Decrement Required Workers
      await tasksCollection.updateOne(
        { _id: new ObjectId(submission.task_id) },
        { $inc: { required_workers: -1 } }
      );

      // 3. Create Notification for Buyer
      await notificationsCollection.insertOne({
        message: `${submission.worker_name} submitted work for your task: "${submission.task_title}"`,
        toEmail: submission.buyer_email,
        actionRoute: "/dashboard/my-tasks", // Buyer can review here
        time: new Date(),
        unread: true
      });

      res.send({ success: true, submissionId: result.insertedId });
    });

    // Get submissions for a specific task (Buyer review)
    app.get("/submissions/task/:taskId", verifyJWT, verifyBuyer, async (req, res) => {
      const taskId = req.params.taskId;
      const result = await submissionsCollection
        .find({ task_id: taskId })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    // Get submissions for a worker with pagination
    app.get("/submissions", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const page = parseInt(req.query.page) || 0;
      const size = parseInt(req.query.size) || 10;

      const query = { worker_email: email };
      
      const result = await submissionsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(page * size)
        .limit(size)
        .toArray();

      const totalCount = await submissionsCollection.countDocuments(query);

      res.send({ submissions: result, totalCount });
    });

    // Mark notifications as read
    app.patch("/notifications/mark-read", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const result = await notificationsCollection.updateMany(
        { toEmail: email, unread: true },
        { $set: { unread: false } }
      );
      res.send(result);
    });

    // Clear notifications
    app.delete("/notifications", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const result = await notificationsCollection.deleteMany({ toEmail: email });
      res.send(result);
    });

    // --- WITHDRAWALS API ---
    // Request a withdrawal (Worker only)
    app.post("/withdraw", verifyJWT, verifyWorker, async (req, res) => {
      const withdrawalData = req.body;
      const result = await withdrawalsCollection.insertOne({
        ...withdrawalData,
        status: "pending",
        createdAt: new Date(), // Changed from 'date' to 'createdAt'
      });

      // Create Notification for Admin (Notify about withdrawal request)
      const admins = await usersCollection.find({ role: "admin" }).toArray();
      for (const admin of admins) {
        await notificationsCollection.insertOne({
          message: `New withdrawal request of ${withdrawalData.withdrawal_coin} coins from ${withdrawalData.worker_email}`,
          toEmail: admin.email,
          actionRoute: "/dashboard/withdrawals",
          time: new Date(),
          unread: true
        });
      }

      res.send({ success: true, withdrawalId: result.insertedId });
    });

    // Get all withdrawals (Admin only)
    app.get("/withdrawals", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await withdrawalsCollection.find().sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    // Approve withdrawal (Admin only)
    app.patch("/withdraw/approve/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const withdraw = await withdrawalsCollection.findOne(query);
      if (!withdraw) return res.status(404).send({ message: "Withdrawal request not found" });

      // 1. Deduct coins from worker
      await usersCollection.updateOne(
        { email: withdraw.worker_email },
        { $inc: { coin: -withdraw.withdrawal_coin } }
      );

      // 2. Update withdrawal status
      const result = await withdrawalsCollection.updateOne(
        query,
        { $set: { status: "approved" } }
      );

      // 3. Create Notification for Worker
      await notificationsCollection.insertOne({
        message: `Your withdrawal request for ${withdraw.withdrawal_coin} coins ($${withdraw.withdrawal_amount}) has been approved!`,
        toEmail: withdraw.worker_email,
        actionRoute: "/dashboard/withdraw",
        time: new Date(),
        unread: true
      });

      res.send(result);
    });

    // Get notifications for a user
    app.get("/notifications", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const result = await notificationsCollection
        .find({ toEmail: email })
        .sort({ time: -1 })
        .toArray();
      res.send(result);
    });

    // Mark all notifications as read
    app.patch("/notifications/mark-read", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const result = await notificationsCollection.updateMany(
        { toEmail: email, unread: true },
        { $set: { unread: false } }
      );
      res.send(result);
    });

    // Clear (delete) all notifications for a user
    app.delete("/notifications", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const result = await notificationsCollection.deleteMany({ toEmail: email });
      res.send(result);
    });

    // --- USERS API ---
    // Create or update user (Registration/Login)
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        // If the user exists but has no coin field, assign default coins now
        if (existingUser.coin === undefined || existingUser.coin === null) {
          const defaultCoins = existingUser.role === "buyer" ? 50 : 10;
          await usersCollection.updateOne(query, { $set: { coin: defaultCoins } });
        }
        // If caller explicitly wants admin role (demo login), force update role
        if (user.role === "admin" && existingUser.role !== "admin") {
          await usersCollection.updateOne(query, { $set: { role: "admin" } });
        }
        return res.send({ message: "User already exists", insertedId: null });
      }

      // Initial coins for new users
      const initialCoins = user.role === "buyer" ? 50 : (user.role === "admin" ? 0 : 10);

      const result = await usersCollection.insertOne({
        ...user,
        coin: initialCoins,
      });

      // 2. Notify Admin about new user registration
      const admins = await usersCollection.find({ role: "admin" }).toArray();
      for (const admin of admins) {
        await notificationsCollection.insertOne({
          message: `New ${user.role} registered: ${user.email}`,
          toEmail: admin.email,
          actionRoute: "/dashboard/manage-users",
          time: new Date(),
          unread: true
        });
      }

      res.send(result);
    });

    // Get user role by email (Public - for JWT generation at login, no auth required)
    app.get("/users/check-role/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email }, { projection: { role: 1 } });
      res.send({ role: result?.role || "worker" });
    });

    // Get user by email
    app.get("/users/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });

    // Get all users (Admin only)
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // Update user role (Admin only)
    app.patch("/users/role/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const { role } = req.body;
      const result = await usersCollection.updateOne(
        { email },
        { $set: { role } }
      );
      res.send(result);
    });

    // Delete user (Admin only)
    app.delete("/users/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });


    // --- PAYMENTS API ---
    // Purchase coins (Buyer only)
    app.post("/payments", verifyJWT, verifyBuyer, async (req, res) => {
      const paymentData = req.body;
      const { coin, email } = paymentData;

      // 1. Record the payment
      const result = await paymentsCollection.insertOne({
        ...paymentData,
        date: new Date(),
      });

      // 2. Increment coins in user profile
      const updateResult = await usersCollection.updateOne(
        { email },
        { $inc: { coin: parseInt(coin) } }
      );

      // Create Notification for Admin (Notify about platform revenue)
      const admins = await usersCollection.find({ role: "admin" }).toArray();
      for (const admin of admins) {
        await notificationsCollection.insertOne({
          message: `${email} purchased ${coin} coins for $${paymentData.amount}`,
          toEmail: admin.email,
          actionRoute: "/dashboard/manage-users", // Or a specific payments review route
          time: new Date(),
          unread: true
        });
      }

      res.send({ success: true, paymentId: result.insertedId });
    });

    // --- DASHBOARD & STATS API ---
    // Top 6 workers by coin (Public)
    app.get("/top-workers", async (req, res) => {
      const result = await usersCollection
        .find({ role: "worker" })
        .sort({ coin: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // Admin Stats (Admin only)
    app.get("/admin-stats", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const totalWorkers = await usersCollection.countDocuments({ role: "worker" });
        const totalBuyers = await usersCollection.countDocuments({ role: "buyer" });
        
        // Use aggregation for sums
        const coinStats = await usersCollection.aggregate([
          { $group: { _id: null, totalCoins: { $sum: "$coin" } } }
        ]).toArray();
        const totalCoins = coinStats[0]?.totalCoins || 0;

        const totalPaymentsCount = await paymentsCollection.countDocuments();
        
        const paymentStats = await paymentsCollection.aggregate([
          { $group: { _id: null, totalAmount: { $sum: "$amount" } } }
        ]).toArray();
        const totalPaymentAmount = paymentStats[0]?.totalAmount || 0;

        const totalPayableResult = await tasksCollection.aggregate([
          { $group: { _id: null, total: { $sum: { $multiply: ["$required_workers", "$payable_amount"] } } } }
        ]).toArray();
        const totalPendingPayable = totalPayableResult[0]?.total || 0;

        res.send({ 
          totalWorkers, 
          totalBuyers, 
          totalCoins, 
          totalPaymentsCount, 
          totalPaymentAmount,
          totalPendingPayable
        });
      } catch (err) {
        console.error("Admin stats error:", err);
        res.status(500).send({ message: "Error fetching admin stats" });
      }
    });

    // Worker Stats (Worker only)
    app.get("/worker-stats/:email", verifyJWT, verifyWorker, async (req, res) => {
      const email = req.params.email;
      const totalSubmissions = await submissionsCollection.countDocuments({ worker_email: email });
      const pendingSubmissions = await submissionsCollection.countDocuments({ worker_email: email, status: "pending" });
      
      const approvedSubmissions = await submissionsCollection.find({ worker_email: email, status: "approved" }).toArray();
      const totalEarnings = approvedSubmissions.reduce((acc, curr) => acc + curr.payable_amount, 0);

      res.send({ totalSubmissions, pendingSubmissions, totalEarnings });
    });

    // Buyer Stats (Buyer only)
    app.get("/buyer-stats/:email", verifyJWT, verifyBuyer, async (req, res) => {
      const email = req.params.email;
      const totalTasks = await tasksCollection.countDocuments({ buyer_email: email });
      
      const tasks = await tasksCollection.find({ buyer_email: email }).toArray();
      const pendingTaskWorkers = tasks.reduce((acc, t) => acc + t.required_workers, 0);
      
      const payments = await paymentsCollection.find({ email: email }).toArray();
      const totalPayment = payments.reduce((acc, p) => acc + (p.amount || 0), 0);

      res.send({ totalTasks, pendingTaskWorkers, totalPayment });
    });

    // --- TEMPORARY ADMIN SETUP ---
    app.get("/force-admin/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.updateOne(
        { email },
        { $set: { role: "admin" } }
      );
      res.send({ success: true, message: `${email} is now an Admin!`, result });
    });

// --- BASE API ---
app.get("/", (req, res) => res.send("EarnStack Server is running"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
