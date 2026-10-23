@AGENTS.md

## Claude Code notes

- When running tasks in parallel with subagents, give each subagent exactly one task ID and start it with `isolation: "worktree"` so it gets its own working copy (see AGENTS.md section 4).
- A subagent's prompt must include: the task ID, its branch name, its base branch, and the ledger row from `docs/backend_task.md` or `docs/frontend_task.md`, including its "done when" block.
- A subagent is not finished until it has written the unit specs for AGENTS.md section 11 in the package it changed. It doesn't need to run the tests when it finishes. If it opens a PR, it runs `npm run test:all` first (section 11, part 3) and its final report includes the test plan section with the command and pass/fail counts from that run; otherwise the report lists the scenarios its specs cover, and the parent fills in the results from its own `test:all` run. `docs/test_plan.md` is gitignored and is lost when the worktree is removed.
- The parent agent adds each subagent's section to `docs/test_plan.md` in the main checkout. It never commits that file.
- Every agent, parent or subagent, runs `npm run test:all` right before each `gh` command that creates, edits, readies or merges a PR, and doesn't run the command if the suite fails (AGENTS.md section 11, part 3).
- The parent agent, not the subagents, merges task PRs, so the order rules in AGENTS.md section 3 are checked in one place.
