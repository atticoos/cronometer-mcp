import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  CronometerExportError,
  exportCronometerData,
  type CronometerExportType,
} from "@cronometer-mcp/cronometer-client";
import * as mobile from "@cronometer-mcp/cronometer-client";
import {
  authPropsSchema,
  type CronometerToolOptions,
} from "./context";

const RECONNECT_MESSAGE = "Reconnect this MCP connection to Cronometer first.";
const SESSION_EXPIRED_MESSAGE = "The Cronometer session has expired. Sign in to Cronometer again before retrying.";

export { authPropsSchema, mobileSessionSchema, webSessionSchema } from "./context";
export type { AuthContext } from "./context";

const READ_ONLY_ANNOTATIONS = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
  readOnlyHint: true,
} as const;

const WRITE_ANNOTATIONS = {
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
  readOnlyHint: false,
} as const;

const DESTRUCTIVE_ANNOTATIONS = {
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
  readOnlyHint: false,
} as const;

const dateString = z.string().describe("Date formatted exactly as YYYY-MM-DD.");

const optionalDateString = z
  .string()
  .optional()
  .describe("Date as YYYY-MM-DD. Defaults to today in the account's timezone.");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toolSuccess(payload: Record<string, unknown>) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ status: "success", ...payload }, null, 2),
      },
    ],
  };
}

export function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

function mobileErrorMessage(error: unknown): string {
  if (error instanceof mobile.CronometerMobileError) {
    if (error.reason === "request") return error.message;
    return "Cronometer could not complete the request. Try again later.";
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "The request to Cronometer timed out. Try again.";
  }
  return "Cronometer request failed. Try again later.";
}

/**
 * Register every Cronometer tool (mobile JSON API, CSV export, and connection
 * status) on the server. The host supplies `getAuthContext` so this package
 * stays decoupled from any particular MCP transport or auth mechanism.
 */
