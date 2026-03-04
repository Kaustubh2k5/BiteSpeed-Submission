import { PoolClient } from 'pg'
import pool from './db'

// this is the datatype that matches the Contact table schema in the database
type Contact = {
  id: number
  email: string | null
  phoneNumber: string | null
  linkedId: number | null
  linkPrecedence: 'primary' | 'secondary'
  createdAt: Date
}

// this is the part which handles indentify endpoint, 
export async function identifyContact(email?: string | null, phone?: string | null) {
  //throw an error if both email and phone are missing
  if (!email && !phone) {
    throw new Error("email or phoneNumber required")
  }
  // connect a single client to handle the entire transaction for this request
  const client = await pool.connect()

  // start a transaction in the db
  try {
    await client.query("BEGIN")

    //find matches takes email and phone as arg and returns all matching contacts. in the off chance that 
    // there are no matches, it will return an empty arr (.length == 0). we detect that and create a new primary
    const matches = await findMatches(client, email, phone)

    if (matches.length === 0) {
      const primary = await createPrimary(client, email, phone)
      await client.query("COMMIT")
      return buildResponse(primary, [])
    }
    // resolvePrimary takes the matches and returns the primary contact. if there are multiple primary contacts,
    const primary = await resolvePrimary(client, matches)
    // getCluster takes the primary contact and returns all contacts in the cluster
    const cluster = await getCluster(client, primary.id)

    const updatedCluster = await createSecondaryIfNeeded(
      client,
      cluster,
      primary.id,
      email,
      phone
    )
    // commit the transaction
    await client.query("COMMIT")

    const secondaries = updatedCluster.filter(
      c => c.linkPrecedence === "secondary"
    )
    // buildResponse takes the primary and secondaries and returns the response object
    return buildResponse(primary, secondaries)

  } // rollback the transaction if anything goes wrong and rethrow the error
  catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
  }
}

// findMatches takes email and phone as arg and returns all matching contacts. in the off chance that 
// there are no matches, it will return an empty arr (.length == 0).
async function findMatches(
  client: PoolClient, email?: string | null, phone?: string | null): Promise<Contact[]> {

  const { rows } = await client.query(
    `
    SELECT *
    FROM "Contact"
    WHERE "deletedAt" IS NULL
    AND (
          ($1::text IS NOT NULL AND email = $1)
          OR
          ($2::text IS NOT NULL AND "phoneNumber" = $2)
        )
    `,
    [email ?? null, phone ?? null]
  )

  return rows as Contact[]
}

// createPrimary takes email and phone as arg and creates a new primary contact. it returns the primary contact.
async function createPrimary(client: any, email?: string | null, phone?: string | null) {
  const { rows } = await client.query(
    `
    INSERT INTO "Contact"
    (email, "phoneNumber", "linkPrecedence", "createdAt", "updatedAt")
    VALUES ($1, $2, 'primary', NOW(), NOW())
    RETURNING *
    `,
    [email ?? null, phone ?? null]
  )

  return rows[0] as Contact
}
// resolvePrimary takes the matches and returns the primary contact. 
//if there are multiple primary contacts, it resolves them by creation date 
// and updates the others to be secondary linked to the true primary.
async function resolvePrimary(client: any, matches: Contact[]) {

  const primaryIds = matches.map(c =>
    c.linkPrecedence === "primary" ? c.id : c.linkedId
  )

  const { rows } = await client.query(
    `
    SELECT *
    FROM "Contact"
    WHERE id = ANY($1)
    ORDER BY "createdAt" ASC
    `,
    [primaryIds]
  )

  const [truePrimary, ...others] = rows as Contact[]

  if (others.length > 0) {
    const ids = others.map(p => p.id)

    await client.query(
      `
      UPDATE "Contact"
      SET "linkPrecedence" = 'secondary',
          "linkedId" = $1,
          "updatedAt" = NOW()
      WHERE id = ANY($2)
      `,
      [truePrimary.id, ids]
    )

    await client.query(
      `
      UPDATE "Contact"
      SET "linkedId" = $1
      WHERE "linkedId" = ANY($2)
      `,
      [truePrimary.id, ids]
    )
  }

  return truePrimary
}

async function getCluster(client: any, primaryId: number) {
  const { rows } = await client.query(
    `
    SELECT *
    FROM "Contact"
    WHERE "deletedAt" IS NULL
      AND (id = $1 OR "linkedId" = $1)
    ORDER BY "createdAt"
    `,
    [primaryId]
  )

  return rows as Contact[]
}

async function createSecondaryIfNeeded(
  client: any,
  cluster: Contact[],
  primaryId: number,
  email?: string | null,
  phone?: string | null
) {

  const emails = new Set(cluster.map(c => c.email).filter(Boolean))
  const phones = new Set(cluster.map(c => c.phoneNumber).filter(Boolean))

  if (
    (email && !emails.has(email)) ||
    (phone && !phones.has(phone))
  ) {

    const { rows } = await client.query(
      `
      INSERT INTO "Contact"
      (email, "phoneNumber", "linkedId", "linkPrecedence", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, 'secondary', NOW(), NOW())
      RETURNING *
      `,
      [email ?? null, phone ?? null, primaryId]
    )

    cluster.push(rows[0])
  }

  return cluster
}

// buildResponse takes the primary and secondaries and returns the response object
function buildResponse(primary: Contact, secondaries: Contact[]) {

  const all = [primary, ...secondaries]

  const emails = [...new Set(all.map(c => c.email).filter(Boolean))]
  const phones = [...new Set(all.map(c => c.phoneNumber).filter(Boolean))]

  return {
    contact: {
      primaryContactId: primary.id,
      emails: emails,
      phoneNumbers: phones,
      secondaryContactIds: secondaries.map(c => c.id)
    }
  }
}
// this is the part which handles purchase endpoint, 
// it takes contactId and parts as arg and creates a new purchase. it returns the purchase object.
//not really used but can be used for future implementation of purchase history endpoint
export async function savePurchase(contactId: number, parts: string[]) {

  if (!parts.length) {
    throw new Error("Purchase must contain at least one part")
  }

  const priority = parts.length <= 2 ? "express" : "standard"

  const { rows } = await pool.query(
    `
    INSERT INTO "Purchase"
    ("contactId", parts, "totalItems", priority, status, "createdAt", "updatedAt")
    VALUES ($1, $2, $3, $4, 'queued', NOW(), NOW())
    RETURNING *
    `,
    [contactId, parts, parts.length, priority]
  )
  return rows[0]
}