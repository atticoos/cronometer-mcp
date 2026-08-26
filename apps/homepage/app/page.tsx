import type { ComponentType, ReactNode } from "react";
import DemoTabs, { MacroPlanDemo } from "./components/demo-tabs";
import {
  AppleIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CalendarRangeIcon,
  CheckIcon,
  ClaudeIcon,
  ClockIcon,
  CodeIcon,
  CursorIcon,
  DownloadIcon,
  GeminiIcon,
  GitHubIcon,
  HeartPulseIcon,
  HermesIcon,
  LeafIcon,
  OpenAIIcon,
  OpenClawIcon,
  PonchoIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TargetIcon,
  WindsurfIcon,
  UtensilsIcon,
} from "./components/icons";

type Icon = ComponentType<{ className?: string }>;

const NAV_LINKS = [
  { label: "Use cases", href: "#use-cases" },
  { label: "Capabilities", href: "#capabilities" },
  { label: "Setup", href: "#setup" },
  { label: "FAQ", href: "#faq" },
];

const PROBLEMS: { icon: Icon; title: string; body: string }[] = [
  {
    icon: TargetIcon,
    title: "Know what comes next",
    body: "You want tonight’s meal to fit what remains—not another screen of consumed totals to eyeball and do the math on.",
  },
  {
    icon: BookOpenIcon,
    title: "Record real life accurately",
    body: "You remember exactly what you ordered, but no database entry matches it, so honest logging turns into guesswork.",
  },
  {
    icon: CalendarRangeIcon,
    title: "Plan without spreadsheets",
    body: "Multi-week questions live behind CSV exports and manual comparison, so the next plan never quite starts from your data.",
  },
];

const USE_CASES: { icon: Icon; title: string; body: string; prompt: string; outcome: string }[] = [
  {
    icon: TargetIcon,
    title: "Understand your nutrition",
    body: "Summarize days or weeks of logging to see where macros drifted, which days held together, and the entries behind the trend.",
    prompt: "Review my last four weeks and show where my macros drifted from target.",
    outcome: "A trend summary grounded in specific entries",
  },
  {
    icon: BookOpenIcon,
    title: "Log what you actually ate",
    body: "Describe the odd substitution or custom order in plain language. Your assistant works out the nutrition and creates a reusable custom food in Cronometer.",
    prompt: "Add my Starbucks drink, but swap in their protein milk.",
    outcome: "Custom nutrition without manual data entry",
  },
  {
    icon: UtensilsIcon,
    title: "Decide what to eat next",
    body: "Cronometer shows what remains. Your assistant turns those remaining calories and macros into a meal that fits your preferences, schedule, and training day.",
    prompt: "I lift in two hours. What can I eat with today’s remaining macros?",
    outcome: "A practical meal, not another dashboard",
  },
];

const WEIGHT_LOSS_FLOW: { step: string; title: string; body: ReactNode }[] = [
  {
    step: "01",
    title: "Ask in plain language",
    body: (
      <>
        “I want to start losing weight. Can you set my macros?” No forms, no fields—the goal is
        the whole request.
      </>
    ),
  },
  {
    step: "02",
    title: "Your assistant reads your history",
    body: (
      <>
        <span className="font-mono text-emerald-300">get_macro_targets</span> and{" "}
        <span className="font-mono text-emerald-300">get_meal_history</span> pull your current
        targets and a month of logged meals. The math comes from your record—2,480 kcal eaten
        against roughly 2,580 burned—not a generic formula.
      </>
    ),
  },
  {
    step: "03",
    title: "Review the proposal first",
    body: (
      <>
        The plan lands as a review card—2,330 kcal · 150P / 275C / 70F, protein anchored near
        1.8 g per kg, extra carbs on training days—with the reasoning spelled out.
      </>
    ),
  },
  {
    step: "04",
    title: "Your approval does the writing",
    body: (
      <>
        Say the word and <span className="font-mono text-emerald-300">set_macro_targets</span>{" "}
        updates Cronometer directly. Your assistant closes the loop with what your own log shows:
        weekdays already fit—weekends are where you went over.
      </>
    ),
  },
];

