# Development and self-hosting

This guide covers running, deploying, and maintaining Cronometer MCP. For capabilities and connection instructions, see the [README](../README.md).

## Authentication design

The Worker has three trust boundaries:

1. It is an OAuth 2.1 authorization server for ChatGPT and other MCP clients. `@cloudflare/workers-oauth-provider` handles discovery, dynamic client registration, PKCE, token exchange, refresh, revocation, and bearer validation.
2. During authorization, the user submits their Cronometer username, password, and optional one-time code to the Worker. The Worker immediately exchanges them with **two** upstream sessions:
   - a **mobile session** via `POST mobile.cronometer.com/api/v2/login`, which returns a `sessionKey` used by all JSON data tools (v2 requests carry an `auth` block; v3 requests use an `x-crono-session` header), and
   - a **web/GWT session** via the private web login, kept solely to mint short-lived export nonces for CSV downloads.
3. Neither session outlives its upstream lifetime: both are stored in the OAuth grant's encrypted `props`, and the password and one-time code are never stored or included in an MCP token.

Because credentials are never persisted, an expired upstream session cannot be silently refreshed -- affected tools return a reconnect instruction and the MCP connection must be re-authorized through `/authorize`.

The mobile API integration is a TypeScript port of [`rwestergren/cronometer-api-mcp`](https://github.com/rwestergren/cronometer-api-mcp) (MIT), which reverse-engineered the endpoints from the Cronometer Android app. The export wire format was independently implemented with
[`jrmycanady/gocronometer`](https://github.com/jrmycanady/gocronometer) as a protocol reference.
Cronometer's private GWT permutation and request format can change without notice. The reference
project is GPL-2.0; review licensing before copying any additional implementation code from it.

## Local development

```sh
npm install
npm run cf-typegen --workspace cronometer-mcp-worker
npm test
npm run dev
```

Connect an MCP client to `http://localhost:8787/mcp`. Local KV data is maintained by Wrangler.

## Deploy to Cloudflare

Wrangler can provision the `OAUTH_KV` namespace declared in `apps/cronometer-mcp/wrangler.jsonc` on first deploy:

```sh
npm run deploy
```

Then connect ChatGPT to:

```text
https://cronometer-mcp.<your-workers-subdomain>.workers.dev/mcp
```

The first connection opens `/authorize`, where the user signs into Cronometer and grants read and write access. The consent screen lists the available capabilities, including deletion of food entries. See [account access and privacy](../README.md#account-access-and-privacy) for the permissions and the legacy `cronometer:read` scope name.

## Secrets

Secrets are set per environment with Wrangler and never committed. Local development uses
`.dev.vars` (copy `.dev.vars.example` and fill in real values; it is gitignored):

```sh
cp apps/cronometer-mcp/.dev.vars.example apps/cronometer-mcp/.dev.vars
```

Production secrets for the Worker are created once and survive all deploys (Wrangler,
GitHub Actions, or manual):

```sh
cd apps/cronometer-mcp
npx wrangler secret put OTEL_EXPORTER_OTLP_ENDPOINT
npx wrangler secret put OTEL_EXPORTER_OTLP_HEADERS
```

`OTEL_EXPORTER_OTLP_ENDPOINT` is the full OTLP trace URL (for Grafana Cloud, including
`/v1/traces`). `OTEL_EXPORTER_OTLP_HEADERS` uses the OTel env format
`key=value,key2=value2`; for Grafana Cloud that is
`Authorization=Basic <base64 of instance-id:token>` from the stack's OpenTelemetry setup
page. Rotate by re-running `wrangler secret put`. Use `npx wrangler secret list` to
verify what is configured; a missing value disables tracing rather than failing requests.

## CI and deployments

GitHub Actions runs linting and tests for the Worker workspace on pull requests and on `main`.
Pull requests from branches in this repository upload the app as Cloudflare preview versions;
merges to `main` deploy it to production.

Configure these GitHub Actions secrets before enabling deployments:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` with Cloudflare Workers edit access, scoped to the deployment account

The deploy jobs use per-app GitHub environments (for example, `production-cronometer-mcp`),
so approvals and environment-scoped secrets can be configured independently if needed. Preview
URLs are attached to the GitHub deployment and shown in the workflow run summary. Forked pull
requests do not receive deployment credentials and skip the preview job.

