"use strict";

/*
 * PayPiggy storage.
 *
 * Everything lives in one document: { players, pending, events }.
 *   - No DATABASE_URL  -> the document is kept in server/data/db.json (same as before).
 *   - DATABASE_URL set -> the document is kept in Postgres, in one JSONB row
 *                         (table paypiggy_state, id = 1). Every change runs inside a
 *                         transaction that locks that row (SELECT ... FOR UPDATE), so
 *                         two requests can never spend the same balance twice or
 *                         credit the same Stripe session twice.
 *
 * All exported functions that touch data are async.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const TABLE = "paypiggy_state";

function empty() {
  return { players: {}, pending: [], events: {} };
}

function normalize(doc) {
  const d = Object.assign(empty(), doc || {});
  if (!d.players || typeof d.players !== "object") d.players = {};
  if (!Array.isArray(d.pending)) d.pending = [];
  if (!d.events || typeof d.events !== "object") d.events = {};
  return d;
}

function clone(x) {
  return x == null ? x : JSON.parse(JSON.stringify(x));
}

/* ---------------- JSON file backend ---------------- */

function jsonBackend() {
  function load() {
    try {
      return normalize(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
    } catch (e) {
      return empty();
    }
  }
  function save(doc) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 2));
    fs.renameSync(tmp, DATA_FILE);
  }
  let db = load();
  return {
    kind: "json",
    async init() {},
    // fn runs synchronously, so each read/mutation is atomic in a single Node process.
    async read(fn) { return clone(fn(db)); },
    async mutate(fn) {
      const out = fn(db);
      save(db);
      return clone(out);
    },
    async reset() { db = empty(); save(db); },
    async close() {}
  };
}

/* ---------------- Postgres backend ---------------- */

function pgConfig(url) {
  let ssl = { rejectUnauthorized: false };
  let connectionString = url;
  try {
    const u = new URL(url);
    const mode = (u.searchParams.get("sslmode") || "").toLowerCase();
    const host = (u.hostname || "").toLowerCase();
    if (mode === "disable" || host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || host === "") {
      ssl = false;
    }
    // pg lets sslmode in the URL override the ssl option; we decide SSL ourselves.
    ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"].forEach((k) => u.searchParams.delete(k));
    connectionString = u.toString();
  } catch (e) { /* leave URL as-is */ }
  return { connectionString, ssl, max: Number(process.env.PG_POOL_MAX) || 5 };
}

function pgBackend(url) {
  const { Pool } = require("pg");
  const pool = new Pool(pgConfig(url));
  pool.on("error", (err) => console.error("Postgres pool error:", err.message));
  let ready = null;

  function init() {
    if (!ready) {
      ready = (async () => {
        await pool.query(
          "CREATE TABLE IF NOT EXISTS " + TABLE + " (" +
          " id integer PRIMARY KEY," +
          " doc jsonb NOT NULL," +
          " updated_at timestamptz NOT NULL DEFAULT now())"
        );
        await pool.query(
          "INSERT INTO " + TABLE + " (id, doc) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING",
          [JSON.stringify(empty())]
        );
      })().catch((err) => { ready = null; throw err; });
    }
    return ready;
  }

  return {
    kind: "postgres",
    init,
    async read(fn) {
      await init();
      const r = await pool.query("SELECT doc FROM " + TABLE + " WHERE id = 1");
      return clone(fn(normalize(r.rows[0] && r.rows[0].doc)));
    },
    async mutate(fn) {
      await init();
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const r = await c.query("SELECT doc FROM " + TABLE + " WHERE id = 1 FOR UPDATE");
        const doc = normalize(r.rows[0] && r.rows[0].doc);
        const out = fn(doc);
        await c.query("UPDATE " + TABLE + " SET doc = $1::jsonb, updated_at = now() WHERE id = 1", [JSON.stringify(doc)]);
        await c.query("COMMIT");
        return clone(out);
      } catch (err) {
        try { await c.query("ROLLBACK"); } catch (e) { /* ignore */ }
        throw err;
      } finally {
        c.release();
      }
    },
    async reset() {
      await init();
      await pool.query("UPDATE " + TABLE + " SET doc = $1::jsonb, updated_at = now() WHERE id = 1", [JSON.stringify(empty())]);
    },
    async close() { await pool.end(); }
  };
}

/* ---------------- backend selection (lazy, so .env can load first) ---------------- */

