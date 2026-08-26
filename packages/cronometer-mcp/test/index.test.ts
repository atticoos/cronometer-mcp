import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { createServer, readCredentials } from "../src/index.js";

describe("readCredentials", () => {
  it("reads required credentials and an optional one-time code", () => {
    expect(
      readCredentials({
        CRONOMETER_PASSWORD: "secret",
        CRONOMETER_USERNAME: "  person@example.com  ",
        CRONOMETER_USER_CODE: " 123456 ",
      }),
    ).toEqual({
      password: "secret",
      userCode: "123456",
      username: "person@example.com",
    });
  });

  it("defaults the one-time code to an empty string", () => {
    expect(
      readCredentials({
        CRONOMETER_PASSWORD: "secret",
        CRONOMETER_USERNAME: "person@example.com",
      }).userCode,
    ).toBe("");
  });

  it("reports every missing required variable without exposing values", () => {
    expect(() => readCredentials({})).toThrowError(
      "Missing required environment variables: CRONOMETER_USERNAME, CRONOMETER_PASSWORD",
    );
  });
});

describe("createServer", () => {
  it("serves the complete local tool set over MCP", async () => {
    const server = createServer({
      cronometerMobileSession: { sessionKey: "mobile-session", userId: 42 },
      cronometerUsername: "person@example.com",
      cronometerWebSession: { cookies: "sesnonce=123", userId: "42" },
    });
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const listed = await client.listTools();
      expect(listed.tools).toHaveLength(18);
      expect(listed.tools.map(({ name }) => name)).toContain("get_food_log");
      expect(listed.tools.map(({ name }) => name)).toContain("get_cronometer_data");

      const status = await client.callTool({ name: "connection_status", arguments: {} });
      expect(status.content).toContainEqual({
        type: "text",
        text: "Connected to Cronometer as person@example.com. Mobile data tools and CSV exports are available.",
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
