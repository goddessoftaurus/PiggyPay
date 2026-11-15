"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");

const store = require("./store");
const stripePay = require("./stripe");
const throne = require("./throne");
const pinZones = require("../pin-zones");
const { CONFIG, SITE_NAME } = require("../config");

const ROOT = path.join(__dirname, "..");
const ADMIN_HTML = path.join(__dirname, "admin.html");

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  try {
    const txt = fs.readFileSync(envPath, "utf8");
    for (const raw of txt.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 1) continue;
      const key = line.slice(0, i).trim();
      let val = line.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
    }
  } catch (e) { /* no .env is fine */ }
}

function adminPassword() {
  return process.env.ADMIN_PASSWORD || "";
}

function stripeEnabled() {
  return CONFIG.ENABLE_STRIPE !== false && !!process.env.STRIPE_SECRET_KEY;
}

function throneEnabled() {
  return CONFIG.ENABLE_THRONE !== false;
}

const adminSessions = new Map();

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
      catch (e) { out[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
    }
  }
  return out;
}

function bearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return (m && m[1]) || req.headers["x-paypiggy-token"] || cookies(req).paypiggy_token || "";
}

async function requirePlayer(req, res) {
  const p = await store.findByToken(bearer(req));
  if (!p) {
    res.status(401).json({ error: "No player session. Start a new one or enter your code." });
    return null;
  }
  return p;
}

function requireAdmin(req, res) {
  const tok = cookies(req).paypiggy_admin || req.headers["x-admin-token"] || "";
  const exp = adminSessions.get(tok);
  if (!tok || !exp || exp < Date.now()) {
    res.status(401).json({ error: "Admin sign-in required." });
    return false;
  }
  return true;
}

function publicUrl(req) {
  // Prefer the host the visitor actually hit so two Render services can share
  // this code (and even the same PUBLIC_URL env). PUBLIC_URL is the fallback
  // when the request has no host.
  const headers = (req && req.headers) || {};
  const host = String(headers["x-forwarded-host"] || headers.host || "").split(",")[0].trim();
  if (host) {
    const proto = String(headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0].trim() || "http";
    return proto + "://" + host;
  }
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  return "";
}

function rootPageTarget() {
  const raw = String(process.env.ROOT_PAGE || "").trim();
  if (!raw) return "";
  const cleaned = raw.replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("..") || /[\\:]/.test(cleaned) || !/^[A-Za-z0-9._/-]+$/.test(cleaned)) {
    return "";
  }
  return cleaned;
}

function pickSegment(segs) {
  let total = 0;
  for (const s of segs) total += Number(s.weight) || 1;
  let r = Math.random() * total;
  for (let i = 0; i < segs.length; i++) {
    r -= Number(segs[i].weight) || 1;
    if (r <= 0) return { seg: segs[i], index: i };
  }
  return { seg: segs[segs.length - 1], index: segs.length - 1 };
}

function resolvePin(seg, balance) {
  const isAll = seg.value === "ALL" || seg.label === "ALL";
  const charge = isAll ? balance : Math.min(Math.round(Number(seg.value) * 100), balance);
  const out = {
    label: seg.label,
    value: isAll ? "ALL" : seg.value,
    charge,
    balance: Math.max(0, balance - charge)
  };
  if (seg.zone) {
    out.zone = seg.zone;
    out.zoneLabel = seg.zoneLabel || (pinZones.ZONE_BANNERS && pinZones.ZONE_BANNERS[seg.zone]) || "";
  }
  return out;
}

function posterTiers() {
  return pinZones.buildPinTiers(CONFIG);
}


const HUMILIATION_PRICE_CENTS = 500;

const DEFAULT_HUMILIATION_TASKS = [
  { label: "Tape selfie", text: "Tape across your face, then send a selfie" },
  { label: "One finger", text: "Jerk the tip with one finger only for 2 minutes" },
  { label: "Sit on hands", text: "Sit on your hands until they go numb" },
  { label: "Ice water", text: "Balls in ice water for 30 seconds" },
  { label: "Forehead", text: "Write \"PayPiggy\" on your forehead in marker and send a selfie" },
  { label: "Oink 20×", text: "Oink 20 times on camera" },
  { label: "Panties", text: "Wear panties all day under your clothes" },
  { label: "Kneel 10 min", text: "Kneel in the corner for 10 minutes" },
  { label: "Floor meal", text: "Eat your next meal off a plate on the floor with no hands" },
  { label: "Clothespins", text: "Wear a clothespin on each nipple for 5 minutes" }
];

function humiliationTasks() {
  const list = CONFIG.humiliationWheel && Array.isArray(CONFIG.humiliationWheel.tasks)
    ? CONFIG.humiliationWheel.tasks
    : null;
  const cleaned = (list || []).map((t) => ({
    label: String((t && t.label) || "").trim(),
    text: String((t && t.text) || "").trim()
  })).filter((t) => t.text);
  return cleaned.length ? cleaned : DEFAULT_HUMILIATION_TASKS;
}

