"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  ArrowRightIcon,
  CheckIcon,
  ClaudeIcon,
  CodeIcon,
  CopyIcon,
  CursorIcon,
  GeminiIcon,
  OpenAIIcon,
} from "./icons";

import { trackCta } from "../cta-analytics";
import CtaLink from "./cta-link";
import { setupClientNames, setupPaths } from "../site";

type Icon = ComponentType<{ className?: string }>;

type SnippetKind = "url" | "command" | "json";

type Snippet = {
  kind: SnippetKind;
  caption: string;
  value: string;
};

type ClientKind = "Browser app" | "Desktop app" | "Terminal" | "IDE";

type ClientGuide = {
  id: string;
  name: string;
  kind: ClientKind;
  icon: Icon;
  iconClass?: string;
  summary: string;
  steps: ReactNode[];
  snippet: Snippet;
};

const COPIED_RESET_MS = 2000;

function useCopy(value: string) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }

  return { copied, copy };
}

const Mono = ({ children }: { children: ReactNode }) => (
  <span className="break-all font-mono text-[13px] text-emerald-300">{children}</span>
);

const Said = ({ children }: { children: ReactNode }) => (
  <span className="text-zinc-300">“{children}”</span>
);

function buildGuides(endpoint: string): ClientGuide[] {
  return [
    {
      id: "chatgpt",
      name: "ChatGPT",
      kind: "Browser app",
      icon: OpenAIIcon,
      summary:
        "Use ChatGPT on the web with access to custom MCP plugins.",
      steps: [
        <>
          Open <Mono>Plugins</Mono>, select the plus button, and choose{" "}
          <Mono>Add custom MCP server</Mono>.
        </>,
        <>
          Name it <Said>Cronometer</Said>, paste the endpoint URL, and select{" "}
          <Mono>OAuth</Mono>.
        </>,
        <>
          Create and install the plugin, then sign in to Cronometer when prompted.
        </>,
        <>
          Select Cronometer with <Mono>@</Mono> in a new chat and ask{" "}
          <Said>Show me today’s Cronometer food diary.</Said>
        </>,
      ],
      snippet: { kind: "url", caption: "Connector URL", value: endpoint },
    },
    {
      id: "claude",
      name: "Claude web & desktop",
      kind: "Desktop app",
      icon: ClaudeIcon,
      iconClass: "text-orange-400",
      summary: "Same flow in claude.ai and the Claude Desktop app.",
      steps: [
        <>
          Open <Mono>Customize → Connectors</Mono> in Claude on the web or desktop.
        </>,
        <>
          Select <Mono>Add</Mono> and choose the custom web connector option.
        </>,
        <>
          Name it <Said>Cronometer</Said>, paste the endpoint URL, and select{" "}
          <Mono>Sign in now</Mono>. Choose <Mono>Register automatically</Mono> if asked.
        </>,
        <>
          Sign in to Cronometer. Enable it from the chat’s <Mono>+ → Connectors</Mono>{" "}
          menu and ask <Said>Show me today’s Cronometer food diary.</Said>
        </>,
      ],
      snippet: { kind: "url", caption: "Connector URL", value: endpoint },
    },
    {
      id: "claude-code",
      name: "Claude Code",
      kind: "Terminal",
      icon: ClaudeIcon,
      iconClass: "text-orange-300",
      summary: "One command registers the server; sign-in finishes inside the REPL.",
      steps: [
        <>
          Run the add command—it registers <Mono>cronometer</Mono> as an HTTP server
          in your user scope, available in every project.
        </>,
        <>
          Start <Mono>claude</Mono> and open <Mono>/mcp</Mono>. Pick{" "}
          <Mono>cronometer</Mono> and choose <Mono>Authenticate</Mono>—the browser
          sign-in opens and hands tokens back automatically.
        </>,
        <>
          Confirm with <Said>Which Cronometer account is connected?</Said>—the answer
          comes straight from <Mono>connection_status</Mono>.
        </>,
      ],
      snippet: {
        kind: "command",
        caption: "Run in your shell",
        value: `claude mcp add --transport http cronometer ${endpoint}`,
      },
    },
    {
      id: "codex",
      name: "Codex CLI",
      kind: "Terminal",
      icon: OpenAIIcon,
      summary: "Codex keeps remote servers in ~/.codex/config.toml.",
      steps: [
        <>
          Run the add command—it writes the streamable HTTP server into your Codex
          config.
        </>,
        <>
          If the server reports unauthorized, run{" "}
          <Mono>codex mcp login cronometer</Mono>—the Cronometer sign-in opens in
          your browser and stores the token locally.
        </>,
        <>
          Start <Mono>codex</Mono> and try <Said>Show my macros remaining today</Said>{" "}
          to verify the tools respond.
        </>,
      ],
      snippet: {
        kind: "command",
        caption: "Run in your shell",
        value: `codex mcp add cronometer --url ${endpoint}`,
      },
    },
    {
      id: "gemini-cli",
      name: "Gemini CLI",
      kind: "Terminal",
      icon: GeminiIcon,
      iconClass: "text-blue-400",
      summary: "HTTP transport plus a dedicated auth command.",
      steps: [
        <>
          Run the add command—Gemini registers <Mono>cronometer</Mono> under the{" "}
          <Mono>mcpServers</Mono> block of your settings.
        </>,
        <>
          Run <Mono>gemini mcp auth cronometer</Mono>—it launches the Cronometer
          OAuth flow in your browser.
        </>,
        <>
          Start <Mono>gemini</Mono> and run <Mono>/mcp</Mono> to list servers,{" "}
          <Mono>cronometer</Mono> should show as connected.
        </>,
      ],
      snippet: {
        kind: "command",
        caption: "Run in your shell",
        value: `gemini mcp add --transport http cronometer ${endpoint}`,
      },
    },
    {
      id: "cursor",
      name: "Cursor",
      kind: "IDE",
      icon: CursorIcon,
      summary: "Remote MCP servers are first-class tools with built-in OAuth.",
      steps: [
        <>
          Open <Mono>Settings → Tools &amp; MCP</Mono> and choose{" "}
          <Mono>New MCP server</Mono>, then paste the JSON below into{" "}
          <Mono>mcp.json</Mono>.
        </>,
        <>
          Toggle <Mono>cronometer</Mono> on and click <Mono>Authenticate</Mono> when
          it appears—the OAuth window handles sign-in.
        </>,
        <>
          In agent mode, ask <Said>What can I eat with today’s remaining macros?</Said>
        </>,
      ],
      snippet: {
        kind: "json",
        caption: "Add to mcp.json",
        value: `{
  "mcpServers": {
    "cronometer": {
      "url": "${endpoint}"
    }
  }
}`,
      },
    },
    {
      id: "vscode",
      name: "VS Code",
      kind: "IDE",
      icon: CodeIcon,
      iconClass: "text-sky-400",
      summary: "MCP ships with Copilot agent mode—no extension required.",
      steps: [
        <>
          From the Command Palette run <Mono>MCP: Add Server…</Mono>, choose{" "}
          <Mono>HTTP (streamable)</Mono>, paste the endpoint URL, and name it{" "}
          <Mono>cronometer</Mono>.
        </>,
        <>
          Prefer the terminal? The CLI flag below adds the same server without
          touching the UI.
        </>,
        <>
          Approve the sign-in window the first time a Cronometer tool runs, then ask{" "}
          <Said>Summarize my week of logging</Said> in Copilot Chat.
        </>,
      ],
      snippet: {
        kind: "command",
        caption: "Run in your shell",
        value: `code --add-mcp '{"name":"cronometer","type":"http","url":"${endpoint}"}'`,
      },
    },
  ];
}

