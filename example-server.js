// Simple Express Server Example - Based on EarnStack
// This is a minimal version showing the basic structure

const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
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
    // Connect to MongoDB
    await client.connect();
    console.log("✅ Connected to MongoDB!");

    // Database and Collections
    const db = client.db("earnstackDB");
    const usersCollection = db.collection("users");
    const tasksCollection = db.collection("tasks");

    // --- ROUTES ---
    
    // Root route
    app.get('/', (req, res) => {
      res.send('🚀 EarnStack Server is running!');
    });

    // Get all users (example)
    app.get('/users', async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // Get all tasks (example)
    app.get('/tasks', async (req, res) => {
      const tasks = await tasksCollection.find().toArray();
      res.send(tasks);
    });

    // Create a new user (example)
    app.post('/users', async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send({ success: true, insertedId: result.insertedId });
    });

    // Health check
    app.get('/health', (req, res) => {
      res.send({ status: 'OK', timestamp: new Date() });
    });

  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
  }
}

// Start the server
run().catch(console.dir);

app.listen(port, () => {
  console.log(`🎯 EarnStack server listening on port ${port}`);
  console.log(`📍 http://localhost:${port}`);
});
