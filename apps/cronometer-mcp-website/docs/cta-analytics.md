# CTA analytics

The website reuses the Umami Cloud tracker configured in `app/layout.tsx`.
In that website's Umami dashboard, filter Events to `cta_activated` and use
Event data to break down `cta`, `placement`, and (for setup copies) `client`.

| CTA | Placements |
| --- | --- |
| `connect_cronometer` | `header`, `hero`, `bottom` |
| `see_use_cases` | `hero` |
| `view_github` | `header`, `footer` |
| `explore_tool_manifest` | `capabilities` |
| `copy_endpoint` | `hero`, `setup_overview` |
| `copy_setup` | `setup` (client is the selected guide's fixed ID) |

These events count activations, including keyboard and touch activation of native
links/buttons. Connect links open the setup section; they do not prove account
connection or signup. Copy events count attempts, including failed clipboard writes.
Navigation links, demo tabs, setup tab selections and FAQ expansion are outside scope.

Each control uses one click handler; no parallel key/touch handlers or Umami auto-event
attributes are registered. Tracking is fire-and-forget and failures are ignored.
Events before Umami loads, or when blocked, are not queued. Existing PR preview
builds omit the tracker and therefore send no CTA events.

Custom event payloads contain only the configured website/hostname, pathname,
event name and the fixed CTA properties. They exclude query strings, hashes,
referrers, clipboard contents and account identity. Existing automatic pageview
tracking is unchanged. No new analytics provider or backend integration is added.

Run `npm test` for focused event/navigation-contract tests and the production build;
run `npm run lint` for lint checks. To verify in a deployed environment, activate
each CTA once and check its event properties in Umami. No production events were
sent during local validation.

API reference: https://docs.umami.is/docs/tracker-functions

The hero and setup overview endpoint controls include the URL text and icon in one
native copy button. In URL-based client guides, the full URL surface and the small
Copy button are sibling buttons using the same handler. No container handler is
registered, so clicking either emits exactly one `copy_setup` activation. Enter
and Space activate these native buttons as usual.

## Formatting and linting

Biome is pinned as a development dependency. `npm run format` writes formatting;
`npm run format:check` checks it. `npm run lint` runs Biome's formatter/linter
checks followed by the existing ESLint checks, including React Hooks rules.

The explicit `biome.json` file list scopes this initial adoption to the new
analytics helper, CTA link component, test file, and Biome config. Existing pages
and copy components retain their original formatting; they remain covered by
ESLint. Expand the Biome list deliberately when adopting additional files.
CI also triggers for changes to the Biome config and tests.