function pickHumiliationTask(tasks) {
  const n = tasks.length;
  const index = Math.min(n - 1, Math.floor(Math.random() * n));
  return { task: tasks[index], index };
}

function dollarsToCents(n) {
  const d = Number(n);
  if (!isFinite(d) || d <= 0) return 0;
  return Math.round(d * 100);
}

async function applyStripeCredit(info) {
  if (info.sessionId && await store.seenEvent("stripe:" + info.sessionId)) {
    return { ok: true, duplicate: true };
  }
  const player = (info.playerId && await store.findById(info.playerId)) || await store.findByCode(info.code);
  if (!player) return { error: "No player matches this payment.", status: 404 };
  const amount = Math.max(0, info.amount || 0);
  const eventId = "stripe:" + (info.sessionId || info.eventId);
  // credit() re-checks the event id inside the same locked transaction, so a
  // replayed or concurrent webhook can never credit the session twice.
  return store.credit(player, amount, "stripe", eventId);
}

// Express 4 doesn't catch rejected promises; send a 500 instead of hanging.
function wrap(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.status(500).json({ error: "Server error. Please try again." });
    });
  };
}

function createApp() {
  const app = express();

  app.post(["/api/stripe/webhook", "/stripe/webhook"], express.raw({ type: "application/json" }), wrap(async (req, res) => {
    const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
    const result = stripePay.handleWebhook({
      payload,
      signature: req.headers["stripe-signature"],
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    if (result.ignore) return res.json({ received: true });
    if (result.paymentStatus && result.paymentStatus !== "paid" && result.paymentStatus !== "no_payment_required") {
      return res.json({ received: true, ignored: "not paid" });
    }
    const out = await applyStripeCredit(result);
    if (out.error) return res.status(out.status || 400).json({ error: out.error });
    return res.json({ received: true, duplicate: !!out.duplicate });
  }));

  app.post("/api/webhooks/throne", express.raw({ type: "application/json" }), wrap(async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
    const ok = throne.verifySignature(raw, req.headers["x-signature-timestamp"], req.headers["x-signature-ed25519"]);
    if (!ok) return res.status(400).json({ error: "Invalid Throne signature." });
    let body;
    try { body = JSON.parse(raw); } catch (e) { return res.status(400).json({ error: "Invalid JSON." }); }
    const ev = throne.parseEvent(body);
    if (!ev.eventId) return res.status(400).json({ error: "Missing event_id." });
    if (await store.seenEvent("throne:" + ev.eventId)) return res.json({ received: true, duplicate: true });
    if (!ev.code) {
      await store.markEvent("throne:" + ev.eventId);
      return res.json({ received: true, unmatched: "no play code in gift message" });
    }
    const player = await store.findByCode(ev.code);
    if (!player) {
      await store.markEvent("throne:" + ev.eventId);
      return res.json({ received: true, unmatched: "unknown play code" });
    }
    if (ev.cents > 0) await store.credit(player, ev.cents, "throne-webhook", "throne:" + ev.eventId);
    else await store.markEvent("throne:" + ev.eventId);
    return res.json({ received: true });
  }));

  app.use(express.json({ limit: "256kb" }));

  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      name: SITE_NAME,
      stripe: stripeEnabled(),
      throne: throneEnabled(),
      storage: store.storageKind(),
      demo: false
    });
  });

  app.post("/api/new", wrap(async (req, res) => {
    res.json(await store.createPlayer());
  }));

  app.post("/api/claim", wrap(async (req, res) => {
    const out = await store.claimByCode(req.body && req.body.code);
    if (!out) return res.status(404).json({ error: "That play code wasn't found." });
    res.json(out);
  }));

  app.get("/api/me", wrap(async (req, res) => {
    const p = await requirePlayer(req, res);
    if (!p) return;
    res.json({ player: await store.publicPlayer(p) });
  }));

  // Rewards list for the panels. Signed-in players also get their progress.
  app.get("/api/rewards", wrap(async (req, res) => {
    const tok = bearer(req);
    const p = tok ? await store.findByToken(tok) : null;
    res.setHeader("Cache-Control", "no-store");
    res.json(await store.rewardsView(p ? p.id : null));
  }));

  app.post("/api/rewards/seen", wrap(async (req, res) => {
    const p = await requirePlayer(req, res);
    if (!p) return;
    const out = await store.markCelebrationSeen(p.id, String((req.body && req.body.id) || ""));
    if (out.error) return res.status(400).json({ error: out.error });
    res.json(out);
  }));

  app.post("/api/request-load", wrap(async (req, res) => {
    if (!throneEnabled()) return res.status(400).json({ error: "Throne gifts are turned off." });
    const p = await requirePlayer(req, res);
    if (!p) return;
    if (p.test) return res.status(400).json({ error: "This is a test account. Add play money from the Test play page." });
    const cents = dollarsToCents(req.body && req.body.amount);
    if (cents < 100) return res.status(400).json({ error: "Pick an amount of at least $1." });
    const load = await store.requestLoad(p, cents);
    if (!load) return res.status(401).json({ error: "No player session. Start a new one or enter your code." });
    res.json({ ok: true, load: { id: load.id, requested: load.requested, ts: load.ts }, player: await store.publicPlayer(p) });
  }));

  function playHandler(defaultGame) {
    return wrap(async (req, res) => {
      const p = await requirePlayer(req, res);
      if (!p) return;
      const requested = (req.body && req.body.game) || defaultGame;
      const game = requested === "wheel" ? "wheel" : "poster";
      const segs = game === "poster" ? posterTiers() : (CONFIG.segments || []);
      if (!segs.length) return res.status(500).json({ error: "No segments configured." });
      // The pick and the charge are made against the balance read while the
      // player's data is locked, so parallel spins can't overspend.
      const out = await store.play(p, (balance) => {
        const pick = pickSegment(segs);
        const result = resolvePin(pick.seg, balance);
        result.index = pick.index;
        result.game = game;
        return result;
      });
      if (out.error) {
        const body = { error: out.error };
        if (out.broke) { body.broke = true; body.player = out.player; }
        return res.status(out.status || 400).json(body);
      }
      res.json({ ok: true, result: out.result, player: out.player });
    });
  }

  async function humiliationSpin(req, res) {
    const p = await requirePlayer(req, res);
    if (!p) return;
    const tasks = humiliationTasks();
    if (!tasks.length) return res.status(500).json({ error: "No humiliation tasks configured." });
    const price = HUMILIATION_PRICE_CENTS; // always $5; ignore any client-supplied price
    const out = await store.play(p, (balance) => {
      if (balance < price) {
        return { error: "You need $5 in your pocket to spin this wheel.", broke: true, status: 400 };
      }
      const pick = pickHumiliationTask(tasks);
      return {
        label: pick.task.label,
        text: pick.task.text,
        value: 5,
        charge: price,
        balance: balance - price,
        index: pick.index,
        game: "humiliation"
      };
    });
    if (out.error) {
      const body = { error: out.error };
      if (out.broke) { body.broke = true; body.player = out.player; }
      return res.status(out.status || 400).json(body);
    }
    res.json({ ok: true, result: out.result, player: out.player });
  }

  app.post("/api/pin", playHandler("poster"));
  app.post("/api/spin", wrap(async (req, res) => {
    const requested = (req.body && req.body.game) || "wheel";
    if (requested === "humiliation") return humiliationSpin(req, res);
    return playHandler("wheel")(req, res);
  }));

  app.post("/api/stripe/checkout", wrap(async (req, res) => {
    const p = await requirePlayer(req, res);
    if (!p) return;
    if (p.test) return res.status(400).json({ error: "This is a test account. Add play money from the Test play page." });
    if (!stripeEnabled()) return res.status(400).json({ error: "Pay by card is not available." });
    const cents = dollarsToCents(req.body && req.body.amount);
    if (cents < 100) return res.status(400).json({ error: "Pick an amount of at least $1." });
    const origin = publicUrl(req);
    const returnTo = (req.body && req.body.returnTo) || (origin + "/game.html");
    const join = returnTo.indexOf("?") >= 0 ? "&" : "?";
    try {
      const session = await stripePay.createCheckout({
        secret: process.env.STRIPE_SECRET_KEY,
        amountCents: cents,
        playerCode: p.code,
        playerId: p.id,
        successUrl: returnTo + join + "paid=1",
        cancelUrl: returnTo + join + "paid=0"
      });
      res.json({ ok: true, url: session.url, id: session.id });
    } catch (err) {
      res.status(500).json({ error: "Could not start card checkout.", detail: err.message });
    }
  }));

  app.post("/api/admin/login", (req, res) => {
    const pw = adminPassword();
    if (!pw) return res.status(503).json({ error: "ADMIN_PASSWORD is not set on the server." });
    if (!req.body || req.body.password !== pw) return res.status(401).json({ error: "Wrong password." });
    const token = crypto.randomBytes(24).toString("hex");
    adminSessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
    res.setHeader("Set-Cookie", "paypiggy_admin=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200");
    res.json({ ok: true, token });
  });

  app.post("/api/admin/logout", (req, res) => {
    const tok = cookies(req).paypiggy_admin;
    if (tok) adminSessions.delete(tok);
    res.setHeader("Set-Cookie", "paypiggy_admin=; Path=/; HttpOnly; Max-Age=0");
    res.json({ ok: true });
  });

  app.get("/api/admin/state", wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(await store.adminState());
  }));

  app.get("/api/admin/stats", wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(await store.adminStats(CONFIG.SALES_GOAL));
  }));

  app.post("/api/admin/loads/:id/approve", wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const cents = dollarsToCents(req.body && req.body.amount);
    if (cents < 0) return res.status(400).json({ error: "Enter the amount you actually received." });
    const out = await store.approveLoad(req.params.id, cents, "admin");
    if (out.error) return res.status(400).json({ error: out.error });
    res.json(out);
  }));

  app.post("/api/admin/loads/:id/reject", wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const out = await store.rejectLoad(req.params.id);
    if (out.error) return res.status(400).json({ error: out.error });
    res.json(out);
  }));

  app.get("/api/admin/rewards", wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(await store.adminRewards());
  }));

  app.post("/api/admin/rewards/:id", wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const status = req.body && req.body.status;
    const out = await store.resolveReward(req.params.id, status, req.body && req.body.nickname);
    if (out.error) return res.status(400).json({ error: out.error });
    res.json(out);
  }));

  app.get("/api/admin/test", wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(await store.adminTestState());
  }));

  app.post("/api/admin/test/player", wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(await store.createPlayer({ test: true }));
  }));

  app.post("/api/admin/test/credit", wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = req.body && (req.body.playerId || req.body.id);
    const cents = dollarsToCents(req.body && req.body.amount);
    const out = await store.creditTest(id, cents);
    if (out.error) return res.status(400).json({ error: out.error });
    res.json(out);
  }));

  app.post("/api/admin/test/reset", wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = req.body && (req.body.playerId || req.body.id);
    const out = await store.resetTestBalance(id);
    if (out.error) return res.status(400).json({ error: out.error });
    res.json(out);
  }));

  const ANALYTICS_HTML = path.join(__dirname, "analytics.html");
  const TEST_HTML = path.join(__dirname, "test-play.html");
  const ACCOUNT_HTML = path.join(ROOT, "account.html");
  app.get("/admin", (req, res) => res.sendFile(ADMIN_HTML));
  app.get(["/admin/analytics", "/admin/analytics.html"], (req, res) => res.sendFile(ANALYTICS_HTML));
  app.get(["/admin/test", "/admin/test.html"], (req, res) => res.sendFile(TEST_HTML));
  app.get(["/account", "/account.html"], (req, res) => res.sendFile(ACCOUNT_HTML));

  app.get("/", (req, res, next) => {
    const page = rootPageTarget();
    const qIndex = req.url.indexOf("?");
    const qs = qIndex >= 0 ? req.url.slice(qIndex) : "";
    if (page) return res.redirect(302, "/" + page + qs);
    // Default: the combined games homepage. index.html stays at /index.html.
    res.sendFile(path.join(ROOT, "games.html"));
  });

  app.use(express.static(ROOT, { extensions: ["html"] }));

  return app;
}

