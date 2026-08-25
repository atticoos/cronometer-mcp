import type { ComponentType, ReactNode } from "react";
import {
  AppleIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CalendarRangeIcon,
  CheckIcon,
  ClockIcon,
  DatabaseIcon,
  DownloadIcon,
  HeartPulseIcon,
  LeafIcon,
  LockIcon,
  PenLineIcon,
  RefreshIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TargetIcon,
  UtensilsIcon,
} from "./components/icons";

type Icon = ComponentType<{ className?: string }>;

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Capabilities", href: "#capabilities" },
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
    body: "Your Cronometer password and one-time code are exchanged for web and mobile sessions during authorization, then immediately discarded. Never stored, never embedded in an MCP token.",
  },
  {
    icon: PenLineIcon,
    title: "Reads and writes, clearly labeled",
    body: "Every tool carries MCP annotations — read-only, idempotent, or destructive — so your client can gate exactly what your assistant is allowed to do.",
  },
  {
    icon: DatabaseIcon,
    title: "Live API + bulk exports",
    body: "Sixteen tools speak to Cronometer's mobile REST API for live diary data, while get_cronometer_data pulls bulk CSV history for long-range questions.",
  },
  {
    icon: CalendarRangeIcon,
    title: "Bounded by design",
    body: "Export windows up to 31 inclusive days, responses capped at 1,000 rows, and an explicit truncated flag whenever data is cut short.",
  },
  {
    icon: RefreshIcon,
    title: "Graceful degradation",
    body: "An expired upstream session returns a clear reconnect instruction instead of a cryptic error, so your assistant knows exactly what to do next.",
  },
];

type ToolBadge = "read" | "write" | "destructive";

const BADGE_STYLES: Record<ToolBadge, string> = {
  read: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300",
  write: "border-amber-500/20 bg-amber-500/5 text-amber-300",
  destructive: "border-red-500/20 bg-red-500/5 text-red-300",
};

const CAPABILITIES: {
  icon: Icon;
  title: string;
  tools: { name: string; badge: ToolBadge }[];
  footnote?: string;
}[] = [
  {
    icon: UtensilsIcon,
    title: "Diary & food log",
    tools: [
      { name: "get_food_log", badge: "read" },
      { name: "add_food_entry", badge: "write" },
      { name: "remove_food_entry", badge: "destructive" },
      { name: "mark_day_complete", badge: "write" },
      { name: "copy_day", badge: "write" },
    ],
  },
  {
    icon: AppleIcon,
    title: "Nutrition insights",
    tools: [
      { name: "get_daily_nutrition", badge: "read" },
      { name: "get_nutrition_scores", badge: "read" },
    ],
  },
  {
    icon: SearchIcon,
    title: "Food database",
    tools: [
      { name: "search_foods", badge: "read" },
      { name: "get_food_details", badge: "read" },
    ],
  },
  {
    icon: BookOpenIcon,
    title: "Custom foods & recipes",
    tools: [
      { name: "add_custom_food", badge: "write" },
      { name: "add_recipe", badge: "write" },
    ],
  },
  {
    icon: ClockIcon,
    title: "Fasting",
    tools: [
      { name: "get_fasting_history", badge: "read" },
      { name: "get_fasting_stats", badge: "read" },
    ],
  },
  {
    icon: HeartPulseIcon,
    title: "Biometrics",
    tools: [
      { name: "list_biometrics", badge: "read" },
      { name: "get_biometrics", badge: "read" },
    ],
  },
  {
    icon: TargetIcon,
    title: "Macro targets",
    tools: [{ name: "get_macro_targets", badge: "read" }],
  },
  {
    icon: DownloadIcon,
    title: "Bulk exports",
    tools: [{ name: "get_cronometer_data", badge: "read" }],
    footnote: "daily_nutrition · servings · exercises · biometrics · notes",
  },
];

