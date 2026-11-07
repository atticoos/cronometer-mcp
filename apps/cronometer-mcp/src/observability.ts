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
