import type { Logger } from "./logger";
import type { ToolCallRecord } from "./observability";

/**
 * Logs one `mcp.tool.call` event per finished tool call, linked to the tool's
 * span. Usage dashboards read these from Loki, where one LogQL query covers any
 * range instead of day-by-day Tempo scans.
 */
export function logToolCall(logger: Logger, record: ToolCallRecord): void {
  logger.log(
    record.outcome === "success" ? "info" : "warn",
    "mcp.tool.call",
    {
      "mcp.tool.name": record.tool,
      "mcp.tool.outcome": record.outcome,
      "mcp.tool.duration_ms": Math.round(record.durationMs),
      "mcp.tool.error_kind": record.errorKind,
      "mcp.tool.arg_keys": record.argKeys,
      "enduser.pseudo.id": record.userId,
      "mcp.client.platform": record.platform,
      "user_agent.original": record.userAgent,
    },
    {
      message: `mcp.tool.call ${record.tool} ${record.outcome}`,
      timeMs: record.endTimeMs,
      traceId: record.traceId,
      spanId: record.spanId,
    },
  );
}
