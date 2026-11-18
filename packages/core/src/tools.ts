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

const ENTRY_DIARY_GROUP_IDS = { uncategorized: 0, breakfast: 1, lunch: 2, dinner: 3, snacks: 4 } as const;

function summarizeFoodListItem(food: Record<string, unknown>): Record<string, unknown> {
  const measures = (Array.isArray(food.measures) ? food.measures : [])
    .filter(isRecord)
    .map((measure) => ({
      grams: measure.value,
      measure_id: measure.id,
      name: measure.name,
    }));
  return {
    ...(food.category !== undefined ? { category: food.category } : {}),
    ...(food.defaultMeasureId !== undefined ? { default_measure_id: food.defaultMeasureId } : {}),
    ...(food.id !== undefined ? { food_id: food.id } : {}),
    is_recipe: Array.isArray(food.ingredients) && food.ingredients.length > 0,
    ...(measures.length > 0 ? { measures } : {}),
    ...(food.name !== undefined ? { name: food.name } : {}),
    ...(food.source !== undefined ? { source: food.source } : {}),
  };
}

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

/**
 * Why a tool returned an error result, for telemetry only:
 * - `auth`: the user must reconnect (no linked account, expired session).
 * - `rejected`: Cronometer refused the request as asked (bad input, limits).
 * - `upstream`: Cronometer or this server failed; these are reported via `onError`.
 */
export type ToolErrorKind = "auth" | "rejected" | "upstream";

/**
 * Symbol-keyed so it never reaches the client: JSON serialization skips
 * symbol keys. Hosts read it from the handler's result to classify failures.
 */
export const TOOL_ERROR_KIND: unique symbol = Symbol.for("cronometer-mcp.tool-error-kind");

