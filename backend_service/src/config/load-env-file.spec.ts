import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile } from './load-env-file.js';

describe('loadEnvFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'env-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.TEST_ENV_ONLY_IN_FILE;
    delete process.env.TEST_ENV_ALREADY_SET;
  });

  it('returns false and changes nothing when the file is missing', () => {
    expect(loadEnvFile(join(dir, '.env'))).toBe(false);
  });

  it('loads variables from the file', () => {
    const file = join(dir, '.env');
    writeFileSync(file, 'TEST_ENV_ONLY_IN_FILE=from-file\n');
    expect(loadEnvFile(file)).toBe(true);
    expect(process.env.TEST_ENV_ONLY_IN_FILE).toBe('from-file');
  });

  it('keeps variables already set in the environment', () => {
    const file = join(dir, '.env');
    writeFileSync(file, 'TEST_ENV_ALREADY_SET=from-file\n');
    process.env.TEST_ENV_ALREADY_SET = 'from-env';
    loadEnvFile(file);
    expect(process.env.TEST_ENV_ALREADY_SET).toBe('from-env');
  });
});
