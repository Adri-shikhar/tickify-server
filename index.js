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
const users = client.db("Tickify").collection("user");

// Helper to safely find a ticket by ObjectId or String fallback
async function findTicketById(ticketId) {
  if (!ticketId) {
    return null;
  }
  
  if (ObjectId.isValid(ticketId)) {
    const ticketFound = await tickets.findOne({ _id: new ObjectId(ticketId) });
    if (ticketFound) {
      return ticketFound;
    }
  }
  
  const ticketFallback = await tickets.findOne({ _id: ticketId });
  return ticketFallback;
}

app.get("/api/users", async function (request, response) {
  try {
    const allUsers = await users.find().sort({ createdAt: -1 }).toArray();
    response.json(allUsers);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

// GET /api/tickets — returns all tickets, or just one vendor's if ?vendor_id= is passed
app.get("/api/tickets", async function (request, response) {
  try {
    let filterObject = {};
    if (request.query.vendor_id) {
      filterObject = { vendor_id: request.query.vendor_id };
    }
    
    const allTickets = await tickets.find(filterObject).sort({ createdAt: -1 }).toArray();
    response.json(allTickets);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

// GET /api/tickets/admin — all tickets for admin dashboard
app.get("/api/tickets/admin", async function (request, response) {
  try {
    const allTickets = await tickets.find().sort({ createdAt: -1 }).toArray();
    response.json(allTickets);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

// GET /api/tickets/:id — returns one ticket by ID
app.get("/api/tickets/:id", async function (request, response) {
  try {
    const ticketId = request.params.id;
    const ticket = await findTicketById(ticketId);
    
    if (!ticket) {
      return response.status(404).json({ error: "Ticket not found" });
    }
    
    response.json(ticket);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

// POST /api/tickets — creates a new ticket with status "pending"
app.post("/api/tickets", async function (request, response) {
  try {
    const vendorId = request.body.vendor_id;
    if (!vendorId) {
      return response.status(400).json({ error: "vendor_id is required" });
    }

    const newTicket = {
      vendor_id: vendorId,
      title: request.body.title,
      from: request.body.from,
      to: request.body.to,
      transportType: request.body.transportType,
      price: request.body.price,
      quantity: request.body.quantity,
      departureDateTime: request.body.departureDateTime,
      vendorName: request.body.vendorName,
      vendorEmail: request.body.vendorEmail,
      status: "pending",
      createdAt: new Date()
    };

    const result = await tickets.insertOne(newTicket);
    newTicket._id = result.insertedId;
    
    response.status(201).json(newTicket);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

// PATCH /api/tickets/:id — admin updates ticket status
app.patch("/api/tickets/:id", async function (request, response) {
  try {
    const ticketId = request.params.id;
    const newStatus = request.body.status;

    if (newStatus !== "accepted" && newStatus !== "rejected") {
      return response.status(400).json({ error: "Status must be accepted or rejected" });
    }

    const ticket = await findTicketById(ticketId);
    if (!ticket) {
      return response.status(404).json({ error: "Ticket not found" });
    }

    await tickets.updateOne({ _id: ticket._id }, { $set: { status: newStatus } });

    response.json({ success: true, status: newStatus });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

// POST /api/bookings — books seats and sets status to "waiting for confirm"
app.post("/api/bookings", async function (request, response) {
  try {
    const ticketId = request.body.ticket_id;
    const userId = request.body.user_id;
    const userName = request.body.userName;
    const userEmail = request.body.userEmail;
    
    let seatsBooked = request.body.seatsBooked;
    if (!seatsBooked) {
      seatsBooked = 1;
    }

    if (!ticketId || !userId) {
      return response.status(400).json({ error: "ticket_id and user_id are required" });
    }

    const ticket = await findTicketById(ticketId);
    if (!ticket) {
      return response.status(404).json({ error: "Ticket not found" });
    }
    
    if (ticket.quantity < seatsBooked) {
      return response.status(400).json({ error: "Not enough tickets available" });
    }

    // Decrement ticket availability count
    const remainingSeatsCount = -Number(seatsBooked);
    await tickets.updateOne({ _id: ticket._id }, { $inc: { quantity: remainingSeatsCount } });

    const totalCalculatedPrice = Number(ticket.price) * Number(seatsBooked);

    const newBooking = {
      ticket_id: ticketId,
      user_id: userId,
      userName: userName,
      userEmail: userEmail,
      seatsBooked: Number(seatsBooked),
      totalPrice: totalCalculatedPrice,
      ticketTitle: ticket.title,
      departureDateTime: ticket.departureDateTime,
      status: "waiting for confirm", // Workflow change 1: default status
      bookedAt: new Date()
    };

    const result = await bookings.insertOne(newBooking);
    newBooking._id = result.insertedId;

    response.status(201).json(newBooking);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

// GET /api/bookings — returns bookings for a user (?user_id=) or a vendor (?vendor_id=)
app.get("/api/bookings", async function (request, response) {
  try {
    let searchFilter = {};

    if (request.query.user_id) {
      searchFilter = { user_id: request.query.user_id };
    } 
    else if (request.query.vendor_id) {
      const vendorTickets = await tickets.find({ vendor_id: request.query.vendor_id }).toArray();
      
      let ticketIdsArray = [];
      for (let i = 0; i < vendorTickets.length; i++) {
        const currentTicket = vendorTickets[i];
        ticketIdsArray.push(String(currentTicket._id));
        ticketIdsArray.push(currentTicket._id);
      }
      
      searchFilter = { ticket_id: { $in: ticketIdsArray } };
    }

    const allBookings = await bookings.find(searchFilter).sort({ bookedAt: -1 }).toArray();
    response.json(allBookings);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

// PATCH /api/bookings/:id — Allows vendors to change status to "pay" or "rejected"
app.patch("/api/bookings/:id", async function (request, response) {
  try {
    const bookingId = request.params.id;
    const targetStatus = request.body.status;

    if (targetStatus !== "pay" && targetStatus !== "rejected") {
      return response.status(400).json({ error: "Invalid status change targeted" });
    }

    // Build standard multi-type selector check matching your schema structures
    let searchFilter = { _id: bookingId };
    if (ObjectId.isValid(bookingId)) {
      searchFilter = { 
        $or: [
          { _id: new ObjectId(bookingId) }, 
          { _id: bookingId }
        ] 
      };
    }

    const result = await bookings.updateOne(searchFilter, { $set: { status: targetStatus } });

    if (result.matchedCount === 0) {
      return response.status(404).json({ error: "Booking item not found" });
    }

    response.json({ success: true, status: targetStatus });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

async function start() {
  await client.connect();
  console.log("Connected to MongoDB");
  app.listen(port, function () {
    console.log("Tickify server listening on port " + port);
  });
}

start().catch(function (error) {
  console.error("Failed to start server:", error);
  process.exit(1);
});