const SECURITY_POINTS = [
  "Password and one-time codes are exchanged once at authorization, never persisted",
  "Both Cronometer sessions — web and mobile — are sealed inside encrypted OAuth grant properties",
  "Cookies and export nonces are never returned in tool responses or written to logs",
  "MCP annotations mark each tool read-only, idempotent, or destructive — your client decides what to allow",
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
          <p className="text-emerald-400">✓ authorized — read & write grant</p>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/5">
          <p className="text-sky-300">you ›</p>
          <p className="mt-0.5 text-zinc-300">
            I’m lifting this evening. How should I shape the rest of today’s macros?
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/5">
          <p className="text-fuchsia-300">tool › get_daily_nutrition</p>
          <p className="mt-0.5 break-all text-zinc-500">
            {'{ "date": "today", "targets": true, "diary": true }'}
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/5">
          <p className="text-emerald-300">assistant ›</p>
          <p className="mt-0.5 text-zinc-300">
            You have 850 kcal left. Aim for 62 g protein, 90 g carbs, and 18 g fat — with more of
            those carbs around your workout.
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
            Unofficial · read & write · Model Context Protocol
          </div>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Let AI{" "}
            <span className="bg-gradient-to-r from-emerald-300 to-teal-400 bg-clip-text text-transparent">
              tailor your macros.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
            Give ChatGPT, Claude, or any MCP client live access to your Cronometer targets, intake,
            and trends — so it can help shape your macros around your goals and keep your food log
            up to date. Securely, under your own account.
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
          One Worker stands between your assistant and Cronometer — handling auth, sessions, rate
          limits, and parsing so tools stay simple.
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

function Capabilities() {
  return (
    <section id="capabilities" className="border-t border-white/5 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading eyebrow="Capabilities" title="Eighteen tools, eight jobs">
          connection_status keeps the link honest; the other seventeen read and write your account
          through Cronometer&apos;s mobile API and CSV exports. Every chip is annotated read, write,
          or destructive.
        </SectionHeading>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((capability) => (
            <div
              key={capability.title}
              className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-emerald-500/30"
            >
              <capability.icon className="size-6 text-emerald-400" />
              <h3 className="mt-4 text-sm font-semibold text-white">{capability.title}</h3>
              <div className="mt-3 flex flex-col items-start gap-1.5">
                {capability.tools.map((tool) => (
                  <span
                    key={tool.name}
                    className={`rounded-md border px-2 py-0.5 font-mono text-[11px] ${BADGE_STYLES[tool.badge]}`}
                  >
                    {tool.name}
                  </span>
                ))}
              </div>
              {capability.footnote ? (
                <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
                  {capability.footnote}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-12 text-center font-mono text-xs text-zinc-600">
          get_cronometer_data · bulk export limits
        </p>
        <div className="mx-auto mt-4 grid max-w-3xl grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 bg-white/[0.02]">
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
        <SectionHeading eyebrow="Tools" title="Flagship examples">
          A taste of the surface. Live tools return structured JSON; the bulk exporter returns
          columns and rows that preserve Cronometer&apos;s CSV order.
        </SectionHeading>
        <div className="mx-auto mt-14 max-w-4xl space-y-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-mono text-base font-semibold text-emerald-300">
                get_food_log({"{"} date? {"}"})
              </p>
              <span
                className={`rounded-md border px-2 py-0.5 font-mono text-[11px] ${BADGE_STYLES.read}`}
              >
                read
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              The full diary for a day: every entry enriched with food name, source, and serving
              size, plus an energy summary and consumed totals for every tracked nutrient.
            </p>
            <pre className="mt-5 overflow-x-auto rounded-xl bg-black/40 p-4 font-mono text-xs leading-relaxed text-zinc-400 ring-1 ring-white/5">
              {`{ "date": "2026-08-25",\n  "energy_summary": { "consumed_kcal": 1420,\n                      "remaining_kcal": 580,\n                      "total_target_kcal": 2000 },\n  "nutrition_summary": { ... }, "diary": { ... } }`}
            </pre>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-mono text-base font-semibold text-emerald-300">
                add_food_entry({"{"} foodId, measureId, grams, date?, diaryGroup? {"}"})
              </p>
              <span
                className={`rounded-md border px-2 py-0.5 font-mono text-[11px] ${BADGE_STYLES.write}`}
              >
                write
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Logs a serving to the diary. Pair it with search_foods and get_food_details to
              resolve IDs, and remove_food_entry to undo.
            </p>
            <pre className="mt-5 overflow-x-auto rounded-xl bg-black/40 p-4 font-mono text-xs leading-relaxed text-zinc-400 ring-1 ring-white/5">
              {`{ "entry": { "id": "987654", "food_id": 89231, "grams": 150 },\n  "note": "Use the returned serving ID to remove this entry." }`}
            </pre>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-mono text-base font-semibold text-emerald-300">
                get_cronometer_data({"{"} dataType, startDate, endDate {"}"})
              </p>
              <span
                className={`rounded-md border px-2 py-0.5 font-mono text-[11px] ${BADGE_STYLES.read}`}
              >
                read
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Bulk CSV history over an inclusive window of up to 31 days — daily nutrition
              summaries, servings, exercises, biometrics, or notes. Each call uses one of
              Cronometer&apos;s limited daily exports.
            </p>
            <pre className="mt-5 overflow-x-auto rounded-xl bg-black/40 p-4 font-mono text-xs leading-relaxed text-zinc-400 ring-1 ring-white/5">
              {`{ "columns": ["Date", "Energy (kcal)", ...],\n  "rows": [["2026-07-01", "2140", ...]],\n  "totalRows": 31, "truncated": false }`}
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
        Worker exchanges them for web and mobile sessions immediately.
      </>
    ),
  },
  {
    number: "03",
    title: "Start asking — and logging",
    body: (
      <>
        Ask about today&apos;s diary, nutrition scores, or fasting stats — or let your assistant log
        meals, build recipes, and track biometrics for you. Live tools hit Cronometer&apos;s mobile
        API; bulk history comes from bounded CSV exports.
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
          Deploy the Worker, add the connector URL, sign in once — then ask questions, log meals,
          and build recipes in plain language.
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
          which may change without notice. Access — read and write — is granted only by you, per
          client, via OAuth.
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
        <Capabilities />
        <Tools />
        <Setup />
        <Security />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
