# API contract

The HTTP API between `web` and `backend_service`. The schemas and types live in the `@cert/shared` workspace (`shared/src/contract/`); this page explains them. Both apps import the same zod schemas, so a request the web app validates is the request the API accepts. Design reasons are in `docs/spec.md` (§5 and the decision log).

`shared/src/contract/endpoints.ts` lists every endpoint, and a test checks that each one (and each error code) appears on this page.

## Conventions

- **Base path:** every route starts with `/api`. Locally the API listens on `http://localhost:3000` (`API_PORT`) and the web dev server proxies `/api` to it; see `docs/local-services.md`.
- **Tenant header:** every route except `GET /api/health` and `GET /api/tenants` needs `tenant_id: <tenant code>` (e.g. `SYD`). A missing or unknown code returns `400 unknown_tenant`; the code must match exactly (`SYD`, not `syd`). Paths never contain the tenant.
- **Times:** responses carry instants as UTC ISO-8601 strings ending in `Z` (`2026-12-31T15:30:00.000Z`). Any response with instants also carries the tenant's IANA `timezone`; the web app formats dates in that zone, never the browser's (spec §4).
- **Ids:** positive integers. An id from another tenant is simply not found (`404`).
- **Query strings:** an empty parameter (`?q=`) counts as not given. Numbers are parsed from strings.
- **Lists** return `{ items, page, pageSize, total, timezone }`. `page` starts at 1; `pageSize` defaults to 20 and is at most 100.
- **Validation:** bodies and queries are checked against the shared schemas on both sides. Strings are trimmed; unknown fields are ignored.

## Errors

Every error has the same body:

```json
{ "error": "validation_failed", "message": "Some fields are not valid", "fields": { "email": "must be a valid email address" } }
```

