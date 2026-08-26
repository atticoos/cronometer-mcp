# @cronometer-mcp/core

Private workspace package shared by the hosted Cloudflare Worker and local
Node.js stdio server.

It owns the Cronometer web and mobile clients, session schemas,
authentication handshake, error handling, and all MCP tool registrations.
Runtime packages provide a context function that resolves the appropriate
session for each tool call.

The package uses conditional exports: Workers consume TypeScript source under
the `workerd` condition, while Node development consumes the compiled output.
The published `cronometer-mcp` package bundles the core implementation, so end
users do not install this private package separately.
