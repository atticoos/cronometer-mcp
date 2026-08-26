"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon, RefreshIcon } from "./icons";

const PRE_WORKOUT_SUGGESTIONS = [
  {
    name: "Greek yogurt, banana & honey",
    history: "logged 7 times · 5 min",
    macros: "24P · 42C · 1F",
  },
  {
    name: "Oats, banana & whey",
    history: "logged 5 times · 10 min",
    macros: "28P · 55C · 5F",
  },
  {
    name: "Turkey toast with honey",
    history: "logged 3 times · 8 min",
    macros: "25P · 48C · 4F",
  },
];

type AssistantSegment =
  | { kind: "text"; text: string; className?: string }
  | { kind: "block"; node: ReactNode };

type ToolCallSpec = {
  name: string;
  args?: string;
  result?: ReactNode;
  resultTone?: "muted" | "success";
};

type ChatItem =
  | { role: "user"; id: string; delay?: number; text: string }
  | { role: "tool"; id: string; delay?: number; calls: ToolCallSpec[] }
  | { role: "note"; id: string; delay?: number; node: ReactNode }
  | {
    role: "assistant";
    id: string;
    delay?: number;
    typing?: boolean;
    segments: AssistantSegment[];
  };

const TYPE_BASE_MS = 15;
const TYPE_JITTER_MS = 22;
const PUNCTUATION_PAUSE_MS = 95;
const PUNCTUATION = ".,;:!?—";
const FIRST_CHAR_DELAY_MS = 160;

const TOOL_LINE_STAGGER_MS = 420;
const TOOL_LINE_SETTLE_MS = 520;
const BLOCK_REVEAL_MS = 480;
const STATIC_HOLD_MS = 340;
const DEFAULT_GAP_MS = 850;
const FIRST_ITEM_FALLBACK_MS = 600;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function useFireOnce(onDone?: () => void) {
  const doneRef = useRef(onDone);
  const firedRef = useRef(false);
  useEffect(() => {
    doneRef.current = onDone;
  });
  return useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    doneRef.current?.();
  }, []);
}

