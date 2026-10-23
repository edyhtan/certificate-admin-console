# Backend Tasks

Backend, infrastructure, test and docs tasks for the Certificate Admin Console. Frontend tasks are in `docs/frontend_task.md`; the milestone overview and cross-file order are in `docs/milestones.md`. Rules for branches, order and PRs are in `AGENTS.md`; the design is in `docs/spec.md` (§ references point there).

- "Depends on" can name tasks in either task file, within the same milestone. Every task also depends on the previous milestone being merged into `main`.
- Update `Status` and `PR` here as part of your own task PR.

---

## M0 — Contract and plan

| Task  | Area  | Title                                   | Depends on   | Status      | PR  |
|-------|-------|-----------------------------------------|--------------|-------------|-----|
| M0.T1 | INFRA | Repo bootstrap and workspace scaffold   | —            | todo        |     |
| M0.T2 | BE    | API contract for all endpoints          | M0.T1        | todo        |     |
| M0.T3 | DOCS  | Milestone and task breakdown            | —            | in progress |     |

**M0.T1 — Repo bootstrap and workspace scaffold**
- `git init`, first commit straight to `main` (allowed for bootstrap, AGENTS.md §2): `AGENTS.md`, `CLAUDE.md`, PR template, `docs/`, `.gitignore`, `.editorconfig`.
- npm workspaces: `backend_service` (Nest CLI scaffold) and `web` (Vite `react-ts` scaffold). `shared` is added in M0.T2.
- Each project keeps its scaffold's strict tsconfig and oxlint; root `npm run build`, `lint`, `typecheck`, `test` run across workspaces.
- `.env.example` with `DATABASE_URL`, `DATABASE_URL_BASE`, `APP_TIMEZONE`, `APP_SERIAL_PREFIX`, `API_PORT`. The single-tenant values default to Sydney (D48): `DATABASE_URL=…/cert_syd`, `APP_TIMEZONE=Australia/Sydney`, `APP_SERIAL_PREFIX=SYD`.
- Done when: `npm install && npm run lint && npm run typecheck` passes on a clean clone.

**M0.T2 — API contract for all endpoints**
- `shared/src/contract/` (new `shared` workspace): zod schemas and inferred types for every request and response in spec §5:
  - `GET /api/tenants`
  - `GET/POST /api/courses`, `POST /api/participants`
  - `GET /api/certificates` (query: `q`, `status`, `courseId`, `sort`, `order`, `page`, `pageSize`), `GET /api/certificates/:id`, `POST /api/certificates/:id/revoke`
  - `GET /api/certificates/export.csv` (same query minus paging)
  - `GET /api/issuances/preview?courseId=`, `POST /api/issuances` (NDJSON events `start` / `result` / `done`)
  - `GET /api/audit-events` (query: `certificateId`, `courseId`, `action`, `page`, `pageSize`)
- One error shape for every endpoint: `{ error: code, message, fields? }`, with the codes and HTTP statuses listed (`400` validation / `unknown_tenant`, `404`, `409` duplicate).
- The `tenant_id` header is documented on every route except `GET /api/tenants`. It's ignored until M3, but the web client sends it from M1.
- `docs/api.md`: endpoint table with method, path, request, response and errors, generated from or kept next to the schemas.
- Done when: both apps can import the types; schemas have unit tests for the tricky rules (sort whitelist, pageSize max, email lower-casing, course code upper-casing).

**M0.T3 — Milestone and task breakdown**
- `docs/milestones.md` (overview), `docs/backend_task.md` and `docs/frontend_task.md` (ledgers). Done when they're reviewed by the user and committed.

---

## M1 — Foundations (single database)

| Task   | Area  | Title                                              | Depends on            | Status | PR  |
|--------|-------|----------------------------------------------------|-----------------------|--------|-----|
| M1.T1  | INFRA | MySQL in Docker Compose and `npm run dev`          | —                     | done   | local |
| M1.T2  | BE    | NestJS app skeleton, validation and error format   | —                     | todo   |     |
| M1.T3  | BE    | Prisma schema and initial migration                | M1.T1, M1.T2          | todo   |     |
| M1.T4  | BE    | API test harness (Vitest + Supertest + test database) | M1.T3                | todo   |     |
| M1.T5  | BE    | `AppContext` port and single-tenant binding        | M1.T3                 | todo   |     |
| M1.T6  | BE    | Sydney seed, test baseline and `db:setup`          | M1.T3, M1.T4          | todo   |     |
| M1.T7  | BE    | Courses and participants endpoints                 | M1.T4, M1.T5, M1.T6   | todo   |     |
| M1.T8  | BE    | Certificate list (paging only) and detail          | M1.T4, M1.T5, M1.T6   | todo   |     |
| M1.T9  | BE    | Audit writer and revoke endpoint                   | M1.T8                 | todo   |     |

