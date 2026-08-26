// Secrets set with `wrangler secret put`; not part of generated worker-configuration.d.ts.
declare global {
  interface Env {
    readonly OTEL_EXPORTER_OTLP_ENDPOINT?: string;
    // Format: "key=value,key2=value2" per the OTel environment variable spec.
    readonly OTEL_EXPORTER_OTLP_HEADERS?: string;
    readonly OTEL_SERVICE_NAME?: string;
  }
}

export {};
