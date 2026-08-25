import { createInterface } from "node:readline";

export const SERVER_NAME = "cronometer-mcp";

export const SERVER_VERSION = "0.0.1";

const PROTOCOL_VERSION = "2025-06-18";

const STATUS_MESSAGE =
  "cronometer-mcp is a placeholder release. Cronometer data tools are under active development.";

type JsonRpcId = string | number | null;

interface JsonRpcMessage {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

interface JsonRpcError {
  code: number;
  message: string;
}

const TOOLS = [
  {
    name: "server_status",
    description:
      "Report the status of the cronometer-mcp local server. Placeholder until Cronometer tools ship.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
] as const;

function isNotification(message: JsonRpcMessage): boolean {
  return message.id === undefined || message.id === null;
}

function write(output: NodeJS.WritableStream, payload: unknown): void {
  output.write(`${JSON.stringify(payload)}\n`);
}

function sendResult(
  output: NodeJS.WritableStream,
  id: JsonRpcId,
  result: unknown,
): void {
  write(output, { jsonrpc: "2.0", id, result });
}

function sendError(
  output: NodeJS.WritableStream,
  id: JsonRpcId,
  error: JsonRpcError,
): void {
  write(output, { jsonrpc: "2.0", id, error });
}

function handleMethod(
  output: NodeJS.WritableStream,
  id: JsonRpcId,
  method: string,
  params: unknown,
): boolean {
  switch (method) {
    case "initialize": {
      const requested = (params as { protocolVersion?: unknown } | undefined)
        ?.protocolVersion;
      sendResult(output, id, {
        protocolVersion:
          typeof requested === "string" ? requested : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
      return true;
    }
    case "ping":
      sendResult(output, id, {});
      return true;
    case "tools/list":
      sendResult(output, id, { tools: TOOLS });
      return true;
    case "tools/call": {
      const name = (params as { name?: unknown } | undefined)?.name;
      if (name !== "server_status") {
        sendError(output, id, {
          code: -32602,
          message: `Unknown tool: ${String(name)}`,
        });
        return true;
      }
      sendResult(output, id, {
        content: [{ type: "text", text: STATUS_MESSAGE }],
      });
      return true;
    }
    default:
      return false;
  }
}

export function handleMessage(line: string, output: NodeJS.WritableStream): void {
  if (!line.trim()) {
    return;
  }
  let message: JsonRpcMessage;
  try {
    message = JSON.parse(line) as JsonRpcMessage;
  } catch {
    sendError(output, null, {
      code: -32700,
      message: "Parse error",
    });
    return;
  }
  if (typeof message.method !== "string") {
    if (!isNotification(message)) {
      sendError(output, (message.id as JsonRpcId) ?? null, {
        code: -32600,
        message: "Invalid Request",
      });
    }
    return;
  }
  if (isNotification(message)) {
    return;
  }
  if (!handleMethod(output, message.id as JsonRpcId, message.method, message.params)) {
    sendError(output, message.id as JsonRpcId, {
      code: -32601,
      message: `Method not found: ${message.method}`,
    });
  }
}

export function startStdioServer(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): void {
  process.stderr.write(
    `${SERVER_NAME} v${SERVER_VERSION} placeholder listening on stdio\n`,
  );
  const lines = createInterface({ input });
  lines.on("line", (line) => handleMessage(line, output));
}
