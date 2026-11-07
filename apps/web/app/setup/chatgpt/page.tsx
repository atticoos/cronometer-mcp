import SetupGuide, { GuideLink, SignInStep, setupMetadata } from "../setup-guide";

const docs = "https://developers.openai.com/api/docs/guides/custom-mcp-server";

export const metadata = setupMetadata(
  "chatgpt",
  "Connect Cronometer to ChatGPT on the web using a custom MCP plugin and OAuth. Read your food diary and troubleshoot connection or sign-in problems.",
);

export default function ChatGPTSetupPage() {
  return (
    <SetupGuide
      client="chatgpt"
      intro="Add Cronometer MCP as a custom plugin in ChatGPT, then ask about the food you’ve logged in Cronometer."
      beforeYouStart={
        <p>
          Use ChatGPT on the web with an account or workspace that allows custom MCP servers.
          Have your Cronometer login and, if enabled, your one-time code ready.
        </p>
      }
      steps={
        <>
          <li>
            Open <GuideLink href="https://chatgpt.com/plugins" client="chatgpt">ChatGPT Plugins</GuideLink>.
            Select the plus button, then <strong>Add custom MCP server</strong>.
          </li>
          <li>
            Name it <strong>Cronometer</strong>. Under <strong>Connection</strong>, paste the MCP
            server URL above. Choose <strong>OAuth</strong> and leave any optional client
            credentials blank. Use dynamic client registration if prompted to choose a registration method.
          </li>
          <li>
            Review the risk notice, then select <strong>Create as a plugin</strong>.
            Install Cronometer from your personal plugins or the workspace where you created it.
          </li>
          <li><SignInStep /></li>
          <li>Start a new chat, type <strong>@</strong>, and select the Cronometer plugin.</li>
        </>
      }
      troubleshooting={
        <>
          <li>
            <strong>Add custom MCP server is missing.</strong> Check that you’re in ChatGPT on
            the web and in the intended workspace. Ask your workspace admin whether custom MCP
            plugins are allowed if the option still doesn’t appear.
          </li>
          <li>
            <strong>Cronometer is missing from the @ picker.</strong> Open Plugins in the workspace
            where you created it and check that you installed it. Then start a new chat there.
          </li>
        </>
      }
      docs={docs}
    />
  );
}
