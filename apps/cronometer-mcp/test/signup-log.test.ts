import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { redactSpanAttributes } from "../src/observability";
import {
  authorizationLogPayload,
  classifySignup,
  markSignedIn,
  SIGNUP_PREFIX,
  SIGNUP_TTL_SECONDS,
} from "../src/signup-log";

function provider(grants: number) {
  return {
    listUserGrants: vi.fn(async () => ({
      items: Array.from({ length: grants }, () => ({}) as never),
    })),
  };
}

describe("classifySignup and markSignedIn", () => {
  it("counts a first sign-in as new until the account is marked", async () => {
    const subject = crypto.randomUUID();
    const signupEnv = { OAUTH_KV: env.OAUTH_KV, OAUTH_PROVIDER: provider(0) };

    expect(await classifySignup(signupEnv, subject)).toBe("new");
    // A failed attempt never marks the account, so the retry is still new.
    expect(await classifySignup(signupEnv, subject)).toBe("new");
    await markSignedIn(signupEnv, subject);
    expect(await env.OAUTH_KV.get(`${SIGNUP_PREFIX}${subject}`)).toBe("1");
    expect(await classifySignup(signupEnv, subject)).toBe("returning");
  });

  it("stays returning after the account's grants are revoked", async () => {
    const subject = crypto.randomUUID();
    await markSignedIn({ OAUTH_KV: env.OAUTH_KV }, subject);

    const noGrants = provider(0);
    expect(await classifySignup({ OAUTH_KV: env.OAUTH_KV, OAUTH_PROVIDER: noGrants }, subject)).toBe(
      "returning",
    );
    expect(noGrants.listUserGrants).not.toHaveBeenCalled();
  });

  it("treats accounts with a live grant but no marker as returning", async () => {
    const subject = crypto.randomUUID();
    const signupEnv = { OAUTH_KV: env.OAUTH_KV, OAUTH_PROVIDER: provider(1) };
    expect(await classifySignup(signupEnv, subject)).toBe("returning");
  });

  it("refreshes the marker's expiry on every sign-in", async () => {
    const put = vi.fn(async () => undefined);
    await markSignedIn({ OAUTH_KV: { put } as unknown as KVNamespace }, "subject");
    expect(put).toHaveBeenCalledWith(`${SIGNUP_PREFIX}subject`, "1", {
      expirationTtl: SIGNUP_TTL_SECONDS,
    });
  });

  it("never fails sign-in when storage is unavailable", async () => {
    const kv = {
      get: async () => {
        throw new Error("KV down");
      },
      put: async () => {
        throw new Error("KV down");
      },
    } as unknown as KVNamespace;
    expect(await classifySignup({ OAUTH_KV: kv, OAUTH_PROVIDER: provider(0) }, "s")).toBe("unknown");
    await expect(markSignedIn({ OAUTH_KV: kv }, "s")).resolves.toBeUndefined();
  });
});

describe("authorizationLogPayload", () => {
  it("encodes the sign-in as one OTLP log record", () => {
    const log = authorizationLogPayload(
      { status: "new", platform: "claude", userId: "abc123", timeMs: 1_794_064_553_000 },
      "cronometer-mcp",
    ).resourceLogs[0].scopeLogs[0].logRecords[0];
    expect(log.eventName).toBe("oauth.authorization");
    expect(log.timeUnixNano).toBe("1794064553000000000");
    expect(log.body).toEqual({ stringValue: "oauth.authorization new" });
    expect(log.attributes).toEqual([
      { key: "oauth.signup.status", value: { stringValue: "new" } },
      { key: "mcp.client.platform", value: { stringValue: "claude" } },
      { key: "enduser.pseudo.id", value: { stringValue: "abc123" } },
    ]);
  });

  it("omits the pseudonymous ID when the telemetry secret is not set", () => {
    const log = authorizationLogPayload(
      { status: "returning", platform: "chatgpt", timeMs: 0 },
      "svc",
    ).resourceLogs[0].scopeLogs[0].logRecords[0];
    expect(log.attributes.map(({ key }) => key)).not.toContain("enduser.pseudo.id");
  });
});

describe("signup marker key redaction", () => {
  it("keeps only the prefix in traces", () => {
    const attributes = { "db.system": "Cloudflare KV", "db.cf.kv.key": `${SIGNUP_PREFIX}deadbeef` };
    redactSpanAttributes(attributes);
    expect(attributes["db.cf.kv.key"]).toBe("signup:[redacted]");
  });
});
