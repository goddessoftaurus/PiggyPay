"use strict";

const http = require("http");
const path = require("path");
const { loadEnv, createApp, store, stripePay, publicUrl } = require("./index");

loadEnv();
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test-admin";
const WHSEC = "whsec_test_dummy_paypiggy";
process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
// Leave STRIPE_SECRET_KEY unset — checkout is not used; webhook is unit-tested with a dummy secret.

// Safety: the test wipes all data, so it NEVER uses DATABASE_URL from .env.
// JSON mode by default; set TEST_DATABASE_URL to run the same tests against a
// throwaway Postgres database.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;

const app = createApp();

// Spins are random; pin the odds where a test needs a predictable outcome
// (otherwise an early "ALL" can empty the pocket and fail later steps).
const realRandom = Math.random;
function fixRandom(values) {
  let k = 0;
  Math.random = () => values[k++ % values.length];
}
function realOdds() { Math.random = realRandom; }
const server = http.createServer(app);

function listen() {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

function req(port, method, url, { body, headers, raw } = {}) {
  return new Promise((resolve, reject) => {
    const data = raw != null ? raw : (body != null ? JSON.stringify(body) : null);
    const opts = {
      hostname: "127.0.0.1",
      port,
      path: url,
      method,
      headers: Object.assign({}, headers)
    };
    if (data != null) {
      opts.headers["Content-Length"] = Buffer.byteLength(data);
      if (!opts.headers["Content-Type"]) opts.headers["Content-Type"] = "application/json";
    }
    const r = http.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    r.on("error", reject);
    if (data != null) r.write(data);
    r.end();
  });
}

function cookie(setCookie) {
  if (!setCookie) return "";
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return first.split(";")[0];
}

(async () => {
  const kind = await store.init();
  console.log("Storage mode: " + kind);
  await store._reset();
  const port = await listen();
  const auth = {};
  const fails = [];
  const ok = (name, cond, extra) => {
    if (cond) console.log("  ok  " + name);
    else { console.log("  FAIL " + name + (extra ? " — " + extra : "")); fails.push(name); }
  };

  console.log("1. Health");
  let r = await req(port, "GET", "/api/health");
  ok("health", r.status === 200 && r.json && r.json.ok, r.text);

  console.log("2. New player + request Throne load");
  r = await req(port, "POST", "/api/new", { body: {} });
  ok("new player", r.status === 200 && r.json.token && r.json.player.code, r.text);
  const token = r.json.token;
  const code = r.json.player.code;
  const playerId = r.json.player.id;
  auth.Authorization = "Bearer " + token;

  r = await req(port, "POST", "/api/pin", { headers: auth, body: {} });
  ok("pin rejected when broke", r.status === 400 && r.json.broke, r.text);

  r = await req(port, "POST", "/api/request-load", { headers: auth, body: { amount: 50 } });
  ok("request load $50", r.status === 200 && r.json.load && r.json.load.requested === 5000, r.text);
  const loadId = r.json.load.id;

  console.log("3. Admin approves the gift");
  r = await req(port, "POST", "/api/admin/login", { body: { password: "wrong" } });
  ok("bad admin password rejected", r.status === 401);

  r = await req(port, "POST", "/api/admin/login", { body: { password: process.env.ADMIN_PASSWORD } });
  ok("admin login", r.status === 200, r.text);
  const adminCookie = cookie(r.headers["set-cookie"]);

  r = await req(port, "GET", "/api/admin/state", { headers: { Cookie: adminCookie } });
  ok("pending visible", r.status === 200 && r.json.pending.some((l) => l.id === loadId), r.text);

  r = await req(port, "POST", "/api/admin/loads/" + loadId + "/approve", {
    headers: { Cookie: adminCookie },
    body: { amount: 50 }
  });
  ok("approved $50", r.status === 200 && r.json.player && r.json.player.balance === 5000, r.text);

  r = await req(port, "GET", "/api/me", { headers: auth });
  ok("pocket is $50.00", r.status === 200 && r.json.player.balance === 5000, r.text);

  console.log("4. Server-side pin deducts from pocket");
  r = await req(port, "POST", "/api/pin", { headers: auth, body: {} });
  ok("pin succeeds", r.status === 200 && r.json.result, r.text);
  ok("first pin includes a zone", r.json.result.zone && r.json.result.zoneLabel, JSON.stringify(r.json.result));
  const charge = r.json.result.charge;
  const left = r.json.result.balance;
  ok("charge is positive and deducted", charge > 0 && left === 5000 - charge, JSON.stringify(r.json.result));
  ok("tab equals charge", r.json.player.tab === charge);
  const afterPin = left;

  console.log("5. Mocked Stripe webhook credits the same player");
  const payloadObj = {
    id: "evt_test_1",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        object: "checkout.session",
        amount_total: 2000,
        payment_status: "paid",
        metadata: { playerCode: code, playerId: playerId }
      }
    }
  };
  const payload = JSON.stringify(payloadObj);
  const signature = stripePay.generateTestHeader(payload, WHSEC);
  r = await req(port, "POST", "/api/stripe/webhook", {
    raw: payload,
    headers: { "Content-Type": "application/json", "Stripe-Signature": signature }
  });
  ok("webhook accepted", r.status === 200 && r.json && r.json.received, r.text);

  r = await req(port, "GET", "/api/me", { headers: auth });
  ok("stripe credited +$20", r.status === 200 && r.json.player.balance === afterPin + 2000, "balance=" + (r.json && r.json.player && r.json.player.balance));

  r = await req(port, "POST", "/api/stripe/webhook", {
    raw: payload,
    headers: { "Content-Type": "application/json", "Stripe-Signature": signature }
  });
  ok("webhook is idempotent", r.status === 200 && r.json.duplicate, r.text);
  r = await req(port, "GET", "/api/me", { headers: auth });
  ok("balance unchanged on replay", r.json.player.balance === afterPin + 2000);

  r = await req(port, "POST", "/api/stripe/webhook", {
    raw: payload,
    headers: { "Content-Type": "application/json", "Stripe-Signature": "t=1,v1=deadbeef" }
  });
  ok("bad signature rejected", r.status === 400);

  console.log("6. Wheel spin deducts from the same pocket");
  r = await req(port, "GET", "/api/me", { headers: auth });
  const beforeSpin = r.json.player.balance;
  const tabBefore = r.json.player.tab;
  r = await req(port, "POST", "/api/spin", { headers: auth, body: { game: "wheel" } });
  ok("wheel spin succeeds", r.status === 200 && r.json.result && r.json.result.game === "wheel", r.text);
  ok("wheel result has an index", Number.isInteger(r.json.result.index), JSON.stringify(r.json.result));
  const wheelCharge = r.json.result.charge;
  ok("wheel charge deducted", wheelCharge > 0 && r.json.result.balance === beforeSpin - wheelCharge, JSON.stringify(r.json.result));
  ok("tab includes the spin", r.json.player.tab === tabBefore + wheelCharge);
  ok("pin record tagged wheel", r.json.player.pins[0].game === "wheel");

  console.log("7. Admin stats sums");
  r = await req(port, "GET", "/api/admin/stats");
  ok("stats require admin", r.status === 401);

  r = await req(port, "GET", "/api/admin/stats", { headers: { Cookie: adminCookie } });
  ok("stats ok", r.status === 200 && r.json, r.text);
  const s = r.json;
  ok("total funds = Throne $50 + Stripe $20", s.totalFunds === 7000, "totalFunds=" + s.totalFunds);
  ok("sales count is 2", s.salesCount === 2, "salesCount=" + s.salesCount);
  ok("goal default $1000", s.goal === 100000, "goal=" + s.goal);
  ok("Throne breakdown $50", s.byMethod.throne.amount === 5000 && s.byMethod.throne.count === 1, JSON.stringify(s.byMethod));
  ok("Stripe breakdown $20", s.byMethod.stripe.amount === 2000 && s.byMethod.stripe.count === 1, JSON.stringify(s.byMethod));
  ok("sales today includes both", s.salesToday.amount === 7000 && s.salesToday.count === 2, JSON.stringify(s.salesToday));
  ok("poster pin total matches first charge", s.games.poster.count === 1 && s.games.poster.amount === charge, JSON.stringify(s.games));
  ok("wheel spin total matches wheel charge", s.games.wheel.count === 1 && s.games.wheel.amount === wheelCharge, JSON.stringify(s.games));
  ok("recent sales listed", Array.isArray(s.recentSales) && s.recentSales.length === 2);

  r = await req(port, "GET", "/admin/analytics");
  ok("analytics page served", r.status === 200 && /Toward the goal|Sales/.test(r.text), "status=" + r.status);

  console.log("8. Concurrency: parallel spins can't overspend, parallel webhooks credit once");
  r = await req(port, "POST", "/api/new", { body: {} });
  const auth2 = { Authorization: "Bearer " + r.json.token };
  const code2 = r.json.player.code;
  const id2 = r.json.player.id;
  r = await req(port, "POST", "/api/request-load", { headers: auth2, body: { amount: 30 } });
  const load2 = r.json.load.id;
  // approve twice at once — only one may succeed
  const approvals = await Promise.all([1, 2, 3].map(() => req(port, "POST", "/api/admin/loads/" + load2 + "/approve", {
    headers: { Cookie: adminCookie }, body: { amount: 30 }
  })));
  ok("parallel approvals credit once", approvals.filter((x) => x.status === 200).length === 1, approvals.map((x) => x.status).join(","));
  r = await req(port, "GET", "/api/me", { headers: auth2 });
  ok("balance is $30 after racing approvals", r.json.player.balance === 3000, "balance=" + r.json.player.balance);

  const spins = await Promise.all(Array.from({ length: 25 }, () => req(port, "POST", "/api/spin", { headers: auth2, body: { game: "wheel" } })));
  const okSpins = spins.filter((x) => x.status === 200);
  const charged = okSpins.reduce((a, x) => a + x.json.result.charge, 0);
  ok("every spin either played or was told to add funds", spins.every((x) => x.status === 200 || (x.status === 400 && x.json.broke)), spins.map((x) => x.status).join(","));
  r = await req(port, "GET", "/api/me", { headers: auth2 });
  const p2 = r.json.player;
  ok("balance never negative", p2.balance >= 0, "balance=" + p2.balance);
  ok("charges add up exactly (no double spend)", charged + p2.balance === 3000 && p2.tab === charged, "charged=" + charged + " balance=" + p2.balance + " tab=" + p2.tab);

  const payload2 = JSON.stringify({
    id: "evt_test_2", object: "event", type: "checkout.session.completed",
    data: { object: { id: "cs_test_2", object: "checkout.session", amount_total: 1500, payment_status: "paid", metadata: { playerCode: code2, playerId: id2 } } }
  });
  const sig2 = stripePay.generateTestHeader(payload2, WHSEC);
  const hooks = await Promise.all(Array.from({ length: 6 }, () => req(port, "POST", "/api/stripe/webhook", {
    raw: payload2, headers: { "Content-Type": "application/json", "Stripe-Signature": sig2 }
  })));
  ok("parallel webhooks all answered 200", hooks.every((x) => x.status === 200), hooks.map((x) => x.status).join(","));
  r = await req(port, "GET", "/api/me", { headers: auth2 });
  ok("parallel webhooks credited $15 once", r.json.player.balance === p2.balance + 1500, "balance=" + r.json.player.balance);

  console.log("9. Humiliation wheel: $5 debit, rejected if broke, result in task set");
  r = await req(port, "POST", "/api/new", { body: {} });
  const authH = { Authorization: "Bearer " + r.json.token };
  r = await req(port, "POST", "/api/spin", { headers: authH, body: { game: "humiliation", price: 1 } });
  ok("humiliation rejected when empty", r.status === 400 && r.json.broke, r.text);

  r = await req(port, "POST", "/api/request-load", { headers: authH, body: { amount: 4 } });
  const loadH4 = r.json.load.id;
  r = await req(port, "POST", "/api/admin/loads/" + loadH4 + "/approve", {
    headers: { Cookie: adminCookie }, body: { amount: 4 }
  });
  ok("approved $4 for humiliation broke test", r.status === 200 && r.json.player.balance === 400, r.text);
  r = await req(port, "POST", "/api/spin", { headers: authH, body: { game: "humiliation", price: 1, charge: 100 } });
  ok("humiliation rejected under $5", r.status === 400 && r.json.broke, r.text);
  r = await req(port, "GET", "/api/me", { headers: authH });
  ok("balance unchanged after rejected humiliation spin", r.json.player.balance === 400, "balance=" + (r.json && r.json.player && r.json.player.balance));

  r = await req(port, "POST", "/api/request-load", { headers: authH, body: { amount: 10 } });
  const loadH10 = r.json.load.id;
  r = await req(port, "POST", "/api/admin/loads/" + loadH10 + "/approve", {
    headers: { Cookie: adminCookie }, body: { amount: 10 }
  });
  ok("approved +$10", r.status === 200 && r.json.player.balance === 1400, r.text);
  const beforeHum = 1400;
  r = await req(port, "POST", "/api/spin", { headers: authH, body: { game: "humiliation", price: 1, amount: 1 } });
  ok("humiliation spin succeeds", r.status === 200 && r.json.result && r.json.result.game === "humiliation", r.text);
  ok("humiliation always charges $5", r.json.result.charge === 500 && r.json.result.balance === beforeHum - 500, JSON.stringify(r.json.result));
  ok("tab includes the $5", r.json.player.tab === 500);
  const { CONFIG } = require("../config");
  const taskTexts = ((CONFIG.humiliationWheel && CONFIG.humiliationWheel.tasks) || []).map((t) => t.text);
  ok("result text is in the configured task set", taskTexts.includes(r.json.result.text), "text=" + (r.json.result && r.json.result.text));
  ok("result index in range", Number.isInteger(r.json.result.index) && r.json.result.index >= 0 && r.json.result.index < taskTexts.length, String(r.json.result.index));
  ok("pin record tagged humiliation", r.json.player.pins[0].game === "humiliation" && r.json.player.pins[0].text === r.json.result.text);
  r = await req(port, "GET", "/api/admin/stats", { headers: { Cookie: adminCookie } });
  ok("analytics counts humiliation spend", r.json.games && r.json.games.humiliation && r.json.games.humiliation.count === 1 && r.json.games.humiliation.amount === 500, JSON.stringify(r.json.games && r.json.games.humiliation));

  console.log("10. Data survives a fresh store (restart)");
  const before = await store.findByCode(code2);
  delete require.cache[require.resolve("./store")];
  const store2 = require("./store");
  await store2.init();
  const after = await store2.findByCode(code2);
  ok("player reloads with same balance", after && after.balance === before.balance && after.tab === before.tab, JSON.stringify({ before: before && before.balance, after: after && after.balance }));
  await store2.close();

  console.log("11. Test play: admin-only play money, excluded from analytics and queues");
  r = await req(port, "GET", "/admin/test");
  ok("test play page served", r.status === 200 && /Test play/.test(r.text) && /TEST MODE — play money/.test(r.text), "status=" + r.status);

  r = await req(port, "GET", "/api/admin/test");
  ok("test state requires admin", r.status === 401);
  r = await req(port, "POST", "/api/admin/test/player", { body: {} });
  ok("create test player requires admin", r.status === 401);
  r = await req(port, "POST", "/api/admin/test/credit", { body: { playerId: "x", amount: 50 } });
  ok("credit test money requires admin", r.status === 401);
  r = await req(port, "POST", "/api/admin/test/reset", { body: { playerId: "x" } });
  ok("reset test pocket requires admin", r.status === 401);

  r = await req(port, "GET", "/api/admin/stats", { headers: { Cookie: adminCookie } });
  const statsBefore = r.json;
  const fundsBefore = statsBefore.totalFunds;
  const salesBefore = statsBefore.salesCount;
  const posterBefore = (statsBefore.games && statsBefore.games.poster && statsBefore.games.poster.count) || 0;
  const wheelBefore = (statsBefore.games && statsBefore.games.wheel && statsBefore.games.wheel.count) || 0;
  const humBefore = (statsBefore.games && statsBefore.games.humiliation && statsBefore.games.humiliation.count) || 0;

  r = await req(port, "POST", "/api/admin/test/player", { headers: { Cookie: adminCookie }, body: {} });
  ok("admin creates test player", r.status === 200 && r.json.player && r.json.player.test === true && r.json.token, r.text);
  const testToken = r.json.token;
  const testId = r.json.player.id;
  const testCode = r.json.player.code;
  const testAuth = { Authorization: "Bearer " + testToken };
  ok("public /api/new is not a test player", true);
  r = await req(port, "POST", "/api/new", { body: {} });
  ok("regular new player is not test", r.status === 200 && r.json.player.test === false, r.text);
  const realId = r.json.player.id;

  r = await req(port, "POST", "/api/admin/test/credit", {
    headers: { Cookie: adminCookie }, body: { playerId: realId, amount: 50 }
  });
  ok("cannot credit play money to a real player", r.status === 400, r.text);

  r = await req(port, "POST", "/api/admin/test/credit", {
    headers: { Cookie: adminCookie }, body: { playerId: testId, amount: 50 }
  });
  ok("admin credits +$50 play money", r.status === 200 && r.json.player.balance === 5000 && r.json.player.test === true, r.text);
  r = await req(port, "POST", "/api/admin/test/credit", {
    headers: { Cookie: adminCookie }, body: { playerId: testId, amount: 100 }
  });
  ok("admin credits +$100 play money", r.status === 200 && r.json.player.balance === 15000, r.text);
  r = await req(port, "POST", "/api/admin/test/credit", {
    headers: { Cookie: adminCookie }, body: { playerId: testId, amount: 500 }
  });
  ok("admin credits +$500 play money", r.status === 200 && r.json.player.balance === 65000, r.text);

  r = await req(port, "GET", "/api/me", { headers: testAuth });
  ok("test /api/me shows test flag and $650", r.status === 200 && r.json.player.test === true && r.json.player.balance === 65000, r.text);

  r = await req(port, "POST", "/api/request-load", { headers: testAuth, body: { amount: 20 } });
  ok("test player cannot request a real Throne load", r.status === 400, r.text);
  r = await req(port, "POST", "/api/stripe/checkout", { headers: testAuth, body: { amount: 20 } });
  ok("test player cannot start Stripe checkout", r.status === 400, r.text);

  // Pending loads created directly still stay off the real admin queue.
  await store.requestLoad(testId, 2000);
  r = await req(port, "GET", "/api/admin/state", { headers: { Cookie: adminCookie } });
  ok("test pending load hidden from admin queue", r.status === 200 && !(r.json.pending || []).some((l) => l.code === testCode), JSON.stringify(r.json.pending));
  ok("test player hidden from real players list", !(r.json.players || []).some((l) => l.code === testCode), JSON.stringify(r.json.players));

  fixRandom([0.01]);
  r = await req(port, "POST", "/api/pin", { headers: testAuth, body: {} });
  ok("test player can pin", r.status === 200 && r.json.result && r.json.result.charge > 0, r.text);
  r = await req(port, "POST", "/api/spin", { headers: testAuth, body: { game: "wheel" } });
  ok("test player can spin the money wheel", r.status === 200 && r.json.result && r.json.result.game === "wheel", r.text);
  r = await req(port, "POST", "/api/spin", { headers: testAuth, body: { game: "humiliation" } });
  ok("test player can spin humiliation", r.status === 200 && r.json.result && r.json.result.game === "humiliation" && r.json.result.charge === 500, r.text);
  realOdds();

  r = await req(port, "GET", "/api/admin/test", { headers: { Cookie: adminCookie } });
  ok("test desk lists the player and history", r.status === 200 && (r.json.players || []).some((p) => p.id === testId && p.pins.length >= 3 && p.loads.length >= 3), r.text);

  r = await req(port, "POST", "/api/admin/test/reset", { headers: { Cookie: adminCookie }, body: { playerId: testId } });
  ok("reset test pocket to $0", r.status === 200 && r.json.player.balance === 0, r.text);
  r = await req(port, "GET", "/api/me", { headers: testAuth });
  ok("pocket is $0 after reset, history kept", r.json.player.balance === 0 && r.json.player.pins.length >= 3, r.text);

  r = await req(port, "POST", "/api/claim", { body: { code: testCode } });
  ok("claim test code returns the same token", r.status === 200 && r.json.token === testToken && r.json.player.test === true, "token rotated?");
  r = await req(port, "POST", "/api/claim", { body: { code: testCode } });
  ok("second claim still returns the same token", r.status === 200 && r.json.token === testToken);

  r = await req(port, "GET", "/api/admin/stats", { headers: { Cookie: adminCookie } });
  ok("analytics funds unchanged by test money", r.json.totalFunds === fundsBefore, "before=" + fundsBefore + " after=" + r.json.totalFunds);
  ok("analytics sales count unchanged", r.json.salesCount === salesBefore, "before=" + salesBefore + " after=" + r.json.salesCount);
  ok("analytics poster count unchanged", r.json.games.poster.count === posterBefore, JSON.stringify(r.json.games.poster));
  ok("analytics wheel count unchanged", r.json.games.wheel.count === wheelBefore, JSON.stringify(r.json.games.wheel));
  ok("analytics humiliation count unchanged", r.json.games.humiliation.count === humBefore, JSON.stringify(r.json.games.humiliation));

  console.log("12. ROOT_PAGE, request-host URLs, games hub, and back-to-links");
  function isGamesHub(res) {
    return res.status === 200 && !res.headers.location
      && res.text.includes("Goddess Arcade")
      && res.text.includes("Created by your Goddess Mari")
      && res.text.includes("@goddessoftaurus")
      && res.text.includes("Pin the Tail on the Pig")
      && res.text.includes("Wheel of Financial Torture")
      && res.text.includes("Wheel of Humiliation")
      && res.text.includes('href="/admin">Admin</a>')
      && res.text.includes("← back to links");
  }
  r = await req(port, "GET", "/");
  ok("GET / serves the games hub when ROOT_PAGE is unset", isGamesHub(r), "status=" + r.status + " loc=" + r.headers.location);
  r = await req(port, "GET", "/games");
  ok("GET /games serves the games hub", isGamesHub(r), "status=" + r.status);
  r = await req(port, "GET", "/games.html");
  ok("GET /games.html serves the games hub", isGamesHub(r), "status=" + r.status);
  r = await req(port, "GET", "/index.html");
  ok("GET /index.html still serves the links page", r.status === 200 && r.text.includes("body class=\"bio\"") && !r.text.includes("hub-cards"), "status=" + r.status);

  process.env.ROOT_PAGE = "wheel.html";
  r = await req(port, "GET", "/");
  ok("ROOT_PAGE redirects / to /wheel.html", r.status === 302 && r.headers.location === "/wheel.html", "loc=" + r.headers.location);
  r = await req(port, "GET", "/?code=PIG-TEST&x=1");
  ok("ROOT_PAGE keeps the query string", r.status === 302 && r.headers.location === "/wheel.html?code=PIG-TEST&x=1", "loc=" + r.headers.location);
  process.env.ROOT_PAGE = "/humiliation.html";
  r = await req(port, "GET", "/?code=PIG-AA");
  ok("ROOT_PAGE strips a leading slash", r.status === 302 && r.headers.location === "/humiliation.html?code=PIG-AA", "loc=" + r.headers.location);
  process.env.ROOT_PAGE = "https://evil.example";
  r = await req(port, "GET", "/");
  ok("unsafe ROOT_PAGE is ignored and the games hub is served", isGamesHub(r), "status=" + r.status + " loc=" + r.headers.location);
  delete process.env.ROOT_PAGE;

  const prevPublic = process.env.PUBLIC_URL;
  process.env.PUBLIC_URL = "https://hardcoded.example";
  const fromHost = publicUrl({
    headers: { "x-forwarded-proto": "https", "x-forwarded-host": "wheeloftorture.onrender.com" },
    protocol: "http"
  });
  ok("request host wins over PUBLIC_URL", fromHost === "https://wheeloftorture.onrender.com", "got=" + fromHost);
  const fromFallback = publicUrl({ headers: {}, protocol: "http" });
  ok("PUBLIC_URL used when the request has no host", fromFallback === "https://hardcoded.example", "got=" + fromFallback);
  if (prevPublic == null) delete process.env.PUBLIC_URL;
  else process.env.PUBLIC_URL = prevPublic;

  const fs = require("fs");
  const path = require("path");
  ok("backLinkUrl defaults to the Linktree", CONFIG.backLinkUrl === "https://linktr.ee/crystal98xo", "got=" + CONFIG.backLinkUrl);
  ok("gamesHubUrl points at the goddessarcade hub", CONFIG.gamesHubUrl === "https://goddessarcade.onrender.com/games.html", "got=" + CONFIG.gamesHubUrl);
  for (const file of ["game.html", "wheel.html", "humiliation.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    const backs = html.match(/class="back[^"]*"[^>]*>/g) || [];
    const allLinktree = html.includes('href="https://linktr.ee/crystal98xo">← back to links');
    const hasGames = html.includes('class="back back-games"') && html.includes("← back to games");
    const leftover = /class="back[^"]*"[^>]*href="index\.html"/.test(html) || /href="index\.html"[^>]*class="back/.test(html);
    const blank = /class="back[^"]*"[^>]*target="_blank"/.test(html);
    ok(file + " has Back to links and Back to games in the same tab", allLinktree && hasGames && !leftover && !blank,
      "backs=" + backs.join(" | ") + " leftover=" + leftover + " games=" + hasGames);
  }
  const gameJs = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
  const wheelJs = fs.readFileSync(path.join(__dirname, "..", "wheel.js"), "utf8");
  ok("game.js wires Back to games through gamesHubUrl", gameJs.includes("gamesHubHref") && gameJs.includes("back-games") && gameJs.includes("gamesHubUrl"));
  ok("wheel.js wires Back to games through gamesHubUrl", wheelJs.includes("gamesHubHref") && wheelJs.includes("back-games") && wheelJs.includes("gamesHubUrl"));

  console.log("13. Pin zones, Pay up pop-up, and wheel flick");
  const pin = require("../pin-zones");
  const flick = require("../wheel-flick");

  const tiers = pin.buildPinTiers(CONFIG);
  ok("pin tiers reuse configured amounts", tiers.length === CONFIG.segments.length, "n=" + tiers.length);
  ok("lowest pin amount is the bullseye", tiers[0].zone === "bullseye" && Number(tiers[0].value) === 5, JSON.stringify(tiers[0]));
  ok("highest pin amount is a miss", tiers[tiers.length - 1].zone === "miss" && tiers[tiers.length - 1].value === "ALL", JSON.stringify(tiers[tiers.length - 1]));
  const zoneNames = tiers.map((s) => s.zone);
  ok("pin tiers include inner, mid, and outer rings", ["inner", "mid", "outer"].every((z) => zoneNames.includes(z)), zoneNames.join(","));
  const weightOf = (z) => tiers.filter((s) => s.zone === z).reduce((a, s) => a + s.weight, 0);
  ok("bullseye is rarer than a miss", weightOf("bullseye") < weightOf("miss"), "bull=" + weightOf("bullseye") + " miss=" + weightOf("miss"));
  ok("auto-mapping still works without pinZone fields", pin.buildPinTiers({
    segments: [{ label: "$5", value: 5, weight: 22 }, { label: "$50", value: 50, weight: 10 }, { label: "ALL", value: "ALL", weight: 4 }]
  }).map((s) => s.zone).join(",") === "bullseye,mid,miss");

  const target = pin.TARGET;
  let bullOk = true;
  let missFar = false;
  for (let i = 0; i < 40; i++) {
    const pt = pin.pointInZone("bullseye");
    const nx = (pt.x - target.cx) / target.rx;
    const ny = (pt.y - target.cy) / target.ry;
    if (Math.sqrt(nx * nx + ny * ny) > target.rings.bullseye[1] + 0.02) bullOk = false;
  }
  for (let i = 0; i < 40; i++) {
    const pt = pin.pointInZone("miss");
    const nx = (pt.x - target.cx) / target.rx;
    const ny = (pt.y - target.cy) / target.ry;
    if (Math.sqrt(nx * nx + ny * ny) > 1.0) missFar = true;
  }
  ok("bullseye points sit inside the center ring", bullOk);
  ok("some miss points land outside the painted target", missFar);

  r = await req(port, "POST", "/api/new", { body: {} });
  const zoneAuth = { Authorization: "Bearer " + r.json.token };
  r = await req(port, "POST", "/api/request-load", { headers: zoneAuth, body: { amount: 500 } });
  ok("zone-test player requested $500", r.status === 200 && r.json.load, r.text);
  const zoneLoadId = r.json.load.id;
  r = await req(port, "POST", "/api/admin/loads/" + zoneLoadId + "/approve", {
    headers: { Cookie: adminCookie }, body: { amount: 500 }
  });
  ok("zone-test funds approved", r.status === 200 && r.json.player && r.json.player.balance === 50000, r.text);

  const pinResults = [];
  fixRandom([0.02, 0.9, 0.3, 0.5, 0.15, 0.7, 0.4, 0.85]);
  for (let i = 0; i < 40; i++) {
    const pr = await req(port, "POST", "/api/pin", { headers: zoneAuth, body: { game: "poster" } });
    if (pr.status !== 200) break;
    pinResults.push(pr.json.result);
    if (pr.json.player.balance <= 0) break;
  }
  realOdds();
  ok("server pins return a zone", pinResults.length > 0 && pinResults.every((x) => x.zone && x.zoneLabel && x.game === "poster"), JSON.stringify(pinResults[0]));
  ok("pins land in more than one zone over many throws", new Set(pinResults.map((x) => x.zone)).size >= 2, pinResults.map((x) => x.zone + ":" + x.label).join(", "));
  const bullCharge = pinResults.find((x) => x.zone === "bullseye");
  const missCharge = pinResults.find((x) => x.zone === "miss");
  if (bullCharge && missCharge) {
    ok("bullseye charges less than a miss", bullCharge.charge < missCharge.charge, "bull=" + bullCharge.charge + " miss=" + missCharge.charge);
  } else {
    const bullTier = tiers.find((s) => s.zone === "bullseye");
    const missTier = tiers.find((s) => s.zone === "miss" && s.value !== "ALL") || tiers.find((s) => s.zone === "miss");
    ok("configured bullseye amount is lower than a miss", pin.amountKey(bullTier) < pin.amountKey(missTier));
  }
  ok("zone labels match the banners", pinResults.every((x) => x.zoneLabel === pin.ZONE_BANNERS[x.zone]), pinResults.map((x) => x.zoneLabel).join(" | "));

  ok("tiny flicks do not start a spin", flick.shouldSpin(0.05) === false);
  ok("a firm flick starts a spin", flick.shouldSpin(0.3) === true);
  ok("faster flicks spin longer", flick.durationFromVelocity(1.2, false) > flick.durationFromVelocity(0.2, false));
  const fwd = flick.targetRotation(0, 0, 9, 1, 6);
  const back = flick.targetRotation(0, 0, 9, -1, 6);
  ok("flick direction changes the spin way", fwd > 0 && back < 0, "fwd=" + fwd + " back=" + back);
  const landing0 = (360 - 20) % 360;
  const norm = (n) => ((n % 360) + 360) % 360;
  ok("flick landing stays on the chosen slice", Math.abs(norm(fwd) - landing0) < 0.01 && Math.abs(norm(back) - landing0) < 0.01, "fwd=" + norm(fwd) + " back=" + norm(back) + " want=" + landing0);
  ok("Pay up opens an in-page sheet with Throne and card options",
    gameJs.includes('id="ptPay">Pay up</button>') &&
    gameJs.includes("function openPayUp") &&
    gameJs.includes("Pay via Throne") &&
    gameJs.includes("Card payments coming soon") &&
    gameJs.includes("no real payment") &&
    !gameJs.includes("index.html#crypto"));
  ok("wheels share the same Pay up sheet and flick-to-spin",
    wheelJs.includes("function openPayUp") &&
    wheelJs.includes("Pay via Throne") &&
    wheelJs.includes("Card payments coming soon") &&
    wheelJs.includes("no real payment") &&
    wheelJs.includes("Swipe the wheel or tap Spin") &&
    wheelJs.includes("bindFlick") &&
    wheelJs.includes("PayPiggyFlick"));
  const servedFlick = await req(port, "GET", "/wheel-flick.js");
  const servedPin = await req(port, "GET", "/pin-zones.js");
  ok("flick and pin helpers are served as static files", servedFlick.status === 200 && servedPin.status === 200 && servedFlick.text.includes("shouldSpin") && servedPin.text.includes("buildPinTiers"));

  console.log("14. Player account page");
  function isAccountPage(res) {
    return res.status === 200
      && res.text.includes("My account")
      && res.text.includes("Add funds")
      && res.text.includes("Sign out")
      && res.text.includes("start a new account")
      && res.text.includes("Play code")
      && !res.text.includes("/api/admin");
  }
  r = await req(port, "GET", "/account");
  ok("GET /account serves the player account page", isAccountPage(r), "status=" + r.status);
  r = await req(port, "GET", "/account.html");
  ok("GET /account.html serves the player account page", isAccountPage(r), "status=" + r.status);
  const accountJs = fs.readFileSync(path.join(__dirname, "..", "account.js"), "utf8");
  ok("account.js uses player APIs only", accountJs.includes('"/api/me"') && accountJs.includes('"/api/new"') && accountJs.includes('"/api/claim"') && accountJs.includes('"/api/request-load"') && !accountJs.includes("/api/admin"));
  ok("account.js signs out to the games hub with a save-your-code note", accountJs.includes("acctSignOut") && accountJs.includes("signedout=") && accountJs.includes("gamesHubBase"));
  const accountHtml = fs.readFileSync(path.join(__dirname, "..", "account.html"), "utf8");
  ok("account Add funds sheet matches the games", accountHtml.includes("Pay via Throne") && accountJs.includes("Card payments coming soon") && accountHtml.includes("no real payment") && accountJs.includes("paymentsLocked"));

  r = await req(port, "GET", "/api/me");
  ok("/api/me rejects a missing session", r.status === 401, "status=" + r.status);
  r = await req(port, "POST", "/api/new", { body: {} });
  ok("account player A is created", r.status === 200 && r.json.token && r.json.player.code, r.text);
  const aTok = r.json.token, aCode = r.json.player.code, aId = r.json.player.id;
  r = await req(port, "GET", "/api/me", { headers: { Authorization: "Bearer " + aTok } });
  ok("/api/me returns only player A", r.status === 200 && r.json.player && r.json.player.code === aCode && r.json.player.id === aId && !r.json.player.token, "code=" + (r.json.player && r.json.player.code));
  ok("player payload does not list other players", r.json.player && !r.json.players && Array.isArray(r.json.player.pins) && Array.isArray(r.json.player.loads) && Array.isArray(r.json.player.pending));
  r = await req(port, "POST", "/api/new", { body: {} });
  const bTok = r.json.token, bCode = r.json.player.code;
  r = await req(port, "GET", "/api/me", { headers: { Authorization: "Bearer " + aTok } });
  ok("player A cannot see player B", r.status === 200 && r.json.player.code === aCode && r.json.player.code !== bCode && JSON.stringify(r.json).indexOf(bCode) < 0);
  r = await req(port, "GET", "/api/me", { headers: { Authorization: "Bearer " + bTok } });
  ok("player B cannot see player A", r.status === 200 && r.json.player.code === bCode && JSON.stringify(r.json).indexOf(aCode) < 0);
  r = await req(port, "POST", "/api/claim", { body: { code: aCode } });
  ok("claiming a code returns a session for that player only", r.status === 200 && r.json.player.code === aCode && r.json.token && r.json.token !== aTok);
  const aTok2 = r.json.token;
  r = await req(port, "GET", "/api/me", { headers: { Authorization: "Bearer " + aTok2 } });
  ok("claimed session loads player A", r.status === 200 && r.json.player.code === aCode);

  const styleCss = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");
  ok("Matcha Style is self-hosted with font-display swap", styleCss.includes('font-family:"Matcha Style"') && styleCss.includes("font-display:swap") && styleCss.includes("/assets/fonts/MatchaStyle.woff2"));
  const fontWoff = fs.existsSync(path.join(__dirname, "..", "assets/fonts/MatchaStyle.woff2"));
  const fontTtf = fs.existsSync(path.join(__dirname, "..", "assets/fonts/MatchaStyle.ttf"));
  ok("Matcha Style woff2 and ttf are in assets/fonts", fontWoff && fontTtf);
  r = await req(port, "GET", "/assets/fonts/MatchaStyle.woff2");
  ok("Matcha Style woff2 is served", r.status === 200 && r.text.length > 1000, "status=" + r.status + " type=" + r.headers["content-type"] + " len=" + (r.text && r.text.length));

  for (const file of ["game.html", "wheel.html", "humiliation.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    ok(file + " has a My account link", html.includes('class="back back-account"') && html.includes("My account"));
  }
  const hubHtml = fs.readFileSync(path.join(__dirname, "..", "games.html"), "utf8");
  ok("games hub has a prominent My account link", hubHtml.includes("My account") && hubHtml.includes("hub-account"));

  console.log("15. Admin endpoints stay protected");
  r = await req(port, "GET", "/api/admin/state");
  ok("admin state still requires a sign-in", r.status === 401, "status=" + r.status);
  r = await req(port, "GET", "/api/admin/test");
  ok("admin test desk still requires a sign-in", r.status === 401, "status=" + r.status);

  console.log("16. Rewards milestone logic");
  {
    const rw = require("./rewards");
    const { CONFIG } = require("../config");
    const cfg = rw.normalizeConfig(CONFIG.rewards);
    const ids = (hits) => hits.map((h) => h.rule.id);
    // Pin the Tail: bullseyes and miss streaks
    let prog = rw.emptyProgress();
    let hits = rw.applyPlay(prog, { game: "poster", zone: "bullseye" }, cfg);
    ok("1st bullseye unlocks the Accurate Piggy badge", ids(hits).join() === "pin-bull-1", ids(hits).join());
    rw.applyPlay(prog, { game: "poster", zone: "inner" }, cfg);
    hits = rw.applyPlay(prog, { game: "poster", zone: "bullseye" }, cfg);
    ok("2nd bullseye unlocks nothing", hits.length === 0);
    hits = rw.applyPlay(prog, { game: "poster", zone: "bullseye" }, cfg);
    ok("3rd bullseye unlocks the custom photo", ids(hits).join() === "pin-bull-3", ids(hits).join());
    rw.applyPlay(prog, { game: "poster", zone: "bullseye" }, cfg);
    hits = rw.applyPlay(prog, { game: "poster", zone: "bullseye" }, cfg);
    ok("5th bullseye unlocks the voice note", ids(hits).join() === "pin-bull-5");
    for (let i = 0; i < 4; i++) rw.applyPlay(prog, { game: "poster", zone: "bullseye" }, cfg);
    hits = rw.applyPlay(prog, { game: "poster", zone: "bullseye" }, cfg);
    ok("10th bullseye unlocks the short video", ids(hits).join() === "pin-bull-10" && prog.bullseyes === 10);
    hits = rw.applyPlay(prog, { game: "poster", zone: "bullseye" }, cfg);
    ok("count rewards never repeat", hits.length === 0);
    rw.applyPlay(prog, { game: "poster", zone: "miss" }, cfg);
    rw.applyPlay(prog, { game: "poster", zone: "miss" }, cfg);
    rw.applyPlay(prog, { game: "poster", zone: "outer" }, cfg);
    ok("a non-miss breaks the miss streak", prog.missStreak === 0);
    rw.applyPlay(prog, { game: "poster", zone: "miss" }, cfg);
    rw.applyPlay(prog, { game: "poster", zone: "miss" }, cfg);
    hits = rw.applyPlay(prog, { game: "poster", zone: "miss" }, cfg);
    ok("3 misses in a row unlocks Clumsy Piggy", ids(hits).join() === "pin-clumsy" && hits[0].rule.penalty, ids(hits).join());
    ok("streak resets after the penalty", prog.missStreak === 0);
    rw.applyPlay(prog, { game: "poster", zone: "miss" }, cfg);
    rw.applyPlay(prog, { game: "poster", zone: "miss" }, cfg);
    hits = rw.applyPlay(prog, { game: "poster", zone: "miss" }, cfg);
    ok("Clumsy Piggy can repeat", ids(hits).join() === "pin-clumsy" && prog.counts["pin-clumsy"] === 2);

    // Wheel of Financial Torture
    prog = rw.emptyProgress();
    const wheelHits = [];
    for (let i = 1; i <= 50; i++) wheelHits.push([i, ids(rw.applyPlay(prog, { game: "wheel" }, cfg))]);
    const at = (n) => wheelHits[n - 1][1].join();
    ok("wheel: 5 spins -> custom photo", at(5) === "wheel-5", at(5));
    ok("wheel: 10 spins -> 2-minute video + bonus spin", at(10) === "wheel-10,wheel-bonus", at(10));
    ok("wheel: 20 spins -> bonus spin only", at(20) === "wheel-bonus", at(20));
    ok("wheel: 25 spins -> chat access", at(25) === "wheel-25", at(25));
    ok("wheel: 50 spins -> longer video + bonus", at(50) === "wheel-50,wheel-bonus", at(50));
    ok("wheel: 7 spins -> nothing", at(7) === "");
    ok("wheel spins don't count toward other games", prog.spins.humiliation === 0 && prog.spins.poster === 0 && prog.spins.wheel === 50);

    // Wheel of Humiliation
    prog = rw.emptyProgress();
    hits = rw.applyPlay(prog, { game: "humiliation", index: 1 }, cfg);
    ok("humiliation: first spin unlocks nothing", hits.length === 0);
    hits = rw.applyPlay(prog, { game: "humiliation", index: 1 }, cfg);
    ok("humiliation: same task twice -> Double Shame", ids(hits).join() === "hum-double");
    hits = rw.applyPlay(prog, { game: "humiliation", index: 1 }, cfg);
    ok("humiliation: a third in a row starts a new pair", hits.length === 0);
    rw.applyPlay(prog, { game: "humiliation", index: 2 }, cfg);
    hits = rw.applyPlay(prog, { game: "humiliation", index: 3 }, cfg);
    ok("humiliation: 5 spins -> personalized task", ids(hits).join() === "hum-5", ids(hits).join());
    for (let i = 6; i <= 9; i++) rw.applyPlay(prog, { game: "humiliation", index: i % 2 ? 4 : 5 }, cfg);
    hits = rw.applyPlay(prog, { game: "humiliation", index: 7 }, cfg);
    ok("humiliation: 10 spins -> nickname", ids(hits).join() === "hum-10" && hits[0].rule.nickname, ids(hits).join());

    // Levels
    prog = rw.emptyProgress();
    let reached = rw.applySpend(prog, 5000, cfg);
    ok("$50 stays Pathetic Piglet", reached.length === 0 && rw.levelInfo(cfg, prog.spent).name === "Pathetic Piglet");
    reached = rw.applySpend(prog, 60000, cfg);
    ok("jumping to $650 reaches Basic Paypig, Silver Pig and Golden Pig", reached.map((l) => l.name).join() === "Basic Paypig,Silver Pig,Golden Pig", reached.map((l) => l.name).join());
    ok("level info shows the next level", rw.levelInfo(cfg, prog.spent).next.name === "Platinum Pig" && rw.levelInfo(cfg, prog.spent).next.toGo === 35000);
    reached = rw.applySpend(prog, 100, cfg);
    ok("levels are not re-awarded", reached.length === 0);
    reached = rw.applySpend(prog, 90000, cfg);
    ok("$1550 reaches Platinum Pig and Royal Hog", reached.map((l) => l.name).join() === "Platinum Pig,Royal Hog");
    ok("ladder has six levels", cfg.levels.map((l) => l.name).join() === "Pathetic Piglet,Basic Paypig,Silver Pig,Golden Pig,Platinum Pig,Royal Hog");
    // Progress saved under the old 4-level ladder (level index 2 = Golden Pig, no levelMin)
    const old = { spent: 60000, level: 2, counts: {}, spins: {} };
    reached = rw.applySpend(old, 1000, cfg);
    ok("old saved level doesn't re-award Golden Pig or Silver Pig", reached.length === 0 && old.levelMin === 50000 && old.level === 3, JSON.stringify(reached.map((l) => l.name)));
    reached = rw.applySpend(old, 40000, cfg);
    ok("old saved progress still reaches Platinum Pig next", reached.map((l) => l.name).join() === "Platinum Pig");
    // Silver moved from $300 to $200: players who already passed it aren't re-awarded,
    // players at Basic Paypig with $200+ get Silver on their next gift.
    const passedOldSilver = { spent: 32000, level: 2, levelMin: 30000, counts: {}, spins: {} };
    reached = rw.applySpend(passedOldSilver, 1000, cfg);
    ok("old Silver ($300) holders don't get Silver again", reached.length === 0, JSON.stringify(reached.map((l) => l.name)));
    const basicAt250 = { spent: 25000, level: 1, levelMin: 10000, counts: {}, spins: {} };
    reached = rw.applySpend(basicAt250, 1000, cfg);
    ok("Basic Paypig with $250 reaches Silver at the new $200 mark", reached.map((l) => l.name).join() === "Silver Pig");
    ok("Silver Pig starts at $200", rw.levelInfo(cfg, 20000).name === "Silver Pig" && rw.levelInfo(cfg, 19999).name === "Basic Paypig");
    const w10 = cfg.games.wheel.rules.find((x) => x.id === "wheel-10");
    ok("10-spin wheel reward is the 5-minute video", w10.at === 10 && w10.title === "5-minute custom video");

    // Existing players get credit for gifts already confirmed, without retroactive claims
    const legacy = { id: "x", loads: [{ status: "approved", amount: 20000 }, { status: "rejected", amount: 0 }] };
    rw.ensureProgress(legacy, cfg);
    ok("existing players keep confirmed spend for their level", legacy.rewards.spent === 20000 && legacy.rewards.level === 2 && legacy.rewards.levelMin === 20000);

    ok("leaderboard name never uses the play code", !rw.publicName({ id: "ply-1", code: "PIG-ABCD" }).includes("ABCD"));
  }

  console.log("17. Rewards through the API");
  r = await req(port, "GET", "/api/rewards");
  ok("signed-out rewards list has all three games", r.status === 200 && r.json.games.poster.rules.length === 5 && r.json.games.wheel.rules.length === 5 && r.json.games.humiliation.rules.length === 4);
  ok("signed-out rewards list has no progress", !r.json.me && r.json.games.wheel.rules[0].current === undefined);
  ok("signed-out list includes levels and leaderboard", r.json.levels.length === 6 && Array.isArray(r.json.leaderboard.top));
  r = await req(port, "POST", "/api/admin/test/player", { headers: { Cookie: adminCookie } });
  const rwTok = r.json.token, rwId = r.json.player.id, rwCode = r.json.player.code;
  await req(port, "POST", "/api/admin/test/credit", { headers: { Cookie: adminCookie }, body: { playerId: rwId, amount: 500 } });
  const rwAuth = { Authorization: "Bearer " + rwTok };
  let unlockedAt5 = null;
  fixRandom([0.01]);
  for (let i = 1; i <= 5; i++) {
    r = await req(port, "POST", "/api/spin", { headers: rwAuth, body: { game: "wheel" } });
    if (i === 5) unlockedAt5 = r.json && r.json.result && r.json.result.unlocked;
  }
  realOdds();
  ok("5th wheel spin returns Reward unlocked in the result", Array.isArray(unlockedAt5) && unlockedAt5.length === 1 && unlockedAt5[0].ruleId === "wheel-5" && unlockedAt5[0].test === true, JSON.stringify(unlockedAt5));
  r = await req(port, "GET", "/api/rewards", { headers: rwAuth });
  const wheelRule = r.json.games.wheel.rules.find((x) => x.id === "wheel-10");
  ok("signed-in rewards show progress", r.json.me && r.json.me.stats.spins.wheel === 5 && wheelRule.current === 5 && wheelRule.unlocked === false);
  ok("unlocked reward shows as unlocked", r.json.games.wheel.rules.find((x) => x.id === "wheel-5").unlocked === true);
  const w5 = r.json.me.claims.find((c) => c.ruleId === "wheel-5");
  ok("player sees the claim as pending + test", w5 && w5.status === "pending" && w5.test === true && r.json.me.test === true);
  ok("test player's play money counts toward its level", r.json.me.level.spent === 50000 && r.json.me.level.name === "Golden Pig", JSON.stringify(r.json.me.level));
  ok("reaching a level queues a level-up reward", r.json.me.claims.filter((c) => c.kind === "level").map((c) => c.title).join() === "Reached Golden Pig,Reached Silver Pig,Reached Basic Paypig");
  r = await req(port, "GET", "/api/admin/rewards");
  ok("admin rewards queue requires a sign-in", r.status === 401);
  r = await req(port, "GET", "/api/admin/rewards", { headers: { Cookie: adminCookie } });
  ok("test player claims are kept out of the real queue", r.status === 200 && !r.json.pending.some((c) => c.code === rwCode) && r.json.testPending.some((c) => c.ruleId === "wheel-5"));
  ok("test players stay off the leaderboard", !r.json.leaderboard.some((b) => b.code === rwCode));
  const claimId = r.json.testPending.find((c) => c.ruleId === "wheel-5").id;
  r = await req(port, "POST", "/api/admin/rewards/" + claimId, { body: { status: "sent" } });
  ok("marking a reward needs admin", r.status === 401);
  r = await req(port, "POST", "/api/admin/rewards/" + claimId, { headers: { Cookie: adminCookie }, body: { status: "sent" } });
  ok("admin marks a reward sent", r.status === 200 && r.json.claim.status === "sent");
  r = await req(port, "POST", "/api/admin/rewards/" + claimId, { headers: { Cookie: adminCookie }, body: { status: "denied" } });
  ok("a settled reward can't be changed again", r.status === 400);
  r = await req(port, "GET", "/api/rewards", { headers: rwAuth });
  ok("player sees the reward as sent", r.json.me.claims.find((c) => c.ruleId === "wheel-5").status === "sent");
  const realBoard = (await req(port, "GET", "/api/rewards")).json.leaderboard.top;
  ok("public leaderboard has no play codes", !JSON.stringify(realBoard).includes("PIG-"));
  console.log("18. You're THE Paypig pop-up");
  {
    const rw = require("./rewards");
    const { CONFIG } = require("../config");
    const cfg = rw.normalizeConfig(CONFIG.rewards);
    ok("pop-up text is configured", cfg.celebration.title === "You're THE Paypig" && /ROYAL HOG/.test(cfg.celebration.subtitle) && cfg.celebration.atCents === 50000);
    ok("no pop-up under $500", rw.pendingCelebration({}, { spent: 49999 }, cfg) === null);
    ok("pop-up at $500", rw.pendingCelebration({}, { spent: 50000 }, cfg).title === "You're THE Paypig");
    ok("no pop-up once seen", rw.pendingCelebration({ seen: { "paypig-500": 1 } }, { spent: 90000 }, cfg) === null);
  }
  r = await req(port, "POST", "/api/admin/test/player", { headers: { Cookie: adminCookie } });
  const celAuth = { Authorization: "Bearer " + r.json.token };
  const celId = r.json.player.id;
  await req(port, "POST", "/api/admin/test/credit", { headers: { Cookie: adminCookie }, body: { playerId: celId, amount: 499 } });
  r = await req(port, "GET", "/api/rewards", { headers: celAuth });
  ok("$499 player gets no pop-up", r.json.me && !r.json.me.celebrate);
  await req(port, "POST", "/api/admin/test/credit", { headers: { Cookie: adminCookie }, body: { playerId: celId, amount: 1 } });
  r = await req(port, "GET", "/api/rewards", { headers: celAuth });
  ok("crossing $500 queues the pop-up", r.json.me.celebrate && r.json.me.celebrate.id === "paypig-500" && r.json.me.celebrate.subtitle === "Can you become the ROYAL HOG?", JSON.stringify(r.json.me.celebrate));
  r = await req(port, "POST", "/api/rewards/seen", { body: { id: "paypig-500" } });
  ok("marking seen needs a player session", r.status === 401);
  r = await req(port, "POST", "/api/rewards/seen", { headers: celAuth, body: { id: "nope" } });
  ok("unknown pop-up id is rejected", r.status === 400);
  r = await req(port, "POST", "/api/rewards/seen", { headers: celAuth, body: { id: "paypig-500" } });
  ok("pop-up marked seen", r.status === 200 && r.json.ok);
  r = await req(port, "GET", "/api/rewards", { headers: celAuth });
  ok("pop-up doesn't repeat", !r.json.me.celebrate);
  // Players already above $500 before the pop-up existed still see it once
  const legacyCel = { id: "x", loads: [{ status: "approved", amount: 120000 }] };
  require("./rewards").ensureProgress(legacyCel, require("./rewards").normalizeConfig(require("../config").CONFIG.rewards));
  ok("players already past $500 see it once", !!require("./rewards").pendingCelebration(legacyCel, legacyCel.rewards, require("./rewards").normalizeConfig(require("../config").CONFIG.rewards)));
  r = await req(port, "GET", "/api/rewards");
  ok("signed-out visitors never get the pop-up", !r.json.me);

  for (const file of ["game.html", "wheel.html", "humiliation.html", "games.html", "account.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    ok(file + " loads the rewards panel", html.includes('src="rewards.js"') && html.includes('href="rewards.css"'));
  }

  server.close();
  await store.close();
  if (fails.length) {
    console.error("\nFAILED: " + fails.join(", "));
    process.exit(1);
  }
  console.log("\nAll server tests passed.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
