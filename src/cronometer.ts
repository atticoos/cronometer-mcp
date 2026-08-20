const LOGIN_PAGE_URL = "https://cronometer.com/login/";
const LOGIN_URL = "https://cronometer.com/login";
const GWT_URL = "https://cronometer.com/cronometer/app";

const GWT_CONTENT_TYPE = "text/x-gwt-rpc; charset=UTF-8";
const GWT_MODULE_BASE = "https://cronometer.com/cronometer/";
const GWT_PERMUTATION = "7B121DC5483BF272B1BC1916DA9FA963";
const GWT_HEADER = "2D6A926E3729946302DC68073CB0D550";
const GWT_AUTHENTICATE =
  `7|0|5|${GWT_MODULE_BASE}|${GWT_HEADER}|` +
  "com.cronometer.shared.rpc.CronometerService|authenticate|" +
  "java.lang.Integer/3438268394|1|2|3|4|1|5|5|-300|";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 15_000;

export interface CronometerSession {
  cookies: string;
  userId: string;
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

function browserHeaders(): Record<string, string> {
  return {
    Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "User-Agent": "chronometer-mcp/0.1 (+https://github.com/)",
  };
}

function assertUpstreamOk(response: Response, action: string): void {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Cronometer returned HTTP ${response.status} while ${action}`);
  }
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

async function readLimitedText(response: Response): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel("Response body exceeded limit");
        throw new Error("Cronometer returned an unexpectedly large response");
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
