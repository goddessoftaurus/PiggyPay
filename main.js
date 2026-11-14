(function () {
  "use strict";
  var C = window.CONFIG || {};
  var SITE = window.SITE_NAME || C.siteName || "PayPiggy";

  document.title = C.displayName ? (C.displayName + " " + (C.handle || "")).trim() : SITE;
  var desc = document.querySelector('meta[name="description"]');
  if (desc && C.bio) desc.setAttribute("content", C.bio);

  var ICONS = {
    throne: '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="f"><path d="M11.4 3.9Q11.98 3 12.56 3.9L16.2 10.9Q16.6 11.8 15.9 12.5L12.5 16.3Q11.98 16.9 11.46 16.3L8.06 12.5Q7.36 11.8 7.76 10.9Z"/><path d="M1.35 9.75Q1.25 8.8 2.05 9.3L12 19Q12.35 19.55 11.8 19.75Q8.5 19.8 6.4 20.6Q4.7 21 4.25 19.4Z"/><path d="M22.65 9.75Q22.75 8.8 21.95 9.3L13.3 17.75Q12.95 18.2 13.4 18.55Q14.3 19.3 14.9 20Q16.6 20.2 17.9 20.75Q19.2 20.9 19.75 19.4Z"/></g></svg>',
    youpay: '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="f" transform="translate(1.2 4.4) scale(1.1)"><path d="M8.22 8.674V.5H0s5.51 4.754 6.452 12.778c0 0 1.767-1.105 1.767-4.604Z"/><path d="M13.219.5h-.334v6.324a6.461 6.461 0 0 1-6.432 6.454l6.766-.009a6.385 6.385 0 1 0 0-12.77Z"/></g></svg>',
    cashapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="f" transform="translate(1.6 1.6) scale(.8667)"><path d="M23.59 3.475a5.1 5.1 0 00-3.05-3.05c-1.31-.42-2.5-.42-4.92-.42H8.36c-2.4 0-3.61 0-4.9.4a5.1 5.1 0 00-3.05 3.06C0 4.765 0 5.965 0 8.365v7.27c0 2.41 0 3.6.4 4.9a5.1 5.1 0 003.05 3.05c1.3.41 2.5.41 4.9.41h7.28c2.41 0 3.61 0 4.9-.4a5.1 5.1 0 003.06-3.06c.41-1.3.41-2.5.41-4.9v-7.25c0-2.41 0-3.61-.41-4.91zm-6.17 4.63l-.93.93a.5.5 0 01-.67.01 5 5 0 00-3.22-1.18c-.97 0-1.94.32-1.94 1.21 0 .9 1.04 1.2 2.24 1.65 2.1.7 3.84 1.58 3.84 3.64 0 2.24-1.74 3.78-4.58 3.95l-.26 1.2a.49.49 0 01-.48.39H9.63l-.09-.01a.5.5 0 01-.38-.59l.28-1.27a6.54 6.54 0 01-2.88-1.57v-.01a.48.48 0 010-.68l1-.97a.49.49 0 01.67 0c.91.86 2.13 1.34 3.39 1.32 1.3 0 2.17-.55 2.17-1.42 0-.87-.88-1.1-2.54-1.72-1.76-.63-3.43-1.52-3.43-3.6 0-2.42 2.01-3.6 4.39-3.71l.25-1.23a.48.48 0 01.48-.38h1.78l.1.01c.26.06.43.31.37.57l-.27 1.37c.9.3 1.75.77 2.48 1.39l.02.02c.19.2.19.5 0 .68z"/></g></svg>',
    loyalfans: '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="f"><circle cx="10.3" cy="6" r="2.3"/><path d="M2.3 4.5L10.05 10.9L21.7 2L12.1 14.5L11.65 22H8.7L8.2 14.5Z"/></g></svg>',
    wheel: '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="f"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="#fff5f7"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6M6.2 6.2l4.2 4.2M13.6 13.6l4.2 4.2M6.2 17.8l4.2-4.2M13.6 10.4l4.2-4.2" fill="none" stroke="#fff5f7" stroke-width="1.4" stroke-linecap="round"/></g></svg>',
    pig: '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="f"><ellipse cx="12" cy="13.5" rx="7.2" ry="5.6"/><circle cx="7.2" cy="9.2" r="2.1"/><circle cx="16.8" cy="9.2" r="2.1"/><ellipse cx="12" cy="15.2" rx="3.1" ry="2.1"/><circle cx="10.9" cy="15" r=".45" fill="#3a2433"/><circle cx="13.1" cy="15" r=".45" fill="#3a2433"/><circle cx="9.6" cy="12.1" r=".7"/><circle cx="14.4" cy="12.1" r=".7"/></g></svg>',
    btc: '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="f" transform="translate(1.6 1.6) scale(.8667)"><path d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548v-.002zm-6.35-4.613c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.33-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.975.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93h.01zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.524 2.75 2.084v.006z"/></g></svg>',
    eth: '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="f" transform="translate(1.6 1.6) scale(.8667)"><path d="M11.944 17.97L4.58 13.62 11.943 24l7.37-10.38-7.372 4.35h.003zM12.056 0L4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z"/></g></svg>',
    sol: '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="f" transform="translate(1.6 1.6) scale(.8667)"><path d="m23.8764 18.0313-3.962 4.1393a.9201.9201 0 0 1-.306.2106.9407.9407 0 0 1-.367.0742H.4599a.4689.4689 0 0 1-.2522-.0733.4513.4513 0 0 1-.1696-.1962.4375.4375 0 0 1-.0314-.2545.4438.4438 0 0 1 .117-.2298l3.9649-4.1393a.92.92 0 0 1 .3052-.2102.9407.9407 0 0 1 .3658-.0746H23.54a.4692.4692 0 0 1 .2523.0734.4531.4531 0 0 1 .1697.196.438.438 0 0 1 .0313.2547.4442.4442 0 0 1-.1169.2297zm-3.962-8.3355a.9202.9202 0 0 0-.306-.2106.941.941 0 0 0-.367-.0742H.4599a.4687.4687 0 0 0-.2522.0734.4513.4513 0 0 0-.1696.1961.4376.4376 0 0 0-.0314.2546.444.444 0 0 0 .117.2297l3.9649 4.1394a.9204.9204 0 0 0 .3052.2102c.1154.049.24.0744.3658.0746H23.54a.469.469 0 0 0 .2523-.0734.453.453 0 0 0 .1697-.1961.4382.4382 0 0 0 .0313-.2546.4444.4442 0 0 0-.1169-.2297zM.46 6.7225h18.7815a.9411.9411 0 0 0 .367-.0742.9202.9202 0 0 0 .306-.2106l3.962-4.1394a.4442.4442 0 0 0 .117-.2297.4378.4378 0 0 0-.0314-.2546.453.453 0 0 0-.1697-.196.469.469 0 0 0-.2523-.0734H4.7596a.941.941 0 0 0-.3658.0745.9203.9203 0 0 0-.3052.2102L.1246 5.9687a.4438.4438 0 0 0-.1169.2295.4375.4375 0 0 0 .0312.2544.4512.4512 0 0 0 .1692.196.4689.4689 0 0 0 .2518.0739z"/></g></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="f" transform="translate(1.6 1.6) scale(.8667)"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></g></svg>'
  };

  var PIG_AVATAR = '<svg viewBox="0 0 104 104" width="104" height="104" aria-hidden="true"><defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8fb8"/><stop offset="1" stop-color="#e0115f"/></linearGradient></defs><circle cx="52" cy="52" r="52" fill="url(#pg)"/><ellipse cx="52" cy="58" rx="28" ry="22" fill="#ff4d8d"/><circle cx="32" cy="40" r="10" fill="#e0115f"/><circle cx="72" cy="40" r="10" fill="#e0115f"/><circle cx="34" cy="41" r="6" fill="#ff8fb8"/><circle cx="70" cy="41" r="6" fill="#ff8fb8"/><ellipse cx="52" cy="66" rx="14" ry="10" fill="#ffd0e0"/><circle cx="47" cy="65" r="2.2" fill="#5a2a40"/><circle cx="57" cy="65" r="2.2" fill="#5a2a40"/><circle cx="42" cy="52" r="3.2" fill="#3a2433"/><circle cx="62" cy="52" r="3.2" fill="#3a2433"/><circle cx="43.2" cy="51" r="1.1" fill="#fff"/><circle cx="63.2" cy="51" r="1.1" fill="#fff"/></svg>';

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  // Avatar
  var slot = $("avatarSlot");
  if (C.avatar) {
    var img = el("img", "avatar");
    img.src = C.avatar;
    img.alt = C.displayName || SITE;
    slot.appendChild(img);
  } else {
    var ph = el("div", "avatar-fallback");
    ph.innerHTML = PIG_AVATAR;
    slot.appendChild(ph);
  }

  $("displayName").innerHTML = "<b></b>";
  $("displayName").firstChild.textContent = (C.displayName || "Your Name") + " ♛";
  $("handle").textContent = C.handle || "@yourhandle";
  $("bio").textContent = C.bio || "";
  $("closing").textContent = C.closing || "";

  var chips = $("chips");
  (C.chips || []).forEach(function (c) {
    var s = el("span", "chip" + (c.highlight ? " hl" : ""));
    s.textContent = c.text;
    chips.appendChild(s);
  });

  var links = $("links");
  (C.links || []).forEach(function (L) {
    var a = el("a", "b sides ctr");
    a.href = L.href || "#";
    if (L.type === "game") {
      a.removeAttribute("target");
    } else {
      a.target = "_blank";
      a.rel = "nofollow noopener";
    }
    var icon = ICONS[L.icon] || ICONS.pig;
    a.innerHTML = '<span class="bi">' + icon + '</span><span class="bt"><b></b>' +
      (L.sub ? "<small></small>" : "") + '</span><span class="ba">›</span>';
    a.querySelector("b").textContent = L.label;
    if (L.sub) a.querySelector("small").textContent = L.sub;
    links.appendChild(a);
  });

  var crypto = $("crypto");
  var CRYPTO_ICON = { BTC: "btc", ETH: "eth", SOL: "sol" };
  (C.crypto || []).forEach(function (w) {
    var key = (w.name.match(/\(([^)]+)\)/) || [])[1] || "";
    var icon = ICONS[CRYPTO_ICON[key]] || ICONS.btc;
    var row = el("div", "cp");
    row.innerHTML = '<span class="bi">' + icon + '</span><span class="cpt"><b></b><code></code></span>' +
      '<button type="button" class="cpb">Copy</button>';
    row.querySelector("b").textContent = w.name;
    row.querySelector("code").textContent = w.address;
    var btn = row.querySelector(".cpb");
    btn.addEventListener("click", function () { copy(w.address, btn); });
    crypto.appendChild(row);
  });

  var socials = $("socials");
  (C.socials || []).forEach(function (s) {
    var a = el("a", "ic ic-circle");
    a.href = s.href || "#";
    a.target = "_blank";
    a.rel = "nofollow noopener";
    a.setAttribute("aria-label", s.label || "social");
    a.innerHTML = ICONS[s.icon] || ICONS.x;
    socials.appendChild(a);
  });

  function copy(v, btn) {
    function done() {
      btn.textContent = "Copied ♡";
      clearTimeout(btn._t);
      btn._t = setTimeout(function () { btn.textContent = "Copy"; }, 2200);
    }
    function sel() {
      var c = btn.parentNode.querySelector("code"), r = document.createRange(), s = getSelection();
      r.selectNodeContents(c); s.removeAllRanges(); s.addRange(r);
      btn.textContent = "Hold ↑ to copy";
    }
    function fb() {
      var ok = false, t = document.createElement("textarea");
      t.value = v; t.setAttribute("readonly", "");
      t.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(t); t.select(); t.setSelectionRange(0, v.length);
      try { ok = document.execCommand("copy"); } catch (e) {}
      t.remove();
      if (ok) done(); else sel();
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(v).then(done, fb);
    else fb();
  }

  // Honor #crypto deep links (from the game's Add funds sheet).
  if (location.hash === "#crypto") {
    var target = $("crypto");
    if (target) setTimeout(function () { target.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
  }
})();
