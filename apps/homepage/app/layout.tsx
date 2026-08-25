import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

const productionUrl = new URL("https://cronometer-mcp.dev");
const title = "Cronometer MCP — Let AI tailor your macros";
const socialDescription =
  "Open-source tools that turn what you logged and what remains into your next meal, custom foods, and a macro plan built around your goals.";

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim();
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = firstHeaderValue(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
  );
  const forwardedProtocol = firstHeaderValue(requestHeaders.get("x-forwarded-proto"));
  const protocol = forwardedProtocol === "http" ? "http" : "https";
  const metadataBase =
    host && /^[a-z0-9.-]+(?::\d+)?$/i.test(host)
      ? new URL(`${protocol}://${host}`)
      : productionUrl;

  return {
    metadataBase,
    title,
    description:
      "An open-source Cronometer MCP connector that helps AI decide what to eat next, create custom foods, and plan macros around your goals.",
    alternates: { canonical: productionUrl },
    icons: { icon: "/favicon.svg" },
    openGraph: {
      type: "website",
      url: productionUrl,
      title,
      description: socialDescription,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: socialDescription,
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
