"use client";

import type { ComponentProps } from "react";
import { trackCta, type CtaName, type CtaPlacement } from "../cta-analytics";

export default function CtaLink({
  cta,
  placement,
  client,
  href,
  children,
  ...props
}: ComponentProps<"a"> & {
  cta: CtaName;
  placement: CtaPlacement;
  client?: string;
  href: string;
}) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) trackCta(cta, placement, { client });
      }}
    >
      {children}
    </a>
  );
}
