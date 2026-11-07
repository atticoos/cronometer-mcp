import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, window, overrides = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, window, require: (id) => overrides[id] ?? require(id) });
  return exports;
}

test("one activation sends only approved fields, excluding query tokens and identity", () => {
  const events = [];
  const window = {
    location: { pathname: "/", search: "?token=secret", hash: "#secret" },
    umami: {
      track: (callback) =>
        events.push(
          callback({
            website: "configured-site",
            hostname: "cronometer-mcp.dev",
            url: "/?token=secret",
            referrer: "https://example.com/?secret=value",
            id: "account",
          }),
        ),
    },
  };
  load("../app/cta-analytics.ts", window).trackCta("connect_cronometer", "hero");
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [
    {
      website: "configured-site",
      hostname: "cronometer-mcp.dev",
      url: "/",
      name: "cta_activated",
      data: { cta: "connect_cronometer", placement: "hero" },
    },
  ]);
});

test("missing, throwing and rejecting analytics do not break activation", async () => {
  for (const umami of [
    undefined,
    {
      track() {
        throw Error("blocked");
      },
    },
    {
      track() {
        return Promise.reject(Error("offline"));
      },
    },
  ]) {
    assert.doesNotThrow(() =>
      load("../app/cta-analytics.ts", { umami }).trackCta("copy_endpoint", "hero"),
    );
  }
  await new Promise((resolve) => setImmediate(resolve));
});

test("link preserves native attributes and tracks once via click without cancelling navigation", () => {
  const calls = [];
  const CtaLink = load(
    "../app/components/cta-link.tsx",
    {},
    {
      "../cta-analytics": { trackCta: (...args) => calls.push(JSON.parse(JSON.stringify(args))) },
    },
  ).default;
  const anchor = CtaLink({
    cta: "connect_cronometer",
    placement: "header",
    href: "#setup",
    children: "Connect Cronometer",
  });
  assert.equal(anchor.type, "a");
  assert.equal(anchor.props.href, "#setup");
  assert.equal(anchor.props.onKeyDown, undefined);
  assert.equal(anchor.props.onTouchEnd, undefined);
  assert.equal(anchor.props["data-umami-event"], undefined);
  anchor.props.onClick({ defaultPrevented: false });
  assert.deepEqual(calls, [["connect_cronometer", "header", {}]]);
  anchor.props.onClick({ defaultPrevented: true });
  assert.equal(calls.length, 1);
});

function elements(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(elements)];
}
const hookMocks = {
  ...require("react"),
  useState: (value) => [value, () => {}],
  useRef: (value) => ({ current: value }),
  useEffect: () => {},
};

test("endpoint URL text and icon share one native copy activation for each placement", async () => {
  for (const placement of ["hero", "setup_overview"]) {
    const calls = [];
    const EndpointCopy = load(
      "../app/components/endpoint-copy.tsx",
      {},
      {
        react: hookMocks,
        "./icons": { CheckIcon: "i", CopyIcon: "i" },
        "../cta-analytics": { trackCta: (...args) => calls.push(JSON.parse(JSON.stringify(args))) },
      },
    ).default;
    const tree = EndpointCopy({ url: "https://example.test/mcp", placement });
    const handlers = elements(tree).filter((node) => node.props?.onClick);
    assert.equal(handlers.length, 1);
    const button = handlers[0];
    assert.equal(button.type, "button");
    assert.ok(elements(button).some((node) => node.props?.children === "https://example.test/mcp"));
    await button.props.onClick();
    assert.deepEqual(calls, [["copy_endpoint", placement, {}]]);
  }
});