const MORE_USE_CASES = [
  "Build recipes from ingredients",
  "Estimate restaurant meals",
  "Review weekly nutrition trends",
  "Adjust training and rest days",
  "Copy repeatable meal plans",
  "Add fasting and biometric context",
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
      icon: ShieldCheckIcon,
      title: "Account",
      tools: [{ name: "connection_status", badge: "read" }],
      footnote: "verifies both Cronometer sessions are live",
    },
    {
      icon: DownloadIcon,
      title: "Bulk exports",
      tools: [{ name: "get_cronometer_data", badge: "read" }],
      footnote: "daily_nutrition · servings · exercises · biometrics · notes",
    },
  ];

const LIMITS = [
  { value: "~10 / day", label: "upstream export cap" },
  { value: "≤ 31 days", label: "window per request" },
  { value: "1,000", label: "rows per response" },
];

const WORKS_WITH: { name: string; icon: Icon; iconClass?: string }[] = [
  { name: "ChatGPT", icon: OpenAIIcon },
  { name: "Codex", icon: OpenAIIcon },
  { name: "Poncho", icon: PonchoIcon, iconClass: "text-red-400" },
  { name: "OpenClaw", icon: OpenClawIcon, iconClass: "text-red-400" },
  { name: "Hermes", icon: HermesIcon },
  { name: "Cursor", icon: CursorIcon },
  { name: "Claude Desktop", icon: ClaudeIcon, iconClass: "text-orange-400" },
  { name: "Claude Code", icon: ClaudeIcon, iconClass: "text-orange-300" },
  { name: "Gemini CLI", icon: GeminiIcon, iconClass: "text-blue-400" },
  { name: "VS Code", icon: CodeIcon, iconClass: "text-sky-400" },
  { name: "Windsurf", icon: WindsurfIcon, iconClass: "text-teal-300" },
];

const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "What is Cronometer MCP?",
    answer:
      "An independent, open-source connector that lets ChatGPT, Claude, Cursor, and other MCP clients read and write data in your Cronometer account—food log, daily nutrition, biometrics, fasting history, and bulk exports.",
  },
  {
    question: "Do I need a Cronometer API key?",
    answer:
      "No. Cronometer does not offer a public API, so the server signs in once with your Cronometer username, password, and one-time code during authorization. There is nothing to create, manage, or rotate.",
  },
  {
    question: "Do I need to install anything?",
    answer:
      "No. The hosted endpoint serves OAuth discovery, dynamic client registration, and all 18 tools. If you prefer your own deployment, the same open-source Worker runs on any Cloudflare account.",
  },
  {
    question: "Which assistants work with Cronometer MCP?",
    answer:
      "Any MCP client that connects to a remote server over HTTP—ChatGPT connectors, Claude, Cursor, VS Code, Codex, and others. Every tool carries MCP annotations regardless of which client you use.",
  },
  {
    question: "Is my password stored?",
    answer:
      "No. Credentials are exchanged exactly once at authorization for web and mobile sessions, which live inside the encrypted OAuth grant. Your password and one-time code are never persisted and never embedded in an MCP token.",
  },
  {
    question: "Can it change my Cronometer account?",
    answer:
      "Yes. Write tools cover food entries, custom foods, recipes, day copying, and day completion. Each tool declares whether it is read-only, idempotent, or destructive, so compatible clients can require confirmation before anything mutates.",
  },
  {
    question: "Is this an official Cronometer product?",
    answer:
      "No. Cronometer MCP is an independent open-source project and is not affiliated with or endorsed by Cronometer.com.",
  },
];

