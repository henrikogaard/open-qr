import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { env } from '$env/dynamic/private';

const dbPath = process.env.DATABASE_URL || env.DATABASE_URL || './data/openqr.db';
// Fresh checkouts have no data/ dir; create it so the first open works.
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
