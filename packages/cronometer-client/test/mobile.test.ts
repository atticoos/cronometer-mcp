import { describe, expect, it, vi } from "vitest";
import {
  addExercise,
  addNote,
  addServing,
  authenticateCronometerMobile,
  copyDay,
  createCustomFood,
  deleteEntries,
  formatDay,
  formatToday,
  getAllTimeStats,
  getBiometrics,
  getCalendarSummary,
  getConsumedNutrients,
  getDiary,
  getDiaryGroups,
  getEnergyTrends,
  getLoggingStreak,
  getMacroSchedule,
  getMacroTargets,
  getNutrientTargets,
  getNutritionReport,
  getNutritionTrends,
  getRecentExercises,
  getRecentFoods,
  getWeightTrends,
  listCustomFoods,
  listMacroTemplates,
  mealGroupForHour,
  searchActivities,
  setMacroSplit,
  setMacroTargets,
  setNutrientTarget,
  updateCustomFood,
  updateNote,
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

  it.each(["session expired", "Authentication Failed"])("treats a FAIL body with %s as an expired session", async (error) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error, result: "FAIL" }));
    await expect(getDiary(session, undefined, fetcher)).rejects.toMatchObject({ reason: "session" });
  });

  it("treats a FAIL body with another reason as a rejected request and keeps the reason", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ error: "Food not found", result: "FAIL" }),
    );
    await expect(getDiary(session, undefined, fetcher)).rejects.toMatchObject({
      message: "Cronometer rejected the request: Food not found",
      reason: "request",
    });
  });

  it("truncates a long FAIL reason", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ error: "x".repeat(1000), result: "FAIL" }),
    );
    const error = await getDiary(session, undefined, fetcher).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ reason: "request" });
    expect((error as Error).message.length).toBeLessThanOrEqual(340);
  });

  it("treats a FAIL body without a reason as an upstream failure", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ result: "FAIL" }));
    await expect(getDiary(session, undefined, fetcher)).rejects.toMatchObject({ reason: "upstream" });
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

  it("treats a v3 authentication rejection as an expired session", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ diary: [{ servingId: 101 }] }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));

    await expect(deleteEntries(session, ["101"], undefined, fetcher)).rejects.toMatchObject({
      reason: "session",
    });
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

describe("searchActivities & addExercise", () => {
  it("searches activities via find_activity_V2", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        activities: [{ cals: 0.13, id: 1265, legacy: true, name: "Running General" }],
      }),
    );

    const activities = await searchActivities(session, "running", fetcher);
    expect(activities).toEqual([{ cals: 0.13, id: 1265, legacy: true, name: "Running General" }]);
    expect(fetcher.mock.calls[0][0]).toBe("https://mobile.cronometer.com/api/v2/find_activity_V2");
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).query).toBe("running");
  });

  it("logs exercise with negative calories when caloriesBurned is supplied", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ id: 321 }));

    const res = await addExercise(
      session,
      { activityId: 1265, caloriesBurned: 250, date: "2026-08-20", diaryGroup: 2, minutes: 30 },
      fetcher,
    );
    expect(res).toEqual({ id: 321 });

    const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(payload.exercise).toMatchObject({
      activityId: 1265,
      calorieOverride: true,
      calories: -250,
      day: "2026-8-20",
      exerciseId: null,
      minutes: 30,
      order: (2 << 16) | 1,
      type: "Exercise",
      userId: 42,
    });
  });

  it("logs exercise without calorie override when caloriesBurned is omitted", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ id: 322 }));

    await addExercise(session, { activityId: 1265, date: "2026-08-20", minutes: 45 }, fetcher);
    const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(payload.exercise.calorieOverride).toBe(false);
    expect(payload.exercise.calories).toBeUndefined();
  });

  it("rejects non-positive duration or negative caloriesBurned", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      addExercise(session, { activityId: 1, minutes: 0 }, fetcher),
    ).rejects.toMatchObject({ reason: "request" });
    await expect(
      addExercise(session, { activityId: 1, caloriesBurned: -10, minutes: 20 }, fetcher),
    ).rejects.toMatchObject({ reason: "request" });
  });
});

