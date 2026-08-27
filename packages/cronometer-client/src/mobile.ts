/**
 * Cronometer mobile REST API client.
 *
 * Ported from the reverse-engineered Cronometer Android/Flutter API used by
 * rwestergren/cronometer-api-mcp (MIT). Talks to mobile.cronometer.com with
 * clean JSON payloads:
 *
 *   - v2 (`POST /api/v2/*`): JSON-body auth via an `auth` block on every call.
 *   - v3 (`DELETE /api/v3/user/{id}/*`): header-based auth (`x-crono-session`).
 *
 * Unlike the upstream client, this module never stores credentials. Sessions
 * are minted once during MCP authorization and live in the OAuth grant's
 * encrypted props; an expired `sessionKey` surfaces as a reconnect
 * instruction instead of triggering an automatic re-login.
 */

import { CronometerAuthenticationError } from "./cronometer";

const MOBILE_BASE_URL = "https://mobile.cronometer.com";
const UPSTREAM_TIMEOUT_MS = 30_000;

/** Auth block sent with every v2 request (mimics the Android app). */
const APP_AUTH = { api: 3, os: "Android", build: "2807", flavour: "free" } as const;

const LOGIN_BUILD = "4.48.2 b2807-a";
const LOGIN_DEVICE = "Android 14 (SDK 34), Google Pixel 6 Pro";

/** Fallback timezone if the login response has no usable IANA zone. */
const DEFAULT_TIMEZONE = "America/New_York";

export const NUTRIENT_IDS = {
  energy: 208,
  protein: 203,
  fat: 204,
  carbs: 205,
  fiber: 291,
  sugar: 269,
  sodium: 307,
  alcohol: 221,
  netCarbs: -1205,
  saturatedFat: 606,
} as const;

/** Macro fields surfaced as a flat convenience block in daily summaries. */
const SUMMARY_MACRO_IDS: Record<string, number> = {
  energy: NUTRIENT_IDS.energy,
  protein: NUTRIENT_IDS.protein,
  carbs: NUTRIENT_IDS.carbs,
  net_carbs: NUTRIENT_IDS.netCarbs,
  fat: NUTRIENT_IDS.fat,
  fiber: NUTRIENT_IDS.fiber,
  alcohol: NUTRIENT_IDS.alcohol,
};

/**
 * Nutrient IDs createCustomFood writes via its named macro args (including
 * derived/negative-ID duplicates). extraNutrients must not reuse one of these.
 */
const RESERVED_CUSTOM_FOOD_NUTRIENT_IDS = new Set<number>([
  NUTRIENT_IDS.energy,
  NUTRIENT_IDS.protein,
  NUTRIENT_IDS.fat,
  NUTRIENT_IDS.carbs,
  NUTRIENT_IDS.fiber,
  NUTRIENT_IDS.sugar,
  NUTRIENT_IDS.sodium,
  NUTRIENT_IDS.saturatedFat,
  NUTRIENT_IDS.netCarbs,
  -203,
  -204,
  -205,
  -221,
]);

export interface CronometerMobileSession {
  sessionKey: string;
  timezone?: string;
  userId: number;
}

export type CronometerMobileFailure = "request" | "session" | "upstream";

export class CronometerMobileError extends Error {
  constructor(readonly reason: CronometerMobileFailure, message?: string) {
    super(message ?? `Cronometer mobile request failed during ${reason}`);
    this.name = "CronometerMobileError";
  }
}

type Fetcher = typeof fetch;

