# Development and self-hosting

This guide covers running, deploying, and maintaining Cronometer MCP. For capabilities and connection instructions, see the [README](../README.md).

## Authentication design

The Worker has three trust boundaries:

1. It is an OAuth 2.1 authorization server for ChatGPT and other MCP clients. `@cloudflare/workers-oauth-provider` handles discovery, dynamic client registration, PKCE, token exchange, refresh, revocation, and bearer validation.
2. During authorization, the user submits their Cronometer username, password, and optional one-time code to the Worker. The Worker immediately exchanges them with **two** upstream sessions:
   - a **mobile session** via `POST mobile.cronometer.com/api/v2/login`, which returns a `sessionKey` used by all JSON data tools (v2 requests carry an `auth` block; v3 requests use an `x-crono-session` header), and
   - a **web/GWT session** via the private web login, kept solely to mint short-lived export nonces for CSV downloads.
3. Neither session outlives its upstream lifetime: both are stored in the OAuth grant's encrypted `props`, and the password and one-time code are never stored or included in an MCP token.

When a tool detects an invalid Cronometer session, the HTTPS Worker revokes that OAuth grant and returns a tool-level authentication challenge. Clients that support the challenge can open `/authorize` from the tool call. Signing in there creates fresh mobile and web sessions. The Worker discards the password and one-time code, so renewing Cronometer sessions requires sign-in. An expired MCP access token can still be refreshed through `/oauth/token` while its grant is valid.

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

To tie tool spans to an account, also set a random HMAC key:

```sh
openssl rand -hex 32 | npx wrangler secret put TELEMETRY_USER_ID_SECRET
```

Each `mcp.tool` span then carries `enduser.pseudo.id`, an HMAC-SHA-256 of the
Cronometer user ID truncated to 32 hex characters. Cronometer user IDs are
sequential, so the key is what keeps the ID from being reversed; never log or
share it. Rotating the key changes every user's ID, which breaks per-user history
across the rotation. Without the secret, spans carry no user identifier. Query it
in Tempo with, for example,
`{ span.mcp.tool.name != nil } | count_over_time() by (span.enduser.pseudo.id)`.

## Sentry error reporting

Use the DSN from the Cronometer MCP project in Sentry to enable error reporting
for the Worker. Set it in Cloudflare with `npx wrangler secret put SENTRY_DSN`
from `apps/cronometer-mcp`. For local testing, set `SENTRY_DSN` and
`SENTRY_ENVIRONMENT=development` in the Worker's `.dev.vars`.
Preview deployments label their events `preview`.

Sentry receives uncaught Worker exceptions and unexpected MCP tool and sign-in
failures. Events include stack locations and, when available, the tool or
operation name. Exception messages, request details, and breadcrumbs are
excluded. OpenTelemetry continues to export traces separately.

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

## Website

The homepage lives in [apps/web](../apps/web). From the repository root:

```sh
npm run dev --workspace cronometer-mcp-web
npm run build --workspace cronometer-mcp-web
```

The website uses [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/).
The [Wrangler configuration](../apps/web/wrangler.jsonc) points to the static Next.js export
in `apps/web/out` and has no script entry point. [Static asset requests use zero Workers compute](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).

Connect the `cronometer-mcp-web` Worker to Git under **Settings → Build** and configure
[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

| Setting | Value |
| --- | --- |
| Worker name | `cronometer-mcp-web` |
| Git repository | `atticoos/cronometer-mcp` |
| Production branch | `main` |
| Root directory | Repository root |
| Build command | `npm run build --workspace cronometer-mcp-web` |
| Deploy command | `npm exec -- wrangler deploy --config apps/web/wrangler.jsonc` |
| Preview command | `npm exec -- wrangler versions upload --config apps/web/wrangler.jsonc` |
| Build environment variable | `NODE_VERSION=24` |
| Build watch paths | `apps/web/*`, `package.json`, `package-lock.json` |

Cloudflare builds branch previews with analytics disabled. GitHub Actions runs website lint
and tests.

For the cutover, verify the asset deployment on its `workers.dev` URL before moving
`cronometer-mcp.dev` from the old homepage Worker to the `cronometer-mcp-web` Worker's
custom domains. Disable builds for the old Pages project and website repository when retiring
them. The MCP endpoint at `mcp.cronometer-mcp.dev` is managed by its own Worker.


## MCP Registry listing

[`server.json`](../server.json) describes the hosted server for the [official MCP Registry](https://registry.modelcontextprotocol.io) under the `io.github.atticoos/cronometer-mcp` name. Directories such as Glama and PulseMCP read from the registry, so it is the first place to update when the server's endpoint or description changes.

To publish a new listing version:

1. Bump `version` in `server.json` (the registry rejects a version it already has). Keep `description` at 100 characters or fewer.
2. Install the publisher: `brew install mcp-publisher`, or download a release from [modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry/releases).
3. From the repository root, run `mcp-publisher login github` and sign in as `atticoos`.
4. Run `mcp-publisher validate`, then `mcp-publisher publish`.
5. Confirm the listing shows the version you published:

   ```sh
   curl -s "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.atticoos%2Fcronometer-mcp/versions/latest" | jq -r '.server.version'
   ```