let backend = null;

function getBackend() {
  if (!backend) {
    const url = (process.env.DATABASE_URL || "").trim();
    backend = url ? pgBackend(url) : jsonBackend();
  }
  return backend;
}

async function init() {
  const b = getBackend();
  await b.init();
  return b.kind;
}

function storageKind() { return getBackend().kind; }

const read = (fn) => getBackend().read(fn);
const mutate = (fn) => getBackend().mutate(fn);

/* ---------------- helpers on a document ---------------- */

function uid(prefix) {
  return (prefix || "id") + "-" + crypto.randomBytes(6).toString("hex");
}

function makeCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 4; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  return "PIG-" + s;
}

function pub(db, p) {
  if (!p) return null;
  return {
    id: p.id,
    code: p.code,
    balance: p.balance,
    tab: p.tab,
    test: !!p.test,
    pins: p.pins.slice(0, 20),
    loads: p.loads.slice(0, 20),
    pending: db.pending
      .filter((l) => l.playerId === p.id && l.status === "pending")
      .map((l) => ({ id: l.id, requested: l.requested, ts: l.ts }))
  };
}

function byToken(db, token) {
  if (!token) return null;
  return Object.values(db.players).find((p) => p.token === token) || null;
}

function byCode(db, code) {
  if (!code) return null;
  const c = String(code).trim().toUpperCase();
  return Object.values(db.players).find((p) => p.code === c) || null;
}

function idOf(player) {
  return player && typeof player === "object" ? player.id : player;
}

/* ---------------- public API ---------------- */

function publicPlayer(player) {
  const id = idOf(player);
  return read((db) => pub(db, db.players[id]));
}

function createPlayer(opts) {
  const test = !!(opts && opts.test);
  return mutate((db) => {
    let code, tries = 0;
    do { code = makeCode(); tries++; } while (byCode(db, code) && tries < 20);
    const token = crypto.randomBytes(24).toString("hex");
    const p = {
      id: uid("ply"),
      code,
      token,
      balance: 0,
      tab: 0,
      pins: [],
      loads: [],
      created: Date.now(),
      test
    };
    db.players[p.id] = p;
    return { player: pub(db, p), token };
  });
}

function findByToken(token) { return read((db) => byToken(db, token)); }
function findByCode(code) { return read((db) => byCode(db, code)); }
function findById(id) { return read((db) => db.players[id] || null); }

function claimByCode(code) {
  return mutate((db) => {
    const p = byCode(db, code);
    if (!p) return null;
    // Test players keep the same token so several game tabs can stay signed in.
    if (!p.test) p.token = crypto.randomBytes(24).toString("hex");
    return { player: pub(db, p), token: p.token };
  });
}

function requestLoad(player, amountCents) {
  const id = idOf(player);
  return mutate((db) => {
    const p = db.players[id];
    if (!p) return null;
    const load = {
      id: uid("ld"),
      playerId: p.id,
      code: p.code,
      requested: amountCents,
      ts: Date.now(),
      status: "pending"
    };
    db.pending.unshift(load);
    return load;
  });
}

function approveLoad(loadId, amountCents, source) {
  return mutate((db) => {
    const load = db.pending.find((l) => l.id === loadId);
    if (!load || load.status !== "pending") return { error: "That request is not pending." };
    const p = db.players[load.playerId];
    if (!p) return { error: "Player not found." };
    const amt = Math.max(0, Math.round(Number(amountCents) || 0));
    load.status = "approved";
    load.approved = amt;
    load.resolvedAt = Date.now();
    load.source = source || "admin";
    p.balance += amt;
    p.loads.unshift({
      id: load.id,
      amount: amt,
      source: load.source,
      ts: Date.now(),
      status: "approved",
      requested: load.requested
    });
    return { ok: true, player: pub(db, p), load };
  });
}

function rejectLoad(loadId) {
  return mutate((db) => {
    const load = db.pending.find((l) => l.id === loadId);
    if (!load || load.status !== "pending") return { error: "That request is not pending." };
    const p = db.players[load.playerId];
    load.status = "rejected";
    load.resolvedAt = Date.now();
    if (p) {
      p.loads.unshift({
        id: load.id,
        amount: 0,
        source: "admin",
        ts: Date.now(),
        status: "rejected",
        requested: load.requested
      });
    }
    return { ok: true, load };
  });
}

