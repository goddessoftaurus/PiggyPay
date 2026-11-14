(function () {
  "use strict";

  var C = window.CONFIG || {};
  var SITE = window.SITE_NAME || C.siteName || "PayPiggy";
  var IS_WIDGET = document.body.classList.contains("widget");
  var BASE = IS_WIDGET ? "../" : "";
  var API = (C.apiBase || "").replace(/\/$/, "");
  var TOKEN_KEY = "paypiggy-token";
  var STORE_KEY = "paypiggy-demo-v2";

  var pathName = (location.pathname || "").toLowerCase();
  var GAME = (document.body.getAttribute("data-game") || "").toLowerCase();
  if (GAME !== "humiliation" && GAME !== "wheel") {
    GAME = /humiliation/.test(pathName) ? "humiliation" : "wheel";
  }
  var IS_HUM = GAME === "humiliation";

  var DEFAULT_HUMILIATION_TASKS = [
    { label: "Tape selfie", text: "Tape across your face, then send a selfie" },
    { label: "One finger", text: "Jerk the tip with one finger only for 2 minutes" },
    { label: "Sit on hands", text: "Sit on your hands until they go numb" },
    { label: "Ice water", text: "Balls in ice water for 30 seconds" },
    { label: "Forehead", text: "Write \"PayPiggy\" on your forehead in marker and send a selfie" },
    { label: "Oink 20\u00d7", text: "Oink 20 times on camera" },
    { label: "Panties", text: "Wear panties all day under your clothes" },
    { label: "Kneel 10 min", text: "Kneel in the corner for 10 minutes" },
    { label: "Floor meal", text: "Eat your next meal off a plate on the floor with no hands" },
    { label: "Clothespins", text: "Wear a clothespin on each nipple for 5 minutes" }
  ];

  var HW = C.humiliationWheel || {};
  var SEGS;
  if (IS_HUM) {
    var tasks = (HW.tasks && HW.tasks.length) ? HW.tasks.slice() : DEFAULT_HUMILIATION_TASKS;
    SEGS = tasks.map(function (t) {
      return { label: t.label || t.text, text: t.text || t.label, value: 5 };
    });
  } else {
    SEGS = (C.segments && C.segments.length) ? C.segments.slice() : [];
  }
  var PRICE_CENTS = 500;

  var root = document.getElementById("paypiggy-game");
  if (!root) return;
  if (IS_HUM) root.classList.add("wh-humiliation");

  var TITLE = IS_HUM ? (HW.title || "Wheel of Humiliation") : (C.wheelTitle || "Wheel of Financial Torture");
  document.title = SITE + " \u2014 " + TITLE;

  var demo = true;
  var flags = { stripe: false, throne: C.ENABLE_THRONE !== false };
  var sound = C.soundDefault === true;
  var spinning = false;
  var lastChargeDollars = 0;
  var currentRot = 0;
  var player = { code: "", balance: 0, tab: 0, pins: [], loads: [], pending: [] };

  var POINTER_SVG = '<svg viewBox="0 0 80 120" aria-hidden="true"><g transform="rotate(-2 40 20)"><path d="M22 4 L58 4 L70 18 L48 18 L44 108 L36 108 L32 18 L10 18 Z" fill="#fff" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><path d="M24 6 L56 6 L66 17 L46 17 L42 104 L38 104 L34 17 L14 17 Z" fill="#e0115f" stroke="#6a0010" stroke-width="2.4" stroke-linejoin="round"/><path d="M40 8 C40 8 54 38 40 54 C22 76 58 84 44 100" fill="none" stroke="#ffc83d" stroke-width="6" stroke-linecap="round"/><circle cx="40" cy="8" r="7" fill="#ffc83d" stroke="#6a0010" stroke-width="2"/></g></svg>';

  var PIG_SVG = IS_HUM
    ? '<svg viewBox="0 0 120 120" aria-hidden="true"><ellipse cx="61" cy="70" rx="36" ry="29" fill="none" stroke="#6a0010" stroke-width="3" stroke-linejoin="round"/><ellipse cx="60" cy="68" rx="36" ry="29" fill="#ff6fa3"/><circle cx="31" cy="43" r="13" fill="#e0115f" stroke="#6a0010" stroke-width="2"/><circle cx="90" cy="42" r="13" fill="#e0115f" stroke="#6a0010" stroke-width="2"/><circle cx="33" cy="44" r="7.5" fill="#ffb0cc"/><circle cx="88" cy="44" r="7.5" fill="#ffb0cc"/><ellipse cx="60" cy="80" rx="16" ry="11" fill="#ffd0e0" stroke="#6a0010" stroke-width="1.6"/><circle cx="54" cy="79" r="2.4" fill="#3a0810"/><circle cx="66" cy="79" r="2.4" fill="#3a0810"/><path d="M40 58 Q46 54 52 60" fill="none" stroke="#6a0010" stroke-width="2" stroke-linecap="round"/><path d="M80 58 Q74 53 68 60" fill="none" stroke="#6a0010" stroke-width="2" stroke-linecap="round"/><circle cx="46" cy="64" r="4" fill="#3a0810"/><circle cx="75" cy="63" r="4" fill="#3a0810"/><circle cx="47.4" cy="62.6" r="1.3" fill="#fff"/><circle cx="76.4" cy="61.6" r="1.3" fill="#fff"/><path d="M96 36 Q104 28 108 40" fill="none" stroke="#6a0010" stroke-width="2" stroke-linecap="round"/><circle cx="108" cy="42" r="3.2" fill="none" stroke="#6a0010" stroke-width="1.8"/></svg>'
    : '<svg viewBox="0 0 120 120" aria-hidden="true"><ellipse cx="61" cy="70" rx="36" ry="30" fill="none" stroke="#6a0010" stroke-width="3"/><ellipse cx="60" cy="68" rx="36" ry="30" fill="#ff6fa3"/><circle cx="32" cy="43" r="13.5" fill="#e0115f" stroke="#6a0010" stroke-width="2"/><circle cx="88" cy="42" r="13.5" fill="#e0115f" stroke="#6a0010" stroke-width="2"/><circle cx="34" cy="44" r="7.5" fill="#ffb0cc"/><circle cx="86" cy="44" r="7.5" fill="#ffb0cc"/><ellipse cx="60" cy="79" rx="16" ry="12" fill="#ffd0e0" stroke="#6a0010" stroke-width="1.6"/><circle cx="54" cy="78" r="2.5" fill="#3a0810"/><circle cx="66" cy="78" r="2.5" fill="#3a0810"/><circle cx="46" cy="62" r="4" fill="#3a0810"/><circle cx="74" cy="62" r="4" fill="#3a0810"/><circle cx="47.5" cy="60.6" r="1.3" fill="#fff"/><circle cx="75.5" cy="60.6" r="1.3" fill="#fff"/></svg>';

  var DOODLES = '<svg viewBox="0 0 400 400" aria-hidden="true"><path d="M28 70 q12 -18 28 -6" fill="none" stroke="#6a0010" stroke-width="2" stroke-linecap="round"/><path d="M360 90 q14 16 -6 28" fill="none" stroke="#6a0010" stroke-width="2" stroke-linecap="round"/><path d="M40 320 q20 16 36 0" fill="none" stroke="#b3001b" stroke-width="2" stroke-linecap="round"/><text x="22" y="200" fill="#6a0010" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" transform="rotate(-18 22 200)">\u2665</text><text x="372" y="250" fill="#6a0010" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" transform="rotate(16 372 250)">\u2605</text><text x="340" y="40" fill="#6a0010" font-family="Arial, Helvetica, sans-serif" font-size="16" transform="rotate(8 340 40)">\u2727</text></svg>';

  var resultCaption = IS_HUM ? "Your task" : "The tail pinned on";
  var resultLead = IS_HUM ? "Do this 🐷" : "You owe $0 🐷";
  var payBtn = IS_HUM ? "" : '<a class="pt-pay" id="ptPay" href="#">Pay up</a>';

  root.innerHTML =
    '<canvas id="fx"></canvas>' +
    '<header class="pt-head"><div class="brand" id="ptBrand"></div><h1 id="ptTitle"></h1><p id="ptTag"></p></header>' +
    '<section class="pt-panel pt-gate" id="ptGate">' +
      '<h2>18+ only</h2>' +
      '<p>This is a grown-up teasing game. Real gifts are confirmed by her \u2014 nothing on this page charges a card unless you choose Pay by card.</p>' +
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
      '<div class="wh-stage" id="whStage">' +
        '<div class="wh-doodles" aria-hidden="true">' + DOODLES + '</div>' +
        '<div class="wh-rim" aria-hidden="true"></div>' +
        '<div class="wh-tape wh-tape-a" aria-hidden="true"></div>' +
        '<div class="wh-tape wh-tape-b" aria-hidden="true"></div>' +
        '<div class="wh-tape wh-tape-c" aria-hidden="true"></div>' +
        '<div class="wh-wheel" id="whWheel"></div>' +
        '<div class="wh-hub">' + PIG_SVG + '<div class="wh-sash" aria-hidden="true"></div></div>' +
        '<div class="wh-pointer" id="whPointer">' + POINTER_SVG + '</div>' +
        '<div class="wh-veil" id="whVeil"><div class="msg">blindfold on\u2026</div><div class="wh-reel" id="whReel">' + (IS_HUM ? "??" : "$??") + '</div></div>' +
        '<div class="wh-result" id="ptResult">' +
          '<div class="pt-banner' + (IS_HUM ? " wh-task" : "") + '"><small id="ptCaption">' + resultCaption + '</small><b id="ptOwe">' + resultLead + '</b>' +
            '<div class="row">' + payBtn +
            '<button class="pt-again" type="button" id="ptAgain">Play again</button></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<button class="pt-go" type="button" id="ptPin">' + (IS_HUM ? "Spin \u00b7 $5" : "Spin") + '</button>' +
      '<button class="pt-funds" type="button" id="ptOpenLoad">Add funds</button>' +
      '<div class="pt-pending pt-hide" id="ptPendingNote">A gift is waiting for her to confirm.</div>' +
    '</section>' +
    '<section class="pt-panel pt-hist pt-hide" id="ptHist">' +
      '<h2>Spin history</h2>' +
      '<ol id="ptList"><li class="empty">No spins yet \u2014 add funds and spin the wheel.</li></ol>' +
    '</section>' +
    '<section class="pt-panel pt-hist pt-hide" id="ptLoads">' +
      '<h2>What you sent</h2>' +
      '<ol id="ptLoadList"><li class="empty">No funds added yet.</li></ol>' +
    '</section>' +
    '<div class="pt-over" id="ptLoadSheet">' +
      '<div class="sheet">' +
        '<button class="pt-x" type="button" data-close aria-label="Close">\u00d7</button>' +
        '<h3>Add funds</h3>' +
        '<p class="sub">Add funds to your account. Your play code is <code id="ptSheetCode">PIG-XXXX</code>. She uses it to find your gift.</p>' +
        '<div class="pt-presets" id="ptPresets"></div>' +
        '<div class="pt-custom"><input id="ptCustom" type="number" min="1" step="1" placeholder="custom $"><button class="pt-add" type="button" id="ptUseCustom">Use</button></div>' +
        '<div id="ptThroneBlock">' +
          '<ol class="pt-steps">' +
            '<li>Copy your play code.</li>' +
            '<li>Open her Throne wishlist and paste the code in the gift note.</li>' +
            '<li>Come back and tap \u201cI already sent it.\u201d Your account stays pending until she confirms.</li>' +
          '</ol>' +
          '<div class="pt-payrow" id="ptGiftLinks"></div>' +
          '<button class="pt-sent" type="button" id="ptSent">I already sent it</button>' +
          '<p class="pt-wait pt-hide" id="ptWait">Waiting for her to confirm that gift\u2026</p>' +
        '</div>' +
        '<div id="ptStripeBlock" class="pt-hide" style="margin-top:14px">' +
          '<button class="pt-cardbtn" type="button" id="ptCard">Pay by card</button>' +
        '</div>' +
        '<p class="pt-demo pt-hide" id="ptDemoNote">Demo mode \u2014 no server is connected, so confirmation is simulated on this device only.</p>' +
      '</div>' +
    '</div>';

  document.getElementById("ptBrand").textContent = SITE;
  document.getElementById("ptTitle").textContent = TITLE;
  document.getElementById("ptTag").textContent = IS_HUM
    ? (HW.tagline || "Spin it. Wherever it stops is the task you do.")
    : (C.wheelTagline || C.tagline || "Blindfold on. The tail pins wherever the wheel stops \u2014 that's what you send.");

  function hash01(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function wobbleArc(cx, cy, r, a0, a1, steps, seed) {
    var pts = [];
    var s;
    for (s = 0; s <= steps; s++) {
      var t = s / steps;
      var a = a0 + (a1 - a0) * t;
      var jitter = (hash01(seed * 17 + s * 3.1) - 0.5) * 5.2;
      var rr = r + jitter;
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
    return pts;
  }

  function ringPath(outer, inner) {
    var d = "M " + outer[0][0].toFixed(1) + " " + outer[0][1].toFixed(1);
    var i;
    for (i = 1; i < outer.length; i++) d += " L " + outer[i][0].toFixed(1) + " " + outer[i][1].toFixed(1);
    d += " L " + inner[inner.length - 1][0].toFixed(1) + " " + inner[inner.length - 1][1].toFixed(1);
    for (i = inner.length - 2; i >= 0; i--) d += " L " + inner[i][0].toFixed(1) + " " + inner[i][1].toFixed(1);
    return d + " Z";
  }

  function labelLines(label) {
    var s = String(label || "").replace(/</g, "");
    if (s.length <= 12) return [s];
    var mid = s.lastIndexOf(" ", Math.ceil(s.length / 2));
    if (mid < 1) mid = s.indexOf(" ");
    if (mid < 1) return [s];
    return [s.slice(0, mid), s.slice(mid + 1)];
  }

  function isLight(hex) {
    var h = String(hex || "").replace("#", "");
    if (h.length !== 6) return false;
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 170;
  }

  function buildWheel() {
    var n = SEGS.length || 1;
    var slice = 360 / n;
    var colors = IS_HUM
      ? ["#e45a86", "#c4144a", "#f07aa0", "#b3001b", "#ef5b8c", "#d81b60", "#ff8aaa", "#a10d2e", "#e0115f", "#c73a6a"]
      : ["#e45a86", "#c4144a", "#f07aa0", "#ff6fa3", "#b3001b", "#e45a86", "#c4144a", "#ff8fb8"];
    var cx = 200, cy = 200, R = 194, r0 = 56;
    var paths = "", labels = "";
    var i;
    var defs = '<defs><filter id="whPaper" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.12  0 0 0 0 0.12  0 0 0 0.14 0"/><feBlend in="SourceGraphic" mode="multiply"/></filter></defs>';
    for (i = 0; i < n; i++) {
      var a0 = (i * slice - 90) * Math.PI / 180;
      var a1 = ((i + 1) * slice - 90) * Math.PI / 180;
      var outer = wobbleArc(cx, cy, R, a0, a1, 7, i + 1);
      var inner = wobbleArc(cx, cy, r0, a0, a1, 5, i + 40);
      var isAll = SEGS[i].value === "ALL" || SEGS[i].label === "ALL";
      var fill = isAll ? "#e8c56b" : colors[i % colors.length];
      paths += '<path d="' + ringPath(outer, inner) + '" fill="' + fill + '" stroke="#6a0010" stroke-width="2.3" stroke-linejoin="round" filter="url(#whPaper)"/>';
      var midDeg = (i + 0.5) * slice;
      var am = (midDeg - 90) * Math.PI / 180;
      // Money wheel: short tangential labels. Humiliation: radial, so long words stay in-slice.
      var lr = (R + r0) / 2 + (IS_HUM ? 10 : 6);
      var lx = cx + lr * Math.cos(am);
      var ly = cy + lr * Math.sin(am);
      var rot;
      if (IS_HUM) {
        rot = midDeg - 90 + (hash01(i + 9) - 0.5) * 3;
        if (midDeg > 90 && midDeg < 270) rot += 180;
      } else {
        rot = midDeg + (hash01(i + 9) - 0.5) * 7;
        if (rot > 90 && rot < 270) rot += 180;
      }
      var lines = labelLines(SEGS[i].label);
      var long = lines.join(" ").length > 8 || lines.length > 1;
      var fs = isAll ? 24 : (IS_HUM ? (lines.length > 1 ? 12.5 : 13.5) : (long ? 14 : 24));
      var textFill = (isAll || isLight(fill)) ? "#3a0810" : "#fffdf8";
      var lh = fs * 1.05;
      var startY = ly - ((lines.length - 1) * lh) / 2;
      labels += '<text fill="' + textFill + '" font-family="Arial, Helvetica, sans-serif" font-size="' + fs + '" font-weight="700" text-anchor="middle" dominant-baseline="middle" transform="rotate(' +
        rot.toFixed(1) + " " + lx.toFixed(1) + " " + ly.toFixed(1) + ')">';
      var li;
      for (li = 0; li < lines.length; li++) {
        labels += '<tspan x="' + lx.toFixed(1) + '" y="' + (startY + li * lh).toFixed(1) + '">' + lines[li] + "</tspan>";
      }
      labels += "</text>";
    }
    document.getElementById("whWheel").innerHTML =
      '<svg viewBox="0 0 400 400" aria-hidden="true">' + defs + paths + labels + "</svg>";
  }
  buildWheel();

  (C.loadPresets || [10, 20, 50, 100]).forEach(function (n) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = "$" + n;
    b.setAttribute("data-amt", String(n));
    if (n === 20) b.className = "on";
    document.getElementById("ptPresets").appendChild(b);
  });
  var chosenAmt = 20;

  function $(id) { return document.getElementById(id); }
  function money(cents) { return "$" + (Math.max(0, Number(cents) || 0) / 100).toFixed(2); }
  function pickAmt() { return chosenAmt; }
  function needCents() { return IS_HUM ? PRICE_CENTS : 1; }

  function payUpHref(dollars) {
    var base = C.PAYMENT_URL || C.payUrl || "";
    if (base) {
      try {
        var u = new URL(base, location.href);
        if (dollars != null && dollars !== "ALL") u.searchParams.set("amount", String(dollars));
        return u.toString();
      } catch (e) { return base; }
    }
    return (IS_WIDGET ? "../index.html#crypto" : "index.html#crypto");
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
    renderHist();
    renderLoads();
    reportHeight();
  }

  function histLine(p) {
    if (p.value === "ALL") return "The rest of your account";
    if (p.game === "poster") return "Pinned " + p.label;
    if (p.game === "humiliation") return "Task: " + (p.text || p.label);
    return "Spun " + p.label;
  }

  function renderHist() {
    var ol = $("ptList"); ol.innerHTML = "";
    var pins = player.pins || [];
    if (!pins.length) {
      var e = document.createElement("li"); e.className = "empty"; e.textContent = "No spins yet \u2014 add funds and spin the wheel."; ol.appendChild(e); return;
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
    a.href = payUpHref(lastChargeDollars);
    if (IS_WIDGET) a.target = "_top";
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
    if (IS_HUM) {
      if (player.balance < PRICE_CENTS) return { broke: true };
      var hi = Math.floor(Math.random() * SEGS.length);
      if (hi >= SEGS.length) hi = SEGS.length - 1;
      var t = SEGS[hi];
      var hCharge = PRICE_CENTS;
      var hResult = { label: t.label, text: t.text, value: 5, charge: hCharge, balance: player.balance - hCharge, index: hi, game: "humiliation" };
      player.balance = hResult.balance;
      player.tab += hCharge;
      player.pins.unshift({ label: hResult.label, text: hResult.text, value: hResult.value, charge: hCharge, game: "humiliation", ts: Date.now() });
      saveDemo();
      return { result: hResult, player: player };
    }
    if (player.balance <= 0) return { broke: true };
    var pick = pickWeighted();
    var isAll = pick.seg.value === "ALL" || pick.seg.label === "ALL";
    var charge = isAll ? player.balance : Math.min(Math.round(Number(pick.seg.value) * 100), player.balance);
    var result = { label: pick.seg.label, value: isAll ? "ALL" : pick.seg.value, charge: charge, balance: player.balance - charge, index: pick.index, game: "wheel" };
    player.balance = result.balance;
    player.tab += charge;
    player.pins.unshift({ label: result.label, value: result.value, charge: charge, game: "wheel", ts: Date.now() });
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

  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

  function segmentAt(rot) {
    var n = SEGS.length || 1;
    var slice = 360 / n;
    var a = ((-rot) % 360 + 360) % 360;
    return Math.min(n - 1, Math.floor(a / slice));
  }

  function targetRotation(index) {
    var n = SEGS.length || 1;
    var slice = 360 / n;
    var mid = index * slice + slice / 2;
    var landing = (360 - mid) % 360;
    var base = currentRot % 360;
    if (base < 0) base += 360;
    var spins = reduceMotion() ? 1 : 6;
    var dest = currentRot - base + spins * 360 + landing;
    if (dest - currentRot < spins * 360 - 1) dest += 360;
    return dest;
  }

  function brokeMessage() {
    return IS_HUM
      ? "You need $5 in your pocket to spin this wheel."
      : "Your account is empty. Add funds to spin the wheel.";
  }

  function runSpin(result) {
    spinning = true;
    $("ptPin").disabled = true;
    $("ptResult").classList.remove("show");
    $("whPointer").classList.remove("pinned", "tick");
    $("whStage").classList.add("blind");
    audio();

    var idx = typeof result.index === "number" ? result.index : 0;
    if (result.index == null) {
      for (var i = 0; i < SEGS.length; i++) {
        if (SEGS[i].label === result.label && String(SEGS[i].value) === String(result.value)) { idx = i; break; }
      }
    }
    var dest = targetRotation(idx);
    var start = currentRot;
    var dur = reduceMotion() ? 700 : 4200;
    var t0 = performance.now();
    var lastSeg = segmentAt(start);
    var wheel = $("whWheel");
    var pointer = $("whPointer");
    var reel = $("whReel");
    var labels = SEGS.map(function (s) { return s.label; });

    function frame(now) {
      var t = Math.min(1, (now - t0) / dur);
      var e = easeOutQuart(t);
      var rot = start + (dest - start) * e;
      currentRot = rot;
      wheel.style.transform = "rotate(" + rot + "deg)";
      var seg = segmentAt(rot);
      if (seg !== lastSeg) {
        lastSeg = seg;
        reel.textContent = labels[seg];
        pointer.classList.remove("tick");
        void pointer.offsetWidth;
        pointer.classList.add("tick");
        tone(520 + (seg * 40), 0.045, "square", 0.035);
      }
      if (t < 1) requestAnimationFrame(frame);
      else finish();
    }

    function finish() {
      currentRot = dest;
      wheel.style.transform = "rotate(" + dest + "deg)";
      pointer.classList.remove("tick");
      pointer.classList.add("pinned");
      $("whStage").classList.remove("blind");
      reel.textContent = result.label;
      lastChargeDollars = result.charge / 100;
      if (IS_HUM) {
        $("ptCaption").textContent = "Your task \u00b7 $5";
        $("ptOwe").textContent = result.text || result.label;
      } else {
        var banner = (result.value === "ALL")
          ? ((C.allBanner || "You owe ALL 🐷") + (result.charge ? " \u2014 " + money(result.charge) : ""))
          : ("You owe " + money(result.charge).replace(/\.00$/, "") + " 🐷");
        $("ptOwe").textContent = banner;
      }
      setPayHref();
      $("ptResult").classList.add("show");
      $("ptPin").classList.add("pt-hide");
      if (!IS_HUM && (result.value === "ALL" || result.charge >= 10000)) { landSound(true); confetti(); }
      else landSound(false);
      if (IS_HUM) confetti();
      applyPlayer(player);
      spinning = false;
      reportHeight();
    }

    requestAnimationFrame(frame);
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
    api("/api/spin", { body: { game: IS_HUM ? "humiliation" : "wheel" } }).then(function (d) {
      player = d.player;
      runSpin(d.result);
    }).catch(function (err) {
      if (err.body && err.body.broke) openLoad((err.body && err.body.error) || brokeMessage());
      else alert(err.message || "Could not spin just now.");
    });
  }

  function playAgain() {
    $("ptResult").classList.remove("show");
    $("whPointer").classList.remove("pinned", "tick");
    $("whStage").classList.remove("blind");
    $("ptPin").classList.remove("pt-hide");
    $("ptPin").disabled = player.balance < needCents();
    reportHeight();
  }

  function openLoad(msg) {
    if (msg) $("ptLoadSheet").querySelector(".sub").childNodes[0].textContent = msg + " Your play code is ";
    else $("ptLoadSheet").querySelector(".sub").childNodes[0].textContent = "Add funds to your account. Your play code is ";
    $("ptSheetCode").textContent = player.code || "PIG-XXXX";
    $("ptThroneBlock").classList.toggle("pt-hide", flags.throne === false);
    $("ptStripeBlock").classList.toggle("pt-hide", !flags.stripe);
    $("ptDemoNote").classList.toggle("pt-hide", !demo);
    paintGiftLinks();
    $("ptLoadSheet").classList.add("show");
    reportHeight();
  }
  function closeLoad() { $("ptLoadSheet").classList.remove("show"); }

  function paintGiftLinks() {
    var box = $("ptGiftLinks");
    box.innerHTML = "";
    function add(href, label, cls) {
      if (!href) return;
      var a = document.createElement("a");
      a.href = href; a.target = "_blank"; a.rel = "noopener"; a.className = cls; a.textContent = label;
      box.appendChild(a);
    }
    if (flags.throne !== false) add(C.THRONE_URL || C.links && findLink("Throne"), "Open Throne", "throne");
    add(C.YOUPAY_URL || findLink("YouPay"), "YouPay", "alt");
    add(C.CASHAPP_URL || findLink("CashApp"), "Cash App", "alt");
  }
  function findLink(name) {
    var list = C.links || [];
    for (var i = 0; i < list.length; i++) if (list[i].label === name && list[i].href && list[i].href.charAt(0) !== "#") return list[i].href;
    return "";
  }

  function markSent() {
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

  function payByCard() {
    var amt = pickAmt();
    if (!amt || amt < 1) { alert("Pick an amount first."); return; }
    if (demo || !flags.stripe) { alert("Pay by card needs the PayPiggy server with Stripe keys."); return; }
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
  $("ptOpenLoad").onclick = function () { openLoad(""); };
  $("ptSent").onclick = markSent;
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

  api("/api/health").then(function (h) {
    demo = false;
    flags.stripe = !!(h.stripe && C.ENABLE_STRIPE !== false);
    flags.throne = h.throne !== false && C.ENABLE_THRONE !== false;
  }).catch(function () {
    demo = true;
    flags.stripe = false;
    flags.throne = C.ENABLE_THRONE !== false;
  }).then(function () {
    if (/[?&]paid=1/.test(location.search)) {
      startSession(false).then(function () {
        showGame();
        setTimeout(refreshMe, 800);
        setTimeout(refreshMe, 2500);
      });
    }
  });
})();