describe("addNote & updateNote (/photoupload)", () => {
  it("submits multipart FormData to /photoupload with noteId 0 when adding a note", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ day: "2026-08-20", noteId: 444, order: 1, text: "Felt energized" }),
    );

    const note = await addNote(
      session,
      { date: "2026-08-20", text: "Felt energized" },
      fetcher,
    );

    expect(note).toMatchObject({ noteId: 444, text: "Felt energized" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://mobile.cronometer.com/photoupload");
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    expect(form.get("action")).toBe("diaryImage");
    expect(form.get("sessionKey")).toBe("mobile-session-key");
    expect(form.get("noteId")).toBe("0");
    expect(form.get("day")).toBe("2026-8-20");
    expect(form.get("order")).toBe("1");
    expect(form.get("deleteExistingPhoto")).toBe("false");
    expect(form.get("noteText")).toBe("Felt energized");
  });

  it("preserves the existing note's diary order when updating without diaryGroup", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ diary: [{ noteId: 444, order: (2 << 16) | 3, type: "Note" }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ day: "2026-08-20", noteId: 444, order: (2 << 16) | 3, text: "Updated" }),
      );

    await updateNote(session, { date: "2026-08-20", noteId: 444, text: "Updated" }, fetcher);

    const form = fetcher.mock.calls[1][1]?.body as FormData;
    expect(form.get("noteId")).toBe("444");
    expect(form.get("order")).toBe(String((2 << 16) | 3));
    expect(form.get("noteText")).toBe("Updated");
  });

  it("rejects empty note text and maps HTTP 401 to an expired session", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("", { status: 401 }));
    await expect(addNote(session, { text: "   " }, fetcher)).rejects.toMatchObject({ reason: "request" });
    await expect(addNote(session, { text: "ok" }, fetcher)).rejects.toMatchObject({ reason: "session" });
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

