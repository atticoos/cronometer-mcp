import { SpanStatusCode, trace, type Attributes, type Context } from "@opentelemetry/api";
import type { ReadableSpan, Span, SpanProcessor } from "@opentelemetry/sdk-trace-base";
import type { McpServer } from "@modelcontextprotocol/server";
import { captureException, withScope } from "@sentry/cloudflare";

type ToolResult = { isError?: boolean } & Record<string, unknown>;
type ToolHandler = (
  args: Record<string, unknown>,
  extra: unknown,
) => Promise<ToolResult>;

type RegisterTool = (
  name: string,
  config: Record<string, unknown>,
  handler?: ToolHandler,
) => unknown;

function argKeys(args: unknown): string | undefined {
  if (typeof args !== "object" || args === null) return undefined;
  const keys = Object.keys(args).sort().join(",");
  return keys.length > 0 ? keys : undefined;
}

/**
 * Wraps server.registerTool so every tool handler runs inside a
 * `mcp.tool.<name>` span with bounded, privacy-safe attributes.
 * Argument keys are recorded; argument values never are.
 */
export function instrumentToolRegistration(server: McpServer): McpServer {
  const tracer = trace.getTracer("cronometer-mcp");
  const registerTool = server.registerTool.bind(server) as RegisterTool;

  server.registerTool = ((
    name: string,
    config: Record<string, unknown>,
    handler?: ToolHandler,
  ) => {
    if (!handler) return registerTool(name, config);

    const observed: ToolHandler = (args, extra) =>
      tracer.startActiveSpan(`mcp.tool ${name}`, async (span) => {
        span.setAttribute("mcp.tool.name", name);
        const keys = argKeys(args);
        if (keys) span.setAttribute("mcp.tool.arg_keys", keys);
        try {
          const result = await withScope((scope) => {
            scope.setTag("mcp.tool.name", name);
            return handler(args, extra);
          });
          const failed = result?.isError === true;
          span.setAttribute("mcp.tool.outcome", failed ? "returned_error" : "success");
          span.setStatus({
            code: failed ? SpanStatusCode.ERROR : SpanStatusCode.OK,
          });
          span.end();
          return result;
        } catch (error) {
          captureException(error, { tags: { "mcp.tool.name": name } });
          span.setAttribute("mcp.tool.outcome", "thrown_error");
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });
          span.end();
          throw error;
        }
      });

    return registerTool(name, config, observed);
  }) as RegisterTool as typeof server.registerTool;

  return server;
}

const REDACTED = "[redacted]";

// Key prefixes written by @cloudflare/workers-oauth-provider and our auth flow.
// The rest of each key holds the user id, grant id, token hash, client id or
// sign-in flow id, so only the prefix is kept.
const KV_KEY_PREFIXES = ["token:", "grant:", "client:", "cronometer:auth-flow:"];

function redactKvKey(key: string): string {
  const prefix = KV_KEY_PREFIXES.find((candidate) => key.startsWith(candidate));
  return `${prefix ?? ""}${REDACTED}`;
}

function redactQuery(search: string): string {
  const query = search.startsWith("?") ? search.slice(1) : search;
  if (query.length === 0) return search;
  const names = query.split("&").map((pair) => pair.split("=")[0]);
  return `?${names.map((name) => `${name}=${REDACTED}`).join("&")}`;
}

function redactUrl(raw: string): string {
  const queryStart = raw.indexOf("?");
  if (queryStart === -1) return raw;
  const hashStart = raw.indexOf("#", queryStart);
  const search = hashStart === -1 ? raw.slice(queryStart) : raw.slice(queryStart, hashStart);
  return `${raw.slice(0, queryStart)}${redactQuery(search)}`;
}

const URL_ATTRIBUTES = ["url.full", "http.url"];

/**
 * Removes identifiers and credentials that auto-instrumentation records:
 * Cloudflare KV keys (OAuth token, grant and client ids) and URL query values
 * (such as Cronometer's single-use export nonce). Mutates in place.
 */
export function redactSpanAttributes(attributes: Attributes): void {
  if (attributes["db.system"] === "Cloudflare KV") {
    const key = attributes["db.cf.kv.key"];
    if (typeof key === "string") attributes["db.cf.kv.key"] = redactKvKey(key);
    const operation = attributes["db.operation"];
    if (typeof attributes["db.statement"] === "string") {
      attributes["db.statement"] = `${String(operation ?? "")} ${REDACTED}`.trim();
    }
  }

  for (const name of URL_ATTRIBUTES) {
    const value = attributes[name];
    if (typeof value === "string") attributes[name] = redactUrl(value);
  }
  const query = attributes["url.query"];
  if (typeof query === "string") attributes["url.query"] = redactQuery(query);
}

/**
 * Span processor that redacts each span's attributes when it ends, before the
 * wrapped processor queues it for export.
 */
export class RedactingSpanProcessor implements SpanProcessor {
  constructor(private readonly inner: SpanProcessor) {}

  onStart(span: Span, parentContext: Context): void {
    this.inner.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    redactSpanAttributes(span.attributes as Attributes);
    this.inner.onEnd(span);
  }

  forceFlush(...args: unknown[]): Promise<void> {
    // otel-cf-workers flushes per trace by passing the trace id.
    return (this.inner.forceFlush as (...flushArgs: unknown[]) => Promise<void>)(...args);
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }
}
