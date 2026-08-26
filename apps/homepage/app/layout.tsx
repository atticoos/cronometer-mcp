import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";
import { builtPreviewPrNumber } from "./preview-pr";

const productionUrl = new URL("https://cronometer-mcp.dev");
const title = "Cronometer MCP — Talk to your Cronometer data from your AI assistant";
const socialDescription =
  "The open-source connector that lets ChatGPT, Claude, Cursor, and other AI assistants use your food log, nutrition, biometrics, and fasting history—in plain language.";

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim();
}

function previewPrNumber(host: string | null | undefined) {
  return /^pr-(\d+)\./i.exec(host ?? "")?.[1];
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

  const prNumber = builtPreviewPrNumber ?? previewPrNumber(host);
  const pageTitle = prNumber ? `${title} (PR #${prNumber})` : title;

  return {
    metadataBase,
    title: pageTitle,
    description:
      "An open-source Cronometer MCP connector that lets AI assistants read and write your food log, nutrition, biometrics, and fasting history in plain language.",
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
