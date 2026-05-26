import Database from 'better-sqlite3';
import { env } from '$env/dynamic/private';

const dbPath = env.DATABASE_URL || './data/openqr.db';
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
