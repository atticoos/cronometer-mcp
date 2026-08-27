# Repository instructions

- Use Conventional Commits for every commit message.
- Keep commit subjects to a single line using the form `type(scope): description` when a scope is useful.
- Use `feat` for new functionality and `fix` for bug fixes; use an appropriate conventional type such as `chore`, `test`, `refactor`, `style`, or `docs` for other changes.

# Cronometer API reverse-engineering

The Cronometer mobile API is private; it is documented by observing the
Android app in a rooted emulator with mitmproxy. Procedures live in
`skills/` (symlinked into `.opencode/skills/` and `.claude/skills/` for
skill-aware agents):

- `skills/setup-avd/SKILL.md` — one-time environment bootstrap (new machine, missing/rootless AVD)
- `skills/cronometer-api-discovery/SKILL.md` — per-session MITM rig restore, traffic capture, flow extraction
- `specs/cronometer-mobile.yaml` — the OpenAPI contract maintained from captures

# Linear issue creation

Before opening a Linear issue:

- Call `linear_list_projects` (and `linear_list_teams` if the team is unclear) and check for a project relevant to the issue. Only create issues with no project when there is genuinely no relevant project.
- When a relevant project exists, pass `project` on create. Never create an issue into a project-less state and move it afterward.
- If two projects are plausible, ask the user which one to use rather than guessing.

If asked to capture Cronometer traffic, check whether the API changed, or
update the API spec, read the relevant skill file first.