export function registerCronometerTools(server: McpServer, options: CronometerToolOptions): void {
  const { getAuthContext, oauth, onError } = options;
  const authMetadata = oauth
    ? { _meta: { securitySchemes: [{ type: "oauth2", scopes: oauth.scopes }] } }
    : {};

  async function authError(message: string) {
    const error = toolError(message);
    const challenge = await oauth?.reauthorize();
    return challenge
      ? { ...error, _meta: { "mcp/www_authenticate": [challenge] } }
      : error;
  }

  async function withMobileSession(
    run: (session: mobile.CronometerMobileSession) => Promise<Record<string, unknown>>,
  ) {
    const context = getAuthContext();
    if (!context) return authError(RECONNECT_MESSAGE);
    try {
      return toolSuccess(await run(context.cronometerMobileSession));
    } catch (error) {
      if (error instanceof mobile.CronometerMobileError && error.reason === "session") {
        return authError(SESSION_EXPIRED_MESSAGE);
      }
      if (!(error instanceof mobile.CronometerMobileError) || error.reason === "upstream") {
        onError?.(error, "mobile");
      }
      return toolError(mobileErrorMessage(error));
    }
  }

  server.registerTool(
    "connection_status",
    {
      ...authMetadata,
      description:
        "Check whether the current MCP authorization is linked to a Cronometer account.",
      inputSchema: z.object({}),
    },
    async () => {
      const parsed = authPropsSchema.safeParse(getAuthContext());
      return {
        content: [
          {
            type: "text" as const,
            text: parsed.success
              ? `Linked to Cronometer as ${parsed.data.cronometerUsername}. Session validity is checked when you use a data tool.`
              : "The MCP authorization is not linked to Cronometer.",
          },
        ],
      };
    },
  );

  server.registerTool(
    "get_cronometer_data",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "Retrieve one read-only Cronometer CSV export for an inclusive date range of up to 31 days. " +
        "Available datasets are daily nutrition summaries, food servings, exercises, biometrics, and notes. " +
        "Each call uses one of Cronometer's limited daily exports, so request only the data and dates needed.",
      inputSchema: z.object({
        dataType: z
          .enum(["daily_nutrition", "servings", "exercises", "biometrics", "notes"])
          .describe("The Cronometer dataset to retrieve."),
        startDate: z
          .string()
          .describe("First date to include, formatted exactly as YYYY-MM-DD."),
        endDate: z
          .string()
          .describe("Last date to include, formatted exactly as YYYY-MM-DD; maximum 31 inclusive days."),
      }),
    },
    async ({ dataType, startDate, endDate }) => {
      const context = authPropsSchema.safeParse(getAuthContext());
      if (!context.success) return authError(RECONNECT_MESSAGE);

      try {
        const result = await exportCronometerData(
          context.data.cronometerWebSession,
          dataType as CronometerExportType,
          startDate,
          endDate,
        );
        const rows = result.rows.slice(0, 1_000);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                columns: result.columns,
                dataType,
                endDate,
                rows,
                returnedRows: rows.length,
                startDate,
                totalRows: result.rows.length,
                truncated: rows.length < result.rows.length,
              }),
            },
          ],
        };
      } catch (error) {
        if (error instanceof CronometerExportError) {
          if (error.reason === "session") return authError(SESSION_EXPIRED_MESSAGE);
          if (error.reason === "format" || error.reason === "upstream") onError?.(error, "export");
          return toolError(exportErrorMessage(error.reason));
        }
        onError?.(error, "export");
        return toolError("Cronometer data retrieval failed. Try again later.");
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Food log & diary
  // ---------------------------------------------------------------------------

  server.registerTool(
    "get_food_log",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "Get all diary entries for a date, each enriched with food name, source, serving measure/count, " +
        "and that food's per-entry nutrient contribution, plus an energy_summary " +
        "(target/consumed/remaining kcal) and a nutrition_summary of consumed totals for every tracked nutrient.",
      inputSchema: z.object({ date: optionalDateString }),
    },
    async ({ date }) =>
      withMobileSession(async (session) => {
        const diary = await mobile.enrichDiaryServings(
          session,
          await mobile.getDiary(session, date),
        );

        const summary = isRecord(diary.summary) ? diary.summary : {};
        const macros = isRecord(summary.macros) ? summary.macros : {};
        const consumed = isRecord(summary.consumed) ? summary.consumed : {};
        const target = typeof macros.energy === "number" ? macros.energy : undefined;
        const consumedKcal = typeof consumed.total === "number" ? consumed.total : undefined;
        const energySummary =
          target !== undefined && consumedKcal !== undefined
            ? {
                consumed_kcal: consumedKcal,
                remaining_kcal: Math.round(target - consumedKcal),
                total_target_kcal: target,
              }
            : null;

        return {
          date: date ?? mobile.formatToday(session.timezone),
          diary,
          energy_summary: energySummary,
          nutrition_summary: await mobile.getConsumedNutrients(session, date),
        };
      }),
  );

  const DIARY_GROUP_IDS = { auto: 0, breakfast: 1, dinner: 3, lunch: 2, snacks: 4 } as const;

  server.registerTool(
    "add_food_entry",
    {
      ...authMetadata,
      annotations: WRITE_ANNOTATIONS,
      description:
        "Log a food serving to the diary. Use search_foods to find food_id and measure_id, then " +
        "get_food_details to confirm serving sizes and gram weights.",
      inputSchema: z.object({
        foodId: z.number().describe("Numeric food ID from search_foods results."),
        measureId: z
          .number()
          .describe("Measure/unit ID from search_foods or get_food_details."),
        grams: z.number().positive().describe("Weight of the serving in grams."),
        date: optionalDateString,
        translationId: z
          .number()
          .default(0)
          .describe("Translation ID from search results (usually 0)."),
        diaryGroup: z
          .enum(["auto", "breakfast", "lunch", "dinner", "snacks"])
          .default("auto")
          .describe("Meal slot; auto picks based on time of day."),
      }),
    },
    async ({ foodId, measureId, grams, date, translationId, diaryGroup }) =>
      withMobileSession(async (session) => ({
        entry: await mobile.addServing(session, {
          date,
          diaryGroup: DIARY_GROUP_IDS[diaryGroup],
          foodId,
          grams,
          measureId,
          translationId,
        }),
        note: "Use the returned serving ID to remove this entry with remove_food_entry.",
      })),
  );

  server.registerTool(
    "remove_food_entry",
    {
      ...authMetadata,
      annotations: DESTRUCTIVE_ANNOTATIONS,
      description:
        "Remove one or more diary entries by their serving IDs. Use get_food_log to find entry IDs.",
      inputSchema: z.object({
        entryIds: z.array(z.string()).min(1).describe("Serving/entry IDs to remove."),
        date: optionalDateString.describe("Date the entries belong to."),
      }),
    },
    async ({ entryIds, date }) =>
      withMobileSession(async (session) => ({
        date: date ?? mobile.formatToday(session.timezone),
        ...(await mobile.deleteEntries(session, entryIds, date)),
      })),
  );

  server.registerTool(
    "mark_day_complete",
    {
      ...authMetadata,
      annotations: WRITE_ANNOTATIONS,
      description: "Mark a diary day as complete or incomplete.",
      inputSchema: z.object({
        date: dateString,
        complete: z.boolean().default(true),
      }),
    },
    async ({ date, complete }) =>
      withMobileSession(async (session) => ({
        date,
        marked: complete ? "complete" : "incomplete",
        result: await mobile.markDayComplete(session, date, complete),
      })),
  );

  server.registerTool(
    "copy_day",
    {
      ...authMetadata,
      annotations: WRITE_ANNOTATIONS,
      description:
        "Copy all diary entries from the previous day to the given date. Additive -- existing entries on the destination date are kept.",
      inputSchema: z.object({ date: optionalDateString.describe("Destination date.") }),
    },
    async ({ date }) =>
      withMobileSession(async (session) => ({
        destination_date: date ?? mobile.formatToday(session.timezone),
        result: await mobile.copyDay(session, date),
      })),
  );

  // ---------------------------------------------------------------------------
  // Nutrition & food database
  // ---------------------------------------------------------------------------

  server.registerTool(
    "get_daily_nutrition",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "Consumed macro and micronutrient totals for every nutrient tracked in Cronometer. " +
        "Returns flat macro totals plus per-nutrient amounts with name, unit, category, and confidence. " +
        "A nutrient appears only if it has a target set in Cronometer.",
      inputSchema: z.object({ date: optionalDateString }),
    },
    async ({ date }) =>
      withMobileSession(async (session) => {
        const data = await mobile.getConsumedNutrients(session, date);
        return {
          date: date ?? mobile.formatToday(session.timezone),
          nutrients: data.nutrients,
          summary: data.macros,
        };
      }),
  );

  server.registerTool(
    "search_foods",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "Search the Cronometer food database by name. Use the returned food_id/measure_id with " +
        "add_food_entry, or pass food_id to get_food_details for full nutrition info.",
      inputSchema: z.object({
        query: z.string().min(1).describe('Food name or keyword (e.g. "chicken breast").'),
      }),
    },
    async ({ query }) =>
      withMobileSession(async (session) => {
        const foods = await mobile.searchFoods(session, query);
        return {
          count: foods.length,
          foods: foods.map((food) => ({
            food_id: food.id,
            measure_display: food.measureDisplayName,
            measure_id: food.measureId,
            name: food.name,
            score: food.score,
            source: food.source,
            translation_id: food.translationId,
          })),
          query,
        };
      }),
  );

  server.registerTool(
    "get_food_details",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "Get detailed food information including the full nutrient profile and available measure IDs " +
        "needed for add_food_entry.",
      inputSchema: z.object({
        foodId: z.number().describe("Food ID from search_foods results."),
      }),
    },
    async ({ foodId }) =>
      withMobileSession(async (session) => {
        const food = await mobile.getFood(session, foodId);
        return {
          default_measure_id: food.defaultMeasureId,
          food_id: food.id,
          measures: (Array.isArray(food.measures) ? food.measures : [])
            .filter(isRecord)
            .map((measure) => ({
              grams: measure.value,
              measure_id: measure.id,
              name: measure.name,
            })),
          name: food.name,
          nutrients: Array.isArray(food.nutrients) ? food.nutrients : [],
        };
      }),
  );

  // ---------------------------------------------------------------------------
  // Custom foods & recipes
  // ---------------------------------------------------------------------------

  server.registerTool(
    "add_custom_food",
    {
      ...authMetadata,
      annotations: WRITE_ANNOTATIONS,
      description:
        "Create a custom food in Cronometer with hand-entered nutrition. Nutrient amounts are for the " +
        "full serving size. After creation, log it with add_food_entry using the returned IDs.",
      inputSchema: z.object({
        name: z.string().min(1),
        calories: z.number().describe("Calories per serving (kcal)."),
        proteinG: z.number().describe("Protein per serving (g)."),
        fatG: z.number().describe("Fat per serving (g)."),
        carbsG: z.number().describe("Carbs per serving (g)."),
        fiberG: z.number().default(0).describe("Fiber per serving (g)."),
        sugarG: z.number().default(0).describe("Sugar per serving (g)."),
        sodiumMg: z.number().default(0).describe("Sodium per serving (mg)."),
        saturatedFatG: z.number().default(0).describe("Saturated fat per serving (g)."),
        extraNutrients: z
          .record(z.string(), z.number())
          .optional()
          .describe(
            "Additional nutrients beyond the core macros, keyed by Cronometer nutrient ID " +
              "(from get_daily_nutrition) and valued per the full serving. Must not reuse an ID " +
              "the named macro args already cover.",
          ),
        servingName: z.string().default("1 serving"),
        servingGrams: z.number().positive().default(100),
      }),
    },
    async ({
      name,
      calories,
      proteinG,
      fatG,
      carbsG,
      fiberG,
      sugarG,
      sodiumMg,
      saturatedFatG,
      extraNutrients,
      servingName,
      servingGrams,
    }) =>
      withMobileSession(async (session) => {
        const { foodId } = await mobile.createCustomFood(session, {
          calories,
          carbsG,
          extraNutrients,
          fatG,
          fiberG,
          name,
          proteinG,
          saturatedFatG,
          servingGrams,
          servingName,
          sodiumMg,
          sugarG,
        });
        // The write has already succeeded. A failed lookup must not prompt a retry.
        const food = await mobile.getFood(session, foodId).catch(() => null);
        return {
          food_id: foodId,
          measure_id: food?.defaultMeasureId,
          name,
          note: food
            ? "Use food_id and measure_id with add_food_entry to log this food."
            : "Food created. Use get_food_details with food_id to look up its serving sizes.",
        };
      }),
  );

  server.registerTool(
    "add_recipe",
    {
      ...authMetadata,
      annotations: WRITE_ANNOTATIONS,
      description:
        "Create a recipe from other foods in the database; Cronometer derives the full nutrient profile " +
        "from the ingredients. Use search_foods to find each ingredient's food_id. After creation, log " +
        "it with add_food_entry using the returned IDs.",
      inputSchema: z.object({
        name: z.string().min(1),
        ingredients: z
          .array(
            z.object({
              foodId: z.number(),
              grams: z.number().positive(),
              measureId: z
                .number()
                .optional()
                .describe("Overrides the unit shown in Cronometer's UI."),
            }),
          )
          .min(1)
          .describe('One entry per ingredient, e.g. {"foodId": 1234, "grams": 150}.'),
        servingName: z.string().default("Serving"),
        servingGrams: z
          .number()
          .positive()
          .optional()
          .describe("Grams in one serving. Defaults to the full batch weight."),
        comments: z.string().optional(),
      }),
    },
    async ({ name, ingredients, servingName, servingGrams, comments }) =>
      withMobileSession(async (session) => {
        const result = await mobile.createRecipe(session, {
          comments,
          ingredients: ingredients.map((ingredient) => ({
            foodId: ingredient.foodId,
            grams: ingredient.grams,
            measureId: ingredient.measureId,
          })),
          name,
          servingGrams,
          servingName,
        });
        // The write has already succeeded. A failed lookup must not prompt a retry.
        const food = await mobile.getFood(session, result.foodId).catch(() => null);
        return {
          food_id: result.foodId,
          ingredient_count: result.ingredientCount,
          measure_id: food?.defaultMeasureId,
          name,
          note: food
            ? "Use food_id and measure_id with add_food_entry to log this recipe."
            : "Recipe created. Use get_food_details with food_id to look up its serving sizes.",
          total_grams: result.totalGrams,
        };
      }),
  );

  // ---------------------------------------------------------------------------
  // Targets, fasting & biometrics
  // ---------------------------------------------------------------------------

  server.registerTool(
    "get_macro_targets",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "Get the user's current macro and energy targets from their Cronometer profile: " +
        "fixed gram targets (protein, net carbs, fat — with optional upper bounds), the " +
        "percent-based macro split, the active targeting mode (grams vs percent), energy goal " +
        "settings, which carb subtypes are excluded from carb counts, and raw target pref values.",
      inputSchema: z.object({}),
    },
    async () =>
      withMobileSession(async (session) => {
        const targets = await mobile.getMacroTargets(session);
        return { ...targets };
      }),
  );

  server.registerTool(
    "get_fasting_history",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "Get fasting history within a date range, including status, timestamps, and duration.",
      inputSchema: z.object({
        startDate: optionalDateString.describe("Defaults to 30 days ago."),
        endDate: optionalDateString.describe("Defaults to today."),
      }),
    },
    async ({ startDate, endDate }) =>
      withMobileSession(async (session) => ({
        end_date: endDate ?? mobile.formatToday(session.timezone),
        fasting: await mobile.getFastingHistory(session, startDate, endDate),
        start_date:
          startDate ?? mobile.formatDay(offsetDay(mobile.formatToday(session.timezone), -30), session.timezone),
      })),
  );

  server.registerTool(
    "get_fasting_stats",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "Get aggregate fasting statistics: total fasting hours, longest fast, average duration, completed count.",
      inputSchema: z.object({}),
    },
    async () =>
      withMobileSession(async (session) => ({
        stats: await mobile.getFastingStats(session),
      })),
  );

  server.registerTool(
    "list_biometrics",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "List every biometric metric the account can record (Weight, Body Fat, Heart Rate, Blood Glucose, ...) " +
        "with their unit options. Use metric_id and unit_id from the results with get_biometrics.",
      inputSchema: z.object({}),
    },
    async () =>
      withMobileSession(async (session) => {
        const metrics = await mobile.listBiometrics(session);
        return {
          count: metrics.length,
          metrics: metrics.map((metric) => ({
            metric_id: metric.id,
            name: metric.name,
            units: (Array.isArray(metric.units) ? metric.units : [])
              .filter(isRecord)
              .map((unit) => ({ name: unit.name, unit_id: unit.id })),
          })),
        };
      }),
  );

  server.registerTool(
    "get_biometrics",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "Get a biometric time series such as weight or body fat over a date range, as a list of {day, value} points. " +
        "Use list_biometrics to find metric_id and unit_id (e.g. Weight is metric_id 1 with unit_id 1 for kg).",
      inputSchema: z.object({
        metricId: z.number().describe("Metric ID from list_biometrics."),
        unitId: z.number().describe("Unit ID from the metric's units in list_biometrics."),
        startDate: optionalDateString.describe("Defaults to 30 days ago."),
        endDate: optionalDateString.describe("Defaults to today."),
      }),
    },
    async ({ metricId, unitId, startDate, endDate }) =>
      withMobileSession(async (session) => ({
        biometrics: await mobile.getBiometrics(session, metricId, unitId, startDate, endDate),
        end_date: endDate ?? mobile.formatToday(session.timezone),
        metric_id: metricId,
        start_date:
          startDate ?? mobile.formatDay(offsetDay(mobile.formatToday(session.timezone), -30), session.timezone),
        unit_id: unitId,
      })),
  );
}

function offsetDay(day: string, deltaDays: number): string {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(day);
  if (!match) return day;
  const timestamp =
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) + deltaDays * 86_400_000;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function exportErrorMessage(reason: Exclude<CronometerExportError["reason"], "session">): string {
  switch (reason) {
    case "date_range":
      return "Use valid YYYY-MM-DD dates with the start on or before the end and no more than 31 inclusive days.";
    case "rate_limit":
      return "Cronometer's daily export limit has been reached. Try again later.";
    case "too_large":
      return "The Cronometer export was too large. Try a shorter date range.";
    case "format":
      return "Cronometer returned an unexpected export format. The private endpoint may have changed.";
    case "upstream":
      return "Cronometer could not generate the export. Try again later.";
  }
}
