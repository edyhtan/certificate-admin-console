/**
 * `npm run inspect`: browse each tenant database on the local MySQL server, read-only.
 * Interactive by default; `npm run inspect -- --help` lists the one-shot commands.
 */
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { input, select, Separator } from '@inquirer/prompts';
import { loadEnvFile } from '../../config/load-env-file.js';
import { parseArgs, USAGE, UsageError, type Command } from './args.js';
import {
  auditLog,
  certificateDetail,
  certificates,
  courseDetail,
  courses,
  lastPage,
  participantDetail,
  participants,
  readOnlyClient,
  summary,
  type CertificateFilter,
  type InspectorDb,
} from './queries.js';
import { discoverTenants, serverUrlFromEnv, type DiscoveredTenant } from './tenants.js';
import {
  renderAudit,
  renderCertificateDetail,
  renderCertificates,
  renderCourseDetail,
  renderCourses,
  renderParticipantDetail,
  renderParticipants,
  renderSummary,
  renderTenants,
  tenantLabel,
} from './views.js';

/** Opens read-only clients on tenant databases, once each. */
export class TenantConnections {
  private readonly clients = new Map<string, InspectorDb>();

  constructor(private readonly serverUrl: string) {}

  get(tenant: DiscoveredTenant): InspectorDb {
    let db = this.clients.get(tenant.database);
    if (!db) {
      db = readOnlyClient(`${this.serverUrl}/${tenant.database}`);
      this.clients.set(tenant.database, db);
    }
    return db;
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.clients.values()].map((db) => db.$disconnect()));
    this.clients.clear();
  }
}

export class NotFoundError extends Error {}

/** Runs one non-interactive view. Returns the text (or JSON) to print. */
export async function runView(
  db: InspectorDb,
  tenant: DiscoveredTenant,
  cmd: Extract<Command, { kind: 'view' }>,
): Promise<string> {
  const tz = tenant.timeZone;
  const out = (data: unknown, text: () => string) =>
    cmd.json ? JSON.stringify(data, null, 2) : text();
  const target = cmd.target ?? '';

  switch (cmd.view) {
    case 'summary': {
      const s = await summary(db);
      return out({ tenant, ...s }, () => renderSummary(tenant, s));
    }
    case 'courses': {
      const rows = await courses(db);
      return out(rows, () => renderCourses(rows));
    }
    case 'course': {
      const d = await courseDetail(db, target);
      if (!d) throw new NotFoundError(`no course "${target}" in ${tenant.code}`);
      return out(d, () => renderCourseDetail(d, tz));
    }
    case 'participants': {
      const p = await participants(db, cmd);
      return out(p, () => renderParticipants(p));
    }
    case 'participant': {
      const d = await participantDetail(db, target);
      if (!d) throw new NotFoundError(`no participant "${target}" in ${tenant.code}`);
      return out(d, () => renderParticipantDetail(d, tz));
    }
    case 'certificates': {
      const p = await certificates(db, cmd);
      return out(p, () => renderCertificates(p, tz, filterLabel(cmd)));
    }
    case 'certificate': {
      const d = await certificateDetail(db, target);
      if (!d) throw new NotFoundError(`no certificate "${target}" in ${tenant.code}`);
      return out(d, () => renderCertificateDetail(d, tz));
    }
    case 'audit': {
      const p = await auditLog(db, cmd);
      return out(p, () => renderAudit(p, tz));
    }
  }
}

function filterLabel(f: CertificateFilter): string | undefined {
  const parts = [
    f.q ? `search "${f.q}"` : undefined,
    f.status ? `status ${f.status}` : undefined,
  ].filter(Boolean);
  return parts.length ? `Filter: ${parts.join(', ')}` : undefined;
}

/** The tenant with this code, or an error that lists the codes there are. */
export function findTenant(
  tenants: readonly DiscoveredTenant[],
  code: string,
): DiscoveredTenant {
  const tenant = tenants.find((t) => t.code === code.toUpperCase());
  if (!tenant) {
    const available = tenants.map((t) => t.code).join(', ') || 'none';
    throw new NotFoundError(`no tenant database for ${code.toUpperCase()} (available: ${available})`);
  }
  return tenant;
}

// ---- interactive ---------------------------------------------------------------------------

const BACK = Symbol('back');
const NEXT = Symbol('next');
const PREV = Symbol('prev');

function heading(tenant: DiscoveredTenant, title: string): void {
  console.log(`\n── ${tenant.code} · ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`);
}

function pageChoices(page: number, pages: number) {
  return [
    ...(page < pages ? [{ name: 'Next page', value: NEXT }] : []),
    ...(page > 1 ? [{ name: 'Previous page', value: PREV }] : []),
  ];
}

class Browser {
  constructor(
    private readonly connections: TenantConnections,
    private readonly server: PrismaClient,
    private readonly serverUrl: string,
  ) {}

