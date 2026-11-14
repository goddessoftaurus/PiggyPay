/* PayPiggy embed — drop this on any page:

   Poster game:
   <div id="paypiggy" data-src="https://YOUR-HOST/widget/widget.html"></div>
   <script src="https://YOUR-HOST/widget/embed.js"></script>

   Wheel of Financial Torture:
   <div id="paypiggy-wheel" data-src="https://YOUR-HOST/widget/wheel.html"></div>
   <script src="https://YOUR-HOST/widget/embed.js"></script>

   The script injects an auto-height iframe. If data-src is omitted, it
   loads widget.html (or wheel.html for #paypiggy-wheel) next to this script.
*/
(function () {
  function defaultSrc(el, script) {
    var src = el.getAttribute("data-src");
    if (src) return src;
    if (!script || !script.src) return "";
    var file = (el.id === "paypiggy-wheel" || el.getAttribute("data-game") === "wheel") ? "wheel.html" : "widget.html";
    return script.src.replace(/embed\.js(?:\?.*)?$/i, file);
  }

  function mount(el, script) {
    var src = defaultSrc(el, script);
    if (!src) return;
    var iframe = document.createElement("iframe");
    iframe.src = src;
    var isWheel = el.id === "paypiggy-wheel" || el.getAttribute("data-game") === "wheel" || /wheel\.html/i.test(src);
    iframe.title = isWheel ? "PayPiggy — Wheel of Financial Torture" : "PayPiggy — Pin the Tail on the Pig";
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
  document.querySelectorAll("#paypiggy, #paypiggy-wheel, [data-paypiggy]").forEach(function (el) {
    mount(el, script);
  });
})();
