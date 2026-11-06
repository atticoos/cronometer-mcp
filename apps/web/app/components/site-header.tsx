import { githubUrl } from "../site";
import CtaLink from "./cta-link";
import { GitHubIcon, LeafIcon } from "./icons";

const NAV_LINKS = [
  { label: "Use cases", href: "#use-cases" },
  { label: "Capabilities", href: "#capabilities" },
  { label: "Setup", href: "#setup" },
  { label: "FAQ", href: "#faq" },
];

export default function SiteHeader({ onHomePage = false }: { onHomePage?: boolean }) {
  const homePrefix = onHomePage ? "" : "/";

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#060a08]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href={onHomePage ? "#top" : "/"} aria-label="Cronometer MCP home" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
            <LeafIcon className="size-[18px]" />
          </span>
          <span className="hidden font-mono text-sm font-semibold text-white sm:inline">
            cronometer<span className="text-emerald-400">-mcp</span>
          </span>
        </a>
        <nav aria-label="Main navigation" className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={homePrefix + link.href}
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <CtaLink
            cta="view_github"
            placement="header"
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="View Cronometer MCP on GitHub"
            className="flex size-9 items-center justify-center rounded-full border border-white/10 text-zinc-400 transition-colors hover:border-white/25 hover:text-white"
          >
            <GitHubIcon className="size-[18px]" />
          </CtaLink>
          <CtaLink
            cta="connect_cronometer"
            placement="header"
            href={homePrefix + "#setup"}
            className="rounded-full bg-emerald-500 px-3 py-2 text-xs font-semibold text-emerald-950 transition-colors hover:bg-emerald-400 sm:px-4 sm:text-sm"
          >
            Connect Cronometer
          </CtaLink>
        </div>
      </div>
    </header>
  );
}
