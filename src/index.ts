import express, { Request, Response, NextFunction } from "express"
import dotenv, { config } from "dotenv"
import path from "path"
import helmet from "helmet"
import rateLimit from "express-rate-limit"
import morgan from "morgan"

import pool from "./db"
import { identifyContact, savePurchase } from "./identifyService"

dotenv.config()

const app = express()

/* ---------------- Middleware ---------------- */
// parse json bodies up to 5mb in size to prevent abuse with large payloads
app.use(express.json({ limit: "5mb" }))
// helmet adds various security headers to prevent common web vulnerabilities
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],

        // allow inline JS + event handlers
        scriptSrc: ["'self'", "'unsafe-inline'"],

        // allow inline onclick etc
        scriptSrcAttr: ["'unsafe-inline'"],

        // fonts for your Google Fonts
        fontSrc: ["'self'", "https://fonts.gstatic.com"],

        // styles for Google Fonts
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],

        imgSrc: ["'self'", "data:"]
      }
    }
  })
)
// rate limit to prevent abuse and DDoS attacks. limits to 100 requests per minute per IP address
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100
  })
)
// morgan logs incoming requests in dev format for easier debugging and monitoring
app.use(morgan("dev"))

/* ---------------- Static Files ---------------- */

const publicPath = path.join(__dirname, "../public")

app.use(express.static(publicPath))

app.get("/", (req: Request, res: Response) =>  {
    console.log("Sending file")
  res.sendFile(path.join(publicPath, "index.html"))
})

/* ---------------- Utils ---------------- */

function normalizePhone(phone?: string | null) {
  if (!phone) return null
  return phone.replace(/\D/g, "")
}

function validateIdentifyBody(body: any) {
  const { email, phoneNumber, parts } = body

  if (!email && !phoneNumber) {
    return "email or phoneNumber required"
  }

  if (email && typeof email !== "string") {
    return "email must be a string"
  }

  if (phoneNumber && typeof phoneNumber !== "string" && typeof phoneNumber !== "number") {
    return "phoneNumber must be string or number"
  }

  if (parts && !Array.isArray(parts)) {
    return "parts must be an array"
  }

  return null
}

/* ---------------- Routes ---------------- */

app.post("/identify", async (req, res, next) => {
  try {

    const error = validateIdentifyBody(req.body)
    if (error) {
      return res.status(400).json({ error })
    }

    const { email, phoneNumber, parts = [] } = req.body

    const phone = normalizePhone(phoneNumber ? String(phoneNumber) : null)

    const result = await identifyContact(email ?? null, phone)

    let purchase = null

    if (parts.length > 0) {
      purchase = await savePurchase(
        result.contact.primaryContactId,
        parts
      )
    }

    res.status(200).json({
      contact: result.contact,
      purchase
    })

  } catch (err) {
    next(err)
  }
})

app.post("/history", async (req, res, next) => {
  try {

    const error = validateIdentifyBody(req.body)
    if (error) {
      return res.status(400).json({ error })
    }

    const { email, phoneNumber } = req.body

    const normalizedEmail = email?.toLowerCase() ?? null
    const phone = normalizePhone(phoneNumber ? String(phoneNumber) : null)

    const { rows: matches } = await pool.query(
      `
      SELECT *
      FROM "Contact"
      WHERE "deletedAt" IS NULL
      AND (
        ($1::text IS NOT NULL AND email = $1)
        OR
        ($2::text IS NOT NULL AND "phoneNumber" = $2)
      )
      LIMIT 1
      `,
      [normalizedEmail, phone ?? null]
    )

    if (matches.length === 0) {
      return res.status(404).json({ error: "No contact found" })
    }

    const [contact] = matches

    const primaryId =
      contact.linkPrecedence === "primary"
        ? contact.id
        : contact.linkedId

    const { rows: history } = await pool.query(
      `
      SELECT *
      FROM "Contact"
      WHERE "deletedAt" IS NULL
      AND (id=$1 OR "linkedId"=$1)
      ORDER BY "createdAt"
      `,
      [primaryId]
    )

    const { rows: purchases } = await pool.query(
      `
      SELECT p.*
      FROM "Purchase" p
      JOIN "Contact" c
      ON c.id = p."contactId"
      WHERE c.id = $1 OR c."linkedId" = $1
      ORDER BY p."createdAt" DESC
      `,
      [primaryId]
    )

    res.status(200).json({
      primaryContactId: primaryId,
      totalContacts: history.length,
      contacts: history,
      purchases
    })

  } catch (err) {
    next(err)
  }
})

/* ---------------- Error Handler ---------------- */

app.use((err: any, req: any, res: any, next: any) => {
  console.error("Server Error:", err)

  res.status(500).json({
    error: "Internal server error"
  })
})

/* ---------------- Server ---------------- */

const PORT = process.env.PORT || 3000

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

/* ---------------- Graceful Shutdown ---------------- */

process.on("SIGINT", async () => {
  console.log("Shutting down server...")

  server.close(async () => {
    await pool.end()
    process.exit(0)
  })
})

process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Closing server...")

  server.close(async () => {
    await pool.end()
    process.exit(0)
  })
})