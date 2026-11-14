/* PayPiggy embed — drop this on any page:

   Poster game:
   <div id="paypiggy" data-src="https://YOUR-HOST/widget/widget.html"></div>
   <script src="https://YOUR-HOST/widget/embed.js"></script>

   Wheel of Financial Torture:
   <div id="paypiggy-wheel" data-src="https://YOUR-HOST/widget/wheel.html"></div>
   <script src="https://YOUR-HOST/widget/embed.js"></script>

   Wheel of Humiliation:
   <div id="paypiggy-humiliation" data-src="https://YOUR-HOST/widget/humiliation.html"></div>
   <script src="https://YOUR-HOST/widget/embed.js"></script>

   The script injects an auto-height iframe. If data-src is omitted, it
   loads widget.html (or the matching wheel file) next to this script.
*/
(function () {
  function defaultSrc(el, script) {
    var src = el.getAttribute("data-src");
    if (src) return src;
    if (!script || !script.src) return "";
    var game = el.getAttribute("data-game") || "";
    var file = "widget.html";
    if (el.id === "paypiggy-humiliation" || game === "humiliation") file = "humiliation.html";
    else if (el.id === "paypiggy-wheel" || game === "wheel") file = "wheel.html";
    return script.src.replace(/embed\.js(?:\?.*)?$/i, file);
  }

  function mount(el, script) {
    var src = defaultSrc(el, script);
    if (!src) return;
    var iframe = document.createElement("iframe");
    iframe.src = src;
    var game = el.getAttribute("data-game") || "";
    var isHum = el.id === "paypiggy-humiliation" || game === "humiliation" || /humiliation\.html/i.test(src);
    var isWheel = el.id === "paypiggy-wheel" || game === "wheel" || /wheel\.html/i.test(src);
    iframe.title = isHum ? "PayPiggy — Wheel of Humiliation" : isWheel ? "PayPiggy — Wheel of Financial Torture" : "PayPiggy — Pin the Tail on the Pig";
    iframe.setAttribute("allow", "autoplay");
    iframe.setAttribute("loading", "lazy");
    iframe.style.cssText = "width:100%;border:0;display:block;min-height:680px;background:transparent;";
    window.addEventListener("message", function (e) {
      var d = e.data;
      if (!d || d.type !== "paypiggy-resize") return;
      var h = parseInt(d.height, 10);
      if (h > 80) iframe.style.height = h + "px";
    });
    el.appendChild(iframe);
  }

  var script = document.currentScript;
  if (!script) {
    var list = document.querySelectorAll("script[src]");
    script = list[list.length - 1];
  }
  document.querySelectorAll("#paypiggy, #paypiggy-wheel, #paypiggy-humiliation, [data-paypiggy]").forEach(function (el) {
    mount(el, script);
  });
})();
