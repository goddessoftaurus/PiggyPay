/* PayPiggy Pin the Tail zones. Used by game.js (browser) and the server / tests (Node).
   Low amounts land on the bullseye; high amounts and ALL are misses. */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.PayPiggyPin = factory();
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var ZONE_BANNERS = {
    bullseye: "BULLSEYE!",
    inner: "Close\u2026",
    mid: "Close\u2026",
    outer: "Close\u2026",
    miss: "Missed! Pay more"
  };

  /* Default odds: a bullseye is a lucky, cheaper hit, so it stays fairly rare. */
  var ZONE_WEIGHTS = {
    bullseye: 5,
    inner: 11,
    mid: 16,
    outer: 20,
    miss: 16
  };

  /* Bullseye geometry in percent of the 3:4 poster. Measured from pig.png
     placed at left:11% width:77% bottom:11.5%. */
  var TARGET = {
    cx: 69.6,
    cy: 58.9,
    rx: 11.55,
    ry: 8.66,
    rings: {
      bullseye: [0, 0.28],
      inner: [0.28, 0.55],
      mid: [0.55, 0.80],
      outer: [0.80, 1.0],
      miss: [1.08, 1.45]
    }
  };

  /* Clear misses that still land on the pig, off the painted target. */
  var MISS_BLOBS = [
    { x: 54, y: 58, rx: 5, ry: 6 },
    { x: 58, y: 66, rx: 5, ry: 4 },
    { x: 72, y: 74, rx: 6, ry: 3.5 },
    { x: 80, y: 52, rx: 3.5, ry: 4 },
    { x: 64, y: 48, rx: 4, ry: 3 }
  ];

  function amountKey(seg) {
    if (!seg) return 0;
    if (seg.value === "ALL" || seg.label === "ALL") return Infinity;
    var n = Number(seg.value);
    return isFinite(n) ? n : 0;
  }

  function assignZones(n) {
    var zones = new Array(n);
    if (n <= 0) return zones;
    zones[0] = "bullseye";
    if (n === 1) return zones;
    zones[n - 1] = "miss";
    if (n === 2) return zones;
    var missExtra = n >= 8 ? 1 : 0;
    if (missExtra) zones[n - 2] = "miss";
    var start = 1;
    var end = n - 2 - missExtra;
    var fill = end - start + 1;
    var rings = ["inner", "mid", "outer"];
    var i, ringIdx;
    if (fill === 1) {
      zones[start] = "mid";
    } else {
      for (i = 0; i < fill; i++) {
        ringIdx = Math.min(rings.length - 1, Math.floor(i / fill * rings.length));
        zones[start + i] = rings[ringIdx];
      }
    }
    return zones;
  }

  function buildPinTiers(config) {
    var raw = (config && config.segments && config.segments.length)
      ? config.segments.slice()
      : [
          { label: "$5", value: 5 },
          { label: "$10", value: 10 },
          { label: "$20", value: 20 },
          { label: "$25", value: 25 },
          { label: "$50", value: 50 },
          { label: "$69", value: 69 },
          { label: "$100", value: 100 },
          { label: "$200", value: 200 },
          { label: "ALL", value: "ALL" }
        ];
    var sorted = raw.map(function (s, i) { return { seg: s, orig: i }; });
    sorted.sort(function (a, b) {
      var da = amountKey(a.seg) - amountKey(b.seg);
      if (da !== 0) return da;
      return a.orig - b.orig;
    });
    var auto = assignZones(sorted.length);
    return sorted.map(function (item, i) {
      var s = item.seg;
      var zone = s.pinZone || s.zone || auto[i];
      if (!ZONE_BANNERS[zone]) zone = auto[i];
      var weight = Number(s.pinWeight);
      if (!isFinite(weight) || weight <= 0) weight = ZONE_WEIGHTS[zone] || 10;
      return {
        label: s.label,
        value: s.value,
        weight: weight,
        pinWeight: weight,
        zone: zone,
        zoneLabel: s.zoneLabel || s.pinBanner || ZONE_BANNERS[zone]
      };
    });
  }

  function rand(rng) { return (rng || Math.random)(); }

  function pointInEllipse(cx, cy, rx, ry, r0, r1, rng) {
    var t = rand(rng) * Math.PI * 2;
    var u0 = r0 * r0, u1 = r1 * r1;
    var r = Math.sqrt(rand(rng) * (u1 - u0) + u0);
    return { x: cx + Math.cos(t) * r * rx, y: cy + Math.sin(t) * r * ry };
  }

  function pointInZone(zone, rng) {
    var z = zone || "mid";
    if (z === "miss" && rand(rng) < 0.45) {
      var blob = MISS_BLOBS[Math.floor(rand(rng) * MISS_BLOBS.length)];
      return pointInEllipse(blob.x, blob.y, blob.rx, blob.ry, 0, 1, rng);
    }
    var ring = TARGET.rings[z] || TARGET.rings.mid;
    return pointInEllipse(TARGET.cx, TARGET.cy, TARGET.rx, TARGET.ry, ring[0], ring[1], rng);
  }

  return {
    ZONE_BANNERS: ZONE_BANNERS,
    ZONE_WEIGHTS: ZONE_WEIGHTS,
    TARGET: TARGET,
    amountKey: amountKey,
    assignZones: assignZones,
    buildPinTiers: buildPinTiers,
    pointInZone: pointInZone
  };
});
