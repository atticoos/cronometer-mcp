import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { productionUrl, siteName } from "./site";

const buildBranch = process.env.WORKERS_CI_BRANCH;
const isPreview = Boolean(buildBranch && buildBranch !== "main");
const title = `${siteName} — Connect Cronometer to ChatGPT and Claude`;
const description =
  "Connect Cronometer to ChatGPT, Claude, Cursor, and other MCP clients. Review nutrition, track macros, and log food with this open-source connector.";

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
    <html lang="en">
      <head>
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
