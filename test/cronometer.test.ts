import { describe, expect, it, vi } from "vitest";
import {
  authenticateCronometer,
  exportCronometerData,
  parseCronometerCsv,
  validateExportDateRange,
} from "../src/cronometer";

function response(body: string, setCookies: string[] = [], contentType = "text/plain"): Response {
  const headers = new Headers({ "Content-Type": contentType });
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

describe("exportCronometerData", () => {
  it("gets a short-lived export token and returns parsed CSV", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response('//OK["export-token",0]'))
      .mockResolvedValueOnce(
        response(
          "Day,Energy (kcal)\r\n2026-08-20,2100\r\n",
          [],
          "text/csv; charset=utf-8",
        ),
      );

    const result = await exportCronometerData(
      { cookies: "initial=one; sesnonce=session-secret", userId: "12345" },
      "daily_nutrition",
      "2026-08-20",
      "2026-08-20",
      fetcher,
    );

    expect(result).toEqual({
      columns: ["Day", "Energy (kcal)"],
      rows: [["2026-08-20", "2100"]],
    });
    expect(String(fetcher.mock.calls[0][1]?.body)).toContain("|session-secret|");
    expect(String(fetcher.mock.calls[0][1]?.body)).toContain("|12345|3600|");
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("Cookie")).toBe(
      "initial=one; sesnonce=session-secret",
    );

    const exportUrl = new URL(String(fetcher.mock.calls[1][0]));
    expect(exportUrl.origin + exportUrl.pathname).toBe("https://cronometer.com/export");
    expect(Object.fromEntries(exportUrl.searchParams)).toEqual({
      nonce: "export-token",
      generate: "dailySummary",
      start: "2026-08-20",
      end: "2026-08-20",
    });
  });

  it("treats an HTML export as an expired session", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response('//OK["export-token",0]'))
      .mockResolvedValueOnce(response("<html>Sign in</html>", [], "application/octet-stream"));

    await expect(
      exportCronometerData(
        { cookies: "sesnonce=session-secret", userId: "12345" },
        "servings",
        "2026-08-20",
        "2026-08-20",
        fetcher,
      ),
    ).rejects.toMatchObject({ reason: "session" });
  });
});

describe("parseCronometerCsv", () => {
  it("handles quoted commas, escaped quotes, and embedded newlines", () => {
    expect(
      parseCronometerCsv(
        '\ufeffDay,Food Name,Note\r\n2026-08-20,"Beans, canned","Said ""hello""\nnext line"\r\n',
      ),
    ).toEqual({
      columns: ["Day", "Food Name", "Note"],
      rows: [["2026-08-20", "Beans, canned", 'Said "hello"\nnext line']],
    });
  });

  it("rejects malformed rows", () => {
    expect(() => parseCronometerCsv("Day,Metric\n2026-08-20\n")).toThrowError(
      expect.objectContaining({ reason: "format" }),
    );
  });
});

describe("validateExportDateRange", () => {
  it("accepts at most 31 inclusive calendar days", () => {
    expect(() => validateExportDateRange("2026-01-01", "2026-01-31")).not.toThrow();
    expect(() => validateExportDateRange("2026-01-01", "2026-02-01")).toThrowError(
      expect.objectContaining({ reason: "date_range" }),
    );
  });

  it("rejects invalid calendar dates and reversed ranges", () => {
    expect(() => validateExportDateRange("2026-02-29", "2026-03-01")).toThrowError(
      expect.objectContaining({ reason: "date_range" }),
    );
    expect(() => validateExportDateRange("2026-08-20", "2026-08-19")).toThrowError(
      expect.objectContaining({ reason: "date_range" }),
    );
  });
});