function SnippetBlock({ snippet, client }: { snippet: Snippet; client: string }) {
  const { copied, copy } = useCopy(snippet.value);

  function activateCopy() {
    trackCta("copy_setup", "setup", { client });
    void copy();
  }

  return (
    <div>
      <p className="font-mono text-[11px] font-medium tracking-[0.2em] text-zinc-500 uppercase">
        {snippet.caption}
      </p>
      <div className="relative mt-3">
        {snippet.kind === "json" ? (
          <pre className="overflow-x-auto rounded-xl bg-black/50 p-4 pr-20 font-mono text-xs leading-relaxed text-zinc-300 ring-1 ring-white/5">
            {snippet.value}
          </pre>
        ) : snippet.kind === "url" ? (
          <button
            type="button"
            onClick={activateCopy}
            aria-label={`Copy ${snippet.caption}`}
            className="block w-full rounded-xl bg-black/50 p-4 pr-20 text-left font-mono text-xs leading-relaxed break-all text-zinc-300 ring-1 ring-white/5 focus-visible:outline-emerald-500"
          >
            {snippet.value}
          </button>
        ) : (
          <p className="rounded-xl bg-black/50 p-4 pr-20 font-mono text-xs leading-relaxed break-all text-zinc-300 ring-1 ring-white/5">
            {snippet.value}
          </p>
        )}
        <button
          type="button"
          onClick={activateCopy}
          aria-label={copied ? "Copied to clipboard" : `Copy ${snippet.caption}`}
          className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/70 px-2 py-1 font-mono text-[11px] font-medium text-zinc-400 transition-colors hover:text-emerald-300 focus-visible:ring-1 focus-visible:ring-emerald-500/50 focus-visible:outline-none"
        >
          {copied ? (
            <CheckIcon className="size-3 text-emerald-400" />
          ) : (
            <CopyIcon className="size-3" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export default function SetupTabs({ endpoint }: { endpoint: string }) {
  const guides = buildGuides(endpoint);
  const [activeId, setActiveId] = useState(guides[0].id);
  const active =
    guides.find((guide) => guide.id === activeId) ?? guides[0];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Client setup guides"
        className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-white/10 bg-black/40 p-1"
      >
        {guides.map((guide) => (
          <button
            key={guide.id}
            type="button"
            role="tab"
            aria-selected={guide.id === active.id}
            onClick={() => {
              if (guide.id === active.id) return;
              trackCta("select_setup_client", "setup", { client: guide.id });
              setActiveId(guide.id);
            }}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors sm:px-4 ${
              guide.id === active.id
                ? "bg-emerald-500 text-emerald-950"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <guide.icon className="size-3.5 shrink-0" />
            {guide.name}
          </button>
        ))}
      </div>

      <div
        key={active.id}
        role="tabpanel"
        aria-label={active.name}
        className="chat-enter mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-white/5 px-5 py-4 sm:px-6">
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/10 ${
              active.iconClass ?? "text-zinc-200"
            }`}
          >
            <active.icon className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-sm font-semibold text-white">{active.name}</h3>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider text-emerald-300 uppercase">
                {active.kind}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">{active.summary}</p>
          </div>
          {/* Keep both guide destinations in the exported homepage. */}
          {(Object.keys(setupPaths) as (keyof typeof setupPaths)[]).map((client) => (
            <CtaLink
              key={client}
              cta="open_setup_guide"
              placement="setup"
              client={client}
              href={setupPaths[client]}
              className={active.id === client
                ? "inline-flex items-center gap-2 rounded-full border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:border-emerald-400/60 hover:bg-emerald-400/10 focus-visible:outline-emerald-300 sm:ml-auto"
                : "hidden"}
            >
              Full setup guide<span className="sr-only"> for {setupClientNames[client]}</span>
              <ArrowRightIcon className="size-3.5" />
            </CtaLink>
          ))}
        </div>
        <div className="grid lg:grid-cols-[1fr_minmax(300px,42%)]">
          <ol className="space-y-5 px-5 py-6 sm:px-6">
            {active.steps.map((step, index) => (
              <li
                key={index}
                className="flex gap-3.5 text-sm leading-relaxed text-zinc-400"
              >
                <span className="mt-px shrink-0 font-mono text-xs font-semibold text-emerald-500/70">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
          <div className="border-t border-white/5 bg-black/20 px-5 py-6 sm:px-6 lg:border-t-0 lg:border-l">
            <SnippetBlock snippet={active.snippet} client={active.id} />
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-zinc-600">
        Every client shares the same trust boundary: credentials are exchanged once at{" "}
        <span className="font-mono text-zinc-400">/authorize</span> and never stored.
        If a session expires upstream, reconnect through the same flow—one more
        sign-in, nothing to rotate.
      </p>
    </div>
  );
}
