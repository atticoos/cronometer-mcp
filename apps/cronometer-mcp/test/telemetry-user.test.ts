import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer, type Server } from "@modelcontextprotocol/server";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { trace } from "@opentelemetry/api";

import { instrumentToolRegistration } from "../src/observability";
import { telemetryUserId } from "../src/telemetry-user";

describe("telemetryUserId", () => {
  it("is stable for the same user and secret", async () => {
    const a = await telemetryUserId("secret", "12345");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await telemetryUserId("secret", "12345")).toBe(a);
  });

  it("differs across users and secrets", async () => {
    const base = await telemetryUserId("secret", "12345");
    expect(await telemetryUserId("secret", "12346")).not.toBe(base);
    expect(await telemetryUserId("other", "12345")).not.toBe(base);
  });

  it("is omitted without a secret or user", async () => {
    expect(await telemetryUserId(undefined, "12345")).toBeUndefined();
    expect(await telemetryUserId("secret", undefined)).toBeUndefined();
  });
});

describe("tool span user attribute", () => {
  async function callWith(resolveUserId?: () => Promise<string | undefined>) {
    const exporter = new InMemorySpanExporter();
    trace.disable();
    trace.setGlobalTracerProvider(
      new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }),
    );
    const mcp = instrumentToolRegistration(new McpServer({ name: "t", version: "0" }), { resolveUserId });
    mcp.registerTool("ping", { description: "ping" }, async () => ({ content: [] }));
    const server = (mcp as unknown as { server: Server }).server;
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    await client.callTool({ name: "ping", arguments: {} });
    return exporter.getFinishedSpans().find((span) => span.name === "mcp.tool ping");
  }

  it("records enduser.pseudo.id when resolved", async () => {
    const span = await callWith(async () => "abc123");
    expect(span?.attributes["enduser.pseudo.id"]).toBe("abc123");
    expect(span?.attributes["mcp.tool.outcome"]).toBe("success");
  });

  it("still records the call when resolving fails", async () => {
    const span = await callWith(async () => {
      throw new Error("boom");
    });
    expect(span?.attributes["enduser.pseudo.id"]).toBeUndefined();
    expect(span?.attributes["mcp.tool.outcome"]).toBe("success");
  });
});
