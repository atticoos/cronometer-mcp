const LOGIN_PAGE_URL = "https://cronometer.com/login/";
const LOGIN_URL = "https://cronometer.com/login";
const GWT_URL = "https://cronometer.com/cronometer/app";
const EXPORT_URL = "https://cronometer.com/export";

const GWT_CONTENT_TYPE = "text/x-gwt-rpc; charset=UTF-8";
const GWT_MODULE_BASE = "https://cronometer.com/cronometer/";
const GWT_PERMUTATION = "7B121DC5483BF272B1BC1916DA9FA963";
const GWT_HEADER = "2D6A926E3729946302DC68073CB0D550";
const GWT_AUTHENTICATE =
  `7|0|5|${GWT_MODULE_BASE}|${GWT_HEADER}|` +
  "com.cronometer.shared.rpc.CronometerService|authenticate|" +
  "java.lang.Integer/3438268394|1|2|3|4|1|5|5|-300|";

const MAX_AUTH_RESPONSE_BYTES = 1024 * 1024;
const MAX_EXPORT_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_EXPORT_DAYS = 31;
const UPSTREAM_TIMEOUT_MS = 15_000;

const exportGenerators = {
  daily_nutrition: "dailySummary",
  servings: "servings",
  exercises: "exercises",
  biometrics: "biometrics",
  notes: "notes",
} as const;

export interface CronometerSession {
  cookies: string;
  userId: string;
}

export type CronometerExportType = keyof typeof exportGenerators;

export interface CronometerExport {
  columns: string[];
  rows: string[][];
}

export type CronometerExportFailure =
  | "date_range"
  | "format"
  | "rate_limit"
  | "session"
  | "too_large"
  | "upstream";

export class CronometerExportError extends Error {
  constructor(readonly reason: CronometerExportFailure) {
    super(`Cronometer export failed during ${reason}`);
    this.name = "CronometerExportError";
  }
}

export type CronometerAuthenticationFailure = "credentials" | "second_factor" | "session";

export class CronometerAuthenticationError extends Error {
  constructor(readonly reason: CronometerAuthenticationFailure) {
    super(`Cronometer authentication failed during ${reason}`);
    this.name = "CronometerAuthenticationError";
  }
}

type Fetcher = typeof fetch;

class CookieJar {
  readonly #cookies = new Map<string, string>();

  update(headers: Headers): void {
    for (const setCookie of headers.getSetCookie()) {
      const pair = setCookie.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;

      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (value === "") this.#cookies.delete(name);
      else this.#cookies.set(name, value);
    }
  }

