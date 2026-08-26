"use client";

import { useState } from "react";
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

function DinnerScenario() {
  return (
    <>
      <div className="rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/5">
        <p className="text-sky-300">you ›</p>
        <p className="mt-0.5 text-zinc-300">
          What should I make for dinner? Long day, low energy.
        </p>
      </div>
      <p className="px-1 text-[11px] leading-relaxed text-zinc-600">
        cronometer-mcp · checking today’s remaining macros and dinners you’ve logged before
      </p>
      <div className="rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/5">
        <p className="text-emerald-300">assistant ›</p>
        <p className="mt-0.5 text-zinc-300">
          You have 610 kcal left — 48 g protein, 52 g carbs, 22 g fat. All three of these fit, and
          you’ve cooked every one of them before:
        </p>
        <div className="mt-3 space-y-3 border-t border-white/5 pt-3 text-xs">
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
        <p className="mt-3 border-t border-white/5 pt-3 text-xs text-zinc-400">
          Pick one and I’ll log it for tonight.
        </p>
        <p className="mt-3 flex items-center gap-1.5 border-t border-white/5 pt-3 text-xs text-emerald-400">
          <CheckIcon className="size-3.5 shrink-0" />
          Every suggestion comes from meals already in your log
        </p>
      </div>
    </>
  );
}

function MacroPlanScenario() {
  return (
    <>
      <div className="rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/5">
        <p className="text-sky-300">you ›</p>
        <p className="mt-0.5 text-zinc-300">I want to start losing weight. Can you set my macros?</p>
      </div>
      <p className="px-1 text-[11px] leading-relaxed text-zinc-600">
        apple-health · height, weight, and four weeks of energy burn & workouts
      </p>
      <p className="-mt-2 px-1 text-[11px] leading-relaxed text-zinc-600">
        cronometer-mcp · current targets and every logged day last month
      </p>
      <div className="rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/5">
        <p className="text-emerald-300">assistant ›</p>
        <p className="mt-0.5 text-zinc-300">
          You’ve eaten about 2,480 kcal a day against roughly 2,580 burned, so your weight has held
          steady. Dropping to 1,900 puts you near half a kilo down per week without touching your
          training days.
        </p>
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-amber-200">Proposed macro targets</p>
            <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
              review
            </span>
          </div>
          <p className="mt-2 font-mono text-sm text-zinc-100">1,900 kcal · 155P / 180C / 62F</p>
          <p className="mt-1.5 text-zinc-400">
            Protein anchored near 1.8 g per kg · extra carbs land on training days
          </p>
        </div>
        <p className="mt-3 text-zinc-400">Want me to make these your targets in Cronometer?</p>
      </div>
      <div className="rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/5">
        <p className="text-sky-300">you ›</p>
        <p className="mt-0.5 text-zinc-300">Yes — do it.</p>
      </div>
      <p className="flex items-center gap-1.5 px-1 text-xs text-emerald-400">
        <CheckIcon className="size-3.5 shrink-0" />
        Cronometer updated · 1,900 kcal · 155P / 180C / 62F
      </p>
      <p className="flex items-center gap-1.5 px-1 pb-1 text-[11px] text-zinc-500">
        <CheckIcon className="size-3 shrink-0 text-emerald-500" />
        Built from your Apple Health activity and a full month of logged meals
      </p>
    </>
  );
}

const TABS = [
  { id: "dinner", label: "Dinner tonight", title: "chatgpt · tuesday, 6:47 pm", body: DinnerScenario },
  { id: "macros", label: "Macro plan", title: "claude · sunday morning", body: MacroPlanScenario },
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
        <div className="space-y-4 p-5 font-mono text-[13px] leading-relaxed">
          <active.body />
        </div>
      </div>
    </div>
  );
}
