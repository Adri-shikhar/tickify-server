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
const payments = db.collection("payments");
const users = db.collection("user");

function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
}

async function findById(collection, id) {
  if (!id) return null;
  const query = [{ _id: id }, { id }];
  if (ObjectId.isValid(id)) query.unshift({ _id: new ObjectId(id) });
  return collection.findOne({ $or: query });
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
  res.json(await tickets.find(filter).sort({ createdAt: -1 }).toArray());
}));

app.get("/api/tickets/admin", route(async (req, res) => {
  res.json(await tickets.find().sort({ createdAt: -1 }).toArray());
}));

app.get("/api/tickets/:id", route(async (req, res) => {
  const ticket = await findById(tickets, req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  res.json(ticket);
}));

app.post("/api/tickets", route(async (req, res) => {
  const { vendor_id, title, from, to, transportType, price, quantity, departureDateTime, vendorName, vendorEmail, imageUrl, perks } = req.body;

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
    imageUrl: imageUrl || "",
    perks: perks || {},
    status: "pending",
    createdAt: new Date(),
  };

  const result = await tickets.insertOne(newTicket);
  res.status(201).json({ ...newTicket, _id: result.insertedId });
}));


app.put("/api/tickets/:id", route(async (req, res) => {
  const ticket = await findById(tickets, req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (ticket.status === "rejected") {
    return res.status(400).json({ error: "Cannot update a rejected ticket" });
  }
  
  const { title, from, to, transportType, price, quantity, departureDateTime, imageUrl, perks } = req.body;

  await tickets.updateOne(
    { _id: ticket._id },
    {
      $set: {
        title,
        from,
        to,
        transportType,
        price,
        quantity,
        departureDateTime,
        imageUrl: imageUrl || "",
        perks: perks || {},
      },
    }
  );

  res.json({ success: true });
}));

app.delete("/api/tickets/:id", route(async (req, res) => {
  const ticket = await findById(tickets, req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  await tickets.deleteOne({ _id: ticket._id });
  res.json({ success: true });
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
  const { ticket_id, user_id, userName, userEmail, vendor_id, seatsBooked = 1 } = req.body;

  if (!ticket_id || !user_id) {
    return res.status(400).json({ error: "ticket_id and user_id are required" });
  }

  const ticket = await findById(tickets, ticket_id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (ticket.quantity < seatsBooked) {
    return res.status(400).json({ error: "Not enough tickets available" });
  }

  const newBooking = {
    ticket_id: String(ticket_id),
    user_id,
    userName,
    userEmail,
    vendor_id: String(vendor_id || ticket.vendor_id || ""),
    vendorName: ticket.vendorName || "",
    seatsBooked: Number(seatsBooked),
    totalPrice: Number(ticket.price) * Number(seatsBooked),
    ticketTitle: ticket.title,
    from: ticket.from || "",
    to: ticket.to || "",
    imageUrl: ticket.imageUrl || "",
    departureDateTime: ticket.departureDateTime,
    status: "pending",
    bookedAt: new Date(),
  };

  const result = await bookings.insertOne(newBooking);
  res.status(201).json({ ...newBooking, _id: result.insertedId });
}));

app.get("/api/bookings", route(async (req, res) => {
  if (req.query.user_id) {
    const list = await bookings.find({ user_id: req.query.user_id }).sort({ bookedAt: -1 }).toArray();
    return res.json(list);
  }

  if (req.query.vendor_id) {
    const vendorTickets = await tickets.find({ vendor_id: req.query.vendor_id }).toArray();
    const ticketIds = vendorTickets.flatMap((t) => [String(t._id), t._id]);
    const list = await bookings.find({ ticket_id: { $in: ticketIds } }).sort({ bookedAt: -1 }).toArray();
    return res.json(list);
  }

  res.json([]);
}));

app.get("/api/bookings/:id", route(async (req, res) => {
  const booking = await findById(bookings, req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  res.json(booking);
}));

app.patch("/api/bookings/:id", route(async (req, res) => {
  const { status } = req.body;
  if (status !== "accepted" && status !== "rejected") {
    return res.status(400).json({ error: "Invalid status" });
  }

  const booking = await findById(bookings, req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  await bookings.updateOne({ _id: booking._id }, { $set: { status } });
  res.json({ success: true, status });
}));

// --- Payments (POST only) ---

app.post("/api/payments", route(async (req, res) => {
  const { session_id, user_id, booking_id, currency, customerEmail, payment_intent_id } = req.body;

  if (!session_id || !user_id) {
    return res.status(400).json({ error: "session_id and user_id are required" });
  }

  const saved = await payments.findOne({ session_id });
  if (saved) return res.json(saved);

  const booking = await findById(bookings, booking_id);
  const ticket = booking ? await findById(tickets, booking.ticket_id) : null;

  const newPayment = {
    session_id,
    user_id,
    booking_id: booking ? String(booking._id) : "",
    vendor_id: booking?.vendor_id || ticket?.vendor_id || "",
    vendorName: booking?.vendorName || ticket?.vendorName || "",
    ticket_id: booking ? String(booking.ticket_id) : "",
    ticketTitle: booking?.ticketTitle || ticket?.title || "",
    quantity: booking?.seatsBooked || 1,
    totalPrice: booking?.totalPrice || 0,
    currency: currency || "usd",
    status: "paid",
    customerEmail: customerEmail || "",
    payment_intent_id: payment_intent_id || "",
    paidAt: new Date(),
    createdAt: new Date(),
  };

  const result = await payments.insertOne(newPayment);
// Update booking to paid and reduce ticket quantity
  if (booking) {
    await bookings.updateOne({ _id: booking._id }, { $set: { status: "paid" } });
    if (ticket) {
      await tickets.updateOne(
        { _id: ticket._id },
        { $inc: { quantity: -Number(booking.seatsBooked || 1) } }
      );
    }
  }


  res.status(201).json({ ...newPayment, _id: result.insertedId });
}));

app.get("/api/payments", route(async (req, res) => {
  if (req.query.vendor_id) {
    const list = await payments
      .find({ vendor_id: req.query.vendor_id })
      .sort({ paidAt: -1 })
      .toArray();
    return res.json(list);
  }

  if (req.query.user_id) {
    const list = await payments
      .find({ user_id: req.query.user_id })
      .sort({ paidAt: -1 })
      .toArray();
    return res.json(list);
  }

  res.status(400).json({ error: "user_id or vendor_id is required" });
}));

// --- Start ---

async function start() {
  await client.connect();
  console.log("Connected to MongoDB");
  app.listen(port, () => console.log("Tickify server on port " + port));
}

start().catch((error) => {
  console.error("Failed to start:", error);
  process.exit(1);
});