function useTypewriter(text: string, onDone?: () => void) {
  const [visibleChars, setVisibleChars] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const notifyDone = useFireOnce(onDone);

  useEffect(() => {
    if (text.length === 0 || reducedMotion) {
      setVisibleChars(text.length);
      notifyDone();
      return;
    }
    let cancelled = false;
    let timer = 0;
    let index = 0;

    const step = () => {
      if (cancelled) return;
      index += 1;
      setVisibleChars(index);
      if (index >= text.length) {
        notifyDone();
        return;
      }
      const previous = text[index - 1] ?? "";
      const pause =
        TYPE_BASE_MS +
        Math.random() * TYPE_JITTER_MS +
        (PUNCTUATION.includes(previous) ? PUNCTUATION_PAUSE_MS : 0);
      timer = window.setTimeout(step, pause);
    };

    timer = window.setTimeout(step, FIRST_CHAR_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [text, reducedMotion, notifyDone]);

  return {
    typed: text.slice(0, visibleChars),
    isTyping: visibleChars < text.length,
  };
}

function Caret({ tone }: { tone: "sky" | "emerald" }) {
  return (
    <span
      aria-hidden="true"
      className={`chat-caret ml-[1px] inline-block h-[1em] w-[7px] translate-y-[2px] ${tone === "sky" ? "bg-sky-300/90" : "bg-emerald-300/90"
        }`}
    />
  );
}

function UserLine({ text, onDone }: { text: string; onDone?: () => void }) {
  const { typed, isTyping } = useTypewriter(text, onDone);
  return (
    <p className="text-zinc-100">
      <span className="mr-2 text-sky-400/70">you ›</span>
      {typed}
      {isTyping ? <Caret tone="sky" /> : null}
    </p>
  );
}

function StreamingText({
  text,
  className,
  active,
  onDone,
}: {
  text: string;
  className?: string;
  active: boolean;
  onDone?: () => void;
}) {
  const { typed, isTyping } = useTypewriter(
    active ? text : "",
    active ? onDone : undefined
  );
  if (!active) {
    return <p className={className}>{text}</p>;
  }
  return (
    <p className={className}>
      {typed}
      {isTyping ? <Caret tone="emerald" /> : null}
    </p>
  );
}

function AssistantText({
  segments,
  onDone,
}: {
  segments: readonly AssistantSegment[];
  onDone?: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const notifyDone = useFireOnce(onDone);
  const advance = useCallback(() => setActiveIndex((index) => index + 1), []);

  useEffect(() => {
    if (activeIndex >= segments.length) {
      notifyDone();
      return;
    }
    const current = segments[activeIndex];
    if (current.kind !== "block") return;
    const timer = window.setTimeout(
      advance,
      reducedMotion ? 80 : BLOCK_REVEAL_MS
    );
    return () => window.clearTimeout(timer);
  }, [activeIndex, segments, reducedMotion, advance, notifyDone]);

  return (
    <div className="space-y-2.5 text-zinc-400">
      {segments.slice(0, activeIndex + 1).map((segment, index) =>
        segment.kind === "block" ? (
          <div key={index} className="chat-enter">
            {segment.node}
          </div>
        ) : (
          <StreamingText
            key={index}
            text={segment.text}
            className={segment.className}
            active={index === activeIndex && activeIndex < segments.length}
            onDone={advance}
          />
        )
      )}
    </div>
  );
}

function ToolCallView({
  name,
  args,
  result,
  resultTone = "muted",
}: ToolCallSpec) {
  const success = resultTone === "success";
  return (
    <div>
      <p className="flex items-center gap-2">
        <span className="size-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
        <span className="font-semibold text-zinc-100">{name}</span>
        {args ? <span className="text-zinc-400">({args})</span> : null}
      </p>
      {result ? (
        <p
          className={`mt-0.5 pl-[14px] text-xs ${success ? "text-emerald-300/90" : "text-zinc-500"
            }`}
        >
          <span className={success ? "text-emerald-500/60" : "text-zinc-700"}>
            └{" "}
          </span>
          {result}
        </p>
      ) : null}
    </div>
  );
}

function ToolGroup({
  calls,
  onDone,
}: {
  calls: readonly ToolCallSpec[];
  onDone?: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const notifyDone = useFireOnce(onDone);

  useEffect(() => {
    if (calls.length === 0) {
      notifyDone();
      return;
    }
    const total = reducedMotion
      ? 140
      : (calls.length - 1) * TOOL_LINE_STAGGER_MS + TOOL_LINE_SETTLE_MS;
    const timer = window.setTimeout(notifyDone, total);
    return () => window.clearTimeout(timer);
  }, [calls.length, reducedMotion, notifyDone]);

  return (
    <div className="space-y-2.5">
      {calls.map((call, index) => (
        <div
          key={index}
          className="chat-tool-line"
          style={{ animationDelay: `${index * TOOL_LINE_STAGGER_MS}ms` }}
        >
          <ToolCallView {...call} />
        </div>
      ))}
    </div>
  );
}

function TimedReveal({
  children,
  onDone,
}: {
  children: ReactNode;
  onDone?: () => void;
}) {
  const notifyDone = useFireOnce(onDone);
  useEffect(() => {
    const timer = window.setTimeout(notifyDone, STATIC_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [notifyDone]);
  return <>{children}</>;
}

const PRE_WORKOUT_SCENARIO: ChatItem[] = [
  {
    role: "user",
    id: "pre-workout-question",
    delay: 600,
    text: "I’m feeling sluggish and heading to the gym in a couple hours. What’s a light meal or snack that’ll fuel me?",
  },
  {
    role: "tool",
    id: "pre-workout-tools",
    delay: 900,
    calls: [
      {
        name: "cronometer-mcp",
        args: "get_macro_targets",
        result: "2400 kcal · 180P / 240C / 80F",
      },
      {
        name: "cronometer-mcp",
        args: "get_daily_nutrition",
        result: "1480 kcal · 110P / 145C / 50F",
      },
      {
        name: "cronometer-mcp",
        args: "get_meal_history",
        result: "84 meals",
      },
    ],
  },
  {
    role: "assistant",
    id: "pre-workout-answer",
    delay: 1150,
    typing: true,
    segments: [
      {
        kind: "text",
        text: "You’re at 1,480 of 2,400 kcal, with 70g protein, 95g carbs, and 30g fat left. Since you’re training in about two hours, I’d go light: carbs for energy, some protein, and not much fat. These all fit:",
      },
      {
        kind: "block",
        node: (
          <div className="space-y-3 border-t border-white/5 pt-3 text-xs">
            {PRE_WORKOUT_SUGGESTIONS.map((suggestion) => (
              <div
                key={suggestion.name}
                className="flex items-start justify-between gap-3"
              >
                <div>
                  <p className="text-zinc-200">{suggestion.name}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {suggestion.history}
                  </p>
                </div>
                <p className="shrink-0 text-zinc-500">{suggestion.macros}</p>
              </div>
            ))}
          </div>
        ),
      },
      {
        kind: "text",
        text: "The yogurt and banana is the lightest option. Pick one and I’ll log it as your pre-workout meal.",
      },
    ],
  },
  {
    role: "user",
    id: "pre-workout-confirm",
    delay: 950,
    text: "Yes.",
  },
  {
    role: "tool",
    id: "pre-workout-write",
    delay: 750,
    calls: [
      {
        name: "cronometer-mcp",
        args: "add_food_entry × 3",
        result: "added · Greek yogurt, banana & honey · 24P / 42C / 1F",
        resultTone: "success",
      },
    ],
  },
  {
    role: "assistant",
    id: "pre-workout-complete",
    delay: 1000,
    typing: true,
    segments: [
      {
        kind: "text",
        text: "Done — your pre-workout meal is logged. You’ll still have 46g protein, 53g carbs, and 29g fat left for the day.",
      },
    ],
  },
  {
    role: "note",
    id: "pre-workout-footnote",
    delay: 650,
    node: (
      <p className="flex items-center gap-1.5 border-t border-white/5 px-1 pt-3 pb-1 text-xs text-emerald-400/90">
        <CheckIcon className="size-3.5 shrink-0" />
        Matched to today’s remaining macros and your meal history
      </p>
    ),
  },
];

const MACRO_SCENARIO: ChatItem[] = [
  {
    role: "user",
    id: "macro-question",
    delay: 600,
    text: "I want to start losing weight. Can you set my macros?",
  },
  {
    role: "tool",
    id: "macro-tools",
    delay: 900,
    calls: [
      {
        name: "apple-health",
        args: "get_profile",
        result: "height · weight · 4 weeks of activity",
      },
      {
        name: "cronometer-mcp",
        args: "get_macro_targets",
        result: "2500 kcal · 180P / 265C / 80F",
      },
      {
        name: "cronometer-mcp",
        args: "get_meal_history",
        result: "84 meals",
      },
    ],
  },
  {
    role: "assistant",
    id: "macro-proposal",
    delay: 1150,
    typing: true,
    segments: [
      {
        kind: "text",
        text: "You’ve eaten about 2,480 kcal a day against roughly 2,580 burned, so your weight has held steady. Easing down to 2,330 is a gentle deficit — closer to half a pound a week — and leaves your training days untouched.",
      },
      {
        kind: "block",
        node: (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-amber-200">
                Proposed macro targets
              </p>
              <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                review
              </span>
            </div>
            <p className="mt-2 font-mono text-sm text-zinc-100">
              2,330 kcal · 150P / 275C / 70F
            </p>
            <p className="mt-1.5 text-zinc-500">
              Protein anchored near 1.8 g per kg · extra carbs land on training
              days
            </p>
          </div>
        ),
      },
      {
        kind: "text",
        text: "Want me to make these your targets in Cronometer?",
      },
    ],
  },
  {
    role: "user",
    id: "macro-confirm",
    delay: 950,
    text: "Yes — do it.",
  },
  {
    role: "tool",
    id: "macro-write",
    delay: 750,
    calls: [
      {
        name: "cronometer-mcp",
        args: "set_macro_targets",
        result: "updated · 2,330 kcal · 150P / 275C / 70F",
        resultTone: "success",
      },
    ],
  },
  {
    role: "assistant",
    id: "macro-answer",
    delay: 1000,
    typing: true,
    segments: [
      {
        kind: "text",
        text: "Done. Weekdays already average under this — weekends are where you went over.",
      },
    ],
  },
  {
    role: "note",
    id: "macro-footnote",
    delay: 650,
    node: (
      <p className="flex items-center gap-1.5 px-1 pb-1 text-[11px] text-zinc-500">
        <CheckIcon className="size-3 shrink-0 text-emerald-500" />
        Built from your Apple Health activity and a full month of logged meals
      </p>
    ),
  },
];

const WEEK_PLAN = [
  {
    day: "mon",
    meals: "Overnight oats & whey · chicken rice bowl · turkey chili",
    kcal: "2,340",
  },
  {
    day: "tue",
    meals: "Eggs & toast · turkey wrap · salmon & broccoli",
    kcal: "2,320",
  },
  {
    day: "wed",
    meals: "Greek yogurt bowl · chicken stir-fry · salmon & broccoli",
    kcal: "2,300",
  },
  {
    day: "thu",
    meals: "Overnight oats & whey · chicken rice bowl · turkey chili",
    kcal: "2,340",
  },
  {
    day: "fri",
    meals: "Eggs & toast · turkey wrap · chicken stir-fry",
    kcal: "2,310",
  },
  {
    day: "sat",
    meals: "Greek yogurt bowl · chicken rice bowl · salmon & broccoli",
    kcal: "2,350",
  },
  {
    day: "sun",
    meals: "Overnight oats & whey · turkey wrap · turkey chili",
    kcal: "2,280",
  },
];

const WEEK_SCENARIO: ChatItem[] = [
  {
    role: "user",
    id: "week-question",
    delay: 600,
    text: "Plan my meals for next week. I don’t want to think about it after Monday.",
  },
  {
    role: "tool",
    id: "week-tools",
    delay: 900,
    calls: [
      {
        name: "cronometer-mcp",
        args: "get_meal_history",
        result: "84 meal entries",
      },
    ],
  },
  {
    role: "assistant",
    id: "week-answer",
    delay: 1150,
    typing: true,
    segments: [
      {
        kind: "text",
        text: "I built this from the meals you already eat on repeat — every day lands within ~25 kcal of your 2,330 target:",
      },
      {
        kind: "block",
        node: (
          <div className="space-y-1.5 border-t border-white/5 pt-3 text-xs">
            {WEEK_PLAN.map((row) => (
              <div
                key={row.day}
                className="flex items-baseline justify-between gap-3"
              >
                <p className="shrink-0 font-mono text-zinc-500">{row.day}</p>
                <p className="text-zinc-200">{row.meals}</p>
                <p className="shrink-0 font-mono text-zinc-500">{row.kcal}</p>
              </div>
            ))}
          </div>
        ),
      },
      {
        kind: "text",
        text: "Want a grocery list to match?",
      },
      {
        kind: "block",
        node: (
          <p className="flex items-center gap-1.5 border-t border-white/5 pt-3 text-xs text-emerald-400/90">
            <CheckIcon className="size-3.5 shrink-0" />
            Built from the meals you already eat on repeat
          </p>
        ),
      },
    ],
  },
];

const QUICK_LOG_ENTRIES = [
  {
    name: "Overnight oats & whey",
    detail: "breakfast · logged 18 times · your usual serving",
    macros: "520 kcal · 38P",
  },
  {
    name: "Chicken rice bowl",
    detail: "lunch · logged 11 times · last Thursday",
    macros: "710 kcal · 52P",
  },
  {
    name: "Turkey chili",
    detail: "dinner · logged 14 times · 1½ servings",
    macros: "470 kcal · 34P",
  },
  {
    name: "Greek yogurt bowl",
    detail: "afternoon snack · logged 9 times · post-gym",
    macros: "240 kcal · 20P",
  },
];

const QUICK_LOG_SCENARIO: ChatItem[] = [
  {
    role: "user",
    id: "quicklog-question",
    delay: 600,
    text: "Log today's meals: protein & oat breakfast, chicken rice bowl at lunch, and turkey chili dinner. Same snack as yesterday."
  },
  {
    role: "tool",
    id: "quicklog-tools",
    delay: 900,
    calls: [
      {
        name: "cronometer-mcp",
        args: "get_meal_history",
        result: "58 meals logged this month",
      }
    ],
  },
  {
    role: "assistant",
    id: "quicklog-answer",
    delay: 1150,
    typing: true,
    segments: [
      {
        kind: "text",
        text: "Found 4 meals you've logged recently:",
      },
      {
        kind: "block",
        node: (
          <div className="space-y-3 border-t border-white/5 pt-3 text-xs">
            {QUICK_LOG_ENTRIES.map((entry) => (
              <div key={entry.name} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-zinc-200">{entry.name}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">{entry.detail}</p>
                </div>
                <p className="shrink-0 text-zinc-500">{entry.macros}</p>
              </div>
            ))}
          </div>
        ),
      },
      {
        kind: "text",
        text: "Want me to add all four to today’s diary?",
      },
    ],
  },
  {
    role: "user",
    id: "quicklog-confirm",
    delay: 950,
    text: "Yes — log them.",
  },
  {
    role: "tool",
    id: "quicklog-write",
    delay: 850,
    calls: [
      {
        name: "cronometer-mcp",
        args: "add_food_entry ×4",
        result: "4 entries added · 1,940 kcal · 144P / 170C / 64F",
        resultTone: "success",
      },
    ],
  },
  {
    role: "assistant",
    id: "quicklog-done",
    delay: 1000,
    typing: true,
    segments: [
      {
        kind: "text",
        text: "Done — your whole day is logged, exactly as you usually eat it.",
      },
    ],
  },
  {
    role: "note",
    id: "quicklog-footnote",
    delay: 650,
    node: (
      <p className="flex items-center gap-1.5 px-1 pb-1 text-[11px] text-zinc-500">
        <CheckIcon className="size-3 shrink-0 text-emerald-500" />
        Casual mentions like “my usual” were resolved from your own meal history
      </p>
    ),
  },
];

function TypingIndicator() {
  return (
    <div
      aria-hidden="true"
      className="chat-enter inline-flex items-center gap-1.5 py-1 pl-0.5"
    >
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

function renderChatItem(
  item: ChatItem,
  index: number,
  onDone: (index: number) => void
) {
  switch (item.role) {
    case "user":
      return <UserLine text={item.text} onDone={() => onDone(index)} />;
    case "tool":
      return <ToolGroup calls={item.calls} onDone={() => onDone(index)} />;
    case "assistant":
      return (
        <AssistantText segments={item.segments} onDone={() => onDone(index)} />
      );
    case "note":
      return (
        <TimedReveal onDone={() => onDone(index)}>{item.node}</TimedReveal>
      );
  }
}

function ChatFeed({ items }: { items: readonly ChatItem[] }) {
  const [shownCount, setShownCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (completedCount !== shownCount) return;
    if (shownCount >= items.length) return;
    const upcoming = items[shownCount];
    const isFirst = shownCount === 0;
    const delay =
      isFirst && upcoming.role === "user"
        ? 0
        : upcoming.delay ?? (isFirst ? FIRST_ITEM_FALLBACK_MS : DEFAULT_GAP_MS);
    const timer = window.setTimeout(() => {
      setShownCount((count) => count + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [completedCount, shownCount, items]);

  const handleDone = useCallback((index: number) => {
    setCompletedCount((completed) => Math.max(completed, index + 1));
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      scroller.scrollTo({ top: scroller.scrollHeight });
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const upcoming = shownCount < items.length ? items[shownCount] : undefined;
  const pendingTyping =
    completedCount === shownCount &&
    upcoming?.role === "assistant" &&
    upcoming.typing !== false;

  return (
    <div
      ref={scrollerRef}
      className="chat-scroll h-[26rem] overflow-y-auto p-5 font-mono text-[13px] leading-relaxed"
    >
      <div ref={contentRef} className="space-y-3.5">
        {items.slice(0, shownCount).map((item, index) => (
          <div key={item.id} className="chat-enter">
            {renderChatItem(item, index, handleDone)}
          </div>
        ))}
        {pendingTyping ? <TypingIndicator /> : null}
      </div>
    </div>
  );
}

const TABS = [
  {
    id: "ideal-meal",
    label: "Ideal meal",
    title: "chatgpt · tuesday, 4:47 pm",
    items: PRE_WORKOUT_SCENARIO,
  },
  {
    id: "quick-log",
    label: "Log my day",
    title: "chatgpt · thursday, 9:12 pm",
    items: QUICK_LOG_SCENARIO,
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

function ChatWindow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/50 shadow-2xl shadow-emerald-950/50 ring-1 ring-white/5 backdrop-blur">
      <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
        <span className="size-3 rounded-full bg-red-500/70" />
        <span className="size-3 rounded-full bg-yellow-500/70" />
        <span className="size-3 rounded-full bg-green-500/70" />
        <span className="ml-3 font-mono text-xs text-zinc-500">{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function DemoTabs() {
  const [activeTab, setActiveTab] = useState<TabId>("ideal-meal");
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
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${tab.id === active.id
              ? "bg-emerald-500 text-emerald-950"
              : "text-zinc-400 hover:text-white"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <ChatWindow title={active.title}>
        <ChatFeed key={active.id} items={active.items} />
      </ChatWindow>
    </div>
  );
}

export function MacroPlanDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [playKey, setPlayKey] = useState(0);

  useEffect(() => {
    if (started) return;
    const node = containerRef.current;
    if (!node) return;
    const viewportHeight = () =>
      window.innerHeight || document.documentElement.clientHeight;
    const ratioVisible = () => {
      const rect = node.getBoundingClientRect();
      const overlap =
        Math.min(rect.bottom, viewportHeight()) - Math.max(rect.top, 0);
      return overlap / Math.max(rect.height, 1);
    };
    if (ratioVisible() >= 0.25) {
      setStarted(true);
      return;
    }
    const check = () => {
      if (ratioVisible() < 0.25) return;
      setStarted(true);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [started]);

  return (
    <div ref={containerRef}>
      <ChatWindow title="claude · sunday morning">
        {started ? (
          <ChatFeed key={playKey} items={MACRO_SCENARIO} />
        ) : (
          <div aria-hidden="true" className="h-[26rem]" />
        )}
      </ChatWindow>
      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setPlayKey((key) => key + 1)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 transition-colors hover:text-emerald-300"
        >
          <RefreshIcon className="size-3.5" />
          Replay conversation
        </button>
      </div>
    </div>
  );
}