interface JsonRecord {
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

function mentionsSecondFactor(value: string): boolean {
  return /two[- ]?factor|one[- ]?time|verification|authenticator|usercode|otp|2fa/i.test(value);
}

/**
 * Authenticate against the mobile API and return the fresh session.
 *
 * The login payload mirrors the Android app exactly. `timezone` must stay
 * null: a non-null value is treated by the endpoint as a *write* that would
 * overwrite the account's server-side zone. Sending null leaves the account
 * untouched and the response echoes the account's real zone.
 */
export async function authenticateCronometerMobile(
  username: string,
  password: string,
  userCode = "",
  fetcher: Fetcher = fetch,
): Promise<CronometerMobileSession> {
  const payload = {
    email: username,
    password,
    timezone: null,
    userCode: userCode === "" ? null : userCode,
    build: LOGIN_BUILD,
    device: LOGIN_DEVICE,
    firebaseToken: "",
    features: {
      food_search_config: '{"newSearch": true, "newSpellcheck": true}',
      use_gpt_autofill: "true",
    },
    auth: { userId: null, token: null, ...APP_AUTH },
    lastSeen: 0,
    config: { call_version: 2 },
  };

  const response = await postJson("/api/v2/login", payload, fetcher);
  const data = await readJsonResponse(response, "login");

  if (data.get("result") !== "SUCCESS" && !data.has("sessionKey")) {
    throw new CronometerAuthenticationError(
      mentionsSecondFactor(JSON.stringify(data)) ? "second_factor" : "credentials",
    );
  }

  const userId = data.number("id");
  const sessionKey = data.string("sessionKey");
  if (userId === undefined || sessionKey === undefined) {
    throw new CronometerAuthenticationError("session");
  }

  const timezone = data.string("timezone");
  return {
    sessionKey,
    timezone: isIanaZone(timezone) ? timezone : undefined,
    userId,
  };
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function authBlock(session: CronometerMobileSession): JsonRecord {
  return { userId: session.userId, token: session.sessionKey, ...APP_AUTH };
}

async function postJson(endpoint: string, body: unknown, fetcher: Fetcher): Promise<Response> {
  // text/plain matches the Android app's wire format even though the body is JSON.
  return fetcher(MOBILE_BASE_URL + endpoint, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "User-Agent": "Dart/3.9 (dart:io)",
      "accept-encoding": "gzip",
    },
    method: "POST",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}

/**
 * Send a v2 POST request with the JSON auth block injected. Expired sessions
 * surface as CronometerMobileError("session") -- there are no stored
 * credentials to re-login with, so callers must prompt for reconnection.
 */
async function requestV2(
  session: CronometerMobileSession,
  endpoint: string,
  payload: JsonRecord,
  fetcher: Fetcher,
): Promise<JsonRecord> {
  const body = { ...payload, auth: authBlock(session), lastSeen: 0 };
  const response = await postJson(endpoint, body, fetcher);

  if (response.status === 401 || response.status === 403) {
    throw new CronometerMobileError("session");
  }

  const data = await readJsonResponse(response, endpoint);
  const result = data.get("result");
  if (result === "FAIL" || result === "FAILURE") {
    throw new CronometerMobileError("session");
  }
  return data.raw;
}

function v3Headers(session: CronometerMobileSession): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "User-Agent": "Dart/3.9 (dart:io)",
    "x-crono-app-build-number": "2807",
    "x-crono-app-os": "android",
    "x-crono-app-version": "4.48.2",
    "x-crono-session": session.sessionKey,
  };
}

