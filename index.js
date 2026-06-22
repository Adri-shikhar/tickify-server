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
const tickets = client.db("Tickify").collection("tickets");
const bookings = client.db("Tickify").collection("bookings");

// Helper to safely find a ticket by ObjectId or String fallback
async function findTicketById(id) {
  if (!id) return null;
  if (ObjectId.isValid(id)) {
    const ticket = await tickets.findOne({ _id: new ObjectId(id) });
    if (ticket) return ticket;
  }
  return tickets.findOne({ _id: id });
}

// GET /api/tickets — returns all tickets, or just one vendor's if ?vendor_id= is passed
app.get("/api/tickets", async (req, res) => {
  try {
    const filter = req.query.vendor_id ? { vendor_id: req.query.vendor_id } : {};
    const allTickets = await tickets.find(filter).sort({ createdAt: -1 }).toArray();
    res.json(allTickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// GET /api/tickets/admin — all tickets for admin dashboard
app.get("/api/tickets/admin", async (req, res) => {
  try {
    const allTickets = await tickets.find().sort({ createdAt: -1 }).toArray();
    res.json(allTickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/:id — returns one ticket by ID
app.get("/api/tickets/:id", async (req, res) => {
  try {
    const ticket = await findTicketById(req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tickets — creates a new ticket with status "pending"

app.post("/api/tickets", async (req, res) => {
  try {
    const { vendor_id, ...rest } = req.body;
    if (!vendor_id) return res.status(400).json({ error: "vendor_id is required" });

    const newTicket = { ...rest, vendor_id, status: "pending", createdAt: new Date() };
    const result = await tickets.insertOne(newTicket);
    res.status(201).json({ ...newTicket, _id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// POST /api/bookings — books seats and sets status to "waiting for confirm"

app.post("/api/bookings", async (req, res) => {
  try {
    const { ticket_id, user_id, userName, userEmail, seatsBooked = 1 } = req.body;

    if (!ticket_id || !user_id) {
      return res.status(400).json({ error: "ticket_id and user_id are required" });
    }

    const ticket = await findTicketById(ticket_id);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (ticket.quantity < seatsBooked) return res.status(400).json({ error: "Not enough tickets available" });

    // Decrement ticket availability count

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
      status: "waiting for confirm", // Workflow change 1: default status
      bookedAt: new Date(),
    };

    const result = await bookings.insertOne(newBooking);
    res.status(201).json({ ...newBooking, _id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bookings — returns bookings for a user (?user_id=) or a vendor (?vendor_id=)

app.get("/api/bookings", async (req, res) => {
  try {
    let filter = {};

    if (req.query.user_id) {
      filter = { user_id: req.query.user_id };
    } 
    else if (req.query.vendor_id) {
      const vendorTickets = await tickets.find({ vendor_id: req.query.vendor_id }).toArray();
      const ticketIds = vendorTickets.flatMap((t) => [String(t._id), t._id]);
      filter = { ticket_id: { $in: ticketIds } };
    }

    const allBookings = await bookings.find(filter).sort({ bookedAt: -1 }).toArray();
    res.json(allBookings);
  }
   catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/bookings/:id — Allows vendors to change status to "pay" or "rejected"

app.patch("/api/bookings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // Expected values: "pay" or "rejected"

    if (!["pay", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status change targeted" });
    }

    // Build standard multi-type selector check matching your schema structures

    const filter = ObjectId.isValid(id)
      ? { $or: [{ _id: new ObjectId(id) }, { _id: id }] }
      : { _id: id };

    const result = await bookings.updateOne(filter, { $set: { status } });

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Booking item not found" });
    }

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function start() {
  await client.connect();
  console.log("Connected to MongoDB");
  app.listen(port, () => console.log(`Tickify server listening on port ${port}`));
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});