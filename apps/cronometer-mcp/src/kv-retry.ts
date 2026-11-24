const READ_METHODS = new Set<PropertyKey>(["get", "getWithMetadata"]);
const RETRY_DELAY_MS = 50;

// Workers KV reads occasionally throw a transient error. The OAuth provider
// looks up the access token in KV on every /mcp request without catching, so
// one failed read surfaces as an unhandled 500. Reads are safe to repeat, so
// each gets one retry. Writes and deletes pass through untouched.
export function retryKvReads(kv: KVNamespace, delayMs = RETRY_DELAY_MS): KVNamespace {
  return new Proxy(kv, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (!READ_METHODS.has(prop) || typeof value !== "function") {
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async (...args: unknown[]) => {
        try {
          return await Reflect.apply(value, target, args);
        } catch {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return Reflect.apply(value, target, args);
        }
      };
    },
  });
}
