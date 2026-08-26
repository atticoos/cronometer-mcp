# cronometer-mcp

A local [Model Context Protocol](https://modelcontextprotocol.io) server that lets
MCP-compatible agents read and update a Cronometer account.

The server runs on Node.js over stdio. At startup it exchanges credentials from
environment variables directly with Cronometer for temporary web and mobile
sessions. It does not save or return the password, one-time code, cookies, or
session keys.

> Cronometer does not provide a public API for this integration. The private
> mobile and web endpoints used here can change without notice.

## Requirements

- Node.js 20 or newer
- A Cronometer account

## Agent configuration

Install the package globally with `npm install -g cronometer-mcp`, or let your
agent run it through `npx`:

```json
{
  "mcpServers": {
    "cronometer": {
      "command": "npx",
      "args": ["-y", "cronometer-mcp"],
      "env": {
        "CRONOMETER_USERNAME": "you@example.com",
        "CRONOMETER_PASSWORD": "your-password"
      }
    }
  }
}
```

Use the installed binary instead by changing `command` to `cronometer-mcp` and
removing `args`.

If two-factor authentication is enabled, also provide a current code when the
agent starts:

```json
"CRONOMETER_USER_CODE": "123456"
```

Prefer your agent's secret or environment-variable support when it has one;
plain-text MCP configuration files expose values to anyone who can read them.
The one-time code must still be valid when the server starts.

## Tools

The server exposes tools for:

- Food diary reads, additions, removals, completion, and copying
- Daily nutrients, nutrition scores, food search, and food details
- Custom foods and recipes
- Macro targets, fasting history and statistics, and biometrics
- Raw CSV exports for nutrition, servings, exercises, biometrics, and notes

CSV exports are limited to 31 inclusive days and 1,000 returned rows. Cronometer
also applies a small daily export quota, so prefer the mobile data tools where
possible.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `CRONOMETER_USERNAME` | Yes | Cronometer email address or username |
| `CRONOMETER_PASSWORD` | Yes | Cronometer password |
| `CRONOMETER_USER_CODE` | Only for 2FA | Current authenticator code |

Sessions live only for the lifetime of the local process. Restarting the MCP
server signs in again, and an expired session requires a restart.

## Development

From the repository root:

```sh
npm install
npm run test --workspace @cronometer-mcp/core
npm run build --workspace cronometer-mcp
npm test --workspace cronometer-mcp
```

The shared implementation is in `packages/cronometer-core`; the build bundles
it into this package. The hosted Cloudflare Worker adapter is in
`apps/cronometer-mcp`.
