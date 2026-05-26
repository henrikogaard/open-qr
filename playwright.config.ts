import { defineConfig, devices } from '@playwright/test';

const e2eDbPath = './data/openqr-e2e.db';
process.env.DATABASE_URL = e2eDbPath;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: `rm -f ${e2eDbPath} ${e2eDbPath}-shm ${e2eDbPath}-wal && DATABASE_URL=${e2eDbPath} npm run build && DATABASE_URL=${e2eDbPath} npm run preview -- --host 127.0.0.1 --port 4173`,
    port: 4173
  }
});