describe("getMacroTargets", () => {
  it("reads targets from get_profile prefs (captured payload shape)", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        result: "SUCCESS",
        prefs: [
          { "targets.fixed.protein": "211.0" },
          { "targets.fixed.protein.max": "260.0" },
          { "targets.fixed.fats": "62.0" },
          { "targets.fixed.fats.max": "80.0" },
          { "targets.fixed.net.carbs": "376.0" },
          { "targets.fixed.net.carbs.max": "380.0" },
          { macroProtein: "25.0" },
          { macroCarbs: "45.0" },
          { macroLipids: "30.0" },
          { "targets.macros.percent": "false" },
          { "targets.custom.energy.target": "2900.0" },
          { "calories.goal": "true" },
          { "calories.activity": "0.2" },
          { "targets.macros.netcarbs": "true" },
          { "targets.macros.fructose": "true" },
          { "targets.macros.sugaralcohol": "false" },
          { "targets.macros.fiber": "false" },
          { "targets.macros.allulose": "true" },
          { weightUnit: "Pounds" },
        ],
      }),
    );

    const targets = await getMacroTargets(session, fetcher);

    expect(fetcher.mock.calls[0][0]).toBe("https://mobile.cronometer.com/api/v2/get_profile");
    expect(targets.mode).toBe("grams");
    expect(targets.fixedGrams.protein).toEqual({ max: 260, value: 211 });
    expect(targets.fixedGrams.fats).toEqual({ max: 80, value: 62 });
    expect(targets.fixedGrams.netCarbs).toEqual({ max: 380, value: 376 });
    expect(targets.percentSplit).toEqual({ carbs: 45, fat: 30, protein: 25 });
    expect(targets.energy).toEqual({
      activityBurnPercent: 0.2,
      customTargetKcal: 2900,
      includeActivityBurn: true,
    });
    expect(targets.carbsExcludedFrom).toEqual({
      allulose: true,
      fiber: false,
      fructose: true,
      netCarbs: true,
      sugarAlcohol: false,
    });
    // only target-related keys are passed through
    expect(targets.prefs["weightUnit"]).toBeUndefined();
    expect(targets.prefs["targets.fixed.protein"]).toBe("211.0");
  });

  it("reports percent mode and null fields for accounts without stored targets", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ result: "SUCCESS", prefs: [{ "targets.macros.percent": "true" }] }),
      );

    const targets = await getMacroTargets(session, fetcher);

    expect(targets.mode).toBe("percent");
    expect(targets.fixedGrams).toEqual({ fats: null, netCarbs: null, protein: null });
    expect(targets.percentSplit).toEqual({ carbs: null, fat: null, protein: null });
    expect(targets.energy).toEqual({
      activityBurnPercent: null,
      customTargetKcal: null,
      includeActivityBurn: null,
    });
    expect(targets.prefs).toEqual({ "targets.macros.percent": "true" });
  });

  it("updates fixed macro targets via edit_target and set_pref mirror writes", async () => {
    const prefs = new Map<string, string>();
    const editCalls: Array<Record<string, unknown>> = [];

    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/targets")) {
        return jsonResponse([
          { custom: true, id: 203, max: 180, min: 150, vis: true },
          { custom: true, id: -1205, max: null, min: 200, vis: true },
          { custom: false, id: 204, max: null, min: 60, vis: true },
          { custom: true, id: 208, max: null, min: 2200, vis: true },
        ]);
      }
      const body = JSON.parse(String(init?.body));
      if (url.endsWith("/api/v2/edit_target")) {
        editCalls.push(body);
        return jsonResponse({ messages: [], result: "SUCCESS" });
      }
      if (url.endsWith("/api/v2/set_pref")) {
        prefs.set(body.key, body.val);
        return jsonResponse({ messages: [], result: "SUCCESS" });
      }
      if (url.endsWith("/api/v2/get_profile")) {
        return jsonResponse({
          prefs: [...prefs.entries()].map(([k, v]) => ({ [k]: v })),
          result: "SUCCESS",
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const updated = await setMacroTargets(
      session,
      { caloriesKcal: 2400, fatG: 70, netCarbsG: 250, proteinG: 170, proteinMaxG: 190 },
      fetcher,
    );

    expect(editCalls).toEqual([
      { auth: expect.any(Object), config: { call_version: 1 }, cus: true, id: 203, lastSeen: 0, max: 190, min: 170, vis: true },
      { auth: expect.any(Object), config: { call_version: 1 }, cus: true, id: -1205, lastSeen: 0, max: null, min: 250, vis: true },
      { auth: expect.any(Object), config: { call_version: 1 }, cus: true, id: 204, lastSeen: 0, max: null, min: 70, vis: true },
      { auth: expect.any(Object), config: { call_version: 1 }, cus: true, id: 208, lastSeen: 0, max: null, min: 2400, vis: true },
    ]);
    expect(updated.mode).toBe("grams");
    expect(updated.fixedGrams.protein).toEqual({ max: 190, value: 170 });
    expect(updated.fixedGrams.netCarbs).toEqual({ max: null, value: 250 });
    expect(updated.fixedGrams.fats).toEqual({ max: null, value: 70 });
    expect(updated.energy.customTargetKcal).toBe(2400);
  });

  it("validates macro target inputs before sending upstream requests", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(setMacroTargets(session, {}, fetcher)).rejects.toMatchObject({ reason: "request" });
    await expect(
      setMacroTargets(session, { proteinG: 180, proteinMaxG: 150 }, fetcher),
    ).rejects.toMatchObject({ reason: "request" });
    await expect(
      setMacroTargets(session, { proteinMaxG: 150 }, fetcher),
    ).rejects.toMatchObject({ reason: "request" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("updates macro percentage split and rejects splits not summing to 100", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      setMacroSplit(session, { carbsPercent: 40, fatPercent: 30, proteinPercent: 20 }, fetcher),
    ).rejects.toMatchObject({ reason: "request" });
    expect(fetcher).not.toHaveBeenCalled();

    const prefs = new Map<string, string>();
    const splitFetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body));
      if (url.endsWith("/api/v2/set_pref")) {
        prefs.set(body.key, body.val);
        return jsonResponse({ messages: [], result: "SUCCESS" });
      }
      if (url.endsWith("/api/v2/get_profile")) {
        return jsonResponse({
          prefs: [...prefs.entries()].map(([k, v]) => ({ [k]: v })),
          result: "SUCCESS",
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const updated = await setMacroSplit(
      session,
      { carbsPercent: 40, fatPercent: 30, proteinPercent: 30 },
      splitFetcher,
    );
    expect(updated.mode).toBe("percent");
    expect(updated.percentSplit).toEqual({ carbs: 40, fat: 30, protein: 30 });
  });

  it("fetches macro schedules and templates", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ schedules: [{ day: "MON" }] }))
      .mockResolvedValueOnce(jsonResponse({ templates: [{ name: "Training" }] }));
    expect((await getMacroSchedule(session, fetcher)).schedules).toEqual([{ day: "MON" }]);
    expect((await listMacroTemplates(session, fetcher)).templates).toEqual([{ name: "Training" }]);
  });
});

