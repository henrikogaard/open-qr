import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DATABASE_URL || './data/openqr.db';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const migrationsDir = path.join(process.cwd(), 'src', 'lib', 'db', 'migrations');
const files = fs.readdirSync(migrationsDir).sort();

db.exec(`
  CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT UNIQUE NOT NULL,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const executed = db.prepare('SELECT filename FROM migrations').all();
const executedSet = new Set(executed.map((row) => row.filename));

for (const file of files) {
  if (executedSet.has(file)) continue;
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
  db.exec(sql);
  db.prepare('INSERT INTO migrations (filename) VALUES (?)').run(file);
}

db.close();
