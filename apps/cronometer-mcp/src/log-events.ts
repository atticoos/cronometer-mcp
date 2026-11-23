import type { ToolErrorKind } from "@cronometer-mcp/core";
import type { ClientPlatform } from "./client-platform";
import type { ToolOutcome } from "./observability";
import type { SignupStatus } from "./signup-log";

/**
 * Every structured log event the Worker emits, keyed by event name, with the
 * attributes each one carries. This is the whole log schema: a new event or
 * field must be added here first, which keeps dashboards predictable and gives
 * one place to review what leaves the service against the privacy policy
 * (apps/web/app/privacy/page.tsx).
 *
 * Grafana Cloud stores each event in Loki under `service_name="cronometer-mcp"`
 * with `event_name` and every attribute as structured metadata, dots replaced by
 * underscores (`mcp.tool.name` becomes `mcp_tool_name`).
 *
 * Rules for attributes:
 * - Use OpenTelemetry semantic-convention names where one exists
 *   (`enduser.pseudo.id`, `user_agent.original`), otherwise `<area>.<noun>`.
 * - Values are bounded: enums, counts, durations, names. Never usernames,
 *   emails, Cronometer user IDs, tokens, argument values, food or health data,
 *   or error messages (they can echo any of these).
 * - Identify a user only with `enduser.pseudo.id` (see telemetry-user.ts).
 */
export interface LogEvents {
  /** One finished MCP tool call. WARN when it failed. */
  "mcp.tool.call": {
    "mcp.tool.name": string;
    "mcp.tool.outcome": ToolOutcome;
    /** Whole milliseconds. */
    "mcp.tool.duration_ms": number;
    "mcp.tool.error_kind"?: ToolErrorKind;
    /** Sorted, comma-separated argument names. Never values. */
    "mcp.tool.arg_keys"?: string;
    "enduser.pseudo.id"?: string;
    "mcp.client.platform"?: string;
    "user_agent.original"?: string;
  };
  /** One completed OAuth sign-in. Drives the "New Cronometer MCP user" Grafana alert. */
  "oauth.authorization": {
    "oauth.signup.status": SignupStatus;
    "mcp.client.platform": ClientPlatform;
    "enduser.pseudo.id"?: string;
  };
}

export type LogEventName = keyof LogEvents;
