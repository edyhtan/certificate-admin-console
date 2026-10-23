import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Loads `backend_service/.env` into `process.env` when it exists.
 * Variables already set in the environment win over the file.
 * The path is resolved from this file, so it works from `src/` and `dist/` and from any cwd.
 */
export function loadEnvFile(
  path = fileURLToPath(new URL('../../.env', import.meta.url)),
): boolean {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}
