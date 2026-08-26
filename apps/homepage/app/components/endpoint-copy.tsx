"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

const COPIED_RESET_MS = 2000;

export default function EndpointCopy({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return;
    }
    setCopied(true);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }

  return (
    <span className="relative mt-2 inline-block max-w-full align-top">
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${url} to clipboard`}
        className="group inline-flex max-w-full items-start gap-2 rounded-md py-0.5 text-left font-mono text-xs text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:ring-1 focus-visible:ring-emerald-500/50 focus-visible:outline-none"
      >
        <span className="mt-px shrink-0">
          {copied ? (
            <CheckIcon className="size-3.5 text-emerald-400" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
        </span>
        <span className="break-all">{url}</span>
      </button>
      {copied ? (
        <span
          role="status"
          className="tooltip-pop pointer-events-none absolute bottom-full left-0 mb-1.5 inline-block rounded-md border border-white/10 bg-[#101713] px-2.5 py-1 font-mono text-[11px] font-medium whitespace-nowrap text-emerald-300 shadow-lg shadow-black/40"
        >
          Copied
        </span>
      ) : null}
    </span>
  );
}
