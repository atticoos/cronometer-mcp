import { beforeEach, describe, expect, it, vi } from "vitest";
import { authHandler, authorizationSecurityHeaders, isAllowedAuthorizationOrigin } from "../src/auth";
import { authenticateCronometer } from "../src/cronometer";
import { authenticateCronometerMobile } from "../src/mobile";

vi.mock("../src/cronometer", () => ({
  CronometerAuthenticationError: class extends Error {
    reason = "credentials";
  },
  authenticateCronometer: vi.fn(),
}));
vi.mock("../src/mobile", () => ({
  authenticateCronometerMobile: vi.fn(),
}));

const FLOW_PREFIX = "cronometer:auth-flow:";
const CSRF_COOKIE = "__Host-CRONOMETER_CSRF";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function makeEnv(enrollSecret?: string) {
  const store = new Map<string, string>();
  const kv = {
    get: vi.fn(async (key: string, type?: string) => {
      const value = store.get(key);
      if (value === undefined) return undefined;
      return type === "json" ? JSON.parse(value) : value;
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
  const oauthProvider = {
    parseAuthRequest: vi.fn(async () => ({
      clientId: "chatgpt",
      redirectUri: "https://chatgpt.example/connector/oauth/callback",
      scope: ["cronometer:read"],
      state: "st-1",
    })),
    lookupClient: vi.fn(async () => ({ clientName: "ChatGPT" })),
    completeAuthorization: vi.fn(async () => ({
      redirectTo: new URL("https://chatgpt.example/connector/oauth/callback?code=abc&state=st-1"),
    })),
  };
  const env = {
    OAUTH_KV: kv,
    OAUTH_PROVIDER: oauthProvider,
    ...(enrollSecret ? { ENROLL_SECRET: enrollSecret } : {}),
  };
  return { env, kv, oauthProvider, store };
}

async function seedFlow(env: ReturnType<typeof makeEnv>["env"], flowId: string): Promise<void> {
  await env.OAUTH_KV.put(
    `${FLOW_PREFIX}${flowId}`,
    JSON.stringify({
      attempts: 0,
      clientName: "ChatGPT",
      csrfHash: await sha256Hex("csrf-token"),
      oauthRequest: {
        clientId: "chatgpt",
        redirectUri: "https://chatgpt.example/connector/oauth/callback",
        scope: ["cronometer:read"],
        state: "st-1",
      },
    }),
  );
}

function postAuthorizeRequest(form: Record<string, string>, csrfCookieValue?: string): Request {
  const body = new URLSearchParams(form);
  return new Request("https://mcp.example.com/authorize", {
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(csrfCookieValue ? { Cookie: `${CSRF_COOKIE}=${csrfCookieValue}` } : {}),
    },
    method: "POST",
  });
}

describe("authHandler enrollment gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the login page without an enrollment field when no secret is configured", async () => {
    const { env } = makeEnv();
    const response = await authHandler.fetch(
      new Request("https://mcp.example.com/authorize?client_id=chatgpt&response_type=code"),
      env as never,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('name="enroll_code"');
  });

  it("requires an enrollment code on the login page when a secret is configured", async () => {
    const { env } = makeEnv("hunter2");
    const response = await authHandler.fetch(
      new Request("https://mcp.example.com/authorize?client_id=chatgpt&response_type=code"),
      env as never,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('name="enroll_code"');
  });

  it("rejects a wrong enrollment code without contacting Cronometer and counts the attempt", async () => {
    const { env, store } = makeEnv("hunter2");
    await seedFlow(env, "flow-1");
    const response = await authHandler.fetch(
      postAuthorizeRequest({
        csrf_token: "csrf-token",
        enroll_code: "wrong-code",
        flow_id: "flow-1",
        password: "pw",
        username: "user",
      }, "csrf-token"),
      env as never,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("enrollment code was not accepted");
    expect(authenticateCronometer).not.toHaveBeenCalled();
    expect(authenticateCronometerMobile).not.toHaveBeenCalled();
    const flow = JSON.parse(store.get(`${FLOW_PREFIX}flow-1`)!) as { attempts: number };
    expect(flow.attempts).toBe(1);
  });

  it("rejects a missing enrollment code when a secret is configured", async () => {
    const { env, store } = makeEnv("hunter2");
    await seedFlow(env, "flow-2");
    const response = await authHandler.fetch(
      postAuthorizeRequest({
        csrf_token: "csrf-token",
        flow_id: "flow-2",
        password: "pw",
        username: "user",
      }, "csrf-token"),
      env as never,
    );
    expect(response.status).toBe(200);
    expect(authenticateCronometer).not.toHaveBeenCalled();
    expect(JSON.parse(store.get(`${FLOW_PREFIX}flow-2`)!).attempts).toBe(1);
  });

  it("completes authorization when the enrollment code matches", async () => {
    const webSession = { cookies: ["web=1"], userId: "42" };
    const mobileSession = { sessionKey: "sk" };
    vi.mocked(authenticateCronometer).mockResolvedValue(webSession as never);
    vi.mocked(authenticateCronometerMobile).mockResolvedValue(mobileSession as never);
    const { env, oauthProvider, store } = makeEnv("hunter2");
    await seedFlow(env, "flow-3");
    const response = await authHandler.fetch(
      postAuthorizeRequest({
        csrf_token: "csrf-token",
        enroll_code: "hunter2",
        flow_id: "flow-3",
        password: "pw",
        username: "user",
      }, "csrf-token"),
      env as never,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("chatgpt.example");
    expect(oauthProvider.completeAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ cronometerUsername: "user" }),
      }),
    );
    expect(store.has(`${FLOW_PREFIX}flow-3`)).toBe(false);
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
