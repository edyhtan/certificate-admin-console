# Milestones

Overview of the plan for the Certificate Admin Console. The tasks themselves, with status, dependencies and "done when" criteria, live in two ledgers:

- `docs/backend_task.md`: backend, infrastructure, test and docs tasks
- `docs/frontend_task.md`: frontend tasks

Task IDs are unique across both files (`M1.T8` is backend, `M1.T12` is frontend). Rules for branches, order and PRs are in `AGENTS.md`; the design is in `docs/spec.md`.

## How the milestones fit together

- **M0** fixes the API contract, so FE and BE can be built in parallel against it.
- **M1–M2** build the whole product against **one** database. The core already reads its context through the injected `AppContext` port (spec §5.1, D46); in M1–M2 that port is bound to a fixed single-tenant provider for **Sydney** (`cert_syd`, `Australia/Sydney`, `SYD`; D48). The Sydney seed (M1.T6) is both the dev data and the baseline for M1–M2 API tests.
- **M3** rebinds `AppContext` to the tenancy module's ambient (`AsyncLocalStorage`) implementation (registry, one database per tenant, `tenant_id` header). Core modules should not change in M3; if one has to, log it as a decision in the spec.
- **M4** is polish: self-check on a fresh clone, UX and API hardening, README.

## Milestones

| Milestone | Goal | Backend | Frontend |
|-----------|------|---------|----------|
| M0 — Contract and plan | Contract both sides build against; task breakdown | M0.T1–T3 | — |
| M1 — Foundations | Runnable server and database with all domain data and relations; auxiliary, list (paging only), detail and revoke endpoints. Web framework that talks to it. Dev tool to inspect tenant data | M1.T1–T9, T14 | M1.T10–T13 |
| M2 — Full features | Search/filter/sort, bulk issue, CSV export, audit events. UI for each, including audit logs | M2.T1–T5 | M2.T6–T9 |
| M3 — Multi-tenancy | One database per tenant selected by `tenant_id`; tenant switcher and tenant timezones in the UI | M3.T1–T4 | M3.T5–T6 |
| M4 — Final polish | Fresh-clone self-check, UX and API polish, README, optional CI | M4.T1, T3–T5 | M4.T2 |

## Parallel lanes and cross-file dependencies

| Milestone | Can run in parallel | FE waits on BE |
|-----------|---------------------|----------------|
| M0 | M0.T3 alongside T1 → T2 | — |
| M1 | BE chain `T1/T2 → T3 → T4/T5 → T6 → T7/T8 → T9` (T5 can run alongside T6) alongside FE `T10 → T11` | T12 needs T8; T13 needs T9 |
| M2 | BE `T1`, `T2`, `T5` independent; `T3` after `T2`; `T4` after `T1` + `T2` | T6 ← T1; T7 ← T3; T8 ← T4 + T6; T9 ← T5 |
| M3 | BE `T2` and `T3` after `T1` | T5 ← T2; T6 ← T5 + T3 |
| M4 | T1 first; then T2 (FE) and T3 (BE) together; T4 last; T5 any time | T4 (README) ← T2 + T3 |
