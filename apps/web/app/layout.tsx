import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { officialPluginBannerKey, productionUrl, siteName } from "./site";

const buildBranch = process.env.WORKERS_CI_BRANCH;
const isPreview = Boolean(buildBranch && buildBranch !== "main");
const title = `${siteName} — Connect Cronometer to ChatGPT and Claude`;
// Runs before paint so a dismissed announcement banner never flashes on load.
const bannerScript = `try{if(localStorage.getItem(${JSON.stringify(officialPluginBannerKey)}))document.documentElement.dataset.officialBanner="dismissed"}catch(e){}`;
const description =
  "Cronometer MCP is an open-source MCP server that connects Cronometer to ChatGPT, Claude, Cursor, and other AI assistants. Review nutrition, track macros, and log food in chat.";

export const metadata: Metadata = {
  metadataBase: productionUrl,
  title: isPreview ? `${title} (Preview)` : title,
  description,
  robots: isPreview ? { index: false, follow: false } : undefined,
  alternates: { canonical: productionUrl },
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    url: productionUrl,
    siteName,
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static script built from a constant key */}
        <script dangerouslySetInnerHTML={{ __html: bannerScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        {isPreview ? null : (
          <script
            defer
            src="https://cloud.umami.is/script.js"
            data-website-id="7f1183e1-c529-4af1-96b7-4006ecc13ce0"
          />
        )}
      </body>
    </html>
  );
}
