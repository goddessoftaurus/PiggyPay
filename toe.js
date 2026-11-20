(function () {
  "use strict";

  var C = window.CONFIG || {};
  var SITE = window.SITE_NAME || C.siteName || "PayPiggy";
  var IS_WIDGET = document.body.classList.contains("widget");
  var BASE = IS_WIDGET ? "../" : "";
  var API = (C.apiBase || "").replace(/\/$/, "");
  var TOKEN_KEY = "paypiggy-token";
  var STORE_KEY = "paypiggy-demo-v2";

  var GAME = "toe";
  var IS_HUM = false;

  /* Pick-a-Toe Roulette: five toes on her foot photo, left to right on the
     photo = pinky (1) to big toe (5). Outcomes and odds live in config.js. */
  var DEFAULT_TOES = [
    { n: 1, toe: "Pinky Toe",  label: "Pedicure Fund",          value: 15, weight: 26, text: "Pay for her next pedicure." },
    { n: 2, toe: "Fourth Toe", label: "Kiss the Sole",          value: 10, weight: 26, text: "Kiss the screen right on her sole, then send it." },
    { n: 3, toe: "Middle Toe", label: "Worship Tax",            value: 25, weight: 22, text: "Every toe deserves tribute." },
    { n: 4, toe: "Index Toe",  label: "Double Tribute",         value: 50, weight: 16, text: "She wants it twice, piggy." },
    { n: 5, toe: "Big Toe",    label: "Goddess's Favorite Toe", value: 5,  weight: 10, text: "Lucky piggy: you unlock a bonus foot pic." }
  ];
  var TR = C.toeRoulette || {};
  var SEGS = (TR.toes && TR.toes.length ? TR.toes : DEFAULT_TOES).map(function (t, i) {
    return { n: i + 1, toe: t.toe || ("Toe " + (i + 1)), label: t.label, text: t.text || "", value: Number(t.value) || 5,
      weight: Number(t.weight) || 1, emoji: t.emoji || "", x: Number(t.x), y: Number(t.y) };
  });
  var DEFAULT_SPOTS = [[17.4, 45.5], [24.5, 39.8], [29.5, 35.2], [38.2, 34.1], [49.2, 36.6]];
  var PRICE_CENTS = Math.round(Math.min.apply(null, SEGS.map(function (s) { return s.value; })) * 100);
  var pickedToe = 0;

  var root = document.getElementById("paypiggy-game");
  if (!root) return;

  var BACK_LINK = C.backLinkUrl || "https://linktr.ee/crystal98xo";
  var GAMES_HUB = C.gamesHubUrl || "https://goddessarcade.onrender.com/games.html";
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
  function accountHref() {
    var href = "/account.html";
    try {
      var code = new URLSearchParams(location.search || "").get("code") || "";
      if (code) href += "?code=" + encodeURIComponent(code);
    } catch (e) {}
    return href;
  }
  Array.prototype.forEach.call(document.querySelectorAll("a.back"), function (a) {
    if (a.classList.contains("back-games")) a.href = gamesHubHref();
    else if (a.classList.contains("back-account")) a.href = accountHref();
    else a.href = BACK_LINK;
    a.removeAttribute("target");
  });
  root.classList.add("tr");
  var TITLE = TR.title || "Pick-a-Toe Roulette";
  document.title = SITE + " \u2014 " + TITLE;

  var demo = true;
  var flags = { stripe: false, throne: C.ENABLE_THRONE !== false };
  var sound = C.soundDefault === true;
  var spinning = false;
  var lastChargeDollars = 0;
  var player = { code: "", balance: 0, tab: 0, pins: [], loads: [], pending: [] };

  var resultCaption = "Her toe picked";
  var resultLead = "You owe $0 \ud83d\udc63";
  var payBtn = '<button class="pt-pay" type="button" id="ptPay">Pay up</button>';

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
      '<div class="pt-codebar">Play code <code id="ptCode">\u2014</code> <button type="button" id="ptCopyCode">Copy</button></div>' +
      '<div class="tr-stage" id="whStage">' +
        '<div class="tr-felt" aria-hidden="true"></div>' +
        '<div class="tr-frame">' +
          '<img class="tr-photo" id="trPhoto" alt="Goddess Mari holding her bare foot up to the camera">' +
          '<div class="tr-shade" aria-hidden="true"></div>' +
          '<div class="tr-spots" id="trSpots"></div>' +
          '<div class="tr-reel" id="whReel" aria-live="polite"></div>' +
        '</div>' +
        '<div class="tr-bulbs" aria-hidden="true">' + new Array(19).join("<i></i>") + '</div>' +
        '<div class="wh-result" id="ptResult">' +
          '<div class="pt-banner"><small id="ptCaption">' + resultCaption + '</small><b id="ptOwe">' + resultLead + '</b>' +
            '<p class="tr-out" id="trOut"></p>' +
            '<p class="tr-call" id="trCall"></p>' +
            '<div class="row">' + payBtn +
            '<button class="pt-again" type="button" id="ptAgain">Play again</button></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="tr-pick" id="trPick" role="group" aria-label="Call your lucky toe (optional)">' +
        '<span>Call your lucky toe <small>(optional)</small></span><div class="tr-pickrow" id="trPickRow"></div>' +
      '</div>' +
      '<button class="pt-go" type="button" id="ptPin">Spin the toes</button>' +
      '<button class="pt-funds" type="button" id="ptOpenLoad">Add funds</button>' +
      '<div class="pt-pending pt-hide" id="ptPendingNote">A gift is waiting for her to confirm.</div>' +
    '</section>' +
    '<section class="pt-panel pt-hist pt-hide" id="ptHist">' +
      '<h2>Spin history</h2>' +
      '<ol id="ptList"><li class="empty">No spins yet \u2014 add funds and spin the toes.</li></ol>' +
    '</section>' +
    '<section class="pt-panel pt-hist pt-hide" id="ptLoads">' +
      '<h2>What you sent</h2>' +
      '<ol id="ptLoadList"><li class="empty">No funds added yet.</li></ol>' +
    '</section>' +
    '<div class="pt-over" id="ptLoadSheet">' +
      '<div class="sheet">' +
        '<button class="pt-x" type="button" data-close aria-label="Close">\u00d7</button>' +
        '<h3 id="ptSheetTitle">Add funds</h3>' +
        '<p class="pt-due pt-hide" id="ptDue">You owe <b id="ptDueAmt">$0</b></p>' +
        '<p class="sub" id="ptSheetSub">Add funds to your account. Your play code is <code id="ptSheetCode">PIG-XXXX</code>. She uses it to find your gift.</p>' +
        '<div class="pt-presets" id="ptPresets"></div>' +
        '<div class="pt-custom" id="ptCustomRow"><input id="ptCustom" type="number" min="1" step="1" placeholder="custom $"><button class="pt-add" type="button" id="ptUseCustom">Use</button></div>' +
        '<div id="ptThroneBlock">' +
          '<ol class="pt-steps">' +
            '<li>Copy your play code.</li>' +
            '<li>Open her Throne wishlist and paste the code in the gift note.</li>' +
            '<li>Come back and tap \u201cI already sent it.\u201d Your account stays pending until she confirms.</li>' +
          '</ol>' +
          '<div class="pt-payrow">' +
            '<button class="pt-thronebtn" type="button" id="ptThronePay">Pay via Throne</button>' +
          '</div>' +
          '<div class="pt-payrow" id="ptGiftLinks"></div>' +
          '<button class="pt-sent" type="button" id="ptSent">I already sent it</button>' +
          '<p class="pt-wait pt-hide" id="ptWait">Waiting for her to confirm that gift\u2026</p>' +
        '</div>' +
        '<div id="ptStripeBlock" style="margin-top:14px">' +
          '<button class="pt-cardbtn" type="button" id="ptCard">Pay by card</button>' +
        '</div>' +
        '<p class="pt-testpay pt-hide" id="ptTestPayNote">Test mode \u2014 no real payment</p>' +
        '<p class="pt-demo pt-hide" id="ptDemoNote">Demo mode \u2014 no server is connected, so confirmation is simulated on this device only.</p>' +
      '</div>' +
    '</div>';

  document.getElementById("ptBrand").textContent = SITE;
  document.getElementById("ptTitle").textContent = TITLE;
  document.getElementById("ptTag").textContent = TR.tagline || "Five toes, five fates. The lights stop on one toe, and that\u2019s what you owe.";

  function buildToes() {
    $("trPhoto").src = BASE + (TR.photo || "assets/toe-foot.jpg");
    var spots = "", picks = "";
    SEGS.forEach(function (t, i) {
      var d = DEFAULT_SPOTS[i] || [50, 40];
      var x = isFinite(t.x) ? t.x : d[0], y = isFinite(t.y) ? t.y : d[1];
      spots += '<div class="tr-spot" data-n="' + t.n + '" style="left:' + x + '%;top:' + y + '%"><b>' + t.n + '</b><span class="tr-tag">' + escapeHtml(t.toe) + "</span></div>";
      picks += '<button type="button" data-n="' + t.n + '" aria-pressed="false"><b>' + t.n + "</b><small>" + escapeHtml(t.toe.replace(/ Toe$/, "")) + "</small></button>";
    });
    $("trSpots").innerHTML = spots;
    $("trPickRow").innerHTML = picks;
  }
  function escapeHtml(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  buildToes();

  (C.loadPresets || [10, 20, 50, 100]).forEach(function (n) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = "$" + n;
    b.setAttribute("data-amt", String(n));
    if (n === 20) b.className = "on";
    document.getElementById("ptPresets").appendChild(b);
  });
  var chosenAmt = 20;

  function money(cents) { return "$" + (Math.max(0, Number(cents) || 0) / 100).toFixed(2); }
  function pickAmt() { return chosenAmt; }
  function needCents() { return PRICE_CENTS; }

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

  function applyPlayer(p) {
    if (!p) return;
    player = p;
    $("ptPocket").textContent = money(p.balance);
    $("ptTab").textContent = money(p.tab);
    $("ptCode").textContent = p.code || "\u2014";
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

  function histLine(p) {
    if (p.value === "ALL") return "The rest of your account";
    if (p.game === "poster") return "Pinned " + p.label;
    if (p.game === "humiliation") return "Task: " + (p.text || p.label);
    if (p.game === "toe") return "Toe: " + p.label;
    return "Spun " + p.label;
  }

  function renderHist() {
    var ol = $("ptList"); ol.innerHTML = "";
    var pins = player.pins || [];
    if (!pins.length) {
      var e = document.createElement("li"); e.className = "empty"; e.textContent = "No spins yet \u2014 add funds and spin the toes."; ol.appendChild(e); return;
    }
    pins.slice(0, 10).forEach(function (p, i) {
      var li = document.createElement("li");
      if (p.value === "ALL") li.className = "all";
      li.innerHTML = '<span class="n">#' + (pins.length - i) + "</span><span></span><b></b>";
      li.children[1].textContent = histLine(p);
      li.children[2].textContent = "\u2212" + money(p.charge);
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

  function saveDemo() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(player)); } catch (e) {}
  }
  function loadDemo() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { code: "", balance: 0, tab: 0, pins: [], loads: [], pending: [] };
  }
  function newDemoCode() {
    var a = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ", s = "", i;
    for (i = 0; i < 4; i++) s += a.charAt(Math.floor(Math.random() * a.length));
    return "PIG-" + s;
  }

  function pickWeighted() {
    var total = 0, i, r;
    for (i = 0; i < SEGS.length; i++) total += Number(SEGS[i].weight) || 1;
    r = Math.random() * total;
    for (i = 0; i < SEGS.length; i++) {
      r -= Number(SEGS[i].weight) || 1;
      if (r <= 0) return { index: i, seg: SEGS[i] };
    }
    return { index: SEGS.length - 1, seg: SEGS[SEGS.length - 1] };
  }

  function localSpin() {
    if (player.balance < PRICE_CENTS) return { broke: true };
    var pick = pickWeighted();
    var charge = Math.min(Math.round(pick.seg.value * 100), player.balance);
    var result = { label: pick.seg.label, text: pick.seg.text, toe: pick.seg.n, toeName: pick.seg.toe, value: pick.seg.value,
      charge: charge, balance: player.balance - charge, index: pick.index, game: "toe",
      called: pickedToe || null, lucky: !!pickedToe && pickedToe === pick.seg.n };
    player.balance = result.balance;
    player.tab += charge;
    player.pins.unshift({ label: result.label, text: result.text, value: result.value, charge: charge, game: "toe", ts: Date.now() });
    saveDemo();
    return { result: result, player: player };
  }

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

  function reduceMotion() {
    return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function brokeMessage() {
    return "You need " + money(PRICE_CENTS).replace(/\.00$/, "") + " in your pocket to spin the toes.";
  }

  function spotEls() { return Array.prototype.slice.call(document.querySelectorAll("#trSpots .tr-spot")); }

  function lightOnly(i) {
    spotEls().forEach(function (el, j) { el.classList.toggle("lit", j === i); });
  }

  /* Casino light chase: the glow runs pinky to big toe around and around,
     slowing down until it stops on the toe the server picked. */
  function runSpin(result) {
    spinning = true;
    $("ptPin").disabled = true;
    $("ptResult").classList.remove("show");
    $("whStage").classList.add("spinning");
    spotEls().forEach(function (el) { el.classList.remove("win", "called"); });
    audio();
    var n = SEGS.length;
    var idx = typeof result.index === "number" ? result.index : 0;
    var laps = reduceMotion() ? 1 : 4;
    var steps = laps * n + idx + 1;
    var i = 0, delay = reduceMotion() ? 90 : 55;
    var reel = $("whReel");
    reel.classList.add("on");
    function step() {
      var cur = i % n;
      lightOnly(cur);
      reel.textContent = SEGS[cur].toe;
      tone(560 + cur * 90, 0.05, "square", 0.035);
      i++;
      if (i < steps) {
        var left = steps - i;
        if (left < 9) delay *= 1.22;
        else if (left < 16) delay *= 1.06;
        setTimeout(step, delay);
      } else setTimeout(finish, 380);
    }
    function finish() {
      reel.classList.remove("on");
      $("whStage").classList.remove("spinning");
      var el = spotEls()[idx];
      if (el) el.classList.add("win");
      if (result.called) {
        var c = spotEls()[result.called - 1];
        if (c && result.called - 1 !== idx) c.classList.add("called");
      }
      lastChargeDollars = result.charge / 100;
      var seg = SEGS[idx] || {};
      $("ptCaption").textContent = (result.toeName || seg.toe || "Her toe") + " \u00b7 #" + (result.toe || idx + 1);
      $("ptOwe").textContent = (result.label || seg.label) + " \u2014 " + money(result.charge).replace(/\.00$/, "");
      $("trOut").textContent = result.text || seg.text || "";
      var call = $("trCall");
      if (result.called) {
        call.textContent = result.lucky ? "\ud83c\udfaf You called it! She\u2019s impressed\u2026 for now." : "You called #" + result.called + ". Wrong toe, piggy.";
        call.className = "tr-call " + (result.lucky ? "yes" : "no");
      } else { call.textContent = ""; call.className = "tr-call"; }
      setPayHref();
      if (window.PiggyRewards) window.PiggyRewards.onResult(result, $("ptResult").querySelector(".pt-banner"));
      $("ptResult").classList.add("show");
      $("ptPin").classList.add("pt-hide");
      $("trPick").classList.add("pt-hide");
      landSound(result.lucky || result.toe === 5 || result.charge >= 5000);
      if (result.lucky || result.toe === 5) confetti();
      applyPlayer(player);
      spinning = false;
      reportHeight();
    }
    step();
  }

  function landSound(big) {
    if (big) [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.28, "triangle", 0.06, i * 0.08); });
    else { tone(660, 0.1, "sine", 0.05); tone(880, 0.18, "sine", 0.045, 0.08); }
  }

  function spinIt() {
    if (spinning) return;
    if (player.balance < needCents()) { openLoad(brokeMessage()); return; }
    if (demo) {
      var local = localSpin();
      if (local.broke) { openLoad(brokeMessage()); return; }
      applyPlayer(local.player);
      runSpin(local.result);
      return;
    }
    api("/api/spin", { body: { game: "toe", pick: pickedToe || null } }).then(function (d) {
      player = d.player;
      runSpin(d.result);
    }).catch(function (err) {
      if (err.body && err.body.broke) openLoad((err.body && err.body.error) || brokeMessage());
      else alert(err.message || "Could not spin just now.");
    });
  }

  function playAgain() {
    $("ptResult").classList.remove("show");
    spotEls().forEach(function (el) { el.classList.remove("win", "called", "lit"); });
    $("ptPin").classList.remove("pt-hide");
    $("trPick").classList.remove("pt-hide");
    $("ptPin").disabled = player.balance < needCents();
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

  /* One gift request at a time: repeated taps reuse the request in flight and
     the pay buttons stay disabled until it finishes. */
  var loadInFlight = null;
  function requestLoadOnce(amt) {
    if (loadInFlight) return loadInFlight;
    var btns = ["ptSent", "ptThronePay"].map(function (id) { return document.getElementById(id); }).filter(Boolean);
    btns.forEach(function (b) { b.disabled = true; });
    loadInFlight = api("/api/request-load", { body: { amount: amt } });
    var release = function () {
      setTimeout(function () { loadInFlight = null; btns.forEach(function (b) { b.disabled = false; }); }, 1500);
    };
    loadInFlight.then(release, release);
    return loadInFlight;
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
    requestLoadOnce(amt).then(function (d) {
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
    requestLoadOnce(amt).then(function (d) {
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

  paintSnd();
  $("ptSnd").onclick = function () { sound = !sound; paintSnd(); audio(); };
  $("ptStart").onclick = function () { startSession(false).then(showGame); };
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
  $("ptPin").onclick = spinIt;
  $("ptAgain").onclick = playAgain;
  if ($("ptPay")) $("ptPay").onclick = openPayUp;
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

  $("trPickRow").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b || spinning) return;
    var n = Number(b.getAttribute("data-n"));
    pickedToe = pickedToe === n ? 0 : n;
    Array.prototype.forEach.call($("trPickRow").children, function (c) {
      var on = Number(c.getAttribute("data-n")) === pickedToe;
      c.classList.toggle("on", on); c.setAttribute("aria-pressed", on ? "true" : "false");
    });
    spotEls().forEach(function (el) { el.classList.toggle("picked", Number(el.getAttribute("data-n")) === pickedToe); });
    tone(700 + n * 60, 0.06, "sine", 0.04);
  });

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
