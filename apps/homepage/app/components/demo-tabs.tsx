"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon } from "./icons";

const DINNER_SUGGESTIONS = [
  {
    name: "Salmon, rice & broccoli",
    history: "logged 6 times · last Tuesday",
    macros: "40P · 45C · 14F",
  },
  {
    name: "Chicken & veggie stir-fry",
    history: "logged 4 times",
    macros: "38P · 40C · 12F",
  },
  {
    name: "Turkey chili",
    history: "logged 3 times · last week",
    macros: "34P · 42C · 10F",
  },
];

type ChatItem = {
  id: string;
  /** Milliseconds to wait after the previous item before this one appears. */
  wait: number;
  /** Show an assistant typing indicator while waiting for this item. */
  typing?: boolean;
  node: ReactNode;
};

function UserLine({ children }: { children: ReactNode }) {
  return (
    <p className="text-zinc-100">
      <span className="mr-2 text-sky-400/70">you ›</span>
      {children}
    </p>
  );
}

function AssistantText({ children }: { children: ReactNode }) {
  return <div className="space-y-2.5 text-zinc-400">{children}</div>;
}

function ToolCall({
  name,
  args,
  result,
  resultTone = "muted",
}: {
  name: string;
  args?: string;
  result?: ReactNode;
  resultTone?: "muted" | "success";
}) {
  const success = resultTone === "success";
  return (
    <div>
      <p className="flex items-center gap-2">
        <span className="size-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
        <span className="font-semibold text-zinc-100">{name}</span>
        {args ? <span className="text-zinc-400">({args})</span> : null}
      </p>
      {result ? (
        <p className={`mt-0.5 pl-[14px] text-xs ${success ? "text-emerald-300/90" : "text-zinc-500"}`}>
          <span className={success ? "text-emerald-500/60" : "text-zinc-700"}>└ </span>
          {result}
        </p>
      ) : null}
    </div>
  );
}

function ToolGroup({ children }: { children: ReactNode }) {
  return <div className="space-y-2.5">{children}</div>;
}

const DINNER_SCENARIO: ChatItem[] = [
  {
    id: "dinner-question",
    wait: 600,
    node: <UserLine>What should I make for dinner? Long day, low energy.</UserLine>,
  },
  {
    id: "dinner-tools",
    wait: 800,
    node: (
      <ToolGroup>
        <ToolCall
          name="cronometer-mcp"
          args="get_remaining_macros"
          result="610 kcal · 48P / 52C / 22F left today"
        />
        <ToolCall
          name="cronometer-mcp"
          args="find_prior_dinners"
          result="12 dinners you’ve logged before"
        />
      </ToolGroup>
    ),
  },
  {
    id: "dinner-answer",
    wait: 1500,
    typing: true,
    node: (
      <AssistantText>
        <p>
          You have 610 kcal left — 48 g protein, 52 g carbs, 22 g fat. All three of these fit,
          and you’ve cooked every one of them before:
        </p>
        <div className="space-y-3 border-t border-white/5 pt-3 text-xs">
          {DINNER_SUGGESTIONS.map((suggestion) => (
            <div key={suggestion.name} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-zinc-200">{suggestion.name}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">{suggestion.history}</p>
              </div>
              <p className="shrink-0 text-zinc-500">{suggestion.macros}</p>
            </div>
          ))}
        </div>
        <p className="border-t border-white/5 pt-3 text-xs text-zinc-500">
          Pick one and I’ll log it for tonight.
        </p>
        <p className="flex items-center gap-1.5 border-t border-white/5 pt-3 text-xs text-emerald-400/90">
          <CheckIcon className="size-3.5 shrink-0" />
          Every suggestion comes from meals already in your log
        </p>
      </AssistantText>
    ),
  },
];

const MACRO_SCENARIO: ChatItem[] = [
  {
    id: "macro-question",
    wait: 600,
    node: <UserLine>I want to start losing weight. Can you set my macros?</UserLine>,
  },
  {
    id: "macro-tools",
    wait: 800,
    node: (
      <ToolGroup>
        <ToolCall
          name="apple-health"
          args="get_body_metrics"
          result="height · weight · four weeks of activity"
        />
        <ToolCall
          name="cronometer-mcp"
          args="get_intake_history"
          result="current targets · every logged day last month"
        />
      </ToolGroup>
    ),
  },
  {
    id: "macro-proposal",
    wait: 1700,
    typing: true,
    node: (
      <AssistantText>
        <p>
          You’ve eaten about 2,480 kcal a day against roughly 2,580 burned, so your weight has
          held steady. Easing down to 2,330 is a gentle deficit — closer to half a pound a week —
          and leaves your training days untouched.
        </p>
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-amber-200">Proposed macro targets</p>
            <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
              review
            </span>
          </div>
          <p className="mt-2 font-mono text-sm text-zinc-100">2,330 kcal · 150P / 275C / 70F</p>
          <p className="mt-1.5 text-zinc-500">
            Protein anchored near 1.8 g per kg · extra carbs land on training days
          </p>
        </div>
        <p className="text-xs text-zinc-500">Want me to make these your targets in Cronometer?</p>
      </AssistantText>
    ),
  },
  {
    id: "macro-confirm",
    wait: 900,
    node: <UserLine>Yes — do it.</UserLine>,
  },
  {
    id: "macro-write",
    wait: 800,
    node: (
      <ToolCall
        name="cronometer-mcp"
        args="set_macro_targets"
        result="updated · 2,330 kcal · 150P / 275C / 70F"
        resultTone="success"
      />
    ),
  },
  {
    id: "macro-answer",
    wait: 1300,
    typing: true,
    node: (
      <AssistantText>
        Done. Weekdays already average under this — weekends are where you went over.
      </AssistantText>
    ),
  },
  {
    id: "macro-footnote",
    wait: 700,
    node: (
      <p className="flex items-center gap-1.5 px-1 pb-1 text-[11px] text-zinc-500">
        <CheckIcon className="size-3 shrink-0 text-emerald-500" />
        Built from your Apple Health activity and a full month of logged meals
      </p>
    ),
  },
];