describe("getDiaryGroups", () => {
  it("parses custom diary group preferences from get_profile", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        prefs: [{ "diary.group.2": "Midday Fuel" }, { otherPref: "ignored" }],
      }),
    );

    const groups = await getDiaryGroups(session, fetcher);
    expect(groups.custom_group_prefs).toEqual({ "diary.group.2": "Midday Fuel" });
    expect(groups.groups.find((g) => g.id === 2)).toEqual({ custom: true, id: 2, name: "Midday Fuel" });
  });
});

describe("getLoggingStreak, getAllTimeStats & getCalendarSummary", () => {
  it("fetches streak, lifetime counts, and calendar flags", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v2/get_streak")) return jsonResponse({ streak: 14 });
      if (url.endsWith("/api/v2/get_all_time_stats")) {
        return jsonResponse({ allTimeStats: { biometrics: 12, day: "2026-8-20", exercises: 5, fasts: 3, servings: 250 } });
      }
      if (url.endsWith("/api/v2/get_calendar_info")) {
        return jsonResponse({ calendarInfo: { daysWithData: [{ complete: true, day: "2026-08-20", loggedFood: true }] } });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    expect(await getLoggingStreak(session, "2026-08-20", fetcher)).toEqual({ streak: 14 });
    expect((await getAllTimeStats(session, "2026-08-20", fetcher)).allTimeStats?.servings).toBe(250);
    expect((await getCalendarSummary(session, "2026-08-01", "2026-08-20", fetcher)).calendarInfo?.daysWithData).toHaveLength(1);
  });
});

describe("getRecentExercises", () => {
  it("requests recent_exercise_list with resultSetLimit", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ exercises: [{ activityId: 1265, minutes: 30 }] }));
    expect(await getRecentExercises(session, 5, fetcher)).toEqual([{ activityId: 1265, minutes: 30 }]);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).resultSetLimit).toBe(5);
  });
});

describe("reports and trend charts", () => {
  it("fetches nutrition reports and chart trends for nutrients, weight, and energy", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      calls.push({ body, url });
      if (url.endsWith("/api/v2/get_report")) return jsonResponse({ nutrients: [{ id: 208, avg: 2100 }] });
      if (url.endsWith("/api/v2/get_chart_data")) {
        return jsonResponse({ data: [{ day: "2026-08-20", value: 75.2 }], sources: [] });
      }
      if (url.endsWith("/api/v2/get_dashboard_energy_data")) return jsonResponse({ series: [{ day: "2026-08-20", kcal: 2100 }] });
      throw new Error(`Unexpected URL ${url}`);
    });

    expect(await getNutritionReport(session, { endDate: "2026-08-20", startDate: "2026-08-01" }, fetcher)).toHaveProperty("nutrients");
    expect((await getNutritionTrends(session, 291, { endDate: "2026-08-20", startDate: "2026-08-01" }, fetcher)).data).toHaveLength(1);
    expect((await getWeightTrends(session, { endDate: "2026-08-20", startDate: "2026-08-01" }, fetcher)).data).toHaveLength(1);
    expect(await getEnergyTrends(session, 3, fetcher)).toHaveProperty("series");

    const chartNutrientCall = calls.find((c) => c.url.endsWith("/get_chart_data") && c.body.chartDataType === "NUTRIENT");
    expect(chartNutrientCall?.body).toMatchObject({ nutrientId: 291, metricId: null, start: "2026-8-1", end: "2026-8-20" });
    const chartWeightCall = calls.find((c) => c.url.endsWith("/get_chart_data") && c.body.chartDataType === "BIOMETRIC");
    expect(chartWeightCall?.body).toMatchObject({ metricId: 1, nutrientId: null });
  });
});

