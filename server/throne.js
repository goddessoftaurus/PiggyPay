"use strict";

const crypto = require("crypto");

// Published by Throne (Ed25519). See:
// https://help.throne.com/en/articles/15935990-how-do-i-set-up-webhook-integration
const THRONE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAPXbUfxh7XL4SYUVcfhmYMIbxvtR9E9LDd8gPJ1PwSD8=
-----END PUBLIC KEY-----`;

const CODE_RE = /PIG-[0-9A-Z]{4}/i;

function verifySignature(rawBody, timestamp, signatureHex) {
  if (!timestamp || !/^\d+$/.test(String(timestamp))) return false;
  // Reject stale timestamps (replay window: 15 minutes).
  const ts = Number(timestamp) * (String(timestamp).length > 12 ? 1 : 1000);
  const now = Date.now();
  const tMs = String(timestamp).length > 12 ? Number(timestamp) : Number(timestamp) * 1000;
  if (Math.abs(now - tMs) > 15 * 60 * 1000) return false;
  let sig;
  try { sig = Buffer.from(String(signatureHex || ""), "hex"); } catch (e) { return false; }
  if (sig.length !== 64) return false;
  const message = String(timestamp) + "." + rawBody;
  try {
    return crypto.verify(null, Buffer.from(message, "utf8"), THRONE_PUBLIC_KEY_PEM, sig);
  } catch (e) {
    return false;
  }
}

function extractCode(text) {
  const m = String(text || "").toUpperCase().match(CODE_RE);
  return m ? m[0] : null;
}

function parseEvent(body) {
  const eventType = body.event_type;
  const inner = body; // envelope fields sit alongside event fields in some docs;
  // handle both { event_type, event_id, ...fields } and nested.
  const data = body.data || body;
  const message = data.message || body.message || "";
  const code = extractCode(message);
  let cents = 0;
  if (typeof data.price === "number") cents = data.price;
  else if (typeof data.amount === "number") cents = data.amount;
  else if (typeof body.price === "number") cents = body.price;
  else if (typeof body.amount === "number") cents = body.amount;
  return {
    eventId: body.event_id,
    eventType,
    code,
    cents: Math.round(cents),
    gifter: data.gifter_username || body.gifter_username || "",
    currency: data.currency || body.currency || "USD"
  };
}

module.exports = { verifySignature, extractCode, parseEvent, THRONE_PUBLIC_KEY_PEM };
