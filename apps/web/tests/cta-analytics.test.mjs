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
      "../cta-analytics": { trackCta: (...args) => calls.push(args) },
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
  assert.deepEqual(calls, [["connect_cronometer", "header"]]);
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
        "../cta-analytics": { trackCta: (...args) => calls.push(args) },
      },
    ).default;
    const tree = EndpointCopy({ url: "https://example.test/mcp", placement });
    const handlers = elements(tree).filter((node) => node.props?.onClick);
    assert.equal(handlers.length, 1);
    const button = handlers[0];
    assert.equal(button.type, "button");
    assert.ok(elements(button).some((node) => node.props?.children === "https://example.test/mcp"));
    await button.props.onClick();
    assert.deepEqual(calls, [["copy_endpoint", placement]]);
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
      "../cta-analytics": { trackCta: (...args) => calls.push(args) },
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
    assert.deepEqual(calls[index], ["copy_setup", "setup", "chatgpt"]);
  }
});
