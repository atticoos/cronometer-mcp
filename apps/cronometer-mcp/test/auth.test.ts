import { describe, expect, it } from "vitest";
import { authorizationSecurityHeaders, isAllowedAuthorizationOrigin } from "../src/auth";

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
