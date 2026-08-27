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

If asked to capture Cronometer traffic, check whether the API changed, or
update the API spec, read the relevant skill file first.
