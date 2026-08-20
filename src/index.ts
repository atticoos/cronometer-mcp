import {
  OAuthProvider,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { z } from "zod";
import { authHandler } from "./auth";

type RuntimeEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

const authPropsSchema = z.object({
  cronometerSession: z.object({
    cookies: z.string().min(1),
    userId: z.string().min(1),
  }),
  cronometerUsername: z.string().min(1),
});

function createServer(): McpServer {
  const server = new McpServer({ name: "Chronometer MCP", version: "0.1.0" });

  server.registerTool(
    "connection_status",
    {
      description: "Check whether the current MCP authorization is linked to a Cronometer account.",
      inputSchema: z.object({}),
    },
    async (_args) => {
      const parsed = authPropsSchema.safeParse(getMcpAuthContext()?.props);
      return {
        content: [
          {
            type: "text" as const,
            text: parsed.success
              ? "Connected to Cronometer. Read-only data tools can use this authorization."
              : "The MCP authorization is not linked to Cronometer.",
          },
        ],
      };
    },
  );

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
