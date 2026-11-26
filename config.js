/* ============================================================
   PayPiggy — easy-to-edit settings
   Change SITE_NAME below to rename the site and game everywhere.
   Fill in the PLACEHOLDERS marked with YOUR_ / Your / @yourhandle.
   ============================================================ */

const SITE_NAME = "PayPiggy";

const CONFIG = {
  /* ----- Profile (link-in-bio page) ----- */
  siteName: SITE_NAME,
  displayName: "God Mari",
  handle: "@goddessoftaurus",
  bio: "your short bio ♡ findom only",
  closing: "make me happy <3",
  avatar: "",

  chips: [
    { text: "$XX dm fee", highlight: false },
    { text: "YOUR CHIP", highlight: true },
    { text: "18+ only", highlight: false }
  ],

  links: [
    { type: "link", label: "Throne",   href: "https://throne.com/goddessoftaurus",   icon: "throne" },
    { type: "link", label: "YouPay",   href: "#YOUR_YOUPAY_URL",   icon: "youpay" },
    { type: "link", label: "CashApp",  href: "#YOUR_CASHAPP_URL",  icon: "cashapp" },
    { type: "link", label: "LoyalFans",href: "#YOUR_LOYALFANS_URL",icon: "loyalfans" },
    { type: "game", label: "Pin the Tail", href: "game.html",  sub: "The poster 🐷",        icon: "pig" },
    { type: "game", label: "Wheel of Financial Torture", href: "wheel.html", sub: "Spin the wheel 🎡",  icon: "wheel" },
    { type: "game", label: "Wheel of Humiliation", href: "humiliation.html", sub: "$5 a spin 😈", icon: "wheel" }
  ],
  socials: [
    { label: "X / Twitter", href: "#YOUR_TWITTER_URL", icon: "x" },
    { label: "Extra social", href: "#YOUR_SOCIAL_URL", icon: "x" }
  ],

  crypto: [
    { name: "Bitcoin (BTC)",  address: "YOUR_BTC_ADDRESS" },
    { name: "Ethereum (ETH)", address: "YOUR_ETH_ADDRESS" },
    { name: "Solana (SOL)",   address: "YOUR_SOL_ADDRESS" }
  ],

  /* ----- Pin the Tail on the Pig ----- */
  gameTitle: "Pin the Tail on the Pig",
  wheelTitle: "Wheel of Financial Torture",
  tagline: "Blindfold on. Hit the bullseye and you send less. Miss, and you send more.",
  wheelTagline: "Spin it. Wherever it stops is what you send.",

  /* Amounts used by Pin the Tail and the money wheel.
     `weight` is the relative chance on the Wheel of Financial Torture.
     Pin the Tail uses `pinZone` + `pinWeight`: low amounts land on the
     bullseye (a lucky, cheaper hit — kept fairly rare), each ring further
     out costs more, and an off-target miss is the highest (including ALL).
     If pinZone / pinWeight are omitted, they are derived automatically
     (lowest amount → bullseye, highest → miss).
     `value: "ALL"` takes whatever is left in the player's pocket. */
  segments: [
    { label: "$5",   value: 5,    weight: 22, pinZone: "bullseye", pinWeight: 5 },
    { label: "$10",  value: 10,   weight: 18, pinZone: "inner",    pinWeight: 10 },
    { label: "$20",  value: 20,   weight: 14, pinZone: "inner",    pinWeight: 11 },
    { label: "$25",  value: 25,   weight: 12, pinZone: "mid",      pinWeight: 14 },
    { label: "$50",  value: 50,   weight: 10, pinZone: "mid",      pinWeight: 16 },
    { label: "$69",  value: 69,   weight: 8,  pinZone: "outer",    pinWeight: 16 },
    { label: "$100", value: 100,  weight: 7,  pinZone: "outer",    pinWeight: 14 },
    { label: "$200", value: 200,  weight: 5,  pinZone: "miss",     pinWeight: 14 },
    { label: "ALL",  value: "ALL", weight: 4, pinZone: "miss",     pinWeight: 8 }
  ],

  allBanner: "You owe ALL 🐷",


  /* ----- Wheel of Humiliation (femdom tasks; $5 a spin, enforced on the server) ----- */
  humiliationWheel: {
    title: "Wheel of Humiliation",
    tagline: "Spin it. Wherever it stops is the task you do.",
    price: 5,
    tasks: [
      { label: "Tape selfie", text: "Tape across your face, then send a selfie" },
      { label: "One finger", text: "Jerk the tip with one finger only for 2 minutes" },
      { label: "Sit on hands", text: "Sit on your hands until they go numb" },
      { label: "Ice water", text: "Balls in ice water for 30 seconds" },
      { label: "Forehead", text: "Write \"PayPiggy\" on your forehead in marker and send a selfie" },
      { label: "Oink 20×", text: "Oink 20 times on camera" },
      { label: "Panties", text: "Wear panties all day under your clothes" },
      { label: "Kneel 10 min", text: "Kneel in the corner for 10 minutes" },
      { label: "Floor meal", text: "Eat your next meal off a plate on the floor with no hands" },
      { label: "Clothespins", text: "Wear a clothespin on each nipple for 5 minutes" }
    ]
  },
  /* ----- Pick-a-Toe Roulette (foot game; the server picks the toe and charges it) -----
     Toes go left to right on the photo: 1 pinky ... 5 big toe.
     value = what that toe costs in dollars, weight = how often it lands (bigger = more often).
     x / y (optional) move a toe's glowing marker, in % of the photo's width / height. */
  toeRoulette: {
    title: "Pick-a-Toe Roulette",
    tagline: "Five toes, five fates. Call your lucky toe, then let the lights decide what you owe.",
    photo: "assets/toe-foot.jpg",
    toes: [
      { toe: "Pinky Toe",  label: "Pedicure Fund",          value: 15, weight: 26, text: "Her pinky picked you. Pay for her next pedicure, piggy." },
      { toe: "Fourth Toe", label: "Kiss the Sole",          value: 10, weight: 26, text: "Tribute, then kiss the screen right on her sole and send her the proof." },
      { toe: "Middle Toe", label: "Worship Tax",            value: 25, weight: 22, text: "Every toe you stare at gets taxed. Pay up." },
      { toe: "Index Toe",  label: "Double Tribute",         value: 50, weight: 16, text: "She wants it twice. Send double, no whining." },
      { toe: "Big Toe",    label: "Goddess's Favorite Toe", value: 5,  weight: 10, text: "Her favorite toe likes you. Small tribute, and you unlock a bonus foot pic." }
    ]
  },
  /* ----- Rewards (easy to edit) -----
     Each game has a list of rewards. Rule types:
       count  — unlocks once when `stat` reaches `at` (e.g. 3 bullseyes)
       every  — unlocks every `at` plays (e.g. every 10th spin), repeats
       streak — unlocks when `stat` hits `at` in a row (e.g. 3 misses), repeats
       double — Wheel of Humiliation lands on the same task twice in a row, repeats
       land   — Pick-a-Toe lands on toe number `at` (1 pinky ... 5 big toe), repeats
     Stats: "bullseyes", "missStreak", "spins" (paid plays of that game),
       "luckyCalls" (Pick-a-Toe: called the right toe before spinning).
     `badge: true` shows a badge on the player's account right away (nothing to send).
     `penalty: true` marks it as a punishment instead of a prize.
     `nickname: true` lets you type a nickname when you mark it sent.
     Every other reward goes to the Rewards queue on /admin. Nothing is sent automatically.
     Change `id` only for a brand-new reward (old unlocks are tracked by id). */
  rewards: {
    games: {
      poster: {
        title: "Pin the Tail on the Pig",
        emoji: "🐷",
        href: "game.html",
        rules: [
          { id: "pin-bull-1",  type: "count",  stat: "bullseyes",  at: 1,  emoji: "🎯", title: "\u201cAccurate Piggy\u201d badge", desc: "A badge on your account to show off your aim.", badge: true },
          { id: "pin-bull-3",  type: "count",  stat: "bullseyes",  at: 3,  emoji: "📸", title: "Custom photo", desc: "A custom photo from Goddess, just for you." },
          { id: "pin-bull-5",  type: "count",  stat: "bullseyes",  at: 5,  emoji: "🎙️", title: "Personal voice note", desc: "Hear Goddess say your name." },
          { id: "pin-bull-10", type: "count",  stat: "bullseyes",  at: 10, emoji: "🎬", title: "Short custom video", desc: "A short video made just for you." },
          { id: "pin-clumsy",  type: "streak", stat: "missStreak", at: 3,  emoji: "🤡", title: "\u201cClumsy Piggy\u201d penalty", desc: "Clumsy piggies owe an extra tribute or a humiliation task.", penalty: true }
        ]
      },
      wheel: {
        title: "Wheel of Financial Torture",
        emoji: "🎡",
        href: "wheel.html",
        rules: [
          { id: "wheel-5",     type: "count", stat: "spins", at: 5,  emoji: "📸", title: "Custom photo", desc: "A custom photo from Goddess." },
          { id: "wheel-10",    type: "count", stat: "spins", at: 10, emoji: "🎬", title: "5-minute custom video", desc: "Five minutes of Goddess, made for you." },
          { id: "wheel-25",    type: "count", stat: "spins", at: 25, emoji: "💬", title: "10 minutes of chat access", desc: "Ten minutes of chat with Goddess." },
          { id: "wheel-50",    type: "count", stat: "spins", at: 50, emoji: "👑", title: "Longer custom video or Hall of Shame shoutout", desc: "A longer video, or your name in the Hall of Shame." },
          { id: "wheel-bonus", type: "every", stat: "spins", at: 10, emoji: "🎁", title: "Bonus spin", desc: "Goddess picks a free task or tease for you." }
        ]
      },
      humiliation: {
        title: "Wheel of Humiliation",
        emoji: "😈",
        href: "humiliation.html",
        rules: [
          { id: "hum-5",      type: "count",  stat: "spins", at: 5,  emoji: "📝", title: "Personalized humiliation task", desc: "A task Goddess writes just for you." },
          { id: "hum-10",     type: "count",  stat: "spins", at: 10, emoji: "🏷️", title: "Degrading custom nickname", desc: "A nickname from Goddess, shown on your account.", nickname: true },
          { id: "hum-20",     type: "count",  stat: "spins", at: 20, emoji: "🎬", title: "Custom humiliation clip", desc: "A humiliation clip made just for you." },
          { id: "hum-double", type: "double", stat: "spins", at: 2,  emoji: "🔁", title: "\u201cDouble Shame\u201d", desc: "You owe the task double, and you unlock a bonus reward." }
        ]
      },
      toe: {
        title: "Pick-a-Toe Roulette",
        emoji: "🦶",
        href: "toe.html",
        rules: [
          { id: "toe-big",     type: "land",  stat: "spins",      at: 5,  emoji: "👣", title: "Bonus foot pic", desc: "Her favorite toe picked you: a bonus foot pic from Goddess." },
          { id: "toe-5",       type: "count", stat: "spins",      at: 5,  emoji: "💋", title: "Personal foot-worship task", desc: "A sole-kissing task Goddess writes just for you." },
          { id: "toe-lucky-3", type: "count", stat: "luckyCalls", at: 3,  emoji: "🎯", title: "Custom foot pic", desc: "Goddess poses a custom foot pic just for you." },
          { id: "toe-10",      type: "count", stat: "spins",      at: 10, emoji: "🎬", title: "Short foot-worship clip", desc: "A short foot clip made just for you." }
        ]
      }
    },
    /* Piggy Levels across all games, by total gifts she confirmed (dollars).
       `popup` is the full-screen pop-up each player sees once for their level
       (only the highest if they jump several). In `subline`, {toGo} becomes the
       dollars still needed and {next} the next level's name.
       `style`: "plain" | "silver" | "gold" | "platinum" | "royal".
       Keep each popup `id` the same so players don't see it twice. */
    levels: [
      { name: "Pathetic Piglet", min: 0,    emoji: "🐽", perks: ["Welcome to the pen"],
        popup: { id: "level-piglet",   style: "plain",    title: "You're a Pathetic Piglet", subline: "Pay {toGo} to become a {next}\u2026 keep playing, piggy", button: "Start paying, piglet" } },
      { name: "Basic Paypig", min: 100,  emoji: "🐷", perks: ["Priority replies"],
        popup: { id: "level-basic",    style: "plain",    title: "You're a Basic Paypig", subline: "Just basic. Pay {toGo} more to become a {next}\u2026", button: "Keep paying, piggy" } },
      { name: "Silver Pig",   min: 200,  emoji: "🥈", perks: ["Priority replies", "5% off game spins (applied by Goddess)"],
        popup: { id: "level-silver",   style: "silver",   title: "You're a Silver Pig", subline: "Shiny, but not gold. Pay {toGo} more to become a {next}\u2026", button: "Keep paying, piggy" } },
      { name: "Golden Pig",   min: 500,  emoji: "🌟", perks: ["Priority replies", "10% off game spins (applied by Goddess)"],
        popup: { id: "paypig-500",     style: "gold",     title: "You're THE Paypig", subline: "Can you become the ROYAL HOG?", button: "Keep paying, piggy" } },
      { name: "Platinum Pig", min: 1000, emoji: "💎", perks: ["Priority replies", "15% off game spins (applied by Goddess)", "Bonus photo"],
        popup: { id: "level-platinum", style: "platinum", title: "You're a Platinum Pig", subline: "So close to the crown. Pay {toGo} more to become the {next}\u2026", button: "Keep paying, piggy" } },
      { name: "Royal Hog",    min: 1500, emoji: "👑", perks: ["Priority replies", "20% off game spins (applied by Goddess)", "Monthly photo set", "Exclusive Royal Hog merch drop (sent by Goddess)"],
        popup: { id: "level-royal",    style: "royal",    title: "You're the ROYAL HOG", subline: "The top of the pen. Now keep your crown, piggy.", button: "Long live the Hog" } }
    ],
    leaderboard: {
      size: 3,
      title: "This week's top piggies",
      prize: "#1 gets a shoutout on Goddess's X"
    }
  },

  /* "Back to links" on the game pages. Opens in the same tab. */
  backLinkUrl: "https://linktr.ee/crystal98xo",

  /* Combined games homepage. Game pages on other hosts (like wheeloftorture)
     send "Back to games" here so everything funnels to one hub. */
  gamesHubUrl: "https://goddessarcade.onrender.com/games.html",
  /* "Shop Mari's Merch" button and hub card (opens in a new tab). */
  merch: {
    url: "https://goddess-arcade.printify.me",
    label: "Shop Mari's Merch",
    title: "Shop Mari's Merch \ud83d\udc51",
    tagline: "Collars, sub essentials and Goddess-approved goodies.",
    note: "More coming soon: collars and more."
  },

  /* Pay up opens an in-page sheet with Throne + card options, pre-filled
     with the amount owed. PAYMENT_URL is unused (kept for compatibility). */
  PAYMENT_URL: "",

  /* Wishlist / gift links used on the Add funds sheet. */
  THRONE_URL: "https://throne.com/goddessoftaurus",
  YOUPAY_URL: "",
  CASHAPP_URL: "",

  /* Turn either funding method off. Stripe is also hidden when the
     server has no STRIPE_SECRET_KEY. */
  ENABLE_THRONE: true,
  ENABLE_STRIPE: true,

  /* Preset dollar amounts on the Add funds sheet. */
  loadPresets: [10, 20, 50, 100],

  /* Optional API origin, e.g. "https://your-app.onrender.com".
     Empty means "same origin" (when the Node server is serving the site).
     If the API cannot be reached, the game runs in local demo mode. */
  apiBase: "",

  soundDefault: false,

  /* Sales goal shown on /admin/analytics (dollars). The ring fills toward this. */
  SALES_GOAL: 1000
};

// Browser globals + Node (the game server reads this same file).
if (typeof window !== "undefined") {
  window.SITE_NAME = SITE_NAME;
  window.CONFIG = CONFIG;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { SITE_NAME: SITE_NAME, CONFIG: CONFIG };
}
