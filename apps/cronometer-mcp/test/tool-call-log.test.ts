import { beforeAll, describe, expect, it } from "vitest";
import { trace } from "@opentelemetry/api";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer, type Server } from "@modelcontextprotocol/server";
import { z } from "zod";

import { instrumentToolRegistration, type ToolCallRecord } from "../src/observability";
import { createLogger, otlpLogsPayload, type LogRecord } from "../src/logger";
import { logToolCall } from "../src/tool-call-log";

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

// The OTLP payload a tool call produces. Dashboards in Grafana read these exact
// names from Loki, so a change here needs the dashboards updated in step.
function payloadFor(r: ToolCallRecord) {
  const records: LogRecord[] = [];
  logToolCall(createLogger((entry) => records.push(entry)), r);
  return otlpLogsPayload(records, "cronometer-mcp").resourceLogs[0].scopeLogs[0].logRecords[0];
}

describe("logToolCall", () => {
  it("encodes the call as one OTLP log record with the dashboard schema", () => {
    expect(payloadFor(record)).toEqual({
      timeUnixNano: "1794064553000000000",
      severityNumber: 9,
      severityText: "INFO",
      eventName: "mcp.tool.call",
      body: { stringValue: "mcp.tool.call search_foods success" },
      attributes: [
        { key: "mcp.tool.name", value: { stringValue: "search_foods" } },
        { key: "mcp.tool.outcome", value: { stringValue: "success" } },
        { key: "mcp.tool.duration_ms", value: { intValue: "42" } },
        { key: "mcp.tool.arg_keys", value: { stringValue: "query" } },
        { key: "enduser.pseudo.id", value: { stringValue: "5f2b9c0e1a7d4e3f8b6a0c9d2e1f4a7b" } },
        { key: "mcp.client.platform", value: { stringValue: "claude" } },
        { key: "user_agent.original", value: { stringValue: "Claude-User" } },
      ],
      traceId: record.traceId,
      spanId: record.spanId,
    });
  });

  it("marks failed calls as warnings", () => {
    const log = payloadFor({ ...record, outcome: "thrown_error" });
    expect(log.severityText).toBe("WARN");
    expect(log.severityNumber).toBe(13);
  });

  it("records why a returned error failed", () => {
    const log = payloadFor({ ...record, outcome: "returned_error", errorKind: "auth" });
    expect(log.attributes).toContainEqual({ key: "mcp.tool.error_kind", value: { stringValue: "auth" } });
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
