const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db("Tickify");
const tickets = db.collection("tickets");
const bookings = db.collection("bookings");
const users = db.collection("user");

// Wrap routes so we don't repeat try/catch everywhere
function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
}

// Find a document by id (works with ObjectId or string ids)
function idQuery(id) {
  if (!id) return null;
  const query = [{ _id: id }, { id }];
  if (ObjectId.isValid(id)) query.unshift({ _id: new ObjectId(id) });
  return { $or: query };
}

async function findById(collection, id) {
  const query = idQuery(id);
  return query ? collection.findOne(query) : null;
}

async function getTickets(filter = {}) {
  return tickets.find(filter).sort({ createdAt: -1 }).toArray();
}

// --- Users ---

app.get("/api/users", route(async (req, res) => {
  res.json(await users.find().sort({ createdAt: -1 }).toArray());
}));


app.patch("/api/users/:id/vendor", route(async (req, res) => {
  const user = await findById(users, req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  await users.updateOne({ _id: user._id }, { $set: { role: "vendor" } });
  res.json({ success: true, role: "vendor" });
}));


app.patch("/api/users/:id/admin", route(async (req, res) => {
  const user = await findById(users, req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  await users.updateOne({ _id: user._id }, { $set: { role: "admin" } });
  res.json({ success: true, role: "admin" });
}));

app.patch("/api/users/:id/fraud", route(async (req, res) => {
  const user = await findById(users, req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  await users.updateOne({ _id: user._id }, { $set: { isFraud: true } });
  res.json({ success: true, isFraud: true });
}));

// --- Tickets ---

app.get("/api/tickets", route(async (req, res) => {
  const filter = req.query.vendor_id ? { vendor_id: req.query.vendor_id } : {};
  res.json(await getTickets(filter));
}));

app.get("/api/tickets/admin", route(async (req, res) => {
  res.json(await getTickets());
}));


app.get("/api/tickets/:id", route(async (req, res) => {
  const ticket = await findById(tickets, req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  res.json(ticket);
}));

app.post("/api/tickets", route(async (req, res) => {
  const { vendor_id, title, from, to, transportType, price, quantity, departureDateTime, vendorName, vendorEmail } = req.body;

  if (!vendor_id) return res.status(400).json({ error: "vendor_id is required" });

  const newTicket = {
    vendor_id,
    title,
    from,
    to,
    transportType,
    price,
    quantity,
    departureDateTime,
    vendorName,
    vendorEmail,
    status: "pending",
    createdAt: new Date(),
  };

  const result = await tickets.insertOne(newTicket);
  res.status(201).json({ ...newTicket, _id: result.insertedId });
}));

app.patch("/api/tickets/:id", route(async (req, res) => {
  const { status } = req.body;
  if (status !== "accepted" && status !== "rejected") {
    return res.status(400).json({ error: "Status must be accepted or rejected" });
  }

  const ticket = await findById(tickets, req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  await tickets.updateOne({ _id: ticket._id }, { $set: { status } });
  res.json({ success: true, status });
}));

// --- Bookings ---

app.post("/api/bookings", route(async (req, res) => {
  const { ticket_id, user_id, userName, userEmail, seatsBooked = 1 } = req.body;

  if (!ticket_id || !user_id) {
    return res.status(400).json({ error: "ticket_id and user_id are required" });
  }

  const ticket = await findById(tickets, ticket_id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (ticket.quantity < seatsBooked) {
    return res.status(400).json({ error: "Not enough tickets available" });
  }

  await tickets.updateOne({ _id: ticket._id }, { $inc: { quantity: -Number(seatsBooked) } });

  const newBooking = {
    ticket_id,
    user_id,
    userName,
    userEmail,
    seatsBooked: Number(seatsBooked),
    totalPrice: Number(ticket.price) * Number(seatsBooked),
    ticketTitle: ticket.title,
    departureDateTime: ticket.departureDateTime,
    status: "waiting for confirm",
    bookedAt: new Date(),
  };

  const result = await bookings.insertOne(newBooking);
  res.status(201).json({ ...newBooking, _id: result.insertedId });
}));

app.get("/api/bookings", route(async (req, res) => {
  let filter = {};

  if (req.query.user_id) {
    filter = { user_id: req.query.user_id };
  } else if (req.query.vendor_id) {
    const vendorTickets = await tickets.find({ vendor_id: req.query.vendor_id }).toArray();
    const ticketIds = vendorTickets.flatMap((t) => [String(t._id), t._id]);
    filter = { ticket_id: { $in: ticketIds } };
  }

  res.json(await bookings.find(filter).sort({ bookedAt: -1 }).toArray());
}));

app.patch("/api/bookings/:id", route(async (req, res) => {
  const { status } = req.body;
  if (status !== "pay" && status !== "rejected") {
    return res.status(400).json({ error: "Invalid status change targeted" });
  }

  const booking = await findById(bookings, req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking item not found" });

  await bookings.updateOne({ _id: booking._id }, { $set: { status } });
  res.json({ success: true, status });
}));

// --- Start server ---

async function start() {
  await client.connect();
  console.log("Connected to MongoDB");
  app.listen(port, () => console.log("Tickify server listening on port " + port));
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
