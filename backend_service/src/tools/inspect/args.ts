/** Command-line parsing for `npm run inspect`. Pure. */

export const VIEWS = [
  'summary',
  'courses',
  'course',
  'participants',
  'participant',
  'certificates',
  'certificate',
  'audit',
] as const;
export type View = (typeof VIEWS)[number];

/** Views that need a target: a course code, participant email or certificate serial (or an id). */
const NEEDS_TARGET: ReadonlySet<View> = new Set(['course', 'participant', 'certificate']);

export type Command =
  | { kind: 'help' }
  | { kind: 'interactive'; tenant?: string }
  | { kind: 'tenants'; json: boolean }
  | {
      kind: 'view';
      tenant: string;
      view: View;
      target?: string;
      q?: string;
      status?: 'valid' | 'revoked';
      action?: string;
      page?: number;
      pageSize?: number;
      json: boolean;
    };

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export const USAGE = `Inspect tenant data (read-only).

Usage:
  npm run inspect                          interactive: pick a tenant, then browse
  npm run inspect -- <TENANT>              interactive, starting in that tenant
  npm run inspect -- tenants               list tenant databases on the server
  npm run inspect -- <TENANT> <view> [target] [options]

Views:
  summary                    counts, eligible enrollments, serial counters
  courses                    courses with enrollment and certificate counts
  course <code|id>           one course and its enrollments
  participants               participants (paged)
  participant <email|id>     one participant and their enrollments
  certificates               certificates, newest first (paged)
  certificate <serial|id>    one certificate and its audit trail
  audit                      audit events, newest first (paged)

Options:
  --q <text>                 certificates: name contains text, or serial starts with it
  --status <valid|revoked>   certificates: only this status
  --action <name>            audit: only this action, e.g. certificate.revoked
  --page <n>                 page number (from 1)
  --page-size <n>            rows per page (1-100, default 15)
  --json                     print JSON instead of a table
  -h, --help                 show this help

Examples:
  npm run inspect -- SYD summary
  npm run inspect -- SYD certificates --q nguyen
  npm run inspect -- SYD certificate SYD-2026-000002
`;

const TENANT_CODE = /^[A-Za-z]{3}$/;

function positiveInt(flag: string, value: string | undefined): number {
  if (value === undefined || !/^\d+$/.test(value) || Number(value) < 1) {
    throw new UsageError(`${flag} needs a whole number of 1 or more`);
  }
  return Number(value);
}

/** Parses the arguments after `npm run inspect --`. Throws UsageError on bad input. */
export function parseArgs(argv: readonly string[]): Command {
  const positional: string[] = [];
  const options: {
    q?: string;
    status?: 'valid' | 'revoked';
    action?: string;
    page?: number;
    pageSize?: number;
    json: boolean;
  } = { json: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new UsageError(`${arg} needs a value`);
      }
      i++;
      return value;
    };
    switch (arg) {
      case '-h':
      case '--help':
        return { kind: 'help' };
      case '--json':
        options.json = true;
        break;
      case '--q':
        options.q = next();
        break;
      case '--status': {
        const value = next();
        if (value !== 'valid' && value !== 'revoked') {
          throw new UsageError('--status must be valid or revoked');
        }
        options.status = value;
        break;
      }
      case '--action':
        options.action = next();
        break;
      case '--page':
        options.page = positiveInt(arg, argv[++i]);
        break;
      case '--page-size': {
        const size = positiveInt(arg, argv[++i]);
        if (size > 100) throw new UsageError('--page-size can be at most 100');
        options.pageSize = size;
        break;
      }
      default:
        if (arg.startsWith('-')) throw new UsageError(`unknown option ${arg}`);
        positional.push(arg);
    }
  }

  const [first, second, third, ...rest] = positional;
  if (first === undefined) return { kind: 'interactive' };
  if (first === 'tenants') {
    if (second !== undefined) throw new UsageError('tenants takes no arguments');
    return { kind: 'tenants', json: options.json };
  }
  if (!TENANT_CODE.test(first)) {
    throw new UsageError(`"${first}" is not a tenant code (3 letters, e.g. SYD) or "tenants"`);
  }
  const tenant = first.toUpperCase();
  if (second === undefined) return { kind: 'interactive', tenant };
  if (!(VIEWS as readonly string[]).includes(second)) {
    throw new UsageError(`unknown view "${second}". Views: ${VIEWS.join(', ')}`);
  }
  const view = second as View;
  if (NEEDS_TARGET.has(view) && third === undefined) {
    throw new UsageError(`${view} needs a target, e.g. ${view} ${exampleTarget(view)}`);
  }
  if (!NEEDS_TARGET.has(view) && third !== undefined) {
    throw new UsageError(`${view} takes no target (got "${third}")`);
  }
  if (rest.length > 0) throw new UsageError(`unexpected argument "${rest[0]}"`);
  return { kind: 'view', tenant, view, target: third, ...options };
}

function exampleTarget(view: View): string {
  switch (view) {
    case 'course':
      return 'FA-101';
    case 'participant':
      return 'ana@example.com';
    default:
      return 'SYD-2026-000001';
  }
}
