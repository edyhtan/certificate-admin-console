# Frontend Tasks

Frontend tasks for the Certificate Admin Console. Backend, infrastructure, test and docs tasks are in `docs/backend_task.md`; the milestone overview and cross-file order are in `docs/milestones.md`. Rules for branches, order and PRs are in `AGENTS.md`; the design is in `docs/spec.md` (§ references point there).

- "Depends on" can name tasks in either task file, within the same milestone. Every task also depends on the previous milestone being merged into `main`.
- An FE task that depends on a BE task can start early against the M0 contract (`shared`, `docs/api.md`), but merges only after that BE task is merged.
- Update `Status` and `PR` here as part of your own task PR.

---

## M1 — Foundations (single database)

| Task   | Area  | Title                                              | Depends on            | Status | PR  |
|--------|-------|----------------------------------------------------|-----------------------|--------|-----|
| M1.T10 | FE    | Web app skeleton: Vite, router, query client, proxy | —                    | in progress |     |
| M1.T11 | FE    | API client, date formatting and shared UI states   | M1.T10                | in progress |     |
| M1.T12 | FE    | Certificate list page (paging only)                | M1.T11, M1.T8         | todo   |     |
| M1.T13 | FE    | Certificate detail page and revoke dialog          | M1.T11, M1.T9         | todo   |     |

**M1.T10 — Web app skeleton**
- Vite + React + TS in `web` (scaffolded in M0.T1); React Router routes `/certificates`, `/certificates/:id`, `/bulk-issue` (placeholder), `/audit` (placeholder); `/` redirects to `/certificates`.
- TanStack Query provider; Vite dev proxy `/api` → API port; layout with header and nav.
- Vitest + Testing Library set up with one sample test.
- Done when: `npm run dev` serves the shell and navigation works.

**M1.T11 — API client, date formatting and shared UI states**
- Typed `apiFetch` using the shared contract types; parses the error shape; sends `tenant_id` (fixed `SYD` until M3, D48).
- `formatInTimeZone(instant, timeZone)` helpers using `Intl.DateTimeFormat`, with tests for Perth and Sydney.
- Components: `LoadingState`, `EmptyState`, `ErrorState` (with retry), `DataTable`, `Pagination`, `StatusBadge`.
- Done when: components have stories or tests; the helper tests pass.

**M1.T12 — Certificate list page (paging only)**
- Table of serial, participant, course, issue date (in the `timezone` from the response), status; row links to detail.
- Pagination with page in the URL; explicit loading, empty and error states.
- Done when: works against the seeded API; component tests cover the three states.

**M1.T13 — Certificate detail page and revoke dialog**
- Serial, course, participant, issue date in the tenant timezone, status badge.
- "Revoke" opens a confirm dialog with an optional reason; button disabled while sending; on success the page refreshes the certificate and the list cache.
- 404 shows a "certificate not found" state.
- Done when: revoke works end to end; revoking twice shows no error.

---

## M2 — Search, bulk issue, export and audit log

| Task  | Area | Title                                               | Depends on    | Status | PR  |
|-------|------|-----------------------------------------------------|---------------|--------|-----|
| M2.T6 | FE   | List search, filter and sort UI                     | M2.T1         | todo   |     |
| M2.T7 | FE   | Bulk issue page with live progress                  | M2.T3         | todo   |     |
| M2.T8 | FE   | Export CSV button                                   | M2.T4, M2.T6  | todo   |     |
| M2.T9 | FE   | Audit log: certificate trail and issuance log page  | M2.T5         | todo   |     |

**M2.T6 — List search, filter and sort UI**
- Debounced search box (300 ms), status and course filters, clickable sortable headers with direction indicator; all state in URL search params; changing a filter resets to page 1.
- Two empty states ("no certificates yet" vs "no results for …" with clear-search); `keepPreviousData` while paging.
- Done when: reload and back button restore the same view; tests cover the two empty states.

**M2.T7 — Bulk issue page with live progress**
- Course picker → preview counts → "Issue N certificates".
- Reads the NDJSON stream: progress bar (`processed / total`) and a per-learner table with issued / skipped / failed and reason; summary at the end.
- Button disabled from click until the stream ends; navigation warning while running; network error shows what was done so far and a "run again" action (safe, spec §5.2).
- Done when: issuing a course shows progress and results; issuing it again shows all skipped.

**M2.T8 — Export CSV button**
- On the list page; uses the current URL filters; fetch with headers → Blob → download with the server's filename; shows a spinner and an error state.
- Done when: the downloaded file matches the filtered list.

**M2.T9 — Audit log: certificate trail and issuance log page**
- Certificate detail: "Audit trail" section from `GET /api/audit-events?certificateId=`.
- `/audit` page: issuance and revoke events with course and action filters and paging; each row shows actor, time in tenant timezone, course, participant, serial (links to the certificate).
- After a bulk issue run, a "View audit log" link opens `/audit` filtered to that course.
- Done when: events from a bulk issue and a revoke appear in both places with loading, empty and error states.

---

## M3 — Multi-tenancy

| Task  | Area  | Title                                              | Depends on    | Status | PR  |
|-------|-------|----------------------------------------------------|---------------|--------|-----|
| M3.T5 | FE    | Tenant switcher and tenant-aware API client        | M3.T2         | todo   |     |
| M3.T6 | FE    | Tenant timezone display everywhere                 | M3.T5, M3.T3  | todo   |     |

**M3.T5 — Tenant switcher and tenant-aware API client**
- Load `GET /api/tenants`; switcher in the header; selection saved in `localStorage` (wrapped in try/catch); default to the first tenant.
- API client sends the selected `tenant_id`; tenant code in every query key; switching clears the query cache and resets to `/certificates`.
- Done when: switching shows the other tenant's data with no flash of the previous one.

**M3.T6 — Tenant timezone display everywhere**
- Header shows tenant name and timezone (e.g. "Perth · AWST UTC+8").
- Every date (list, detail, audit, bulk results) formatted with the selected tenant's timezone, never the browser's.
- Done when: the seeded Perth New Year's Eve certificate shows 31 Dec 2026 in Perth; Sydney DST edge records show the right local times; tests for both.

---

## M4 — Final polish

| Task  | Area  | Title                                    | Depends on | Status | PR  |
|-------|-------|------------------------------------------|------------|--------|-----|
| M4.T2 | FE    | UX polish                                | M4.T1      | todo   |     |

**M4.T2 — UX polish**
- Consistent copy for errors and empty states; loading skeletons on tables; dialog focus trap and Escape; keyboard-accessible sortable headers; table usable on a narrow screen.
