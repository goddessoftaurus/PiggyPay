/* Goddess Arcade — Rewards panel (game pages), Rewards section (/account),
   Rewards card (games hub). Reads /api/rewards; the list itself comes from
   CONFIG.rewards in config.js. */
(function () {
  "use strict";

  var C = window.CONFIG || {};
  var API = (C.apiBase || "").replace(/\/$/, "");
  var TOKEN_KEY = "paypiggy-token";
  var GAME_ORDER = ["poster", "wheel", "humiliation", "toe"];

  function token() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(cents) {
    var d = Math.max(0, Number(cents) || 0) / 100;
    return "$" + (d % 1 ? d.toFixed(2) : String(d));
  }

  /* Fallback when no server answers: the plain list from config.js. */
  function localCatalog() {
    var R = C.rewards || {};
    var games = {};
    GAME_ORDER.forEach(function (g) {
      var src = (R.games && R.games[g]) || { rules: [] };
      games[g] = {
        key: g, title: src.title || g, emoji: src.emoji || "", href: src.href || "",
        rules: (src.rules || []).map(function (r) {
          return { id: r.id, type: r.type, emoji: r.emoji, title: r.title, desc: r.desc, at: r.at,
            badge: !!r.badge, penalty: !!r.penalty, repeat: r.type !== "count",
            statLabel: r.stat === "bullseyes" ? "Bullseyes" : (r.stat === "missStreak" ? "Misses in a row" : (r.stat === "luckyCalls" ? "Lucky calls" : "Spins")) };
        })
      };
    });
    var lb = R.leaderboard || {};
    return { games: games, levels: R.levels || [], leaderboard: { title: lb.title || "This week's top piggies", prize: lb.prize || "", size: lb.size || 3, top: [] } };
  }

  function load() {
    var headers = {};
    var tok = token();
    if (tok) headers.Authorization = "Bearer " + tok;
    return fetch(API + "/api/rewards", { headers: headers, credentials: "same-origin", cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("rewards " + r.status); return r.json(); })
      .catch(function () { return localCatalog(); });
  }

  /* ---------- pieces ---------- */
  function needText(r) {
    if (r.type === "every") return "Every " + r.at + " spins";
    if (r.type === "streak") return r.at + " misses in a row";
    if (r.type === "double") return "Same task twice in a row";
    if (r.type === "land") return "Land on her " + (["pinky", "fourth toe", "middle toe", "index toe", "big toe"][r.at - 1] || "toe #" + r.at);
    if (r.statLabel === "Lucky calls") return r.at === 1 ? "Call the right toe once" : "Call the right toe " + r.at + " times";
    var unit = r.statLabel === "Bullseyes" ? (r.at === 1 ? "bullseye" : "bullseyes") : (r.at === 1 ? "spin" : "spins");
    return (r.at === 1 && unit === "bullseye" ? "1st bullseye" : r.at + " " + unit);
  }

  function ruleHtml(r, signedIn) {
    var on = signedIn && r.unlocked;
    var cls = "rw-item" + (on ? " on" : " locked") + (r.penalty ? " pen" : "");
    var state, prog = "";
    if (!signedIn) {
      state = r.penalty ? "Penalty" : "Locked";
    } else if (r.type === "count") {
      state = on ? (r.badge ? "Earned" : "Unlocked") : "Locked";
    } else {
      state = r.times > 0 ? ((r.penalty ? "Got" : "Won") + " \u00d7" + r.times) : (r.penalty ? "Penalty" : "Locked");
    }
    if (signedIn && r.type !== "land" && !(r.type === "count" && on)) {
      var at = r.type === "double" ? 2 : r.at;
      var cur = Math.max(0, Math.min(at, Number(r.current) || 0));
      var label = r.type === "double" ? "Same task in a row" : (r.type === "every" ? r.statLabel + " to next" : r.statLabel);
      prog = '<div class="rw-bar" aria-hidden="true"><i style="width:' + Math.round(cur / at * 100) + '%"></i></div>' +
        '<div class="rw-prog">' + esc(label) + " " + cur + "/" + at + "</div>";
    }
    return '<li class="' + cls + '">' +
      '<span class="rw-ico" aria-hidden="true">' + esc(r.emoji || "🎁") + "</span>" +
      "<span><b>" + esc(r.title) + "</b><small>" + esc(needText(r)) + " \u2014 " + esc(r.desc) + "</small>" + prog + "</span>" +
      '<span class="rw-state">' + esc(state) + "</span></li>";
  }

  function gameHtml(g, signedIn, linkTitle) {
    if (!g || !g.rules || !g.rules.length) return "";
    var head = esc((g.emoji ? g.emoji + " " : "") + g.title);
    if (linkTitle && g.href) head = '<a href="' + esc(g.href) + '">' + head + "</a>";
    return '<section class="rw-game"><h3>' + head + '</h3><ul class="rw-list">' +
      g.rules.map(function (r) { return ruleHtml(r, signedIn); }).join("") + "</ul></section>";
  }

  function meHtml(data) {
    var me = data.me;
    if (!me) return "";
    var lv = me.level || {};
    var levels = data.levels || [];
    var curMin = levels[lv.index] ? Number(levels[lv.index].min) * 100 : 0;
    var pct = 100, nextTxt = "Top level reached \ud83d\udc51";
    if (lv.next) {
      var span = Math.max(1, lv.next.minCents - curMin);
      pct = Math.round(Math.max(0, Math.min(1, (lv.spent - curMin) / span)) * 100);
      nextTxt = money(lv.next.toGo) + " more to " + lv.next.name + " " + (lv.next.emoji || "");
    }
    var badges = (me.badges || []).map(function (b) { return '<span class="rw-badge">' + esc((b.emoji || "") + " " + b.title) + "</span>"; });
    if (me.nickname) badges.unshift('<span class="rw-badge">\ud83c\udff7\ufe0f ' + esc(me.nickname) + "</span>");
    return '<div class="rw-me">' +
      "<small>Your Piggy Level</small><b>" + esc((lv.emoji || "") + " " + (lv.name || "Pathetic Piglet")) + "</b>" +
      '<div class="rw-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' +
      "<small>" + esc(money(lv.spent) + " confirmed \u00b7 " + nextTxt) + "</small>" +
      (badges.length ? '<div class="rw-badges">' + badges.join("") + "</div>" : "") +
      "</div>";
  }

  function levelsHtml(data) {
    var levels = data.levels || [];
    if (!levels.length) return "";
    var cur = data.me && data.me.level ? data.me.level.index : -1;
    return '<h4 class="rw-h">Piggy Levels</h4><ul class="rw-levels">' + levels.map(function (l, i) {
      return '<li class="rw-level' + (i === cur ? " cur" : "") + '"><b>' + esc((l.emoji || "") + " " + l.name) + "</b>" +
        '<span class="rw-min">' + (Number(l.min) > 0 ? "$" + esc(l.min) + "+ in gifts" : "Everyone starts here") + "</span>" +
        (l.perks && l.perks.length ? "<br>" + esc(l.perks.join(" \u00b7 ")) : "") + "</li>";
    }).join("") + "</ul>";
  }

  function boardHtml(data) {
    var lb = data.leaderboard || {};
    var top = lb.top || [];
    var medals = ["\ud83e\udd47", "\ud83e\udd48", "\ud83e\udd49"];
    var rows = top.length ? top.map(function (t) {
      return '<li class="' + (t.you ? "you" : "") + '"><span>' + (medals[t.rank - 1] || "#" + t.rank) + " " + esc(t.name) + (t.you ? " (you)" : "") + "</span><span>" + esc(money(t.amount)) + "</span></li>";
    }).join("") : '<li class="empty">No gifts yet this week. Be the first piggy on the board.</li>';
    return '<h4 class="rw-h">' + esc(lb.title || "This week's top piggies") + "</h4>" +
      (lb.prize ? '<p class="rw-sub" style="margin-bottom:8px">' + esc(lb.prize) + "</p>" : "") +
      '<ul class="rw-board">' + rows + "</ul>";
  }

  function claimStatus(c) {
    if (c.status === "earned") return "Earned";
    if (c.status === "sent") return c.penalty ? "Assigned" : "Sent";
    if (c.status === "denied") return "Denied";
    return "Pending";
  }

  function claimsHtml(data) {
    var list = (data.me && data.me.claims) || [];
    var rows = list.length ? list.map(function (c) {
      return "<li><span aria-hidden=\"true\">" + esc(c.emoji || "🎁") + "</span><span><b>" + esc(c.title) + "</b>" +
        (c.test ? ' <span class="rw-st">test</span>' : "") + "</span>" +
        '<span class="rw-st ' + esc(c.status) + '">' + esc(claimStatus(c)) + "</span></li>";
    }).join("") : '<li class="empty">Nothing unlocked yet. Keep playing, piggy.</li>';
    return '<h4 class="rw-h">Your unlocked rewards</h4><ul class="rw-claims">' + rows + "</ul>";
  }

  function render(data, opts) {
    opts = opts || {};
    var signedIn = !!data.me;
    var keys = opts.game ? [opts.game] : GAME_ORDER;
    var html = '<h2 class="rw-title">Rewards</h2>';
    if (signedIn && data.me.test) html += '<span class="rw-test">Test player \u00b7 progress is play money</span>';
    html += '<p class="rw-sub">Hit the goals, unlock treats from Goddess Mari. She confirms and sends every reward herself.</p>';
    if (signedIn) html += meHtml(data);
    else html += '<p class="rw-signin">Play or <a href="/account.html">open your account</a> to see your progress.</p>';
    keys.forEach(function (k) { html += gameHtml(data.games && data.games[k], signedIn, !opts.game); });
    if (opts.game && signedIn) {
      var mine = (data.me.claims || []).filter(function (c) { return c.game === opts.game; });
      if (mine.length) html += claimsHtml({ me: { claims: mine } });
    }
    if (opts.claims && signedIn) html += claimsHtml(data);
    html += levelsHtml(data);
    html += boardHtml(data);
    html += '<p class="rw-note">Leaderboard shows nicknames only, never play codes. Rewards are for 18+ players.</p>';
    return html;
  }

  /* ---------- modal ---------- */
  var over = null;
  function ensureModal() {
    if (over) return over;
    over = document.createElement("div");
    over.className = "rw-over";
    over.id = "rwOver";
    over.setAttribute("role", "dialog");
    over.setAttribute("aria-modal", "true");
    over.setAttribute("aria-label", "Rewards");
    over.innerHTML = '<div class="rw-sheet"><button class="rw-x" type="button" aria-label="Close">\u00d7</button><div id="rwBody"><p class="rw-sub">Loading rewards\u2026</p></div></div>';
    document.body.appendChild(over);
    over.addEventListener("click", function (e) {
      if (e.target === over || (e.target.closest && e.target.closest(".rw-x"))) close();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    return over;
  }
  function close() { if (over) over.classList.remove("show"); }
  function open(game) {
    ensureModal();
    over.classList.add("show");
    return load().then(function (data) {
      document.getElementById("rwBody").innerHTML = render(data, { game: game || null, claims: !game });
    });
  }

  /* ---------- page wiring ---------- */
  function pageGame() {
    var b = document.body;
    var g = b.getAttribute("data-rewards-game");
    if (g) return g;
    if (b.classList.contains("wheel-page")) return /humiliation/.test(location.pathname) ? "humiliation" : "wheel";
    if (document.getElementById("paypiggy-game")) return "poster";
    return "";
  }

  var GAME = pageGame();

  function addGameButtons() {
    Array.prototype.forEach.call(document.querySelectorAll("body.game .back-row"), function (row) {
      if (row.querySelector(".back-rewards")) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "back back-rewards";
      b.innerHTML = "\ud83c\udf81 Rewards";
      b.addEventListener("click", function () { open(GAME); });
      row.appendChild(b);
    });
  }

  function onResult(result, banner) {
    if (!banner) return;
    var old = banner.querySelector(".rw-unlock");
    while (old) { old.parentNode.removeChild(old); old = banner.querySelector(".rw-unlock"); }
    var list = (result && result.unlocked) || [];
    if (!list.length) return;
    var row = banner.querySelector(".row");
    list.forEach(function (u) {
      var div = document.createElement("div");
      div.className = "rw-unlock" + (u.penalty ? " pen" : "");
      div.setAttribute("role", "status");
      div.innerHTML = "<strong>" + (u.penalty ? "Penalty unlocked!" : "Reward unlocked!") + "</strong>" +
        "<span>" + esc((u.emoji || "") + " " + u.title) + "</span>" +
        "<em>" + (u.kind === "badge" ? "It's on your account now." : (u.penalty ? "Goddess will assign it." : "Goddess will confirm and send it.")) +
        (u.test ? " (test)" : "") + "</em>";
      if (row) banner.insertBefore(div, row); else banner.appendChild(div);
    });
  }

  /* ---------- "You're THE Paypig" pop-up ---------- */
  var celShown = false;
  function reduceMotion() { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); }

  var FLAKES = {
    plain:    { colors: ["#ffd0e0", "#ff8fb8", "#ffffff", "#ff4d8d"], density: 0.35, stars: 0.08 },
    silver:   { colors: ["#ffffff", "#e6e9ef", "#c0c6d0", "#9aa3b2", "#f4f6fa"], density: 0.65, stars: 0.14 },
    gold:     { colors: ["#ffd86b", "#fff3b0", "#ffc83d", "#e0a800", "#fffbe0", "#ffb3cc"], density: 1, stars: 0.18 },
    platinum: { colors: ["#ffffff", "#e8f6ff", "#bfe6ff", "#d9d2ff", "#9fd8ff"], density: 1.1, stars: 0.3 },
    royal:    { colors: ["#ffd86b", "#fff3b0", "#ffc83d", "#e0a800", "#ffffff", "#ff4d8d"], density: 1.4, stars: 0.28 }
  };

  function glitter(canvas, style) {
    var look = FLAKES[style] || FLAKES.gold;
    var ctx = canvas.getContext("2d");
    if (!ctx) return function () {};
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = 0, H = 0, flakes = [], raf = 0, still = reduceMotion();
    var golds = look.colors;
    function size() {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function flake(top) {
      return { x: Math.random() * W, y: top ? -10 - Math.random() * H : Math.random() * H,
        r: 1.2 + Math.random() * 3.2, vy: 0.6 + Math.random() * 1.8, vx: -0.4 + Math.random() * 0.8,
        a: Math.random() * 6.28, va: 0.05 + Math.random() * 0.12, c: golds[Math.floor(Math.random() * golds.length)],
        star: Math.random() < look.stars };
    }
    function draw(f) {
      var tw = 0.55 + 0.45 * Math.abs(Math.sin(f.a));
      ctx.globalAlpha = tw;
      ctx.fillStyle = f.c;
      if (f.star) {
        var s = f.r * 2.4;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y - s); ctx.lineTo(f.x + s * 0.25, f.y - s * 0.25); ctx.lineTo(f.x + s, f.y);
        ctx.lineTo(f.x + s * 0.25, f.y + s * 0.25); ctx.lineTo(f.x, f.y + s); ctx.lineTo(f.x - s * 0.25, f.y + s * 0.25);
        ctx.lineTo(f.x - s, f.y); ctx.lineTo(f.x - s * 0.25, f.y - s * 0.25); ctx.closePath(); ctx.fill();
      } else {
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a);
        ctx.fillRect(-f.r, -f.r * 0.6, f.r * 2, f.r * 1.2); ctx.restore();
      }
    }
    size();
    var n = Math.round((still ? 60 : Math.min(220, Math.round(W * H / 2600))) * look.density);
    for (var i = 0; i < n; i++) flakes.push(flake(false));
    function frame() {
      ctx.clearRect(0, 0, W, H);
      flakes.forEach(function (f) {
        if (!still) {
          f.y += f.vy; f.x += f.vx + Math.sin(f.a) * 0.3; f.a += f.va;
          if (f.y > H + 10) { var nf = flake(true); f.x = nf.x; f.y = -10; }
        }
        draw(f);
      });
      ctx.globalAlpha = 1;
      if (!still) raf = requestAnimationFrame(frame);
    }
    frame();
    window.addEventListener("resize", size);
    return function () { cancelAnimationFrame(raf); window.removeEventListener("resize", size); };
  }

  function markSeen(id) {
    var headers = { "Content-Type": "application/json" };
    var tok = token();
    if (tok) headers.Authorization = "Bearer " + tok;
    return fetch(API + "/api/rewards/seen", { method: "POST", headers: headers, credentials: "same-origin", body: JSON.stringify({ id: id }) })
      .catch(function () {});
  }

  function celebrate(cel, isTest) {
    if (!cel || celShown) return;
    celShown = true;
    var style = FLAKES[cel.style] ? cel.style : "gold";
    var sub = esc(cel.subtitle)
      .replace(/ROYAL HOG/, "<b>ROYAL HOG</b>")
      .replace(/(\$[0-9][0-9,.]*)/, "<b>$1</b>");
    var icon = style === "gold" || style === "royal" ? "\ud83d\udc51" : (cel.emoji || "\ud83d\udc37");
    var el = document.createElement("div");
    el.className = "rw-cel lv-" + style;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", cel.title);
    el.innerHTML = '<canvas aria-hidden="true"></canvas><div class="rw-cel-box">' +
      (isTest ? '<span class="rw-cel-test">Test player</span>' : "") +
      '<div class="rw-cel-crown" aria-hidden="true">' + icon + "</div>" +
      '<h2 class="rw-gold">' + esc(cel.title) + "</h2>" +
      '<p class="rw-gold-sub">' + sub + "</p>" +
      '<button class="rw-cel-btn" type="button">' + esc(cel.button || "Continue") + "</button></div>";
    document.body.appendChild(el);
    var stop = glitter(el.querySelector("canvas"), style);
    var btn = el.querySelector(".rw-cel-btn");
    try { btn.focus({ preventScroll: true }); } catch (e) {}
    // Remember it right away so it never repeats, even if they leave without tapping.
    markSeen(cel.id);
    function done() {
      stop();
      if (el.parentNode) el.parentNode.removeChild(el);
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") done(); }
    btn.addEventListener("click", done);
    document.addEventListener("keydown", onKey);
  }

  function checkCelebration(data) {
    if (data && data.me && data.me.celebrate) celebrate(data.me.celebrate, !!data.me.test);
  }

  function renderInline(el, opts) {
    return load().then(function (data) {
      checkCelebration(data);
      el.innerHTML = render(data, opts);
      el.classList.add("rw-inline");
    });
  }

  function refresh() {
    var acct = document.getElementById("acctRewards");
    if (acct) return renderInline(acct, { claims: true });
    return Promise.resolve();
  }

  function init() {
    if (GAME) addGameButtons();
    var hubBtn = document.getElementById("hubRewards");
    if (hubBtn) hubBtn.addEventListener("click", function () { open(null); });
    if (document.getElementById("acctRewards")) refresh();
    else if (token()) load().then(checkCelebration);
    try {
      if (/[?&]rewards=1/.test(location.search)) open(GAME || null);
    } catch (e) {}
  }

  window.PiggyRewards = { celebrate: celebrate, open: open, close: close, onResult: onResult, refresh: refresh, render: render };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
