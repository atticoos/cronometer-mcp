import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import CtaLink from "../components/cta-link";
import EndpointCopy from "../components/endpoint-copy";
import JsonLd from "../components/json-ld";
import { ArrowRightIcon } from "../components/icons";
import { mcpEndpoint, productionUrl, setupClientNames, setupPaths, siteName } from "../site";

type Client = keyof typeof setupPaths;

const linkClass = "text-emerald-300 underline decoration-emerald-300/40 underline-offset-4 hover:decoration-emerald-300";

export function setupMetadata(client: Client, description: string): Metadata {
  const title = `Connect Cronometer to ${setupClientNames[client]} | ${siteName}`;
  const url = new URL(setupPaths[client], productionUrl);
  const image = {
    url: new URL("/opengraph-image", productionUrl),
    alt: "Cronometer MCP connects your food diary and nutrition data to AI assistants",
    width: 1200,
    height: 630,
  };

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName, title, description, url, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

// Links out to the client app or its docs, tracked as conversion intent.
export function GuideLink({
  href,
  client,
  cta = "open_client",
  children,
}: {
  href: string;
  client: Client;
  cta?: "open_client" | "open_client_docs";
  children: ReactNode;
}) {
  return (
    <CtaLink cta={cta} placement="setup" client={client} href={href} className={linkClass}>
      {children}
    </CtaLink>
  );
}

export function GuideSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-4 border-t border-white/10 pt-8">
      <h2 id={id} className="text-2xl font-semibold tracking-tight text-white">{title}</h2>
      {children}
    </section>
  );
}

export function SignInStep() {
  return (
    <>
      On the Cronometer MCP authorization page, review the requested access and enter your
      Cronometer username or email, password, and current one-time code if enabled. Select{" "}
      <strong>Sign in and allow</strong> to return to your client. The connector can read
      and change diary data once authorized. Enter your credentials in the authorization
      form on <code className="break-all">mcp.cronometer-mcp.dev</code>.
    </>
  );
}

export default function SetupGuide({
  client,
  intro,
  beforeYouStart,
  steps,
  troubleshooting,
  docs,
}: {
  client: Client;
  intro: string;
  beforeYouStart: ReactNode;
  steps: ReactNode;
  troubleshooting: ReactNode;
  docs: string;
}) {
  const name = setupClientNames[client];
  const otherClient = client === "chatgpt" ? "claude" : "chatgpt";
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: siteName, item: productionUrl.href },
      {
        "@type": "ListItem",
        position: 2,
        name: `Connect Cronometer to ${name}`,
        item: new URL(setupPaths[client], productionUrl).href,
      },
    ],
  };

  return (
    <main className="mx-auto max-w-3xl px-6 pt-12 pb-16 font-sans sm:pt-16">
      <JsonLd data={breadcrumbs} />
      <article className="space-y-10 text-base leading-relaxed text-zinc-300">
        <header>
          <h1 className="text-4xl font-bold tracking-tight text-balance text-white sm:text-5xl">
            Connect Cronometer to {name}
          </h1>
          <p className="mt-4 text-lg text-zinc-400">{intro}</p>
        </header>

        <GuideSection id="before-you-start" title="Before you start">
          {beforeYouStart}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-sm font-medium text-white">MCP server URL</p>
            <EndpointCopy url={mcpEndpoint} placement="setup" client={client} />
          </div>
        </GuideSection>

        <GuideSection id="connect" title={`Set up Cronometer in ${name}`}>
          <ol className="list-decimal space-y-3 pl-6 marker:font-semibold marker:text-emerald-300 [&>li]:pl-1">
            {steps}
          </ol>
          <figure className="space-y-2">
            <Image
              src="/setup/cronometer-sign-in.webp"
              alt="Cronometer MCP authorization form showing the requested permissions, login fields, and Sign in and allow button"
              width={1120}
              height={1600}
              unoptimized
              className="h-auto w-full max-w-md rounded-xl"
            />
            <figcaption className="text-sm text-zinc-400">
              The Cronometer MCP sign-in screen that opens during authorization.
            </figcaption>
          </figure>
        </GuideSection>

        <GuideSection id="check-connection" title="Run a read-only connection check">
          <p>With Cronometer enabled in your chat, send this prompt:</p>
          <blockquote className="rounded-xl border border-emerald-300/20 bg-emerald-400/5 px-4 py-3 text-emerald-100">
            Use the Cronometer connector to show me today’s food diary. Only use the get_food_log tool.
          </blockquote>
          <p>
            Look for a successful <code className="font-mono text-sm text-emerald-300">get_food_log</code>{" "}
            call and compare the entries with your Cronometer diary. An empty diary is a valid result
            if you haven’t logged anything today. The check reads your diary without changing it.
          </p>
        </GuideSection>

        <GuideSection id="troubleshooting" title="Troubleshooting">
          <ul className="list-disc space-y-3 pl-6 marker:text-emerald-300 [&>li]:pl-1">
            {troubleshooting}
            <li>
              <strong>The sign-in page doesn’t open.</strong> Check that the URL includes{" "}
              <code className="font-mono text-sm">/mcp</code>, allow the authorization window if
              your browser blocked it, and retry from your client.
            </li>
            <li>
              <strong>Your Cronometer session expired.</strong> Follow the reconnect prompt and sign
              in again. If the prompt is missing, disconnect and reconnect Cronometer in your client.
            </li>
          </ul>
          <p>
            <GuideLink href={docs} client={client} cta="open_client_docs">
              {name}’s official setup documentation
            </GuideLink>
          </p>
        </GuideSection>
      </article>

      <nav aria-label="Other setup guides" className="mt-10 border-t border-white/10 pt-6">
        <CtaLink
          cta="open_setup_guide"
          placement="setup_nav"
          client={otherClient}
          href={setupPaths[otherClient]}
          className={`inline-flex items-center gap-2 text-sm font-semibold ${linkClass}`}
        >
          {setupClientNames[otherClient]} setup guide <ArrowRightIcon className="size-3.5" />
        </CtaLink>
      </nav>
    </main>
  );
}
