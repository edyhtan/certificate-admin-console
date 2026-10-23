# Agent Guide

Instructions for any AI agent (or human) working in this repository. Follow them unless the user says otherwise in the conversation.

## 1. Work is planned as milestones and tasks

All work comes from the task ledgers: `docs/backend_task.md` (BE, INFRA, TEST, DOCS) and `docs/frontend_task.md` (FE). `docs/milestones.md` is the overview and shows cross-file dependencies. Do not start work that is not in a ledger. If you need a new task, add it to the right ledger first (in the same PR is fine) and tell the user.

**IDs**

| Thing     | ID format   | Example   |
|-----------|-------------|-----------|
| Milestone | `M<n>`      | `M2`      |
| Task      | `M<n>.T<m>` | `M2.T3`   |

**Ledger format** (one table per milestone in each ledger file; task IDs are unique across both files):

```markdown
## M2 — Core API and UI shell

| Task  | Area | Title                    | Depends on   | Status      | PR  |
|-------|------|--------------------------|--------------|-------------|-----|
| M2.T1 | BE   | API contract (OpenAPI)   | —            | done        | #4  |
| M2.T2 | BE   | Items endpoints          | M2.T1        | in progress | #6  |
| M2.T3 | FE   | App shell + routing      | —            | in review   | #5  |
| M2.T4 | FE   | Items list page          | M2.T1, M2.T3 | todo        |     |
```

- `Area` is one of `FE`, `BE`, `INFRA`, `DOCS`, `TEST`.
- `Status` is one of `todo`, `in progress`, `in review`, `done`, `blocked`.
- `Depends on` lists the tasks that must be merged before this one can merge. `—` means none.
- Update the `Status` and `PR` columns as part of your own task PR.
- `Depends on` may name a task in the other ledger file (e.g. an FE task waiting on a BE endpoint).

## 2. Branches

```
main                                  always builds; only milestone merges land here
└── milestone/m2-core-api             integration branch for one milestone
    ├── task/m2-t1-api-contract       one branch per task
    ├── task/m2-t2-items-endpoints
    └── task/m2-t3-app-shell
```

| Branch            | Created from                      | Name                       |
|-------------------|-----------------------------------|----------------------------|
| Milestone branch  | `main`                            | `milestone/m<n>-<slug>`    |
| Task branch       | its milestone branch              | `task/m<n>-t<m>-<slug>`    |
| Stacked task      | the branch of the task it needs   | `task/m<n>-t<m>-<slug>`    |

- Names are lowercase, words joined with `-`, slugs at most 5 words.
- Never commit directly to `main` or to a milestone branch. All changes go through a task PR.
- Exception: the very first commit (repo bootstrap: these agent files, `.gitignore`, the ledger) may go straight to `main`.

## 3. Order rules

1. **Milestones are sequential.** Create `milestone/m<n+1>` from `main` only after `milestone/m<n>` is merged into `main`.
   - If the next milestone must start while the previous one is still in review, branch it from the previous milestone branch and rebase onto `main` after that one merges. Tell the user when you do this.
2. **Tasks merge in dependency order.** A task PR may merge only when every task in its `Depends on` column is `done`.
3. **Independent tasks may run and merge in any order.** When two tasks are both ready, merge the lower task number first.
4. **A milestone is done** when every task in it is `done`. Only then open the milestone PR into `main`.

## 4. Parallel work (several agents at once)

Tasks with no dependency between them, typically FE and BE tasks in the same milestone, can be built at the same time by different agents.

- Each agent works in its own git worktree, so agents never share a working directory:
  ```bash
  git fetch origin
  git worktree add ../<repo>-m2-t3 -b task/m2-t3-app-shell origin/milestone/m2-core-api
  ```
- One agent owns one task branch. Never push to another agent's branch.
- Shared contracts (API schema, shared types, env variables) are their own task, and both the FE and BE tasks depend on it. Do not change a shared contract inside a feature task.
- If two parallel tasks must edit the same file, say so in the ledger (`Depends on`) so they run one after the other instead of conflicting.
- Remove the worktree after the task PR merges: `git worktree remove ../<repo>-m2-t3`.

