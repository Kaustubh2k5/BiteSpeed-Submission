"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.identifyContact = identifyContact;
exports.savePurchase = savePurchase;
const db_1 = __importDefault(require("./db"));
async function identifyContact(email, phoneNumber) {
    if (!email && !phoneNumber)
        throw new Error('email or phoneNumber required');
    // Find all contacts matching email or phone
    const { rows: matches } = await db_1.default.query(`SELECT * FROM "Contact" WHERE "deletedAt" IS NULL AND ($1::text IS NULL OR email = $1) AND ($2::text IS NULL OR "phoneNumber" = $2)
     UNION
     SELECT * FROM "Contact" WHERE "deletedAt" IS NULL AND ($1::text IS NOT NULL AND email = $1)
     UNION
     SELECT * FROM "Contact" WHERE "deletedAt" IS NULL AND ($2::text IS NOT NULL AND "phoneNumber" = $2)`, [email ?? null, phoneNumber ?? null]);
    // Deduplicate
    const seen = new Set();
    const unique = matches.filter((r) => {
        if (seen.has(r.id))
            return false;
        seen.add(r.id);
        return true;
    });
    // No match — create new primary
    if (unique.length === 0) {
        const { rows } = await db_1.default.query(`INSERT INTO "Contact" (email, "phoneNumber", "linkPrecedence", "createdAt", "updatedAt")
       VALUES ($1, $2, 'primary', NOW(), NOW()) RETURNING *`, [email ?? null, phoneNumber ?? null]);
        return buildResponse(rows[0], []);
    }
    // Collect all primary IDs
    const primaryIds = new Set(unique.map((c) => c.linkPrecedence === 'primary' ? c.id : c.linkedId));
    // Fetch all primaries, oldest first
    const { rows: primaries } = await db_1.default.query(`SELECT * FROM "Contact" WHERE id = ANY($1) AND "deletedAt" IS NULL ORDER BY "createdAt" ASC`, [[...primaryIds]]);
    const [truePrimary, ...otherPrimaries] = primaries;
    // Demote newer primaries to secondary
    if (otherPrimaries.length > 0) {
        const otherIds = otherPrimaries.map((p) => p.id);
        await db_1.default.query(`UPDATE "Contact" SET "linkPrecedence" = 'secondary', "linkedId" = $1, "updatedAt" = NOW()
       WHERE id = ANY($2)`, [truePrimary.id, otherIds]);
        await db_1.default.query(`UPDATE "Contact" SET "linkedId" = $1, "updatedAt" = NOW()
       WHERE "linkedId" = ANY($2) AND "deletedAt" IS NULL`, [truePrimary.id, otherIds]);
    }
    // Fetch full cluster
    const { rows: cluster } = await db_1.default.query(`SELECT * FROM "Contact" WHERE "deletedAt" IS NULL AND (id = $1 OR "linkedId" = $1) ORDER BY "createdAt" ASC`, [truePrimary.id]);
    // Create secondary if new info found
    const emailsInCluster = new Set(cluster.map((c) => c.email).filter(Boolean));
    const phonesInCluster = new Set(cluster.map((c) => c.phoneNumber).filter(Boolean));
    if ((email && !emailsInCluster.has(email)) || (phoneNumber && !phonesInCluster.has(phoneNumber))) {
        const { rows: [newContact] } = await db_1.default.query(`INSERT INTO "Contact" (email, "phoneNumber", "linkedId", "linkPrecedence", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'secondary', NOW(), NOW()) RETURNING *`, [email ?? null, phoneNumber ?? null, truePrimary.id]);
        cluster.push(newContact);
    }
    const secondaries = cluster.filter((c) => c.linkPrecedence === 'secondary');
    return buildResponse(truePrimary, secondaries);
}
function buildResponse(primary, secondaries) {
    const all = [primary, ...secondaries];
    const emails = [...new Set(all.map((c) => c.email).filter(Boolean))];
    const phones = [...new Set(all.map((c) => c.phoneNumber).filter(Boolean))];
    return {
        contact: {
            primaryContatctId: primary.id,
            emails: [primary.email, ...emails.filter(e => e !== primary.email)].filter(Boolean),
            phoneNumbers: [primary.phoneNumber, ...phones.filter(p => p !== primary.phoneNumber)].filter(Boolean),
            secondaryContactIds: secondaries.map((c) => c.id),
        },
    };
}
async function savePurchase(contactId, parts) {
    const priority = parts.length <= 2 ? 'express' : 'standard';
    const { rows } = await db_1.default.query(`INSERT INTO "Purchase" ("contactId", parts, "totalItems", priority, status, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'queued', NOW(), NOW()) RETURNING *`, [contactId, parts, parts.length, priority]);
    return rows[0];
}
