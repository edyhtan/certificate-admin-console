@AGENTS.md

## Claude Code notes

- When running tasks in parallel with subagents, give each subagent exactly one task ID and start it with `isolation: "worktree"` so it gets its own working copy (see AGENTS.md section 4).
- A subagent's prompt must include: the task ID, its branch name, its base branch, and the ledger row from `docs/backend_task.md` or `docs/frontend_task.md`, including its "done when" block.
- The parent agent, not the subagents, merges task PRs, so the order rules in AGENTS.md section 3 are checked in one place.
