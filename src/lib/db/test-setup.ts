import { beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const testDbPath = path.join(process.cwd(), 'data', 'openqr-test.db');
process.env.DATABASE_URL = testDbPath;

const globalState = globalThis as typeof globalThis & {
  __OPENQR_TEST_DB_RESET__?: boolean;
};

if (!globalState.__OPENQR_TEST_DB_RESET__) {
  for (const file of [testDbPath, `${testDbPath}-shm`, `${testDbPath}-wal`]) {
    fs.rmSync(file, { force: true });
  }
  globalState.__OPENQR_TEST_DB_RESET__ = true;
}

beforeAll(async () => {
  const { runMigrations } = await import('./schema');
  const { initDefaultSettings } = await import('$lib/server/settings');

  runMigrations();
  initDefaultSettings();
});
