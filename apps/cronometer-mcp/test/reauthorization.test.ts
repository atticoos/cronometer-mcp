import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/server";

vi.mock("@microlabs/otel-cf-workers", () => ({ instrument: (handler: unknown) => handler }));

const origin = "https://mcp.example.com";
const resource = `${origin}/mcp`;
const metadata = `${origin}/.well-known/oauth-protected-resource/mcp`;
const redirectUri = "https://client.example.com/callback";
const verifier = "a".repeat(43);
const scope = "cronometer:read";
const diaryWrite = { foodId: 1, measureId: 1, grams: 100 };
const worker = exports.default;

let mobileSession: string;
let fetchUpstream: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  mobileSession = "initial-mobile-session";
  fetchUpstream = vi.fn<typeof fetch>(async (input, init) => {
    switch (String(input)) {
      case "https://cronometer.com/login/":
        return new Response('<input name="anticsrf" value="upstream-csrf">');
      case "https://cronometer.com/login":
        return new Response('{"success":true,"error":""}', {
          headers: { "Set-Cookie": "sesnonce=web-session; Secure; Path=/" },
        });
      case "https://cronometer.com/cronometer/app":
        return new Response("//OK[42,0,0]");
      case "https://mobile.cronometer.com/api/v2/login":
        return Response.json({ result: "SUCCESS", id: 42, sessionKey: mobileSession });
      case "https://mobile.cronometer.com/api/v2/add_food":
        return Response.json({ id: 789 });
      case "https://mobile.cronometer.com/api/v2/get_food":
        return new Response(null, { status: 401 });
      case "https://mobile.cronometer.com/api/v2/add_serving": {
        const { auth } = JSON.parse(String(init?.body));
        return auth.token === mobileSession
          ? Response.json({ result: "SUCCESS", servingId: 123 })
          : Response.json({ result: "FAIL", error: "Session expired" });
      }
      default:
        throw new Error("Unexpected outbound request");
    }
  });
  vi.stubGlobal("fetch", fetchUpstream);
});

afterEach(() => vi.unstubAllGlobals());

