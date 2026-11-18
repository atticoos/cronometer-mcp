import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer, InMemoryTransport, type Server } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { registerCronometerTools, type AuthContext } from "@cronometer-mcp/core";
import { createServer } from "../src/index";
import { PERMISSION_GROUPS } from "../src/consent/permissions";

let client: Client;

beforeAll(async () => {
  const server: Server = (createServer() as unknown as { server: Server }).server;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

describe("registered tool surface", () => {
  it("lists the full mobile + export tool set", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();

    expect(names).toEqual([
      "add_biometric",
      "add_custom_food",
      "add_exercise",
      "add_food_entry",
      "add_note",
      "add_recipe",
      "connection_status",
      "copy_day",
      "delete_custom_food",
      "delete_recipe",
      "get_all_time_stats",
      "get_biometrics",
      "get_calendar_summary",
      "get_cronometer_data",
      "get_daily_nutrition",
      "get_diary_groups",
      "get_energy_trends",
      "get_fasting_history",
      "get_fasting_stats",
      "get_food_details",
      "get_food_log",
      "get_logging_streak",
      "get_macro_schedule",
      "get_macro_targets",
      "get_nutrient_definitions",
      "get_nutrient_targets",
      "get_nutrition_report",
      "get_nutrition_scores",
      "get_nutrition_trends",
      "get_recent_biometrics",
      "get_recent_exercises",
      "get_recent_foods",
      "get_sleep_score",
      "get_weight_trends",
      "import_recipe",
      "list_biometrics",
      "list_custom_foods",
      "list_macro_templates",
      "mark_day_complete",
      "remove_food_entry",
      "search_activities",
      "search_foods",
      "set_macro_split",
      "set_macro_targets",
      "set_nutrient_target",
      "update_custom_food",
      "update_note",
    ]);
  });

  it("describes every tool on the consent screen exactly once", async () => {
    const { tools } = await client.listTools();
    const described = PERMISSION_GROUPS.flatMap((group) => group.tools.map((tool) => tool.name));
    expect([...described].sort()).toEqual(
      tools.map((tool) => tool.name).filter((name) => name !== "connection_status").sort(),
    );
    const deleteTools = PERMISSION_GROUPS.filter((group) => group.risk === "delete").flatMap((group) =>
      group.tools.map((tool) => tool.name),
    );
    const destructive = tools.filter((tool) => tool.annotations?.destructiveHint).map((tool) => tool.name);
    expect(deleteTools.sort()).toEqual(destructive.sort());
  });

  it("exposes JSON schemas for every tool", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.inputSchema, `${tool.name} inputSchema`).toHaveProperty("type");
      expect(tool._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["cronometer:read"] }]);
    }
  });

  it("falls back to a reconnect message without an authenticated HTTP request", async () => {
    const result = await client.callTool({
      name: "add_food_entry",
      arguments: { foodId: 1, measureId: 1, grams: 100 },
    });
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: expect.stringContaining("Reconnect") }],
    });
    expect(result._meta).toBeUndefined();
  });
});

