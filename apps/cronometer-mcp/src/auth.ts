import {
  AuthorizationError,
  type AuthRequest,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import {
  authenticateCronometer,
  CronometerAuthenticationError,
  authenticateCronometerMobile,
} from "cronometer-api";

const FLOW_PREFIX = "cronometer:auth-flow:";
const FLOW_TTL_SECONDS = 10 * 60;
const MAX_LOGIN_ATTEMPTS = 5;
const CSRF_COOKIE = "__Host-CRONOMETER_CSRF";
const READ_SCOPE = "cronometer:read";

type AuthEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

interface PendingFlow {
  attempts: number;
  clientName: string;
  csrfHash: string;
  oauthRequest: AuthRequest;
}

export const authHandler = {
  async fetch(request: Request, env: AuthEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return new Response("Cronometer MCP is running. Connect an MCP client at /mcp.", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname !== "/authorize") return new Response("Not found", { status: 404 });
    if (request.method === "GET") return beginAuthorization(request, env);
    if (request.method === "POST") return finishAuthorization(request, env);
    return new Response("Method not allowed", { headers: { Allow: "GET, POST" }, status: 405 });
  },
} satisfies ExportedHandler<AuthEnv>;

async function beginAuthorization(request: Request, env: AuthEnv): Promise<Response> {
  let oauthRequest: AuthRequest;
  try {
    oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch (error) {
    return authorizationErrorResponse(error);
  }

  const client = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId);
  if (!client) return htmlError("Unknown OAuth client", 400);

  const flowId = crypto.randomUUID();
  const csrfToken = crypto.randomUUID();
  const flow: PendingFlow = {
    attempts: 0,
    clientName: client.clientName ?? "ChatGPT",
    csrfHash: await sha256Hex(csrfToken),
    oauthRequest,
  };
  await env.OAUTH_KV.put(`${FLOW_PREFIX}${flowId}`, JSON.stringify(flow), {
    expirationTtl: FLOW_TTL_SECONDS,
  });

  return loginPage({
    clientName: flow.clientName,
    csrfToken,
    flowId,
    redirectUri: flow.oauthRequest.redirectUri,
    setCookie: csrfCookie(csrfToken, FLOW_TTL_SECONDS),
  });
}

async function finishAuthorization(request: Request, env: AuthEnv): Promise<Response> {
  if (!isAllowedAuthorizationOrigin(request)) return htmlError("Invalid request origin", 403);

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > 16_384) return htmlError("Request is too large", 413);

  const form = await request.formData();
  const flowId = stringField(form, "flow_id", 100);
  const csrfForm = stringField(form, "csrf_token", 100);
  const username = stringField(form, "username", 320);
  const password = stringField(form, "password", 1024);
  const userCode = stringField(form, "user_code", 64) ?? "";
  const csrfCookieValue = readCookie(request, CSRF_COOKIE);

  if (!flowId || !csrfForm || !username || !password || !csrfCookieValue) {
    return htmlError("The authorization request is incomplete or expired", 400);
  }

  const flowKey = `${FLOW_PREFIX}${flowId}`;
  const flow = await env.OAUTH_KV.get<PendingFlow>(flowKey, "json");
  const csrfHash = await sha256Hex(csrfForm);
  const cookieHash = await sha256Hex(csrfCookieValue);
  if (!flow || csrfHash !== flow.csrfHash || cookieHash !== flow.csrfHash) {
    return htmlError("The authorization request is incomplete or expired", 400);
  }
  if (flow.attempts >= MAX_LOGIN_ATTEMPTS) {
    await env.OAUTH_KV.delete(flowKey);
    return htmlError("Too many login attempts. Start the connection again.", 429);
  }

  try {
    // Both sessions are minted from the same credentials at authorization
    // time: the web/GWT session powers CSV exports, the mobile sessionKey
    // powers the JSON data tools. Neither password nor one-time code is ever
    // stored; if either handshake fails, authorization is aborted so the
    // grant always contains a complete, working pair.
    const [webSession, mobileSession] = await Promise.all([
      authenticateCronometer(username, password, userCode),
      authenticateCronometerMobile(username, password, userCode),
    ]);

    const subject = await sha256Hex(`cronometer:${webSession.userId}`);
    const requestedScopes = flow.oauthRequest.scope ?? [];
    const grantedScopes = requestedScopes.filter((scope) => scope === READ_SCOPE);
    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
      metadata: { provider: "cronometer" },
      props: {
        cronometerMobileSession: mobileSession,
        cronometerUsername: username,
        cronometerWebSession: webSession,
      },
      request: flow.oauthRequest,
      scope: grantedScopes,
      userId: subject,
    });
    await env.OAUTH_KV.delete(flowKey);

    return new Response(null, {
      headers: {
        Location: redirectTo.toString(),
        "Set-Cookie": csrfCookie("", 0),
      },
      status: 302,
    });
  } catch (error) {
    const attempts = flow.attempts + 1;
    await env.OAUTH_KV.put(flowKey, JSON.stringify({ ...flow, attempts }), {
      expirationTtl: FLOW_TTL_SECONDS,
    });

    const message = authenticationErrorMessage(error);
    return loginPage({
      clientName: flow.clientName,
      csrfToken: csrfForm,
      error: message,
      flowId,
      redirectUri: flow.oauthRequest.redirectUri,
    });
  }
}