describe("getNutrientTargets & setNutrientTarget", () => {
  it("reads per-nutrient targets from v3 /targets and enriches them with nutrient definitions", async () => {
    const targetSession = { ...session, userId: 4201 };
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v3/user/4201/targets")) {
        return jsonResponse([
          { custom: true, id: 291, max: null, min: 30, vis: true },
          { custom: false, id: -1205, max: 120, min: 80, vis: true },
          { custom: false, id: 307, max: 2300, min: 1500, vis: false },
        ]);
      }
      if (url.endsWith("/api/v2/get_nutrients")) {
        return jsonResponse({
          nutrients: [
            { category: "Carbohydrates", id: 291, name: "Fiber", unit: "g" },
            { category: "Minerals", id: 307, name: "Sodium", unit: "mg" },
          ],
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const targets = await getNutrientTargets(targetSession, fetcher);
    expect(targets).toEqual([
      {
        category: "Carbohydrates",
        custom: true,
        maximum: null,
        minimum: 30,
        nutrient: "Fiber",
        nutrient_id: 291,
        unit: "g",
        visible: true,
      },
      {
        category: "Carbohydrates",
        custom: false,
        maximum: 120,
        minimum: 80,
        nutrient: "Net Carbs",
        nutrient_id: -1205,
        unit: "g",
        visible: true,
      },
      {
        category: "Minerals",
        custom: false,
        maximum: 2300,
        minimum: 1500,
        nutrient: "Sodium",
        nutrient_id: 307,
        unit: "mg",
        visible: false,
      },
    ]);
  });

  it("propagates session errors from getNutrientDefinitions in getNutrientTargets", async () => {
    const targetSession = { ...session, userId: 4202 };
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v3/user/4202/targets")) {
        return jsonResponse([{ custom: true, id: 291, max: null, min: 30, vis: true }]);
      }
      if (url.endsWith("/api/v2/get_nutrients")) {
        return jsonResponse({ error: "Invalid sessionKey", result: "FAIL" });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    await expect(getNutrientTargets(targetSession, fetcher)).rejects.toMatchObject({ reason: "session" });
  });

  it("sets an individual nutrient target via edit_target preserving visibility", async () => {
    const targetSession = { ...session, userId: 4210 };
    let targetState = [{ custom: false, id: 291, max: null as number | null, min: 25, vis: false }];
    let editBody: Record<string, unknown> | undefined;

    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v3/user/4210/targets")) {
        return jsonResponse(targetState);
      }
      if (url.endsWith("/api/v2/edit_target")) {
        editBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        targetState = [
          {
            custom: Boolean(editBody.cus),
            id: Number(editBody.id),
            max: editBody.max as number | null,
            min: Number(editBody.min),
            vis: Boolean(editBody.vis),
          },
        ];
        return jsonResponse({ result: "SUCCESS" });
      }
      if (url.endsWith("/api/v2/get_nutrients")) {
        return jsonResponse({ nutrients: [{ category: "Carbohydrates", id: 291, name: "Fiber", unit: "g" }] });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const updated = await setNutrientTarget(targetSession, { max: 45, min: 30, nutrientId: 291 }, fetcher);
    expect(editBody).toMatchObject({ cus: true, id: 291, max: 45, min: 30, vis: false });
    expect(updated).toEqual({
      category: "Carbohydrates",
      custom: true,
      maximum: 45,
      minimum: 30,
      nutrient: "Fiber",
      nutrient_id: 291,
      unit: "g",
      visible: false,
    });
  });

});

describe("custom & recent food management", () => {
  it("lists custom foods and recent foods via get_myfoods and get_recent_foods", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ foods: [{ id: 101, name: "Home Granola" }] }))
      .mockResolvedValueOnce(jsonResponse({ foods: [{ id: 202, name: "Greek Yogurt" }] }));

    const custom = await listCustomFoods(session, fetcher);
    const recent = await getRecentFoods(session, fetcher);

    expect(custom.foods).toEqual([{ id: 101, name: "Home Granola" }]);
    expect(recent.foods).toEqual([{ id: 202, name: "Greek Yogurt" }]);
    expect(fetcher.mock.calls[0][0]).toBe("https://mobile.cronometer.com/api/v2/get_myfoods");
    expect(fetcher.mock.calls[1][0]).toBe("https://mobile.cronometer.com/api/v2/get_recent_foods");
  });

  it("updates an existing custom food while preserving untouched nutrients and updating mirrors", async () => {
    let submitted: Record<string, unknown> | undefined;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v2/get_food")) {
        return jsonResponse({
          category: 0,
          defaultMeasureId: 10,
          id: 555,
          measures: [
            { amount: 1, id: 10, name: "1 bar", type: "Atomic", value: 50 },
            { amount: 1, id: 1, name: "g", type: "Weight", value: 1 },
          ],
          name: "Old Bar",
          nutrients: [
            { amount: 400, id: 208 },
            { amount: 40, id: 203 },
            { amount: 40, id: -203 },
            { amount: 10, id: 204 },
            { amount: 10, id: -204 },
            { amount: 30, id: 205 },
            { amount: 30, id: -205 },
            { amount: 10, id: 291 },
            { amount: 20, id: -1205 },
            { amount: 50, id: 301 },
          ],
        });
      }
      if (url.endsWith("/api/v2/add_food")) {
        submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse({ id: 555, result: "SUCCESS" });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const updated = await updateCustomFood(
      session,
      { calories: 220, carbsG: 18, name: "New Bar", servingName: "1 bar (50g)" },
      fetcher,
    ).catch((e) => e);
    expect(updated).toMatchObject({ reason: "request" });

    const res = await updateCustomFood(
      session,
      { calories: 220, carbsG: 18, foodId: 555, name: "New Bar", servingName: "1 bar (50g)" },
      fetcher,
    );

    expect(res).toEqual({ foodId: 555, name: "New Bar" });
    const data = submitted?.data as Record<string, unknown>;
    expect(data.id).toBe(555);
    expect(data.name).toBe("New Bar");
    expect((data.measures as Array<Record<string, unknown>>)[0]).toMatchObject({
      id: 10,
      name: "1 bar (50g)",
      value: 50,
    });
    const nutrients = new Map(
      (data.nutrients as Array<{ amount: number; id: number }>).map((n) => [n.id, n.amount]),
    );
    expect(nutrients.get(208)).toBe(440); // 220 * (100/50)
    expect(nutrients.get(205)).toBe(36); // 18 * (100/50)
    expect(nutrients.get(-205)).toBe(36);
    expect(nutrients.get(-1205)).toBe(26); // 36 carbs - 10 fiber
    expect(nutrients.get(203)).toBe(40); // untouched protein preserved
    expect(nutrients.get(301)).toBe(50); // untouched micronutrient preserved
  });

  it("rejects updating a recipe via updateCustomFood", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        id: 777,
        ingredients: [{ foodId: 1, grams: 100 }],
        measures: [],
        name: "My Recipe",
        nutrients: [],
      }),
    );

    await expect(updateCustomFood(session, { foodId: 777, name: "Edited" }, fetcher)).rejects.toMatchObject({
      reason: "request",
    });
  });

});