describe("new MCP tool handlers", () => {
  let currentUserId: number;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let authedClient: Client;

  beforeEach(async () => {
    currentUserId = 42;
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const mcpServer = new McpServer({ name: "test-authed", version: "0.0.0" });
    registerCronometerTools(mcpServer, {
      getAuthContext: (): AuthContext => ({
        cronometerMobileSession: { sessionKey: "session-123", timezone: "UTC", userId: currentUserId },
        cronometerUsername: "person@example.com",
        cronometerWebSession: { cookies: "sesnonce=abc", userId: String(currentUserId) },
      }),
      oauth: {
        reauthorize: async () => 'Bearer error="invalid_token"',
        scopes: ["cronometer:read"],
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    authedClient = new Client({ name: "authed-test", version: "0.0.0" });
    await Promise.all([
      mcpServer.server.connect(serverTransport),
      authedClient.connect(clientTransport),
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function parseToolJson(result: Awaited<ReturnType<Client["callTool"]>>) {
    expect(result.isError).toBeUndefined();
    const first = (result.content as { type: string; text: string }[])[0];
    return JSON.parse(first.text) as Record<string, unknown>;
  }

  it("executes add_note and update_note", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/photoupload")) {
        return Response.json({ noteId: 777, order: 4 });
      }
      if (url.endsWith("/api/v2/get_diary")) {
        return Response.json({ diary: [{ noteId: 777, order: 131073, type: "Note" }] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const added = parseToolJson(
      await authedClient.callTool({
        name: "add_note",
        arguments: { date: "2026-04-20", diaryGroup: "lunch", text: "Felt energized" },
      }),
    );
    expect(added).toMatchObject({
      date: "2026-04-20",
      note_id: 777,
      status: "success",
    });

    const updated = parseToolJson(
      await authedClient.callTool({
        name: "update_note",
        arguments: { date: "2026-04-20", noteId: 777, text: "Felt great after lunch" },
      }),
    );
    expect(updated).toMatchObject({
      date: "2026-04-20",
      note_id: 777,
      status: "success",
    });
  });
  it("executes get_diary_groups with DG01..DG08 and DGnnON prefs", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ prefs: [{ DG02: "Morning" }, { DG06: "Late" }, { DG06ON: "true" }] }),
    );
    const res = parseToolJson(await authedClient.callTool({ name: "get_diary_groups", arguments: {} }));
    expect(res).toMatchObject({
      custom_group_prefs: { DG02: "Morning", DG06: "Late", DG06ON: "true" },
    });
    expect((res.groups as Array<Record<string, unknown>>)[1]).toMatchObject({
      custom: true,
      enabled: true,
      id: 1,
      name: "Morning",
      pref: "DG02",
    });
    expect((res.groups as Array<Record<string, unknown>>)[5]).toMatchObject({
      custom: true,
      enabled: true,
      id: 5,
      name: "Late",
      pref: "DG06",
    });
  });
  it("executes get_logging_streak, get_all_time_stats, and get_calendar_summary", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v2/get_streak")) return Response.json({ streak: 7 });
      if (url.endsWith("/api/v2/get_all_time_stats")) return Response.json({ allTimeStats: { servings: 100 } });
      if (url.endsWith("/api/v2/get_calendar_info")) {
        return Response.json({ calendarInfo: { daysWithData: [{ complete: true, day: "2026-04-20", loggedFood: true }] } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    expect(
      parseToolJson(await authedClient.callTool({ name: "get_logging_streak", arguments: { date: "2026-04-20" } })),
    ).toMatchObject({ streak: { streak: 7 } });
    expect(
      parseToolJson(await authedClient.callTool({ name: "get_all_time_stats", arguments: { date: "2026-04-20" } })),
    ).toMatchObject({ stats: { servings: 100 } });
    expect(
      parseToolJson(
        await authedClient.callTool({
          name: "get_calendar_summary",
          arguments: { endDate: "2026-04-20", startDate: "2026-04-01" },
        }),
      ),
    ).toMatchObject({ days_with_data: [{ complete: true, day: "2026-04-20", loggedFood: true }] });
  });
  it("executes search_activities and add_exercise", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v2/find_activity_V2")) {
        return Response.json({
          activities: [{ cals: 0.14, id: 501, legacy: false, name: "Running, 6 mph" }],
        });
      }
      if (url.endsWith("/api/v2/add_exercise")) {
        return Response.json({ id: 888 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const searched = parseToolJson(
      await authedClient.callTool({
        name: "search_activities",
        arguments: { query: "running" },
      }),
    );
    expect(searched).toMatchObject({
      activities: [{ activity_id: 501, kcal_per_min_per_kg: 0.14, legacy: false, name: "Running, 6 mph" }],
      count: 1,
      query: "running",
      status: "success",
    });

    const logged = parseToolJson(
      await authedClient.callTool({
        name: "add_exercise",
        arguments: {
          activityId: 501,
          caloriesBurned: 350,
          date: "2026-04-20",
          diaryGroup: "breakfast",
          minutes: 35,
          name: "Morning run",
        },
      }),
    );
    expect(logged).toMatchObject({
      activity_id: 501,
      calories_burned: 350,
      date: "2026-04-20",
      exercise_id: 888,
      minutes: 35,
      status: "success",
    });
  });

  it("executes get_recent_exercises", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ exercises: [{ id: 9, name: "Run" }] }));
    expect(
      parseToolJson(await authedClient.callTool({ name: "get_recent_exercises", arguments: { limit: 5 } })),
    ).toMatchObject({ count: 1, exercises: [{ id: 9, name: "Run" }], limit: 5 });
  });
  it("executes get_nutrition_scores and enriches nutrient names and units", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v2/get_diary")) {
        return Response.json({ diary: [{ servingId: 12, type: "Serving" }] });
      }
      if (url.endsWith("/api/v2/get_nutrition_scores")) {
        return Response.json({
          scores: [
            {
              components: [{ amount: 85, confidence: 1, nutrientId: 100, type: "TARGET" }],
              score: 85,
              title: "Vitamins",
            },
          ],
        });
      }
      if (url.endsWith("/api/v2/get_nutrients")) {
        return Response.json({
          nutrients: [{ id: 100, name: "Vitamin C", unit: "mg" }],
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const payload = parseToolJson(
      await authedClient.callTool({
        name: "get_nutrition_scores",
        arguments: { date: "2026-04-20", includeSupplements: false },
      }),
    );
    expect(payload).toMatchObject({
      date: "2026-04-20",
      include_supplements: false,
      scores: [
        {
          components: [
            { amount: 85, confidence: 1, name: "Vitamin C", nutrient_id: 100, type: "TARGET", unit: "mg" },
          ],
          score: 85,
          title: "Vitamins",
        },
      ],
      status: "success",
    });
  });

  it("propagates session expiration from get_nutrition_scores nutrient definition lookup", async () => {
    currentUserId = 43;
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v2/get_diary")) {
        return Response.json({ diary: [] });
      }
      if (url.endsWith("/api/v2/get_nutrition_scores")) {
        return Response.json({ scores: [] });
      }
      if (url.endsWith("/api/v2/get_nutrients")) {
        return Response.json({ error: "Invalid sessionKey", result: "FAIL" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await authedClient.callTool({
      name: "get_nutrition_scores",
      arguments: { date: "2026-04-20" },
    });
    expect(result.isError).toBe(true);
    expect(result._meta).toEqual({ "mcp/www_authenticate": ['Bearer error="invalid_token"'] });
  });

  it("executes get_nutrient_definitions with query filtering", async () => {
    currentUserId = 50;
    fetchMock.mockResolvedValueOnce(
      Response.json({
        nutrients: [
          { category: "Carbohydrates", id: 291, name: "Fiber", pid: 205, sortKey: 2, unit: "g" },
          { category: "Vitamins", id: 401, name: "Vitamin C", pid: 0, sortKey: 1, unit: "mg" },
        ],
      }),
    );

    const defs = parseToolJson(
      await authedClient.callTool({ name: "get_nutrient_definitions", arguments: { query: "fibre" } }),
    );
    expect(defs).toMatchObject({ count: 1, nutrients: [{ name: "Fiber", nutrient_id: 291, unit: "g" }] });
  });
  it("executes get_nutrition_report, get_nutrition_trends, get_weight_trends, and get_energy_trends", async () => {
    currentUserId = 51;
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v2/get_report")) return Response.json({ avgCalories: 2150 });
      if (url.endsWith("/api/v2/get_chart_data")) {
        return Response.json({ data: [{ day: "2026-04-20", value: 32 }], sources: [{ name: "Scale" }] });
      }
      if (url.endsWith("/api/v2/get_nutrients")) {
        return Response.json({ nutrients: [{ category: "Carbohydrates", id: 291, name: "Fiber", unit: "g" }] });
      }
      if (url.endsWith("/api/v2/get_dashboard_energy_data")) return Response.json({ consumed: [2000] });
      throw new Error(`Unexpected URL: ${url}`);
    });

    expect(
      parseToolJson(
        await authedClient.callTool({
          name: "get_nutrition_report",
          arguments: { endDate: "2026-04-20", startDate: "2026-04-01" },
        }),
      ),
    ).toMatchObject({ report: { avgCalories: 2150 } });
    expect(
      parseToolJson(
        await authedClient.callTool({
          name: "get_nutrition_trends",
          arguments: { endDate: "2026-04-20", nutrientId: 291, startDate: "2026-04-01" },
        }),
      ),
    ).toMatchObject({ data: [{ day: "2026-04-20", value: 32 }], nutrient: "Fiber", nutrient_id: 291, unit: "g" });
    expect(
      parseToolJson(
        await authedClient.callTool({
          name: "get_weight_trends",
          arguments: { endDate: "2026-04-20", startDate: "2026-04-01" },
        }),
      ),
    ).toMatchObject({ data: [{ day: "2026-04-20", value: 32 }], metric_id: 1 });
    expect(parseToolJson(await authedClient.callTool({ name: "get_energy_trends", arguments: {} }))).toMatchObject({
      date_range_int: 3,
      energy_data: { consumed: [2000] },
    });
  });
  it("executes get_nutrient_targets with visibility and fibre/fiber filtering", async () => {
    currentUserId = 44;
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v3/user/44/targets")) {
        return Response.json([
          { custom: true, id: 291, max: null, min: 30, vis: true },
          { custom: false, id: 307, max: 2300, min: 1500, vis: false },
        ]);
      }
      if (url.endsWith("/api/v2/get_nutrients")) {
        return Response.json({
          nutrients: [
            { category: "Carbohydrates", id: 291, name: "Fiber", unit: "g" },
            { category: "Minerals", id: 307, name: "Sodium", unit: "mg" },
          ],
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const visibleOnly = parseToolJson(
      await authedClient.callTool({
        name: "get_nutrient_targets",
        arguments: {},
      }),
    );
    expect(visibleOnly).toMatchObject({
      count: 1,
      include_hidden: false,
      status: "success",
      targets: [
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
      ],
    });

    const fibreFiltered = parseToolJson(
      await authedClient.callTool({
        name: "get_nutrient_targets",
        arguments: { includeHidden: true, nutrient: "fibre" },
      }),
    );
    expect(fibreFiltered).toMatchObject({
      count: 1,
      include_hidden: true,
      nutrient_filter: "fibre",
      status: "success",
      targets: [{ nutrient_id: 291, minimum: 30, maximum: null, custom: true }],
    });
  });

  it("executes set_nutrient_target", async () => {
    currentUserId = 52;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v3/user/52/targets")) {
        return Response.json([{ custom: true, id: 291, max: 40, min: 30, vis: true }]);
      }
      if (url.endsWith("/api/v2/edit_target")) {
        const body = JSON.parse(String(init?.body)) as { id: number; min: number; max: number | null };
        expect(body).toMatchObject({ id: 291, max: 40, min: 30 });
        return Response.json({ result: "SUCCESS" });
      }
      if (url.endsWith("/api/v2/get_nutrients")) {
        return Response.json({ nutrients: [{ category: "Carbohydrates", id: 291, name: "Fiber", pid: 205, sortKey: 10, unit: "g" }] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const targetRes = parseToolJson(
      await authedClient.callTool({
        name: "set_nutrient_target",
        arguments: { max: 40, min: 30, nutrientId: 291 },
      }),
    );
    expect(targetRes).toMatchObject({
      status: "success",
      target: { maximum: 40, minimum: 30, nutrient: "Fiber", nutrient_id: 291, unit: "g" },
    });
  });
  it("executes set_macro_targets, set_macro_split, and rejects invalid macro split", async () => {
    const prefsState: Record<string, string> = {
      "targets.macros.percent": "false",
    };

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v3/user/42/targets")) {
        return Response.json([
          { id: -203, max: null, min: 150, vis: true },
          { id: -204, max: null, min: 70, vis: true },
          { id: 205, max: null, min: 220, vis: true },
          { id: 208, max: null, min: 2200, vis: true },
        ]);
      }
      if (url.endsWith("/api/v2/set_pref")) {
        const body = JSON.parse(String(init?.body)) as { key: string; val: string };
        prefsState[body.key] = body.val;
        return Response.json({ result: "SUCCESS" });
      }
      if (url.endsWith("/api/v2/edit_target")) {
        return Response.json({ result: "SUCCESS" });
      }
      if (url.endsWith("/api/v2/get_profile")) {
        return Response.json({
          prefs: Object.entries(prefsState).map(([key, val]) => ({ [key]: val })),
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const targetsRes = parseToolJson(
      await authedClient.callTool({
        name: "set_macro_targets",
        arguments: { caloriesKcal: 2200, fatG: 70, netCarbsG: 220, proteinG: 150 },
      }),
    );
    expect(targetsRes).toMatchObject({
      status: "success",
      targets: {
        energy: { customTargetKcal: 2200 },
        fixedGrams: {
          fats: { max: null, value: 70 },
          netCarbs: { max: null, value: 220 },
          protein: { max: null, value: 150 },
        },
        mode: "grams",
      },
    });

    const invalidSplit = await authedClient.callTool({
      name: "set_macro_split",
      arguments: { carbsPercent: 40, fatPercent: 30, proteinPercent: 20 },
    });
    expect(invalidSplit).toMatchObject({
      isError: true,
      content: [{ type: "text", text: expect.stringContaining("100") }],
    });

    const splitRes = parseToolJson(
      await authedClient.callTool({
        name: "set_macro_split",
        arguments: { carbsPercent: 40, fatPercent: 30, proteinPercent: 30 },
      }),
    );
    expect(splitRes).toMatchObject({
      status: "success",
      targets: {
        mode: "percent",
        percentSplit: { carbs: 40, fat: 30, protein: 30 },
      },
    });
  });

  it("executes get_macro_schedule and list_macro_templates", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ schedules: [{ day: "MON" }] }))
      .mockResolvedValueOnce(Response.json({ templates: [{ id: 1, name: "Cut" }] }));
    expect(parseToolJson(await authedClient.callTool({ name: "get_macro_schedule", arguments: {} }))).toMatchObject({
      count: 1,
      schedules: [{ day: "MON" }],
    });
    expect(parseToolJson(await authedClient.callTool({ name: "list_macro_templates", arguments: {} }))).toMatchObject({
      count: 1,
      templates: [{ id: 1, name: "Cut" }],
    });
  });
  it("executes list_custom_foods, get_recent_foods, and update_custom_food", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v2/get_myfoods")) {
        return Response.json({ foods: [{ defaultMeasureId: 10, id: 555, measures: [{ id: 10, name: "1 bar", value: 50 }], name: "Bar" }] });
      }
      if (url.endsWith("/api/v2/get_recent_foods")) {
        return Response.json({ foods: [{ id: 12, name: "Oats" }] });
      }
      if (url.endsWith("/api/v2/get_food")) {
        return Response.json({
          defaultMeasureId: 10,
          id: 555,
          measures: [{ amount: 1, id: 10, name: "1 bar", type: "Atomic", value: 50 }],
          name: "Bar",
          nutrients: [{ amount: 400, id: 208 }],
          source: "Custom",
        });
      }
      if (url.endsWith("/api/v2/add_food")) {
        return Response.json({ id: 555, result: "SUCCESS" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const custom = parseToolJson(await authedClient.callTool({ name: "list_custom_foods", arguments: {} }));
    expect(custom).toMatchObject({ count: 1, foods: [{ food_id: 555, is_recipe: false, name: "Bar" }] });

    const recent = parseToolJson(await authedClient.callTool({ name: "get_recent_foods", arguments: {} }));
    expect(recent).toMatchObject({ count: 1, foods: [{ food_id: 12, name: "Oats" }] });

    const updatedFood = parseToolJson(
      await authedClient.callTool({
        name: "update_custom_food",
        arguments: { calories: 220, foodId: 555, name: "Bar v2" },
      }),
    );
    expect(updatedFood).toMatchObject({ food_id: 555, measure_id: 10, name: "Bar v2", status: "success" });
  });
  it("executes add_biometric", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: 991 }));

    const result = parseToolJson(
      await authedClient.callTool({
        name: "add_biometric",
        arguments: { amount: 74.5, date: "2026-04-20", metricId: 1, unitId: 1 },
      }),
    );
    expect(result).toMatchObject({
      amount: 74.5,
      biometric_id: 991,
      date: "2026-04-20",
      metric_id: 1,
      status: "success",
      unit_id: 1,
    });
  });

  it("executes get_recent_biometrics", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ biometrics: [{ amount: 74, metricId: 1 }] }));
    expect(parseToolJson(await authedClient.callTool({ name: "get_recent_biometrics", arguments: {} }))).toMatchObject({
      biometrics: [{ amount: 74, metricId: 1 }],
      count: 1,
    });
  });
  it("executes get_sleep_score", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ score: 88 }));
    expect(
      parseToolJson(await authedClient.callTool({ name: "get_sleep_score", arguments: { date: "2026-04-20" } })),
    ).toMatchObject({ available: true, sleep_score: { score: 88 } });
  });
  it("executes delete_custom_food", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v2/get_food")) {
        return Response.json({
          id: 555,
          measures: [{ amount: 1, id: 10, name: "bar", type: "Atomic", value: 50 }],
          name: "Bar",
          nutrients: [{ amount: 400, id: 208 }],
          source: "Custom",
        });
      }
      if (url.endsWith("/api/v2/add_food")) {
        return Response.json({ id: 555, result: "SUCCESS" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const retiredFood = parseToolJson(
      await authedClient.callTool({ name: "delete_custom_food", arguments: { foodId: 555 } }),
    );
    expect(retiredFood).toEqual({ food_id: 555, name: "Bar", retired: true, status: "success" });
  });
  it("executes delete_recipe", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v2/get_food")) {
        return Response.json({
          defaultMeasureId: 1,
          id: 888,
          ingredients: [{ foodId: 101, grams: 200 }],
          meal: false,
          name: "Gimbap",
          source: "Custom",
        });
      }
      if (url.endsWith("/api/v2/del_food")) {
        return Response.json({ result: "SUCCESS" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const deletedRecipe = parseToolJson(
      await authedClient.callTool({ name: "delete_recipe", arguments: { foodId: 888 } }),
    );
    expect(deletedRecipe).toEqual({
      food_id: 888,
      meal: false,
      name: "Gimbap",
      permanent: false,
      status: "success",
    });
  });
  it("executes import_recipe with save=false and save=true", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v2/import_recipe")) {
        return Response.json({
          id: "job-1",
          progress: 100,
          result: {
            entries: [
              {
                description: "Chicken",
                ingredient: { foodId: 101, grams: 200, measureId: 1 },
                rawIngredientImport: "200g chicken",
                servingSizeMatchFound: true,
              },
            ],
            recipe: { name: "Imported Gimbap" },
          },
        });
      }
      if (url.endsWith("/api/v2/get_foods")) {
        return Response.json({
          foods: [{ id: 101, measures: [{ id: 1, name: "g", value: 1 }], nutrients: [{ amount: 165, id: 208 }] }],
        });
      }
      if (url.endsWith("/api/v2/add_food")) {
        return Response.json({ id: 888, result: "SUCCESS" });
      }
      if (url.endsWith("/api/v2/get_food")) {
        return Response.json({ defaultMeasureId: 1, id: 888, name: "Gimbap", source: "Custom" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const preview = parseToolJson(
      await authedClient.callTool({
        name: "import_recipe",
        arguments: { ingredientsText: "200g chicken", save: false },
      }),
    );
    expect(preview).toMatchObject({ recipe_name: "Imported Gimbap", saved: false, status: "success" });

    const saved = parseToolJson(
      await authedClient.callTool({
        name: "import_recipe",
        arguments: { ingredientsText: "200g chicken", name: "Gimbap", save: true },
      }),
    );
    expect(saved).toMatchObject({ food_id: 888, ingredient_count: 1, measure_id: 1, saved: true, status: "success" });
  });
});
