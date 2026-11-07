import {
  BatchTraceSpanProcessor,
  instrument,
  OTLPExporter,
} from "@microlabs/otel-cf-workers";
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
import { captureException, withSentry } from "@sentry/cloudflare";
import { authHandler, OAUTH_SCOPE } from "./auth";
import {
  holdTraceUntilBodyDone,
  instrumentToolRegistration,
  RedactingSpanProcessor,
} from "./observability";
import { sentryOptions } from "./sentry";
import { createToolCallLogSink } from "./tool-call-log";
import { env as workerEnv, waitUntil } from "cloudflare:workers";
import { telemetryUserId } from "./telemetry-user";
import { clientPlatform, clientUserAgent } from "./client-platform";

type RuntimeEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };
const MCP_ROUTE = "/mcp";

export function createServer(
  reauthorize?: () => Promise<string | undefined>,
  telemetrySecret?: string,
  platform?: string,
  userAgent?: string,
): McpServer {
  const getAuthContext = (): AuthContext | null => {
    const parsed = authPropsSchema.safeParse(getMcpAuthContext()?.props);
    return parsed.success ? parsed.data : null;
  };
  const server = instrumentToolRegistration(
    new McpServer({ name: "Cronometer MCP", version: "0.3.0" }),
    {
      onToolCall: toolCallLogSink(),
      clientPlatform: platform,
      clientUserAgent: userAgent,
      resolveUserId: async () =>
        telemetryUserId(telemetrySecret, getAuthContext()?.cronometerWebSession.userId),
    },
  );

  registerCronometerTools(server, {
    onError: (error, operation) => {
      captureException(error, { tags: { "cronometer.operation": operation } });
    },
    getAuthContext,
    oauth: {
      scopes: [OAUTH_SCOPE],
      reauthorize: reauthorize ?? (async () => undefined),
    },
  });
  return server;
}

// One OTLP log record per tool call lands in Loki, where usage reports are a
// single LogQL query over any range instead of day-by-day Tempo scans.
function toolCallLogSink() {
  const env = workerEnv as Partial<Env>;
  return createToolCallLogSink(
    {
      tracesEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
      headers: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
      serviceName: env.OTEL_SERVICE_NAME ?? "cronometer-mcp",
    },
    waitUntil,
  );
}

const mcpHandler = {
  async fetch(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
    const response = await createMcpHandler(() =>
      createServer(
        () => reauthorize(request, env),
        env.TELEMETRY_USER_ID_SECRET,
        clientPlatform(request.headers.get("User-Agent")),
        clientUserAgent(request.headers.get("User-Agent")),
      ),
    )(request, env, ctx);
    // Tool calls are POSTs answered over a stream. GET opens a long-lived
    // notification stream, which must not hold the trace open.
    if (request.method !== "POST") return response;
    return holdTraceUntilBodyDone(response, (promise) => ctx.waitUntil(promise));
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

const fetchWithOAuth = oauthProvider.fetch.bind(oauthProvider);
const sentryWorker = withSentry(sentryOptions, { fetch: fetchWithOAuth });

export default instrument(
  {
    fetch(request: Request, env: RuntimeEnv, ctx: ExecutionContext) {
      return env.SENTRY_DSN
        ? sentryWorker.fetch(request, env, ctx)
        : fetchWithOAuth(request, env, ctx);
    },
  },
  (env) => ({
    // Auto-instrumented KV and fetch spans record storage keys and full URLs.
    // Redact them before anything is queued for export.
    spanProcessors: new RedactingSpanProcessor(
      new BatchTraceSpanProcessor(
        new OTLPExporter({
          url: env?.OTEL_EXPORTER_OTLP_ENDPOINT,
          headers: parseOtlpHeaders(env?.OTEL_EXPORTER_OTLP_HEADERS),
        }),
      ),
    ),
    service: { name: env?.OTEL_SERVICE_NAME ?? "cronometer-mcp" },
    // MCP clients (e.g. ChatGPT) may send an unsampled traceparent, which the
    // default parent-based sampler would inherit — silently dropping every
    // span of the invocation. Always sample locally instead.
    sampling: { headSampler: { ratio: 1, acceptRemote: false } },
  }),
);
