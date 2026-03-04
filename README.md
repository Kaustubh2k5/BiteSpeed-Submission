# BiteSpeed-Submission
This is a submission for the BiteSpeed Backend engineer intern role. ps since, i am runnning a free instance on render initial startup may take time (1-2mins).
# FluxKart Identity Reconciliation API

A backend service that performs **customer identity reconciliation**.  
When customers place orders using different emails or phone numbers, the system intelligently **links related contacts together** and maintains a **single primary identity**.

This project also includes a **FluxKart test portal UI** that simulates order submissions and allows visual testing of identity merging.

---

# Live Demo

Frontend + API deployed at:

https://bitespeed-submission-hqyx.onrender.com/

The portal allows you to:

- Place orders with different emails and phone numbers
- Trigger identity merging
- View linked purchase history
- Observe how contacts are reconciled into a single identity

---

# Problem Overview

Customers may place orders using different contact details over time:

- Different email addresses
- Different phone numbers
- Sometimes only one identifier

The system must determine whether these orders belong to the **same person** and consolidate them.

---

# Identity Reconciliation Rules

1. Every new identity begins as a **primary contact**.
2. If a request shares an **email or phone number** with an existing contact, it becomes linked.
3. If two **primary contacts later become connected**, one becomes **secondary**.
4. Each identity group always maintains **one primary contact**.
5. All associated emails and phone numbers are aggregated under the primary identity.

---

# Tech Stack

- **Node.js**
- **Express**
- **TypeScript**
- **PostgreSQL (Neon serverless database)**
- **Prisma ORM**
- **Render (deployment)**

---

# Database

The project uses **Neon Serverless Postgres**.

Neon provides:

- serverless PostgreSQL
- automatic scaling
- connection pooling
- branchable databases

The database stores:

- contact identities
- primary / secondary relationships
- timestamps for identity creation

---

# Project Structure

```
.
├── public/
│   └── index.html          # FluxKart UI portal
│
├── src/
│   ├── index.ts            # Express server
│   ├── db.ts               # Prisma / DB connection
│   └── identifyService.ts  # Identity reconciliation logic
│
├── package.json
├── tsconfig.json
└── README.md
```

---

# API Endpoints

The project exposes two endpoints.

---

# POST `/identify`

Creates or links a contact identity.

### Request Body

```json
{
  "email": "example@email.com",
  "phoneNumber": "123456"
}
```

At least **one field must be provided**.

---

### Example Request

```
curl -X POST https://bitespeed-submission-hqyx.onrender.com/identify \
-H "Content-Type: application/json" \
-d '{
  "email": "lorraine@hillvalley.edu",
  "phoneNumber": "123456"
}'
```

---

### Example Response

```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": [
      "lorraine@hillvalley.edu",
      "mcfly@hillvalley.edu"
    ],
    "phoneNumbers": [
      "123456"
    ],
    "secondaryContactIds": [2]
  }
}
```

---

# POST `/history`

Returns all contacts associated with a given identity.

---

### Request Body

```json
{
  "email": "example@email.com",
  "phoneNumber": "123456"
}
```

Either field may be provided.

---

### Example Request

```
curl -X POST https://bitespeed-submission-hqyx.onrender.com/history \
-H "Content-Type: application/json" \
-d '{
  "email": "lorraine@hillvalley.edu"
}'
```

---

### Example Response

```json
{
  "primaryContactId": 1,
  "totalEntries": 3,
  "logs": [
    {
      "id": 1,
      "email": "lorraine@hillvalley.edu",
      "phoneNumber": "123456",
      "firstSeen": "2025-01-01T10:00:00.000Z",
      "type": "primary"
    }
  ]
}
```

---

# Testing the API

You can test the system in three ways.

---

## 1. Using the FluxKart Portal

Open:

https://bitespeed-submission-hqyx.onrender.com/

Submit orders with different emails and phone numbers to observe identity reconciliation.

---

## 2. Using curl

Example:

```
curl -X POST https://bitespeed-submission-hqyx.onrender.com/identify \
-H "Content-Type: application/json" \
-d '{"email":"test@email.com"}'
```

---

## 3. Using Postman / Insomnia

Endpoints:

```
POST /identify
POST /history
```

Body format: **JSON**

---

# Running Locally

### Install dependencies

```
npm install
```

### Build TypeScript

```
npm run build
```

### Start server

```
npm start
```

Server will run at:

```
http://localhost:3000
```

---

# Deployment

The project is deployed using **Render**.

Build command:

```
npm install && npm run build
```

Start command:

```
npm start
```

The server also serves the frontend UI from the `/public` directory.

---

# Author

**Kaustubh Sardesai**

GitHub  
https://github.com/Kaustubh2k5

LinkedIn  
https://www.linkedin.com/in/kaustubh-sardesai2k5/

---

# Notes

The **FluxKart UI** is a demonstration interface that simulates customer orders and visualizes identity merging.

The core backend functionality is implemented in the **/identify** and **/history** API endpoints.
