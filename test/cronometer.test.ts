import { describe, expect, it, vi } from "vitest";
import { authenticateCronometer } from "../src/cronometer";

function response(body: string, setCookies: string[] = []): Response {
  const headers = new Headers({ "Content-Type": "text/plain" });
  for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
  return new Response(body, { headers, status: 200 });
}

describe("authenticateCronometer", () => {
  it("carries upstream cookies and returns the authenticated session", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response('<input value="csrf-value" type="hidden" name="anticsrf">', [
          "initial=one; Path=/; Secure",
        ]),
      )
      .mockResolvedValueOnce(
        response('{"success":true,"error":""}', ["sesnonce=secret-nonce; Path=/; Secure"]),
      )
      .mockResolvedValueOnce(response("//OK[12345,0,0]"));

    const session = await authenticateCronometer(
      "person@example.com",
      "password",
      "123456",
      fetcher,
    );

    expect(session).toEqual({
      cookies: "initial=one; sesnonce=secret-nonce",
      userId: "12345",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get("Cookie")).toBe("initial=one");
    expect(String(fetcher.mock.calls[1][1]?.body)).toContain("userCode=123456");
    expect(new Headers(fetcher.mock.calls[2][1]?.headers).get("Cookie")).toBe(
      "initial=one; sesnonce=secret-nonce",
    );
  });

  it("maps rejected credentials to a safe authentication error", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response('<input name="anticsrf" value="csrf-value">'))
      .mockResolvedValueOnce(response('{"success":false,"error":"account details"}'));

    await expect(
      authenticateCronometer("person@example.com", "wrong", "", fetcher),
    ).rejects.toMatchObject({ reason: "credentials" });
  });

  it("identifies a required second factor without exposing the upstream response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response('<input name="anticsrf" value="csrf-value">'))
      .mockResolvedValueOnce(
        response('{"success":false,"error":"A one-time code is required"}'),
      );

    await expect(
      authenticateCronometer("person@example.com", "password", "", fetcher),
    ).rejects.toMatchObject({ reason: "second_factor" });
  });

  it("distinguishes a changed GWT handshake from rejected credentials", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response('<input name="anticsrf" value="csrf-value">'))
      .mockResolvedValueOnce(
        response('{"success":true,"error":""}', ["sesnonce=secret-nonce; Path=/; Secure"]),
      )
      .mockResolvedValueOnce(response("//EX[0,0]"));

    await expect(
      authenticateCronometer("person@example.com", "password", "", fetcher),
    ).rejects.toMatchObject({ reason: "session" });
  });
});
