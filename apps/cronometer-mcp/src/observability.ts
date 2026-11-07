import { SpanStatusCode, trace } from "@opentelemetry/api";
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

export type ToolOutcome = "success" | "returned_error" | "thrown_error";

/** A finished tool call, as handed to an `onToolCall` sink. */
export interface ToolCallRecord {
  tool: string;
  outcome: ToolOutcome;
  durationMs: number;
  endTimeMs: number;
  argKeys?: string;
  traceId?: string;
  spanId?: string;
}

export interface ToolInstrumentationOptions {
  /** Called once per finished tool call. Must not throw or block. */
  onToolCall?: (record: ToolCallRecord) => void;
}

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
export function instrumentToolRegistration(
  server: McpServer,
  options: ToolInstrumentationOptions = {},
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
        const startedAt = Date.now();
        const { traceId, spanId } = span.spanContext();
        const report = (outcome: ToolOutcome) => {
          if (!options.onToolCall) return;
          const endTimeMs = Date.now();
          try {
            options.onToolCall({
              tool: name,
              outcome,
              durationMs: endTimeMs - startedAt,
              endTimeMs,
              argKeys: keys,
              ...(span.isRecording() ? { traceId, spanId } : {}),
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
          span.setStatus({
            code: failed ? SpanStatusCode.ERROR : SpanStatusCode.OK,
          });
          span.end();
          report(outcome);
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
