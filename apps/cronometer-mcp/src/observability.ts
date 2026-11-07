import { SpanStatusCode, trace, type Attributes, type Context } from "@opentelemetry/api";
import type { ReadableSpan, Span, SpanProcessor } from "@opentelemetry/sdk-trace-base";
import type { McpServer } from "@modelcontextprotocol/server";
import { captureException, withScope } from "@sentry/cloudflare";
import { TOOL_ERROR_KIND, type ToolErrorKind } from "@cronometer-mcp/core";

type ToolResult = { isError?: boolean; [TOOL_ERROR_KIND]?: ToolErrorKind } & Record<string, unknown>;
type ToolHandler = (
  args: Record<string, unknown>,
  extra: unknown,
) => Promise<ToolResult>;

type RegisterTool = (
  name: string,
  config: Record<string, unknown>,
  handler?: ToolHandler,
) => unknown;

export type ToolOutcome = "success" | "returned_error" | "thrown_error";

/** A finished tool call, as handed to an `onToolCall` sink. */
export interface ToolCallRecord {
  tool: string;
  outcome: ToolOutcome;
  /** Why a `returned_error` call failed; `upstream` ones are also reported to Sentry. */
  errorKind?: ToolErrorKind;
  durationMs: number;
  endTimeMs: number;
  argKeys?: string;
  /** Pseudonymous user ID, the same value as the span's `enduser.pseudo.id`. */
  userId?: string;
  /** Assistant platform, the same value as the span's `mcp.client.platform`. */
  platform?: string;
  /** Client User-Agent, the same value as the span's `user_agent.original`. */
  userAgent?: string;
  traceId?: string;
  spanId?: string;
}

function argKeys(args: unknown): string | undefined {
  if (typeof args !== "object" || args === null) return undefined;
  const keys = Object.keys(args).sort().join(",");
  return keys.length > 0 ? keys : undefined;
}

/**
 * Wraps server.registerTool so every tool handler runs inside a
 * `mcp.tool.<name>` span with bounded, privacy-safe attributes.
 * Argument keys are recorded; argument values never are. The caller is
 * identified only by a keyed pseudonym (see telemetry-user.ts).
 */
export interface ToolTelemetryOptions {
  /**
   * Resolves the pseudonymous ID of the user making the call, recorded as
   * `enduser.pseudo.id`. Return undefined to leave the attribute off.
   */
  resolveUserId?: () => Promise<string | undefined>;
  /** Called once per finished tool call. Must not throw or block. */
  onToolCall?: (record: ToolCallRecord) => void;
  /** Assistant platform making the call (see client-platform.ts), recorded as `mcp.client.platform`. */
  clientPlatform?: string;
  /** Client User-Agent (see `clientUserAgent`), recorded as `user_agent.original`. */
  clientUserAgent?: string;
}

export function instrumentToolRegistration(
  server: McpServer,
  options: ToolTelemetryOptions = {},
): McpServer {
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
        const platform = options.clientPlatform;
        if (platform) span.setAttribute("mcp.client.platform", platform);
        const userAgent = options.clientUserAgent;
        if (userAgent) span.setAttribute("user_agent.original", userAgent);
        const userId = await options.resolveUserId?.().catch(() => undefined);
        if (userId) span.setAttribute("enduser.pseudo.id", userId);
        const startedAt = Date.now();
        // Read before span.end(): an ended span no longer reports isRecording().
        const traceIds = span.isRecording() ? span.spanContext() : undefined;
        const report = (outcome: ToolOutcome, errorKind?: ToolErrorKind) => {
          if (!options.onToolCall) return;
          const endTimeMs = Date.now();
          try {
            options.onToolCall({
              tool: name,
              outcome,
              ...(errorKind ? { errorKind } : {}),
              durationMs: endTimeMs - startedAt,
              endTimeMs,
              argKeys: keys,
              userId,
              platform,
              userAgent,
              ...(traceIds ? { traceId: traceIds.traceId, spanId: traceIds.spanId } : {}),
            });
          } catch {
            // Telemetry must never affect a tool call.
          }
        };
        try {
          const result = await withScope((scope) => {
            scope.setTag("mcp.tool.name", name);
            return handler(args, extra);
          });
          const failed = result?.isError === true;
          const outcome: ToolOutcome = failed ? "returned_error" : "success";
          span.setAttribute("mcp.tool.outcome", outcome);
          // A result that sets isError without a kind came from outside our
          // tool helpers, so treat it as a fault.
          const errorKind = failed ? (result[TOOL_ERROR_KIND] ?? "upstream") : undefined;
          if (errorKind) span.setAttribute("mcp.tool.error_kind", errorKind);
          span.setStatus({
            code: failed ? SpanStatusCode.ERROR : SpanStatusCode.OK,
          });
          span.end();
          report(outcome, errorKind);
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
          report("thrown_error");
          throw error;
        }
      });

    return registerTool(name, config, observed);
  }) as RegisterTool as typeof server.registerTool;

  return server;
}

/**
 * otel-cf-workers ends the root fetch span as soon as the handler returns a
 * Response, then flushes the trace once every `ctx.waitUntil` promise settles,
 * force-ending any span still open. MCP tool calls answer over a streamed
 * (text/event-stream) body, so the handler returns before the tool finishes and
 * the tool span used to be exported without its outcome.
 *
 * Registering the body's completion with `waitUntil` keeps the flush waiting
 * until the stream has been fully written, which happens after the tool span
 * has ended.
 */
export function holdTraceUntilBodyDone(
  response: Response,
  waitUntil: (promise: Promise<unknown>) => void,
): Response {
  if (!response.body) return response;
  const { readable, writable } = new TransformStream();
  // A client disconnect cancels the stream; the rejection only means the body
  // ended early, which is still the end of the request.
  waitUntil(response.body.pipeTo(writable).catch(() => undefined));
  return new Response(readable, response);
}

const REDACTED = "[redacted]";

// Key prefixes written by @cloudflare/workers-oauth-provider and our auth flow.
// The rest of each key holds the user id, grant id, token hash, client id or
// sign-in flow id, so only the prefix is kept.
const KV_KEY_PREFIXES = ["token:", "grant:", "client:", "signup:", "cronometer:auth-flow:"];

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