**M1.T1 — MySQL in Docker Compose and `npm run dev`**
- `docker-compose.yml`: MySQL 8.4, `utf8mb4` / `utf8mb4_0900_ai_ci` server defaults, UTC server timezone, healthcheck, named volume.
- Root `npm run dev`: `docker compose up -d --wait`, then `db:setup` (stub until M1.T6), then API and web together (`concurrently`).
- Done when: `npm run dev` on a clean clone brings MySQL up healthy and starts both app processes.

**M1.T2 — NestJS app skeleton, validation and error format**
- NestJS app in `backend_service`, global `/api` prefix, `GET /api/health`.
- Config module reading `.env` (single-tenant values for M1–M2: `DATABASE_URL`, `APP_TIMEZONE`, `APP_SERIAL_PREFIX`; Sydney, D48).
- `ZodValidationPipe` using the shared contract schemas.
- Global exception filter producing the contract error shape; maps Prisma `P2002` → `409` and `P2025` / not-found → `404`.
- Done when: health endpoint responds; a bad request to a sample route returns the contract error shape.

**M1.T3 — Prisma schema and initial migration** (spec §3.2)
- Models: `Admin`, `Course`, `Participant`, `Enrollment`, `SerialCounter`, `Certificate`, `AuditEvent` with all relations, unique keys (`course.code`, `participant.email`, `(participant_id, course_id)`, `certificate.enrollment_id`, `certificate.serial`) and indexes (`certificate(issued_at, id)`, `participant_name`, `course_title`).
- Edit the migration SQL to add the audit append-only triggers (`BEFORE UPDATE` / `BEFORE DELETE` → `SIGNAL`).
- Pin Prisma 6.x.
- Done when: `prisma migrate deploy` on an empty database succeeds; a raw `UPDATE audit_event …` fails.

**M1.T4 — API test harness**
- Vitest + Supertest wired to Nest's testing module (scaffold default).
- Each test run uses its own throwaway database on the compose MySQL (create → migrate → drop), and a helper to reset tables between suites.
- Factories for course, participant, enrollment, certificate.
- Done when: `npm run test:e2e -w backend_service` runs a sample e2e test green on a clean machine with only Docker running.

**M1.T5 — `AppContext` port and single-tenant binding** (spec §5.1, D46)
- `AppContext` abstract class in `backend_service/src/core/context/` (db, timeZone, serialPrefix, actor, now). Core services inject it and read it when called. No `@Ctx()` decorator and no context argument on any method.
- Single-tenant binding of `AppContext`: one `PrismaClient` from `DATABASE_URL`, timezone and prefix from env, actor = the `admin` row (loaded on module init).
- Test helper that binds `AppContext` to a fixed object over the test database.
- oxlint `no-restricted-imports` rule: core modules may not import the single-tenant binding, `node:async_hooks` or (later) the tenancy module.
- Done when: a sample core service reads a populated context with no context parameter; the lint rule fails on a deliberate bad import.

**M1.T6 — Sydney seed, test baseline and `db:setup`** (spec §7 seed, D48)
- `seed(db, profile)` as a reusable function taking a tenant seed profile (`timeZone`, `serialPrefix`, `participantCount`, edge-case issue times). M1 ships one profile, **`SYDNEY`** (`Australia/Sydney`, `SYD`); M3 adds Perth and Adelaide profiles next to it.
- The Sydney seed creates: admin `admin`; 3 courses; 15 participants with apostrophes and accents in some names (`O'Neil`, `Nguyễn`); enrollments (mix of `enrolled` and `completed`, every course has eligible learners); a few certificates `SYD-2026-000001…` with matching `certificate.issued` audit events, one revoked with its `certificate.revoked` event.
- Sydney edge cases (spec §4): one certificate each side of the DST end on 5 Apr 2026 (03:00 AEDT +11 → 02:00 AEST +10) and of the DST start on 4 Oct 2026; one at 00:30 local on 1 Jan 2026 (13:30 UTC on 31 Dec 2025), whose local date and serial year are 2026, not the UTC 2025.
- `serial_counter` for 2026 is set to the highest seeded sequence, so the M2 serial generator carries on from there.
- Fixed values: deterministic data (no random names or `now()`), exported as a `SYDNEY_SEED` manifest (counts, known names, serials, ids of the revoked and edge-case certificates) for tests to assert against.
- Test baseline: helper `resetToSydneySeed()` that clears the test database and loads the Sydney seed. It is the default starting state for M1–M2 API e2e tests; factories (M1.T4) add rows on top for specific cases.
- `npm run db:setup`: migrate deploy on `cert_syd`, then seed only if `admin` is empty. Safe to run repeatedly.
- Done when: running `db:setup` twice leaves the same data; `npm run dev` lands on the seeded Sydney database; a sample e2e test on `resetToSydneySeed()` sees the `SYDNEY_SEED` counts and the three edge-case certificates with the expected UTC instants.

