# CLAUDE.md

The binding rules for this repository live in [AGENTS.md](AGENTS.md). **Read it before any change**; this file only routes you there so the rules are not duplicated or allowed to drift.

- Workflow, review, merge, CI, and blocked-tool behavior: [AGENTS.md](AGENTS.md) → [CONTRIBUTING.md](CONTRIBUTING.md).
- Task context: [project goals](docs/project-goals.md), [roadmap](docs/roadmap.md), [handoff](docs/handoff.md).
- Repository skills: `.claude/skills/` is a symlink to `.agents/skills/`, so both Claude Code and AGENTS.md-based harnesses load the same files. If skill discovery does not resolve the symlink in your environment, read `.agents/skills/*/SKILL.md` directly.

Short version of the constraints that are most often broken: never commit or push to `main`, work one purpose per branch and PR, get an independent reviewer, and merge only with the user's explicit authorization for that PR. AGENTS.md and CONTRIBUTING.md state these in full and take precedence over this summary.