## 5. Stacked tasks (starting before a dependency has merged)

If `M2.T4` needs `M2.T2` and `M2.T2` is still in review:

1. Branch `task/m2-t4-...` from `task/m2-t2-...`.
2. Open the PR with base `task/m2-t2-...` and mark it **draft**.
3. After `M2.T2` is merged, retarget the PR to the milestone branch (its commits are already there, since merges keep commits):
   ```bash
   gh pr edit <pr> --base milestone/m2-core-api
   git fetch origin && git rebase origin/milestone/m2-core-api   # only if the base moved on
   git push --force-with-lease
   gh pr ready <pr>
   ```

## 6. Commits

[Conventional Commits](https://www.conventionalcommits.org/) with the area as scope and the task ID at the end:

```
<type>(<area>): <what changed, imperative, ≤ 72 chars> [M2.T3]

Optional body: why, not what.
```

- `type`: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`.
- `area`: `fe`, `be`, `infra`, `docs`, `test`.
- Example: `feat(be): add GET /items with pagination [M2.T2]`
- Small, focused commits. Each commit should build.
- Never commit secrets, `.env` files, build output or dependency folders.

## 7. Pull requests

**Task PR** (`task/...` → `milestone/...`)

- Title: `[M2.T3] App shell + routing` (the ledger title).
- Body: fill in `.github/pull_request_template.md`.
- Open as draft while work is ongoing. Mark ready when the checklist below passes.
- One task per PR. If a task grows too big, split it in the ledger first.

**Milestone PR** (`milestone/...` → `main`)

- Title: `[M2] Core API and UI shell`.
- Body: the milestone's ledger table (all `done`), how to run and verify the milestone end to end, and any known issues carried into the next milestone.

**Before marking any PR ready**

- [ ] Branch is up to date with its base (rebase, don't merge the base in).
- [ ] Lint, type check and tests pass locally for every area touched.
- [ ] New behaviour has tests, or the PR says why not.
- [ ] Ledger `Status` and `PR` columns updated (`docs/backend_task.md` or `docs/frontend_task.md`).
- [ ] No unrelated changes, debug code or commented-out code.

## 8. Merging

| PR             | Method        | Who merges                                                    |
|----------------|---------------|---------------------------------------------------------------|
| Task → milestone | **Merge commit** (no squash) | The agent, once checks pass and order rules allow it |
| Milestone → main | **Merge commit** (no squash) | Only after the user approves               |

- Never squash. The commit-by-commit history is part of the deliverable, so every task commit must survive into `main`. Clean up your own commits (fixups) before marking the PR ready, not by squashing at merge.
- Delete the task branch after it merges (`gh pr merge <pr> --merge --delete-branch`).
- Never force-push `main` or a milestone branch. `--force-with-lease` on your own task branch is fine.
- Never rewrite history that has been merged.

## 9. When something goes wrong

- **Merge conflict:** rebase your task branch onto the latest base and resolve it yourself. If the conflict is in another task's work, stop and ask the user.
- **Dependency not ready:** stack the task (section 5) or pick another ready task. Do not merge out of order.
- **Base branch broken:** do not build on top of it. Mark your task `blocked` in the ledger and tell the user which task broke it.
- **Unsure which task to take next:** the next one is the lowest-numbered `todo` task in the current milestone whose dependencies are all `done`.

## 10. Recording decisions

`docs/spec.md` is the single place where product and design decisions live.

- **During spec phases** (requirement analysis, domain modelling, API contract, task breakdown), record every decision in the **Decision log** in `docs/spec.md`. That includes decisions the user makes in conversation, assumptions you make, and changes to earlier decisions.
- Each entry: ID (`D<n>`), the decision, why, and what it replaces (if anything). Never delete an entry. Mark a replaced one `superseded by D<n>`.
- Update the body of the spec to match the decision in the same change, so the spec and the log never disagree.
- During build phases, if a task forces a design change, add the decision to the log in that task's PR and tell the user.
