import type { ComponentType, ReactNode } from "react";
import {
  AppleIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CalendarRangeIcon,
  CheckIcon,
  DatabaseIcon,
  DumbbellIcon,
  GaugeIcon,
  HeartPulseIcon,
  LeafIcon,
  LockIcon,
  RefreshIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StickyNoteIcon,
  UtensilsIcon,
} from "./components/icons";

type Icon = ComponentType<{ className?: string }>;

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Datasets", href: "#datasets" },
  { label: "Tools", href: "#tools" },
  { label: "Setup", href: "#setup" },
  { label: "Security", href: "#security" },
];

const FEATURES: { icon: Icon; title: string; body: string }[] = [
  {
    icon: ShieldCheckIcon,
    title: "OAuth 2.1 out of the box",
    body: "Discovery document, dynamic client registration, PKCE, token exchange, refresh, revocation, and bearer validation — all handled by the Worker.",
  },
  {
    icon: LockIcon,
    title: "Credentials used once",
    body: "Your Cronometer password and one-time code are exchanged for a session during authorization and immediately discarded. Never stored, never embedded in an MCP token.",
  },
  {
    icon: BookOpenIcon,
    title: "Strictly read-only",
    body: "Two tools, both reads. No writes, no deletes, no side effects on your Cronometer account.",
  },
  {
    icon: DatabaseIcon,
    title: "Five datasets, one schema",
    body: "Daily nutrition summaries, food servings, exercises, biometrics, and notes come back as structured columns and rows that preserve the source CSV order.",
  },
  {
    icon: CalendarRangeIcon,
    title: "Bounded by design",
    body: "Inclusive date windows up to 31 days per request, responses capped at 1,000 rows, and an explicit truncated flag whenever data is cut short.",
  },
  {
    icon: RefreshIcon,
    title: "Graceful degradation",
    body: "An expired upstream session returns a clear reconnect instruction instead of a cryptic error, so your assistant knows exactly what to do next.",
  },
];

const DATASETS: { icon: Icon; name: string; description: string }[] = [
  {
    icon: AppleIcon,
    name: "daily_nutrition",
    description: "Full macro and micronutrient breakdown for each day",
  },
  {
    icon: UtensilsIcon,
    name: "servings",
    description: "Logged foods, recipes, and portions",
  },
  {
    icon: DumbbellIcon,
    name: "exercises",
    description: "Workouts and energy expenditure",
  },
  {
    icon: HeartPulseIcon,
    name: "biometrics",
    description: "Weight, body fat, and custom measurements",
  },
  {
    icon: StickyNoteIcon,
    name: "notes",
    description: "Journal entries and daily annotations",
  },
];

const SECURITY_POINTS = [
  "Password and one-time codes are exchanged once at authorization, never persisted",
  "Cronometer sessions are sealed inside encrypted OAuth grant properties",
  "Cookies and export nonces are never returned in tool responses or written to logs",
  "The tool surface is read-only — no mutation is possible",
  "Expired sessions produce reconnect instructions instead of raw failures",
];

const LIMITS = [
  { value: "~10 / day", label: "upstream export cap" },
  { value: "≤ 31 days", label: "window per request" },
  { value: "1,000", label: "rows per response" },
];

const ENDPOINT = "https://cronometer-mcp.<your-subdomain>.workers.dev/mcp";

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="font-mono text-xs font-medium tracking-[0.2em] text-emerald-400 uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h2>
      {children ? (
        <p className="mt-4 text-base leading-relaxed text-zinc-400">{children}</p>
      ) : null}
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#060a08]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
            <LeafIcon className="size-[18px]" />
          </span>
          <span className="font-mono text-sm font-semibold text-white">
            cronometer<span className="text-emerald-400">-mcp</span>
          </span>
        </a>
        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <a
          href="#setup"
          className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
        >
          Get started
        </a>
      </div>
    </header>
  );
}

function TerminalCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/50 shadow-2xl shadow-emerald-950/50 ring-1 ring-white/5 backdrop-blur">
      <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
        <span className="size-3 rounded-full bg-red-500/70" />
        <span className="size-3 rounded-full bg-yellow-500/70" />
        <span className="size-3 rounded-full bg-green-500/70" />
        <span className="ml-3 font-mono text-xs text-zinc-500">chatgpt · connector</span>
      </div>
      <div className="space-y-4 p-5 font-mono text-[13px] leading-relaxed">
        <div>
          <p className="text-zinc-500">$ connect</p>
          <p className="mt-1 break-all text-zinc-300">{ENDPOINT}</p>
        </div>
        <div className="space-y-1">
          <p className="text-emerald-400">✓ OAuth 2.1 · PKCE · dynamic client registration</p>
          <p className="text-emerald-400">✓ authorized — read-only grant</p>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/5">
          <p className="text-sky-300">you ›</p>
          <p className="mt-0.5 text-zinc-300">
            What was my average protein intake over the last 7 days?
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/5">
          <p className="text-fuchsia-300">tool › get_cronometer_data</p>
          <p className="mt-0.5 break-all text-zinc-500">
            {'{ "type": "daily_nutrition", "start_date": "2026-08-15", "end_date": "2026-08-21" }'}
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/5">
          <p className="text-emerald-300">assistant ›</p>
          <p className="mt-0.5 text-zinc-300">
            You averaged 128 g of protein per day, peaking Thursday at 156 g.
          </p>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.15),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
      <div className="relative mx-auto grid max-w-6xl gap-14 px-6 pt-20 pb-24 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-28 lg:pb-32">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-xs font-medium text-emerald-300">
            <SparklesIcon className="size-3.5" />
            Unofficial · read-only · Model Context Protocol
          </div>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Ask your AI{" "}
            <span className="bg-gradient-to-r from-emerald-300 to-teal-400 bg-clip-text text-transparent">
              what you ate.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
            Cronometer MCP is a Cloudflare Worker that speaks the Model Context Protocol, so
            ChatGPT, Claude, and any MCP client can query your Cronometer nutrition data —
            securely, read-only, under your own account.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="#setup"
              className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
            >
              Connect your client
              <ArrowRightIcon className="size-4" />
            </a>
            <a
              href="#tools"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-6 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-white/25 hover:text-white"
            >
              See the tools
            </a>
          </div>
          <p className="mt-6 break-all font-mono text-xs text-zinc-500">
            GET <span className="text-zinc-400">{ENDPOINT}</span>
          </p>
        </div>
        <TerminalCard />
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="border-t border-white/5 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading eyebrow="Features" title="Built like infrastructure">
          One Worker stands between your assistant and Cronometer&apos;s web app — handling auth,
          sessions, rate limits, and CSV parsing so tools stay simple.
        </SectionHeading>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/[0.04]"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                <feature.icon className="size-5" />
              </span>
              <h3 className="mt-5 text-base font-semibold text-white">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{feature.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Datasets() {
  return (
    <section id="datasets" className="border-t border-white/5 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading eyebrow="Datasets" title="Everything your exports can answer">
          Each request maps to one of Cronometer&apos;s CSV export types, parsed into columns and
          rows your assistant can reason over.
        </SectionHeading>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {DATASETS.map((dataset) => (
            <div
              key={dataset.name}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center transition-colors hover:border-emerald-500/30"
            >
              <dataset.icon className="mx-auto size-6 text-emerald-400" />
              <p className="mt-4 font-mono text-sm font-semibold text-white">{dataset.name}</p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">{dataset.description}</p>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-12 grid max-w-3xl grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 bg-white/[0.02]">
          {LIMITS.map((limit) => (
            <div key={limit.label} className="px-4 py-6 text-center">
              <p className="font-mono text-xl font-semibold text-white sm:text-2xl">
                {limit.value}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{limit.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Tools() {
  return (
    <section id="tools" className="border-t border-white/5 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading eyebrow="Tools" title="A deliberately small surface">
          Two authenticated, read-only tools. That&apos;s it — every response is data, never side
          effects.
        </SectionHeading>
        <div className="mx-auto mt-14 max-w-4xl space-y-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <p className="font-mono text-base font-semibold text-emerald-300">
              connection_status()
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Verifies that your MCP grant still holds a live Cronometer session — useful before
              spending one of the day&apos;s exports.
            </p>
            <pre className="mt-5 overflow-x-auto rounded-xl bg-black/40 p-4 font-mono text-xs leading-relaxed text-zinc-400 ring-1 ring-white/5">
              {`{ "connected": true, "user_id": "123456" }`}
            </pre>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <p className="font-mono text-base font-semibold text-emerald-300">
              get_cronometer_data({"{"} type, start_date, end_date {"}"})
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Retrieves one dataset over an inclusive date range of up to 31 days. Responses
              preserve the CSV&apos;s column order and values.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {DATASETS.map((dataset) => (
                <span
                  key={dataset.name}
                  className="rounded-full border border-white/10 bg-black/30 px-3 py-1 font-mono text-xs text-zinc-300"
                >
                  {dataset.name}
                </span>
              ))}
            </div>
            <pre className="mt-5 overflow-x-auto rounded-xl bg-black/40 p-4 font-mono text-xs leading-relaxed text-zinc-400 ring-1 ring-white/5">
              {`{ "columns": ["Date", "Energy (kcal)", ...],\n  "rows": [["2026-08-21", "2140", ...]],\n  "truncated": false }`}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

const STEPS: { number: string; title: string; body: ReactNode }[] = [
  {
    number: "01",
    title: "Add the connector",
    body: (
      <>
        Point any OAuth-capable MCP client — ChatGPT connectors, Claude, Cursor, VS Code — at the
        Worker&apos;s <span className="font-mono text-emerald-300">/mcp</span> endpoint:
        <br />
        <span className="break-all font-mono text-xs text-zinc-400">{ENDPOINT}</span>
      </>
    ),
  },
  {
    number: "02",
    title: "Sign in once",
    body: (
      <>
        The first connection opens{" "}
        <span className="font-mono text-emerald-300">/authorize</span>, where you enter your
        Cronometer username, password, and one-time code if you use two-factor authentication. The
        Worker exchanges them for a session immediately.
      </>
    ),
  },
  {
    number: "03",
    title: "Start asking",
    body: (
      <>
        Ask your assistant anything your exports can answer. Every query becomes one bounded CSV
        fetch under the hood — so ask for exactly the dataset and dates you need.
      </>
    ),
  },
];

function Setup() {
  return (
    <section id="setup" className="border-t border-white/5 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading eyebrow="Setup" title="Connected in three steps">
          No API keys to manage. Your assistant discovers the server, registers itself, and
          completes authorization in the browser.
        </SectionHeading>
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.number} className="relative">
              <p className="font-mono text-4xl font-bold text-emerald-500/25">{step.number}</p>
              <h3 className="mt-3 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Security() {
  return (
    <section id="security" className="border-t border-white/5 py-24">
      <div className="mx-auto grid max-w-6xl gap-14 px-6 lg:grid-cols-2 lg:items-start">
        <div className="lg:sticky lg:top-28">
          <SectionHeading eyebrow="Security & privacy" title="Your credentials never linger">
            <span className="inline-flex items-center gap-2 align-middle">
              <GaugeIcon className="size-5 text-emerald-400" />
            </span>{" "}
            The Worker sits at two trust boundaries and keeps both clean: it is an OAuth 2.1
            authorization server for your clients, and a one-shot credential exchanger with
            Cronometer.
          </SectionHeading>
        </div>
        <ul className="space-y-4">
          {SECURITY_POINTS.map((point) => (
            <li
              key={point}
              className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"
            >
              <CheckIcon className="mt-0.5 size-5 shrink-0 text-emerald-400" />
              <span className="text-sm leading-relaxed text-zinc-300">{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="relative overflow-hidden border-t border-white/5 py-24">
      <div className="pointer-events-none absolute inset-x-0 -bottom-48 h-[420px] bg-[radial-gradient(ellipse_at_bottom,rgba(16,185,129,0.12),transparent_60%)]" />
      <div className="relative mx-auto max-w-2xl px-6 text-center">
        <ShieldCheckIcon className="mx-auto size-10 text-emerald-400" />
        <h2 className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Ready to wire up your assistant?
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-400">
          Deploy the Worker, add the connector URL, sign in once — and start asking questions about
          your nutrition in plain language.
        </p>
        <a
          href="#setup"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
        >
          Connect your client
          <ArrowRightIcon className="size-4" />
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-10">
      <div className="mx-auto max-w-6xl space-y-4 px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <LeafIcon className="size-4 text-emerald-400" />
            <span className="font-mono text-sm text-zinc-400">
              cronometer<span className="text-emerald-400">-mcp</span>
            </span>
          </div>
          <p className="font-mono text-xs text-zinc-600">Built on Cloudflare Workers</p>
        </div>
        <p className="max-w-3xl text-xs leading-relaxed text-zinc-600">
          Unofficial integration — not affiliated with or endorsed by Cronometer.com. The login
          wire format is independently implemented against Cronometer&apos;s private web endpoints,
          which may change without notice. Read-only access is granted only by you, per client, via
          OAuth.
        </p>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="min-h-screen font-sans">
      <Nav />
      <main>
        <Hero />
        <Features />
        <Datasets />
        <Tools />
        <Setup />
        <Security />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
