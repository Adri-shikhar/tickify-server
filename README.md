# Tickify — Server (API)

Express.js REST API for the [Tickify](https://tickify-psi.vercel.app/) ticket booking platform. Handles tickets, bookings, payments, and user fraud flags. Used by the Next.js client with Bearer token authentication.

## Live API

**Base URL:** [https://tickify-server-psi.vercel.app](https://tickify-server-psi.vercel.app)

**Frontend:** [https://tickify-psi.vercel.app/](https://tickify-psi.vercel.app/)

---

## Tech Stack

- **Node.js**
- **Express 5**
- **MongoDB** (database: `Tickify`)

---

## Run Locally

### 1. Install dependencies

```bash
cd tickify-server
npm install
```

### 2. Environment variables

Create a `.env` file in the `tickify-server` folder:

```env
MONGODB_URI=your_mongodb_connection_string
PORT=5000
```

### 3. Start the server

```bash
npm start
```

Server runs at [http://localhost:5000](http://localhost:5000)

---

## Deploy to Vercel (Backend)

1. Push the `tickify-server` folder to GitHub and import as a separate Vercel project (or monorepo with root `tickify-server`).
2. Add environment variable:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB Atlas connection string |

3. Vercel sets `PORT` automatically.
4. Set the client `TICKIFY_API_URL` to your deployed server URL, e.g. `https://tickify-server-psi.vercel.app`

---

## API Overview

### Tickets
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tickets` | Optional | Public approved tickets |
| GET | `/api/tickets/latest` | No | Latest tickets for home |
| GET | `/api/tickets/advertised` | No | Featured / advertised tickets |
| GET | `/api/tickets/:id` | Yes | Single ticket detail |
| GET | `/api/tickets/admin` | Admin | All tickets for admin |
| POST | `/api/tickets` | Vendor | Create ticket |
| PATCH | `/api/tickets/:id` | Vendor/Admin | Update ticket or status (`accepted` / `rejected`) |
| DELETE | `/api/tickets/:id` | Vendor | Delete ticket |
| PATCH | `/api/tickets/:id/advertise` | Admin | Toggle advertisement |

### Bookings
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/bookings?user_id=` | User | User's bookings |
| GET | `/api/bookings?vendor_id=` | Vendor | Vendor booking requests |
| GET | `/api/bookings/:id` | Yes | Single booking |
| POST | `/api/bookings` | User | Create booking |
| PATCH | `/api/bookings/:id` | Vendor | Accept / reject booking |

### Payments & Users
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/payments` | Yes | Record payment after Stripe |
| GET | `/api/payments` | User | Payment history |
| PATCH | `/api/users/:id/vendor` | Admin | Promote user to vendor |
| PATCH | `/api/users/:id/admin` | Admin | Promote user to admin |
| PATCH | `/api/users/:id/fraud` | Admin | Mark vendor as fraud |

### Authentication

Protected routes expect:

```
Authorization: Bearer <session_token>
```

Token is issued by Better Auth on the Next.js client.

---

## Database Collections

| Collection | Purpose |
|------------|---------|
| `tickets` | Trip listings |
| `bookings` | User reservations |
| `payments` | Completed transactions |
| `user` | User accounts (Better Auth) |
| `session` | Auth sessions |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Express server |

---

## Related Repository

Next.js frontend: see `tickify/README.md`

---

## Author

Programming Hero — Tickify Platform Assignment