if (require.main === module) {
  loadEnv();
  const port = Number(process.env.PORT) || 3000;
  const app = createApp();
  store.init().then((kind) => app.listen(port, () => {
    const pw = adminPassword();
    console.log("PayPiggy listening on http://localhost:" + port);
    console.log("  Poster:    http://localhost:" + port + "/game.html");
    console.log("  Wheel:     http://localhost:" + port + "/wheel.html");
    console.log("  Humiliation: http://localhost:" + port + "/humiliation.html");
    console.log("  Admin:     http://localhost:" + port + "/admin");
    console.log("  Analytics: http://localhost:" + port + "/admin/analytics");
    console.log("  Test play: http://localhost:" + port + "/admin/test");
    console.log("  Account:   http://localhost:" + port + "/account");
    const rootPage = rootPageTarget();
    if (rootPage) console.log("  Root / :  http://localhost:" + port + "/" + rootPage + "  (ROOT_PAGE)");
    else console.log("  Games:    http://localhost:" + port + "/  (games hub)");
    if (!pw) console.log("  WARNING: ADMIN_PASSWORD is not set. Admin login will fail.");
    console.log("  Stripe checkout: " + (stripeEnabled() ? "on" : "off"));
    console.log("  Throne gifts:    " + (throneEnabled() ? "on" : "off"));
    console.log("  Storage:         " + (kind === "postgres" ? "Postgres (DATABASE_URL)" : "JSON file server/data/db.json (not durable on Render free)"));
  })).catch((err) => {
    console.error("Could not start storage: " + err.message);
    process.exit(1);
  });
}

module.exports = { createApp, loadEnv, applyStripeCredit, pickSegment, resolvePin, posterTiers, pinZones, store, stripePay, publicUrl, rootPageTarget };
