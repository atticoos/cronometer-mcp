export type CtaName =
  | "connect_cronometer"
  | "see_use_cases"
  | "view_github"
  | "explore_tool_manifest"
  | "copy_endpoint"
  | "copy_setup";
export type CtaPlacement =
  | "header"
  | "hero"
  | "capabilities"
  | "bottom"
  | "footer"
  | "setup"
  | "setup_overview";

type Payload = Record<string, unknown>;

declare global {
  interface Window {
    umami?: { track: (payload: (defaults: Payload) => Payload) => Promise<unknown> | undefined };
  }
}

// Activation only: never infer a successful connection or clipboard write.
// No automatic data attributes: a single click handler covers mouse, touch and keyboard.
export function trackCta(cta: CtaName, placement: CtaPlacement, client?: string) {
  try {
    const pending = window.umami?.track((defaults) => ({
      website: defaults.website,
      hostname: defaults.hostname,
      url: window.location.pathname,
      name: "cta_activated",
      data: { cta, placement, ...(client ? { client } : {}) },
    }));
    // Analytics must never delay navigation or break the interaction.
    void Promise.resolve(pending).catch(() => {});
  } catch {
    // The existing tracker can be absent, blocked or unavailable.
  }
}
