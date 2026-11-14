(function () {
  "use strict";

  var C = window.CONFIG || {};
  var SITE = window.SITE_NAME || C.siteName || "PayPiggy";
  document.title = SITE + " — My account";
  var brand = document.getElementById("acctBrand");
  if (brand) brand.textContent = String(SITE).toUpperCase();

  var TOKEN_KEY = "paypiggy-token";
  var STORE_KEY = "paypiggy-demo-v2";
  var API = (C.apiBase || "").replace(/\/$/, "");
  var GAMES_HUB = C.gamesHubUrl || "https://goddessarcade.onrender.com/games.html";
  var BACK_LINK = C.backLinkUrl || "https://linktr.ee/crystal98xo";

  var demo = true;
  var flags = { stripe: false, throne: C.ENABLE_THRONE !== false };
  var player = { code: "", balance: 0, tab: 0, pins: [], loads: [], pending: [] };
  var chosenAmt = 20;

  function $(id) { return document.getElementById(id); }
  function money(cents) { return "$" + (Math.max(0, Number(cents) || 0) / 100).toFixed(2); }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function token() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  function gamesHubBase() {
    var href = GAMES_HUB;
    try {
      var here = String(location.hostname || "").toLowerCase();
      var hubHost = "";
      try { hubHost = new URL(GAMES_HUB, location.href).hostname.toLowerCase(); } catch (e2) {}
      if (!here || here === "localhost" || here === "127.0.0.1" || (hubHost && here === hubHost)) {
        href = "/games.html";
      }
    } catch (e) {}
    return href;
  }
  function withCode(page) {
    var code = (player && player.code) || "";
    try {
      if (!code) code = new URLSearchParams(location.search || "").get("code") || "";
    } catch (e) {}
    if (!code) return page;
    return page + (page.indexOf("?") >= 0 ? "&" : "?") + "code=" + encodeURIComponent(code);
  }

  Array.prototype.forEach.call(document.querySelectorAll("a.back"), function (a) {
    if (a.classList.contains("back-games")) a.href = gamesHubBase();
    else if (!a.classList.contains("back-account")) a.href = BACK_LINK;
    a.removeAttribute("target");
  });

  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({}, opts.headers || {});
    if (opts.body != null) headers["Content-Type"] = "application/json";
    var tok = token();
    if (tok) headers.Authorization = "Bearer " + tok;
    return fetch((API || "") + path, {
      method: opts.method || (opts.body != null ? "POST" : "GET"),
      headers: headers,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin"
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) { var err = new Error((j && j.error) || "Request failed"); err.status = r.status; err.body = j; throw err; }
        return j;
      }, function () {
        var err = new Error("Request failed"); err.status = r.status; throw err;
      });
    });
  }

  function paymentsLocked() { return !!(player && player.test); }

  function showDesk() {
    $("gateCard").classList.add("hide");
    $("desk").classList.remove("hide");
  }
  function showGate() {
    $("desk").classList.add("hide");
    $("gateCard").classList.remove("hide");
  }

  function gameName(g) {
    if (g === "wheel") return "Wheel of Financial Torture";
    if (g === "humiliation") return "Wheel of Humiliation";
    return "Pin the Tail on the Pig";
  }
  function pinLine(p) {
    if (p.game === "humiliation") return p.text || p.label || "Task";
    if (p.value === "ALL") return "ALL (the rest of the pocket)";
    var verb = p.game === "wheel" ? "Spun " : "Landed ";
    return verb + (p.label || p.value || "");
  }
  function when(t) {
    return t ? new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  }
  function statusLabel(s) {
    if (s === "pending") return '<span class="status-pill status-pending">Pending</span>';
    if (s === "rejected") return '<span class="status-pill status-not">Not confirmed</span>';
    return '<span class="status-pill status-confirmed">Confirmed</span>';
  }
  function sourceLabel(s) {
    if (!s) return "Gift";
    if (s === "throne" || s === "throne-webhook") return "Throne";
    if (s === "stripe") return "Card";
    if (s === "admin") return "Confirmed by her";
    if (s === "test" || s === "demo") return s;
    return s;
  }

  function fundRows() {
    var rows = [];
    (player.pending || []).forEach(function (l) {
      rows.push({
        status: "pending",
        amount: l.requested,
        source: "Throne",
        ts: l.ts
      });
    });
    (player.loads || []).forEach(function (l) {
      rows.push({
        status: l.status || "approved",
        amount: l.status === "rejected" ? (l.requested || l.amount || 0) : (l.amount || l.requested || 0),
        source: sourceLabel(l.source),
        ts: l.ts,
        signed: l.status !== "rejected"
      });
    });
    rows.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    return rows;
  }

  function applyPlayer(p) {
    if (!p) return;
    player = p;
    $("deskCode").textContent = p.code || "—";
    $("deskPocket").textContent = money(p.balance);
    $("deskTab").textContent = money(p.tab);
    $("deskPlays").textContent = String((p.pins || []).length);
    var sheetCode = $("ptSheetCode");
    if (sheetCode) sheetCode.textContent = p.code || "PIG-XXXX";
    var testOn = !!p.test;
    var ribbon = $("acctRibbon");
    if (ribbon) ribbon.classList.toggle("pt-hide", !testOn);
    document.body.classList.toggle("paypiggy-test", testOn);
    var pend = (p.pending && p.pending.length) || 0;
    $("acctPending").classList.toggle("hide", !pend);
    var wait = $("ptWait");
    if (wait) wait.classList.toggle("pt-hide", !pend);
    var q = p.code ? ("?code=" + encodeURIComponent(p.code)) : "";
    $("playLinks").innerHTML =
      '<a href="game.html' + q + '">Pin the Tail on the Pig</a>' +
      '<a href="wheel.html' + q + '">Wheel of Financial Torture</a>' +
      '<a href="humiliation.html' + q + '">Wheel of Humiliation</a>';
    renderPins();
    renderFunds();
    paintPayButtons();
  }

  function renderPins() {
    var pins = player.pins || [];
    $("pinsBox").innerHTML = pins.length
      ? "<table><thead><tr><th>Game</th><th>Result</th><th>Owed</th><th>When</th></tr></thead><tbody>" +
        pins.map(function (n) {
          return "<tr><td>" + escapeHtml(gameName(n.game)) + "</td><td>" + escapeHtml(pinLine(n)) +
            "</td><td>" + escapeHtml(money(n.charge)) + "</td><td class=\"muted\">" + escapeHtml(when(n.ts)) + "</td></tr>";
        }).join("") +
        "</tbody></table>"
      : '<p class="empty">No pins or spins yet. Open a game and play.</p>';
  }

  function renderFunds() {
    var rows = fundRows();
    $("loadsBox").innerHTML = rows.length
      ? "<table><thead><tr><th>Status</th><th>Amount</th><th>Source</th><th>When</th></tr></thead><tbody>" +
        rows.map(function (l) {
          var amt = (l.status === "rejected" || l.signed === false ? "" : (l.status === "pending" ? "" : "+")) + money(l.amount);
          if (l.status === "pending") amt = money(l.amount);
          if (l.status === "rejected") amt = money(l.amount);
          return "<tr><td>" + statusLabel(l.status) + "</td><td>" + escapeHtml(amt) +
            "</td><td>" + escapeHtml(l.source || "Gift") + "</td><td class=\"muted\">" + escapeHtml(when(l.ts)) + "</td></tr>";
        }).join("") +
        "</tbody></table>"
      : '<p class="empty">Nothing yet. Tap Add funds to send a gift.</p>';
  }

  function refreshMe() {
    if (demo) { applyPlayer(player); return Promise.resolve(); }
    return api("/api/me").then(function (d) { applyPlayer(d.player); showDesk(); }).catch(function () {});
  }

  function saveDemo() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(player)); } catch (e) {}
  }
  function loadDemo() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (s && s.code) return s;
    } catch (e) {}
    return { code: "PIG-DEMO", balance: 0, tab: 0, pins: [], loads: [], pending: [], test: false };
  }
  function newDemoCode() {
    var alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ", s = "PIG-";
    for (var i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s;
  }

  /* ---------- pay sheet (same as the games) ---------- */
  (C.loadPresets || [10, 20, 50, 100]).forEach(function (n) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = "$" + n;
    b.setAttribute("data-amt", String(n));
    if (n === 20) b.className = "on";
    $("ptPresets").appendChild(b);
  });

  function findLink(name) {
    var list = C.links || [];
    for (var i = 0; i < list.length; i++) if (list[i].label === name && list[i].href && list[i].href.charAt(0) !== "#") return list[i].href;
    return "";
  }
  function throneHref(dollars) {
    var base = C.THRONE_URL || findLink("Throne") || "https://throne.com/goddessoftaurus";
    try {
      var u = new URL(base, location.href);
      if (dollars != null && dollars !== "" && dollars !== "ALL" && Number(dollars) > 0) {
        u.searchParams.set("amount", String(dollars));
      }
      return u.toString();
    } catch (e) { return base; }
  }
  function pickAmt() { return chosenAmt; }
  function selectAmount(dollars) {
    var amt = Math.round(Number(dollars) * 100) / 100;
    if (!(amt > 0)) amt = chosenAmt || 20;
    chosenAmt = amt;
    var matched = false;
    Array.prototype.forEach.call($("ptPresets").children, function (c) {
      var on = Number(c.getAttribute("data-amt")) === amt;
      c.classList.toggle("on", on);
      if (on) matched = true;
    });
    var custom = $("ptCustom");
    if (custom) custom.value = matched ? "" : String(amt);
  }
  function paintPayButtons() {
    var locked = paymentsLocked();
    var stripeOn = !!flags.stripe && !demo;
    var throneBtn = $("ptThronePay");
    if (throneBtn) throneBtn.disabled = locked || flags.throne === false;
    var sent = $("ptSent");
    if (sent) sent.disabled = locked;
    var card = $("ptCard");
    if (card) {
      card.disabled = locked || !stripeOn;
      card.textContent = stripeOn ? "Pay by card" : "Card payments coming soon";
    }
    var note = $("ptTestPayNote");
    if (note) note.classList.toggle("pt-hide", !locked);
    var demoNote = $("ptDemoNote");
    if (demoNote) demoNote.classList.toggle("pt-hide", !demo || locked);
  }
  function setSheetSub(textBeforeCode, extraAfter) {
    var sub = $("ptSheetSub");
    if (!sub) return;
    sub.innerHTML = "";
    sub.appendChild(document.createTextNode(textBeforeCode));
    var code = document.createElement("code");
    code.id = "ptSheetCode";
    code.textContent = player.code || "PIG-XXXX";
    sub.appendChild(code);
    sub.appendChild(document.createTextNode(extraAfter || ". She uses it to find your gift."));
  }
  function paintGiftLinks(showExtras) {
    var box = $("ptGiftLinks");
    if (!box) return;
    box.innerHTML = "";
    if (!showExtras) { box.classList.add("pt-hide"); return; }
    box.classList.remove("pt-hide");
    function add(href, label, cls) {
      if (!href) return;
      var a = document.createElement("a");
      a.href = href; a.target = "_blank"; a.rel = "noopener"; a.className = cls; a.textContent = label;
      box.appendChild(a);
    }
    add(C.YOUPAY_URL || findLink("YouPay"), "YouPay", "alt");
    add(C.CASHAPP_URL || findLink("CashApp"), "Cash App", "alt");
  }
  function openSheet() {
    selectAmount(chosenAmt || 20);
    var title = $("ptSheetTitle");
    if (title) title.textContent = "Add funds";
    var due = $("ptDue");
    if (due) due.classList.add("pt-hide");
    setSheetSub("Add funds to your account. Your play code is ");
    $("ptThroneBlock").classList.toggle("pt-hide", flags.throne === false);
    $("ptStripeBlock").classList.remove("pt-hide");
    paintPayButtons();
    paintGiftLinks(true);
    $("ptLoadSheet").classList.add("show");
  }
  function closeLoad() { $("ptLoadSheet").classList.remove("show"); }

  function markSent() {
    if (paymentsLocked()) return;
    var amt = pickAmt();
    if (!amt || amt < 1) { alert("Pick an amount first."); return; }
    if (demo) {
      player.pending = [{ id: "demo", requested: Math.round(amt * 100), ts: Date.now() }];
      applyPlayer(player); saveDemo();
      $("ptWait").classList.remove("pt-hide");
      setTimeout(function () {
        player.pending = [];
        player.balance += Math.round(amt * 100);
        player.loads.unshift({ amount: Math.round(amt * 100), source: "demo", ts: Date.now(), status: "approved" });
        saveDemo(); applyPlayer(player);
        $("ptWait").classList.add("pt-hide");
        closeLoad();
      }, 1200);
      return;
    }
    api("/api/request-load", { body: { amount: amt } }).then(function (d) {
      applyPlayer(d.player);
      $("ptWait").classList.remove("pt-hide");
    }).catch(function (err) { alert(err.message); });
  }
  function payViaThrone() {
    if (paymentsLocked()) return;
    var amt = pickAmt();
    if (!amt || amt < 1) { alert("Pick an amount first."); return; }
    var url = throneHref(amt);
    if (demo) {
      window.open(url, "_blank", "noopener");
      markSent();
      return;
    }
    api("/api/request-load", { body: { amount: amt } }).then(function (d) {
      applyPlayer(d.player);
      $("ptWait").classList.remove("pt-hide");
      window.open(url, "_blank", "noopener");
    }).catch(function (err) { alert(err.message); });
  }
  function payByCard() {
    if (paymentsLocked()) return;
    var amt = pickAmt();
    if (!amt || amt < 1) { alert("Pick an amount first."); return; }
    if (demo || !flags.stripe) return;
    var returnTo = location.href.split("#")[0].replace(/\?paid=\d/, "");
    api("/api/stripe/checkout", { body: { amount: amt, returnTo: returnTo } }).then(function (d) {
      if (d.url) location.href = d.url;
    }).catch(function (err) { alert(err.message); });
  }

  /* ---------- session ---------- */
  function claimByCode(code) {
    code = String(code || "").trim();
    if (!code) return Promise.reject(new Error("Enter your play code first."));
    if (demo) {
      player = loadDemo();
      player.code = code.toUpperCase();
      saveDemo();
      applyPlayer(player);
      showDesk();
      return Promise.resolve();
    }
    return api("/api/claim", { body: { code: code } }).then(function (d) {
      if (d.token) setToken(d.token);
      applyPlayer(d.player);
      showDesk();
    });
  }

  function startNew() {
    if (demo) {
      player = { code: newDemoCode(), balance: 0, tab: 0, pins: [], loads: [], pending: [], test: false };
      saveDemo();
      applyPlayer(player);
      showDesk();
      return Promise.resolve();
    }
    return api("/api/new", { body: {} }).then(function (d) {
      if (d.token) setToken(d.token);
      applyPlayer(d.player);
      showDesk();
    });
  }

  function signOut() {
    var code = (player && player.code) || "";
    setToken("");
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    var hub = gamesHubBase();
    var note = code ? ("signedout=" + encodeURIComponent(code)) : "signedout=1";
    location.href = hub + (hub.indexOf("?") >= 0 ? "&" : "?") + note;
  }

  function copyText(text, btn) {
    var done = function () { var o = btn.textContent; btn.textContent = "Copied"; setTimeout(function () { btn.textContent = o; }, 1400); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () {});
    else { var t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); done(); } catch (e) {} t.remove(); }
  }

  function queryParam(name) {
    try { return (new URLSearchParams(location.search || "").get(name) || "").trim(); }
    catch (e) { return ""; }
  }
  function clearQueryParams(names) {
    try {
      var u = new URL(location.href);
      var changed = false;
      names.forEach(function (n) { if (u.searchParams.has(n)) { u.searchParams.delete(n); changed = true; } });
      if (!changed) return;
      var q = u.searchParams.toString();
      history.replaceState({}, "", u.pathname + (q ? "?" + q : "") + u.hash);
    } catch (e) {}
  }

  $("acctOpen").onclick = function () {
    $("acctErr").textContent = "";
    claimByCode($("acctCode").value).catch(function (err) { $("acctErr").textContent = err.message; });
  };
  $("acctCode").onkeydown = function (e) { if (e.key === "Enter") $("acctOpen").click(); };
  $("acctStart").onclick = function () {
    $("acctErr").textContent = "";
    startNew().catch(function (err) { $("acctErr").textContent = err.message; });
  };
  $("acctAdd").onclick = function () { openSheet(); };
  $("acctCopy").onclick = function () { if (player.code) copyText(player.code, this); };
  $("acctRefresh").onclick = function () { refreshMe(); };
  $("acctSignOut").onclick = signOut;
  $("ptSent").onclick = markSent;
  $("ptThronePay").onclick = payViaThrone;
  $("ptCard").onclick = payByCard;
  $("ptUseCustom").onclick = function () {
    var n = Number($("ptCustom").value);
    if (n > 0) { chosenAmt = n; Array.prototype.forEach.call($("ptPresets").children, function (c) { c.classList.remove("on"); }); }
  };
  $("ptPresets").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    chosenAmt = Number(b.getAttribute("data-amt"));
    Array.prototype.forEach.call($("ptPresets").children, function (c) { c.classList.toggle("on", c === b); });
  });
  document.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = closeLoad; });
  $("ptLoadSheet").addEventListener("click", function (e) { if (e.target === $("ptLoadSheet")) closeLoad(); });

  setInterval(function () {
    if (demo || !player.pending || !player.pending.length) return;
    if (document.hidden) return;
    refreshMe();
  }, 4000);

  api("/api/health").then(function (h) {
    demo = false;
    flags.stripe = !!(h.stripe && C.ENABLE_STRIPE !== false);
    flags.throne = h.throne !== false && C.ENABLE_THRONE !== false;
  }).catch(function () {
    demo = true;
    flags.stripe = false;
    flags.throne = C.ENABLE_THRONE !== false;
  }).then(function () {
    paintPayButtons();
    var code = queryParam("code");
    if (code) {
      return claimByCode(code).then(function () { clearQueryParams(["code"]); }).catch(function (err) {
        showGate();
        $("acctErr").textContent = err.message || "Could not open that play code.";
      });
    }
    if (token() && !demo) {
      return api("/api/me").then(function (d) {
        applyPlayer(d.player);
        showDesk();
        if (/[?&]paid=1/.test(location.search)) {
          setTimeout(refreshMe, 800);
          setTimeout(refreshMe, 2500);
        }
      }).catch(function () { showGate(); });
    }
    showGate();
  });
})();