| Code | Status | When | `fields` |
|------|--------|------|----------|
| `validation_failed` | 400 | Body, query or path parameter fails its schema | One message per bad field (dotted path for nested fields; `body` / `query` when the whole input is wrong) |
| `bad_request` | 400 | Malformed request, e.g. invalid JSON | — |
| `unknown_tenant` | 400 | `tenant_id` missing or not a registered tenant | — |
| `not_found` | 404 | Unknown route or record (including another tenant's ids) | — |
| `method_not_allowed` | 405 | Wrong HTTP method | — |
| `duplicate` | 409 | A unique value is already used (course `code`, participant `email`) | Names the field, e.g. `{ "code": "is already in use" }` |
| `payload_too_large` | 413 | Body over the size limit | — |
| `unsupported_media_type` | 415 | Body type the API doesn't read | — |
| `internal_error` | 500 | Anything unexpected. Never includes details | — |

## Endpoints

| Endpoint | Tenant header | Request | Success | Errors (besides `internal_error`) |
|----------|---------------|---------|---------|------------------------------------|
| `GET /api/health` | no | — | `200` / `503` `HealthReport` | — |
| `GET /api/tenants` | no | — | `200` `TenantListResponse` | — |
| `GET /api/courses` | yes | — | `200` `CourseListResponse` | `unknown_tenant` |
| `POST /api/courses` | yes | `CreateCourseRequest` | `201` `Course` | `unknown_tenant`, `validation_failed`, `bad_request`, `duplicate` |
| `POST /api/participants` | yes | `CreateParticipantRequest` | `201` `Participant` | `unknown_tenant`, `validation_failed`, `bad_request`, `duplicate` |
| `GET /api/certificates` | yes | `CertificateListParams` (query) | `200` `CertificateListResponse` | `unknown_tenant`, `validation_failed` |
| `GET /api/certificates/export.csv` | yes | `CertificateExportParams` (query) | `200` CSV file | `unknown_tenant`, `validation_failed` |
| `GET /api/certificates/:id` | yes | `id` | `200` `CertificateDetail` | `unknown_tenant`, `validation_failed`, `not_found` |
| `POST /api/certificates/:id/revoke` | yes | `id`, `RevokeCertificateRequest` | `200` `CertificateDetail` | `unknown_tenant`, `validation_failed`, `bad_request`, `not_found` |
| `GET /api/issuances/preview` | yes | `courseId` (query) | `200` `IssuancePreviewResponse` | `unknown_tenant`, `validation_failed`, `not_found` |
| `POST /api/issuances` | yes | `IssueCertificatesRequest` | `200` NDJSON stream of `IssuanceEvent` | `unknown_tenant`, `validation_failed`, `bad_request`, `not_found` |
| `GET /api/audit-events` | yes | `AuditEventListParams` (query) | `200` `AuditEventListResponse` | `unknown_tenant`, `validation_failed` |

### `GET /api/health`

No tenant header (D50). Each check is `up` or `down` with its duration; reasons go to the server log only. Every tenant has two checks: its database answers, and its `admin` row (the actor writes need) loads (D61, D60).

```json
{ "status": "ok", "checks": {
  "database:SYD": { "status": "up", "durationMs": 1 }, "admin:SYD": { "status": "up", "durationMs": 1 },
  "database:PER": { "status": "up", "durationMs": 1 }, "admin:PER": { "status": "up", "durationMs": 1 },
  "database:ADL": { "status": "up", "durationMs": 1 }, "admin:ADL": { "status": "up", "durationMs": 1 } } }
```

`503` with `"status": "error"` when any check is down. Sent with `Cache-Control: no-store`.

### `GET /api/tenants`

```json
{ "items": [{ "code": "SYD", "name": "Sydney", "timezone": "Australia/Sydney" }] }
```

Never includes database names (D27).

### Courses and participants (spec §5.6)

`GET /api/courses` returns `{ items: Course[] }`, all courses sorted by title. `Course` is `{ id, code, title }`.

`POST /api/courses` body `{ code, title }`:
- `code`: trimmed, upper-cased, then 2–20 of `A–Z 0–9 -` (`" fa-101 "` is saved as `FA-101`).
- `title`: 1–200 characters after trimming.

`POST /api/participants` body `{ firstName, lastName, email }`:
- names: 1–100 characters after trimming; accents and apostrophes are fine.
- `email`: trimmed and lower-cased before saving, so `Ana@X.com` and `ana@x.com` are the same person.

Both answer `201` with the saved record. A duplicate `code` or `email` in this tenant answers `409 duplicate` naming the field.

### `GET /api/certificates` (spec §5.3)

| Query | Values | Default |
|-------|--------|---------|
| `q` | Partial match on participant name, or prefix match on serial. Case- and accent-insensitive (`nguyen` finds `Nguyễn`). At most 100 characters | none |
| `status` | `valid` \| `revoked` | any |
| `courseId` | course id | any |
| `sort` | `issued_at` \| `participant_name` \| `serial` \| `course_title`. Anything else is `400` | `issued_at` |
| `order` | `asc` \| `desc` | `desc` for `issued_at`, `asc` for the others |
| `page`, `pageSize` | see Conventions | 1, 20 |

The id is always added as a tie-breaker, so pages are stable. Response:

```json
{
  "items": [{
    "id": 18, "serial": "SYD-2026-000018",
    "participantId": 7, "participantName": "Ana O'Neil",
    "courseId": 2, "courseTitle": "First Aid",
    "status": "valid", "issuedAt": "2026-04-04T23:00:00.000Z", "revokedAt": null
  }],
  "page": 1, "pageSize": 20, "total": 1, "timezone": "Australia/Sydney"
}
```

### `GET /api/certificates/export.csv` (spec §5.5)

Takes the list's `q`, `status`, `courseId`, `sort` and `order` (no paging) and exports every match, in the same order as the screen.

- `Content-Type: text/csv; charset=utf-8`, UTF-8 with BOM.
- `Content-Disposition: attachment; filename="certificates-<tenant code>-<local date>.csv"`.
- Columns: `learner_name, course_title, serial_number, issue_date, status`. `issue_date` is the tenant-local `YYYY-MM-DD`.
- RFC 4180 quoting; cells starting with `= + - @` get a leading `'` so spreadsheets don't run them.

A plain link can't send the tenant header, so the web app fetches the file and saves it (D26).

### `GET /api/certificates/:id` and `POST /api/certificates/:id/revoke` (spec §5.4)

Both return `CertificateDetail`: the list fields plus `enrollmentId`, `issuedBy`, `revokedBy` (`{ id, name }` or `null`), `revokeReason` and `timezone`. The audit trail comes from `GET /api/audit-events?certificateId=`.

Revoke body `{ reason? }` (optional; blank means none; at most 500 characters; an empty body is fine). `valid` becomes `revoked` and a `certificate.revoked` audit event is written. Revoking a revoked certificate answers `200` with its current state and writes nothing.

### `GET /api/issuances/preview` and `POST /api/issuances` (spec §5.2)

`GET /api/issuances/preview?courseId=` → `{ courseId, completed, alreadyIssued, eligible }`, so the page can say "Issue N certificates". Unknown course → `404`.

`POST /api/issuances` body `{ courseId }` issues to every eligible learner of the course, each in its own transaction. Bad body or unknown course fail before the stream starts, with the normal error shape. Otherwise the response is `200` `application/x-ndjson`, one JSON object per line:

```
{"type":"start","total":14}
{"type":"result","enrollmentId":7,"participantName":"Ana O'Neil","outcome":"issued","serial":"SYD-2026-000018"}
{"type":"result","enrollmentId":8,"participantName":"Bao Nguyễn","outcome":"skipped","reason":"already_issued"}
{"type":"result","enrollmentId":9,"participantName":"Cy Lee","outcome":"failed","message":"Lock wait timeout"}
{"type":"done","issued":11,"skipped":2,"failed":1}
```

- `skipped` reasons: `already_issued`, `revoked`. A skip writes nothing and uses no serial.
- `failed` leaves nothing behind; the next run tries that learner again.
- Running the same course again is safe: already-issued learners come back as skipped. The server finishes the run even if the client disconnects.

### `GET /api/audit-events` (spec §5.7)

Query: `certificateId`, `courseId`, `action` (`certificate.issued` \| `certificate.revoked`), `page`, `pageSize`. Newest first. Each event:

```json
{
  "id": 3, "occurredAt": "2026-04-05T02:30:00.000Z", "action": "certificate.revoked",
  "actor": { "id": 1, "name": "Administrator" },
  "courseId": 2, "courseTitle": "First Aid",
  "participantId": 7, "participantName": "Ana O'Neil",
  "certificateId": 18, "serial": "SYD-2026-000018",
  "details": { "reason": "Name misspelt" }
}
```

Who and what are copied onto the event when it is written, so it reads on its own. The list response has the usual `{ items, page, pageSize, total, timezone }`.

## Using the contract

```ts
import {
  endpoints, buildPath, TENANT_HEADER,
  certificateListQuerySchema, certificateListResponseSchema, type CertificateListParams,
} from '@cert/shared';

// web: validate what the server sent
const page = certificateListResponseSchema.parse(await res.json());

// API: validate what the client sent (ZodValidationPipe)
@Get() list(@Query(new ZodValidationPipe(certificateListQuerySchema)) query: CertificateListQuery) {}
```

`shared` builds to `shared/dist` on `npm install`. After changing a schema, run `npm run build -w @cert/shared` (or keep `npm run dev -w @cert/shared` running).
