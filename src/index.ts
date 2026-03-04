import express from 'express'
import dotenv from 'dotenv'
dotenv.config()
import path from 'path'
import pool from './db'
const app = express()
app.use(express.json())
app.use(express.static(path.join(process.cwd(), 'public')))

import { identifyContact, savePurchase } from './identifyService'

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"))
})

app.post('/identify', async (req, res) => {
  const { email, phoneNumber, parts = [] } = req.body
  if (!email && !phoneNumber) {
    return res.status(400).json({ error: 'email or phoneNumber required' })
  }
  try {
    const result = await identifyContact(email ?? null, phoneNumber ? String(phoneNumber) : null)
    
    // Save purchase if parts were selected
    let purchase = null
    if (parts.length > 0) {
      purchase = await savePurchase(result.contact.primaryContatctId, parts)
    }

    return res.status(200).json({ ...result, purchase })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})


app.post('/history', async (req, res) => {
  const { email, phoneNumber } = req.body

  if (!email && !phoneNumber) {
    return res.status(400).json({ error: 'email or phoneNumber required' })
  }

  try {
    // Find the primary contact
    const { rows: matches } = await pool.query(
      `SELECT * FROM "Contact" WHERE "deletedAt" IS NULL
        AND (
        ($1::text IS NOT NULL AND email = $1) OR 
        ($2::text IS NOT NULL AND "phoneNumber" = $2)
        )
        LIMIT 1`,
      [email ?? null, phoneNumber ?? null]
    )

    if (matches.length === 0) {
      return res.status(404).json({ error: 'No contact found' })
    }

    const contact = matches[0]
    const primaryId = contact.linkPrecedence === 'primary'
      ? contact.id
      : contact.linkedId

    // Fetch full history
    const { rows: history } = await pool.query(
      `SELECT * FROM "Contact"
       WHERE "deletedAt" IS NULL
       AND (id = $1 OR "linkedId" = $1)
       ORDER BY "createdAt" ASC`,
      [primaryId]
    )

    // Inside /history, after fetching history rows:
    const { rows: purchases } = await pool.query(
    `SELECT p.* FROM "Purchase" p
    JOIN "Contact" c ON c.id = p."contactId"
    WHERE c.id = $1 OR c."linkedId" = $1
    ORDER BY p."createdAt" DESC`,
    [primaryId]
    )

    return res.status(200).json({
    primaryContactId: primaryId,
    totalEntries: history.length,
    logs: history.map(c => ({ ...c })),
    purchases
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