export function toolError(message: string, kind: ToolErrorKind = "upstream") {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
    [TOOL_ERROR_KIND]: kind,
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
    const error = toolError(message, "auth");
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
      if (error instanceof mobile.CronometerMobileError && error.reason === "request") {
        return toolError(mobileErrorMessage(error), "rejected");
      }
      onError?.(error, "mobile");
      return toolError(mobileErrorMessage(error), "upstream");
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
          if (error.reason === "format" || error.reason === "upstream") {
            onError?.(error, "export");
            return toolError(exportErrorMessage(error.reason), "upstream");
          }
          return toolError(exportErrorMessage(error.reason), "rejected");
        }
        onError?.(error, "export");
        return toolError("Cronometer data retrieval failed. Try again later.", "upstream");
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

  server.registerTool(
    "add_note",
    {
      ...authMetadata,
      annotations: WRITE_ANNOTATIONS,
      description:
        "Add a text note to a diary day. Returns the created note_id, which can be edited later with update_note.",
      inputSchema: z.object({
        text: z.string().min(1).describe("Note text to add to the diary day."),
        date: optionalDateString,
        diaryGroup: z
          .enum(["uncategorized", "breakfast", "lunch", "dinner", "snacks"])
          .default("uncategorized")
          .describe("Diary section to place the note in."),
      }),
    },
    async ({ text, date, diaryGroup }) =>
      withMobileSession(async (session) => {
        const note = await mobile.addNote(session, {
          date,
          diaryGroup: ENTRY_DIARY_GROUP_IDS[diaryGroup],
          text,
        });
        return {
          date: date ?? mobile.formatToday(session.timezone),
          note,
          note_id: note.noteId,
        };
      }),
  );

  server.registerTool(
    "update_note",
    {
      ...authMetadata,
      annotations: WRITE_ANNOTATIONS,
      description:
        "Update an existing diary note by note_id. Use get_food_log to find the note's note_id and date.",
      inputSchema: z.object({
        noteId: z.number().int().positive().describe("Note ID from get_food_log or add_note."),
        text: z.string().min(1).describe("Updated note text."),
        date: optionalDateString.describe("Date the note belongs to (YYYY-MM-DD). Defaults to today."),
        diaryGroup: z
          .enum(["uncategorized", "breakfast", "lunch", "dinner", "snacks"])
          .optional()
          .describe("Optional diary section override. Preserves the existing section when omitted."),
      }),
    },
    async ({ noteId, text, date, diaryGroup }) =>
      withMobileSession(async (session) => {
        const note = await mobile.updateNote(session, {
          date,
          diaryGroup: diaryGroup !== undefined ? ENTRY_DIARY_GROUP_IDS[diaryGroup] : undefined,
          noteId,
          text,
        });
        return {
          date: date ?? mobile.formatToday(session.timezone),
          note,
          note_id: note.noteId ?? noteId,
        };
      }),
  );

  server.registerTool(
    "get_diary_groups",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "Retrieve configured diary meal groups (including default slots like breakfast, lunch, dinner, snacks " +
        "and any custom group preferences found on the Cronometer profile).",
      inputSchema: z.object({}),
    },
    async () =>
      withMobileSession(async (session) => ({
        ...(await mobile.getDiaryGroups(session)),
      })),
  );

  server.registerTool(
    "get_logging_streak",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description: "Retrieve the user's consecutive food-logging streak as of a given date.",
      inputSchema: z.object({ date: optionalDateString }),
    },
    async ({ date }) =>
      withMobileSession(async (session) => ({
        date: date ?? mobile.formatToday(session.timezone),
        streak: await mobile.getLoggingStreak(session, date),
      })),
  );

  server.registerTool(
    "get_all_time_stats",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description: "Retrieve lifetime logging counts (servings, exercises, biometrics, and fasts) as of a date.",
      inputSchema: z.object({ date: optionalDateString }),
    },
    async ({ date }) =>
      withMobileSession(async (session) => {
        const res = await mobile.getAllTimeStats(session, date);
        return {
          date: date ?? mobile.formatToday(session.timezone),
          stats: res.allTimeStats ?? res,
        };
      }),
  );

  server.registerTool(
    "get_calendar_summary",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "Retrieve per-day logging flags (food, exercise, biometric, note, and completion status) over a date range " +
        "to spot days with missing or incomplete diary entries.",
      inputSchema: z.object({
        startDate: optionalDateString.describe("Defaults to 30 days ago."),
        endDate: optionalDateString.describe("Defaults to today."),
      }),
    },
    async ({ startDate, endDate }) =>
      withMobileSession(async (session) => {
        const end = endDate ?? mobile.formatToday(session.timezone);
        const start =
          startDate ?? mobile.formatDay(offsetDay(mobile.formatToday(session.timezone), -30), session.timezone);
        const res = await mobile.getCalendarSummary(session, startDate, endDate);
        return {
          calendar_info: res.calendarInfo ?? res,
          days_with_data: res.calendarInfo?.daysWithData ?? [],
          end_date: end,
          start_date: start,
        };
      }),
  );

  // ---------------------------------------------------------------------------
  // Exercises & activities
  // ---------------------------------------------------------------------------

  server.registerTool(
    "search_activities",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "Search Cronometer's exercise and activity database by name. Use the returned activity_id with add_exercise.",
      inputSchema: z.object({
        query: z.string().min(1).describe('Activity name or keyword (e.g. "running", "cycling").'),
      }),
    },
    async ({ query }) =>
      withMobileSession(async (session) => {
        const activities = await mobile.searchActivities(session, query);
        return {
          activities: activities.map((activity) => ({
            activity_id: activity.id,
            kcal_per_min_per_kg: activity.cals,
            legacy: activity.legacy,
            name: activity.name,
          })),
          count: activities.length,
          query,
        };
      }),
  );

  server.registerTool(
    "add_exercise",
    {
      ...authMetadata,
      annotations: WRITE_ANNOTATIONS,
      description:
        "Log an exercise entry to the diary. Use search_activities to find activity_id.",
      inputSchema: z.object({
        activityId: z.number().int().describe("Numeric activity ID from search_activities results."),
        minutes: z.number().positive().describe("Exercise duration in minutes."),
        caloriesBurned: z
          .number()
          .nonnegative()
          .optional()
          .describe("Optional calories burned (kcal, positive number). Overrides Cronometer's automatic burn estimate when provided."),
        name: z.string().min(1).optional().describe("Optional custom label for the exercise entry."),
        date: optionalDateString,
        diaryGroup: z
          .enum(["uncategorized", "breakfast", "lunch", "dinner", "snacks"])
          .default("uncategorized")
          .describe("Diary section to place the exercise in."),
      }),
    },
    async ({ activityId, minutes, caloriesBurned, name, date, diaryGroup }) =>
      withMobileSession(async (session) => {
        const result = await mobile.addExercise(session, {
          activityId,
          caloriesBurned,
          date,
          diaryGroup: ENTRY_DIARY_GROUP_IDS[diaryGroup],
          minutes,
          name,
        });
        return {
          activity_id: activityId,
          calories_burned: caloriesBurned ?? null,
          date: date ?? mobile.formatToday(session.timezone),
          exercise_id: result.id,
          minutes,
        };
      }),
  );

  server.registerTool(
    "get_recent_exercises",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description: "List recently logged exercises for quicker repeat logging with add_exercise.",
      inputSchema: z.object({
        limit: z.number().int().positive().max(100).default(10).describe("Maximum number of recent exercises to return."),
      }),
    },
    async ({ limit }) =>
      withMobileSession(async (session) => {
        const exercises = await mobile.getRecentExercises(session, limit);
        return {
          count: exercises.length,
          exercises,
          limit,
        };
      }),
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
    "get_nutrition_scores",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "Get Cronometer's nutrition adequacy score categories (e.g. All Targets, Vitamins, Minerals, " +
        "Antioxidants, Electrolytes) and their per-nutrient component amounts and confidence values for a day.",
      inputSchema: z.object({
        date: optionalDateString,
        includeSupplements: z
          .boolean()
          .default(true)
          .describe("Whether to include supplement entries when computing scores."),
      }),
    },
    async ({ date, includeSupplements }) =>
      withMobileSession(async (session) => {
        const raw = await mobile.getNutritionScores(session, date, includeSupplements);
        let definitions: Map<number, Record<string, unknown>>;
        try {
          definitions = await mobile.getNutrientDefinitions(session);
        } catch (error) {
          if (error instanceof mobile.CronometerMobileError && error.reason === "session") throw error;
          definitions = new Map();
        }
        const scores = (Array.isArray(raw.scores) ? raw.scores : [])
          .filter(isRecord)
          .map((category) => ({
            components: (Array.isArray(category.components) ? category.components : [])
              .filter(isRecord)
              .map((component) => {
                const id = typeof component.nutrientId === "number" ? component.nutrientId : undefined;
                const meta = id !== undefined ? definitions.get(id) : undefined;
                return {
                  amount: component.amount,
                  confidence: component.confidence,
                  name: meta?.name,
                  nutrient_id: component.nutrientId,
                  type: component.type,
                  unit: meta?.unit,
                };
              }),
            score: category.score,
            title: category.title,
          }));
        return {
          date: date ?? mobile.formatToday(session.timezone),
          include_supplements: includeSupplements,
          scores,
        };
      }),
  );

  server.registerTool(
    "get_nutrient_definitions",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "Retrieve Cronometer's nutrient definition catalog (nutrient IDs, names, units, categories, and parent IDs). " +
        "Use the returned nutrient_id with set_nutrient_target, get_nutrition_trends, or extraNutrients.",
      inputSchema: z.object({
        category: z.string().min(1).optional().describe("Optional case-insensitive nutrient category filter."),
        query: z.string().min(1).optional().describe("Optional case-insensitive nutrient name filter."),
      }),
    },
    async ({ category, query }) =>
      withMobileSession(async (session) => {
        const defs = await mobile.getNutrientDefinitions(session);
        const categoryQuery = category?.trim().toLowerCase();
        const nameQuery = query?.trim().toLowerCase().replace(/fibre/g, "fiber");
        const nutrients = [...defs.values()]
          .map((item) => ({
            category: item.category,
            name: item.name,
            nutrient_id: item.id,
            parent_id: item.pid,
            sort_key: item.sortKey,
            unit: item.unit,
          }))
          .filter((item) => {
            if (categoryQuery) {
              const itemCat = typeof item.category === "string" ? item.category.toLowerCase() : "";
              if (!itemCat.includes(categoryQuery)) return false;
            }
            if (nameQuery) {
              const itemName = typeof item.name === "string" ? item.name.toLowerCase().replace(/fibre/g, "fiber") : "";
              if (!itemName.includes(nameQuery)) return false;
            }
            return true;
          })
          .sort((a, b) => {
            const aKey = typeof a.sort_key === "number" ? a.sort_key : Number(a.nutrient_id ?? 0);
            const bKey = typeof b.sort_key === "number" ? b.sort_key : Number(b.nutrient_id ?? 0);
            return aKey - bKey;
          });
        return {
          count: nutrients.length,
          nutrients,
        };
      }),
  );

  server.registerTool(
    "get_nutrition_report",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description: "Retrieve a consolidated Cronometer nutrition report over a date range.",
      inputSchema: z.object({
        startDate: optionalDateString.describe("Defaults to 30 days ago."),
        endDate: optionalDateString.describe("Defaults to today."),
        type: z.string().min(1).default("All").describe('Report filter type (default "All").'),
        includeSupplements: z.boolean().default(true).describe("Whether to include supplement entries."),
        allTime: z.boolean().default(false).describe("Whether to compute an all-time report."),
      }),
    },
    async ({ startDate, endDate, type, includeSupplements, allTime }) =>
      withMobileSession(async (session) => {
        const end = endDate ?? mobile.formatToday(session.timezone);
        const start =
          startDate ?? mobile.formatDay(offsetDay(mobile.formatToday(session.timezone), -30), session.timezone);
        const report = await mobile.getNutritionReport(session, {
          allTime,
          endDate,
          includeSupplements,
          startDate,
          type,
        });
        return {
          all_time: allTime,
          end_date: end,
          include_supplements: includeSupplements,
          report,
          start_date: start,
          type,
        };
      }),
  );

  server.registerTool(
    "get_nutrition_trends",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "Retrieve daily historical intake points for a single nutrient over a date range via get_chart_data. " +
        "Use get_nutrient_definitions to find nutrient_id (e.g. 291 for Fiber, 203 for Protein).",
      inputSchema: z.object({
        nutrientId: z.number().int().describe("Numeric Cronometer nutrient ID from get_nutrient_definitions."),
        startDate: optionalDateString.describe("Defaults to 30 days ago."),
        endDate: optionalDateString.describe("Defaults to today."),
        dayType: z.string().min(1).default("All").describe('Day filter (default "All").'),
        ignoreEmptyTimestamps: z.boolean().default(true),
      }),
    },
    async ({ nutrientId, startDate, endDate, dayType, ignoreEmptyTimestamps }) =>
      withMobileSession(async (session) => {
        const end = endDate ?? mobile.formatToday(session.timezone);
        const start =
          startDate ?? mobile.formatDay(offsetDay(mobile.formatToday(session.timezone), -30), session.timezone);
        const series = await mobile.getNutritionTrends(session, nutrientId, {
          dayType,
          endDate,
          ignoreEmptyTimestamps,
          startDate,
        });
        let definitions: Map<number, Record<string, unknown>> = new Map();
        try {
          definitions = await mobile.getNutrientDefinitions(session);
        } catch (error) {
          if (error instanceof mobile.CronometerMobileError && error.reason === "session") throw error;
        }
        const meta = definitions.get(nutrientId);
        return {
          data: series.data ?? [],
          day_type: dayType,
          end_date: end,
          ...(typeof meta?.name === "string" ? { nutrient: meta.name } : {}),
          nutrient_id: nutrientId,
          start_date: start,
          ...(typeof meta?.unit === "string" ? { unit: meta.unit } : {}),
        };
      }),
  );

  server.registerTool(
    "get_weight_trends",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "Retrieve historical weight (or other biometric) chart series over a date range via get_chart_data.",
      inputSchema: z.object({
        metricId: z.number().int().positive().default(1).describe("Biometric metric ID (defaults to 1 for Weight)."),
        startDate: optionalDateString.describe("Defaults to 30 days ago."),
        endDate: optionalDateString.describe("Defaults to today."),
        dayType: z.string().min(1).default("All").describe('Day filter (default "All").'),
        ignoreEmptyTimestamps: z.boolean().default(true),
      }),
    },
    async ({ metricId, startDate, endDate, dayType, ignoreEmptyTimestamps }) =>
      withMobileSession(async (session) => {
        const end = endDate ?? mobile.formatToday(session.timezone);
        const start =
          startDate ?? mobile.formatDay(offsetDay(mobile.formatToday(session.timezone), -30), session.timezone);
        const series = await mobile.getWeightTrends(session, {
          dayType,
          endDate,
          ignoreEmptyTimestamps,
          metricId,
          startDate,
        });
        return {
          data: series.data ?? [],
          day_type: dayType,
          end_date: end,
          metric_id: metricId,
          sources: series.sources ?? [],
          start_date: start,
        };
      }),
  );

  server.registerTool(
    "get_energy_trends",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description: "Retrieve dashboard calorie intake and expenditure trend data for a date range preset.",
      inputSchema: z.object({
        dateRangeInt: z
          .number()
          .int()
          .nonnegative()
          .default(3)
          .describe("Cronometer dashboard date range preset enum (3 observed as default)."),
      }),
    },
    async ({ dateRangeInt }) =>
      withMobileSession(async (session) => ({
        date_range_int: dateRangeInt,
        energy_data: await mobile.getEnergyTrends(session, dateRangeInt),
      })),
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

  server.registerTool(
    "get_recent_foods",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description: "List recently logged foods for quicker repeat logging with add_food_entry.",
      inputSchema: z.object({}),
    },
    async () =>
      withMobileSession(async (session) => {
        const { foods, raw } = await mobile.getRecentFoods(session);
        return {
          count: foods.length,
          foods: foods.map(summarizeFoodListItem),
          ...(foods.length === 0 ? { raw } : {}),
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
    "list_custom_foods",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "List all user-created custom foods and recipes saved in Cronometer. " +
        "Use returned food_id values with get_food_details, update_custom_food, or add_food_entry.",
      inputSchema: z.object({}),
    },
    async () =>
      withMobileSession(async (session) => {
        const { foods, raw } = await mobile.listCustomFoods(session);
        return {
          count: foods.length,
          foods: foods.map(summarizeFoodListItem),
          ...(foods.length === 0 ? { raw } : {}),
        };
      }),
  );

  server.registerTool(
    "update_custom_food",
    {
      ...authMetadata,
      annotations: WRITE_ANNOTATIONS,
      description:
        "Edit an existing custom food's name, nutrition values, or serving size by food_id. " +
        "Reads the existing food first so omitted nutrients and measures are preserved. " +
        "Any nutrition values provided apply to the full serving size.",
      inputSchema: z.object({
        foodId: z.number().int().positive().describe("Custom food ID from list_custom_foods or add_custom_food."),
        name: z.string().min(1).optional().describe("Updated custom food name."),
        calories: z.number().nonnegative().optional().describe("Updated calories per serving (kcal)."),
        proteinG: z.number().nonnegative().optional().describe("Updated protein per serving (g)."),
        fatG: z.number().nonnegative().optional().describe("Updated fat per serving (g)."),
        carbsG: z.number().nonnegative().optional().describe("Updated carbs per serving (g)."),
        fiberG: z.number().nonnegative().optional().describe("Updated fiber per serving (g)."),
        sugarG: z.number().nonnegative().optional().describe("Updated sugar per serving (g)."),
        sodiumMg: z.number().nonnegative().optional().describe("Updated sodium per serving (mg)."),
        saturatedFatG: z.number().nonnegative().optional().describe("Updated saturated fat per serving (g)."),
        extraNutrients: z
          .record(z.string(), z.number())
          .optional()
          .describe("Additional nutrients to add or update, keyed by Cronometer nutrient ID and valued per serving."),
        servingName: z.string().min(1).optional().describe("Updated primary serving label."),
        servingGrams: z.number().positive().optional().describe("Updated grams per serving."),
        comments: z.string().nullable().optional().describe("Optional notes/comments for the custom food."),
      }),
    },
    async ({
      foodId,
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
      comments,
    }) =>
      withMobileSession(async (session) => {
        const updated = await mobile.updateCustomFood(session, {
          calories,
          carbsG,
          comments,
          extraNutrients,
          fatG,
          fiberG,
          foodId,
          name,
          proteinG,
          saturatedFatG,
          servingGrams,
          servingName,
          sodiumMg,
          sugarG,
        });
        const food = await mobile.getFood(session, updated.foodId).catch(() => null);
        return {
          food_id: updated.foodId,
          measure_id: food?.defaultMeasureId,
          name: updated.name,
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
    "get_nutrient_targets",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description:
        "Get configured minimum and maximum nutrient targets across all tracked nutrients (including macros, " +
        "fiber, vitamins, and minerals), along with units, visibility, and whether each target is customized.",
      inputSchema: z.object({
        includeHidden: z
          .boolean()
          .default(false)
          .describe("Whether to include hidden/untracked nutrients whose targets are not shown in the diary."),
        nutrient: z
          .string()
          .min(1)
          .optional()
          .describe('Optional case-insensitive nutrient name filter (e.g. "fiber", "vitamin d").'),
      }),
    },
    async ({ includeHidden, nutrient }) =>
      withMobileSession(async (session) => {
        const allTargets = await mobile.getNutrientTargets(session);
        const normalizeName = (value: string) => value.toLowerCase().replace(/fibre/g, "fiber");
        const query = nutrient ? normalizeName(nutrient.trim()) : undefined;
        const targets = allTargets.filter((target) => {
          if (!includeHidden && target.visible === false) return false;
          if (query) {
            return target.nutrient ? normalizeName(target.nutrient).includes(query) : false;
          }
          return true;
        });
        return {
          count: targets.length,
          include_hidden: includeHidden,
          ...(nutrient ? { nutrient_filter: nutrient } : {}),
          targets,
        };
      }),
  );

  server.registerTool(
    "set_macro_targets",
    {
      ...authMetadata,
      annotations: WRITE_ANNOTATIONS,
      description:
        "Set fixed gram macro targets (protein, net carbs, fat, with optional upper range bounds) " +
        "and/or a custom daily calorie target, and switch targeting mode to fixed grams. " +
        "Use get_macro_targets to inspect current values first.",
      inputSchema: z.object({
        proteinG: z.number().nonnegative().optional().describe("Fixed protein target (or range minimum) in grams."),
        proteinMaxG: z
          .number()
          .nonnegative()
          .nullable()
          .optional()
          .describe("Optional upper bound for protein range in grams. Pass null to clear."),
        netCarbsG: z.number().nonnegative().optional().describe("Fixed net carbs target (or range minimum) in grams."),
        netCarbsMaxG: z
          .number()
          .nonnegative()
          .nullable()
          .optional()
          .describe("Optional upper bound for net carbs range in grams. Pass null to clear."),
        fatG: z.number().nonnegative().optional().describe("Fixed fat target (or range minimum) in grams."),
        fatMaxG: z
          .number()
          .nonnegative()
          .nullable()
          .optional()
          .describe("Optional upper bound for fat range in grams. Pass null to clear."),
        caloriesKcal: z.number().nonnegative().optional().describe("Optional custom daily calorie target (kcal)."),
      }),
    },
    async ({ proteinG, proteinMaxG, netCarbsG, netCarbsMaxG, fatG, fatMaxG, caloriesKcal }) =>
      withMobileSession(async (session) => ({
        targets: await mobile.setMacroTargets(session, {
          caloriesKcal,
          fatG,
          fatMaxG,
          netCarbsG,
          netCarbsMaxG,
          proteinG,
          proteinMaxG,
        }),
      })),
  );

  server.registerTool(
    "set_macro_split",
    {
      ...authMetadata,
      annotations: WRITE_ANNOTATIONS,
      description:
        "Set the percentage-based macro split (protein, carbs, fat percentages summing to 100) " +
        "and switch targeting mode to percent. Optionally also sets a custom daily calorie target.",
      inputSchema: z.object({
        proteinPercent: z.number().min(0).max(100).describe("Protein percentage of calories (0-100)."),
        carbsPercent: z.number().min(0).max(100).describe("Carbohydrate percentage of calories (0-100)."),
        fatPercent: z.number().min(0).max(100).describe("Fat percentage of calories (0-100)."),
        caloriesKcal: z.number().nonnegative().optional().describe("Optional custom daily calorie target (kcal)."),
      }),
    },
    async ({ proteinPercent, carbsPercent, fatPercent, caloriesKcal }) =>
      withMobileSession(async (session) => ({
        targets: await mobile.setMacroSplit(session, {
          caloriesKcal,
          carbsPercent,
          fatPercent,
          proteinPercent,
        }),
      })),
  );

  server.registerTool(
    "set_nutrient_target",
    {
      ...authMetadata,
      annotations: WRITE_ANNOTATIONS,
      description:
        "Set minimum and optional maximum daily targets for an individual nutrient (e.g. fiber, vitamin D, sodium). " +
        "Use get_nutrient_definitions or get_nutrient_targets to find nutrient_id.",
      inputSchema: z.object({
        nutrientId: z.number().int().describe("Numeric Cronometer nutrient ID (e.g. 291 for Fiber)."),
        min: z.number().nonnegative().describe("Minimum daily target value in the nutrient's unit."),
        max: z
          .number()
          .nonnegative()
          .nullable()
          .optional()
          .describe("Optional maximum daily target value. Pass null to clear an existing upper bound."),
        visible: z
          .boolean()
          .optional()
          .describe("Whether the nutrient target should be visible in the diary UI. Preserves current state if omitted."),
        custom: z.boolean().default(true).describe("Whether to mark the target as custom (default true)."),
      }),
    },
    async ({ nutrientId, min, max, visible, custom }) =>
      withMobileSession(async (session) => ({
        target: await mobile.setNutrientTarget(session, {
          custom,
          max,
          min,
          nutrientId,
          visible,
        }),
      })),
  );

  server.registerTool(
    "get_macro_schedule",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description: "Retrieve macro target schedules assigned to weekdays (Cronometer Gold feature; empty when none configured).",
      inputSchema: z.object({}),
    },
    async () =>
      withMobileSession(async (session) => {
        const res = await mobile.getMacroSchedule(session);
        const schedules = Array.isArray(res.schedules) ? res.schedules : [];
        return {
          count: schedules.length,
          schedules,
        };
      }),
  );

  server.registerTool(
    "list_macro_templates",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description: "List saved macro target templates stored in Cronometer.",
      inputSchema: z.object({}),
    },
    async () =>
      withMobileSession(async (session) => {
        const res = await mobile.listMacroTemplates(session);
        const templates = Array.isArray(res.templates) ? res.templates : [];
        return {
          count: templates.length,
          templates,
        };
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
        "with their unit options. Use metric_id and unit_id from the results with get_biometrics or add_biometric.",
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

  server.registerTool(
    "add_biometric",
    {
      ...authMetadata,
      annotations: WRITE_ANNOTATIONS,
      description:
        "Log a biometric measurement (such as weight or body fat) to the diary. " +
        "Use list_biometrics first to find metric_id and unit_id.",
      inputSchema: z.object({
        metricId: z.number().int().describe("Numeric metric ID from list_biometrics (e.g. 1 for Weight)."),
        unitId: z.number().int().describe("Numeric unit ID from list_biometrics (e.g. 1 for kg, 2 for lb)."),
        amount: z.number().describe("Measured value in the specified unit."),
        date: optionalDateString,
        diaryGroup: z
          .enum(["uncategorized", "breakfast", "lunch", "dinner", "snacks"])
          .default("uncategorized")
          .describe("Diary section to place the biometric entry in."),
      }),
    },
    async ({ metricId, unitId, amount, date, diaryGroup }) =>
      withMobileSession(async (session) => {
        const result = await mobile.addBiometric(session, {
          amount,
          date,
          diaryGroup: ENTRY_DIARY_GROUP_IDS[diaryGroup],
          metricId,
          unitId,
        });
        return {
          amount,
          biometric_id: result.id,
          date: date ?? mobile.formatToday(session.timezone),
          metric_id: metricId,
          result,
          unit_id: unitId,
        };
      }),
  );

  server.registerTool(
    "get_recent_biometrics",
    {
      ...authMetadata,
      annotations: READ_ONLY_ANNOTATIONS,
      description: "List recently logged biometric measurements.",
      inputSchema: z.object({}),
    },
    async () =>
      withMobileSession(async (session) => {
        const biometrics = await mobile.getRecentBiometrics(session);
        return {
          biometrics,
          count: biometrics.length,
        };
      }),
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
