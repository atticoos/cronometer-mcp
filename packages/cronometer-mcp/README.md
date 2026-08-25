# cronometer-mcp

Local [Model Context Protocol](https://modelcontextprotocol.io) server for
[Cronometer](https://cronometer.com) food logging and nutrition data.

> **Status: placeholder release.** This package is published to reserve the npm
> name. It currently starts a minimal stdio MCP server exposing a single
> `server_status` tool; the Cronometer data tools are under active development.

## Install

```sh
npm install -g cronometer-mcp
```

or run it directly:

```sh
npx cronometer-mcp
```

## Usage with MCP clients

The server communicates over stdio, so point your MCP client at the binary.
For example, in Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cronometer": {
      "command": "npx",
      "args": ["-y", "cronometer-mcp"]
    }
  }
}
```

## Related

The hosted counterpart lives in the same repository at `apps/cronometer-mcp`:
a Cloudflare Worker that exposes Cronometer data to MCP clients over HTTP with
OAuth 2.1 sign-in.
