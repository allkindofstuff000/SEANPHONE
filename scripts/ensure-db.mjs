// Ensures the local portable PostgreSQL is running before `npm run dev`.
// No-ops if the port is already open, or if the portable install isn't found
// (so you can point DATABASE_URL at a different Postgres without this getting
// in the way). Paths are overridable via env vars.
import net from 'node:net';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = Number(process.env.PGPORT_LOCAL || 5433);
const PG_ROOT = process.env.PG_PORTABLE_ROOT || 'C:/Users/ALGO/pgportable/pgsql';
const PG_DATA = process.env.PG_PORTABLE_DATA || 'C:/Users/ALGO/pgportable/data';
const PG_LOG = process.env.PG_PORTABLE_LOG || 'C:/Users/ALGO/pgportable/logfile.log';

function isOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port }, () => {
      s.end();
      resolve(true);
    });
    s.on('error', () => resolve(false));
    s.setTimeout(1000, () => {
      s.destroy();
      resolve(false);
    });
  });
}

if (await isOpen(PORT)) {
  console.log(`[db] Postgres already running on :${PORT}`);
  process.exit(0);
}

const pgCtl = `${PG_ROOT}/bin/pg_ctl.exe`;
if (!existsSync(pgCtl)) {
  console.warn(
    `[db] pg_ctl not found at ${pgCtl} — skipping auto-start. ` +
      `Start Postgres yourself or set PG_PORTABLE_ROOT/PG_PORTABLE_DATA.`,
  );
  process.exit(0);
}

console.log(`[db] starting Postgres on :${PORT} ...`);
// stdio 'ignore' + detached avoids the Windows pipe-inheritance hang.
const child = spawn(pgCtl, ['-D', PG_DATA, '-o', `-p ${PORT}`, '-l', PG_LOG, 'start'], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
child.unref();

for (let i = 0; i < 40; i++) {
  if (await isOpen(PORT)) {
    console.log('[db] Postgres is ready');
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 500));
}
console.warn('[db] Postgres did not become ready in time; continuing anyway');
process.exit(0);
