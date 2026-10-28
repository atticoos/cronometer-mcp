import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authorizationSecurityHeaders, isAllowedAuthorizationOrigin } from "../src/auth";

describe("authorization consent", () => {
  it("discloses read access and every supported write capability before sign-in", async () => {
    const redirectUri = "https://client.example.com/callback";
    const registration = await SELF.fetch("https://mcp.example.com/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Consent test client",
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
    expect(html).toContain("Consent test client");
    expect(html).toContain("read and write access");
    expect(html).toContain("Read your food diary, nutrition, targets, fasting history, and biometrics");
    expect(html).toContain("search foods and view food details");
    expect(html).toContain("download CSV exports, including exercises and notes");
    expect(html).toContain("Add and delete food entries.");
    expect(html).toContain("Create custom foods and recipes.");
    expect(html).toContain("Copy diary entries from the previous day.");
    expect(html).toContain("Mark diary days complete or incomplete.");
    expect(html).not.toMatch(/read-only/i);
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
