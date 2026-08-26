import { instrument } from "@microlabs/otel-cf-workers";
import {
  OAuthProvider,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import {
  authPropsSchema,
  registerCronometerTools,
  type AuthContext,
} from "cronometer-mcp-tools";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { authHandler } from "./auth";
import { instrumentToolRegistration } from "./observability";

type RuntimeEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

export function createServer(): McpServer {
  const server = instrumentToolRegistration(
    new McpServer({ name: "Cronometer MCP", version: "0.3.0" }),
  );

  return (
    registerCronometerTools(server, {
      getAuthContext: (): AuthContext | null => {
        const parsed = authPropsSchema.safeParse(getMcpAuthContext()?.props);
        return parsed.success ? parsed.data : null;
      },
    }),
    server
  );
}

const mcpHandler = {
  fetch(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Response | Promise<Response> {
    return createMcpHandler(createServer)(request, env, ctx);
  },
} satisfies ExportedHandler<RuntimeEnv>;

function parseOtlpHeaders(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  return Object.fromEntries(
    raw
      .split(",")
      .map((pair) => {
        const eq = pair.indexOf("=");
        return eq === -1 ? undefined : [pair.slice(0, eq), pair.slice(eq + 1)];
      })
      .filter((entry): entry is [string, string] => entry !== undefined)
      .map(([key, value]) => [key.trim(), value.trim()]),
  );
}

// Bind fetch explicitly: the OTel instrumentation invokes handler.fetch without
// a receiver, and OAuthProvider.fetch depends on internal instance state.
const oauthProvider = new OAuthProvider<RuntimeEnv>({
  apiHandler: mcpHandler,
  apiRoute: "/mcp",
  authorizeEndpoint: "/authorize",
  clientIdMetadataDocumentEnabled: true,
  clientRegistrationEndpoint: "/oauth/register",
  defaultHandler: authHandler,
  scopesSupported: ["cronometer:read"],
  tokenEndpoint: "/oauth/token",
});

export default instrument(
  { fetch: oauthProvider.fetch.bind(oauthProvider) },
  (env) => ({
    exporter: {
      url: env?.OTEL_EXPORTER_OTLP_ENDPOINT,
      headers: parseOtlpHeaders(env?.OTEL_EXPORTER_OTLP_HEADERS),
    },
    service: { name: env?.OTEL_SERVICE_NAME ?? "cronometer-mcp" },
    // MCP clients (e.g. ChatGPT) may send an unsampled traceparent, which the
    // default parent-based sampler would inherit — silently dropping every
    // span of the invocation. Always sample locally instead.
    sampling: { headSampler: { ratio: 1, acceptRemote: false } },
  }),
);
