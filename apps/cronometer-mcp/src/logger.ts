import { isSpanContextValid, trace } from "@opentelemetry/api";
import type { LogEventName, LogEvents } from "./log-events";

// Captured at module load, before otel-cf-workers wraps the global fetch on the
// first request, so shipping a log record does not create an extra fetch span.
const uninstrumentedFetch: typeof fetch = globalThis.fetch.bind(globalThis);

export type LogLevel = "debug" | "info" | "warn" | "error";

// OTLP SeverityNumber for each level (the first of each range).
const SEVERITY_NUMBER: Record<LogLevel, number> = { debug: 5, info: 9, warn: 13, error: 17 };

export interface LogOptions {
  /** Human-readable line shown in Loki. Defaults to the event name. */
  message?: string;
  /** When the event happened. Defaults to now. */
  timeMs?: number;
  /**
   * Trace context to link the record to. Defaults to the active span, so
   * records emitted inside a request join its trace without extra work.
   */
  traceId?: string;
  spanId?: string;
}

/** A log record before encoding, as handed to a transport. */
export interface LogRecord {
  level: LogLevel;
  event: LogEventName;
  message: string;
  timeMs: number;
  attributes: Record<string, string | number | boolean>;
  traceId?: string;
  spanId?: string;
}

type Emit = <E extends LogEventName>(event: E, attributes: LogEvents[E], options?: LogOptions) => void;

/**
 * Structured logger. Every record names an event from the catalogue in
 * log-events.ts, whose attribute types it enforces. Logging never throws and
 * never blocks the caller: delivery is scheduled and best effort.
 */
export interface Logger {
  debug: Emit;
  info: Emit;
  warn: Emit;
  error: Emit;
  /** Logs at a level picked at runtime, such as WARN for a failed call. */
  log: <E extends LogEventName>(
    level: LogLevel,
    event: E,
    attributes: LogEvents[E],
    options?: LogOptions,
  ) => void;
}

export type LogTransport = (record: LogRecord) => void;

function activeTraceContext(): { traceId?: string; spanId?: string } {
  const context = trace.getActiveSpan()?.spanContext();
  return context && isSpanContextValid(context) ? { traceId: context.traceId, spanId: context.spanId } : {};
}

function cleanAttributes(attributes: object): LogRecord["attributes"] {
  const clean: LogRecord["attributes"] = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === "string" || typeof value === "boolean") clean[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
  }
  return clean;
}

/** Builds a logger over a transport; with no transport every call is a no-op. */
export function createLogger(transport: LogTransport | undefined): Logger {
  const log: Logger["log"] = (level, event, attributes, options = {}) => {
    if (!transport) return;
    try {
      const traceContext = options.traceId ? options : activeTraceContext();
      transport({
        level,
        event,
        message: options.message ?? event,
        timeMs: options.timeMs ?? Date.now(),
        attributes: cleanAttributes(attributes),
        ...(traceContext.traceId ? { traceId: traceContext.traceId } : {}),
        ...(traceContext.spanId ? { spanId: traceContext.spanId } : {}),
      });
    } catch {
      // Logging must never affect the request that produced it.
    }
  };
  return {
    log,
    debug: (event, attributes, options) => log("debug", event, attributes, options),
    info: (event, attributes, options) => log("info", event, attributes, options),
    warn: (event, attributes, options) => log("warn", event, attributes, options),
    error: (event, attributes, options) => log("error", event, attributes, options),
  };
}

function anyValue(value: string | number | boolean) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { boolValue: value };
  return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
}

/** Encodes records as one OTLP/JSON logs payload, the format Grafana Cloud stores in Loki. */
export function otlpLogsPayload(records: LogRecord[], serviceName: string) {
  return {
    resourceLogs: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: serviceName } }] },
        scopeLogs: [
          {
            scope: { name: "cronometer-mcp" },
            logRecords: records.map((record) => ({
              timeUnixNano: `${BigInt(Math.round(record.timeMs)) * 1_000_000n}`,
              severityNumber: SEVERITY_NUMBER[record.level],
              severityText: record.level.toUpperCase(),
              eventName: record.event,
              body: { stringValue: record.message },
              attributes: Object.entries(record.attributes).map(([key, value]) => ({
                key,
                value: anyValue(value),
              })),
              ...(record.traceId ? { traceId: record.traceId } : {}),
              ...(record.spanId ? { spanId: record.spanId } : {}),
            })),
          },
        ],
      },
    ],
  };
}

export interface OtlpLogConfig {
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

/**
 * A transport that posts each record to the OTLP logs endpoint beside the
 * configured trace URL, or undefined when telemetry export is not configured.
 * Failures are swallowed so telemetry never affects the request.
 */
export function otlpLogTransport(
  config: OtlpLogConfig,
  schedule: (promise: Promise<unknown>) => void,
  fetchImpl: typeof fetch = uninstrumentedFetch,
): LogTransport | undefined {
  const url = logsEndpoint(config.tracesEndpoint);
  if (!url) return undefined;

  return (record) => {
    schedule(
      fetchImpl(url, {
        method: "POST",
        headers: { ...config.headers, "Content-Type": "application/json" },
        body: JSON.stringify(otlpLogsPayload([record], config.serviceName)),
      })
        .then((response) => response.body?.cancel())
        .catch(() => undefined),
    );
  };
}

/** Parses `OTEL_EXPORTER_OTLP_HEADERS` (`key=value,key=value`) into a header map. */
export function parseOtlpHeaders(raw: string | undefined): Record<string, string> {
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

type TelemetryEnv = Pick<
  Partial<Env>,
  "OTEL_EXPORTER_OTLP_ENDPOINT" | "OTEL_EXPORTER_OTLP_HEADERS" | "OTEL_SERVICE_NAME"
>;

/**
 * The Worker's logger: ships to Grafana Cloud over the same OTLP endpoint and
 * credentials as traces, and does nothing when they are not configured.
 */
export function loggerFromEnv(
  env: TelemetryEnv,
  schedule: (promise: Promise<unknown>) => void,
  fetchImpl?: typeof fetch,
): Logger {
  return createLogger(
    otlpLogTransport(
      {
        tracesEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
        headers: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
        serviceName: env.OTEL_SERVICE_NAME ?? "cronometer-mcp",
      },
      schedule,
      fetchImpl,
    ),
  );
}
