"use strict";

const http = require("http");
const path = require("path");
const { loadEnv, createApp, store, stripePay } = require("./index");

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

  r = await req(port, "POST", "/api/pin", { headers: testAuth, body: {} });
  ok("test player can pin", r.status === 200 && r.json.result && r.json.result.charge > 0, r.text);
  r = await req(port, "POST", "/api/spin", { headers: testAuth, body: { game: "wheel" } });
  ok("test player can spin the money wheel", r.status === 200 && r.json.result && r.json.result.game === "wheel", r.text);
  r = await req(port, "POST", "/api/spin", { headers: testAuth, body: { game: "humiliation" } });
  ok("test player can spin humiliation", r.status === 200 && r.json.result && r.json.result.game === "humiliation" && r.json.result.charge === 500, r.text);

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