// Credit a player. With an eventId, the "already seen?" check and the credit happen
// in the same locked transaction, so a Stripe session / Throne gift credits only once.
function credit(player, amountCents, source, eventId) {
  const id = idOf(player);
  return mutate((db) => {
    const p = db.players[id];
    if (eventId && db.events[eventId]) return { ok: true, duplicate: true, player: pub(db, p) };
    if (!p) return { error: "Player not found." };
    if (eventId) db.events[eventId] = Date.now();
    const amt = Math.max(0, Math.round(Number(amountCents) || 0));
    p.balance += amt;
    const rec = {
      id: uid("ld"),
      amount: amt,
      source: source || "credit",
      ts: Date.now(),
      status: "approved"
    };
    p.loads.unshift(rec);
    // auto-resolve a matching pending request if any
    const pend = db.pending.find((l) => l.playerId === p.id && l.status === "pending");
    if (pend) {
      pend.status = "approved";
      pend.approved = amt;
      pend.resolvedAt = Date.now();
      pend.source = source;
      rec.id = pend.id;
      rec.requested = pend.requested;
    }
    return { ok: true, player: pub(db, p) };
  });
}

function seenEvent(eventId) {
  return read((db) => !!db.events[eventId]);
}

function markEvent(eventId) {
  return mutate((db) => { db.events[eventId] = Date.now(); return true; });
}

function pinGame(game) {
  if (game === "wheel" || game === "humiliation" || game === "poster") return game;
  return "poster";
}

function applyPin(p, result) {
  // Re-check against the balance read under the lock: never charge more than is there.
  const charge = Math.max(0, Math.min(Math.round(Number(result.charge) || 0), p.balance));
  result.charge = charge;
  result.balance = p.balance - charge;
  p.balance = result.balance;
  p.tab = (p.tab || 0) + charge;
  const game = pinGame(result.game);
  const rec = {
    label: result.label,
    value: result.value,
    charge,
    game,
    ts: Date.now()
  };
  if (result.text) rec.text = result.text;
  p.pins.unshift(rec);
  if (p.pins.length > 40) p.pins.length = 40;
}

function recordPin(player, result) {
  const id = idOf(player);
  return mutate((db) => {
    const p = db.players[id];
    if (!p) return null;
    applyPin(p, result);
    return pub(db, p);
  });
}

/**
 * Atomic play: decide(balance) runs with the player's current balance while the
 * data is locked, and must return a result { label, value, charge, game, ... }
 * or { error }. Returns { result, player } or { error, broke?, player }.
 */
function play(player, decide) {
  const id = idOf(player);
  return mutate((db) => {
    const p = db.players[id];
    if (!p) return { error: "No player session.", status: 401 };
    if (!(p.balance > 0)) return { error: "Add funds to your account first.", broke: true, status: 400, player: pub(db, p) };
    const result = decide(p.balance);
    if (!result || result.error) {
      const out = Object.assign({ status: 500 }, result || { error: "No result." });
      if (out.broke && !out.player) out.player = pub(db, p);
      return out;
    }
    applyPin(p, result);
    return { ok: true, result, player: pub(db, p) };
  });
}

function startOfDayNY(now) {
  const tz = "America/New_York";
  const d = new Date(now);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(d);
  const v = (type) => Number(parts.find((p) => p.type === type).value);
  const asUTC = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  const offset = asUTC - d.getTime();
  return Date.UTC(v("year"), v("month") - 1, v("day")) - offset;
}

function methodOf(source) {
  const s = String(source || "").toLowerCase();
  if (s.includes("stripe")) return "stripe";
  if (s.includes("throne") || s === "admin") return "throne";
  return "other";
}

function sumWindow(sales, from) {
  const list = sales.filter((s) => s.ts >= from);
  return { count: list.length, amount: list.reduce((a, s) => a + s.amount, 0) };
}


