import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer, type Server } from "@modelcontextprotocol/server";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { trace } from "@opentelemetry/api";

import { clientPlatform } from "../src/client-platform";
import { instrumentToolRegistration, type ToolCallRecord } from "../src/observability";

describe("clientPlatform", () => {
  it.each([
    ["Claude-User", "claude"],
    ["claude-code/2.1.0", "claude"],
    ["openai-mcp/1.0.0", "chatgpt"],
    ["openai-connectors-oauth/1.0", "chatgpt"],
    ["Cursor/1.0.0", "cursor"],
    ["Visual Studio Code/1.99.0", "vscode"],
    ["python-httpx/0.28.1", "other"],
    ["DailyBalance/1.0", "other"],
    ["", "unknown"],
    [null, "unknown"],
  ])("maps %j to %s", (userAgent, platform) => {
    expect(clientPlatform(userAgent)).toBe(platform);
  });
});

describe("tool span platform attribute", () => {
  async function call(platform?: string) {
    const exporter = new InMemorySpanExporter();
    trace.disable();
    trace.setGlobalTracerProvider(
      new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }),
    );
    const records: ToolCallRecord[] = [];
    const mcp = instrumentToolRegistration(new McpServer({ name: "t", version: "0" }), {
      clientPlatform: platform,
      onToolCall: (record) => records.push(record),
    });
    mcp.registerTool("ping", { description: "ping" }, async () => ({ content: [] }));
    const server = (mcp as unknown as { server: Server }).server;
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    await client.callTool({ name: "ping", arguments: {} });
    const span = exporter.getFinishedSpans().find((s) => s.name === "mcp.tool ping");
    return { span, record: records[0] };
  }

  it("records mcp.client.platform on the span and the log record", async () => {
    const { span, record } = await call("chatgpt");
    expect(span?.attributes["mcp.client.platform"]).toBe("chatgpt");
    expect(record.platform).toBe("chatgpt");
  });

  it("leaves the attribute off when no platform is given", async () => {
    const { span, record } = await call();
    expect(span?.attributes["mcp.client.platform"]).toBeUndefined();
    expect(record.platform).toBeUndefined();
  });
});
