import { parseArgs, UsageError } from './args.js';

describe('parseArgs', () => {
  it('starts the interactive browser with no arguments', () => {
    expect(parseArgs([])).toEqual({ kind: 'interactive' });
  });

  it('starts it in a tenant when only a code is given (any case)', () => {
    expect(parseArgs(['syd'])).toEqual({ kind: 'interactive', tenant: 'SYD' });
  });

  it('shows help', () => {
    expect(parseArgs(['--help'])).toEqual({ kind: 'help' });
    expect(parseArgs(['SYD', 'certificates', '-h'])).toEqual({ kind: 'help' });
  });

  it('lists tenants, optionally as JSON', () => {
    expect(parseArgs(['tenants'])).toEqual({ kind: 'tenants', json: false });
    expect(parseArgs(['tenants', '--json'])).toEqual({ kind: 'tenants', json: true });
  });

  it('parses a view with every option', () => {
    expect(
      parseArgs([
        'SYD',
        'certificates',
        '--q',
        'nguyen',
        '--status',
        'revoked',
        '--page',
        '2',
        '--page-size',
        '5',
        '--json',
      ]),
    ).toEqual({
      kind: 'view',
      tenant: 'SYD',
      view: 'certificates',
      target: undefined,
      q: 'nguyen',
      status: 'revoked',
      page: 2,
      pageSize: 5,
      json: true,
    });
  });

  it('takes a target for course, participant and certificate', () => {
    expect(parseArgs(['PER', 'certificate', 'PER-2026-000001'])).toMatchObject({
      tenant: 'PER',
      view: 'certificate',
      target: 'PER-2026-000001',
    });
    expect(parseArgs(['SYD', 'course', 'FA-101'])).toMatchObject({ target: 'FA-101' });
    expect(parseArgs(['SYD', 'participant', '7'])).toMatchObject({ target: '7' });
  });

  it('passes the audit action filter', () => {
    expect(parseArgs(['SYD', 'audit', '--action', 'certificate.revoked'])).toMatchObject({
      view: 'audit',
      action: 'certificate.revoked',
    });
  });

  it.each([
    [['SYDNEY', 'summary'], /not a tenant code/],
    [['SYD', 'nope'], /unknown view "nope"/],
    [['SYD', 'certificate'], /needs a target/],
    [['SYD', 'summary', 'extra'], /takes no target/],
    [['SYD', 'course', 'FA-101', 'extra'], /unexpected argument/],
    [['SYD', 'certificates', '--status', 'expired'], /valid or revoked/],
    [['SYD', 'certificates', '--page', '0'], /1 or more/],
    [['SYD', 'certificates', '--page', 'two'], /1 or more/],
    [['SYD', 'certificates', '--page'], /1 or more/],
    [['SYD', 'certificates', '--page-size', '101'], /at most 100/],
    [['SYD', 'certificates', '--q'], /needs a value/],
    [['SYD', 'certificates', '--q', '--json'], /needs a value/],
    [['SYD', 'certificates', '--sort', 'serial'], /unknown option --sort/],
    [['tenants', 'SYD'], /no arguments/],
  ])('rejects %j', (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(UsageError);
    expect(() => parseArgs(argv)).toThrow(message);
  });
});
