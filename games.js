(function () {
  "use strict";

  var C = window.CONFIG || {};
  document.title = "Goddess Arcade — Games";

  var brand = document.getElementById("hubBrand");
  if (brand) brand.textContent = "Goddess Arcade";

  var handleEl = document.getElementById("hubHandle");
  if (handleEl) {
    var handle = String(C.handle || "@goddessoftaurus").trim() || "@goddessoftaurus";
    handleEl.textContent = handle;
  }

  var back = document.querySelector("a.back:not(.back-games)");
  if (back) {
    back.href = C.backLinkUrl || "https://linktr.ee/crystal98xo";
    back.removeAttribute("target");
  }

  var code = "";
  var signedOut = "";
  try {
    var params = new URLSearchParams(location.search || "");
    code = params.get("code") || "";
    signedOut = (params.get("signedout") || "").trim();
  } catch (e) {}
  var note = document.getElementById("hubNote");
  if (note && signedOut) {
    var saved = signedOut === "1" ? "your play code" : signedOut.toUpperCase();
    note.textContent = "Save your code " + saved + " to get back in";
    note.classList.remove("hide");
    try {
      var u = new URL(location.href);
      u.searchParams.delete("signedout");
      var q = u.searchParams.toString();
      history.replaceState({}, "", u.pathname + (q ? "?" + q : "") + u.hash);
    } catch (e2) {}
  }
  var acct = document.querySelector("a.hub-account");
  if (acct) {
    acct.href = code ? ("/account.html?code=" + encodeURIComponent(code)) : "/account.html";
  }
  function withCode(page) {
    if (!code) return page;
    return page + (page.indexOf("?") >= 0 ? "&" : "?") + "code=" + encodeURIComponent(code);
  }

  function moneyRange(segs) {
    if (!segs || !segs.length) return "";
    var nums = [];
    var hasAll = false;
    for (var i = 0; i < segs.length; i++) {
      var v = segs[i] && segs[i].value;
      if (v === "ALL" || (segs[i] && segs[i].label === "ALL")) hasAll = true;
      else if (typeof v === "number" && isFinite(v)) nums.push(v);
    }
    if (!nums.length) return hasAll ? "ALL" : "";
    var min = Math.min.apply(null, nums);
    var max = Math.max.apply(null, nums);
    return "$" + min + " \u2013 " + (hasAll ? "ALL" : ("$" + max));
  }

  var hum = C.humiliationWheel || {};
  var humPrice = Number(hum.price);
  if (!isFinite(humPrice) || humPrice <= 0) humPrice = 5;
  var range = moneyRange(C.segments);

  var games = [
    {
      href: withCode("game.html"),
      emoji: "\uD83D\uDC16",
      title: C.gameTitle || "Pin the Tail on the Pig",
      blurb: C.tagline || "",
      price: range
    },
    {
      href: withCode("wheel.html"),
      emoji: "\uD83C\uDFA1",
      title: C.wheelTitle || "Wheel of Financial Torture",
      blurb: C.wheelTagline || "",
      price: range
    },
    {
      href: withCode("humiliation.html"),
      emoji: "\uD83D\uDE08",
      title: hum.title || "Wheel of Humiliation",
      blurb: hum.tagline || "",
      price: "$" + humPrice + " a spin"
    },
    (function () {
      var tr = C.toeRoulette || {};
      var vals = (tr.toes || []).map(function (t) { return Number(t.value) || 0; }).filter(function (v) { return v > 0; });
      var lo = vals.length ? Math.min.apply(null, vals) : 5, hi = vals.length ? Math.max.apply(null, vals) : 50;
      return {
        href: withCode("toe.html"),
        emoji: "\uD83E\uDDB6",
        title: tr.title || "Pick-a-Toe Roulette",
        blurb: tr.hubBlurb || "Call your lucky toe. The lights chase across her toes, and whichever one they stop on decides what you owe.",
        price: "$" + lo + " \u2013 $" + hi
      };
    })()
  ];
  var M = C.merch || {};
  if (M.url) games.push({
    href: M.url,
    external: true,
    emoji: "\uD83D\uDC51",
    title: M.title || "Shop Mari's Merch \uD83D\uDC51",
    blurb: M.tagline || "",
    note: M.note || "",
    price: "Opens her shop"
  });

  var box = document.getElementById("hubCards");
  if (!box) return;
  box.innerHTML = games.map(function (g) {
    var price = g.price
      ? '<span class="hub-price">' + escapeHtml(g.price) + "</span>"
      : "";
    var blurb = g.blurb
      ? '<small class="hub-blurb">' + escapeHtml(g.blurb) + "</small>"
      : "";
    var note = g.note ? '<small class="hub-soon">' + escapeHtml(g.note) + "</small>" : "";
    var ext = g.external ? ' target="_blank" rel="noopener"' : "";
    return '<a class="hub-card' + (g.external ? " hub-merch-card" : "") + '" href="' + escapeHtml(g.href) + '"' + ext + '>' +
      '<span class="hub-emoji" aria-hidden="true">' + g.emoji + "</span>" +
      '<span class="hub-copy"><b>' + escapeHtml(g.title) + "</b>" + blurb + note + price + "</span>" +
      "</a>";
  }).join("");

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
