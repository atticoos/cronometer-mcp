import SetupGuide, { GuideLink, SignInStep, setupMetadata } from "../setup-guide";

const docs = "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp";

export const metadata = setupMetadata(
  "claude",
  "Add Cronometer to Claude on the web or desktop as a remote MCP connector. Sign in with OAuth, check your food diary, and troubleshoot setup.",
);

export default function ClaudeSetupPage() {
  return (
    <SetupGuide
      client="claude"
      intro="Add Cronometer MCP as a remote connector in Claude on the web or in Claude Desktop. Once connected, you can ask Claude about your food diary."
      beforeYouStart={
        <>
          <p>
            Have your Cronometer login and, if enabled, your one-time code ready. Claude Free
            allows one custom connector.
          </p>
          <p>
            On Team and Enterprise, someone with connector management permission must add
            Cronometer under <strong>Organization settings → Connectors</strong>. If it’s
            already available, select <strong>Connect</strong> in your own connector list
            and skip to step 4.
          </p>
        </>
      }
      steps={
        <>
          <li>
            Open <strong>Customize</strong>, then <strong>Connectors</strong> in{" "}
            <GuideLink href="https://claude.ai/" client="claude">Claude</GuideLink>. Select{" "}
            <strong>Add → Custom → Web</strong>. On some accounts the menu item is called{" "}
            <strong>Add custom connector</strong>.
          </li>
          <li>
            Name it <strong>Cronometer</strong>, paste the MCP server URL above, and
            continue to the authentication settings.
          </li>
          <li>
            Select <strong>Sign in now</strong>. If asked how Claude should register its
            OAuth client, choose <strong>Register automatically</strong>. Leave request
            headers empty and add the connector.
          </li>
          <li><SignInStep /></li>
          <li>
            In a chat, open the <strong>+</strong> menu, choose <strong>Connectors</strong>,
            and enable Cronometer for that conversation.
          </li>
        </>
      }
      troubleshooting={
        <>
          <li>
            <strong>You can’t add another connector.</strong> Check whether your Free account
            already has a custom connector. On Team or Enterprise, check with the person who
            manages your organization’s connectors.
          </li>
          <li>
            <strong>Claude doesn’t use Cronometer.</strong> Check that Cronometer shows as
            connected in Customize and is enabled in the current conversation’s Connectors menu.
          </li>
        </>
      }
      docs={docs}
    />
  );
}
