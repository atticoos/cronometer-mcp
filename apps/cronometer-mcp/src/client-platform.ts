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
