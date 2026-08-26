import { beforeAll, describe, expect, it } from "vitest";
import type { Server } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { trace } from "@opentelemetry/api";

import { createServer } from "../src/index";

const exporter = new InMemorySpanExporter();

beforeAll(async () => {
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
  const server: Server = (createServer() as unknown as { server: Server }).server;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

let client: Client;

describe("tool telemetry", () => {
  it("creates a mcp.tool span for a successful tool call", async () => {
    await client.callTool({ name: "connection_status", arguments: {} });
    const spans = exporter
      .getFinishedSpans()
      .filter((span) => span.name.startsWith("mcp.tool "));
    expect(spans.length).toBeGreaterThan(0);
    const span = spans[0];
    expect(span.attributes["mcp.tool.name"]).toBe("connection_status");
    expect(span.attributes["mcp.tool.outcome"]).toBe("success");
  });

  it("marks returned tool errors with outcome=returned_error", async () => {
    await client.callTool({
      name: "get_cronometer_data",
      arguments: { dataType: "servings", startDate: "nope", endDate: "2026-01-01" },
    });
    const spans = exporter
      .getFinishedSpans()
      .filter((span) => span.name === "mcp.tool get_cronometer_data");
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.at(-1)?.attributes["mcp.tool.outcome"]).toBe("returned_error");
  });
});
