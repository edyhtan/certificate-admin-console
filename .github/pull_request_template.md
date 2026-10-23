<!-- Title: [M<n>.T<m>] <task title from docs/backend_task.md or docs/frontend_task.md>  (milestone PRs: [M<n>] <milestone title>) -->

## Task

- **ID:** M?.T?
- **Area:** FE / BE / INFRA / DOCS / TEST
- **Depends on:** <!-- task IDs, or "none" -->
- **Base branch:** milestone/m?-...

## What changed

<!-- 1–5 bullets. What a reviewer needs to know, not a file list. -->

## How to verify

<!-- Commands to run and what you should see. -->

## Checklist

- [ ] Up to date with base branch (rebased)
- [ ] Lint, type check and tests pass for every area touched
- [ ] Every added or changed service or module has unit specs in its own package (or explained below why not)
- [ ] Unit tests run after the work was finished, and all pass
- [ ] Local `docs/test_plan.md` updated with this task's scenarios and run result (gitignored, not part of this PR)
- [ ] `npm run test:all` passed right before each `gh` command run on this PR
- [ ] Ledger status and PR number updated in `docs/backend_task.md` or `docs/frontend_task.md`
- [ ] No unrelated changes, debug code or secrets

## Notes / follow-ups

<!-- Known gaps, decisions made, things for later tasks. -->
