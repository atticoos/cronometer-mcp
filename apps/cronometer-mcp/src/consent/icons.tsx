import type { Child, FC } from "hono/jsx";

const Svg: FC<{ children?: Child; strokeWidth?: number; class?: string }> = ({
  children,
  strokeWidth = 2,
  class: className,
}) => (
  <svg
    class={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

/** The leaf mark used on the landing page (apps/web/app/components/icons.tsx). */
export const LeafIcon: FC = () => (
  <Svg strokeWidth={1.8}>
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
  </Svg>
);

const ClaudeIcon: FC = () => (
  <Svg strokeWidth={1.8}>
    <path d="M12 2.5v19" />
    <path d="m16.75 3.77-9.5 16.46" />
    <path d="m20.23 7.25-16.46 9.5" />
    <path d="M2.5 12h19" />
    <path d="m3.77 7.25 16.46 9.5" />
    <path d="m7.25 3.77 9.5 16.46" />
  </Svg>
);

const OpenAIIcon: FC = () => (
  <Svg strokeWidth={1.8}>
    <rect x="7.5" y="4" width="9" height="16" rx="4.5" />
    <rect x="7.5" y="4" width="9" height="16" rx="4.5" transform="rotate(60 12 12)" />
    <rect x="7.5" y="4" width="9" height="16" rx="4.5" transform="rotate(120 12 12)" />
  </Svg>
);

const CursorIcon: FC = () => (
  <Svg strokeWidth={1.8}>
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </Svg>
);

const CLIENT_BRANDS: readonly { match: RegExp; brand: string; Icon: FC }[] = [
  { match: /claude/i, brand: "claude", Icon: ClaudeIcon },
  { match: /chatgpt|openai|codex/i, brand: "openai", Icon: OpenAIIcon },
  { match: /cursor/i, brand: "cursor", Icon: CursorIcon },
];

/** Known clients get the same icon the landing page uses; anything else gets its initial. */
export const ClientMark: FC<{ clientName: string }> = ({ clientName }) => {
  const known = CLIENT_BRANDS.find(({ match }) => match.test(clientName));
  if (known) {
    return (
      <div class={`mark client brand-${known.brand}`}>
        <known.Icon />
      </div>
    );
  }
  const initial = clientName.trim().charAt(0).toUpperCase() || "?";
  return <div class="mark client">{initial}</div>;
};

export const GroupIcon: FC<{ group: string }> = ({ group }) => {
  switch (group) {
    case "diary":
      return (
        <Svg>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </Svg>
      );
    case "health":
      return (
        <Svg>
          <path d="M3 12h4l3-8 4 16 3-8h4" />
        </Svg>
      );
    case "exports":
      return (
        <Svg>
          <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3" />
        </Svg>
      );
    case "log":
      return (
        <Svg>
          <path d="M4 20h4L19 9l-4-4L4 16v4z" />
        </Svg>
      );
    case "foods":
      return (
        <Svg>
          <path d="M12 5v14M5 12h14" />
        </Svg>
      );
    default:
      return (
        <Svg>
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
        </Svg>
      );
  }
};

export const ChevronIcon: FC = () => (
  <Svg class="chev">
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const LockIcon: FC = () => (
  <Svg strokeWidth={2.2}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);

export const XIcon: FC = () => (
  <Svg strokeWidth={2.2}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const AlertIcon: FC = () => (
  <Svg strokeWidth={2.2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16.5v.01" />
  </Svg>
);
