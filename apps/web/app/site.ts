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

// Cronometer's first-party ChatGPT plugin, announced at cronometer.com/blog/cronometer-chatgpt-plugin/.
export const officialPluginUrl = "https://chatgpt.com/plugins/plugin_asdk_app_6ae279585f808191affab8de1adde624";
// localStorage key that remembers a dismissed announcement banner. Change it to show a new announcement.
export const officialPluginBannerKey = "cronometer-mcp:official-plugin-banner-dismissed";
