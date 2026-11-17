"use client";

import { officialPluginBannerKey, officialPluginUrl } from "../site";
import CtaLink from "./cta-link";

// Visibility is decided before paint by the inline script in the root layout, which sets
// data-official-banner="dismissed" on <html> when the visitor closed this banner before.
// Server HTML always includes the banner, so a visitor without storage still sees it.
export default function OfficialPluginBanner() {
  function dismiss() {
    document.documentElement.dataset.officialBanner = "dismissed";
    try {
      window.localStorage.setItem(officialPluginBannerKey, "1");
    } catch {
      // Storage can be blocked; the banner stays hidden until the next page load.
    }
  }

  return (
    <aside
      aria-label="Announcement"
      className="official-banner relative border-b border-emerald-400/20 bg-gradient-to-r from-emerald-950 via-emerald-900/70 to-emerald-950 text-emerald-50"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 py-2.5 pr-12 pl-6 text-center text-xs sm:text-sm">
        <span className="hidden shrink-0 rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-950 uppercase sm:inline">
          New
        </span>
        <p className="text-pretty">
          <span className="block font-semibold text-white sm:inline">Cronometer launched an official ChatGPT plugin.</span>{" "}
          <span className="mt-0.5 inline-block text-emerald-100/70 sm:mt-0 sm:inline">
            <span className="sm:hidden">Read-only &middot; Daily totals &middot; Gold only</span>
            <span className="hidden sm:inline">
              It&rsquo;s read-only, works with daily totals, and needs Cronometer Gold.
            </span>
          </span>{" "}
          <CtaLink
            cta="open_official_plugin"
            placement="banner"
            href={officialPluginUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold whitespace-nowrap text-emerald-300 underline decoration-emerald-300/40 underline-offset-4 hover:decoration-emerald-300"
          >
            <span className="sm:hidden">Try it</span>
            <span className="hidden sm:inline">Try the official plugin</span> <span aria-hidden="true">&rarr;</span>
          </CtaLink>
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="absolute top-1/2 right-3 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-emerald-200/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-3.5">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </button>
    </aside>
  );
}
