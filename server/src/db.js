import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(here, '../.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);
const root = path.resolve(here, '../..');
const configured = process.env.SQLITE_PATH || '../data/control-caja.db';
const dbPath = path.resolve(root, 'server', configured);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
export const databasePath = dbPath;
export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

export function transaction(fn){
  db.exec('BEGIN IMMEDIATE');
  try { const value=fn(); db.exec('COMMIT'); return value; }
  catch(error){ try{db.exec('ROLLBACK')}catch{} throw error; }
}
