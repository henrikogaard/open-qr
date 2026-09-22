import { db } from './index';
import type Database from 'better-sqlite3';

// Embedded at build time via Vite's ?raw glob: the production bundle carries
// its own migration SQL, so nothing reads process.cwd()/src at runtime (the
// Docker image no longer ships a src/ tree, and the app works from any cwd).
const embeddedMigrations = import.meta.glob('/src/lib/db/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

export interface MigrationFile {
  name: string;
  sql: string;
}

export function bundledMigrations(): MigrationFile[] {
  return Object.entries(embeddedMigrations)
    .map(([path, sql]) => ({ name: path.split('/').pop()!, sql }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Applies pending migrations to the given connection, one transaction per
 * migration, and turns foreign-key enforcement on afterwards (kept OFF while
 * migrations run so table rebuilds can copy legacy orphan rows). Exported
 * separately from runMigrations so tests and tooling can migrate a specific
 * database handle.
 */
export function runMigrationsOn(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const executed = database.prepare('SELECT filename FROM migrations').all() as { filename: string }[];
  const executedSet = new Set(executed.map(e => e.filename));

  for (const { name, sql } of bundledMigrations()) {
    if (executedSet.has(name)) continue;
    // One transaction per migration: the SQL and its bookkeeping row commit
    // together, so a crash mid-migration can't leave a half-applied file that
    // re-runs on the next boot.
    database.transaction(() => {
      database.exec(sql);
      database.prepare('INSERT INTO migrations (filename) VALUES (?)').run(name);
    })();
  }

  database.pragma('foreign_keys = ON');
}

export function runMigrations(): void {
  runMigrationsOn(db);
}
