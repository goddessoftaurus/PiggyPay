"use strict";

/*
 * Goddess Arcade rewards: pure milestone logic (no storage, no Express).
 *
 * Progress lives on each player as p.rewards:
 *   { bullseyes, misses, missStreak, spins: { poster, wheel, humiliation },
 *     lastHum, spent (cents of confirmed gifts), level, counts: { ruleId: n } }
 * Unlocked rewards become "claims" in db.rewardClaims, which Goddess marks
 * sent / denied on /admin. Nothing is ever sent automatically.
 */

const crypto = require("crypto");

const GAMES = ["poster", "wheel", "humiliation"];
const RULE_TYPES = ["count", "every", "streak", "double"];

function num(n, d) {
  const x = Number(n);
  return isFinite(x) ? x : d;
}

/* Clean up CONFIG.rewards so the rest of the code can trust its shape. */
function normalizeConfig(raw) {
  const r = raw || {};
  const games = {};
  for (const g of GAMES) {
    const src = (r.games && r.games[g]) || {};
    const rules = (Array.isArray(src.rules) ? src.rules : [])
      .filter((x) => x && x.id && RULE_TYPES.includes(x.type))
      .map((x) => ({
        id: String(x.id),
        type: x.type,
        stat: String(x.stat || (x.type === "streak" ? "missStreak" : "spins")),
        at: Math.max(1, Math.round(num(x.at, 1))),
        emoji: String(x.emoji || "🎁"),
        title: String(x.title || "Reward"),
        desc: String(x.desc || ""),
        badge: !!x.badge,
        penalty: !!x.penalty,
        nickname: !!x.nickname,
        repeat: x.type !== "count"
      }));
    games[g] = { key: g, title: String(src.title || g), emoji: String(src.emoji || "🎮"), href: String(src.href || ""), rules };
  }
  const levels = (Array.isArray(r.levels) && r.levels.length ? r.levels : [{ name: "Piglet", min: 0, perks: [] }])
    .map((l) => ({
      name: String(l.name || "Level"),
      min: Math.max(0, num(l.min, 0)),
      minCents: Math.max(0, Math.round(num(l.min, 0) * 100)),
      emoji: String(l.emoji || "🐷"),
      perks: Array.isArray(l.perks) ? l.perks.map(String) : []
    }))
    .sort((a, b) => a.minCents - b.minCents);
  const lb = r.leaderboard || {};
  return {
    games,
    levels,
    leaderboard: {
      size: Math.max(1, Math.round(num(lb.size, 3))),
      title: String(lb.title || "This week's top piggies"),
      prize: String(lb.prize || "")
    }
  };
}

function findRule(cfg, ruleId) {
  for (const g of GAMES) {
    const rule = cfg.games[g].rules.find((x) => x.id === ruleId);
    if (rule) return { game: g, rule };
  }
  return null;
}

function emptyProgress() {
  return {
    bullseyes: 0,
    misses: 0,
    missStreak: 0,
    spins: { poster: 0, wheel: 0, humiliation: 0 },
    lastHum: null,
    spent: 0,
    level: 0,
    counts: {}
  };
}

/* Make sure p.rewards exists. Existing players start their game counters at
   zero (rewards begin at launch) but keep credit for gifts already confirmed. */
function ensureProgress(p, cfg) {
  if (!p.rewards || typeof p.rewards !== "object") {
    const prog = emptyProgress();
    prog.spent = (p.loads || [])
      .filter((l) => l.status === "approved")
      .reduce((a, l) => a + Math.max(0, Number(l.amount) || 0), 0);
    if (cfg) prog.level = levelIndex(cfg, prog.spent);
    p.rewards = prog;
  }
  const r = p.rewards;
  const base = emptyProgress();
  for (const k of Object.keys(base)) if (r[k] == null) r[k] = base[k];
  r.spins = Object.assign({ poster: 0, wheel: 0, humiliation: 0 }, r.spins || {});
  r.counts = r.counts && typeof r.counts === "object" ? r.counts : {};
  return r;
}

function statValue(prog, game, stat) {
  if (stat === "spins" || stat === "plays") return prog.spins[game] || 0;
  return num(prog[stat], 0);
}

function gameOf(result) {
  const g = result && result.game;
  return GAMES.includes(g) ? g : "poster";
}

/*
 * Update progress for one recorded play and return the rules it unlocked.
 * result: { game, zone?, label?, index? } as produced by the server play flow.
 */
function applyPlay(prog, result, cfg) {
  const game = gameOf(result);
  prog.spins[game] = (prog.spins[game] || 0) + 1;
  let doubleHit = false;
  if (game === "poster") {
    if (result.zone === "bullseye") { prog.bullseyes += 1; prog.missStreak = 0; }
    else if (result.zone === "miss") { prog.misses += 1; prog.missStreak += 1; }
    else prog.missStreak = 0;
  } else if (game === "humiliation") {
    const key = result.index != null ? "i" + result.index : "l" + String(result.label || "");
    doubleHit = prog.lastHum != null && prog.lastHum === key;
    // A pair is used up once it pays out, so three in a row is one Double Shame.
    prog.lastHum = doubleHit ? null : key;
  }

  const unlocked = [];
  for (const rule of cfg.games[game].rules) {
    const v = statValue(prog, game, rule.stat);
    const times = prog.counts[rule.id] || 0;
    let hit = false;
    if (rule.type === "count") hit = times === 0 && v >= rule.at;
    else if (rule.type === "every") hit = v > 0 && v % rule.at === 0;
    else if (rule.type === "streak") hit = v >= rule.at;
    else if (rule.type === "double") hit = doubleHit;
    if (!hit) continue;
    if (rule.type === "streak") prog[rule.stat] = 0;
    prog.counts[rule.id] = times + 1;
    unlocked.push({ game, rule });
  }
  return unlocked;
}

