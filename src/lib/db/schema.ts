import { db } from './index';
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
    db.exec(sql);
    db.prepare('INSERT INTO migrations (filename) VALUES (?)').run(file);
  }
}
