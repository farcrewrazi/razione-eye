/**
 * CLI: pnpm --filter @razione-eye/server backup
 * pg_dump custom-format snapshot under /app/server/backups (or server/data/backups locally), keep last 30.
 */
import { runBackup } from './backup-service.ts';

const result = await runBackup();
console.log(JSON.stringify(result, null, 2));
