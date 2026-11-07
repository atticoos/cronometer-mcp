import { beforeAll, describe, expect, it } from "vitest";
import type { Server } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { trace } from "@opentelemetry/api";

import { createServer } from "../src/index";
import { holdTraceUntilBodyDone } from "../src/observability";

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

describe("holdTraceUntilBodyDone", () => {
  it("keeps the trace open until a streamed body has been fully read", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
    const original = new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream", "mcp-session-id": "abc" },
    });

    const pending: Promise<unknown>[] = [];
    const response = holdTraceUntilBodyDone(original, (promise) => pending.push(promise));
    expect(pending).toHaveLength(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("mcp-session-id")).toBe("abc");

    let settled = false;
    void pending[0].then(() => (settled = true));
    const text = response.text();

    controller.enqueue(new TextEncoder().encode("event: message\ndata: {}\n\n"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    controller.close();
    await expect(text).resolves.toBe("event: message\ndata: {}\n\n");
    await pending[0];
    expect(settled).toBe(true);
  });

  it("settles when the client cancels the stream", async () => {
    const body = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => {}) });
    const pending: Promise<unknown>[] = [];
    const response = holdTraceUntilBodyDone(new Response(body), (p) => pending.push(p));
    await response.body?.cancel();
    await expect(pending[0]).resolves.toBeUndefined();
  });

  it("passes bodiless responses through untouched", () => {
    const original = new Response(null, { status: 202 });
    const pending: Promise<unknown>[] = [];
    expect(holdTraceUntilBodyDone(original, (p) => pending.push(p))).toBe(original);
    expect(pending).toHaveLength(0);
  });
});