**M1.T7 — Courses and participants endpoints** (spec §5.6)
- `GET /api/courses`, `POST /api/courses`, `POST /api/participants` per contract.
- Normalise code (upper-case) and email (lower-case); duplicate → `409` naming the field, decided by the unique key.
- Done when: e2e tests cover create, list, validation errors and duplicates.

**M1.T8 — Certificate list (paging only) and detail** (spec §5.3, partial)
- `GET /api/certificates` with `page`/`pageSize` only, fixed sort `issued_at desc, id desc`, response includes `total` and `timezone`.
- `GET /api/certificates/:id` with certificate fields; unknown id → `404`. (Audit events are added in M2 via the audit endpoint.)
- Done when: e2e tests cover paging boundaries (last page, empty page, pageSize max) and 404.

**M1.T9 — Audit writer and revoke endpoint** (spec §5.4)
- `AuditService.record(tx, event)`: writes inside the caller's transaction only.
- `POST /api/certificates/:id/revoke`: `valid` → `revoked` with `revoked_*` and a `certificate.revoked` audit event in one transaction; already revoked → `200`, no second event.
- Done when: e2e tests prove one audit event after two revokes, and the event has actor, course, participant and serial.

---

## M2 — Search, bulk issue, export and audit log

| Task  | Area | Title                                               | Depends on    | Status | PR  |
|-------|------|-----------------------------------------------------|---------------|--------|-----|
| M2.T1 | BE   | List search, filters and sorting                    | —             | todo   |     |
| M2.T2 | BE   | Time helpers and serial generator                   | —             | todo   |     |
| M2.T3 | BE   | Bulk issue: preview and NDJSON issue endpoint       | M2.T2         | todo   |     |
| M2.T4 | BE   | CSV export                                          | M2.T1, M2.T2  | todo   |     |
| M2.T5 | BE   | Audit events endpoint                               | —             | todo   |     |

**M2.T1 — List search, filters and sorting** (spec §5.3)
- One `buildCertificateQuery(params)` returning Prisma `where` + `orderBy`; used by the list now and the export in M2.T4.
- `q`: participant name contains, or serial starts with; `status`; `courseId`; `sort` whitelist + `order`; id tie-breaker.
- Done when: e2e tests cover name search with accents/case (`nguyen` → `Nguyễn`), serial prefix, each sort both ways, invalid sort → `400`, stable paging with equal sort keys.

**M2.T2 — Time helpers and serial generator** (spec §4, §5.2)
- `localYear(instant, tz)`, `localDate(instant, tz)` in the core.
- `nextSerial(tx, prefix, year)` using `INSERT … ON DUPLICATE KEY UPDATE last_value = LAST_INSERT_ID(last_value + 1)`; format `PREFIX-YYYY-000123`.
- Done when: unit tests cover Perth 31 Dec 23:30 local → year 2026, Sydney/Adelaide either side of a DST change; an integration test shows a rolled-back transaction gives its number back and two parallel transactions get different numbers.

**M2.T3 — Bulk issue: preview and NDJSON issue endpoint** (spec §5.2)
- `GET /api/issuances/preview?courseId=` → `{ completed, alreadyIssued, eligible }`.
- `POST /api/issuances { courseId }`: one transaction per completed enrollment; skip if a certificate exists (`already_issued` / `revoked`); otherwise serial + certificate + `certificate.issued` audit event; `P2002` → skipped; other error → failed. Stream `start` / `result` / `done` NDJSON lines; keep going if the client disconnects.
- Done when: e2e tests show the first run issues N with N audit events; a second run issues 0, skips N and adds **no** audit events; two parallel runs create N certificates in total; a forced failure for one learner leaves no row and the rest issue.

**M2.T4 — CSV export** (spec §5.5)
- `GET /api/certificates/export.csv` using `buildCertificateQuery`; keyset batches (default 1,000, configurable for tests) written to the response stream.
- Columns `learner_name, course_title, serial_number, issue_date, status`; tenant-local `issue_date`; RFC 4180 quoting; formula-injection prefix; UTF-8 BOM; `Content-Disposition` filename `certificates-<code>-<local date>.csv`.
- Done when: tests show row count = list `total` for the same filters; batch size 2 gives the same output as 1,000; a name starting with `=` is escaped; a name with a comma and quote round-trips.

**M2.T5 — Audit events endpoint** (spec §5.7)
- `GET /api/audit-events` filtered by `certificateId`, `courseId`, `action`; paginated; newest first.
- Done when: e2e tests cover each filter and paging.

