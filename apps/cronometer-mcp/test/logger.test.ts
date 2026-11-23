import { describe, expect, it, vi } from "vitest";
import { trace } from "@opentelemetry/api";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";

import {
  createLogger,
  loggerFromEnv,
  logsEndpoint,
  otlpLogsPayload,
  parseOtlpHeaders,
  type LogRecord,
} from "../src/logger";

function capture() {
  const records: LogRecord[] = [];
  return { records, logger: createLogger((record) => records.push(record)) };
}

const signIn = { "oauth.signup.status": "new", "mcp.client.platform": "claude" } as const;

describe("logsEndpoint", () => {
  it("derives the logs URL from the trace URL", () => {
    expect(logsEndpoint("https://otlp.example.net/otlp/v1/traces")).toBe(
      "https://otlp.example.net/otlp/v1/logs",
    );
    expect(logsEndpoint("https://otlp.example.net/otlp/v1/traces/")).toBe(
      "https://otlp.example.net/otlp/v1/logs",
    );
  });

  it("is undefined when tracing is unconfigured or the URL is not a trace URL", () => {
    expect(logsEndpoint(undefined)).toBeUndefined();
    expect(logsEndpoint("https://otlp.example.net/otlp")).toBeUndefined();
  });
});

describe("parseOtlpHeaders", () => {
  it("parses the OTel env header format", () => {
    expect(parseOtlpHeaders("Authorization=Basic a=b, X-Scope = 1,bogus")).toEqual({
      Authorization: "Basic a=b",
      "X-Scope": "1",
    });
    expect(parseOtlpHeaders(undefined)).toEqual({});
  });
});

describe("createLogger", () => {
  it("records level, event, message, time and attributes", () => {
    const { records, logger } = capture();
    logger.warn("oauth.authorization", signIn, { message: "hello", timeMs: 1_000 });
    expect(records).toEqual([
      {
        level: "warn",
        event: "oauth.authorization",
        message: "hello",
        timeMs: 1_000,
        attributes: { "oauth.signup.status": "new", "mcp.client.platform": "claude" },
      },
    ]);
  });

  it("defaults the message to the event name and the time to now", () => {
    const { records, logger } = capture();
    const before = Date.now();
    logger.info("oauth.authorization", signIn);
    expect(records[0].message).toBe("oauth.authorization");
    expect(records[0].timeMs).toBeGreaterThanOrEqual(before);
  });

  it("drops undefined and non-finite attributes", () => {
    const { records, logger } = capture();
    logger.info("mcp.tool.call", {
      "mcp.tool.name": "echo",
      "mcp.tool.outcome": "success",
      "mcp.tool.duration_ms": Number.NaN,
      "enduser.pseudo.id": undefined,
    });
    expect(records[0].attributes).toEqual({ "mcp.tool.name": "echo", "mcp.tool.outcome": "success" });
  });

  it("links the record to the active span", () => {
    const { records, logger } = capture();
    // The Workers runtime's context manager (installed by otel-cf-workers) is
    // absent in tests, so stand in for the active span directly.
    const span = new BasicTracerProvider().getTracer("test").startSpan("work");
    const active = vi.spyOn(trace, "getActiveSpan").mockReturnValue(span);
    try {
      logger.info("oauth.authorization", signIn);
    } finally {
      active.mockRestore();
      span.end();
    }
    expect(records[0].traceId).toBe(span.spanContext().traceId);
    expect(records[0].spanId).toBe(span.spanContext().spanId);
  });

  it("prefers explicit trace context over the active span", () => {
    const { records, logger } = capture();
    logger.info("oauth.authorization", signIn, { traceId: "a".repeat(32), spanId: "b".repeat(16) });
    expect(records[0]).toMatchObject({ traceId: "a".repeat(32), spanId: "b".repeat(16) });
  });

  it("leaves trace context off outside a recording span", () => {
    const { records, logger } = capture();
    trace.getTracer("noop").startActiveSpan("noop", (span) => {
      logger.info("oauth.authorization", signIn);
      span.end();
    });
    expect(records[0].traceId).toBeUndefined();
  });

  it("never throws, even when the transport does", () => {
    const logger = createLogger(() => {
      throw new Error("transport broke");
    });
    expect(() => logger.error("oauth.authorization", signIn)).not.toThrow();
  });

  it("is a no-op without a transport", () => {
    expect(() => createLogger(undefined).info("oauth.authorization", signIn)).not.toThrow();
  });
});

describe("otlpLogsPayload", () => {
  it("encodes records as OTLP/JSON with typed values", () => {
    const payload = otlpLogsPayload(
      [
        {
          level: "error",
          event: "mcp.tool.call",
          message: "m",
          timeMs: 1_794_064_553_000,
          attributes: { s: "x", i: 42, d: 1.5, b: true },
          traceId: "0af7651916cd43dd8448eb211c80319c",
          spanId: "b7ad6b7169203331",
        },
      ],
      "svc",
    );
    const resourceLog = payload.resourceLogs[0];
    expect(resourceLog.resource.attributes).toEqual([{ key: "service.name", value: { stringValue: "svc" } }]);
    expect(resourceLog.scopeLogs[0].logRecords[0]).toEqual({
      timeUnixNano: "1794064553000000000",
      severityNumber: 17,
      severityText: "ERROR",
      eventName: "mcp.tool.call",
      body: { stringValue: "m" },
      attributes: [
        { key: "s", value: { stringValue: "x" } },
        { key: "i", value: { intValue: "42" } },
        { key: "d", value: { doubleValue: 1.5 } },
        { key: "b", value: { boolValue: true } },
      ],
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
    });
  });
});

describe("loggerFromEnv", () => {
  const env = {
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://otlp.example.net/otlp/v1/traces",
    OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Basic abc",
    OTEL_SERVICE_NAME: "cronometer-mcp",
  };

  it("posts each record to the logs endpoint with the OTLP headers", async () => {
    const requests: Request[] = [];
    const scheduled: Promise<unknown>[] = [];
    const logger = loggerFromEnv(
      env,
      (promise) => scheduled.push(promise),
      async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 200 });
      },
    );
    logger.info("oauth.authorization", signIn, { timeMs: 0 });
    await Promise.all(scheduled);

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://otlp.example.net/otlp/v1/logs");
    expect(requests[0].headers.get("Authorization")).toBe("Basic abc");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");
    const body = (await requests[0].json()) as ReturnType<typeof otlpLogsPayload>;
    expect(body.resourceLogs[0].scopeLogs[0].logRecords[0].eventName).toBe("oauth.authorization");
  });

  it("sends nothing when OTLP export is not configured", () => {
    let calls = 0;
    const logger = loggerFromEnv({}, () => calls++, async () => {
      calls++;
      return new Response();
    });
    logger.info("oauth.authorization", signIn);
    expect(calls).toBe(0);
  });

  it("swallows delivery failures", async () => {
    const scheduled: Promise<unknown>[] = [];
    const logger = loggerFromEnv(
      env,
      (promise) => scheduled.push(promise),
      async () => {
        throw new Error("network down");
      },
    );
    logger.info("oauth.authorization", signIn);
    await expect(Promise.all(scheduled)).resolves.toBeDefined();
  });
});
