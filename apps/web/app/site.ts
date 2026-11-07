export const siteName = "Cronometer MCP";
export const productionUrl = new URL("https://cronometer-mcp.dev/");
export const mcpEndpoint = "https://mcp.cronometer-mcp.dev/mcp";
export const githubUrl = "https://github.com/atticoos/cronometer-mcp";
export const privacyPath = "/privacy";

export const setupPaths = {
  chatgpt: "/setup/chatgpt",
  claude: "/setup/claude",
} as const;

export const setupClientNames = { chatgpt: "ChatGPT", claude: "Claude" } as const;
