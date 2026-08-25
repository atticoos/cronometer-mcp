import {
  OAuthProvider,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { z } from "zod";
import { authHandler } from "./auth";
import {
  CronometerExportError,
  exportCronometerData,
  type CronometerExportType,
} from "./cronometer";
import {
  authPropsSchema,
  registerMobileTools,
  toolError,
} from "./tools";

type RuntimeEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

const RECONNECT_MESSAGE = "Reconnect this MCP connection to Cronometer first.";

export function createServer(): McpServer {
  const server = new McpServer({ name: "Cronometer MCP", version: "0.3.0" });


  server.registerTool(
    "connection_status",
    {
      description:
        "Check whether the current MCP authorization is linked to a Cronometer account.",
      inputSchema: z.object({}),
    },
    async () => {
      const parsed = authPropsSchema.safeParse(getMcpAuthContext()?.props);
      return {
        content: [
          {
            type: "text" as const,
            text: parsed.success
              ? `Connected to Cronometer as ${parsed.data.cronometerUsername}. Mobile data tools and CSV exports are available.`
              : "The MCP authorization is not linked to Cronometer.",
          },
        ],
      };
    },
  );

  server.registerTool(
    "get_cronometer_data",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description:
        "Retrieve one read-only Cronometer CSV export for an inclusive date range of up to 31 days. " +
        "Available datasets are daily nutrition summaries, food servings, exercises, biometrics, and notes. " +
        "Each call uses one of Cronometer's limited daily exports, so request only the data and dates needed.",
      inputSchema: z.object({
        dataType: z
          .enum(["daily_nutrition", "servings", "exercises", "biometrics", "notes"])
          .describe("The Cronometer dataset to retrieve."),
        startDate: z
          .string()
          .describe("First date to include, formatted exactly as YYYY-MM-DD."),
        endDate: z
          .string()
          .describe("Last date to include, formatted exactly as YYYY-MM-DD; maximum 31 inclusive days."),
      }),
    },
    async ({ dataType, startDate, endDate }) => {
      const parsed = authPropsSchema.safeParse(getMcpAuthContext()?.props);
      if (!parsed.success) return toolError(RECONNECT_MESSAGE);

      try {
        const result = await exportCronometerData(
          parsed.data.cronometerWebSession,
          dataType as CronometerExportType,
          startDate,
          endDate,
        );
        const rows = result.rows.slice(0, 1_000);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                columns: result.columns,
                dataType,
                endDate,
                rows,
                returnedRows: rows.length,
                startDate,
                totalRows: result.rows.length,
                truncated: rows.length < result.rows.length,
              }),
            },
          ],
        };
      } catch (error) {
        if (error instanceof CronometerExportError) {
          return toolError(exportErrorMessage(error.reason));
        }
        return toolError("Cronometer data retrieval failed. Try again later.");
      }
    },
  );

  registerMobileTools(server);

  return server;
}

function exportErrorMessage(reason: CronometerExportError["reason"]): string {
  switch (reason) {
    case "date_range":
      return "Use valid YYYY-MM-DD dates with the start on or before the end and no more than 31 inclusive days.";
    case "session":
      return "The Cronometer session has expired. Reconnect this MCP connection to Cronometer.";
    case "rate_limit":
      return "Cronometer's daily export limit has been reached. Try again later.";
    case "too_large":
      return "The Cronometer export was too large. Try a shorter date range.";
    case "format":
      return "Cronometer returned an unexpected export format. The private endpoint may have changed.";
    case "upstream":
      return "Cronometer could not generate the export. Try again later.";
  }
}

const mcpHandler = {
  fetch(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Response | Promise<Response> {
    return createMcpHandler(createServer)(request, env, ctx);
  },
} satisfies ExportedHandler<RuntimeEnv>;

const provider = new OAuthProvider<RuntimeEnv>({
  apiHandler: mcpHandler,
  apiRoute: "/mcp",
  authorizeEndpoint: "/authorize",
  clientIdMetadataDocumentEnabled: true,
  clientRegistrationEndpoint: "/oauth/register",
  defaultHandler: authHandler,
  // Bound how long encrypted upstream sessions (grant props) persist at rest.
  // After this window the connection must be re-authorized via /authorize.
  refreshTokenTTL: 7 * 24 * 60 * 60,
  scopesSupported: ["cronometer:read"],
  tokenEndpoint: "/oauth/token",
});

export default {
  fetch: (request, env, ctx) => provider.fetch(request, env, ctx),
  async scheduled(_controller, env) {
    const result = await provider.purgeExpiredData(env, { batchSize: 100 });
    console.log(
      `[oauth-kv-purge] grants checked/purged: ${result.grantsChecked}/${result.grantsPurged}, ` +
        `tokens checked/purged: ${result.tokensChecked}/${result.tokensPurged}, done: ${result.done}`,
    );
  },
} satisfies ExportedHandler<RuntimeEnv>;
