@AGENTS.md

## Claude Code notes

- When running tasks in parallel with subagents, give each subagent exactly one task ID and start it with `isolation: "worktree"` so it gets its own working copy (see AGENTS.md section 4).
- A subagent's prompt must include: the task ID, its branch name, its base branch, and the ledger row from `docs/backend_task.md` or `docs/frontend_task.md`, including its "done when" block.
- A subagent is not finished until it has done AGENTS.md section 11: unit specs in the package it changed, a passing test run after its last change, and its test plan section. `docs/test_plan.md` is gitignored and is lost when the worktree is removed, so the subagent's final report must include the finished section, the test command and the pass/fail counts.
- The parent agent adds each subagent's section to `docs/test_plan.md` in the main checkout. It never commits that file.
- Every agent, parent or subagent, runs `npm run test:all` right before each `gh` command that creates, edits, readies or merges a PR, and doesn't run the command if the suite fails (AGENTS.md section 11, part 4).
- The parent agent, not the subagents, merges task PRs, so the order rules in AGENTS.md section 3 are checked in one place.
