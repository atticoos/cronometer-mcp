# Cronometer MCP

A Cloudflare Worker that exposes Cronometer data to MCP clients. Data tools use Cronometer's mobile REST API (the same JSON endpoints as the Android app); CSV exports use Cronometer's private web/GWT endpoints because no public API exists.

## Authentication design

The Worker has three trust boundaries:

1. It is an OAuth 2.1 authorization server for ChatGPT and other MCP clients. `@cloudflare/workers-oauth-provider` handles discovery, dynamic client registration, PKCE, token exchange, refresh, revocation, and bearer validation.
2. During authorization, the user submits their Cronometer username, password, and optional one-time code to the Worker. The Worker immediately exchanges them with **two** upstream sessions:
   - a **mobile session** via `POST mobile.cronometer.com/api/v2/login`, which returns a `sessionKey` used by all JSON data tools (v2 requests carry an `auth` block; v3 requests use an `x-crono-session` header), and
   - a **web/GWT session** via the private web login, kept solely to mint short-lived export nonces for CSV downloads.
3. Neither session outlives its upstream lifetime: both are stored in the OAuth grant's encrypted `props`, and the password and one-time code are never stored or included in an MCP token.

When the optional `ENROLL_SECRET` secret is configured (`wrangler secret put ENROLL_SECRET`), `/authorize` also requires a matching enrollment code before any credentials are processed, so only people who know the code can connect. Failed enrollment guesses count against the same five-attempt limit as failed logins. When the secret is unset, anyone with the Worker URL can connect their own Cronometer account.

Because credentials are never persisted, an expired upstream session cannot be silently refreshed -- affected tools return a reconnect instruction and the MCP connection must be re-authorized through `/authorize`. Note that deploying this refactor changes the stored props shape, so existing connections must reconnect once after upgrade.

The mobile API integration is a TypeScript port of [`rwestergren/cronometer-api-mcp`](https://github.com/rwestergren/cronometer-api-mcp) (MIT), which reverse-engineered the endpoints from the Cronometer Android app. The export wire format was independently implemented with
[`jrmycanady/gocronometer`](https://github.com/jrmycanady/gocronometer) as a protocol reference.
Cronometer's private GWT permutation and request format can change without notice. The reference
project is GPL-2.0; review licensing before copying any additional implementation code from it.

## Local development

```sh
npm install
npm run cf-typegen
npm test
npm run dev
```

Connect an MCP client to `http://localhost:8787/mcp`. Local KV data is maintained by Wrangler.

## Deploy to Cloudflare

Wrangler can provision the `OAUTH_KV` namespace declared in `wrangler.jsonc` on first deploy:

```sh
npm run deploy
```

Then connect ChatGPT to:

```text
https://cronometer-mcp.<your-workers-subdomain>.workers.dev/mcp
```

The first connection opens `/authorize`, where the user signs into Cronometer and grants read-only access.

## Current scope

The Worker exposes authenticated MCP tools backed by the mobile API:

- `connection_status` verifies that the MCP grant contains both Cronometer sessions.
- Food log & diary: `get_food_log`, `add_food_entry`, `remove_food_entry`, `mark_day_complete`, `copy_day`.
- Nutrition & food database: `get_daily_nutrition`, `get_nutrition_scores`, `search_foods`, `get_food_details`.
- Foods & recipes: `add_custom_food`, `add_recipe`.
- Targets & tracking: `get_macro_targets`, `get_fasting_history`, `get_fasting_stats`, `list_biometrics`, `get_biometrics`.

In addition, `get_cronometer_data` retrieves raw CSV exports (daily nutrition summaries, food servings, exercises, biometrics, or notes) for an inclusive date range of up to 31 days via the web session.

Each CSV export consumes one of Cronometer's limited daily exports (roughly 10 per day), so clients should request only the dataset and dates they need; the mobile tools are not subject to that limit. Export responses preserve the CSV's column order and values, and return at most 1,000 rows; shorten the date range if a result is marked as truncated.

The Worker never returns or logs Cronometer credentials, sessions, or export nonces. An expired upstream session produces a reconnect instruction instead.
