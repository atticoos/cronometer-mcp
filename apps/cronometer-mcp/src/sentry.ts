import type { CloudflareOptions } from "@sentry/cloudflare";

export function sentryOptions(env: Env): CloudflareOptions {
  return {
    dsn: env.SENTRY_DSN,
    defaultIntegrations: false,
    tracesSampleRate: 0,
    tracePropagationTargets: [],
    enableOpenTelemetrySetup: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    beforeSend(event) {
      // Exception messages, request metadata, and breadcrumbs can contain
      // Cronometer credentials, session identifiers, or health data.
      return {
        type: event.type,
        event_id: event.event_id,
        timestamp: event.timestamp,
        platform: event.platform,
        environment: event.environment,
        release: event.release,
        level: event.level,
        tags: {
          "mcp.tool.name": event.tags?.["mcp.tool.name"],
          "cronometer.operation": event.tags?.["cronometer.operation"],
        },
        exception: {
          values: event.exception?.values?.map(({ mechanism, stacktrace }) => ({
            type: "Error",
            value: "Cronometer MCP operation failed",
            mechanism: mechanism && { type: mechanism.type, handled: mechanism.handled },
            stacktrace: stacktrace && {
              frames: stacktrace.frames?.map(({ filename, function: name, lineno, colno, in_app }) => ({
                filename,
                function: name,
                lineno,
                colno,
                in_app,
              })),
            },
          })),
        },
      };
    },
  };
}
