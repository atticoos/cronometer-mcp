import {
  authenticateCronometerSessions,
  CronometerAuthenticationError,
  registerCronometerTools,
} from "@cronometer-mcp/core";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

export const SERVER_NAME = "cronometer-mcp";
export const SERVER_VERSION = "0.1.0";

export interface CronometerCredentials {
  password: string;
  userCode: string;
  username: string;
}

export interface CronometerContext {
  cronometerMobileSession: {
    sessionKey: string;
    timezone?: string;
    userId: number;
  };
  cronometerUsername: string;
  cronometerWebSession: {
    cookies: string;
    userId: string;
  };
}

type Environment = Record<string, string | undefined>;

export function readCredentials(environment: Environment = process.env): CronometerCredentials {
  const username = environment.CRONOMETER_USERNAME?.trim();
  const password = environment.CRONOMETER_PASSWORD;
  const missing = [
    !username && "CRONOMETER_USERNAME",
    !password && "CRONOMETER_PASSWORD",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
    );
  }

  return {
    password: password as string,
    userCode: environment.CRONOMETER_USER_CODE?.trim() ?? "",
    username: username as string,
  };
}

export function authenticateWithCronometer(
  credentials: CronometerCredentials,
): Promise<CronometerContext> {
  return authenticateCronometerSessions(
    credentials.username,
    credentials.password,
    credentials.userCode,
  );
}

export function createServer(context: CronometerContext): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const restartMessage =
    "The Cronometer session has expired. Restart this local MCP server to authenticate again.";

  registerCronometerTools(server, {
    expiredSessionMessage: restartMessage,
    getContext: () => context,
    missingContextMessage: restartMessage,
  });

  return server;
}

export async function startStdioServer(
  environment: Environment = process.env,
): Promise<McpServer> {
  const credentials = readCredentials(environment);
  process.stderr.write(`${SERVER_NAME}: authenticating with Cronometer\n`);

  let context: CronometerContext;
  try {
    context = await authenticateWithCronometer(credentials);
  } catch (error) {
    throw new Error(authenticationErrorMessage(error), { cause: error });
  }

  const server = createServer(context);
  await server.connect(new StdioServerTransport());
  process.stderr.write(`${SERVER_NAME} v${SERVER_VERSION}: connected on stdio\n`);
  return server;
}

function authenticationErrorMessage(error: unknown): string {
  if (!(error instanceof CronometerAuthenticationError)) {
    return "Could not authenticate with Cronometer. Check your network connection and try again.";
  }
  switch (error.reason) {
    case "credentials":
      return "Cronometer did not accept CRONOMETER_USERNAME or CRONOMETER_PASSWORD.";
    case "second_factor":
      return "Cronometer requires a current one-time code in CRONOMETER_USER_CODE.";
    case "session":
      return "Cronometer accepted the login, but the session handshake failed. The integration may need an update.";
  }
}
