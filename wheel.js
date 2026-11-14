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

  var TITLE = C.wheelTitle || "Wheel of Financial Torture";
  document.title = SITE + " — " + TITLE;

  var demo = true;
  var flags = { stripe: false, throne: C.ENABLE_THRONE !== false };
  var sound = C.soundDefault === true;
  var spinning = false;
  var lastChargeDollars = 0;
  var currentRot = 0;
  var player = { code: "", balance: 0, tab: 0, pins: [], loads: [], pending: [] };

  var TAIL_SVG = '<svg viewBox="0 0 80 110" aria-hidden="true"><path d="M40 8 C40 8 52 36 40 50 C24 70 56 78 44 96" fill="none" stroke="#e0115f" stroke-width="10" stroke-linecap="round"/><path d="M28 0 L52 0 L40 22 Z" fill="#ffc83d" stroke="#6a0010" stroke-width="2" stroke-linejoin="round"/><circle cx="40" cy="4" r="6" fill="#e0115f" stroke="#6a0010" stroke-width="2"/></svg>';

  var PIG_SVG = '<svg viewBox="0 0 120 120" aria-hidden="true"><ellipse cx="60" cy="68" rx="36" ry="30" fill="#ff4d8d"/><circle cx="32" cy="42" r="14" fill="#e0115f"/><circle cx="88" cy="42" r="14" fill="#e0115f"/><circle cx="34" cy="44" r="8" fill="#ff8fb8"/><circle cx="86" cy="44" r="8" fill="#ff8fb8"/><ellipse cx="60" cy="78" rx="16" ry="12" fill="#ffd0e0"/><circle cx="54" cy="77" r="2.6" fill="#3a0810"/><circle cx="66" cy="77" r="2.6" fill="#3a0810"/><circle cx="46" cy="62" r="4.2" fill="#3a0810"/><circle cx="74" cy="62" r="4.2" fill="#3a0810"/><circle cx="47.6" cy="60.6" r="1.4" fill="#fff"/><circle cx="75.6" cy="60.6" r="1.4" fill="#fff"/></svg>';

  root.innerHTML =
    '<canvas id="fx"></canvas>' +
    '<header class="pt-head"><div class="brand" id="ptBrand"></div><h1 id="ptTitle"></h1><p id="ptTag"></p></header>' +
    '<section class="pt-panel pt-gate" id="ptGate">' +
      '<h2>18+ only</h2>' +
      '<p>This is a grown-up teasing game. Real gifts are confirmed by her — nothing on this page charges a card unless you choose Pay by card.</p>' +
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
      '<div class="wh-stage" id="whStage">' +
        '<div class="wh-rim" aria-hidden="true"></div>' +
        '<div class="wh-wheel" id="whWheel"></div>' +
        '<div class="wh-hub">' + PIG_SVG + '<div class="wh-sash" aria-hidden="true"></div></div>' +
        '<div class="wh-pointer" id="whPointer">' + TAIL_SVG + '</div>' +
        '<div class="wh-veil" id="whVeil"><div class="msg">blindfold on…</div><div class="wh-reel" id="whReel">$??</div></div>' +
        '<div class="wh-result" id="ptResult">' +
          '<div class="pt-banner"><small>The tail pinned on</small><b id="ptOwe">You owe $0 🐷</b>' +
            '<div class="row"><a class="pt-pay" id="ptPay" href="#">Pay up</a>' +
            '<button class="pt-again" type="button" id="ptAgain">Play again</button></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<button class="pt-go" type="button" id="ptPin">Spin</button>' +
      '<button class="pt-funds" type="button" id="ptOpenLoad">Add funds</button>' +
      '<div class="pt-pending pt-hide" id="ptPendingNote">A gift is waiting for her to confirm.</div>' +
    '</section>' +
    '<section class="pt-panel pt-hist pt-hide" id="ptHist">' +
      '<h2>Spin history</h2>' +
      '<ol id="ptList"><li class="empty">No spins yet — add funds and spin the wheel.</li></ol>' +
    '</section>' +
    '<section class="pt-panel pt-hist pt-hide" id="ptLoads">' +
      '<h2>What you sent</h2>' +
      '<ol id="ptLoadList"><li class="empty">No funds added yet.</li></ol>' +
    '</section>' +
    '<div class="pt-over" id="ptLoadSheet">' +
      '<div class="sheet">' +
        '<button class="pt-x" type="button" data-close aria-label="Close">×</button>' +
        '<h3>Add funds</h3>' +
        '<p class="sub">Add funds to your account. Your play code is <code id="ptSheetCode">PIG-XXXX</code>. She uses it to find your gift.</p>' +
        '<div class="pt-presets" id="ptPresets"></div>' +
        '<div class="pt-custom"><input id="ptCustom" type="number" min="1" step="1" placeholder="custom $"><button class="pt-add" type="button" id="ptUseCustom">Use</button></div>' +
        '<div id="ptThroneBlock">' +
          '<ol class="pt-steps">' +
            '<li>Copy your play code.</li>' +
            '<li>Open her Throne wishlist and paste the code in the gift note.</li>' +
            '<li>Come back and tap “I already sent it.” Your account stays pending until she confirms.</li>' +
          '</ol>' +
          '<div class="pt-payrow" id="ptGiftLinks"></div>' +
          '<button class="pt-sent" type="button" id="ptSent">I already sent it</button>' +
          '<p class="pt-wait pt-hide" id="ptWait">Waiting for her to confirm that gift…</p>' +
        '</div>' +
        '<div id="ptStripeBlock" class="pt-hide" style="margin-top:14px">' +
          '<button class="pt-cardbtn" type="button" id="ptCard">Pay by card</button>' +
        '</div>' +
        '<p class="pt-demo pt-hide" id="ptDemoNote">Demo mode — no server is connected, so confirmation is simulated on this device only.</p>' +
      '</div>' +
    '</div>';

  document.getElementById("ptBrand").textContent = SITE;
  document.getElementById("ptTitle").textContent = TITLE;
  document.getElementById("ptTag").textContent = C.wheelTagline || C.tagline || "Blindfold on. The tail pins wherever the wheel stops — that's what you send.";

  function buildWheel() {
    var n = SEGS.length || 1;
    var slice = 360 / n;
    var colors = ["#ff4d8d", "#e0115f", "#c01050", "#ff6fa3", "#b3001b", "#ff4d8d", "#e0115f", "#ff8fb8"];
    var cx = 200, cy = 200, R = 196, r0 = 58;
    var paths = "", labels = "", pegs = "";
    var i;
    for (i = 0; i < n; i++) {
      var a0 = (i * slice - 90) * Math.PI / 180;
      var a1 = ((i + 1) * slice - 90) * Math.PI / 180;
      var large = slice > 180 ? 1 : 0;
      var x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
      var x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
      var ix0 = cx + r0 * Math.cos(a0), iy0 = cy + r0 * Math.sin(a0);
      var ix1 = cx + r0 * Math.cos(a1), iy1 = cy + r0 * Math.sin(a1);
      var d = "M " + x0 + " " + y0 + " A " + R + " " + R + " 0 " + large + " 1 " + x1 + " " + y1 +
        " L " + ix1 + " " + iy1 + " A " + r0 + " " + r0 + " 0 " + large + " 0 " + ix0 + " " + iy0 + " Z";
      var isAll = SEGS[i].value === "ALL" || SEGS[i].label === "ALL";
      var fill = isAll ? "#ffc83d" : colors[i % colors.length];
      paths += '<path d="' + d + '" fill="' + fill + '" stroke="#fff5f7" stroke-width="2.5"/>';
      var am = ((i + 0.5) * slice - 90) * Math.PI / 180;
      var lr = (R + r0) / 2 + 8;
      var lx = cx + lr * Math.cos(am);
      var ly = cy + lr * Math.sin(am);
      var rot = (i + 0.5) * slice;
      if (rot > 90 && rot < 270) rot += 180;
      var textFill = isAll ? "#6a0010" : "#fff";
      labels += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" fill="' + textFill +
        '" font-family="Luckiest Guy, system-ui, sans-serif" font-size="28" text-anchor="middle" dominant-baseline="middle" transform="rotate(' +
        rot.toFixed(1) + " " + lx.toFixed(1) + " " + ly.toFixed(1) + ')">' +
        String(SEGS[i].label).replace(/</g, "") + "</text>";
    }
    document.getElementById("whWheel").innerHTML =
      '<svg viewBox="0 0 400 400" aria-hidden="true">' + paths + labels + "</svg>";
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
    $("ptCode").textContent = p.code || "—";
    $("ptSheetCode").textContent = p.code || "PIG-XXXX";
    $("ptPin").disabled = spinning;
    var pend = (p.pending && p.pending.length) || 0;
    $("ptPendingNote").classList.toggle("pt-hide", !pend);
    $("ptWait").classList.toggle("pt-hide", !pend);
    renderHist();
    renderLoads();
    reportHeight();
  }

  function renderHist() {
    var ol = $("ptList"); ol.innerHTML = "";
    var pins = player.pins || [];
    if (!pins.length) {
      var e = document.createElement("li"); e.className = "empty"; e.textContent = "No spins yet — add funds and spin the wheel."; ol.appendChild(e); return;
    }
    pins.slice(0, 10).forEach(function (p, i) {
      var li = document.createElement("li");
      if (p.value === "ALL") li.className = "all";
      li.innerHTML = '<span class="n">#' + (pins.length - i) + "</span><span></span><b></b>";
      li.children[1].textContent = p.value === "ALL" ? "The rest of your account" : ((p.game === "poster" ? "Pinned " : "Spun ") + p.label);
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
    a.href = payUpHref(lastChargeDollars);
    if (IS_WIDGET) a.target = "_top";
  }

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
      var banner = (result.value === "ALL")
        ? ((C.allBanner || "You owe ALL 🐷") + (result.charge ? " — " + money(result.charge) : ""))
        : ("You owe " + money(result.charge).replace(/\.00$/, "") + " 🐷");
      $("ptOwe").textContent = banner;
      setPayHref();
      $("ptResult").classList.add("show");
      $("ptPin").classList.add("pt-hide");
      if (result.value === "ALL" || result.charge >= 10000) { landSound(true); confetti(); }
      else landSound(false);
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
    if (player.balance <= 0) { openLoad("Your account is empty. Add funds to spin the wheel."); return; }
    if (demo) {
      var local = localSpin();
      if (local.broke) { openLoad("Your account is empty. Add funds to spin the wheel."); return; }
      applyPlayer(local.player);
      runSpin(local.result);
      return;
    }
    api("/api/spin", { body: { game: "wheel" } }).then(function (d) {
      player = d.player;
      runSpin(d.result);
    }).catch(function (err) {
      if (err.body && err.body.broke) openLoad("Your account is empty. Add funds to spin the wheel.");
      else alert(err.message || "Could not spin just now.");
    });
  }

  function playAgain() {
    $("ptResult").classList.remove("show");
    $("whPointer").classList.remove("pinned", "tick");
    $("whStage").classList.remove("blind");
    $("ptPin").classList.remove("pt-hide");
    $("ptPin").disabled = player.balance <= 0;
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
