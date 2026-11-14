/* PayPiggy prize-wheel flick math. Used by wheel.js (browser) and server/test.js (Node). */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.PayPiggyFlick = factory();
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var THRESHOLD_DEG_PER_MS = 0.18;
  var MIN_MS = 1800;
  var MAX_MS = 5600;
  var REDUCED_MIN_MS = 500;
  var REDUCED_MAX_MS = 900;

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function normalizeDelta(delta) {
    var d = Number(delta) || 0;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }

  function angleAt(x, y, cx, cy) {
    return Math.atan2(y - cy, x - cx) * 180 / Math.PI;
  }

  function shouldSpin(velocityDegPerMs) {
    return Math.abs(Number(velocityDegPerMs) || 0) >= THRESHOLD_DEG_PER_MS;
  }

  function durationFromVelocity(velocityDegPerMs, reduceMotion) {
    var v = Math.abs(Number(velocityDegPerMs) || 0);
    if (reduceMotion) {
      var tr = clamp((v - THRESHOLD_DEG_PER_MS) / 1.2, 0, 1);
      return Math.round(REDUCED_MIN_MS + tr * (REDUCED_MAX_MS - REDUCED_MIN_MS));
    }
    var t = clamp((v - THRESHOLD_DEG_PER_MS) / 1.0, 0, 1);
    return Math.round(MIN_MS + t * (MAX_MS - MIN_MS));
  }

  function spinCount(durationMs, reduceMotion) {
    if (reduceMotion) return 1;
    var dur = Number(durationMs) || MIN_MS;
    return clamp(Math.round(3 + (dur - MIN_MS) / (MAX_MS - MIN_MS) * 5), 3, 8);
  }

  function targetRotation(currentRot, index, segCount, direction, spins) {
    var n = segCount || 1;
    var slice = 360 / n;
    var mid = (Number(index) || 0) * slice + slice / 2;
    var landing = (360 - mid) % 360;
    var rot = Number(currentRot) || 0;
    var base = rot % 360;
    if (base < 0) base += 360;
    var dir = direction < 0 ? -1 : 1;
    var spinN = Math.max(1, spins || 6);
    var dest = rot - base + landing;
    if (dir >= 0) {
      if (dest < rot) dest += 360;
      dest += spinN * 360;
    } else {
      if (dest > rot) dest -= 360;
      dest -= spinN * 360;
    }
    return dest;
  }

  return {
    THRESHOLD_DEG_PER_MS: THRESHOLD_DEG_PER_MS,
    MIN_MS: MIN_MS,
    MAX_MS: MAX_MS,
    normalizeDelta: normalizeDelta,
    angleAt: angleAt,
    shouldSpin: shouldSpin,
    durationFromVelocity: durationFromVelocity,
    spinCount: spinCount,
    targetRotation: targetRotation
  };
});
