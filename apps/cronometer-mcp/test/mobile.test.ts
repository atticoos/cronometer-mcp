import { describe, expect, it, vi } from "vitest";
import {
  addServing,
  authenticateCronometerMobile,
  copyDay,
  createCustomFood,
  deleteEntries,
  formatDay,
  formatToday,
  getBiometrics,
  getConsumedNutrients,
  getDiary,
  mealGroupForHour,
} from "../src/mobile";
import { CronometerMobileError } from "../src/mobile";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

const session = {
  sessionKey: "mobile-session-key",
  timezone: "America/Los_Angeles",
  userId: 42,
};

describe("authenticateCronometerMobile", () => {
  it("posts an app-shaped login payload and returns the parsed session", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 42,
          result: "SUCCESS",
          sessionKey: "mobile-session-key",
          timezone: "America/Los_Angeles",
        }),
      );

    const result = await authenticateCronometerMobile(
      "person@example.com",
      "password",
      "123456",
      fetcher,
    );

    expect(result).toEqual({
      sessionKey: "mobile-session-key",
      timezone: "America/Los_Angeles",
      userId: 42,
    });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://mobile.cronometer.com/api/v2/login");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("text/plain; charset=utf-8");
    const payload = JSON.parse(String(init?.body));
    // timezone must stay null so the account's server-side zone is not overwritten
    expect(payload).toMatchObject({
      auth: { api: 3, build: "2807", flavour: "free", os: "Android", token: null, userId: null },
      email: "person@example.com",
      password: "password",
      timezone: null,
      userCode: "123456",
    });
  });

  it("maps rejected credentials to a safe authentication error", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "Invalid credentials", result: "FAIL" }));

    await expect(
      authenticateCronometerMobile("person@example.com", "wrong", "", fetcher),
    ).rejects.toMatchObject({ reason: "credentials" });
  });

  it("identifies a required second factor", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "one-time code required", result: "FAIL" }));

    await expect(
      authenticateCronometerMobile("person@example.com", "password", "", fetcher),
    ).rejects.toMatchObject({ reason: "second_factor" });
  });

  it("drops unusable timezones instead of failing login", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 7, sessionKey: "k" }));

    const result = await authenticateCronometerMobile("e@x.com", "p", "", fetcher);
    expect(result.timezone).toBeUndefined();
  });
});

describe("requestV2 auth handling", () => {
  it("injects the auth block into every v2 payload", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ diary: [] }));
    await getDiary(session, "2026-08-20", fetcher);

    const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(payload.auth).toEqual({ api: 3, build: "2807", flavour: "free", os: "Android", token: "mobile-session-key", userId: 42 });
    // Cronometer expects non-zero-padded days
    expect(payload.day).toBe("2026-8-20");
  });

  it("treats HTTP 401 as an expired session", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("", { status: 401 }));
    await expect(getDiary(session, undefined, fetcher)).rejects.toMatchObject({
      reason: "session",
    });
  });

  it("treats a FAIL body with HTTP 200 as an expired session", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "session expired", result: "FAIL" }));
    await expect(getDiary(session, undefined, fetcher)).rejects.toBeInstanceOf(CronometerMobileError);
  });

  it("surfaces upstream failures", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("", { status: 500 }));
    await expect(getDiary(session, undefined, fetcher)).rejects.toMatchObject({
      reason: "upstream",
    });
  });
});