const WEEK_PLAN = [
  { day: "mon", meals: "Overnight oats & whey · chicken rice bowl · turkey chili", kcal: "2,340" },
  { day: "tue", meals: "Eggs & toast · turkey wrap · salmon & broccoli", kcal: "2,320" },
  { day: "wed", meals: "Greek yogurt bowl · chicken stir-fry · salmon & broccoli", kcal: "2,300" },
  { day: "thu", meals: "Overnight oats & whey · chicken rice bowl · turkey chili", kcal: "2,340" },
  { day: "fri", meals: "Eggs & toast · turkey wrap · chicken stir-fry", kcal: "2,310" },
  { day: "sat", meals: "Greek yogurt bowl · chicken rice bowl · salmon & broccoli", kcal: "2,350" },
  { day: "sun", meals: "Overnight oats & whey · turkey wrap · turkey chili", kcal: "2,280" },
];

const WEEK_SCENARIO: ChatItem[] = [
  {
    id: "week-question",
    wait: 600,
    node: (
      <UserLine>
        Plan my meals for next week. I don’t want to think about it after Monday.
      </UserLine>
    ),
  },
  {
    id: "week-tools",
    wait: 800,
    node: (
      <ToolCall
        name="cronometer-mcp"
        args="get_meal_history"
        result="every meal you logged last month"
      />
    ),
  },
  {
    id: "week-answer",
    wait: 1700,
    typing: true,
    node: (
      <AssistantText>
        <p>
          I built this from the meals you already eat on repeat — every day lands within ~25 kcal
          of your 2,330 target:
        </p>
        <div className="space-y-1.5 border-t border-white/5 pt-3 text-xs">
          {WEEK_PLAN.map((row) => (
            <div key={row.day} className="flex items-baseline justify-between gap-3">
              <p className="shrink-0 font-mono text-zinc-500">{row.day}</p>
              <p className="text-zinc-200">{row.meals}</p>
              <p className="shrink-0 font-mono text-zinc-500">{row.kcal}</p>
            </div>
          ))}
        </div>
        <p className="border-t border-white/5 pt-3 text-xs text-zinc-500">
          Want a grocery list to match?
        </p>
        <p className="flex items-center gap-1.5 border-t border-white/5 pt-3 text-xs text-emerald-400/90">
          <CheckIcon className="size-3.5 shrink-0" />
          Built from the meals you already eat on repeat
        </p>
      </AssistantText>
    ),
  },
];

function TypingIndicator() {
  return (
    <div aria-hidden="true" className="chat-enter inline-flex items-center gap-1.5 py-1 pl-0.5">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="chat-dot size-1.5 rounded-full bg-zinc-500"
          style={{ animationDelay: `${dot * 160}ms` }}
        />
      ))}
    </div>
  );
}

function ChatFeed({ items }: { items: readonly ChatItem[] }) {
  const [shownCount, setShownCount] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const done = shownCount >= items.length;

  useEffect(() => {
    if (done) return;
    const wait = items[shownCount]?.wait ?? 800;
    const timer = window.setTimeout(() => setShownCount((count) => count + 1), wait);
    return () => window.clearTimeout(timer);
  }, [shownCount, done, items]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const instant = shownCount <= prevCountRef.current;
    scroller.scrollTo({
      top: scroller.scrollHeight,
      behavior: instant ? "auto" : "smooth",
    });
    prevCountRef.current = shownCount;
  }, [shownCount]);

  const pendingTyping = !done && shownCount > 0 && items[shownCount]?.typing === true;

  return (
    <div
      ref={scrollerRef}
      className="chat-scroll h-[26rem] space-y-3.5 overflow-y-auto p-5 font-mono text-[13px] leading-relaxed"
    >
      {items.slice(0, shownCount).map((item) => (
        <div key={item.id} className="chat-enter">
          {item.node}
        </div>
      ))}
      {pendingTyping ? <TypingIndicator /> : null}
    </div>
  );
}

const TABS = [
  {
    id: "dinner",
    label: "Dinner tonight",
    title: "chatgpt · tuesday, 6:47 pm",
    items: DINNER_SCENARIO,
  },
  {
    id: "macros",
    label: "Macro plan",
    title: "claude · sunday morning",
    items: MACRO_SCENARIO,
  },
  {
    id: "week",
    label: "Weekly plan",
    title: "chatgpt · sunday, 4:37 pm",
    items: WEEK_SCENARIO,
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function DemoTabs() {
  const [activeTab, setActiveTab] = useState<TabId>("dinner");
  const active = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Example conversations"
        className="mb-4 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/40 p-1"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              tab.id === active.id
                ? "bg-emerald-500 text-emerald-950"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/50 shadow-2xl shadow-emerald-950/50 ring-1 ring-white/5 backdrop-blur">
        <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
          <span className="size-3 rounded-full bg-red-500/70" />
          <span className="size-3 rounded-full bg-yellow-500/70" />
          <span className="size-3 rounded-full bg-green-500/70" />
          <span className="ml-3 font-mono text-xs text-zinc-500">{active.title}</span>
        </div>
        <ChatFeed key={active.id} items={active.items} />
      </div>
    </div>
  );
}