  async run(startCode?: string): Promise<void> {
    let tenants = await discoverTenants(this.server);
    console.log(`Tenant databases on ${this.serverUrl}:\n${renderTenants(tenants, this.serverUrl)}`);
    if (tenants.length === 0) return;

    let current: DiscoveredTenant | undefined;
    if (startCode) {
      try {
        current = findTenant(tenants, startCode);
      } catch (error) {
        console.log(`\n${(error as Error).message}`);
      }
    }

    for (;;) {
      if (!current) {
        const picked = await select<DiscoveredTenant | 'refresh' | 'quit'>({
          message: 'Tenant',
          choices: [
            ...tenants.map((t) => ({ name: tenantLabel(t), value: t })),
            new Separator(),
            { name: 'Refresh tenant list', value: 'refresh' },
            { name: 'Quit', value: 'quit' },
          ],
        });
        if (picked === 'quit') return;
        if (picked === 'refresh') {
          tenants = await discoverTenants(this.server);
          console.log(renderTenants(tenants, this.serverUrl));
          continue;
        }
        current = picked;
      }
      const next = await this.tenantMenu(current);
      if (next === 'quit') return;
      current = undefined; // switch tenant
    }
  }

  private async tenantMenu(t: DiscoveredTenant): Promise<'switch' | 'quit'> {
    const db = this.connections.get(t);
    heading(t, `${t.name} (${t.known ? t.timeZone : 'UTC'})`);
    console.log(renderSummary(t, await summary(db)));
    for (;;) {
      const choice = await select({
        message: `${t.code} · ${t.name}`,
        choices: [
          { name: 'Summary', value: 'summary' },
          { name: 'Courses', value: 'courses' },
          { name: 'Participants', value: 'participants' },
          { name: 'Certificates (search, filter)', value: 'certificates' },
          { name: 'Find a certificate by serial', value: 'find' },
          { name: 'Audit log', value: 'audit' },
          new Separator(),
          { name: 'Switch tenant', value: 'switch' },
          { name: 'Quit', value: 'quit' },
        ],
      });
      switch (choice) {
        case 'summary':
          heading(t, 'Summary');
          console.log(renderSummary(t, await summary(db)));
          break;
        case 'courses':
          await this.courses(t, db);
          break;
        case 'participants':
          await this.participants(t, db);
          break;
        case 'certificates':
          await this.certificates(t, db);
          break;
        case 'find': {
          const serial = await input({ message: 'Serial (or certificate id)' });
          if (serial.trim()) await this.certificate(t, db, serial.trim());
          break;
        }
        case 'audit':
          await this.audit(t, db);
          break;
        case 'switch':
          return 'switch';
        case 'quit':
          return 'quit';
      }
    }
  }

  private async courses(t: DiscoveredTenant, db: InspectorDb): Promise<void> {
    for (;;) {
      const rows = await courses(db);
      heading(t, 'Courses');
      console.log(renderCourses(rows));
      const picked = await select<string | typeof BACK>({
        message: 'Open a course',
        choices: [
          ...rows.map((c) => ({ name: `${c.code} — ${c.title}`, value: c.code })),
          new Separator(),
          { name: 'Back', value: BACK },
        ],
      });
      if (picked === BACK) return;
      await this.course(t, db, picked);
    }
  }

  private async course(t: DiscoveredTenant, db: InspectorDb, code: string): Promise<void> {
    for (;;) {
      const d = await courseDetail(db, code);
      if (!d) return console.log(`No course ${code}.`);
      heading(t, `Course ${d.course.code}`);
      console.log(renderCourseDetail(d, t.timeZone));
      const picked = await select<string | typeof BACK>({
        message: 'Open',
        choices: [
          ...d.enrollments
            .filter((e) => e.certificate)
            .map((e) => ({
              name: `Certificate ${e.certificate!.serial} — ${e.participantName}`,
              value: e.certificate!.serial,
            })),
          new Separator(),
          { name: 'Back', value: BACK },
        ],
      });
      if (picked === BACK) return;
      await this.certificate(t, db, picked);
    }
  }

  private async participants(t: DiscoveredTenant, db: InspectorDb): Promise<void> {
    let page = 1;
    for (;;) {
      const p = await participants(db, { page });
      heading(t, 'Participants');
      console.log(renderParticipants(p));
      const picked = await select<number | symbol>({
        message: 'Participants',
        choices: [
          ...pageChoices(p.page, lastPage(p.total, p.pageSize)),
          ...p.items.map((r) => ({ name: `Open ${r.name} <${r.email}>`, value: r.id })),
          new Separator(),
          { name: 'Back', value: BACK },
        ],
      });
      if (picked === BACK) return;
      if (picked === NEXT) page++;
      else if (picked === PREV) page--;
      else await this.participant(t, db, String(picked));
    }
  }

  private async participant(t: DiscoveredTenant, db: InspectorDb, id: string): Promise<void> {
    for (;;) {
      const d = await participantDetail(db, id);
      if (!d) return console.log(`No participant ${id}.`);
      heading(t, d.participant.name);
      console.log(renderParticipantDetail(d, t.timeZone));
      const picked = await select<string | typeof BACK>({
        message: 'Open',
        choices: [
          ...d.enrollments
            .filter((e) => e.certificate)
            .map((e) => ({
              name: `Certificate ${e.certificate!.serial} — ${e.courseTitle}`,
              value: e.certificate!.serial,
            })),
          new Separator(),
          { name: 'Back', value: BACK },
        ],
      });
      if (picked === BACK) return;
      await this.certificate(t, db, picked);
    }
  }