test("setup URL surface and copy button are siblings without a bubbling tracking handler", () => {
  const calls = [];
  const SetupTabs = load(
    "../app/components/setup-tabs.tsx",
    {},
    {
      react: hookMocks,
      "./icons": {},
      "./cta-link": (props) => ({ type: "CtaLink", props }),
      "../cta-analytics": { trackCta: (...args) => calls.push(JSON.parse(JSON.stringify(args))) },
      "../site": {
        setupPaths: { chatgpt: "/setup/chatgpt", claude: "/setup/claude" },
        setupClientNames: { chatgpt: "ChatGPT", claude: "Claude" },
      },
    },
  ).default;
  const tree = SetupTabs({ endpoint: "https://example.test/mcp" });
  const snippet = elements(tree).find((node) => node.type?.name === "SnippetBlock");
  const rendered = snippet.type(snippet.props);
  const nodes = elements(rendered);
  const buttons = nodes.filter((node) => node.type === "button");
  assert.equal(buttons.length, 2);
  assert.equal(nodes.filter((node) => node.props?.onClick).length, 2);
  assert.ok(!elements(buttons[0]).includes(buttons[1]));
  for (const [index, button] of buttons.entries()) {
    button.props.onClick();
    assert.equal(calls.length, index + 1);
    assert.deepEqual(calls[index], ["copy_setup", "setup", { client: "chatgpt" }]);
  }
});

test("client and demo details are sent only when present", () => {
  const events = [];
  const window = {
    location: { pathname: "/setup/claude" },
    umami: { track: (callback) => events.push(callback({ website: "w", hostname: "h" })) },
  };
  const { trackCta } = load("../app/cta-analytics.ts", window);
  trackCta("open_client", "setup", { client: "claude" });
  trackCta("select_demo", "hero", { demo: "week" });
  trackCta("copy_endpoint", "hero", { client: undefined });
  assert.deepEqual(JSON.parse(JSON.stringify(events.map((event) => event.data))), [
    { cta: "open_client", placement: "setup", client: "claude" },
    { cta: "select_demo", placement: "hero", demo: "week" },
    { cta: "copy_endpoint", placement: "hero" },
  ]);
});

function setupTabsTree(calls) {
  const SetupTabs = load(
    "../app/components/setup-tabs.tsx",
    {},
    {
      react: hookMocks,
      "./icons": {},
      "./cta-link": (props) => ({ type: "CtaLink", props }),
      "../cta-analytics": { trackCta: (...args) => calls.push(JSON.parse(JSON.stringify(args))) },
      "../site": {
        setupPaths: { chatgpt: "/setup/chatgpt", claude: "/setup/claude" },
        setupClientNames: { chatgpt: "ChatGPT", claude: "Claude" },
      },
    },
  ).default;
  return elements(SetupTabs({ endpoint: "https://example.test/mcp" }));
}

test("selecting a different setup client tracks it; reselecting the active tab does not", () => {
  const calls = [];
  const tabs = setupTabsTree(calls).filter((node) => node.props?.role === "tab");
  assert.equal(tabs.length, 7);
  tabs[0].props.onClick();
  assert.deepEqual(calls, []);
  tabs[5].props.onClick();
  assert.deepEqual(calls, [["select_setup_client", "setup", { client: "cursor" }]]);
});

test("full setup guide links are tracked per client", () => {
  const links = setupTabsTree([]).filter((node) => node.props?.cta === "open_setup_guide");
  assert.deepEqual(
    links.map((link) => [link.props.placement, link.props.client, link.props.href]),
    [
      ["setup", "chatgpt", "/setup/chatgpt"],
      ["setup", "claude", "/setup/claude"],
    ],
  );
});

test("demo tab switches and replays are tracked with the demo ID", () => {
  const calls = [];
  const demos = load(
    "../app/components/demo-tabs.tsx",
    {},
    {
      react: hookMocks,
      "./icons": { CheckIcon: "i", RefreshIcon: "i" },
      "../cta-analytics": { trackCta: (...args) => calls.push(JSON.parse(JSON.stringify(args))) },
    },
  );
  const tabs = elements(demos.default()).filter((node) => node.props?.role === "tab");
  tabs[0].props.onClick();
  assert.deepEqual(calls, []);
  tabs[3].props.onClick();
  assert.deepEqual(calls, [["select_demo", "hero", { demo: "week" }]]);
  const replay = elements(demos.MacroPlanDemo()).find((node) => node.type === "button");
  replay.props.onClick();
  assert.deepEqual(calls.at(-1), ["replay_demo", "use_cases", { demo: "macros" }]);
});