async function requestV3(
  session: CronometerMobileSession,
  method: string,
  path: string,
  jsonBody?: unknown,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  return fetcher(`${MOBILE_BASE_URL}/api/v3/user/${session.userId}${path}`, {
    body: jsonBody === undefined ? undefined : JSON.stringify(jsonBody),
    headers: v3Headers(session),
    method,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}

class JsonResponse {
  constructor(readonly raw: JsonRecord) {}

  get(key: string): unknown {
    return this.raw[key];
  }

  has(key: string): boolean {
    return key in this.raw;
  }

  string(key: string): string | undefined {
    const value = this.raw[key];
    return typeof value === "string" ? value : undefined;
  }

  number(key: string): number | undefined {
    return typeof this.raw[key] === "number" ? (this.raw[key] as number) : undefined;
  }

  array(key: string): JsonRecord[] {
    const value = this.raw[key];
    return Array.isArray(value) ? value.filter(isJsonRecord) : [];
  }

  record(key: string): JsonRecord | undefined {
    const value = this.raw[key];
    return isJsonRecord(value) ? value : undefined;
  }
}

async function readJsonResponse(response: Response, action: string): Promise<JsonResponse> {
  if (!response.ok) {
    throw new CronometerMobileError("upstream", `${action} returned HTTP ${response.status}`);
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new CronometerMobileError("upstream", `${action} returned a non-JSON response`);
  }
  if (!isJsonRecord(parsed)) {
    throw new CronometerMobileError("upstream", `${action} returned an unexpected response shape`);
  }
  return new JsonResponse(parsed);
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Dates and timezones
// ---------------------------------------------------------------------------

function isIanaZone(name: string | undefined): name is string {
  if (!name) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

function resolveTimezone(timezone: string | undefined): string {
  return isIanaZone(timezone) ? timezone : DEFAULT_TIMEZONE;
}

function zonedParts(timezone: string, instant: Date): Record<string, number> {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour12: false,
  });
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  if (parts.hour === 24) parts.hour = 0;
  return parts;
}

/** Today's date in the account timezone, formatted as Cronometer expects. */
export function formatToday(timezone: string | undefined, now: Date = new Date()): string {
  const parts = zonedParts(resolveTimezone(timezone), now);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Format a date for diary calls: non-zero-padded 'YYYY-M-D', matching the
 * Android app. Accepts YYYY-MM-DD input and normalizes it.
 */
export function formatDay(day: string | undefined, timezone?: string, now: Date = new Date()): string {
  if (day === undefined || day === "") return formatToday(timezone, now);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new CronometerMobileError("request", `Invalid date "${day}". Use YYYY-MM-DD.`);
  const [, year, month, dayOfMonth] = match;
  return `${Number(year)}-${Number(month)}-${Number(dayOfMonth)}`;
}

/** Map hour of day in the account timezone to a Cronometer meal group. */
export function mealGroupForHour(hour: number): number {
  if (hour >= 4 && hour < 10) return 1; // Breakfast
  if (hour >= 10 && hour < 14) return 2; // Lunch
  if (hour >= 14 && hour < 21) return 3; // Dinner
  return 4; // Snacks
}

function zonedClock(timezone: string | undefined, now: Date): { hour: number; minute: number; second: number } {
  const parts = zonedParts(resolveTimezone(timezone), now);
  return { hour: parts.hour, minute: parts.minute, second: parts.second };
}

function shiftedDay(day: string, deltaDays: number): string {
  // Accepts both padded and Cronometer's non-zero-padded day format.
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(day);
  if (!match) throw new CronometerMobileError("request", `Invalid date "${day}". Use YYYY-MM-DD.`);
  const timestamp =
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) + deltaDays * 86_400_000;
  return new Date(timestamp).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Food search & details
// ---------------------------------------------------------------------------

export async function searchFoods(
  session: CronometerMobileSession,
  query: string,
  fetcher: Fetcher = fetch,
): Promise<JsonRecord[]> {
  const data = await requestV2(
    session,
    "/api/v2/find_food",
    {
      config: { call_version: 1, newSearch: true, newSpellcheck: true },
      query,
      sources: ["All"],
      tab: "ALL",
    },
    fetcher,
  );
  return new JsonResponse(data).array("foods");
}

export async function getFood(
  session: CronometerMobileSession,
  foodId: number,
  fetcher: Fetcher = fetch,
): Promise<JsonRecord> {
  return requestV2(session, "/api/v2/get_food", { config: { call_version: 1 }, id: foodId }, fetcher);
}

async function getFoodsInternal(
  session: CronometerMobileSession,
  foodIds: number[],
  fetcher: Fetcher,
): Promise<JsonRecord[]> {
  if (foodIds.length === 0) return [];
  const data = await requestV2(
    session,
    "/api/v2/get_foods",
    { config: { call_version: 1 }, ids: foodIds },
    fetcher,
  );
  return new JsonResponse(data).array("foods");
}

// ---------------------------------------------------------------------------
// Diary: add / read / delete / manage
// ---------------------------------------------------------------------------

export interface AddServingOptions {
  date?: string;
  diaryGroup?: number;
  foodId: number;
  grams: number;
  measureId?: number;
  translationId?: number;
}

export async function addServing(
  session: CronometerMobileSession,
  options: AddServingOptions,
  fetcher: Fetcher = fetch,
): Promise<JsonRecord> {
  const timezone = session.timezone;
  const clock = zonedClock(timezone, new Date());
  let diaryGroup = options.diaryGroup ?? 0;
  if (diaryGroup === 0) diaryGroup = mealGroupForHour(clock.hour);

  const serving = {
    day: formatDay(options.date, timezone),
    foodId: options.foodId,
    grams: options.grams,
    measureId: options.measureId ?? 0,
    offset: null,
    order: (diaryGroup << 16) | 1,
    servingId: null,
    source: null,
    time: `${clock.hour}:${clock.minute}:${clock.second}`,
    translationId: options.translationId ?? 0,
    type: "Serving",
    userId: session.userId,
  };

  return requestV2(session, "/api/v2/add_serving", { config: { call_version: 2 }, serving }, fetcher);
}

export async function getDiary(
  session: CronometerMobileSession,
  date?: string,
  fetcher: Fetcher = fetch,
): Promise<JsonRecord> {
  return requestV2(
    session,
    "/api/v2/get_diary",
    { config: { call_version: 1 }, day: formatDay(date, session.timezone) },
    fetcher,
  );
}

export interface DeleteEntriesResult {
  count: number;
  removed: string[];
}

export async function deleteEntries(
  session: CronometerMobileSession,
  entryIds: string[],
  date?: string,
  fetcher: Fetcher = fetch,
): Promise<DeleteEntriesResult> {
  const diary = await getDiary(session, date, fetcher);
  const entries = new JsonResponse(diary)
    .array("diary")
    .filter((entry) => entryIds.includes(String(entry.servingId)));
  if (entries.length === 0) return { count: 0, removed: [] };

  const response = await requestV3(session, "DELETE", "/diary-entries", { diaryEntries: entries }, fetcher);
  if (response.status !== 204) {
    throw new CronometerMobileError(
      "upstream",
      `Deleting diary entries failed with HTTP ${response.status}`,
    );
  }
  const removed = entries.map((entry) => String(entry.servingId));
  return { count: removed.length, removed };
}

export async function markDayComplete(
  session: CronometerMobileSession,
  date: string,
  complete = true,
  fetcher: Fetcher = fetch,
): Promise<JsonRecord> {
  return requestV2(
    session,
    "/api/v2/set_complete",
    { complete, config: { call_version: 1 }, day: formatDay(date, session.timezone) },
    fetcher,
  );
}

export async function copyDay(
  session: CronometerMobileSession,
  toDate?: string,
  fromDate?: string,
  fetcher: Fetcher = fetch,
): Promise<JsonRecord> {
  const to = formatDay(toDate, session.timezone);
  const from = formatDay(fromDate ?? shiftedDay(to, -1), session.timezone);
  return requestV2(
    session,
    "/api/v2/copy",
    { config: { call_version: 1 }, diaryGroupNumber: null, from, to },
    fetcher,
  );
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export async function getNutrients(
  session: CronometerMobileSession,
  date?: string,
  fetcher: Fetcher = fetch,
): Promise<JsonRecord> {
  return requestV2(
    session,
    "/api/v2/get_nutrients",
    { config: { call_version: 1 }, day: formatDay(date, session.timezone) },
    fetcher,
  );
}

let nutrientDefinitionsCache: { byUserId: number; definitions: Map<number, JsonRecord> } | null = null;

/**
 * Nutrient definition catalog (id -> {name, unit, category}), cached per user
 * for the isolate lifetime since definitions are stable for an account.
 */
export async function getNutrientDefinitions(
  session: CronometerMobileSession,
  fetcher: Fetcher = fetch,
): Promise<Map<number, JsonRecord>> {
  if (nutrientDefinitionsCache?.byUserId === session.userId) {
    return nutrientDefinitionsCache.definitions;
  }
  const data = await getNutrients(session, undefined, fetcher);
  const definitions = new Map<number, JsonRecord>();
  for (const nutrient of new JsonResponse(data).array("nutrients")) {
    const id = nutrient.id;
    if (typeof id === "number") definitions.set(id, nutrient);
  }
  nutrientDefinitionsCache = { byUserId: session.userId, definitions };
  return definitions;
}

export async function getNutritionScores(
  session: CronometerMobileSession,
  date?: string,
  includeSupplements = true,
  fetcher: Fetcher = fetch,
): Promise<JsonRecord> {
  const diary = await getDiary(session, date, fetcher);
  const servingIds = new JsonResponse(diary)
    .array("diary")
    .filter((entry) => entry.type === "Serving")
    .map((entry) => entry.servingId)
    .filter((id): id is number => typeof id === "number");

  return requestV2(
    session,
    "/api/v2/get_nutrition_scores",
    {
      config: { call_version: 1 },
      endDay: "1900-1-1",
      servingIds,
      startDay: "1900-1-1",
      supplements: includeSupplements ? "true" : "false",
    },
    fetcher,
  );
}

export interface ConsumedNutrients {
  macros: Record<string, number | null>;
  nutrients: Array<JsonRecord & { amount: unknown; confidence?: unknown; id: number; name?: unknown; unit?: unknown }>;
}

/**
 * Consumed totals for every tracked nutrient, built from the server-computed
 * "All Targets" score category. A nutrient appears only if tracked in
 * Cronometer (i.e. it has a target set).
 */
export async function getConsumedNutrients(
  session: CronometerMobileSession,
  date?: string,
  fetcher: Fetcher = fetch,
): Promise<ConsumedNutrients> {
  const scores = await getNutritionScores(session, date, true, fetcher);
  const allTargets = new JsonResponse(scores)
    .array("scores")
    .find((category) => category.title === "All Targets");
  const components = allTargets ? new JsonResponse(allTargets).array("components") : [];

  const definitions = await getNutrientDefinitions(session, fetcher);
  const nutrients: ConsumedNutrients["nutrients"] = [];
  const amountsById = new Map<number, unknown>();

  for (const component of components) {
    const id = component.nutrientId;
    if (typeof id !== "number") continue;
    amountsById.set(id, component.amount);
    const meta = definitions.get(id) ?? {};
    nutrients.push({
      amount: component.amount,
      confidence: component.confidence,
      id,
      name: meta.name,
      unit: meta.unit,
    });
  }

  const macros: Record<string, number | null> = {};
  for (const [key, id] of Object.entries(SUMMARY_MACRO_IDS)) {
    const amount = amountsById.get(id);
    macros[key] = typeof amount === "number" ? amount : null;
  }

  return { macros, nutrients };
}

/**
 * Merge food metadata into a raw diary payload (best-effort): names, sources,
 * measures, servings, and per-entry scaled nutrients.
 */
export async function enrichDiaryServings(
  session: CronometerMobileSession,
  diary: JsonRecord,
  fetcher: Fetcher = fetch,
): Promise<JsonRecord> {
  const entries = Array.isArray(diary.diary) ? diary.diary.filter(isJsonRecord) : [];
  const foodIds = [
    ...new Set(
      entries
        .filter((entry) => entry.type === "Serving")
        .map((entry) => entry.foodId)
        .filter((id): id is number => typeof id === "number"),
    ),
  ].sort((a, b) => a - b);
  if (foodIds.length === 0) return diary;

  let foods: JsonRecord[];
  try {
    foods = await getFoodsInternal(session, foodIds, fetcher);
  } catch {
    return diary;
  }
  const foodById = new Map(foods.map((food) => [food.id, food] as const));
  let definitions: Map<number, JsonRecord>;
  try {
    definitions = await getNutrientDefinitions(session, fetcher);
  } catch {
    definitions = new Map();
  }

  for (const entry of entries) {
    if (entry.type !== "Serving") continue;
    const food = foodById.get(entry.foodId);
    if (!isJsonRecord(food)) continue;

    entry.name = food.name;
    entry.source = food.source;
    if (food.category !== undefined && food.category !== null) entry.category = food.category;

    const measures = new Map(
      (Array.isArray(food.measures) ? food.measures : [])
        .filter(isJsonRecord)
        .map((measure) => [measure.id, measure] as const),
    );
    const measure =
      (measures.get(entry.measureId) as JsonRecord | undefined) ??
      (measures.get(food.defaultMeasureId) as JsonRecord | undefined);
    const grams = entry.grams;

    if (isJsonRecord(measure)) {
      const gramsPerUnit = measure.value;
      entry.measure = {
        grams_per_unit: gramsPerUnit,
        measure_id: measure.id,
        name: measure.name,
      };
      if (
        typeof grams === "number" &&
        typeof gramsPerUnit === "number" &&
        gramsPerUnit !== 0
      ) {
        entry.servings = Math.round((grams / gramsPerUnit) * 10_000) / 10_000;
      }
    }

    if (typeof grams !== "number") continue;
    // Recipe measures store nutrients per serving ("grams" is a serving
    // count); weight measures store per-100g ("grams" is real grams).
    const scale = isJsonRecord(measure) && measure.type === "Recipe" ? grams : grams / 100;
    const scaled: JsonRecord[] = [];
    for (const nutrient of Array.isArray(food.nutrients) ? food.nutrients : []) {
      if (!isJsonRecord(nutrient)) continue;
      const id = nutrient.id;
      const amount = nutrient.amount;
      if (typeof id !== "number" || typeof amount !== "number") continue;
      const meta = definitions.get(id) ?? {};
      scaled.push({
        amount: Math.round(amount * scale * 10_000) / 10_000,
        id,
        name: meta.name,
        unit: meta.unit,
      });
    }
    entry.nutrients = scaled;
  }

  return diary;
}

// ---------------------------------------------------------------------------
// Macro targets
// ---------------------------------------------------------------------------

/**
 * There is no dedicated macro-target read endpoint: the Android Targets screen
 * loads its state from get_profile and carries it in `prefs` (array of
 * single-key string objects). Edits made on other clients (e.g. web) arrive as
 * check_messages notifications, after which the app refetches get_profile.
 *
 * `get_macro_schedules` / `get_macro_target_templates` exist for the Gold macro
 * scheduler surface but are not called by the Targets screen, so this client
 * does not use them.
 */
const TARGET_PREF_KEY_PREFIXES = ["targets.", "macro", "calories."];

/** Targeting mode derived from prefs; "grams" is also the unflagged default. */
export type MacroTargetsMode = "percent" | "grams";

export interface MacroTargetRange {
  /** Upper bound of a ranged target, when one is set. */
  max: number | null;
  value: number;
}

export interface MacroTargets {
  /**
   * Carb subtypes subtracted from displayed carb counts (server booleans are
   * strings; null means the account has no stored preference).
   */
  carbsExcludedFrom: {
    allulose: boolean | null;
    fiber: boolean | null;
    fructose: boolean | null;
    netCarbs: boolean | null;
    sugarAlcohol: boolean | null;
  };
  energy: {
    /** Percentage of burned calories added on top of the goal (e.g. 0.2). */
    activityBurnPercent: number | null;
    customTargetKcal: number | null;
    includeActivityBurn: boolean | null;
  };
  /** Fixed gram targets with optional range bounds. */
  fixedGrams: {
    fats: MacroTargetRange | null;
    netCarbs: MacroTargetRange | null;
    protein: MacroTargetRange | null;
  };
  mode: MacroTargetsMode;
  percentSplit: {
    carbs: number | null;
    fat: number | null;
    protein: number | null;
  };
  /** Raw target-related pref key/values, exactly as returned by get_profile. */
  prefs: Record<string, string>;
}

function prefMap(entries: JsonRecord[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of entries) {
    for (const [key, value] of Object.entries(entry)) {
      if (typeof value === "string") {
        map[key] = value;
      } else if (typeof value === "number" || typeof value === "boolean") {
        map[key] = String(value);
      }
    }
  }
  return map;
}

function prefNumber(prefs: Record<string, string>, key: string): number | undefined {
  const value = Number(prefs[key]);
  return prefs[key] !== undefined && prefs[key] !== "" && Number.isFinite(value) ? value : undefined;
}

function prefBoolean(prefs: Record<string, string>, key: string): boolean | undefined {
  if (prefs[key] === "true") return true;
  if (prefs[key] === "false") return false;
  return undefined;
}

function prefRange(prefs: Record<string, string>, baseKey: string): MacroTargetRange | null {
  const value = prefNumber(prefs, baseKey);
  if (value === undefined) return null;
  return { max: prefNumber(prefs, `${baseKey}.max`) ?? null, value };
}

export async function getMacroTargets(
  session: CronometerMobileSession,
  fetcher: Fetcher = fetch,
): Promise<MacroTargets> {
  const profile = await requestV2(
    session,
    "/api/v2/get_profile",
    { config: { call_version: 1 } },
    fetcher,
  );

  const allPrefs = prefMap(new JsonResponse(profile).array("prefs"));
  const prefs: Record<string, string> = {};
  for (const [key, value] of Object.entries(allPrefs)) {
    if (TARGET_PREF_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      prefs[key] = value;
    }
  }

  return {
    carbsExcludedFrom: {
      allulose: prefBoolean(prefs, "targets.macros.allulose") ?? null,
      fiber: prefBoolean(prefs, "targets.macros.fiber") ?? null,
      fructose: prefBoolean(prefs, "targets.macros.fructose") ?? null,
      netCarbs: prefBoolean(prefs, "targets.macros.netcarbs") ?? null,
      sugarAlcohol: prefBoolean(prefs, "targets.macros.sugaralcohol") ?? null,
    },
    energy: {
      activityBurnPercent: prefNumber(prefs, "calories.activity") ?? null,
      customTargetKcal: prefNumber(prefs, "targets.custom.energy.target") ?? null,
      includeActivityBurn: prefBoolean(prefs, "calories.goal") ?? null,
    },
    fixedGrams: {
      fats: prefRange(prefs, "targets.fixed.fats"),
      netCarbs: prefRange(prefs, "targets.fixed.net.carbs"),
      protein: prefRange(prefs, "targets.fixed.protein"),
    },
    mode: prefBoolean(prefs, "targets.macros.percent") === true ? "percent" : "grams",
    percentSplit: {
      carbs: prefNumber(prefs, "macroCarbs") ?? null,
      fat: prefNumber(prefs, "macroLipids") ?? null,
      protein: prefNumber(prefs, "macroProtein") ?? null,
    },
    prefs,
  };
}

// ---------------------------------------------------------------------------
// Fasting
// ---------------------------------------------------------------------------

export async function getFastingHistory(
  session: CronometerMobileSession,
  startDate?: string,
  endDate?: string,
  fetcher: Fetcher = fetch,
): Promise<JsonRecord> {
  const end = formatDay(endDate, session.timezone);
  const start = formatDay(startDate ?? shiftedDay(end, -30), session.timezone);
  return requestV2(
    session,
    "/api/v2/get_fasting_with_date_range",
    { config: { call_version: 1 }, end, start },
    fetcher,
  );
}

export async function getFastingStats(
  session: CronometerMobileSession,
  fetcher: Fetcher = fetch,
): Promise<JsonRecord> {
  return requestV2(session, "/api/v2/get_fasting_stats", { config: { call_version: 1 } }, fetcher);
}

// ---------------------------------------------------------------------------
// Biometrics
// ---------------------------------------------------------------------------

export async function listBiometrics(
  session: CronometerMobileSession,
  fetcher: Fetcher = fetch,
): Promise<JsonRecord[]> {
  const data = await requestV2(session, "/api/v2/get_metrics", { config: { call_version: 1 } }, fetcher);
  return new JsonResponse(data).array("metrics");
}

export async function getBiometrics(
  session: CronometerMobileSession,
  metricId: number,
  unitId: number,
  startDate?: string,
  endDate?: string,
  fetcher: Fetcher = fetch,
): Promise<JsonRecord> {
  const end = formatDay(endDate, session.timezone);
  const start = formatDay(startDate ?? shiftedDay(end, -30), session.timezone);
  return requestV2(
    session,
    "/api/v2/get_biometrics",
    { config: { call_version: 1 }, end, metricId, start, unitId },
    fetcher,
  );
}

// ---------------------------------------------------------------------------
// Custom foods
// ---------------------------------------------------------------------------

export interface CustomFoodInput {
  calories: number;
  carbsG: number;
  extraNutrients?: Record<string, number>;
  fatG: number;
  fiberG?: number;
  name: string;
  proteinG: number;
  saturatedFatG?: number;
  servingGrams?: number;
  servingName?: string;
  sodiumMg?: number;
  sugarG?: number;
}

export async function createCustomFood(
  session: CronometerMobileSession,
  input: CustomFoodInput,
  fetcher: Fetcher = fetch,
): Promise<{ foodId: number }> {
  const servingGrams = input.servingGrams ?? 100;
  const scale = servingGrams > 0 ? 100 / servingGrams : 1;
  const round = (value: number): number => Math.round(value * 100) / 100;
  const netCarbs = Math.max(0, input.carbsG - (input.fiberG ?? 0));

  const nutrients: Array<{ amount: number; id: number }> = [
    { amount: round(input.calories * scale), id: NUTRIENT_IDS.energy },
    { amount: round(input.proteinG * scale), id: NUTRIENT_IDS.protein },
    { amount: round(input.fatG * scale), id: NUTRIENT_IDS.fat },
    { amount: round(input.carbsG * scale), id: NUTRIENT_IDS.carbs },
    { amount: round((input.fiberG ?? 0) * scale), id: NUTRIENT_IDS.fiber },
    { amount: round((input.sugarG ?? 0) * scale), id: NUTRIENT_IDS.sugar },
    { amount: round((input.sodiumMg ?? 0) * scale), id: NUTRIENT_IDS.sodium },
    { amount: round((input.saturatedFatG ?? 0) * scale), id: NUTRIENT_IDS.saturatedFat },
    { amount: round(input.proteinG * scale), id: -203 },
    { amount: round(input.fatG * scale), id: -204 },
    { amount: round(input.carbsG * scale), id: -205 },
    { amount: 0, id: -221 },
    { amount: round(netCarbs * scale), id: NUTRIENT_IDS.netCarbs },
  ];

  const extra = input.extraNutrients ?? {};
  const overlap = Object.keys(extra)
    .map(Number)
    .filter((id) => RESERVED_CUSTOM_FOOD_NUTRIENT_IDS.has(id));
  if (overlap.length > 0) {
    throw new CronometerMobileError(
      "request",
      `extra_nutrients must not reuse IDs already covered by named macro args (${overlap.join(", ")}).`,
    );
  }
  for (const [rawId, amount] of Object.entries(extra)) {
    const id = Number(rawId);
    if (!Number.isInteger(id)) {
      throw new CronometerMobileError("request", `extra_nutrients keys must be integer nutrient IDs.`);
    }
    nutrients.push({ amount: round(amount * scale), id });
  }

  const data = await requestV2(
    session,
    "/api/v2/add_food",
    {
      config: { call_version: 1 },
      data: {
        alternateId: null,
        category: 0,
        comments: null,
        defaultMeasureId: 0,
        foodTags: [],
        id: 0,
        labelType: "AMERICAN_2016",
        measures: [
          {
            amount: 1,
            id: 0,
            name: input.servingName ?? "1 serving",
            type: "Atomic",
            value: servingGrams,
          },
        ],
        name: input.name,
        nutrients,
        owner: null,
        properties: {},
        retired: null,
        source: null,
      },
    },
    fetcher,
  );

  const foodId = new JsonResponse(data).number("id");
  if (foodId === undefined) {
    throw new CronometerMobileError("upstream", "Cronometer did not return a food ID.");
  }
  return { foodId };
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

/** Grams per ounce, matching the "oz" measure Cronometer attaches to recipes. */
const OZ_GRAMS = 28.3495231;

export interface RecipeIngredientInput {
  foodId: number;
  grams: number;
  measureId?: number;
}

export interface RecipeInput {
  comments?: string;
  ingredients: RecipeIngredientInput[];
  name: string;
  servingGrams?: number;
  servingName?: string;
}

function gramMeasureId(food: JsonRecord): number {
  const measures = Array.isArray(food.measures) ? food.measures.filter(isJsonRecord) : [];
  const gram = measures.find((measure) => measure.name === "g" && measure.value === 1);
  if (gram && typeof gram.id === "number") return gram.id;
  return typeof food.defaultMeasureId === "number" ? food.defaultMeasureId : 0;
}

function primaryTranslationId(food: JsonRecord): number {
  const translations = Array.isArray(food.translations)
    ? food.translations.filter(isJsonRecord)
    : [];
  const first = translations[0];
  if (first && typeof first.translationId === "number") return first.translationId;
  return 0;
}

/**
 * Create a recipe -- a food composed of other foods. Recipes go through the
 * same /api/v2/add_food endpoint as custom foods; an `ingredients` array is
 * what makes them a recipe. This creates a weight-based recipe (measures of
 * type "Weight", nutrients stored per-100g), which avoids the quirk where
 * serving-based recipes make the diary's `grams` field a serving count.
 */
export async function createRecipe(
  session: CronometerMobileSession,
  input: RecipeInput,
  fetcher: Fetcher = fetch,
): Promise<{ foodId: number; ingredientCount: number; totalGrams: number }> {
  if (input.ingredients.length === 0) {
    throw new CronometerMobileError("request", "A recipe requires at least one ingredient.");
  }

  const parsed = input.ingredients.map((ingredient) => ({
    foodId: ingredient.foodId,
    grams: ingredient.grams,
    measureId: ingredient.measureId,
  }));
  for (const ingredient of parsed) {
    if (!(ingredient.grams > 0)) {
      throw new CronometerMobileError(
        "request",
        `Ingredient grams must be positive (food ${ingredient.foodId}).`,
      );
    }
  }
  const totalGrams = parsed.reduce((sum, ingredient) => sum + ingredient.grams, 0);

  // One batch call resolves every ingredient's measures, translation, and
  // per-100g nutrient profile.
  const foods = await getFoodsInternal(
    session,
    parsed.map((ingredient) => ingredient.foodId),
    fetcher,
  );
  const foodById = new Map<number, JsonRecord>();
  for (const food of foods) {
    if (typeof food.id === "number") foodById.set(food.id, food);
  }
  const missing = parsed
    .map((ingredient) => ingredient.foodId)
    .filter((id) => !foodById.has(id));
  if (missing.length > 0) {
    throw new CronometerMobileError("request", `Ingredient food IDs not found: ${missing.join(", ")}.`);
  }

  const ingredientRows: JsonRecord[] = [];
  const batchTotals = new Map<number, number>();
  for (const ingredient of parsed) {
    const food = foodById.get(ingredient.foodId)!;
    const measureId =
      ingredient.measureId ?? gramMeasureId(food);
    ingredientRows.push({
      foodId: ingredient.foodId,
      grams: ingredient.grams,
      id: 0,
      measureId,
      translationId: primaryTranslationId(food),
      value: ingredient.grams,
    });
    // Ingredient nutrients are per-100g; accumulate the batch total.
    const nutrients = Array.isArray(food.nutrients) ? food.nutrients.filter(isJsonRecord) : [];
    for (const nutrient of nutrients) {
      const id = nutrient.id;
      const amount = nutrient.amount;
      if (typeof id !== "number" || typeof amount !== "number") continue;
      batchTotals.set(id, (batchTotals.get(id) ?? 0) + amount * ingredient.grams / 100);
    }
  }

  // Cronometer stores recipe nutrients per-100g of the finished batch.
  const scale = 100 / totalGrams;
  const nutrients = [...batchTotals.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, amount]) => ({
      amount: Math.round(amount * scale * 1_000_000) / 1_000_000,
      id,
    }));

  // The first measure becomes the server-assigned defaultMeasureId, so the
  // serving measure leads.
  const measures = [
    {
      amount: 1,
      id: 0,
      name: input.servingName ?? "Serving",
      type: "Weight",
      value: input.servingGrams ?? totalGrams,
    },
    { amount: 1, id: 0, name: "g", type: "Weight", value: 1 },
    { amount: 1, id: 0, name: "oz", type: "Weight", value: OZ_GRAMS },
    { amount: 1, id: 0, name: "full recipe", type: "Weight", value: totalGrams },
  ];

  const data = await requestV2(
    session,
    "/api/v2/add_food",
    {
      config: { call_version: 1 },
      data: {
        alternateId: null,
        category: 0,
        comments: input.comments ?? null,
        defaultMeasureId: 0,
        foodTags: [],
        id: 0,
        ingredients: ingredientRows,
        labelType: "AMERICAN_2016",
        measures,
        name: input.name,
        nutrients,
        owner: null,
        properties: { advancedServingSize: "false" },
        retired: null,
        source: null,
      },
    },
    fetcher,
  );

  const foodId = new JsonResponse(data).number("id");
  if (foodId === undefined) {
    throw new CronometerMobileError("upstream", "Cronometer did not return a recipe ID.");
  }
  return { foodId, ingredientCount: ingredientRows.length, totalGrams };
}