describe("deleteEntries (v3)", () => {
  it("sends full serving objects with header-based auth and returns removed IDs", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          diary: [
            { foodId: 1, servingId: 101, type: "Serving" },
            { foodId: 2, servingId: 202, type: "Serving" },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await deleteEntries(session, ["101"], "2026-08-20", fetcher);

    expect(result).toEqual({ count: 1, removed: ["101"] });
    const [url, init] = fetcher.mock.calls[1];
    expect(url).toBe("https://mobile.cronometer.com/api/v3/user/42/diary-entries");
    expect(init?.method).toBe("DELETE");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-crono-session")).toBe("mobile-session-key");
    expect(JSON.parse(String(init?.body))).toEqual({
      diaryEntries: [{ foodId: 1, servingId: 101, type: "Serving" }],
    });
  });

  it("reports nothing to remove without calling the v3 API", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ diary: [] }));

    const result = await deleteEntries(session, ["999"], undefined, fetcher);
    expect(result).toEqual({ count: 0, removed: [] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("date helpers", () => {
  it("normalizes dates to Cronometer's non-padded format in the account timezone", () => {
    // Just before midnight UTC is still the previous day in Los Angeles.
    const instant = new Date("2026-08-21T02:30:00Z");
    expect(formatToday("America/Los_Angeles", instant)).toBe("2026-8-20");
    expect(formatDay(undefined, "America/Los_Angeles", instant)).toBe("2026-8-20");
    expect(formatDay("2026-08-05", "UTC")).toBe("2026-8-5");
  });

  it("rejects malformed dates", () => {
    expect(() => formatDay("08/20/2026")).toThrow(CronometerMobileError);
  });

  it("maps hours to meal groups", () => {
    expect(mealGroupForHour(5)).toBe(1);
    expect(mealGroupForHour(12)).toBe(2);
    expect(mealGroupForHour(18)).toBe(3);
    expect(mealGroupForHour(2)).toBe(4);
  });
});

describe("addServing", () => {
  it("stamps the entry with the requested day and meal group", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ id: 555 }));

    const entry = await addServing(
      session,
      { date: "2026-08-20", diaryGroup: 2, foodId: 9, grams: 150, measureId: 3 },
      fetcher,
    );
    expect(entry).toEqual({ id: 555 });

    const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(payload.serving).toMatchObject({
      day: "2026-8-20",
      foodId: 9,
      grams: 150,
      measureId: 3,
      type: "Serving",
      userId: 42,
    });
    expect(payload.serving.order).toBe((2 << 16) | 1);
    expect(payload.serving.time).toMatch(/^\d{1,2}:\d{1,2}:\d{1,2}$/);
  });
});

describe("copyDay", () => {
  it("defaults the source day to the day before the destination", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ copied: 3 }));
    await copyDay(session, "2026-08-20", undefined, fetcher);

    const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(payload.from).toBe("2026-8-19");
    expect(payload.to).toBe("2026-8-20");
  });
});

describe("getConsumedNutrients", () => {
  it("labels tracked nutrients and flattens macros from the All Targets category", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      // get_diary (inside get_nutrition_scores, for serving IDs)
      .mockResolvedValueOnce(
        jsonResponse({ diary: [{ servingId: 1, type: "Serving" }] }),
      )
      // get_nutrition_scores
      .mockResolvedValueOnce(
        jsonResponse({
          scores: [
            {
              components: [
                { amount: 1800, confidence: 5, nutrientId: 208 },
                { amount: 90, confidence: 4, nutrientId: 203 },
              ],
              title: "All Targets",
            },
          ],
        }),
      )
      // get_nutrients (definitions)
      .mockResolvedValueOnce(
        jsonResponse({
          nutrients: [
            { category: "Energy", id: 208, name: "Energy", unit: "kcal" },
            { category: "Macronutrients", id: 203, name: "Protein", unit: "g" },
          ],
        }),
      );

    const data = await getConsumedNutrients(session, "2026-08-20", fetcher);

    expect(data.macros).toEqual({
      alcohol: null,
      carbs: null,
      energy: 1800,
      fat: null,
      fiber: null,
      net_carbs: null,
      protein: 90,
    });
    expect(data.nutrients).toEqual([
      { amount: 1800, confidence: 5, id: 208, name: "Energy", unit: "kcal" },
      { amount: 90, confidence: 4, id: 203, name: "Protein", unit: "g" },
    ]);
  });
});

describe("createCustomFood", () => {
  it("normalizes per-serving nutrients to per-100g and rejects reserved extra IDs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ id: 777 }));
    await createCustomFood(
      session,
      {
        calories: 200,
        carbsG: 10,
        fatG: 5,
        name: "Test bar",
        proteinG: 20,
        servingGrams: 50,
      },
      fetcher,
    );

    const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    const byId = new Map(payload.data.nutrients.map((n: { amount: number; id: number }) => [n.id, n.amount]));
    expect(byId.get(208)).toBe(400); // 200 kcal per 50g -> 400 per 100g
    expect(byId.get(203)).toBe(40);
    expect(payload.data.measures[0]).toMatchObject({ name: "1 serving", value: 50 });

    await expect(
      createCustomFood(
        session,
        { calories: 1, carbsG: 0, extraNutrients: { "208": 5 }, fatG: 0, name: "x", proteinG: 0 },
        fetcher,
      ),
    ).rejects.toMatchObject({ reason: "request" });
  });
});

describe("getBiometrics", () => {
  it("defaults the range to the last 30 days ending today", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ data: [] }));
    await getBiometrics(session, 1, 1, undefined, "2026-08-20", fetcher);

    const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(payload).toMatchObject({ end: "2026-8-20", metricId: 1, start: "2026-7-21", unitId: 1 });
  });
});
