/**
 * The assistant platform behind a request, from its User-Agent header. Kept to
 * a small fixed set so it is safe to group by in Tempo and Loki.
 */
export type ClientPlatform = "claude" | "chatgpt" | "cursor" | "vscode" | "other" | "unknown";

const PLATFORMS: readonly { match: RegExp; platform: ClientPlatform }[] = [
  // Claude.ai and the Claude apps send "Claude-User"; Claude Code sends "claude-code/…".
  { match: /claude/i, platform: "claude" },
  // ChatGPT sends "openai-mcp/…" for tool calls and "openai-connectors-oauth/…" for OAuth.
  { match: /openai|chatgpt|codex/i, platform: "chatgpt" },
  { match: /cursor/i, platform: "cursor" },
  { match: /vscode|visual studio code|copilot/i, platform: "vscode" },
];

export function clientPlatform(userAgent: string | null | undefined): ClientPlatform {
  const ua = userAgent?.trim();
  if (!ua) return "unknown";
  return PLATFORMS.find(({ match }) => match.test(ua))?.platform ?? "other";
}

/** Longest user agent recorded in telemetry; longer values are cut to this length. */
export const MAX_USER_AGENT_LENGTH = 200;

/**
 * The raw User-Agent as recorded on tool spans and usage logs, trimmed and
 * capped in length, or undefined when the request sent none. Unlike
 * `clientPlatform`, this keeps the exact client name and version, so callers
 * that land in "other" can still be told apart.
 */
export function clientUserAgent(userAgent: string | null | undefined): string | undefined {
  const ua = userAgent?.trim();
  if (!ua) return undefined;
  return ua.length > MAX_USER_AGENT_LENGTH ? ua.slice(0, MAX_USER_AGENT_LENGTH) : ua;
}
