import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { addBreadcrumb, captureException, createTransport, setUser, withSentry } from "@sentry/cloudflare";
import { expect, it, vi } from "vitest";
import { sentryOptions } from "../src/sentry";

it("sends stack locations and tool tags while excluding sensitive data", async () => {
  const send = vi.fn<({ body }: { body: string | Uint8Array }) => Promise<{ statusCode: number }>>(
    async () => ({ statusCode: 200 }),
  );
  const fetch: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response> = async (request) => {
    const body = await request.text();
    setUser({ email: "private-data@example.com" });
    addBreadcrumb({ message: "private-data breadcrumb" });
    captureException(new Error("private-data exception"), {
      tags: { "mcp.tool.name": "get_food_log" },
    });
    return new Response(body);
  };
  const worker = withSentry(
    (bindings: Env) => ({
      ...sentryOptions(bindings),
      cacheClient: false,
      transport: (options) => createTransport(options, send),
    }),
    { fetch },
  );
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new Request("https://mcp.example.com/mcp?token=private-data", {
      method: "POST",
      headers: { Authorization: "Bearer private-data", Cookie: "session=private-data" },
      body: "private-data request body",
    }),
    { ...env, SENTRY_DSN: "https://public@example.com/1" },
    ctx,
  );
  expect(await response.text()).toBe("private-data request body");
  await waitOnExecutionContext(ctx);
  expect(send).toHaveBeenCalledOnce();
  const { body } = send.mock.calls[0][0];
  const envelope = typeof body === "string" ? body : new TextDecoder().decode(body);
  expect(envelope).not.toContain("private-data");
  const event = JSON.parse(envelope.split("\n")[2]);
  expect(event.tags["mcp.tool.name"]).toBe("get_food_log");
  expect(event.exception.values[0].stacktrace.frames.length).toBeGreaterThan(0);
});
