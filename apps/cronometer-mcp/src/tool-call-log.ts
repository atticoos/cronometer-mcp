import type { ToolCallRecord } from "./observability";

// Captured at module load, before otel-cf-workers wraps the global fetch on the
// first request, so shipping a log record does not create an extra fetch span.
const uninstrumentedFetch: typeof fetch = globalThis.fetch.bind(globalThis);

export interface ToolCallLogConfig {
  /** OTLP trace URL, as configured for tracing (ends in `/v1/traces`). */
  tracesEndpoint?: string;
  headers: Record<string, string>;
  serviceName: string;
}

/**
 * The OTLP logs URL that sits beside the configured trace URL, or undefined
 * when the trace URL is missing or does not follow the `/v1/traces` layout.
 */
export function logsEndpoint(tracesEndpoint: string | undefined): string | undefined {
  if (!tracesEndpoint) return undefined;
  const trimmed = tracesEndpoint.replace(/\/+$/, "");
  if (!trimmed.endsWith("/v1/traces")) return undefined;
  return `${trimmed.slice(0, -"/v1/traces".length)}/v1/logs`;
}

function stringAttribute(key: string, value: string) {
  return { key, value: { stringValue: value } };
}

/** One OTLP/JSON log record per tool call, the payload Grafana Cloud stores in Loki. */
export function toolCallLogPayload(record: ToolCallRecord, serviceName: string) {
  const attributes = [
    stringAttribute("mcp.tool.name", record.tool),
    stringAttribute("mcp.tool.outcome", record.outcome),
    { key: "mcp.tool.duration_ms", value: { intValue: String(Math.round(record.durationMs)) } },
  ];
  if (record.argKeys) attributes.push(stringAttribute("mcp.tool.arg_keys", record.argKeys));

  const failed = record.outcome !== "success";
  return {
    resourceLogs: [
      {
        resource: { attributes: [stringAttribute("service.name", serviceName)] },
        scopeLogs: [
          {
            scope: { name: "cronometer-mcp" },
            logRecords: [
              {
                timeUnixNano: `${BigInt(Math.round(record.endTimeMs)) * 1_000_000n}`,
                severityNumber: failed ? 13 : 9,
                severityText: failed ? "WARN" : "INFO",
                eventName: "mcp.tool.call",
                body: { stringValue: `mcp.tool.call ${record.tool} ${record.outcome}` },
                attributes,
                ...(record.traceId ? { traceId: record.traceId } : {}),
                ...(record.spanId ? { spanId: record.spanId } : {}),
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Returns a sink that ships each tool call to the OTLP logs endpoint, or
 * undefined when telemetry export is not configured. Delivery is best effort:
 * failures are swallowed so telemetry never affects a tool call.
 */
export function createToolCallLogSink(
  config: ToolCallLogConfig,
  schedule: (promise: Promise<unknown>) => void,
  fetchImpl: typeof fetch = uninstrumentedFetch,
): ((record: ToolCallRecord) => void) | undefined {
  const url = logsEndpoint(config.tracesEndpoint);
  if (!url) return undefined;

  return (record) => {
    const body = JSON.stringify(toolCallLogPayload(record, config.serviceName));
    schedule(
      fetchImpl(url, {
        method: "POST",
        headers: { ...config.headers, "Content-Type": "application/json" },
        body,
      })
        .then((response) => response.body?.cancel())
        .catch(() => undefined),
    );
  };
}