function levelIndex(cfg, spentCents) {
  let idx = 0;
  cfg.levels.forEach((l, i) => { if (spentCents >= l.minCents) idx = i; });
  return idx;
}

/* Record confirmed money. Returns the levels newly reached (above the first). */
function applySpend(prog, amountCents, cfg) {
  const amt = Math.max(0, Math.round(Number(amountCents) || 0));
  prog.spent = (prog.spent || 0) + amt;
  const before = Math.max(0, Math.round(num(prog.level, 0)));
  const after = levelIndex(cfg, prog.spent);
  const reached = [];
  for (let i = before + 1; i <= after; i++) reached.push(cfg.levels[i]);
  prog.level = Math.max(before, after);
  return reached;
}

function levelInfo(cfg, spentCents) {
  const i = levelIndex(cfg, spentCents);
  const cur = cfg.levels[i];
  const next = cfg.levels[i + 1] || null;
  return {
    index: i,
    name: cur.name,
    emoji: cur.emoji,
    perks: cur.perks,
    spent: spentCents,
    next: next ? { name: next.name, emoji: next.emoji, minCents: next.minCents, toGo: Math.max(0, next.minCents - spentCents) } : null
  };
}

/* What the player sees for each rule: progress like "Bullseyes 2/3". */
function statLabel(rule) {
  if (rule.stat === "bullseyes") return "Bullseyes";
  if (rule.stat === "missStreak") return "Misses in a row";
  return "Spins";
}

function ruleView(rule, prog, game) {
  const v = prog ? statValue(prog, game, rule.stat) : 0;
  const times = prog ? (prog.counts[rule.id] || 0) : 0;
  const out = {
    id: rule.id,
    type: rule.type,
    emoji: rule.emoji,
    title: rule.title,
    desc: rule.desc,
    badge: rule.badge,
    penalty: rule.penalty,
    repeat: rule.repeat,
    at: rule.at,
    statLabel: statLabel(rule)
  };
  if (!prog) return out;
  out.times = times;
  if (rule.type === "count") {
    out.current = Math.min(v, rule.at);
    out.unlocked = times > 0;
  } else if (rule.type === "every") {
    out.current = v % rule.at;
    if (v > 0 && out.current === 0 && times > 0) out.current = rule.at;
    out.unlocked = times > 0;
  } else if (rule.type === "streak") {
    out.current = Math.min(v, rule.at);
    out.unlocked = times > 0;
  } else {
    out.current = prog.lastHum != null ? 1 : 0;
    out.unlocked = times > 0;
  }
  return out;
}

function claimView(c) {
  return {
    id: c.id,
    game: c.game,
    ruleId: c.ruleId,
    emoji: c.emoji,
    title: c.title,
    desc: c.desc,
    kind: c.kind,
    penalty: !!c.penalty,
    status: c.status,
    test: !!c.test,
    ts: c.ts,
    resolvedAt: c.resolvedAt || null
  };
}

function makeClaim(p, entry, ts) {
  const rule = entry.rule || {};
  const isLevel = entry.kind === "level";
  return {
    id: "rw-" + crypto.randomBytes(6).toString("hex"),
    playerId: p.id,
    code: p.code,
    game: entry.game || "all",
    ruleId: isLevel ? "level-" + entry.level.name : rule.id,
    kind: isLevel ? "level" : (rule.badge ? "badge" : (rule.penalty ? "penalty" : "reward")),
    emoji: isLevel ? entry.level.emoji : rule.emoji,
    title: isLevel ? "Reached " + entry.level.name : rule.title,
    desc: isLevel ? (entry.level.perks.length ? "Perks: " + entry.level.perks.join(", ") : "") : rule.desc,
    penalty: !isLevel && !!rule.penalty,
    nickname: !isLevel && !!rule.nickname,
    test: !!p.test,
    // Badges are just shown on the account, so there is nothing to send.
    status: !isLevel && rule.badge ? "earned" : "pending",
    ts: ts || Date.now()
  };
}

/* Public display name for the leaderboard. Never the play code (it logs in). */
function publicName(p) {
  if (p.nickname) return String(p.nickname);
  const h = crypto.createHash("sha256").update("goddess-arcade:" + p.id).digest("hex").slice(0, 4).toUpperCase();
  return "Piggy #" + h;
}

/* Monday 00:00 in New York, as a UTC ms timestamp. */
function weekStartNY(now) {
  const d = new Date(now);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short", hourCycle: "h23"
  }).formatToParts(d);
  const v = (t) => parts.find((x) => x.type === t).value;
  const asUTC = Date.UTC(+v("year"), +v("month") - 1, +v("day"), +v("hour"), +v("minute"), +v("second"));
  const offset = asUTC - d.getTime();
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(v("weekday"));
  return Date.UTC(+v("year"), +v("month") - 1, +v("day") - Math.max(0, dow)) - offset;
}

function leaderboard(players, size, now) {
  const from = weekStartNY(now || Date.now());
  return players
    .filter((p) => !p.test)
    .map((p) => ({
      p,
      amount: (p.loads || [])
        .filter((l) => l.status === "approved" && (l.ts || 0) >= from)
        .reduce((a, l) => a + Math.max(0, Number(l.amount) || 0), 0)
    }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, size)
    .map((x, i) => ({ rank: i + 1, id: x.p.id, code: x.p.code, name: publicName(x.p), amount: x.amount }));
}

module.exports = {
  GAMES,
  normalizeConfig,
  findRule,
  emptyProgress,
  ensureProgress,
  applyPlay,
  applySpend,
  levelIndex,
  levelInfo,
  ruleView,
  claimView,
  makeClaim,
  publicName,
  weekStartNY,
  leaderboard
};
