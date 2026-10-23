# Local services

Ports, start commands and checks for running the stack on one machine. Frontend agents use this to start (or find) the API before running the web app against it.

## Ports

| Service | URL | Port setting | Notes |
|---------|-----|--------------|-------|
| API (`backend_service`) | `http://localhost:3000/api` | `API_PORT` in `backend_service/.env` (default `3000`) | Every route is under `/api` (see `docs/api.md`) |
| Web (`web`, Vite dev server) | `http://localhost:5173` | Vite default | Proxies `/api/*` to `http://localhost:${API_PORT ?? 3000}`, so the browser and web code call relative `/api/...` paths |
| MySQL (Docker Compose) | `127.0.0.1:3307` | `MYSQL_PORT` (default `3307`) | Host port 3307, not 3306, so it doesn't clash with a local MySQL (D49). Dev database `cert_syd`, user `root` / `root` |

Changing the API port takes two places: `API_PORT` in `backend_service/.env` for the API, and `API_PORT` in the environment of the web dev server (Vite reads `process.env.API_PORT`, not the backend's `.env`):

```bash
API_PORT=3001 npm run dev -w web
```

## Is the API already running?

```bash
curl -s localhost:3000/api/health
# {"status":"ok","checks":{"database":{"status":"up","durationMs":1}}}
```

- `200` with `"status":"ok"`: running and the database answers. Don't start a second copy; the port is taken.
- `503` with `"database":{"status":"down"}`: the API runs but MySQL doesn't. Run `npm run db:up`.
- Connection refused: nothing on port 3000. Start it (below).

`lsof -nP -iTCP:3000 -sTCP:LISTEN` shows which process holds the port.

## Start

Docker must be running. All commands run from the repo root.

| Want | Command | What it does |
|------|---------|--------------|
| API and web together | `npm run dev` | Creates `backend_service/.env` if missing, starts MySQL and waits until healthy, migrates and seeds, then runs API (watch mode) and web |
| API only (for FE work) | `npm run dev:api` | Same set-up, then only the API in watch mode on `:3000` |
| Web only, API already up | `npm run dev -w web` | Vite on `:5173`, proxying `/api` to `:3000` |
| API from the production build | `npm run build -w @cert/shared && npm run build -w backend_service && npm run start:prod -w backend_service` | Needs MySQL up and seeded first (`npm run db:up && npm run db:setup`) |

Stop: `Ctrl+C` in the terminal that runs it. `npm run db:down` stops MySQL (the data stays in a Docker volume).

## Data

- Every request except `GET /api/health` and `GET /api/tenants` needs `tenant_id: SYD`, `PER` or `ADL` (exact, upper case); anything else is `400 unknown_tenant`. Each code has its own database (`cert_syd`, `cert_per`, `cert_adl`).
- `db:setup` creates, migrates and seeds each tenant database once (D61). Running it again changes nothing.
  - `SYD` Sydney (`cert_syd`): 3 courses, 15 participants, 6 certificates (one revoked).
  - `PER` Perth (`cert_per`): 3 courses and nothing else, for empty states.
  - `ADL` Adelaide (`cert_adl`): 3 courses, 250 participants, 150 certificates (one revoked), about 8 list pages.
- Start over with fresh seed data: `docker compose down -v && npm run db:setup` (deletes the MySQL volume, including anything you created).
- API tests never touch these: each run creates and drops its own `cert_test_…` database per tenant.

## Quick checks

```bash
curl -s localhost:3000/api/courses -H 'tenant_id: SYD'
curl -s 'localhost:3000/api/certificates?page=1&pageSize=3' -H 'tenant_id: SYD'
curl -s localhost:3000/api/certificates/1 -H 'tenant_id: SYD'
```

Endpoints available in M1: health, courses (list, create), participants (create), certificates (list with paging, detail, revoke). Search, filters, sort, bulk issue, CSV export, audit log and tenants arrive in M2 and M3 (`docs/api.md` describes them already).
