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
  /* "Back to links" on the game pages. Opens in the same tab. */
  backLinkUrl: "https://linktr.ee/crystal98xo",

  /* Combined games homepage. Game pages on other hosts (like wheeloftorture)
     send "Back to games" here so everything funnels to one hub. */
  gamesHubUrl: "https://piggyplay.onrender.com/games.html",

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
