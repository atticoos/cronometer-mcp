import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer, InMemoryTransport, type Server } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { registerCronometerTools, type AuthContext } from "@cronometer-mcp/core";
import { createServer } from "../src/index";
import { PERMISSION_GROUPS } from "../src/consent/permissions";

let client: Client;

beforeAll(async () => {
  const server: Server = (createServer() as unknown as { server: Server }).server;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

describe("registered tool surface", () => {
  it("lists the full mobile + export tool set", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();

    expect(names).toEqual([
      "add_custom_food",
      "add_food_entry",
      "add_note",
      "add_recipe",
      "connection_status",
      "copy_day",
      "get_biometrics",
      "get_cronometer_data",
      "get_daily_nutrition",
      "get_fasting_history",
      "get_fasting_stats",
      "get_food_details",
      "get_food_log",
      "get_macro_targets",
      "list_biometrics",
      "mark_day_complete",
      "remove_food_entry",
      "search_foods",
      "update_note",
    ]);
  });

  it("describes every tool on the consent screen exactly once", async () => {
    const { tools } = await client.listTools();
    const described = PERMISSION_GROUPS.flatMap((group) => group.tools.map((tool) => tool.name));
    expect([...described].sort()).toEqual(
      tools.map((tool) => tool.name).filter((name) => name !== "connection_status").sort(),
    );
    const deleteTools = PERMISSION_GROUPS.filter((group) => group.risk === "delete").flatMap((group) =>
      group.tools.map((tool) => tool.name),
    );
    const destructive = tools.filter((tool) => tool.annotations?.destructiveHint).map((tool) => tool.name);
    expect(deleteTools.sort()).toEqual(destructive.sort());
  });

  it("exposes JSON schemas for every tool", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.inputSchema, `${tool.name} inputSchema`).toHaveProperty("type");
      expect(tool._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["cronometer:read"] }]);
    }
  });

  it("falls back to a reconnect message without an authenticated HTTP request", async () => {
    const result = await client.callTool({
      name: "add_food_entry",
      arguments: { foodId: 1, measureId: 1, grams: 100 },
    });
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: expect.stringContaining("Reconnect") }],
    });
    expect(result._meta).toBeUndefined();
  });
});

describe("new MCP tool handlers", () => {
  let currentUserId: number;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let authedClient: Client;

  beforeEach(async () => {
    currentUserId = 42;
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const mcpServer = new McpServer({ name: "test-authed", version: "0.0.0" });
    registerCronometerTools(mcpServer, {
      getAuthContext: (): AuthContext => ({
        cronometerMobileSession: { sessionKey: "session-123", timezone: "UTC", userId: currentUserId },
        cronometerUsername: "person@example.com",
        cronometerWebSession: { cookies: "sesnonce=abc", userId: String(currentUserId) },
      }),
      oauth: {
        reauthorize: async () => 'Bearer error="invalid_token"',
        scopes: ["cronometer:read"],
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    authedClient = new Client({ name: "authed-test", version: "0.0.0" });
    await Promise.all([
      mcpServer.server.connect(serverTransport),
      authedClient.connect(clientTransport),
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function parseToolJson(result: Awaited<ReturnType<Client["callTool"]>>) {
    expect(result.isError).toBeUndefined();
    const first = (result.content as { type: string; text: string }[])[0];
    return JSON.parse(first.text) as Record<string, unknown>;
  }

  it("executes add_note and update_note", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/photoupload")) {
        return Response.json({ noteId: 777, order: 4 });
      }
      if (url.endsWith("/api/v2/get_diary")) {
        return Response.json({ diary: [{ noteId: 777, order: 131073, type: "Note" }] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const added = parseToolJson(
      await authedClient.callTool({
        name: "add_note",
        arguments: { date: "2026-04-20", diaryGroup: "lunch", text: "Felt energized" },
      }),
    );
    expect(added).toMatchObject({
      date: "2026-04-20",
      note_id: 777,
      status: "success",
    });

    const updated = parseToolJson(
      await authedClient.callTool({
        name: "update_note",
        arguments: { date: "2026-04-20", noteId: 777, text: "Felt great after lunch" },
      }),
    );
    expect(updated).toMatchObject({
      date: "2026-04-20",
      note_id: 777,
      status: "success",
    });
  });
});
