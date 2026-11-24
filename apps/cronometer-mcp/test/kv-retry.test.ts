import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { retryKvReads } from "../src/kv-retry";

function flakyKv(failures: number) {
  let remaining = failures;
  const get = vi.fn(async (key: string, options?: unknown) => {
    if (remaining-- > 0) throw new Error("KV GET failed: 503 Service Unavailable");
    return env.OAUTH_KV.get(key, options as never);
  });
  const put = vi.fn(async () => {
    throw new Error("KV PUT failed");
  });
  return { kv: { get, put } as unknown as KVNamespace, get, put };
}

describe("retryKvReads", () => {
  it("retries a read that fails once and returns its value", async () => {
    const key = `test:${crypto.randomUUID()}`;
    await env.OAUTH_KV.put(key, JSON.stringify({ ok: true }));
    const { kv, get } = flakyKv(1);

    expect(await retryKvReads(kv, 0).get(key, { type: "json" })).toEqual({ ok: true });
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenLastCalledWith(key, { type: "json" });
  });

  it("gives up after the second failure", async () => {
    const { kv, get } = flakyKv(2);

    await expect(retryKvReads(kv, 0).get("missing")).rejects.toThrow("KV GET failed");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("never retries a write", async () => {
    const { kv, put } = flakyKv(0);

    await expect(retryKvReads(kv, 0).put("k", "v")).rejects.toThrow("KV PUT failed");
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("works against a real KV binding", async () => {
    const kv = retryKvReads(env.OAUTH_KV, 0);
    const key = `test:${crypto.randomUUID()}`;
    await kv.put(key, "1");

    expect(await kv.get(key)).toBe("1");
    expect((await kv.getWithMetadata(key)).value).toBe("1");
    await kv.delete(key);
    expect(await kv.get(key)).toBeNull();
  });
});
