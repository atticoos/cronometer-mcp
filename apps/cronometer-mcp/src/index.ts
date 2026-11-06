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
} from "@cronometer-mcp/core";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { authHandler, OAUTH_SCOPE } from "./auth";
import { instrumentToolRegistration } from "./observability";

type RuntimeEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };
const MCP_ROUTE = "/mcp";

export function createServer(reauthorize?: () => Promise<string | undefined>): McpServer {
  const server = instrumentToolRegistration(
    new McpServer({ name: "Cronometer MCP", version: "0.3.0" }),
  );

  registerCronometerTools(server, {
    getAuthContext: (): AuthContext | null => {
      const parsed = authPropsSchema.safeParse(getMcpAuthContext()?.props);
      return parsed.success ? parsed.data : null;
    },
    oauth: {
      scopes: [OAUTH_SCOPE],
      reauthorize: reauthorize ?? (async () => undefined),
    },
  });
  return server;
}

const mcpHandler = {
  fetch(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Response | Promise<Response> {
    return createMcpHandler(() => createServer(() => reauthorize(request, env)))(request, env, ctx);
  },
} satisfies ExportedHandler<RuntimeEnv>;

async function reauthorize(request: Request, env: RuntimeEnv): Promise<string | undefined> {
  const url = new URL(request.url);
  const bearer = request.headers.get("Authorization");
  if (url.protocol !== "https:" || url.pathname !== MCP_ROUTE || !bearer?.startsWith("Bearer ")) {
    return;
  }

  // The provider validated the bearer before dispatch. Retire the grant whose
  // upstream sessions are unusable so an OAuth refresh cannot keep reissuing it.
  try {
    const token = await env.OAUTH_PROVIDER.unwrapToken<unknown>(bearer.slice(7));
    if (!token) return;
    await env.OAUTH_PROVIDER.revokeGrant(token.grantId, token.userId);
  } catch {
    return;
  }

  const metadata = `${url.origin}/.well-known/oauth-protected-resource${MCP_ROUTE}`;
  return `Bearer resource_metadata="${metadata}", error="invalid_token", error_description="Sign in to Cronometer again"`;
}

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
  apiRoute: MCP_ROUTE,
  authorizeEndpoint: "/authorize",
  clientIdMetadataDocumentEnabled: true,
  clientRegistrationEndpoint: "/oauth/register",
  defaultHandler: authHandler,
  resourceMetadata: { scopes_supported: [OAUTH_SCOPE] },
  scopesSupported: [OAUTH_SCOPE],
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
