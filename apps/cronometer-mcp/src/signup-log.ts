import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { ClientPlatform } from "./client-platform";
import type { Logger } from "./logger";

/** KV prefix for the "this account has connected before" marker. */
export const SIGNUP_PREFIX = "signup:";
/** The marker is refreshed on every sign-in and expires a year after the last one. */
export const SIGNUP_TTL_SECONDS = 365 * 24 * 60 * 60;

/**
 * Whether a completed sign-in is the account's first. `unknown` means the
 * lookup failed; sign-in is never blocked on it.
 */
export type SignupStatus = "new" | "returning" | "unknown";

export interface AuthorizationRecord {
  status: SignupStatus;
  /** Assistant platform, read from the OAuth client's registered name. */
  platform: ClientPlatform;
  /** Pseudonymous telemetry ID (see telemetry-user.ts), when the secret is set. */
  userId?: string;
  timeMs: number;
}

interface SignupEnv {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: Pick<OAuthHelpers, "listUserGrants">;
}

/**
 * Classifies a sign-in before its grant is created. Grants alone cannot tell a
 * newcomer apart: they are revoked when Cronometer rejects a session and
 * expire after 30 idle days, so a separate marker keyed by the grant's own
 * account hash remembers prior sign-ins (see `markSignedIn`). Accounts that
 * connected before the marker existed are recognised by their live grants.
 */
export async function classifySignup(env: SignupEnv, subject: string): Promise<SignupStatus> {
  try {
    if ((await env.OAUTH_KV.get(`${SIGNUP_PREFIX}${subject}`)) !== null) return "returning";
    const { items } = await env.OAUTH_PROVIDER.listUserGrants(subject, { limit: 1 });
    return items.length > 0 ? "returning" : "new";
  } catch {
    return "unknown";
  }
}

/**
 * Records the account as signed in, refreshing the marker's expiry. Call only
 * once the grant exists, so a failed first attempt is still counted as new on
 * retry. Best effort: a missed marker only risks counting the account as new again.
 */
export async function markSignedIn(env: Pick<SignupEnv, "OAUTH_KV">, subject: string): Promise<void> {
  try {
    await env.OAUTH_KV.put(`${SIGNUP_PREFIX}${subject}`, "1", { expirationTtl: SIGNUP_TTL_SECONDS });
  } catch {
    // Ignored, see above.
  }
}

/**
 * Logs one `oauth.authorization` event per completed sign-in, beside tool-call
 * events in Loki. The "New Cronometer MCP user" Grafana alert matches
 * `event_name="oauth.authorization"` and `oauth_signup_status="new"`, so keep
 * those names stable or update the alert in step.
 */
export function logAuthorization(logger: Logger, record: AuthorizationRecord): void {
  logger.info(
    "oauth.authorization",
    {
      "oauth.signup.status": record.status,
      "mcp.client.platform": record.platform,
      "enduser.pseudo.id": record.userId,
    },
    { message: `oauth.authorization ${record.status}`, timeMs: record.timeMs },
  );
}
