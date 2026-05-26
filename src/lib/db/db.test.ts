import { describe, it, expect, beforeAll } from 'vitest';
import { db } from './index';
import { runMigrations } from './schema';

describe('database', () => {
  beforeAll(() => {
    runMigrations();
  });

  it('should be connected', () => {
    const result = db.prepare('SELECT 1 as val').get() as { val: number };
    expect(result.val).toBe(1);
  });
  
  it('should have migrations table', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'").get();
    expect(result).toBeDefined();
  });
});
