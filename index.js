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
  }
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();
    
    const db = client.db("earnstackDB");
    const usersCollection = db.collection("users");
    const tasksCollection = db.collection("tasks");
    const submissionsCollection = db.collection("submissions");
    const paymentsCollection = db.collection("payments");
    const withdrawalsCollection = db.collection("withdrawals");
    const notificationsCollection = db.collection("notifications");


    // Ping to confirm connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

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

    // --- WITHDRAWALS API ---
    // Request a withdrawal (Worker only)
    app.post("/withdraw", verifyJWT, verifyWorker, async (req, res) => {
      const withdrawalData = req.body;
      const result = await withdrawalsCollection.insertOne({
        ...withdrawalData,
        status: "pending",
        date: new Date(),
      });
      res.send({ success: true, withdrawalId: result.insertedId });
    });

    // Get all withdrawals (Admin only)
    app.get("/withdrawals", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await withdrawalsCollection.find().sort({ date: -1 }).toArray();
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

    // --- USERS API ---
    // Create or update user (Registration/Login)
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }

      // Initial coins
      const initialCoins = user.role === "buyer" ? 50 : 10;

      const result = await usersCollection.insertOne({
        ...user,
        coin: initialCoins,
      });
      res.send(result);
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

      res.send({ success: true, paymentId: result.insertedId });
    });

    // --- BASE API ---
    app.get("/", (req, res) => res.send("EarnStack Server is running"));

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
