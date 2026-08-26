import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import type { AuthContext } from "../src/session.js";
import { registerCronometerTools } from "../src/tools.js";

const context: AuthContext = {
  cronometerMobileSession: { sessionKey: "mobile-session", userId: 42 },
  cronometerUsername: "person@example.com",
  cronometerWebSession: { cookies: "sesnonce=123", userId: "42" },
};

describe("registerCronometerTools", () => {
  it("serves the complete tool set and resolves context for each call", async () => {
    let currentContext: AuthContext | null = null;
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    registerCronometerTools(server, {
      disconnectedStatusMessage: "Not connected.",
      getContext: () => currentContext,
    });

    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const listed = await client.listTools();
      expect(listed.tools).toHaveLength(18);
      expect(listed.tools.map(({ name }) => name)).toContain("get_food_log");
      expect(listed.tools.map(({ name }) => name)).toContain("get_cronometer_data");

      expect(await statusText(client)).toBe("Not connected.");
      currentContext = context;
      expect(await statusText(client)).toBe(
        "Connected to Cronometer as person@example.com. Mobile data tools and CSV exports are available.",
      );
    } finally {
      await client.close();
      await server.close();
    }
  });
});

async function statusText(client: Client): Promise<string | undefined> {
  const result = await client.callTool({ arguments: {}, name: "connection_status" });
  const content = result.content[0];
  return content?.type === "text" ? content.text : undefined;
}
