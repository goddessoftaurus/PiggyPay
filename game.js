(function () {
  "use strict";

  var C = window.CONFIG || {};
  var SITE = window.SITE_NAME || C.siteName || "PayPiggy";
  var SEGS = (C.segments && C.segments.length) ? C.segments.slice() : [];
  var IS_WIDGET = document.body.classList.contains("widget");
  var BASE = IS_WIDGET ? "../" : "";
  var API = (C.apiBase || "").replace(/\/$/, "");
  var TOKEN_KEY = "paypiggy-token";
  var STORE_KEY = "paypiggy-demo-v2";

  var root = document.getElementById("paypiggy-game");
  if (!root) return;

  var BACK_LINK = C.backLinkUrl || "https://linktr.ee/crystal98xo";
  var GAMES_HUB = C.gamesHubUrl || "https://piggyplay.onrender.com/games.html";
  function gamesHubHref() {
    var href = GAMES_HUB;
    try {
      var here = String(location.hostname || "").toLowerCase();
      var hubHost = "";
      try { hubHost = new URL(GAMES_HUB, location.href).hostname.toLowerCase(); } catch (e2) {}
      if (!here || here === "localhost" || here === "127.0.0.1" || (hubHost && here === hubHost)) {
        href = "/games.html";
      }
    } catch (e) {}
    try {
      var code = new URLSearchParams(location.search || "").get("code") || "";
      if (code) href += (href.indexOf("?") >= 0 ? "&" : "?") + "code=" + encodeURIComponent(code);
    } catch (e) {}
    return href;
  }
  Array.prototype.forEach.call(document.querySelectorAll("a.back"), function (a) {
    a.href = a.classList.contains("back-games") ? gamesHubHref() : BACK_LINK;
    a.removeAttribute("target");
  });

  document.title = SITE + " — " + (C.gameTitle || "Pin the Tail on the Pig");

  var demo = true;
  var flags = { stripe: false, throne: C.ENABLE_THRONE !== false };
  var sound = C.soundDefault === true;
  var spinning = false;
  var selectedTail = 0;
  var lastChargeDollars = 0;
  var player = { code: "", balance: 0, tab: 0, pins: [], loads: [], pending: [] };

  /* Landing points on the bullseye (percent of the poster).
     Index matches CONFIG.segments: low values sit on the outer rings / just
     off the target, high values sit toward the center, ALL is the bullseye. */
  var SPOTS = [
    { x: 79.9, y: 65.8 }, /* $5  miss, just off the outer ring */
    { x: 59.1, y: 56.3 }, /* $10 outer ring */
    { x: 65.5, y: 66.3 }, /* $20 outer ring */
    { x: 75.3, y: 55.1 }, /* $25 mid ring */
    { x: 76.2, y: 61.5 }, /* $50 mid ring */
    { x: 63.8, y: 60.8 }, /* $69 inner ring */
    { x: 67.1, y: 55.1 }, /* $100 inner ring */
    { x: 70.2, y: 61.4 }, /* $200 inner white */
    { x: 69.0, y: 59.0 }  /* ALL center */
  ];

  var TAIL_SVG = '<svg viewBox="0 0 100 80" aria-hidden="true"><path d="M10 50 C26 48 38 34 56 30 C76 25 92 38 86 56 C81 68 66 70 60 58 C56 48 68 46 78 52" fill="none" stroke="#1a0a08" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 50 C26 48 38 34 56 30 C76 25 92 38 86 56 C81 68 66 70 60 58 C56 48 68 46 78 52" fill="none" stroke="#ff9eb8" stroke-width="11.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 47 C30 44 42 34 56 32" fill="none" stroke="#ffc5d4" stroke-width="3.5" stroke-linecap="round"/></svg>';
  var FLY_SVG = '<svg viewBox="-20 -18 140 116" aria-hidden="true"><path d="M10 50 C26 48 38 34 56 30 C76 25 92 38 86 56 C81 68 66 70 60 58 C56 48 68 46 78 52" fill="none" stroke="#1a0a08" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 50 C26 48 38 34 56 30 C76 25 92 38 86 56 C81 68 66 70 60 58 C56 48 68 46 78 52" fill="none" stroke="#ff9eb8" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 47 C30 44 42 34 56 32" fill="none" stroke="#ffc5d4" stroke-width="3" stroke-linecap="round"/></svg>';

  /* ---------- markup ---------- */
  root.innerHTML =
    '<div class="pt-test-ribbon pt-hide" id="ptTestRibbon" role="status">TEST MODE — play money</div>' +
    '<canvas id="fx"></canvas>' +
    '<header class="pt-head"><div class="brand" id="ptBrand"></div><h1 id="ptTitle"></h1><p id="ptTag"></p></header>' +
    '<section class="pt-panel pt-gate" id="ptGate">' +
      '<h2>18+ only</h2>' +
      '<p>This is a grown-up teasing game. Real gifts are confirmed by Goddess Mari. Nothing on this page charges a card unless you choose Pay by card.</p>' +
      '<button class="pt-go" type="button" id="ptStart">I\'m 18+, let me play</button>' +
      '<div class="pt-claim"><input id="ptResume" placeholder="Played before? Enter PIG-XXXX" maxlength="12"><button class="pt-add" type="button" id="ptResumeBtn">Open</button></div>' +
    '</section>' +
    '<section class="pt-panel pt-hide" id="ptPlay">' +
      '<div class="pt-hud">' +
        '<div class="pt-stat"><span>In your pocket</span><b id="ptPocket">$0.00</b></div>' +
        '<div class="pt-stat alt"><span>Your tab</span><b id="ptTab">$0.00</b></div>' +
        '<button class="pt-snd" type="button" id="ptSnd" aria-label="Sound off"></button>' +
      '</div>' +
      '<div class="pt-codebar">Play code <code id="ptCode">—</code> <button type="button" id="ptCopyCode">Copy</button></div>' +
      '<div class="pt-poster" id="ptPoster">' +
        '<img class="farm" alt="" id="ptFarm">' +
        '<div class="pt-sign"><b id="ptSignName"></b><small id="ptSignSub"></small></div>' +
        '<div class="pt-pig"><img alt="A cartoon pig in a pen with a bullseye on its rear" id="ptPigImg"><div class="pt-sash" aria-hidden="true"></div></div>' +
        '<div id="ptSpots"></div>' +
        '<div class="pt-tray" id="ptTray" aria-label="Pick a curly tail"></div>' +
        '<div class="pt-fly" id="ptFly">' + FLY_SVG + '</div>' +
        '<div class="pt-veil" id="ptVeil"><div class="msg">blindfold on…</div><div class="pt-reel" id="ptReel">$??</div></div>' +
      '</div>' +
      '<div class="pt-result" id="ptResult">' +
        '<div class="pt-banner"><small id="ptZone">The tail landed on</small><b id="ptOwe">You owe $0 🐷</b>' +
          '<div class="row"><button class="pt-pay" type="button" id="ptPay">Pay up</button>' +
          '<button class="pt-again" type="button" id="ptAgain">Play again</button></div>' +
        '</div>' +
      '</div>' +
      '<button class="pt-go" type="button" id="ptPin">Pin it</button>' +
      '<button class="pt-funds" type="button" id="ptOpenLoad">Add funds</button>' +
      '<div class="pt-pending pt-hide" id="ptPendingNote">A gift is waiting for her to confirm.</div>' +
    '</section>' +
    '<section class="pt-panel pt-hist pt-hide" id="ptHist">' +
      '<h2>Pin history</h2>' +
      '<ol id="ptList"><li class="empty">No pins yet — pick a tail and pin it.</li></ol>' +
    '</section>' +
    '<section class="pt-panel pt-hist pt-hide" id="ptLoads">' +
      '<h2>What you sent</h2>' +
      '<ol id="ptLoadList"><li class="empty">No funds added yet.</li></ol>' +
    '</section>' +
    '<div class="pt-over" id="ptLoadSheet">' +
      '<div class="sheet">' +
        '<button class="pt-x" type="button" data-close aria-label="Close">×</button>' +
        '<h3 id="ptSheetTitle">Add funds</h3>' +
        '<p class="pt-due pt-hide" id="ptDue">You owe <b id="ptDueAmt">$0</b></p>' +
        '<p class="sub" id="ptSheetSub">Add funds to your account. Your play code is <code id="ptSheetCode">PIG-XXXX</code>. She uses it to find your gift.</p>' +
        '<div class="pt-presets" id="ptPresets"></div>' +
        '<div class="pt-custom" id="ptCustomRow"><input id="ptCustom" type="number" min="1" step="1" placeholder="custom $"><button class="pt-add" type="button" id="ptUseCustom">Use</button></div>' +
        '<div id="ptThroneBlock">' +
          '<ol class="pt-steps">' +
            '<li>Copy your play code.</li>' +
            '<li>Open her Throne wishlist and paste the code in the gift note.</li>' +
            '<li>Come back and tap “I already sent it.” Your account stays pending until she confirms.</li>' +
          '</ol>' +
          '<div class="pt-payrow">' +
            '<button class="pt-thronebtn" type="button" id="ptThronePay">Pay via Throne</button>' +
          '</div>' +
          '<div class="pt-payrow" id="ptGiftLinks"></div>' +
          '<button class="pt-sent" type="button" id="ptSent">I already sent it</button>' +
          '<p class="pt-wait pt-hide" id="ptWait">Waiting for her to confirm that gift…</p>' +
        '</div>' +
        '<div id="ptStripeBlock" style="margin-top:14px">' +
          '<button class="pt-cardbtn" type="button" id="ptCard">Pay by card</button>' +
        '</div>' +
        '<p class="pt-testpay pt-hide" id="ptTestPayNote">Test mode — no real payment</p>' +
        '<p class="pt-demo pt-hide" id="ptDemoNote">Demo mode — no server is connected, so confirmation is simulated on this device only.</p>' +
      '</div>' +
    '</div>';

  document.getElementById("ptBrand").textContent = SITE;
  document.getElementById("ptTitle").textContent = C.gameTitle || "Pin the Tail on the Pig";
  document.getElementById("ptTag").textContent = C.tagline || "Blindfold on. Wherever the tail lands is what you send.";
  document.getElementById("ptSignName").textContent = SITE;
  document.getElementById("ptSignSub").textContent = C.gameTitle || "Pin the Tail on the Pig";
  document.getElementById("ptFarm").src = BASE + "assets/pigpen.jpg";
  document.getElementById("ptPigImg").src = BASE + "assets/pig.png";

  /* Pin targets are the bullseye rings on the pig art — no ? chips. */
  var spotsEl = document.getElementById("ptSpots");

  var tray = document.getElementById("ptTray");
  for (var t = 0; t < 5; t++) {
    var tb = document.createElement("button");
    tb.type = "button";
    tb.innerHTML = TAIL_SVG;
    tb.setAttribute("aria-label", "Curly tail " + (t + 1));
    if (t === 0) tb.className = "sel";
    tb.addEventListener("click", function (idx) {
      return function () {
        selectedTail = idx;
        Array.prototype.forEach.call(tray.children, function (c, j) { c.classList.toggle("sel", j === idx); });
      };
    }(t));
    tray.appendChild(tb);
  }

  (C.loadPresets || [10, 20, 50, 100]).forEach(function (n) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = "$" + n;
    b.setAttribute("data-amt", String(n));
    if (n === 20) b.className = "on";
    document.getElementById("ptPresets").appendChild(b);
  });
  var chosenAmt = 20;

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function money(cents) { return "$" + (Math.max(0, Number(cents) || 0) / 100).toFixed(2); }
  function pickAmt() { return chosenAmt; }

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

  function token() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

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
      });
    });
  }

  function reportHeight() {
    if (!IS_WIDGET || !window.parent || parent === window) return;
    var h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, root.scrollHeight + 24);
    parent.postMessage({ type: "paypiggy-resize", height: h }, "*");
  }

  /* ---------- sound ---------- */
  var ac = null;
  function audio() {
    if (!sound) return null;
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function tone(f, dur, type, gain, when) {
    var a = audio(); if (!a) return;
    var o = a.createOscillator(), g = a.createGain(), t = a.currentTime + (when || 0);
    o.type = type || "square"; o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain || 0.04, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  var SND_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>';
  var SND_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 9.5 21 14M21 9.5 16.5 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  function paintSnd() {
    $("ptSnd").innerHTML = sound ? SND_ON : SND_OFF;
    $("ptSnd").setAttribute("aria-label", sound ? "Sound on" : "Sound off");
  }

  /* ---------- render ---------- */
  function applyPlayer(p) {
    if (!p) return;
    player = p;
    $("ptPocket").textContent = money(p.balance);
    $("ptTab").textContent = money(p.tab);
    $("ptCode").textContent = p.code || "—";
    $("ptSheetCode").textContent = p.code || "PIG-XXXX";
    $("ptPin").disabled = spinning;
    var pend = (p.pending && p.pending.length) || 0;
    $("ptPendingNote").classList.toggle("pt-hide", !pend);
    $("ptWait").classList.toggle("pt-hide", !pend);
    var testOn = !!p.test;
    var ribbon = $("ptTestRibbon");
    if (ribbon) ribbon.classList.toggle("pt-hide", !testOn);
    document.body.classList.toggle("paypiggy-test", testOn);
    renderHist();
    renderLoads();
    reportHeight();
  }

  function renderHist() {
    var ol = $("ptList"); ol.innerHTML = "";
    var pins = player.pins || [];
    if (!pins.length) {
      var e = document.createElement("li"); e.className = "empty"; e.textContent = "No pins yet — pick a tail and pin it."; ol.appendChild(e); return;
    }
    pins.slice(0, 10).forEach(function (p, i) {
      var li = document.createElement("li");
      if (p.value === "ALL") li.className = "all";
      li.innerHTML = '<span class="n">#' + (pins.length - i) + "</span><span></span><b></b>";
      li.children[1].textContent = p.value === "ALL" ? "The rest of your account" : ((p.game === "wheel" ? "Spun " : "Pinned ") + p.label);
      li.children[2].textContent = "−" + money(p.charge);
      ol.appendChild(li);
    });
  }

  function renderLoads() {
    var ol = $("ptLoadList"); ol.innerHTML = "";
    var loads = player.loads || [];
    if (!loads.length && !(player.pending && player.pending.length)) {
      var e = document.createElement("li"); e.className = "empty"; e.textContent = "No funds added yet."; ol.appendChild(e); return;
    }
    (player.pending || []).forEach(function (l) {
      var li = document.createElement("li");
      li.innerHTML = "<span></span><span></span><b></b>";
      li.children[0].textContent = "pending";
      li.children[1].textContent = "Gift on the way";
      li.children[2].textContent = money(l.requested);
      ol.appendChild(li);
    });
    loads.slice(0, 8).forEach(function (l) {
      var li = document.createElement("li");
      if (l.status === "rejected") li.style.opacity = ".6";
      li.innerHTML = "<span></span><span></span><b></b>";
      li.children[0].textContent = l.source || "gift";
      li.children[1].textContent = l.status === "rejected" ? "Not confirmed" : "Added to your account";
      li.children[2].textContent = (l.status === "rejected" ? "" : "+") + money(l.amount || l.requested || 0);
      ol.appendChild(li);
    });
  }

  function setPayHref() {
    var a = $("ptPay");
    if (!a) return;
    a.setAttribute("data-amount", lastChargeDollars ? String(lastChargeDollars) : "");
  }

  /* ---------- demo persistence ---------- */
  function saveDemo() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(player)); } catch (e) {}
  }
  function loadDemo() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (s && s.code) return s;
    } catch (e) {}
    return { code: "PIG-DEMO", balance: 0, tab: 0, pins: [], loads: [], pending: [] };
  }
  function newDemoCode() {
    var alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ", s = "PIG-";
    for (var i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s;
  }

  function pinTiers() {
    if (window.PayPiggyPin && PayPiggyPin.buildPinTiers) return PayPiggyPin.buildPinTiers(C);
    return SEGS;
  }

  function pickWeighted(list) {
    var segs = list || SEGS;
    var total = 0, i, r;
    for (i = 0; i < segs.length; i++) total += Number(segs[i].weight) || 1;
    r = Math.random() * total;
    for (i = 0; i < segs.length; i++) {
      r -= Number(segs[i].weight) || 1;
      if (r <= 0) return { index: i, seg: segs[i] };
    }
    return { index: segs.length - 1, seg: segs[segs.length - 1] };
  }

  function localPin() {
    if (player.balance <= 0) return { broke: true };
    var tiers = pinTiers();
    var pick = pickWeighted(tiers);
    var isAll = pick.seg.value === "ALL" || pick.seg.label === "ALL";
    var charge = isAll ? player.balance : Math.min(Math.round(Number(pick.seg.value) * 100), player.balance);
    var result = {
      label: pick.seg.label,
      value: isAll ? "ALL" : pick.seg.value,
      charge: charge,
      balance: player.balance - charge,
      index: pick.index,
      zone: pick.seg.zone,
      zoneLabel: pick.seg.zoneLabel
    };
    player.balance = result.balance;
    player.tab += charge;
    player.pins.unshift({ label: result.label, value: result.value, charge: charge, game: "poster", zone: result.zone, ts: Date.now() });
    saveDemo();
    return { result: result, player: player };
  }

  /* ---------- session ---------- */
  function startSession(fresh) {
    if (demo) {
      player = fresh ? { code: newDemoCode(), balance: 0, tab: 0, pins: [], loads: [], pending: [] } : loadDemo();
      if (!player.code) player.code = newDemoCode();
      saveDemo();
      applyPlayer(player);
      return Promise.resolve();
    }
    var existing = token();
    var p = existing && !fresh ? api("/api/me") : api("/api/new", { body: {} });
    return p.then(function (d) {
      if (d.token) setToken(d.token);
      applyPlayer(d.player);
    }).catch(function () {
      return api("/api/new", { body: {} }).then(function (d) {
        if (d.token) setToken(d.token);
        applyPlayer(d.player);
      });
    });
  }

  function refreshMe() {
    if (demo) { applyPlayer(player); return Promise.resolve(); }
    return api("/api/me").then(function (d) { applyPlayer(d.player); }).catch(function () {});
  }

  /* ---------- pin animation ---------- */
  function reduceMotion() {
    return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function runReveal(result) {
    spinning = true;
    $("ptPin").disabled = true;
    $("ptResult").classList.remove("show");
    $("ptPoster").classList.add("blind");
    $("ptFly").className = "pt-fly";
    Array.prototype.forEach.call(spotsEl.children, function (c) { c.classList.remove("open", "hit"); });
    audio();

    var labels = SEGS.map(function (s) { return s.label; });
    var reel = $("ptReel");
    var start = performance.now();
    var dur = reduceMotion() ? 600 : 2200;
    var iv = setInterval(function () {
      reel.textContent = labels[Math.floor(Math.random() * labels.length)];
      tone(700 + Math.random() * 500, 0.04, "square", 0.03);
    }, 80);

    var trayBtn = tray.children[selectedTail] || tray.children[0];
    var poster = $("ptPoster").getBoundingClientRect();
    var from = trayBtn.getBoundingClientRect();
    var fly = $("ptFly");
    fly.style.left = ((from.left + from.width / 2 - poster.left) / poster.width * 100) + "%";
    fly.style.top = ((from.top + from.height / 2 - poster.top) / poster.height * 100) + "%";
    fly.className = "pt-fly go wobble";

    var idx = 0;
    for (var i = 0; i < SEGS.length; i++) {
      if (SEGS[i].label === result.label && String(SEGS[i].value) === String(result.value)) { idx = i; break; }
    }
    var spot = (window.PayPiggyPin && result.zone)
      ? PayPiggyPin.pointInZone(result.zone)
      : (SPOTS[idx] || SPOTS[0]);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        fly.style.left = spot.x + "%";
        fly.style.top = spot.y + "%";
      });
    });

    setTimeout(function () {
      clearInterval(iv);
      reel.textContent = result.label;
      fly.className = "pt-fly go stuck";
      $("ptPoster").classList.remove("blind");
      var chip = spotsEl.children[idx];
      if (chip) chip.classList.add("open", "hit");
      lastChargeDollars = result.charge / 100;
      var banner = (result.value === "ALL")
        ? ((C.allBanner || "You owe ALL 🐷") + (result.charge ? " — " + money(result.charge) : ""))
        : ("You owe " + money(result.charge).replace(/\.00$/, "") + " 🐷");
      $("ptOwe").textContent = banner;
      var zoneEl = $("ptZone");
      if (zoneEl) {
        zoneEl.textContent = result.zoneLabel || "The tail landed on";
        zoneEl.className = result.zone ? ("zone-" + result.zone) : "";
      }
      setPayHref();
      $("ptResult").classList.add("show");
      $("ptPin").classList.add("pt-hide");
      if (result.value === "ALL" || result.charge >= 10000) {
        landSound(true); confetti();
      } else landSound(false);
      applyPlayer(player);
      spinning = false;
      reportHeight();
    }, dur);
  }

  function landSound(big) {
    if (big) [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.28, "triangle", 0.06, i * 0.08); });
    else { tone(660, 0.1, "sine", 0.05); tone(880, 0.18, "sine", 0.045, 0.08); }
  }

  function pinIt() {
    if (spinning) return;
    if (player.balance <= 0) { openLoad("Your account is empty. Add funds to pin a tail."); return; }
    if (demo) {
      var local = localPin();
      if (local.broke) { openLoad("Your account is empty. Add funds to pin a tail."); return; }
      applyPlayer(local.player);
      runReveal(local.result);
      return;
    }
    api("/api/pin", { body: { game: "poster" } }).then(function (d) {
      player = d.player;
      runReveal(d.result);
    }).catch(function (err) {
      if (err.body && err.body.broke) openLoad("Your account is empty. Add funds to pin a tail.");
      else alert(err.message || "Could not pin just now.");
    });
  }

  function playAgain() {
    $("ptResult").classList.remove("show");
    $("ptFly").className = "pt-fly";
    $("ptPoster").classList.remove("blind");
    Array.prototype.forEach.call(spotsEl.children, function (c) { c.classList.remove("open", "hit"); });
    $("ptPin").classList.remove("pt-hide");
    $("ptPin").disabled = player.balance <= 0;
    reportHeight();
  }

  /* ---------- add funds / pay up sheet ---------- */
  var sheetMode = "load";

  function paymentsLocked() { return !!(player && player.test); }

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

  function openSheet(opts) {
    opts = opts || {};
    sheetMode = opts.mode || "load";
    var title = $("ptSheetTitle");
    var due = $("ptDue");
    var dueAmt = $("ptDueAmt");
    if (sheetMode === "payup") {
      var owe = opts.amount != null ? Number(opts.amount) : lastChargeDollars;
      if (!(owe > 0)) owe = lastChargeDollars || chosenAmt || 20;
      selectAmount(owe);
      if (title) title.textContent = "Pay up";
      var oweLabel = money(Math.round(Number(owe) * 100)).replace(/\.00$/, "");
      if (due) due.classList.remove("pt-hide");
      if (dueAmt) dueAmt.textContent = oweLabel;
      setSheetSub("Pay " + oweLabel + " to her. Your play code is ");
    } else {
      if (title) title.textContent = "Add funds";
      if (due) due.classList.add("pt-hide");
      if (opts.msg) setSheetSub(opts.msg + " Your play code is ");
      else setSheetSub("Add funds to your account. Your play code is ");
    }
    $("ptSheetCode").textContent = player.code || "PIG-XXXX";
    $("ptThroneBlock").classList.toggle("pt-hide", flags.throne === false);
    $("ptStripeBlock").classList.remove("pt-hide");
    paintPayButtons();
    paintGiftLinks(sheetMode === "load");
    $("ptLoadSheet").classList.add("show");
    reportHeight();
  }
  function openLoad(msg) { openSheet({ mode: "load", msg: msg || "" }); }
  function openPayUp(e) {
    if (e) e.preventDefault();
    var amt = lastChargeDollars;
    var a = $("ptPay");
    if (a && a.getAttribute("data-amount")) {
      var n = Number(a.getAttribute("data-amount"));
      if (n > 0) amt = n;
    }
    openSheet({ mode: "payup", amount: amt });
  }
  function closeLoad() { $("ptLoadSheet").classList.remove("show"); }

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
  function findLink(name) {
    var list = C.links || [];
    for (var i = 0; i < list.length; i++) if (list[i].label === name && list[i].href && list[i].href.charAt(0) !== "#") return list[i].href;
    return "";
  }

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
        confetti();
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

  /* ---------- confetti ---------- */
  var fx = $("fx"), fctx = fx.getContext("2d"), parts = [], fxOn = false;
  function sizeFx() {
    var d = window.devicePixelRatio || 1;
    fx.width = innerWidth * d; fx.height = innerHeight * d;
    fctx.setTransform(d, 0, 0, d, 0, 0);
  }
  function confetti() {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var cols = ["#ff4d8d", "#ffc83d", "#e0115f", "#ff8fb8", "#b3001b", "#fff5f7"];
    for (var i = 0; i < 120; i++) parts.push({
      x: innerWidth / 2 + (Math.random() - 0.5) * 160, y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 4,
      r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      w: 6 + Math.random() * 8, h: 4 + Math.random() * 5,
      c: cols[Math.floor(Math.random() * cols.length)], life: 0
    });
    if (!fxOn) { fxOn = true; requestAnimationFrame(fxLoop); }
  }
  function fxLoop() {
    fctx.clearRect(0, 0, innerWidth, innerHeight);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life++;
      if (p.y > innerHeight + 20 || p.life > 240) { parts.splice(i, 1); continue; }
      fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.r);
      fctx.fillStyle = p.c; fctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); fctx.restore();
    }
    if (parts.length) requestAnimationFrame(fxLoop);
    else { fxOn = false; fctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  /* ---------- wire up ---------- */
  paintSnd();
  $("ptSnd").onclick = function () { sound = !sound; paintSnd(); audio(); };
  $("ptStart").onclick = function () {
    startSession(false).then(showGame);
  };
  $("ptResumeBtn").onclick = function () {
    var code = $("ptResume").value.trim();
    if (!code) return;
    if (demo) { player = loadDemo(); player.code = code.toUpperCase(); saveDemo(); showGame(); applyPlayer(player); return; }
    api("/api/claim", { body: { code: code } }).then(function (d) {
      if (d.token) setToken(d.token);
      applyPlayer(d.player);
      showGame();
    }).catch(function (err) { alert(err.message); });
  };
  $("ptPin").onclick = pinIt;
  $("ptAgain").onclick = playAgain;
  $("ptPay").onclick = openPayUp;
  $("ptOpenLoad").onclick = function () { openLoad(""); };
  $("ptSent").onclick = markSent;
  $("ptThronePay").onclick = payViaThrone;
  $("ptCard").onclick = payByCard;
  $("ptCopyCode").onclick = function () { copyText(player.code, this); };
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

  function copyText(text, btn) {
    var done = function () { var o = btn.textContent; btn.textContent = "Copied"; setTimeout(function () { btn.textContent = o; }, 1400); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () {});
    else { var t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); done(); } catch (e) {} t.remove(); }
  }

  function showGame() {
    $("ptGate").classList.add("pt-hide");
    $("ptPlay").classList.remove("pt-hide");
    $("ptHist").classList.remove("pt-hide");
    $("ptLoads").classList.remove("pt-hide");
    reportHeight();
  }

  setInterval(function () {
    if (demo || !player.pending || !player.pending.length) return;
    if (document.hidden) return;
    refreshMe();
  }, 4000);

  window.addEventListener("resize", function () { sizeFx(); reportHeight(); });
  sizeFx();
  if (IS_WIDGET && typeof ResizeObserver !== "undefined") new ResizeObserver(reportHeight).observe(document.body);

  function queryPlayCode() {
    try {
      var params = new URLSearchParams(location.search || "");
      return (params.get("code") || "").trim();
    } catch (e) { return ""; }
  }

  function clearPlayCodeQuery() {
    try {
      if (!queryPlayCode()) return;
      var u = new URL(location.href);
      u.searchParams.delete("code");
      var q = u.searchParams.toString();
      history.replaceState({}, "", u.pathname + (q ? "?" + q : "") + u.hash);
    } catch (e) {}
  }

  function claimByCode(code) {
    if (demo) {
      player = loadDemo();
      player.code = code.toUpperCase();
      saveDemo();
      applyPlayer(player);
      showGame();
      return Promise.resolve();
    }
    return api("/api/claim", { body: { code: code } }).then(function (d) {
      if (d.token) setToken(d.token);
      applyPlayer(d.player);
      showGame();
    });
  }

  api("/api/health").then(function (h) {
    demo = false;
    flags.stripe = !!(h.stripe && C.ENABLE_STRIPE !== false);
    flags.throne = h.throne !== false && C.ENABLE_THRONE !== false;
  }).catch(function () {
    demo = true;
    flags.stripe = false;
    flags.throne = C.ENABLE_THRONE !== false;
  }).then(function () {
    var code = queryPlayCode();
    if (code) {
      return claimByCode(code).then(function () { clearPlayCodeQuery(); }).catch(function (err) { alert(err.message || "Could not open that play code."); });
    }
    if (/[?&]paid=1/.test(location.search)) {
      startSession(false).then(function () {
        showGame();
        setTimeout(refreshMe, 800);
        setTimeout(refreshMe, 2500);
      });
    }
  });
})();
