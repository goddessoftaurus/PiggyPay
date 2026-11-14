# PayPiggy — Pin the Tail on the Pig & Wheel of Financial Torture

A pink-and-red “pin the tail” site for a findom creator’s link page. Players **add funds to their account**, then play the poster game, the Wheel of Financial Torture, or the Wheel of Humiliation ($5 a spin). Wherever the tail or wheel lands is what they owe — or the task they do. On Pin the Tail, a bullseye is a smaller payment; a miss costs more.

Rename the whole site by changing `SITE_NAME` at the top of `config.js`.

## Quick start (local)

```bash
cd paypiggy          # or the folder you unzipped
cp .env.example .env
# edit .env and set ADMIN_PASSWORD to something only you know
npm install
npm start
```

Then open:

- Poster game: http://localhost:3000/game.html
- Wheel of Financial Torture: http://localhost:3000/wheel.html
- Wheel of Humiliation: http://localhost:3000/humiliation.html
- Links: http://localhost:3000/index.html
- Admin desk (you only): http://localhost:3000/admin
- Sales analytics (you only): http://localhost:3000/admin/analytics
- Test play (you only): http://localhost:3000/admin/test
- Embed demo: http://localhost:3000/embed-demo.html

`npm test` runs an end-to-end check: create a player, request a Throne-style add-funds gift, approve it in admin, pin (server-side roll deducts the account), credit the same player with a **mocked** Stripe webhook (signed with a dummy secret — no real Stripe keys needed), spin the money wheel and the $5 humiliation wheel (also server-side), check that `/api/admin/stats` sums Throne + Stripe sales and per-game pins/spins, and confirm test-play accounts can be loaded with play money by admin only and are excluded from analytics and the real pending queue.

### Static demo (no server)

Open `game.html`, `wheel.html`, or `humiliation.html` from any static host (or a simple file server). If `/api/health` is not reachable, the game runs in **demo mode**: “I already sent it” credits the account locally after a short pause so you can try the animation without deploying. Demo funds are not real.

## How funding works

Every player gets a short play code like `PIG-7K2Q`. They add funds to their account with Throne (you approve it in `/admin`) or, optionally, Pay by card (Stripe). Pins and spins are decided **on the server** and deduct the landed amount from the account. Pin the Tail picks a zone (bullseye is cheapest and fairly rare; each ring out costs more; a miss is highest) and the tail flies to a random point in that zone. `ALL` takes whatever is left. The humiliation wheel always costs $5 (enforced on the server) and lands on a task. A player with $0 cannot pin or spin until they add funds; the humiliation wheel also rejects a pocket under $5.

### Throne (primary)

1. The player copies their play code, opens your Throne wishlist (`THRONE_URL` in `config.js`), and pastes the code in the gift note.
2. They tap **I already sent it**. The account shows as pending.
3. You sign in at `/admin` with `ADMIN_PASSWORD` and **Approve** the amount you actually received (or Reject).