async function registerClient() {
  const response = await worker.fetch(`${origin}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect_uris: [redirectUri], token_endpoint_auth_method: "none" }),
  });
  expect(response.status).toBe(201);
  return (await response.json<{ client_id: string }>()).client_id;
}

async function authorize(clientId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const query = new URLSearchParams({
    client_id: clientId,
    code_challenge: btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""),
    code_challenge_method: "S256",
    redirect_uri: redirectUri,
    resource,
    response_type: "code",
    scope,
  });
  const page = await worker.fetch(`${origin}/authorize?${query}`);
  expect(page.status).toBe(200);
  const html = await page.text();
  const response = await worker.fetch(`${origin}/authorize`, {
    method: "POST",
    redirect: "manual",
    headers: { Cookie: page.headers.get("Set-Cookie")!.split(";")[0] },
    body: new URLSearchParams({
      csrf_token: /name="csrf_token" value="([^"]+)"/.exec(html)![1],
      flow_id: /name="flow_id" value="([^"]+)"/.exec(html)![1],
      username: "person@example.com",
      password: "test-password",
    }),
  });
  expect(response.status, response.status === 302 ? undefined : await response.text()).toBe(302);
  const code = new URL(response.headers.get("Location")!).searchParams.get("code")!;
  const exchange = await tokenRequest(clientId, {
    grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri,
  });
  expect(exchange.status).toBe(200);
  return exchange.json<{ access_token: string; refresh_token: string }>();
}

function tokenRequest(clientId: string, fields: Record<string, string>) {
  return worker.fetch(`${origin}/oauth/token`, {
    method: "POST",
    body: new URLSearchParams({ client_id: clientId, ...fields }),
  });
}

function callTool(accessToken: string, name = "add_food_entry", args: object = diaryWrite) {
  return worker.fetch(resource, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
}

async function toolResult(response: Response): Promise<CallToolResult> {
  expect(response.status).toBe(200);
  const body = await response.text();
  const data = body.startsWith("{") ? body : /^data: (.+)$/m.exec(body)?.[1];
  return JSON.parse(data!).result;
}

describe("Cronometer OAuth reauthorization", () => {
  it("discovers OAuth, challenges on an expired Cronometer session, and succeeds after sign-in", async () => {
    expect(await (await worker.fetch(metadata)).json()).toMatchObject({
      resource,
      authorization_servers: [origin],
      scopes_supported: [scope],
    });
    expect(await (await worker.fetch(`${origin}/.well-known/oauth-authorization-server`)).json()).toMatchObject({
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      code_challenge_methods_supported: ["S256"],
    });

    const clientId = await registerClient();
    const initial = await authorize(clientId);
    expect((await toolResult(await callTool(initial.access_token))).isError).toBeFalsy();

    mobileSession = "fresh-mobile-session";
    const result = await toolResult(await callTool(initial.access_token));
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: expect.stringContaining("The Cronometer session has expired") }],
      _meta: {
        "mcp/www_authenticate": [
          `Bearer resource_metadata="${metadata}", error="invalid_token", error_description="Sign in to Cronometer again"`,
        ],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/initial-mobile-session|web-session|test-password/);
    expect((await callTool(initial.access_token)).status).toBe(401);
    const refresh = await tokenRequest(clientId, {
      grant_type: "refresh_token", refresh_token: initial.refresh_token,
    });
    expect(refresh.status).toBe(400);
    expect(await refresh.json()).toMatchObject({ error: "invalid_grant" });

    const renewed = await authorize(clientId);
    expect((await toolResult(await callTool(renewed.access_token))).isError).toBeFalsy();
  });

  it("rejects an expired MCP bearer before calling Cronometer and permits OAuth refresh", async () => {
    const clientId = await registerClient();
    const initial = await authorize(clientId);
    const { keys: [key] } = await env.OAUTH_KV.list({ prefix: "token:" });
    const record = await env.OAUTH_KV.get<object>(key.name, "json");
    await env.OAUTH_KV.put(key.name, JSON.stringify({ ...record, expiresAt: 0 }));
    fetchUpstream.mockClear();

    const expired = await callTool(initial.access_token);
    expect(expired.status).toBe(401);
    expect(expired.headers.get("WWW-Authenticate")).toContain(`resource_metadata="${metadata}"`);
    expect(expired.headers.get("WWW-Authenticate")).toContain('error="invalid_token"');
    const missing = await worker.fetch(resource);
    expect(missing.status).toBe(401);
    expect(missing.headers.get("WWW-Authenticate")).toContain(`resource_metadata="${metadata}"`);
    expect(fetchUpstream).not.toHaveBeenCalled();

    const refresh = await tokenRequest(clientId, {
      grant_type: "refresh_token", refresh_token: initial.refresh_token,
    });
    expect(refresh.status).toBe(200);
    expect(fetchUpstream).not.toHaveBeenCalled();
    const { access_token: accessToken } = await refresh.json<{ access_token: string }>();
    expect((await toolResult(await callTool(accessToken))).isError).toBeFalsy();
  });

  it("challenges an authenticated grant with malformed Cronometer session props before any upstream call", async () => {
    mobileSession = "";
    const { access_token: accessToken } = await authorize(await registerClient());
    fetchUpstream.mockClear();
    const result = await toolResult(await callTool(accessToken));
    expect(result).toMatchObject({
      isError: true,
      _meta: { "mcp/www_authenticate": [expect.stringContaining(metadata)] },
    });
    expect(fetchUpstream).not.toHaveBeenCalled();
  });

  it("returns success if a custom food was created before the session expired", async () => {
    const { access_token: accessToken } = await authorize(await registerClient());
    const result = await toolResult(await callTool(accessToken, "add_custom_food", {
      name: "Custom food", calories: 50, proteinG: 2, fatG: 2, carbsG: 6,
    }));
    expect(result.isError).toBeFalsy();
    expect(result._meta).toBeUndefined();
    expect(result.content).toMatchObject([
      { type: "text", text: expect.stringContaining('"food_id": 789') },
    ]);
  });
});
