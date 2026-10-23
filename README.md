# Certificate Admin Console

An internal admin console for a multi-tenant corporate training platform. Each tenant (a city: Sydney, Perth, Adelaide) runs training courses for its participants. When a course finishes, the tenant's admin issues completion certificates here, reviews them, revokes them when needed and exports them.

- **Certificate list** for the selected tenant: search by participant name or serial number, filter, sort and page, with clear loading, empty and error states.
- **Bulk issue**: pick a course and issue certificates to every participant who completed it, with live progress and an issued / skipped / failed result per participant. Running it again is safe: nobody gets a second certificate.
- **Certificate detail** with the issue date in the tenant's timezone, status (valid / revoked), a revoke action with confirmation, and the certificate's audit trail.
- **CSV export** of the current search and filters, streamed so it stays correct as the data grows.
- **Audit log** of every issue and revoke: who, when, which course and which participant.
- **Tenant switcher**: each tenant's data lives in its own database, and every date is shown in that tenant's timezone, daylight saving included.

## Quick start (Docker)

Needs Docker with Compose v2. From the repo root:

```bash
docker compose --profile app up --build
```

Then open **http://localhost:8080**.

The first start builds the images, starts MySQL, then creates, migrates and seeds a database for each tenant before the API starts. Later starts reuse the data and skip seeding. Stop with `Ctrl+C`; to start again from fresh demo data:

```bash
docker compose --profile app down -v     # -v deletes the database volume
docker compose --profile app up --build
```

| Service | URL | Notes |
|---------|-----|-------|
| Web app | http://localhost:8080 | nginx serves the app and forwards `/api` to the API. Change the port with `WEB_PORT=9090 docker compose --profile app up --build` |
| API | http://localhost:8080/api | Through the web container, e.g. `curl localhost:8080/api/health`. Every route except `/api/health` and `/api/tenants` needs a `tenant_id: SYD` (or `PER`, `ADL`) header |
| MySQL | `127.0.0.1:3307` | User `root`, password `root`. Change with `MYSQL_PORT` |

Without the `app` profile, `docker compose up` starts MySQL only. That is what local development and the tests use.

## Demo data

Each tenant is seeded with the same fixed data on every fresh start (no random values). There is no login: every request acts as the tenant's `admin` user.

| Tenant | Code | Timezone | What it shows |
|--------|------|----------|---------------|
| Sydney | `SYD` | Australia/Sydney (AEST +10 / AEDT +11) | A small tenant: 3 courses, 15 participants, a few certificates (one revoked), and participants eligible in every course. Certificates sit on the edge cases: 00:30 on New Year's Day (still 31 Dec in UTC) and either side of both daylight saving changes |
| Perth | `PER` | Australia/Perth (AWST +8, no daylight saving) | Deliberately empty apart from its courses: the "no certificates yet" state, a bulk issue preview of 0, empty export and audit log |
| Adelaide | `ADL` | Australia/Adelaide (ACST +9:30 / ACDT +10:30) | The large tenant: 250 participants and about 150 certificates, so paging, search, sorting and export have real volume. Half-hour offset with daylight saving |

Things to try:

1. In **Sydney**, search `nguyen`: the search ignores accents and finds *Bảo Nguyễn*. Open the revoked certificate to see its reason and audit trail.
2. Open **Bulk issue**, pick *First Aid Essentials* and issue. Run it again: everyone comes back as skipped and no extra audit entries appear.
3. Switch to **Adelaide**, sort by participant, page through, and export the filtered list as CSV.
4. Switch to **Perth** to see the empty states.

## Local development

Needs Node 24+ and Docker (for MySQL).

```bash
npm install
npm run dev
```

`npm run dev` creates `backend_service/.env` from `.env.example` if it is missing, starts MySQL in Docker, creates / migrates / seeds the tenant databases (`npm run db:setup`, safe to repeat), then runs the API with watch mode and the Vite dev server together.

| Service | URL |
|---------|-----|
| Web (Vite) | http://localhost:5173 (proxies `/api` to the API) |
| API | http://localhost:3000/api |
| MySQL | `127.0.0.1:3307` |

More detail, including how to change ports, is in [`docs/local-services.md`](docs/local-services.md).

### Useful commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | MySQL + database setup + API + web |
| `npm run dev:api` | Same, without the web app |
| `npm run db:setup` | Create, migrate and seed any tenant database that is missing |
| `npm run db:down` | Stop MySQL (data is kept in the Docker volume) |
| `npm test` | Unit tests for every package |
| `npm run test:all` | Unit tests plus the API end-to-end tests (needs Docker; they use their own throwaway databases) |
| `npm run lint` / `npm run typecheck` | oxlint and TypeScript across all packages |

## How it is built

| Part | Stack |
|------|-------|
| `backend_service/` | NestJS 12, Prisma 6, MySQL 8.4 |
| `web/` | React 19, Vite, TanStack Query, React Router |
| `shared/` | `@cert/shared`: the API contract as zod schemas and types, used by both sides |

- **One database per tenant.** Tenants are listed in code (`backend_service/src/tenancy/tenants.ts`), each with its timezone and its own database (`cert_syd`, `cert_per`, `cert_adl`). The `tenant_id` request header picks the database, so one tenant's request can never reach another tenant's rows. The business code never sees a tenant at all; a thin tenancy layer hands it the right database and timezone.
- **Times** are stored in UTC and shown in the tenant's IANA timezone, never a fixed offset, so daylight saving is handled. Certificate serials (`SYD-2026-000123`) use the tenant's local year.
- **Bulk issue is safe to repeat** because the database allows only one certificate per enrollment. Each participant is issued in its own transaction together with its audit entry, so a retry only adds what is missing and only audits what it actually wrote. Progress streams to the browser as one JSON line per participant.
- **The audit log is append-only**: database triggers reject any update or delete.

Further reading:

- [`docs/spec.md`](docs/spec.md): requirements, domain model, behaviour and the decision log
- [`docs/api.md`](docs/api.md): every endpoint, its request, response and errors
- [`docs/milestones.md`](docs/milestones.md), [`docs/backend_task.md`](docs/backend_task.md), [`docs/frontend_task.md`](docs/frontend_task.md): the plan and task ledgers
- [`AGENTS.md`](AGENTS.md): how the work is organised (branches, PRs, tests) for people and AI agents

## Troubleshooting

- **Port already in use**: set `WEB_PORT` or `MYSQL_PORT` for Docker, or see [`docs/local-services.md`](docs/local-services.md) for the dev servers.
- **The API container keeps restarting**: `docker compose --profile app logs api` shows the database setup and start-up output.
- **Start over with fresh demo data**: `docker compose --profile app down -v`, then start again.
- **Requests return `400 unknown_tenant`**: send a `tenant_id` header with `SYD`, `PER` or `ADL`. If a proxy sits in front of the API, it must pass headers with underscores (nginx: `underscores_in_headers on;`, as in [`docker/nginx.conf`](docker/nginx.conf)).