  header(): string {
    return [...this.#cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  has(name: string): boolean {
    return this.#cookies.has(name);
  }
}

export async function authenticateCronometer(
  username: string,
  password: string,
  userCode = "",
  fetcher: Fetcher = fetch,
): Promise<CronometerSession> {
  const jar = new CookieJar();

  const loginPage = await fetcher(LOGIN_PAGE_URL, {
    headers: browserHeaders(),
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  assertUpstreamOk(loginPage, "loading the login page");
  jar.update(loginPage.headers);
  const loginHtml = await readLimitedText(loginPage);
  const antiCsrf = extractAntiCsrf(loginHtml);
  if (!antiCsrf) {
    throw new Error("Cronometer's login page did not contain an anti-CSRF token");
  }

  const form = new URLSearchParams({ anticsrf: antiCsrf, password, userCode, username });
  const loginResponse = await fetcher(LOGIN_URL, {
    body: form,
    headers: {
      ...browserHeaders(),
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: jar.header(),
      Origin: "https://cronometer.com",
      Referer: LOGIN_PAGE_URL,
    },
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  assertUpstreamOk(loginResponse, "submitting credentials");
  jar.update(loginResponse.headers);

  const loginResult = parseLoginResponse(await readLimitedText(loginResponse));
  if (loginResult.error) {
    throw new CronometerAuthenticationError(
      mentionsSecondFactor(`${loginResult.error} ${loginResult.redirect}`)
        ? "second_factor"
        : "credentials",
    );
  }
  if (!jar.has("sesnonce")) {
    throw new CronometerAuthenticationError(
      !userCode || mentionsSecondFactor(loginResult.redirect) ? "second_factor" : "credentials",
    );
  }

  const gwtResponse = await fetcher(GWT_URL, {
    body: GWT_AUTHENTICATE,
    headers: {
      "Content-Type": GWT_CONTENT_TYPE,
      Cookie: jar.header(),
      Origin: "https://cronometer.com",
      Referer: GWT_MODULE_BASE,
      "X-GWT-Module-Base": GWT_MODULE_BASE,
      "X-GWT-Permutation": GWT_PERMUTATION,
    },
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  assertUpstreamOk(gwtResponse, "authenticating the Cronometer session");
  jar.update(gwtResponse.headers);
  const gwtBody = await readLimitedText(gwtResponse);
  const userId = /OK\[(\d+),/.exec(gwtBody)?.[1];
  if (!userId) {
    throw new CronometerAuthenticationError("session");
  }

  return { cookies: jar.header(), userId };
}

export async function exportCronometerData(
  session: CronometerSession,
  type: CronometerExportType,
  startDate: string,
  endDate: string,
  fetcher: Fetcher = fetch,
): Promise<CronometerExport> {
  validateExportDateRange(startDate, endDate);

  const sessionNonce = cookieValue(session.cookies, "sesnonce");
  if (!sessionNonce || !/^\d+$/.test(session.userId)) {
    throw new CronometerExportError("session");
  }

  const tokenResponse = await fetcher(GWT_URL, {
    body: authorizationTokenBody(sessionNonce, session.userId),
    headers: {
      "Content-Type": GWT_CONTENT_TYPE,
      Cookie: session.cookies,
      Origin: "https://cronometer.com",
      Referer: GWT_MODULE_BASE,
      "X-GWT-Module-Base": GWT_MODULE_BASE,
      "X-GWT-Permutation": GWT_PERMUTATION,
    },
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  assertExportResponse(tokenResponse);
  const exportNonce = parseAuthorizationToken(
    await readLimitedText(tokenResponse, MAX_AUTH_RESPONSE_BYTES),
  );

  const exportUrl = new URL(EXPORT_URL);
  exportUrl.search = new URLSearchParams({
    nonce: exportNonce,
    generate: exportGenerators[type],
    start: startDate,
    end: endDate,
  }).toString();

  const exportResponse = await fetcher(exportUrl, {
    headers: {
      Accept: "text/csv,*/*;q=0.8",
      Cookie: session.cookies,
      Referer: GWT_MODULE_BASE,
    },
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  assertExportResponse(exportResponse);

  const contentType = exportResponse.headers.get("Content-Type")?.toLowerCase() ?? "";
  if (contentType.includes("text/html")) {
    throw new CronometerExportError("session");
  }

  let csv: string;
  try {
    csv = await readLimitedText(exportResponse, MAX_EXPORT_RESPONSE_BYTES);
  } catch (error) {
    if (error instanceof ResponseTooLargeError) throw new CronometerExportError("too_large");
    throw error;
  }
  if (/^\s*</.test(csv)) throw new CronometerExportError("session");
  return parseCronometerCsv(csv);
}

export function validateExportDateRange(startDate: string, endDate: string): void {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const days = (end - start) / 86_400_000 + 1;
  if (days < 1 || days > MAX_EXPORT_DAYS) {
    throw new CronometerExportError("date_range");
  }
}

export function parseCronometerCsv(csv: string): CronometerExport {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let endedWithNewline = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      endedWithNewline = false;
      continue;
    }

    if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      endedWithNewline = true;
    } else {
      field += character;
      endedWithNewline = false;
    }
  }

  if (quoted) throw new CronometerExportError("format");
  if (!endedWithNewline && (field !== "" || record.length > 0)) {
    record.push(field);
    records.push(record);
  }
  if (records.length === 0) return { columns: [], rows: [] };

  const columns = records[0];
  if (columns[0]?.charCodeAt(0) === 0xfeff) columns[0] = columns[0].slice(1);
  const rows = records.slice(1).filter((row) => row.some((value) => value !== ""));
  if (rows.some((row) => row.length !== columns.length)) {
    throw new CronometerExportError("format");
  }
  return { columns, rows };
}

function browserHeaders(): Record<string, string> {
  return {
    Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "User-Agent": "cronometer-mcp/0.1 (+https://github.com/)",
  };
}

function assertUpstreamOk(response: Response, action: string): void {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Cronometer returned HTTP ${response.status} while ${action}`);
  }
}

function assertExportResponse(response: Response): void {
  if (response.status === 401 || response.status === 403 || response.status === 302) {
    throw new CronometerExportError("session");
  }
  if (response.status === 429) throw new CronometerExportError("rate_limit");
  if (response.status < 200 || response.status >= 300) {
    throw new CronometerExportError("upstream");
  }
}

function authorizationTokenBody(sessionNonce: string, userId: string): string {
  return (
    `7|0|8|${GWT_MODULE_BASE}|${GWT_HEADER}|` +
    "com.cronometer.shared.rpc.CronometerService|generateAuthorizationToken|" +
    "java.lang.String/2004016611|I|com.cronometer.shared.user.AuthScope/2065601159|" +
    `${sessionNonce}|1|2|3|4|4|5|6|6|7|8|${userId}|3600|7|2|`
  );
}

function parseAuthorizationToken(body: string): string {
  const quoted = /"(?:[^"\\]|\\.)*"/.exec(body)?.[0];
  if (!quoted) throw new CronometerExportError("session");

  try {
    const token: unknown = JSON.parse(quoted);
    if (typeof token !== "string" || token.length < 1 || token.length > 4096) throw new Error();
    return token;
  } catch {
    throw new CronometerExportError("format");
  }
}

function cookieValue(cookieHeader: string, name: string): string | undefined {
  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 1) continue;
    if (cookie.slice(0, separator).trim() === name) {
      return cookie.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function parseIsoDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new CronometerExportError("date_range");
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new CronometerExportError("date_range");
  }
  return timestamp;
}

function extractAntiCsrf(html: string): string | undefined {
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const attributes = new Map<string, string>();
    for (const attribute of match[0].matchAll(
      /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
    )) {
      attributes.set(attribute[1].toLowerCase(), attribute[2] ?? attribute[3] ?? attribute[4]);
    }
    if (attributes.get("name") === "anticsrf") return attributes.get("value");
  }
  return undefined;
}

function parseLoginResponse(body: string): { error: string; redirect: string; success: boolean } {
  try {
    const value: unknown = JSON.parse(body);
    if (typeof value !== "object" || value === null) throw new Error();
    const record = value as Record<string, unknown>;
    return {
      error: typeof record.error === "string" ? record.error : "",
      redirect: typeof record.redirect === "string" ? record.redirect : "",
      success: record.success === true,
    };
  } catch {
    throw new Error("Cronometer returned an unexpected login response");
  }
}

function mentionsSecondFactor(value: string): boolean {
  return /two[- ]?factor|one[- ]?time|verification|authenticator|usercode|otp|2fa/i.test(value);
}

class ResponseTooLargeError extends Error {}

async function readLimitedText(
  response: Response,
  maxBytes = MAX_AUTH_RESPONSE_BYTES,
): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel("Response body exceeded limit");
        throw new ResponseTooLargeError("Cronometer returned an unexpectedly large response");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
