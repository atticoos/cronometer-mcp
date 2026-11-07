import type { Metadata } from "next";
import type { ReactNode } from "react";
import SiteHeader from "../components/site-header";
import { githubUrl, privacyPath, productionUrl, siteName } from "../site";

const EFFECTIVE_DATE = "November 7, 2026";
const issuesUrl = `${githubUrl}/issues`;
const linkClass = "text-emerald-300 underline decoration-emerald-300/40 underline-offset-4 hover:decoration-emerald-300";

const title = `Privacy policy | ${siteName}`;
const description =
  "What Cronometer MCP collects when you connect Cronometer to an AI assistant, what it stores, who it shares data with, and how to disconnect.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: new URL(privacyPath, productionUrl) },
  openGraph: { type: "website", siteName, title, description, url: new URL(privacyPath, productionUrl) },
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4 border-t border-white/10 pt-8">
      <h2 id={id} className="text-2xl font-semibold tracking-tight text-white">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http");
  return (
    <a href={href} className={linkClass} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      {children}
    </a>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-3 pl-6 marker:text-emerald-300 [&>li]:pl-1">{children}</ul>;
}

function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-sm text-emerald-300">{children}</code>;
}

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 pt-12 pb-16 font-sans sm:pt-16">
        <article className="space-y-10 text-base leading-relaxed text-zinc-300">
          <header>
            <h1 className="text-4xl font-bold tracking-tight text-balance text-white sm:text-5xl">Privacy policy</h1>
            <p className="mt-4 text-lg text-zinc-400">
              Cronometer MCP is an independent, open-source connector that lets AI assistants such as ChatGPT and
              Claude read and update your Cronometer account. This page explains what the hosted service at{" "}
              <Code>mcp.cronometer-mcp.dev</Code> and this website at <Code>cronometer-mcp.dev</Code> collect, store,
              and share. Because the code is <Link href={githubUrl}>open source</Link>, you can check every statement
              here against what actually runs.
            </p>
            <p className="mt-4 text-sm text-zinc-500">Effective {EFFECTIVE_DATE}</p>
          </header>

          <Section id="summary" title="The short version">
            <List>
              <li>Your Cronometer password and one-time code are used once to sign in and are never stored or logged.</li>
              <li>
                The service keeps your Cronometer username and the Cronometer sessions it gets at sign-in, encrypted,
                inside your OAuth grant so your assistant can keep working without asking you to sign in again.
              </li>
              <li>
                Your food log, nutrition, biometrics, and fasting data pass through the service on their way to your
                assistant. They are not saved, cached, or used for anything else.
              </li>
              <li>We do not sell your data, show ads, or use your data to train models.</li>
              <li>
                Cronometer MCP is not affiliated with or endorsed by Cronometer. It is maintained independently.
              </li>
            </List>
          </Section>

          <Section id="sign-in" title="When you connect your account">
            <p>
              To connect, your assistant opens the Cronometer MCP authorization page. There you enter your Cronometer
              username or email, your password, and a one-time code if you use two-factor authentication.
            </p>
            <List>
              <li>
                <strong>Password and one-time code.</strong> These are sent straight to Cronometer to create a web
                session and a mobile app session. They are held in memory only for that request and are never written
                to storage, logs, error reports, or tokens.
              </li>
              <li>
                <strong>Username and sessions.</strong> Your Cronometer username, your Cronometer user ID, and the two
                Cronometer session credentials are stored in your OAuth grant in Cloudflare Workers KV. The grant&apos;s
                contents are encrypted with AES-GCM using key material wrapped by your assistant&apos;s token, so the
                stored record cannot be read without a valid token.
              </li>
              <li>
                <strong>Account identifier.</strong> The grant is indexed by a one-way SHA-256 hash of your Cronometer
                user ID. That hash is stored unencrypted so a grant can be found and revoked.
              </li>
              <li>
                <strong>Pending sign-ins.</strong> While the authorization page is open, a short-lived record holds the
                OAuth request, the requesting app&apos;s name, a hashed security token, and a count of failed attempts.
                It is deleted when you finish or cancel, and expires on its own after 10 minutes.
              </li>
              <li>
                <strong>Cookie.</strong> The authorization page sets one strictly necessary cookie,{" "}
                <Code>__Host-CRONOMETER_CSRF</Code>, to protect the form. It expires after 10 minutes and is cleared
                when you finish.
              </li>
              <li>
                <strong>Assistant registration.</strong> When an assistant registers itself as an OAuth client, the
                service stores the metadata it provides, such as its name and redirect URLs. That record expires after
                90 days.
              </li>
            </List>
          </Section>

          <Section id="usage" title="When your assistant uses the connector">
            <p>
              Each time your assistant calls a tool, such as <Code>get_food_log</Code> or{" "}
              <Code>add_food_entry</Code>, the service uses your stored session to make that request to Cronometer and
              returns the result to your assistant. Your nutrition and health data are processed only to answer that
              request. They are not written to storage, and their values are not recorded in logs, traces, or error
              reports.
            </p>
            <p>
              Write tools change your Cronometer account only when your assistant calls them, and your assistant is
              responsible for asking you before it does. What your assistant does with the data it receives is governed
              by your assistant provider&apos;s own privacy policy, such as OpenAI&apos;s or Anthropic&apos;s.
            </p>
          </Section>

          <Section id="operations" title="Logs, traces, and error reports">
            <p>To keep the service running, it records limited operational data:</p>
            <List>
              <li>
                <strong>Request logs.</strong> Cloudflare Workers logs record request metadata, such as the URL, method,
                status, timing, and network information Cloudflare provides.
              </li>
              <li>
                <strong>Traces.</strong> Performance traces are sent to Grafana Cloud. They include the request URL and
                user agent, the URLs of requests made to Cronometer, the type of each stored record that is read or
                written, the name of each tool called, the names of the arguments it received (never their values),
                and whether it succeeded. Query parameter values and storage keys, which can hold one-time codes and
                account identifiers, are removed before traces leave the service. Each tool call is also recorded in
                Grafana Cloud as a usage log entry with the same tool name, argument names, outcome, and how long it
                took.
              </li>
              <li>
                <strong>Pseudonymous user ID.</strong> Each tool call&apos;s trace and usage log entry carry a pseudonymous ID so usage and
                errors can be counted per account. It is derived from your Cronometer user ID with a keyed hash
                (HMAC-SHA-256) whose key is kept secret, so it cannot be traced back to your account without that key.
                It differs from the account identifier used to index your grant, and it never includes your username
                or email.
              </li>
              <li>
                <strong>Error reports.</strong> Unexpected errors are sent to Sentry. Before anything leaves the
                service, each report is reduced to the error type, a generic message, a stack trace of our code, and
                the name of the tool or step that failed. Messages, request data, headers, cookies, user information,
                and breadcrumbs are removed because they could contain credentials or health data.
              </li>
            </List>
          </Section>

          <Section id="website" title="This website">
            <p>
              The <Code>cronometer-mcp.dev</Code> website is a static site. It uses{" "}
              <Link href="https://umami.is/privacy">Umami</Link>, a privacy-focused analytics service that does not
              use cookies, to count page views and clicks on buttons such as &ldquo;Connect Cronometer&rdquo;. It loads
              fonts from Google Fonts, which means your browser requests them from Google. The website does not ask for
              or receive your Cronometer credentials.
            </p>
          </Section>

          <Section id="sharing" title="Who we share data with">
            <p>We share data only with the services needed to run the connector:</p>
            <List>
              <li>
                <strong>Cronometer</strong>, which receives your credentials at sign-in and your tool requests, to
                provide the data you asked for.
              </li>
              <li>
                <strong>Your AI assistant</strong> (for example ChatGPT or Claude), which receives the results of the
                tools it calls.
              </li>
              <li>
                <strong>Cloudflare</strong>, which hosts the service and website and stores OAuth grants.
              </li>
              <li>
                <strong>Grafana Cloud</strong> and <strong>Sentry</strong>, which receive the limited operational data
                described above.
              </li>
              <li>
                <strong>Umami</strong> and <strong>Google Fonts</strong>, for the website only.
              </li>
            </List>
            <p>
              We do not sell or rent personal data, and we do not share it for advertising. We may disclose information
              if required by law.
            </p>
          </Section>

          <Section id="retention" title="How long data is kept">
            <List>
              <li>Pending sign-in records and the security cookie: up to 10 minutes.</li>
              <li>Access tokens: 1 hour.</li>
              <li>
                OAuth grants, including your username and Cronometer sessions: until the refresh token expires after 30
                days without being refreshed, or until the grant is revoked, whichever comes first. A grant is also
                revoked automatically when Cronometer rejects its sessions and you are asked to sign in again.
              </li>
              <li>Assistant registrations: 90 days.</li>
              <li>Logs, traces, and error reports: according to the retention settings of Cloudflare, Grafana Cloud, and Sentry.</li>
            </List>
          </Section>

          <Section id="choices" title="Disconnecting and your choices">
            <List>
              <li>
                Remove or disconnect Cronometer in your assistant&apos;s connector settings to stop it from using the
                service.
              </li>
              <li>
                If Cronometer offers a way to sign out of other sessions, using it, or changing your Cronometer
                password, can end the sessions the service holds. You will then be asked to sign in again.
              </li>
              <li>
                To ask that we delete your grant, or for a copy of what we hold about you, contact us as described
                below.
              </li>
            </List>
            <p>
              If you run the open-source package yourself instead of using the hosted service, your credentials and
              data stay on your own machine and this policy does not apply.
            </p>
          </Section>

          <Section id="security" title="Security">
            <p>
              Data is sent over HTTPS. Grant contents are encrypted at rest, the authorization page is protected
              against cross-site request forgery and framing, and repeated failed sign-ins are limited. No system is
              perfectly secure, but the code is public so these protections can be reviewed.
            </p>
          </Section>

          <Section id="children" title="Children">
            <p>The service is not directed to children under 13, and we do not knowingly collect their information.</p>
          </Section>

          <Section id="changes" title="Changes to this policy">
            <p>
              When this policy changes, the updated version is published on this page with a new effective date. Its
              full history is available in the <Link href={githubUrl}>GitHub repository</Link>.
            </p>
          </Section>

          <Section id="contact" title="Contact">
            <p>
              Questions or requests about this policy can be sent through{" "}
              <Link href={issuesUrl}>GitHub issues</Link>. Please do not include your password or health data in a
              public issue.
            </p>
          </Section>
        </article>
      </main>
    </>
  );
}
