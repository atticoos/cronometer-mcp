import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer, type Server } from "@modelcontextprotocol/server";
import { registerCronometerTools, type AuthContext } from "@cronometer-mcp/core";

import { instrumentToolRegistration, type ToolCallRecord } from "../src/observability";

const auth: AuthContext = {
  cronometerMobileSession: { sessionKey: "key", userId: 1 },
  cronometerUsername: "user@example.com",
  cronometerWebSession: { cookies: "c=1", userId: "1" },
};

async function connect(getAuthContext: () => AuthContext | null) {
  const records: ToolCallRecord[] = [];
  const reported: unknown[] = [];
  const mcp = instrumentToolRegistration(new McpServer({ name: "t", version: "0" }), {
    onToolCall: (record) => records.push(record),
  });
  registerCronometerTools(mcp, { getAuthContext, onError: (error) => reported.push(error) });
  const server = (mcp as unknown as { server: Server }).server;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, records, reported };
}

function respondWith(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tool error kinds", () => {
  it("classifies a missing connection as auth, without reporting it", async () => {
    const { client, records, reported } = await connect(() => null);
    const result = await client.callTool({ name: "get_macro_targets", arguments: {} });
    expect(result.isError).toBe(true);
    expect(records.at(-1)).toMatchObject({ outcome: "returned_error", errorKind: "auth" });
    expect(reported).toEqual([]);
  });

  it("classifies an expired Cronometer session as auth, without reporting it", async () => {
    respondWith({ result: "FAIL", error: "Authentication failed" });
    const { client, records, reported } = await connect(() => auth);
    await client.callTool({ name: "get_macro_targets", arguments: {} });
    expect(records.at(-1)).toMatchObject({ outcome: "returned_error", errorKind: "auth" });
    expect(reported).toEqual([]);
  });

  it("classifies a request Cronometer cannot serve as rejected, without reporting it", async () => {
    const { client, records, reported } = await connect(() => auth);
    await client.callTool({ name: "get_daily_nutrition", arguments: { date: "yesterday" } });
    expect(records.at(-1)).toMatchObject({ outcome: "returned_error", errorKind: "rejected" });
    expect(reported).toEqual([]);
  });

  it("classifies a FAIL Cronometer explains as rejected, passing the reason to the client", async () => {
    respondWith({ result: "FAIL", error: "Invalid measure" });
    const { client, records, reported } = await connect(() => auth);
    const result = await client.callTool({
      name: "add_food_entry",
      arguments: { foodId: 1, grams: 100, measureId: 2 },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Cronometer rejected the request: Invalid measure");
    expect(records.at(-1)).toMatchObject({ outcome: "returned_error", errorKind: "rejected" });
    expect(reported).toEqual([]);
  });

  it("classifies an upstream failure as upstream and reports it", async () => {
    respondWith({ result: "FAIL" });
    const { client, records, reported } = await connect(() => auth);
    await client.callTool({ name: "get_macro_targets", arguments: {} });
    expect(records.at(-1)).toMatchObject({ outcome: "returned_error", errorKind: "upstream" });
    expect(reported).toHaveLength(1);
  });

  it("never sends the kind to the client", async () => {
    const { client } = await connect(() => null);
    const result = await client.callTool({ name: "get_macro_targets", arguments: {} });
    expect(JSON.stringify(result)).not.toContain("auth\"");
    expect(Object.getOwnPropertySymbols(result)).toEqual([]);
  });

  it("leaves successful calls without a kind", async () => {
    const { client, records } = await connect(() => null);
    await client.callTool({ name: "connection_status", arguments: {} });
    expect(records.at(-1)?.outcome).toBe("success");
    expect(records.at(-1)?.errorKind).toBeUndefined();
  });
});