---

## M3 — Multi-tenancy

| Task  | Area  | Title                                              | Depends on    | Status | PR  |
|-------|-------|----------------------------------------------------|---------------|--------|-----|
| M3.T1 | BE    | Tenant registry and per-tenant Prisma clients      | —             | todo   |     |
| M3.T2 | BE    | Tenant middleware and `GET /api/tenants`           | M3.T1         | todo   |     |
| M3.T3 | INFRA | Per-tenant database setup and seed                 | M3.T1         | todo   |     |
| M3.T4 | TEST  | Tenant isolation tests                             | M3.T2, M3.T3  | todo   |     |

**M3.T1 — Tenant registry and per-tenant Prisma clients** (spec §3.1, §5.1)
- `backend_service/src/tenancy/tenants.ts`: `SYD` Sydney / `PER` Perth / `ADL` Adelaide with timezone and database name.
- Prisma client manager: one `PrismaClient` per tenant (`datasourceUrl` = `DATABASE_URL_BASE` + database), small pool, connect on init, disconnect on shutdown.
- Done when: unit tests cover registry lookup; the app starts with three clients.

**M3.T2 — Tenant middleware and `GET /api/tenants`**
- Tenant scope store: one `AsyncLocalStorage<TenantScope>` (frozen `{ code, db, timeZone, actor }`).
- `TenantAppContext`: binding for `AppContext` whose getters read the current scope; no scope → throw. Rebind `AppContext` to it and remove the single-tenant binding.
- Middleware: `tenant_id` header → registry → that tenant's client, timezone, prefix and `admin` actor → `store.run(scope, next)`, so the whole request (including streamed responses) runs in that scope. Missing/unknown → `400 unknown_tenant`.
- `runInTenant(code, fn)` for work outside a request (setup, seed, scripts, tests).
- `GET /api/tenants` returns code, name, timezone only.
- Done when: all existing e2e tests pass with a `tenant_id` header and **no changes to core modules**.

**M3.T3 — Per-tenant database setup and seed**
- `db:setup` loops the registry: `CREATE DATABASE IF NOT EXISTS`, `prisma migrate deploy` with that tenant's URL, seed if empty, all through `runInTenant`.
- `cert_syd` from M1 becomes the `SYD` tenant database as it is; the `SYDNEY` seed profile stays unchanged.
- Add `PERTH` and `ADELAIDE` seed profiles with their own participant counts (10–20, not 15) and §4 edge cases: Perth 31 Dec 23:30 local; Adelaide either side of a DST change.
- Done when: `npm run dev` from `docker compose down -v` creates three seeded databases; re-running changes nothing.

**M3.T4 — Tenant isolation tests**
- With `tenant_id: SYD`: Perth certificate id → `404`; revoke Perth id → `404`; list and export contain no `PER-` serials; bulk issue for a Perth course id → `404`.
- No header or `XYZ` → `400`.
- Ambient scope: Sydney and Perth bulk issue runs started at the same time each stream only their own serials; a CSV export of many batches keeps its tenant to the last row; a core service called outside any scope throws.
- Done when: all pass in CI-style run.

---

## M4 — Final polish

| Task  | Area  | Title                                    | Depends on | Status | PR  |
|-------|-------|------------------------------------------|------------|--------|-----|
| M4.T1 | TEST  | End-to-end self-check on a fresh clone   | —          | todo   |     |
| M4.T3 | BE    | API hardening and cleanup                | M4.T1      | todo   |     |
| M4.T4 | DOCS  | README                                   | M4.T2, M4.T3 | todo |     |
| M4.T5 | INFRA | CI workflow (optional)                   | —          | todo   |     |

**M4.T1 — End-to-end self-check on a fresh clone**
- From a fresh clone and `docker compose down -v`: follow the README start steps; walk every flow in every tenant (list, search, sort, page, detail, revoke, bulk issue twice, export, audit log, tenant switch).
- Record what breaks as fixes in M4.T2/M4.T3 (or new tasks in this ledger).
- Optional: one Playwright happy-path test of bulk issue → list → export.

**M4.T3 — API hardening and cleanup**
- Request logging; limits on `q` length and `pageSize`; clear messages for every `400`; remove dead code and TODOs; `lint`, `typecheck`, all tests green.

**M4.T4 — README**
- Prerequisites (Node 24, Docker); one-command start; seeded tenants and what to try in each; architecture summary and links to `docs/spec.md` and `docs/api.md`; how to run tests; known limits.

**M4.T5 — CI workflow (optional)**
- GitHub Actions: install, lint, typecheck, API tests against a MySQL service container, web tests. Only if the repo has a GitHub remote.
