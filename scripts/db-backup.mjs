import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Online SQLite backup for Open-QR.
 *
 * Uses better-sqlite3's backup() API, which copies pages while the source
 * database stays writable (WAL-aware) — safe to run against a live container
 * mount, unlike copying the file itself.
 *
 * Usage:
 *   npm run db:backup                       # data/backups/openqr-<timestamp>.db
 *   node scripts/db-backup.mjs /path/to.db  # explicit destination
 *
 * Restore: stop the app, replace DATABASE_URL's file with the backup
 * (plus removing any stale -wal/-shm siblings), start the app.
 */

const source = process.env.DATABASE_URL || './data/openqr.db';
const defaultDir = path.join(path.dirname(source), 'backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dest = process.argv[2] || path.join(defaultDir, `openqr-${stamp}.db`);

fs.mkdirSync(path.dirname(dest), { recursive: true });
if (fs.existsSync(dest)) {
  console.error(`Refusing to overwrite existing file: ${dest}`);
  process.exit(1);
}

const db = new Database(source, { readonly: true });
try {
  await db.backup(dest);
} finally {
  db.close();
}

const { size } = fs.statSync(dest);
console.log(`Backed up ${source} -> ${dest} (${(size / 1024).toFixed(1)} KiB)`);
console.log('Verify a backup occasionally: sqlite3 ' + dest + ' "PRAGMA integrity_check;"');
