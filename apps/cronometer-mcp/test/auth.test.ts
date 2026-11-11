import { SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizationSecurityHeaders, isAllowedAuthorizationOrigin } from "../src/auth";
import { renderConsentPage, returnTarget } from "../src/consent/ConsentPage";
import { PERMISSION_GROUPS } from "../src/consent/permissions";

async function startAuthorization(clientName = "Consent test client") {
  const redirectUri = "https://client.example.com/callback";
  const registration = await SELF.fetch("https://mcp.example.com/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
    }),
  });
  expect(registration.status).toBe(201);
  const { client_id: clientId } = await registration.json<{ client_id: string }>();
  const query = new URLSearchParams({
    client_id: clientId,
    code_challenge: "a".repeat(43),
    code_challenge_method: "S256",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "cronometer:read",
    state: "consent-test",
  });

  const response = await SELF.fetch(`https://mcp.example.com/authorize?${query}`);
  expect(response.status).toBe(200);
  const html = await response.text();
  return {
    cookie: response.headers.get("Set-Cookie")!.split(";")[0],
    csrfToken: /name="csrf_token" value="([^"]+)"/.exec(html)![1],
    flowId: /name="flow_id" value="([^"]+)"/.exec(html)![1],
    html,
  };
}

describe("authorization consent", () => {
  it("names the client and lists every permission group before sign-in", async () => {
    const { html } = await startAuthorization();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Consent test client wants to access your Cronometer account");
    expect(html).toContain("<code>client.example.com</code>");
    for (const group of PERMISSION_GROUPS) {
      expect(html).toContain(group.title);
      for (const tool of group.tools) expect(html).toContain(`<code>${tool.name}</code>`);
    }
    expect(html).toContain('value="deny" formnovalidate');
    expect(html).toContain('<details class="otc">');
    expect(html).not.toMatch(/read-only/i);
  });

  it("escapes a hostile client name", async () => {
    const { html } = await startAuthorization('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("returns access_denied to the client when the person cancels", async () => {
    const { cookie, csrfToken, flowId } = await startAuthorization();
    const cancel = () =>
      SELF.fetch("https://mcp.example.com/authorize", {
        method: "POST",
        redirect: "manual",
        headers: { Cookie: cookie },
        body: new URLSearchParams({ action: "deny", csrf_token: csrfToken, flow_id: flowId }),
      });

    const response = await cancel();
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location")!);
    expect(location.origin + location.pathname).toBe("https://client.example.com/callback");
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("state")).toBe("consent-test");

    // The pending flow is gone, so the form cannot be replayed.
    expect((await cancel()).status).toBe(400);
  });
});

describe("renderConsentPage", () => {
  const base = {
    clientName: "Claude",
    csrfToken: "csrf",
    expiresInMinutes: 10,
    flowId: "flow",
    redirectUri: "https://claude.ai/api/mcp/auth_callback",
  };

  it("uses the landing page icon for known clients and an initial otherwise", () => {
    expect(renderConsentPage(base)).toContain("mark client brand-claude");
    expect(renderConsentPage({ ...base, clientName: "zed" })).toContain('<div class="mark client">Z</div>');
  });

  it("opens the one-time code field when Cronometer asks for one", () => {
    const html = renderConsentPage({
      ...base,
      error: { message: "Cronometer needs a one-time code.", needsCode: true },
      username: "person@example.com",
    });
    expect(html).toContain('<details class="otc required" open="">');
    expect(html).toContain("One-time code required");
    expect(html).toContain('value="person@example.com"');
  });

  it("shows where people are sent back to", () => {
    expect(returnTarget("https://claude.ai/api/mcp/auth_callback")).toBe("claude.ai");
    expect(returnTarget("cursor://anysphere.cursor-mcp/oauth/callback")).toBe("anysphere.cursor-mcp");
  });
});

describe("isAllowedAuthorizationOrigin", () => {
  it("allows same-origin and OAuth opaque-origin form submissions", () => {
    expect(isAllowedAuthorizationOrigin(new Request("https://mcp.example.com/authorize"))).toBe(true);
    expect(
      isAllowedAuthorizationOrigin(
        new Request("https://mcp.example.com/authorize", {
          headers: { Origin: "https://mcp.example.com" },
        }),
      ),
    ).toBe(true);
    expect(
      isAllowedAuthorizationOrigin(
        new Request("https://mcp.example.com/authorize", { headers: { Origin: "null" } }),
      ),
    ).toBe(true);
  });

  it("rejects a different web origin", () => {
    expect(
      isAllowedAuthorizationOrigin(
        new Request("https://mcp.example.com/authorize", {
          headers: { Origin: "https://attacker.example" },
        }),
      ),
    ).toBe(false);
  });
});

describe("authorizationSecurityHeaders", () => {
  it("allows the validated OAuth callback origin across a form redirect", () => {
    expect(
      authorizationSecurityHeaders("https://chatgpt.com/connector/oauth/callback").get(
        "Content-Security-Policy",
      ),
    ).toContain("form-action 'self' https://chatgpt.com;");
  });

  it("keeps error pages restricted to same-origin form targets", () => {
    expect(authorizationSecurityHeaders().get("Content-Security-Policy")).toContain(
      "form-action 'self';",
    );
  });
});

describe("search indexing", () => {
  it("keeps the MCP host's plain-text pages out of search results", async () => {
    for (const path of ["/", "/does-not-exist"]) {
      const response = await SELF.fetch(`https://mcp.example.com${path}`);
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    }
  });
});

describe("client metadata document clients", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rejects a client whose metadata document is not JSON instead of failing", async () => {
    // Seen in production: a client probing with a missing metadata URL got an
    // HTML page back, and the lookup error escaped as an unhandled 500.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!doctype html><title>Not here</title>", {
        headers: { "Content-Type": "text/html" },
      }),
    );
    const query = new URLSearchParams({
      client_id: "https://client.example.com/oauth/missing.json",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
      redirect_uri: "https://client.example.com/callback",
      response_type: "code",
      scope: "cronometer:read",
      state: "cimd-test",
    });

    const response = await SELF.fetch(`https://mcp.example.com/authorize?${query}`);

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("client metadata document could not be loaded");
  });
});
