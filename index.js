const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const db = client.db("Tickify");
const collection = db.collection("tickets");
const vendorsCollection = db.collection("vendors");

app.get("/", (req, res) => {
  res.send("Tickify API");
});

app.get("/api/tickets", async (req, res) => {
  try {
    const filter = req.query.vendor_id ? { vendor_id: req.query.vendor_id } : {};
    const tickets = await collection.find(filter).sort({ createdAt: -1 }).toArray();
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/tickets", async (req, res) => {
  try {
    const { vendor_id, ...rest } = req.body;

    if (!vendor_id) {
      return res.status(400).json({ error: "vendor_id is required" });
    }

    const ticket = {
      ...rest,
      vendor_id,
      status: "pending",
      createdAt: new Date(),
    };

    const result = await collection.insertOne(ticket);
    res.status(201).json({ ...ticket, _id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function start() {
  await client.connect();
  console.log("Connected to MongoDB");

  app.listen(port, () => {
    console.log(`Tickify server listening on port ${port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