const ENDPOINT = "https://mcp.cronometer-mcp.dev/mcp";
const GITHUB_URL = "https://github.com/atticoos/cronometer-mcp";

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
          <span className="hidden font-mono text-sm font-semibold text-white sm:inline">
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
        <div className="flex items-center gap-2">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="View Cronometer MCP on GitHub"
            className="flex size-9 items-center justify-center rounded-full border border-white/10 text-zinc-400 transition-colors hover:border-white/25 hover:text-white"
          >
            <GitHubIcon className="size-[18px]" />
          </a>
          <a
            href="#setup"
            className="rounded-full bg-emerald-500 px-3 py-2 text-xs font-semibold text-emerald-950 transition-colors hover:bg-emerald-400 sm:px-4 sm:text-sm"
          >
            Connect Cronometer
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.15),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
      <div className="relative mx-auto grid max-w-6xl gap-14 px-6 pt-20 pb-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-28">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-xs font-medium text-emerald-300">
            <SparklesIcon className="size-3.5" />
            Open source · read & write · Model Context Protocol
          </div>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-5xl xl:text-6xl">
            Talk to your{" "}
            <span className="bg-gradient-to-r from-emerald-300 to-teal-400 bg-clip-text text-transparent">
              Cronometer data
            </span>{" "}
            from your AI assistant.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
            Cronometer MCP is the connector that lets ChatGPT, Claude, Cursor, and other AI
            assistants use your food log, daily nutrition, biometrics, and fasting history. See
            what remains, log what you actually ate, and plan macros in plain language.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="#setup"
              className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
            >
              Connect Cronometer
              <ArrowRightIcon className="size-4" />
            </a>
            <a
              href="#use-cases"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-6 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-white/25 hover:text-white"
            >
              See what you can ask
            </a>
          </div>
          <p className="mt-6 text-xs text-zinc-500">
            Independent, open-source connector for Cronometer.
          </p>
          <p className="mt-2 break-all font-mono text-xs text-zinc-500">
            GET <span className="text-zinc-400">{ENDPOINT}</span>
          </p>
        </div>
        <DemoTabs />
      </div>
      <WorksWith />
    </section>
  );
}

