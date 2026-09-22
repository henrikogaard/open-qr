import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Simulates the production upgrade path: a v1.3.0 database with data
 * (pre-foreign-keys, otp_codes without an email column) migrates forward
 * through runMigrations() without losing rows, backfills otp_codes.email,
 * and ends up with enforcement + cascading deletes enabled.
 */
describe('migration 006 (foreign keys) against legacy data', () => {
  it('preserves rows, backfills emails, and enables cascades', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openqr-migrate-'));
    const dbPath = path.join(dir, 'legacy.db');
    const legacy = new Database(dbPath);
    legacy.pragma('journal_mode = WAL');
    // Relax FKs so the legacy-shaped fixtures below can include a dangling
    // scan-log row (row-level chaos a production DB may have picked up from
    // direct manipulation). Migration 006 must tolerate and copy such rows.
    legacy.pragma('foreign_keys = OFF');

    const migrationsDir = path.join(process.cwd(), 'src', 'lib', 'db', 'migrations');
    const pending = fs.readdirSync(migrationsDir).filter((f) => /^00[1-5]_/.test(f)).sort();
    legacy.exec(`CREATE TABLE migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT UNIQUE NOT NULL, executed_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    for (const file of pending) {
      legacy.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf-8'));
      legacy.prepare('INSERT INTO migrations (filename) VALUES (?)').run(file);
    }

    // Legacy-shaped rows: no email on OTP codes, no FK enforcement ever.
    legacy.prepare("INSERT INTO users (email, created_at) VALUES ('owner@example.com', '2026-01-01 00:00:00')").run();
    legacy.prepare("INSERT INTO qr_codes (short_code, target_url, user_id, scan_count) VALUES ('legacy01', 'https://example.com', 1, 5)").run();
    legacy.prepare("INSERT INTO scan_logs (qr_code_id, ip_hash, timestamp) VALUES (1, 'aabbccdd', '2026-01-01 00:00:00')").run();
    // Orphan scan log pointing at a QR that no longer exists — possible
    // pre-006 because foreign keys were never enforced.
    legacy.prepare("INSERT INTO scan_logs (qr_code_id, ip_hash, timestamp) VALUES (999, 'eeff0011', '2026-01-01 00:00:00')").run();
    legacy.prepare("INSERT INTO otp_codes (user_id, code, expires_at) VALUES (1, 'c0de', '2026-01-02 00:00:00')").run();
    legacy.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES ('sess1', 1, '2026-01-02 00:00:00')").run();

    // The real startup path: applies only 006, then turns FKs on.
    const { runMigrationsOn } = await import('./schema');
    runMigrationsOn(legacy);

    expect(legacy.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    expect((legacy.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n).toBe(1);
    expect((legacy.prepare('SELECT COUNT(*) AS n FROM qr_codes').get() as { n: number }).n).toBe(1);

    const otp = legacy.prepare('SELECT email FROM otp_codes WHERE id = 1').get() as { email: string };
    expect(otp.email).toBe('owner@example.com');

    const session = legacy.prepare('SELECT id FROM sessions WHERE id = ?').get('sess1');
    expect(session).toBeDefined();

    // Deleting the QR cascades to its scan logs (pre-006 this DELETE threw
    // FOREIGN KEY constraint failed); the orphan survives.
    legacy.prepare('DELETE FROM qr_codes WHERE short_code = ?').run('legacy01');
    expect((legacy.prepare('SELECT COUNT(*) AS n FROM scan_logs').get() as { n: number }).n).toBe(1);
    expect((legacy.prepare('SELECT qr_code_id FROM scan_logs').get() as { qr_code_id: number }).qr_code_id).toBe(999);

    legacy.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