function authorizationErrorResponse(error: unknown): Response {
  if (!(error instanceof AuthorizationError)) throw error;
  if (!error.redirectUri) return htmlError(error.description, 400);

  const redirect = new URL(error.redirectUri);
  redirect.searchParams.set("error", error.code);
  redirect.searchParams.set("error_description", error.description);
  if (error.state) redirect.searchParams.set("state", error.state);
  if (error.issuer) redirect.searchParams.set("iss", error.issuer);
  return Response.redirect(redirect, 302);
}

function loginPage(options: {
  clientName: string;
  csrfToken: string;
  error?: string;
  flowId: string;
  redirectUri: string;
  setCookie?: string;
}): Response {
  const error = options.error
    ? `<p class="error" role="alert">${escapeHtml(options.error)}</p>`
    : "";
  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Connect Cronometer</title>
  <style>
    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { background:#f5f7f2; color:#17210f; display:grid; margin:0; min-height:100vh; place-items:center; }
    main { background:white; border:1px solid #dce5d6; border-radius:16px; box-shadow:0 16px 50px #24351a14; box-sizing:border-box; max-width:440px; padding:32px; width:calc(100% - 32px); }
    h1 { font-size:1.5rem; margin:0 0 8px; } p { color:#52604b; line-height:1.5; }
    label { display:block; font-size:.875rem; font-weight:650; margin:18px 0 6px; }
    input { border:1px solid #aebaa7; border-radius:9px; box-sizing:border-box; font:inherit; padding:11px 12px; width:100%; }
    input:focus { border-color:#397d25; outline:3px solid #397d2526; }
    button { background:#397d25; border:0; border-radius:9px; color:white; cursor:pointer; font:inherit; font-weight:700; margin-top:22px; padding:12px; width:100%; }
    .error { background:#fff1f0; border:1px solid #ffc9c4; border-radius:8px; color:#8d1d15; padding:10px 12px; }
    .privacy { font-size:.8rem; margin-bottom:0; }
  </style>
</head>
<body><main>
  <h1>Connect your Cronometer account</h1>
  <p><strong>${escapeHtml(options.clientName)}</strong> is requesting read-only access through Cronometer MCP.</p>
  ${error}
  <form method="post" action="/authorize">
    <input type="hidden" name="flow_id" value="${escapeHtml(options.flowId)}">
    <input type="hidden" name="csrf_token" value="${escapeHtml(options.csrfToken)}">
    <label for="username">Cronometer username or email</label>
    <input id="username" name="username" autocomplete="username" maxlength="320" required>
    <label for="password">Cronometer password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" maxlength="1024" required>
    <label for="user_code">One-time code <span>(if enabled)</span></label>
    <input id="user_code" name="user_code" autocomplete="one-time-code" inputmode="numeric" maxlength="64" placeholder="000000">
    <button type="submit">Sign in and allow</button>
  </form>
  <p class="privacy">Your password is sent directly to Cronometer for this sign-in and is never stored. You can revoke the MCP connection at any time.</p>
</main></body></html>`;

  const headers = authorizationSecurityHeaders(options.redirectUri);
  if (options.setCookie) headers.set("Set-Cookie", options.setCookie);
  return new Response(body, { headers });
}

function htmlError(message: string, status: number): Response {
  const headers = authorizationSecurityHeaders();
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Authorization error</title><p>${escapeHtml(message)}</p>`,
    { headers, status },
  );
}

function authenticationErrorMessage(error: unknown): string {
  if (!(error instanceof CronometerAuthenticationError)) {
    return "Cronometer could not be reached. Please try again.";
  }
  switch (error.reason) {
    case "credentials":
      return "Cronometer did not accept those credentials. Re-enter them and try again.";
    case "second_factor":
      return "Cronometer requires a current one-time code. Re-enter your credentials and add the code from your authenticator.";
    case "session":
      return "Cronometer accepted the login, but a session handshake failed. The integration may need an update.";
  }
}

export function authorizationSecurityHeaders(redirectUri?: string): Headers {
  const formActions = ["'self'"];
  if (redirectUri) {
    const redirect = new URL(redirectUri);
    if (redirect.protocol === "https:" || redirect.protocol === "http:") {
      formActions.push(redirect.origin);
    }
  }

  return new Headers({
    "Cache-Control": "no-store",
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action ${formActions.join(" ")}; frame-ancestors 'none'; base-uri 'none'`,
    "Content-Type": "text/html; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow",
  });
}

function csrfCookie(value: string, maxAge: number): string {
  return `${CSRF_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function readCookie(request: Request, name: string): string | undefined {
  for (const cookie of (request.headers.get("Cookie") ?? "").split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === name) return cookie.slice(separator + 1).trim();
  }
  return undefined;
}

function stringField(form: FormData, name: string, maxLength: number): string | undefined {
  const value = form.get(name);
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) return undefined;
  return value;
}

export function isAllowedAuthorizationOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  // OAuth clients may open the authorization page in an opaque-origin browser
  // context, which serializes Origin as "null". The form remains protected by
  // a one-time KV flow plus a double-submit CSRF token bound to a secure cookie.
  return origin === null || origin === "null" || origin === new URL(request.url).origin;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
