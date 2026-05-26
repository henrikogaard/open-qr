import { beforeAll } from 'vitest';
import { runMigrations } from './schema';
import { initDefaultSettings } from '$lib/server/settings';

beforeAll(() => {
  runMigrations();
  initDefaultSettings();
});
