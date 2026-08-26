"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
      className={`chat-caret ml-[1px] inline-block h-[1em] w-[7px] translate-y-[2px] ${
        tone === "sky" ? "bg-sky-300/90" : "bg-emerald-300/90"
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
    active ? onDone : undefined,
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
    const timer = window.setTimeout(advance, reducedMotion ? 80 : BLOCK_REVEAL_MS);
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
        ),
      )}
    </div>
  );
}

function ToolCallView({ name, args, result, resultTone = "muted" }: ToolCallSpec) {
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
          className={`mt-0.5 pl-[14px] text-xs ${
            success ? "text-emerald-300/90" : "text-zinc-500"
          }`}
        >
          <span className={success ? "text-emerald-500/60" : "text-zinc-700"}>└ </span>
          {result}
        </p>
      ) : null}
    </div>
  );
}

function ToolGroup({ calls, onDone }: { calls: readonly ToolCallSpec[]; onDone?: () => void }) {
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

function TimedReveal({ children, onDone }: { children: ReactNode; onDone?: () => void }) {
  const notifyDone = useFireOnce(onDone);
  useEffect(() => {
    const timer = window.setTimeout(notifyDone, STATIC_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [notifyDone]);
  return <>{children}</>;
}

const DINNER_SCENARIO: ChatItem[] = [
  {
    role: "user",
    id: "dinner-question",
    delay: 600,
    text: "What should I make for dinner? Long day, low energy.",
  },
  {
    role: "tool",
    id: "dinner-tools",
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
        result: "1790 kcal · 134P / 179C / 60F",
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
    id: "dinner-answer",
    delay: 1150,
    typing: true,
    segments: [
      {
        kind: "text",
        text: "You have 610 kcal left — 46g protein, 61g carbs, 20g fat. All three of these fit, and you’ve cooked every one of them before:",
      },
      {
        kind: "block",
        node: (
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
        ),
      },
      {
        kind: "text",
        className: "border-t border-white/5 pt-3 text-xs text-zinc-500",
        text: "Pick one and I’ll log it for tonight.",
      },
      {
        kind: "block",
        node: (
          <p className="flex items-center gap-1.5 border-t border-white/5 pt-3 text-xs text-emerald-400/90">
            <CheckIcon className="size-3.5 shrink-0" />
            Every suggestion comes from meals already in your log
          </p>
        ),
      },
    ],
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
        ),
      },
      {
        kind: "text",
        className: "text-xs text-zinc-500",
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
              <div key={row.day} className="flex items-baseline justify-between gap-3">
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
        className: "border-t border-white/5 pt-3 text-xs text-zinc-500",
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

function renderChatItem(item: ChatItem, index: number, onDone: (index: number) => void) {
  switch (item.role) {
    case "user":
      return <UserLine text={item.text} onDone={() => onDone(index)} />;
    case "tool":
      return <ToolGroup calls={item.calls} onDone={() => onDone(index)} />;
    case "assistant":
      return <AssistantText segments={item.segments} onDone={() => onDone(index)} />;
    case "note":
      return <TimedReveal onDone={() => onDone(index)}>{item.node}</TimedReveal>;
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
    const delay =
      upcoming.delay ?? (shownCount === 0 ? FIRST_ITEM_FALLBACK_MS : DEFAULT_GAP_MS);
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