Throne *does* offer [signed webhooks](https://help.throne.com/en/articles/15935990-how-do-i-set-up-webhook-integration) (`gift_purchased`, `contribution_purchased`, `gift_crowdfunded`). Optional support is already wired:

- Subscriber URL: `https://YOUR-HOST/api/webhooks/throne`
- The handler verifies the Ed25519 signature with Throne’s published public key.
- If the gift message contains a play code (`PIG-XXXX`), that player’s account is credited automatically.

Treat `/admin` as the reliable path anyway — messages can be missing, and you should still confirm what arrived.

Turn this off with `ENABLE_THRONE: false` in `config.js`.

### Pay by card (Stripe)

The Add funds and Pay up sheets always show **Pay by card**. When `ENABLE_STRIPE` is true **and** `STRIPE_SECRET_KEY` is set, that button starts Stripe Checkout. If Stripe is not configured yet, the button stays visible but disabled with “Card payments coming soon.”

1. Create a Stripe account and get **test** keys first (`sk_test_...`).
2. Put them in `.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   PUBLIC_URL=https://YOUR-HOST
   ```
   Never commit real keys. This repo ships without any.
3. In Stripe Dashboard → Developers → Webhooks, add:
   - Endpoint URL: `https://YOUR-HOST/api/stripe/webhook`  
     (alias: `https://YOUR-HOST/stripe/webhook`)
   - Event to send: `checkout.session.completed`
4. The server starts a Checkout Session for the chosen amount with metadata `{ playerCode }`. On `checkout.session.completed` the webhook signature is verified (`STRIPE_WEBHOOK_SECRET`) and the account is credited. Replays of the same session id are ignored.

If `ENABLE_STRIPE` is false, or the secret key is missing, the card button is hidden.

**Adult / findom content and Stripe:** Stripe restricts or prohibits many adult and sexual-services businesses. A findom / tribute game may not be allowed on a standard Stripe account and can get payments or the account shut down. Read Stripe’s restricted-business list and, if you still want cards, talk to them (or a processor that actually supports this category) *before* going live. Throne gifts plus manual `/admin` approval do not go through Stripe.

`Pay up` after a pin or money-wheel spin opens an in-page sheet pre-filled with the amount owed, with **Pay via Throne** (opens her Throne wishlist and creates a pending gift for her to approve) and **Pay by card** (Stripe Checkout). Test-play accounts see the same sheet with payments disabled and a “Test mode — no real payment” note. On both wheels, players can swipe or flick the wheel with a finger or mouse, or tap Spin; a flick uses the same server-side spin and only changes how long the wheel turns.

## Deploy for free

Set `ADMIN_PASSWORD`, and optionally the Stripe keys and `PUBLIC_URL`. Start command is `npm start`. The app listens on `PORT` (default 3000).

If you host more than one copy of this app (for example one site for the poster game and one for the wheel) against the same `DATABASE_URL`, they share player balances. Each request uses the host it was actually served on for Stripe return URLs; `PUBLIC_URL` is only a fallback when the request has no host. By default `/` is the combined games homepage (`/games.html`, also at `/games`). The original links page stays at `/index.html`. Set `ROOT_PAGE=wheel.html` (or `game.html` / `humiliation.html`) on a service if you want `/` to open that game instead; the query string is kept (`/?code=PIG-XXXX` becomes `/wheel.html?code=PIG-XXXX`).

"Back to links" on the game pages goes to `backLinkUrl` in `config.js` (default `https://linktr.ee/crystal98xo`) in the same tab. "Back to games" goes to the games homepage; on any host other than the hub it uses `gamesHubUrl` (default `https://goddessarcade.onrender.com/games.html`) so every site funnels to one homepage. The homepage has a modest **Admin** link to `/admin` (still password-protected, with analytics and test play from there). Players have a **My account** page at `/account` with their play code, balance, pin/spin history, funds history, Add funds (the same Throne + card sheet), links to the three games, and a Sign out button. Signing out clears the session on that device and returns to the games homepage with a reminder to save the play code.

Cartoon titles (PAYPIGGY and other display type) use the self-hosted **Matcha Style** font by Khurasan (`assets/fonts/`), with Luckiest Guy and cursive as fallbacks. Body text is Arial.

## Keeping balances safe: `DATABASE_URL`

Without a database, player accounts are saved to `server/data/db.json`. That's fine on your own computer, but **free hosts like Render wipe that file every time the site restarts or wakes up from sleep**, so balances would disappear.

Set `DATABASE_URL` to a Postgres database and everything (players, balances, pending Throne gifts, Stripe payments already counted, pin/spin history, sales analytics) is stored there instead. The app creates its table (`paypiggy_state`) by itself on first start, nothing to set up by hand.

Recommended: a free **[Neon](https://neon.tech)** Postgres database (the free plan doesn't expire; Render's free Postgres is deleted after 30 days).

1. Sign up at neon.tech and create a project (any name, e.g. `paypiggy`).
2. Copy the connection string. It looks like `postgresql://user:password@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`.
3. Add it as the `DATABASE_URL` environment variable on your host (Render: your service → Environment). Don't put it in any file you share or commit.
4. Restart. The startup log says `Storage: Postgres (DATABASE_URL)` and `/api/health` shows `"storage":"postgres"`.

SSL is turned on automatically for hosted databases. It's off for `localhost`, or if the URL contains `sslmode=disable`.

Every balance change runs in a transaction that locks the data first, so two spins at once can't spend the same money, and a Stripe payment is only ever credited once even if Stripe sends the webhook twice.

Tests: `npm test` always uses the JSON file and never touches `DATABASE_URL` (it wipes test data). To run the same tests on Postgres, point `TEST_DATABASE_URL` at a **throwaway** database: `TEST_DATABASE_URL=postgres://... npm test`.

**Render:** New Web Service, connect the repo, build `npm install`, start `npm start`. Add environment variables, including `DATABASE_URL` (see above). Free web services sleep when idle and lose local files, so don't skip the database. `render.yaml` in this folder sets this up as a Blueprint.

**Railway:** New project from the repo, it will detect Node. Add env vars. Generate a public domain and set `PUBLIC_URL` to it.

**Fly.io:** `fly launch` in this folder, set secrets with `fly secrets set ADMIN_PASSWORD=...`, then `fly deploy`.

Point `THRONE_URL` (and optional `YOUPAY_URL` / `CASHAPP_URL`) at your real gift pages in `config.js` before you share the site. Same for name, handle, wallet addresses, and avatar.


## Sales analytics

Sign in at `/admin/analytics` with the same `ADMIN_PASSWORD`. The page shows:

- Total approved/credited funds (approved Throne gifts + Stripe payments)
- Number of sales, plus totals for today, the last 7 days, and the last 30 days (today uses America/New_York)
- Breakdown by method (Throne vs Stripe)
- Total pinned / spun amounts for the poster game, the money wheel, and the humiliation wheel
- A recent sales list
- A big animated ring that fills toward `SALES_GOAL` in `config.js` (default `$1,000`). It shows `$X / $1,000` and the percent, and celebrates when the goal is reached.

The numbers come from `GET /api/admin/stats` (admin cookie required).

## Test play

Sign in at `/admin/test` with the same `ADMIN_PASSWORD` (there's also a Test play link from `/admin`). You can:

1. Create a test player (or pick an existing one)
2. Load play money with +$50, +$100, or +$500, or reset the pocket to $0
3. Open Pin the Tail, the money wheel, or the humiliation wheel as that player (`?code=PIG-XXXX` signs the browser in)
4. Come back to the page to see what they owed and which tasks they landed on

Test players are flagged (`test: true`). Their play money, pins, and spins are left out of sales analytics and the $1,000 goal ring, and they never show up in the real admin pending queue. The games show a **TEST MODE — play money** ribbon while you're playing as one. Only a signed-in admin can credit test money; test accounts also can't start a real Throne request or Stripe checkout.

## Embed

```html
<div id="paypiggy" data-src="https://YOUR-HOST/widget/widget.html"></div>
<script src="https://YOUR-HOST/widget/embed.js"></script>
```

Wheel of Financial Torture widget:

```html
<div id="paypiggy-wheel" data-src="https://YOUR-HOST/widget/wheel.html"></div>
<script src="https://YOUR-HOST/widget/embed.js"></script>
```

Wheel of Humiliation widget:

```html
<div id="paypiggy-humiliation" data-src="https://YOUR-HOST/widget/humiliation.html"></div>
<script src="https://YOUR-HOST/widget/embed.js"></script>
```

Or a plain iframe:

```html
<iframe
  src="https://YOUR-HOST/widget/widget.html"
  title="PayPiggy — Pin the Tail on the Pig"
  style="width:100%;border:0;min-height:720px;display:block;"
  loading="lazy"></iframe>
```

Keep `widget/`, `assets/`, `config.js`, `game.js`, `wheel.js`, and the CSS files together on the same host.


## Placeholders to fill in `config.js`

- `displayName`, `handle`, `bio`, `closing`, `avatar`, chips
- Link hrefs (`#YOUR_THRONE_URL`, `#YOUR_YOUPAY_URL`, `#YOUR_CASHAPP_URL`, `#YOUR_LOYALFANS_URL`, socials)
- `YOUR_BTC_ADDRESS`, `YOUR_ETH_ADDRESS`, `YOUR_SOL_ADDRESS`
- `THRONE_URL`, optional `YOUPAY_URL` / `CASHAPP_URL`
- `backLinkUrl` ("Back to links" on the game pages, same tab)
- `gamesHubUrl` ("Back to games" target on hosts other than the hub)
- `THRONE_URL` (Pay via Throne / Add funds)
- `ENABLE_THRONE` / `ENABLE_STRIPE`
- `SALES_GOAL` (analytics ring, dollars, default 1000)
- Money spots and weights in `segments`
- Humiliation tasks and title in `humiliationWheel` (price is always $5 on the server)
