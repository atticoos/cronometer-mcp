import { beforeAll, describe, expect, it } from "vitest";
import type { Server } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { trace } from "@opentelemetry/api";

import { createServer } from "../src/index";
import { RedactingSpanProcessor, redactSpanAttributes } from "../src/observability";

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

describe("span redaction", () => {
  it("keeps only the prefix of OAuth KV keys", () => {
    const attributes = {
      "db.system": "Cloudflare KV",
      "db.operation": "get",
      "db.cf.kv.key": "token:abc123:grantId:tokenHash",
      "db.statement": "get token:abc123:grantId:tokenHash",
    };
    redactSpanAttributes(attributes);
    expect(attributes["db.cf.kv.key"]).toBe("token:[redacted]");
    expect(attributes["db.statement"]).toBe("get [redacted]");
  });

  it("redacts keys with prefixes it does not know", () => {
    const attributes = {
      "db.system": "Cloudflare KV",
      "db.operation": "put",
      "db.cf.kv.key": "something-else:secret",
      "db.statement": "put something-else:secret",
    };
    redactSpanAttributes(attributes);
    expect(attributes["db.cf.kv.key"]).toBe("[redacted]");
    expect(JSON.stringify(attributes)).not.toContain("secret");
  });

  it("removes query values from URLs but keeps parameter names", () => {
    const attributes = {
      "url.full": "https://cronometer.com/export?nonce=f46573b9&generate=servings#top",
      "url.query": "?nonce=f46573b9&generate=servings",
      "url.path": "/export",
      "http.url": "https://example.com/cache?key=value",
    };
    redactSpanAttributes(attributes);
    expect(attributes["url.full"]).toBe(
      "https://cronometer.com/export?nonce=[redacted]&generate=[redacted]",
    );
    expect(attributes["url.query"]).toBe("?nonce=[redacted]&generate=[redacted]");
    expect(attributes["url.path"]).toBe("/export");
    expect(attributes["http.url"]).toBe("https://example.com/cache?key=[redacted]");
  });

  it("leaves URLs without a query untouched", () => {
    const attributes = { "url.full": "https://cronometer-mcp.dev/mcp", "url.query": "" };
    redactSpanAttributes(attributes);
    expect(attributes).toEqual({ "url.full": "https://cronometer-mcp.dev/mcp", "url.query": "" });
  });

  it("redacts spans before handing them to the wrapped processor", () => {
    const seen: string[] = [];
    const inner = {
      onStart: () => undefined,
      onEnd: (span: { attributes: Record<string, unknown> }) => {
        seen.push(String(span.attributes["db.cf.kv.key"]));
      },
      forceFlush: async () => undefined,
      shutdown: async () => undefined,
    };
    const processor = new RedactingSpanProcessor(inner as never);
    processor.onEnd({
      attributes: { "db.system": "Cloudflare KV", "db.cf.kv.key": "grant:user:grant" },
    } as never);
    expect(seen).toEqual(["grant:[redacted]"]);
  });
});