function WorksWith() {
  return (
    <div className="relative border-t border-white/5 py-10">
      <div className="mx-auto max-w-6xl px-6">
        <p className="font-mono text-[11px] font-medium tracking-[0.28em] text-zinc-500 uppercase">
          Works with
        </p>
      </div>
      <div className="marquee marquee-mask mt-7 overflow-hidden">
        <div className="marquee-track flex w-max">
          {[0, 1].map((copy) => (
            <ul
              key={copy}
              aria-hidden={copy === 1 || undefined}
              className="flex items-center gap-3 pr-3"
            >
              {WORKS_WITH.map((client) => (
                <li
                  key={client.name}
                  className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] py-2.5 pr-5 pl-4 text-sm font-medium whitespace-nowrap text-zinc-100"
                >
                  <client.icon
                    className={`size-4 shrink-0 ${client.iconClass ?? "text-zinc-300"}`}
                  />
                  {client.name}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}

function Problem() {
  return (
    <section className="border-t border-white/5 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading eyebrow="The problem" title="Your Cronometer data is useful. Getting answers from it should be easier.">
          Your food log holds the evidence—but answering a simple question still means opening
          diary screens, doing macro arithmetic, and exporting spreadsheets.
        </SectionHeading>
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {PROBLEMS.map((problem) => (
            <div key={problem.title}>
              <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                <problem.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-white">{problem.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{problem.body}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-14 max-w-2xl text-center text-lg text-zinc-300">
          Instead of doing arithmetic over diary screens, ask in plain language and get an answer
          grounded in specific entries.
        </p>
      </div>
    </section>
  );
}

function UseCases() {
  return (
    <section id="use-cases" className="border-t border-white/5 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading eyebrow="What you can do" title="Watch a goal become a plan.">
          The weight-loss flow, start to finish: ask in plain language, get targets built from
          your own logged history, review before anything changes—and Cronometer updates only
          after you approve.
        </SectionHeading>
        <div className="mt-14 grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <ol className="space-y-9">
            {WEIGHT_LOSS_FLOW.map((step) => (
              <li key={step.step} className="flex gap-5">
                <p className="shrink-0 pt-0.5 font-mono text-sm font-semibold text-emerald-500/70">
                  {step.step}
                </p>
                <div>
                  <h3 className="text-base font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <MacroPlanDemo />
        </div>
        <div className="mt-20 flex items-center gap-5">
          <span className="h-px flex-1 bg-white/5" />
          <p className="font-mono text-[11px] font-medium tracking-[0.28em] text-zinc-500 uppercase">
            More you can ask
          </p>
          <span className="h-px flex-1 bg-white/5" />
        </div>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {USE_CASES.map((useCase, index) => (
            <article
              key={useCase.title}
              className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/[0.04]"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                  <useCase.icon className="size-5" />
                </span>
                <span className="font-mono text-xs text-zinc-600">0{index + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-white">{useCase.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{useCase.body}</p>
              <div className="mt-5 rounded-xl bg-black/30 p-4 ring-1 ring-white/5">
                <p className="font-mono text-[11px] text-emerald-400">YOU COULD ASK</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">“{useCase.prompt}”</p>
              </div>
              <p className="mt-5 flex items-center gap-2 text-xs text-zinc-500">
                <CheckIcon className="size-4 shrink-0 text-emerald-400" />
                {useCase.outcome}
              </p>
            </article>
          ))}
        </div>
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <p className="text-sm font-medium text-white">And the everyday jobs that add up</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {MORE_USE_CASES.map((useCase) => (
              <span
                key={useCase}
                className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-zinc-400"
              >
                {useCase}
              </span>
            ))}
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-relaxed text-zinc-600">
          Trend reviews can also fold in other data you choose to give your assistant—training
          logs, weight trends, energy expenditure. Cronometer MCP supplies the nutrition side of
          that context.
        </p>
      </div>
    </section>
  );
}

function Capabilities() {
  return (
    <section id="capabilities" className="border-t border-white/5 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading eyebrow="Tool manifest" title="18 focused tools behind every answer.">
          connection_status keeps the link honest; the other seventeen read and write your account
          through Cronometer&apos;s mobile API and bounded CSV exports. Every chip is annotated
          read, write, or destructive.
        </SectionHeading>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <p className="mt-10 text-center">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 transition-colors hover:text-emerald-300"
          >
            Explore the complete tool manifest on GitHub
            <ArrowRightIcon className="size-4" />
          </a>
        </p>
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
    title: "Ask your first question",
    body: (
      <>
        Confirm the link read-only with{" "}
        <span className="text-zinc-300">
          “Which Cronometer account is connected?”
        </span>{" "}
        — answered by <span className="font-mono text-emerald-300">connection_status</span>. Then
        try the real thing:{" "}
        <span className="text-zinc-300">
          “What can I eat with today’s remaining macros?”
        </span>
      </>
    ),
  },
];

function Setup() {
  return (
    <section id="setup" className="border-t border-white/5 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Setup"
          title={
            <>
              Connect Cronometer.
              <br />
              Ask your first question.
            </>
          }
        >
          One endpoint, one browser sign-in. There are no API keys—authorization exchanges your
          Cronometer login for scoped sessions and discards the credentials.
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

function Faq() {
  return (
    <section id="faq" className="border-t border-white/5 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading eyebrow="Questions, answered" title="Know what you are connecting before you start.">
          The short version: no API keys, no install, credentials are never stored, and the whole
          server is open source if you would rather read it than trust it.
        </SectionHeading>
        <div className="mx-auto mt-14 max-w-3xl space-y-3">
          {FAQ_ITEMS.map((item) => (
            <details
              key={item.question}
              className="group rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 open:bg-white/[0.05]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
                {item.question}
                <span className="font-mono text-emerald-400 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">{item.answer}</p>
            </details>
          ))}
        </div>
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
          Put your Cronometer data to work.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-400">
          Connect in the browser for the shortest path—no local install required. Prefer control?
          Run the same open-source Worker on your own Cloudflare account.
        </p>
        <a
          href="#setup"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
        >
          Connect Cronometer
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
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-emerald-400"
        >
          Open source on GitHub
          <ArrowRightIcon className="size-3.5" />
        </a>
          <p className="max-w-3xl text-xs leading-relaxed text-zinc-500">
            Independent, open source, and built to turn nutrition data into useful answers.
          </p>
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

export default function HomePage() {
  return (
    <div className="min-h-screen font-sans">
      <Nav />
      <main>
        <Hero />
        <Problem />
        <UseCases />
        <Capabilities />
        <Setup />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
