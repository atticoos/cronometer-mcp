import type { FC } from "hono/jsx";
import { AlertIcon, ChevronIcon, ClientMark, LeafIcon, LockIcon, GroupIcon, XIcon } from "./icons";
import { PERMISSION_GROUPS } from "./permissions";
import { CONSENT_CSS } from "./styles";

export interface ConsentPageProps {
  clientName: string;
  csrfToken: string;
  flowId: string;
  redirectUri: string;
  /** Minutes left before the pending authorization expires. */
  expiresInMinutes: number;
  error?: { message: string; needsCode: boolean };
  /** Username from a failed attempt, so people only retype the password. */
  username?: string;
}

/** Host the client will send people back to, e.g. `claude.ai`. */
export function returnTarget(redirectUri: string): string {
  try {
    const url = new URL(redirectUri);
    return url.host || url.protocol.replace(/:$/, "");
  } catch {
    return redirectUri;
  }
}

const ConsentPage: FC<ConsentPageProps> = (props) => {
  const { clientName, error } = props;
  const returnsTo = returnTarget(props.redirectUri);

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <meta name="color-scheme" content="light dark" />
        <title>{`Connect ${clientName} to Cronometer`}</title>
        <style dangerouslySetInnerHTML={{ __html: CONSENT_CSS }} />
      </head>
      <body>
        <main class="card">
          <header class="head">
            <div class="link" aria-hidden="true">
              <ClientMark clientName={clientName} />
              <div class="dots">
                <i />
                <i />
                <i />
              </div>
              <div class="mark server">
                <LeafIcon />
              </div>
            </div>
            <div class="head-text">
              <h1>{clientName} wants to access your Cronometer account</h1>
              <div class="meta">
                <span>Connecting through Cronometer MCP</span>
                <span aria-hidden="true">·</span>
                <span>
                  returns to <code>{returnsTo}</code>
                </span>
              </div>
            </div>
          </header>

          <div class="cols">
            <section class="left" aria-labelledby="perm-label">
              <p class="label" id="perm-label">
                This will allow {clientName} to
              </p>
              <ul class="perms">
                {PERMISSION_GROUPS.map((group, index) => (
                  <li>
                    <details class={`perm risk-${group.risk}`} open={index === 0}>
                      <summary>
                        <span class="ico">
                          <GroupIcon group={group.id} />
                        </span>
                        <span>
                          <strong>{group.title}</strong>
                          <small>{group.summary}</small>
                        </span>
                        <ChevronIcon />
                      </summary>
                      <ul class="tools">
                        {group.tools.map((tool) => (
                          <li>
                            {tool.description} <code>{tool.name}</code>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            </section>

            <div class="right">
              <section aria-labelledby="signin-label">
                <p class="label" id="signin-label">
                  Sign in to Cronometer to continue
                </p>
                <form method="post" action="/authorize">
                  <input type="hidden" name="flow_id" value={props.flowId} />
                  <input type="hidden" name="csrf_token" value={props.csrfToken} />
                  {error ? (
                    <p class="error" role="alert">
                      <AlertIcon />
                      <span>{error.message}</span>
                    </p>
                  ) : null}
                  <div class="field">
                    <label for="username">Email or username</label>
                    <input
                      id="username"
                      name="username"
                      autocomplete="username"
                      maxlength={320}
                      value={props.username ?? ""}
                      required
                    />
                  </div>
                  <div class="field">
                    <label for="password">Password</label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autocomplete="current-password"
                      maxlength={1024}
                      required
                    />
                  </div>
                  <details class={error?.needsCode ? "otc required" : "otc"} open={error?.needsCode ?? false}>
                    <summary>
                      <span class="plus" aria-hidden="true">
                        +
                      </span>
                      <span>{error?.needsCode ? "One-time code required" : "I use two-factor authentication"}</span>
                    </summary>
                    <div class="field">
                      <label for="user_code">
                        One-time code <span>from your authenticator app</span>
                      </label>
                      <input
                        id="user_code"
                        name="user_code"
                        autocomplete="one-time-code"
                        inputmode="numeric"
                        maxlength={64}
                        placeholder="000000"
                      />
                    </div>
                  </details>
                  <div class="actions">
                    <button type="submit" class="btn" name="action" value="deny" formnovalidate>
                      Cancel
                    </button>
                    <button type="submit" class="btn primary" name="action" value="allow">
                      Allow access
                    </button>
                  </div>
                  <p class="return">
                    You'll be sent back to <b>{returnsTo}</b> after you choose.
                  </p>
                </form>
              </section>

              <ul class="facts">
                <li>
                  <LockIcon />
                  <span>
                    Your password is used once to sign in to Cronometer and is <b>never stored</b>.
                  </span>
                </li>
                <li>
                  <XIcon />
                  <span>
                    {clientName} can't change your password, targets or account settings. You can
                    disconnect at any time.
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <footer class="foot">
            <span>Unofficial integration, not affiliated with Cronometer.</span>
            <span>This request expires in {props.expiresInMinutes} minutes.</span>
          </footer>
        </main>
      </body>
    </html>
  );
};

export function renderConsentPage(props: ConsentPageProps): string {
  return `<!doctype html>${(<ConsentPage {...props} />).toString()}`;
}
