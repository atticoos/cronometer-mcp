import {
  authContextSchema,
  registerCronometerTools,
} from "@cronometer-mcp/core";
import {
  OAuthProvider,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { authHandler } from "./auth";

type RuntimeEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

const RECONNECT_MESSAGE = "Reconnect this MCP connection to Cronometer first.";

export function createServer(): McpServer {
  const server = new McpServer({ name: "Cronometer MCP", version: "0.3.0" });

  registerCronometerTools(server, {
    disconnectedStatusMessage: "The MCP authorization is not linked to Cronometer.",
    expiredSessionMessage:
      "The Cronometer session has expired. Reconnect this MCP connection to Cronometer.",
    getContext: () => {
      const parsed = authContextSchema.safeParse(getMcpAuthContext()?.props);
      return parsed.success ? parsed.data : null;
    },
    missingContextMessage: RECONNECT_MESSAGE,
  });

  return server;
}

const mcpHandler = {
  fetch(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Response | Promise<Response> {
    return createMcpHandler(createServer)(request, env, ctx);
  },
} satisfies ExportedHandler<RuntimeEnv>;

export default new OAuthProvider<RuntimeEnv>({
  apiHandler: mcpHandler,
  apiRoute: "/mcp",
  authorizeEndpoint: "/authorize",
  clientIdMetadataDocumentEnabled: true,
  clientRegistrationEndpoint: "/oauth/register",
  defaultHandler: authHandler,
  scopesSupported: ["cronometer:read"],
  tokenEndpoint: "/oauth/token",
});
