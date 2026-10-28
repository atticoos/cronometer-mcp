# Cronometer MCP

Connect your AI assistant to Cronometer to review your nutrition, log meals, and explore your tracking history in conversation.

Cronometer MCP is an unofficial [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that gives compatible assistants access to your Cronometer account. It supports reading your data and making changes to your food diary, custom foods, and recipes.

## What you can do

- **Review your nutrition:** see your food diary, calories consumed and remaining, and tracked macro and micronutrient totals.
- **Log and manage meals:** search Cronometer's food database, add or remove diary entries, copy the previous day's entries, and mark days complete or incomplete.
- **Create foods and recipes:** save a custom food from nutrition information or build a recipe from ingredients.
- **Explore your history:** retrieve macro targets, fasting history and statistics, and biometric trends such as weight or body fat.
- **Retrieve exports:** access daily nutrition summaries, food servings, exercises, biometrics, and notes for a date range.

## Connect your assistant

You need a Cronometer account and an MCP client that supports remote HTTP servers with OAuth authentication.

1. Add a remote MCP server in your assistant's MCP connection settings.
2. Enter the server URL:

   ```text
   https://mcp.cronometer-mcp.dev/mcp
   ```

3. Complete the browser sign-in flow with your Cronometer username, password, and one-time code if required.
4. Return to your assistant and ask it to check the connection or retrieve today's food diary.

Connection settings and tool permissions vary by client. If you need to run your own server, follow the [self-hosting guide](docs/development.md#deploy-to-cloudflare).

**About the npm package:** `npx cronometer-mcp` currently runs a placeholder server with only a status tool. Use the remote server described here for Cronometer data tools. See the [package README](packages/cronometer-mcp/README.md) for its current status.

## Try asking

- “What have I eaten today, and how many calories do I have left?”
- “Show my protein, fiber, and sodium totals for yesterday.”
- “Find cooked brown rice and log 150 grams for lunch today.”
- “Create a recipe from 200 grams of chicken breast and 150 grams of cooked rice.”
- “How has my weight changed over the last 30 days?”
- “Summarize my fasting history for the past month.”
- “Retrieve my daily nutrition summaries for the last seven days.”

Available answers depend on what you track in Cronometer. Your assistant can use food search and serving details to identify foods before logging them.

## Account access and privacy

During sign-in, the MCP server receives your Cronometer credentials and exchanges them with Cronometer for sessions. Your password and one-time code are not stored or included in MCP tokens; upstream sessions are stored in encrypted OAuth grant properties. Use a server operator you trust with your account access.

Data returned by tools becomes available to your assistant and is subject to that client's data handling policies. Write tools can change your Cronometer account, including removing diary entries. Review your client's tool permissions before allowing changes.

**Current permission limitation:** the sign-in screen describes access as “read-only,” and the OAuth scope is named `cronometer:read`, but the server also exposes write tools. This connection should be treated as having read and write capabilities.

If a Cronometer session expires, reconnect through your MCP client and sign in again. The server does not retain your password to sign you back in automatically.

## Available tools

| Area | Tools |
| --- | --- |
| Connection | `connection_status` |
| Food diary | `get_food_log`, `add_food_entry`, `remove_food_entry`, `copy_day`, `mark_day_complete` |
| Nutrition and food search | `get_daily_nutrition`, `search_foods`, `get_food_details` |
| Custom foods and recipes | `add_custom_food`, `add_recipe` |
| Targets | `get_macro_targets` |
| Fasting | `get_fasting_history`, `get_fasting_stats` |
| Biometrics | `list_biometrics`, `get_biometrics` |
| Data exports | `get_cronometer_data` |

## Limits and troubleshooting

- **Expired connection:** reconnect the MCP server in your client and complete sign-in again.
- **Missing nutrients:** daily nutrition totals include nutrients with targets set in your Cronometer account.
- **Dates:** tools accept `YYYY-MM-DD` dates. Diary tools with an optional date default to today in your account's timezone.
- **Copying a day:** `copy_day` adds the previous day's entries to the destination date and keeps existing entries. Repeating it can create duplicates.
- **Export limits:** each export covers at most 31 inclusive days and returns up to 1,000 rows. Shorten the range if a result is truncated. Exports count toward Cronometer's limited daily export allowance (roughly 10 per day); the mobile data tools do not use that allowance.
- **Service changes:** this project uses Cronometer's private mobile and web APIs. Changes to those APIs may temporarily break features.

## Development and self-hosting

See the [development guide](docs/development.md) for local setup, Cloudflare deployment, authentication details, secrets, and CI configuration. The mobile API contract is maintained in [`specs/cronometer-mobile.yaml`](specs/cronometer-mobile.yaml).

## Acknowledgments

The mobile API integration is a TypeScript port of [`rwestergren/cronometer-api-mcp`](https://github.com/rwestergren/cronometer-api-mcp) (MIT). The CSV export protocol was independently implemented using [`jrmycanady/gocronometer`](https://github.com/jrmycanady/gocronometer) as a reference. See the [development guide](docs/development.md#authentication-design) for implementation and licensing notes.
