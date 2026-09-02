/**
 * CLI: pnpm --filter @razione-eye/server backup
 * VACUUM INTO a timestamped snapshot under server/data/backups/, keep last 30.
 */
import { openDb } from './db.ts';
import { runBackup } from './backup-service.ts';

const db = openDb();
const result = runBackup(db);
console.log(JSON.stringify(result, null, 2));
db.close();
