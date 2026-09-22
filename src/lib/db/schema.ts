import { db } from './index';
import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export function runMigrations() {
  const migrationsDir = path.join(process.cwd(), 'src', 'lib', 'db', 'migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const executed = db.prepare('SELECT filename FROM migrations').all() as { filename: string }[];
  const executedSet = new Set(executed.map(e => e.filename));

  for (const file of files) {
    if (executedSet.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    // One transaction per migration: the SQL and its bookkeeping row commit
    // together, so a crash mid-migration can't leave a half-applied file that
    // re-runs on the next boot.
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (filename) VALUES (?)').run(file);
    })();
  }

  // After migrations: enforce the foreign keys the schema declares. Kept OFF
  // while migrations run so table rebuilds can copy legacy orphan rows.
  db.pragma('foreign_keys = ON');
}