  private async certificates(t: DiscoveredTenant, db: InspectorDb): Promise<void> {
    const ask = async (): Promise<CertificateFilter> => {
      const q = (await input({ message: 'Search name or serial prefix (empty for all)' })).trim();
      const status = await select<'valid' | 'revoked' | 'any'>({
        message: 'Status',
        choices: [
          { name: 'Any', value: 'any' },
          { name: 'Valid', value: 'valid' },
          { name: 'Revoked', value: 'revoked' },
        ],
      });
      return { q: q || undefined, status: status === 'any' ? undefined : status, page: 1 };
    };
    let filter = await ask();
    for (;;) {
      const p = await certificates(db, filter);
      heading(t, 'Certificates');
      console.log(renderCertificates(p, t.timeZone, filterLabel(filter)));
      const picked = await select<string | symbol>({
        message: 'Certificates',
        choices: [
          ...pageChoices(p.page, lastPage(p.total, p.pageSize)),
          ...p.items.map((c) => ({ name: `Open ${c.serial} — ${c.participantName}`, value: c.serial })),
          new Separator(),
          { name: 'New search', value: 'search' },
          { name: 'Back', value: BACK },
        ],
      });
      if (picked === BACK) return;
      if (picked === NEXT) filter = { ...filter, page: p.page + 1 };
      else if (picked === PREV) filter = { ...filter, page: p.page - 1 };
      else if (picked === 'search') filter = await ask();
      else if (typeof picked === 'string') await this.certificate(t, db, picked);
    }
  }

  private async certificate(t: DiscoveredTenant, db: InspectorDb, serial: string): Promise<void> {
    const d = await certificateDetail(db, serial);
    if (!d) {
      console.log(`No certificate "${serial}" in ${t.code}.`);
      return;
    }
    heading(t, `Certificate ${d.serial}`);
    console.log(renderCertificateDetail(d, t.timeZone));
    await select({ message: 'Done reading?', choices: [{ name: 'Back', value: BACK }] });
  }

  private async audit(t: DiscoveredTenant, db: InspectorDb): Promise<void> {
    let page = 1;
    for (;;) {
      const p = await auditLog(db, { page });
      heading(t, 'Audit log');
      console.log(renderAudit(p, t.timeZone));
      const picked = await select<string | symbol>({
        message: 'Audit log',
        choices: [
          ...pageChoices(p.page, lastPage(p.total, p.pageSize)),
          ...p.items.map((a) => ({
            name: `Open ${a.serial} (${a.action}, ${a.participantName})`,
            value: a.serial,
          })),
          new Separator(),
          { name: 'Back', value: BACK },
        ],
      });
      if (picked === BACK) return;
      if (picked === NEXT) page++;
      else if (picked === PREV) page--;
      else if (typeof picked === 'string') await this.certificate(t, db, picked);
    }
  }
}

// ---- entry point ---------------------------------------------------------------------------

function isUnreachable(error: unknown): boolean {
  const e = error as { code?: string; errorCode?: string; message?: string };
  return (
    e?.errorCode === 'P1001' ||
    e?.code === 'P1001' ||
    /Can't reach database server/i.test(e?.message ?? '')
  );
}

export async function main(argv: readonly string[]): Promise<number> {
  let cmd: Command;
  try {
    cmd = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`${error.message}\n\nRun \`npm run inspect -- --help\` for usage.`);
      return 2;
    }
    throw error;
  }
  if (cmd.kind === 'help') {
    console.log(USAGE);
    return 0;
  }

  loadEnvFile();
  const serverUrl = serverUrlFromEnv(process.env);
  const server = new PrismaClient({ datasourceUrl: `${serverUrl}/information_schema` });
  const connections = new TenantConnections(serverUrl);
  const shown = new URL(serverUrl).host;
  try {
    if (cmd.kind === 'interactive') {
      await new Browser(connections, server, shown).run(cmd.tenant);
      return 0;
    }
    const tenants = await discoverTenants(server);
    if (cmd.kind === 'tenants') {
      console.log(cmd.json ? JSON.stringify(tenants, null, 2) : renderTenants(tenants, shown));
      return 0;
    }
    const tenant = findTenant(tenants, cmd.tenant);
    console.log(await runView(connections.get(tenant), tenant, cmd));
    return 0;
  } catch (error) {
    if ((error as Error)?.name === 'ExitPromptError') return 0; // Ctrl+C in a prompt
    if (error instanceof NotFoundError) {
      console.error(error.message);
      return 1;
    }
    if (isUnreachable(error)) {
      console.error(
        `Can't reach MySQL at ${shown}. Start it with \`docker compose up -d --wait\` (or \`npm run dev\`).`,
      );
      return 1;
    }
    throw error;
  } finally {
    await connections.closeAll();
    await server.$disconnect();
  }
}

// Run only as a script, not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