function computeStats(db, goalDollars) {
  const goal = Math.max(100, Math.round((Number(goalDollars) || 1000) * 100));
  const sales = [];
  const games = { poster: { count: 0, amount: 0 }, wheel: { count: 0, amount: 0 }, humiliation: { count: 0, amount: 0 } };
  for (const p of Object.values(db.players)) {
    if (p.test) continue;
    for (const l of p.loads || []) {
      if (l.status === "approved" && (l.amount || 0) > 0) {
        sales.push({
          code: p.code,
          amount: l.amount,
          method: methodOf(l.source),
          source: l.source || "",
          ts: l.ts
        });
      }
    }
    for (const pin of p.pins || []) {
      const g = pinGame(pin.game);
      if (!games[g]) games[g] = { count: 0, amount: 0 };
      games[g].count += 1;
      games[g].amount += pin.charge || 0;
    }
  }
  sales.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const byMethod = { throne: { count: 0, amount: 0 }, stripe: { count: 0, amount: 0 }, other: { count: 0, amount: 0 } };
  for (const s of sales) {
    const bucket = byMethod[s.method] || byMethod.other;
    bucket.count += 1;
    bucket.amount += s.amount;
  }
  const now = Date.now();
  const totalFunds = sales.reduce((a, s) => a + s.amount, 0);
  const percent = Math.min(100, Math.round((totalFunds / goal) * 1000) / 10);
  return {
    goal,
    totalFunds,
    salesCount: sales.length,
    percent,
    reached: totalFunds >= goal,
    salesToday: sumWindow(sales, startOfDayNY(now)),
    sales7d: sumWindow(sales, now - 7 * 24 * 60 * 60 * 1000),
    sales30d: sumWindow(sales, now - 30 * 24 * 60 * 60 * 1000),
    byMethod: { throne: byMethod.throne, stripe: byMethod.stripe },
    games,
    recentSales: sales.slice(0, 25)
  };
}

function adminStats(goalDollars) {
  return read((db) => computeStats(db, goalDollars));
}

function isTestId(db, playerId) {
  const p = db.players[playerId];
  return !!(p && p.test);
}

function adminState() {
  return read((db) => {
    const pending = db.pending.filter((l) => l.status === "pending" && !isTestId(db, l.playerId));
    const recent = db.pending.filter((l) => l.status !== "pending" && !isTestId(db, l.playerId)).slice(0, 25);
    const players = Object.values(db.players)
      .filter((p) => !p.test)
      .sort((a, b) => (b.created || 0) - (a.created || 0))
      .slice(0, 40)
      .map((p) => ({
        code: p.code,
        balance: p.balance,
        tab: p.tab,
        pins: p.pins.length,
        created: p.created
      }));
    return { pending, recent, players };
  });
}

function adminTestState() {
  return read((db) => {
    const players = Object.values(db.players)
      .filter((p) => p.test)
      .sort((a, b) => (b.created || 0) - (a.created || 0))
      .map((p) => ({
        id: p.id,
        code: p.code,
        balance: p.balance,
        tab: p.tab,
        test: true,
        pins: (p.pins || []).slice(0, 20),
        loads: (p.loads || []).slice(0, 20),
        created: p.created
      }));
    return { players };
  });
}

function creditTest(playerId, amountCents) {
  return mutate((db) => {
    const p = db.players[playerId];
    if (!p) return { error: "Player not found." };
    if (!p.test) return { error: "Play money can only be added to a test player." };
    const amt = Math.max(0, Math.round(Number(amountCents) || 0));
    if (amt < 1) return { error: "Pick an amount to add." };
    p.balance += amt;
    p.loads.unshift({
      id: uid("ld"),
      amount: amt,
      source: "test",
      ts: Date.now(),
      status: "approved"
    });
    if (p.loads.length > 40) p.loads.length = 40;
    return { ok: true, player: pub(db, p) };
  });
}

function resetTestBalance(playerId) {
  return mutate((db) => {
    const p = db.players[playerId];
    if (!p) return { error: "Player not found." };
    if (!p.test) return { error: "Only a test player can be reset this way." };
    p.balance = 0;
    return { ok: true, player: pub(db, p) };
  });
}

module.exports = {
  init,
  storageKind,
  uid,
  publicPlayer,
  createPlayer,
  findByToken,
  findByCode,
  findById,
  claimByCode,
  requestLoad,
  approveLoad,
  rejectLoad,
  credit,
  seenEvent,
  markEvent,
  recordPin,
  play,
  adminState,
  adminTestState,
  adminStats,
  creditTest,
  resetTestBalance,
  persist: async function () { /* every change is saved as it happens */ },
  close: () => (backend ? backend.close() : Promise.resolve()),
  _pgConfig: pgConfig,
  _db: () => read((db) => db),
  _reset: () => getBackend().reset()
};
