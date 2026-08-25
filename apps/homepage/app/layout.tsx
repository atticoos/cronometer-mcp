import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const title = "Cronometer MCP — Let AI tailor your macros";
const socialDescription =
  "Open-source tools that turn what you logged and what remains into your next meal, custom foods, and a macro plan built around your goals.";

export const metadata: Metadata = {
  metadataBase: new URL("https://cronometer-mcp.dev"),
  title,
  description:
    "An open-source Cronometer MCP connector that helps AI decide what to eat next, create custom foods, and plan macros around your goals.",
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    url: "/",
    title,
    description: socialDescription,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: socialDescription,
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
      <body>{children}</body>
    </html>
  );
}
