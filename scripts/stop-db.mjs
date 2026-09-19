// Stops the local portable PostgreSQL.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const PG_ROOT = process.env.PG_PORTABLE_ROOT || 'C:/Users/ALGO/pgportable/pgsql';
const PG_DATA = process.env.PG_PORTABLE_DATA || 'C:/Users/ALGO/pgportable/data';

const pgCtl = `${PG_ROOT}/bin/pg_ctl.exe`;
if (!existsSync(pgCtl)) {
  console.warn(`[db] pg_ctl not found at ${pgCtl} — nothing to stop.`);
  process.exit(0);
}

const r = spawnSync(pgCtl, ['-D', PG_DATA, 'stop', '-m', 'fast'], { stdio: 'inherit' });
process.exit(r.status ?? 0);
