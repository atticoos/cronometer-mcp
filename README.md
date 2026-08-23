# Cronometer MCP

A Cloudflare Worker that exposes Cronometer data to MCP clients. The project uses Cronometer's private web/GWT endpoints because Cronometer does not publish an API.

## Authentication design

The Worker has two separate trust boundaries:

1. It is an OAuth 2.1 authorization server for ChatGPT and other MCP clients. `@cloudflare/workers-oauth-provider` handles discovery, dynamic client registration, PKCE, token exchange, refresh, revocation, and bearer validation.
2. During authorization, the user submits their Cronometer username, password, and optional one-time code to the Worker. The Worker immediately exchanges them with Cronometer for a session. The password and one-time code are never stored or included in an MCP token. The resulting session is stored in the OAuth grant's encrypted `props`.

This is an unofficial integration. The login wire format was independently implemented with
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

The Worker exposes two authenticated, read-only MCP tools:

- `connection_status` verifies that the MCP grant contains a Cronometer session.
- `get_cronometer_data` retrieves daily nutrition summaries, food servings, exercises, biometrics, or notes for an inclusive date range of up to 31 days.

Each data request consumes one Cronometer CSV export. Cronometer currently limits accounts to roughly 10 exports per day, so clients should request only the dataset and dates they need. Tool responses preserve the CSV's column order and values, and return at most 1,000 rows; shorten the date range if a result is marked as truncated.

The Worker never returns or logs Cronometer cookies or export nonces. An expired upstream session produces a reconnect instruction instead.
