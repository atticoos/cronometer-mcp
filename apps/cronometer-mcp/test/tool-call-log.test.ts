import { beforeAll, describe, expect, it } from "vitest";
import { trace } from "@opentelemetry/api";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer, type Server } from "@modelcontextprotocol/server";
import { z } from "zod";

import { instrumentToolRegistration, type ToolCallRecord } from "../src/observability";
import { createToolCallLogSink, logsEndpoint, toolCallLogPayload } from "../src/tool-call-log";

const record: ToolCallRecord = {
  tool: "search_foods",
  outcome: "success",
  durationMs: 41.6,
  endTimeMs: 1_794_064_553_000,
  argKeys: "query",
  userId: "5f2b9c0e1a7d4e3f8b6a0c9d2e1f4a7b",
  platform: "claude",
  userAgent: "Claude-User",
  traceId: "0af7651916cd43dd8448eb211c80319c",
  spanId: "b7ad6b7169203331",
};

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

describe("toolCallLogPayload", () => {
  it("encodes the call as one OTLP log record", () => {
    const payload = toolCallLogPayload(record, "cronometer-mcp");
    const resourceLog = payload.resourceLogs[0];
    expect(resourceLog.resource.attributes).toEqual([
      { key: "service.name", value: { stringValue: "cronometer-mcp" } },
    ]);
    const log = resourceLog.scopeLogs[0].logRecords[0];
    expect(log.timeUnixNano).toBe("1794064553000000000");
    expect(log.eventName).toBe("mcp.tool.call");
    expect(log.severityText).toBe("INFO");
    expect(log.traceId).toBe(record.traceId);
    expect(log.spanId).toBe(record.spanId);
    expect(log.attributes).toEqual([
      { key: "mcp.tool.name", value: { stringValue: "search_foods" } },
      { key: "mcp.tool.outcome", value: { stringValue: "success" } },
      { key: "mcp.tool.duration_ms", value: { intValue: "42" } },
      { key: "mcp.tool.arg_keys", value: { stringValue: "query" } },
      { key: "enduser.pseudo.id", value: { stringValue: "5f2b9c0e1a7d4e3f8b6a0c9d2e1f4a7b" } },
      { key: "mcp.client.platform", value: { stringValue: "claude" } },
      { key: "user_agent.original", value: { stringValue: "Claude-User" } },
    ]);
  });

  it("marks failed calls as warnings", () => {
    const log = toolCallLogPayload({ ...record, outcome: "thrown_error" }, "svc").resourceLogs[0]
      .scopeLogs[0].logRecords[0];
    expect(log.severityText).toBe("WARN");
  });

  it("records why a returned error failed", () => {
    const log = toolCallLogPayload({ ...record, outcome: "returned_error", errorKind: "auth" }, "svc")
      .resourceLogs[0].scopeLogs[0].logRecords[0];
    expect(log.attributes).toContainEqual({ key: "mcp.tool.error_kind", value: { stringValue: "auth" } });
  });
});

describe("createToolCallLogSink", () => {
  it("is undefined when OTLP export is not configured", () => {
    expect(createToolCallLogSink({ headers: {}, serviceName: "svc" }, () => {})).toBeUndefined();
  });

  it("posts the record to the logs endpoint with the OTLP headers", async () => {
    const requests: Request[] = [];
    const scheduled: Promise<unknown>[] = [];
    const sink = createToolCallLogSink(
      {
        tracesEndpoint: "https://otlp.example.net/otlp/v1/traces",
        headers: { Authorization: "Basic abc" },
        serviceName: "cronometer-mcp",
      },
      (promise) => scheduled.push(promise),
      async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 200 });
      },
    );
    sink?.(record);
    await Promise.all(scheduled);

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://otlp.example.net/otlp/v1/logs");
    expect(requests[0].headers.get("Authorization")).toBe("Basic abc");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");
    const body = await requests[0].json();
    expect(body).toEqual(toolCallLogPayload(record, "cronometer-mcp"));
  });

  it("swallows delivery failures", async () => {
    const scheduled: Promise<unknown>[] = [];
    const sink = createToolCallLogSink(
      { tracesEndpoint: "https://otlp.example.net/v1/traces", headers: {}, serviceName: "svc" },
      (promise) => scheduled.push(promise),
      async () => {
        throw new Error("network down");
      },
    );
    sink?.(record);
    await expect(Promise.all(scheduled)).resolves.toBeDefined();
  });
});

describe("onToolCall", () => {
  const exporter = new InMemorySpanExporter();
  beforeAll(() => {
    trace.setGlobalTracerProvider(
      new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }),
    );
  });

  async function connect(onToolCall: (record: ToolCallRecord) => void) {
    const mcp = instrumentToolRegistration(new McpServer({ name: "t", version: "0" }), {
      onToolCall,
    });
    mcp.registerTool("echo", { inputSchema: z.object({ text: z.string() }) }, async ({ text }) => ({
      content: [{ type: "text", text }],
    }));
    mcp.registerTool("fail", { inputSchema: z.object({}) }, async () => ({
      content: [{ type: "text", text: "nope" }],
      isError: true,
    }));
    mcp.registerTool("boom", { inputSchema: z.object({}) }, async () => {
      throw new Error("boom");
    });
    const server = (mcp as unknown as { server: Server }).server;
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
  }

  it("reports one record per call with its outcome", async () => {
    const records: ToolCallRecord[] = [];
    const client = await connect((r) => records.push(r));

    await client.callTool({ name: "echo", arguments: { text: "hi" } });
    await client.callTool({ name: "fail", arguments: {} });
    await client.callTool({ name: "boom", arguments: {} }).catch(() => undefined);

    expect(records.map((r) => [r.tool, r.outcome])).toEqual([
      ["echo", "success"],
      ["fail", "returned_error"],
      ["boom", "thrown_error"],
    ]);
    expect(records[0].argKeys).toBe("text");
    // A bare isError result has no kind from our helpers, so it counts as a fault.
    expect(records[1].errorKind).toBe("upstream");
    expect(records[0].durationMs).toBeGreaterThanOrEqual(0);

    const span = exporter.getFinishedSpans().find((s) => s.name === "mcp.tool echo");
    expect(span).toBeDefined();
    expect(records[0].traceId).toBe(span?.spanContext().traceId);
    expect(records[0].spanId).toBe(span?.spanContext().spanId);
  });

  it("keeps the tool call working when the sink throws", async () => {
    const client = await connect(() => {
      throw new Error("sink broke");
    });
    const result = await client.callTool({ name: "echo", arguments: { text: "still here" } });
    expect(result.isError).not.toBe(true);
  });
});
