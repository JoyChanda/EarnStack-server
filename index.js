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

      res.send({ success: true });
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
