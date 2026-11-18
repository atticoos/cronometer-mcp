# Cronometer MCP

Connect your AI assistant to Cronometer to review your nutrition, log meals, and explore your tracking history in conversation.

Cronometer MCP is an unofficial [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that gives compatible assistants access to your Cronometer account. It supports reading your data and making changes to your food diary, notes, exercise, biometrics, macro targets, custom foods, and recipes.

## What you can do

- **Review your nutrition:** see your food diary, calories consumed and remaining, nutrition adequacy scores, and tracked macro and micronutrient totals.
- **Log and manage diary entries:** search Cronometer's food and exercise databases, add or delete food entries, log exercises, biometrics, and diary notes, copy the previous day's entries, and mark days complete or incomplete.
- **Create foods and recipes:** save a custom food from nutrition information or build a recipe from ingredients.
- **Manage targets and history:** retrieve nutrient and macro targets, update macro targets or macro splits, and explore fasting history, statistics, and biometric trends such as weight or body fat.
- **Retrieve exports:** access daily nutrition summaries, food servings, exercises, biometrics, and notes for a date range.

## Connect your assistant

- [Set up Cronometer MCP in ChatGPT](https://cronometer-mcp.dev/setup/chatgpt)
- [Set up Cronometer MCP in Claude](https://cronometer-mcp.dev/setup/claude)

You need a Cronometer account and an MCP client that supports remote HTTP servers with OAuth authentication.

1. Add a remote MCP server in your assistant's MCP connection settings.
2. Enter the server URL:

   ```text
   https://mcp.cronometer-mcp.dev/mcp
   ```

3. Review the requested read and write access, then complete the browser sign-in flow with your Cronometer username, password, and one-time code if required.
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

Data returned by tools becomes available to your assistant and is subject to that client's data handling policies. Write tools can change your Cronometer account, including **deleting existing food entries**, adding or editing diary notes, logging exercise and biometrics, updating macro targets, creating custom foods and recipes, copying diary entries, and marking days complete or incomplete. Review your client's tool permissions before allowing changes.

The sign-in screen requests read and write access. The OAuth scope is still named `cronometer:read` for compatibility with existing clients. Despite that legacy name, it does not enforce read-only access: an authorized connection has access to all the tools listed below. There is currently no read-only connection mode. You can revoke the MCP connection at any time.

If a Cronometer session expires, follow the sign-in prompt from your MCP client, then retry the tool. The server discards your password after sign-in.

## Available tools

| Area | Tools |
| --- | --- |
| Connection | `connection_status` |
| Food diary, stats & notes | `get_food_log`, `get_diary_groups`, `get_calendar_summary`, `get_logging_streak`, `get_all_time_stats`, `add_food_entry`, `remove_food_entry`, `copy_day`, `mark_day_complete`, `add_note`, `update_note` |
| Nutrition, reports & trends | `get_daily_nutrition`, `get_nutrition_scores`, `get_nutrition_report`, `get_nutrition_trends`, `get_energy_trends`, `get_nutrient_definitions` |
| Food search, custom foods & recipes | `search_foods`, `get_food_details`, `get_recent_foods`, `list_custom_foods`, `add_custom_food`, `update_custom_food`, `add_recipe` |
| Targets & schedules | `get_macro_targets`, `get_nutrient_targets`, `set_macro_targets`, `set_macro_split`, `set_nutrient_target`, `get_macro_schedule`, `list_macro_templates` |
| Exercise | `search_activities`, `get_recent_exercises`, `add_exercise` |
| Fasting | `get_fasting_history`, `get_fasting_stats` |
| Biometrics & sleep | `list_biometrics`, `get_biometrics`, `get_recent_biometrics`, `get_weight_trends`, `add_biometric`, `get_sleep_score` |
| Data exports | `get_cronometer_data` |

## Limits and troubleshooting

- **Expired connection:** if your client does not show a sign-in prompt, reconnect the MCP server in your client and sign in again.
- **Missing nutrients:** daily nutrition totals include nutrients with targets set in your Cronometer account.
- **Dates:** tools accept `YYYY-MM-DD` dates. Diary tools with an optional date default to today in your account's timezone.
- **Copying a day:** `copy_day` adds the previous day's entries to the destination date and keeps existing entries. Repeating it can create duplicates.
- **Export limits:** each export covers at most 31 inclusive days and returns up to 1,000 rows. Shorten the range if a result is truncated. Exports count toward Cronometer's limited daily export allowance (roughly 10 per day); the mobile data tools do not use that allowance.
- **Service changes:** this project uses Cronometer's private mobile and web APIs. Changes to those APIs may temporarily break features.

## Development and self-hosting

See the [development guide](docs/development.md) for local setup, Cloudflare deployment, authentication details, secrets, and CI configuration. The mobile API contract is maintained in [`specs/cronometer-mobile.yaml`](specs/cronometer-mobile.yaml).

## Acknowledgments

The mobile API integration is a TypeScript port of [`rwestergren/cronometer-api-mcp`](https://github.com/rwestergren/cronometer-api-mcp) (MIT). The CSV export protocol was independently implemented using [`jrmycanady/gocronometer`](https://github.com/jrmycanady/gocronometer) as a reference. See the [development guide](docs/development.md#authentication-design) for implementation and licensing notes.

## License

[MIT](LICENSE). Notices for ported third-party code are in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
