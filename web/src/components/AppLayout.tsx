import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { IconPhone } from './icons';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function clockUtc6(d: Date) {
  return d.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Dhaka', // UTC+6, no DST
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const now = useClock();
  if (!user) return null;

  const nav = [
    { to: '/', label: 'Dashboard', end: true, show: true },
    { to: '/numbers', label: 'Numbers', end: false, show: user.role === 'admin' },
    { to: '/inbox', label: 'Messages', end: false, show: true },
    { to: '/users', label: 'Team', end: false, show: user.role === 'admin' },
  ].filter((n) => n.show);

  const linkClass = (isActive: boolean) =>
    `relative pb-1 text-[13px] transition-colors ${
      isActive
        ? 'text-foreground after:absolute after:-bottom-px after:left-0 after:h-0.5 after:w-full after:bg-primary'
        : 'text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <IconPhone className="h-4 w-4" />
              </span>
              <span className="text-sm font-bold tracking-tight text-foreground">
                SEANPHONE
              </span>
            </div>

            <nav className="hidden items-center gap-6 md:flex">
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) => linkClass(isActive)}
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-2 text-[12px] text-muted-foreground sm:flex">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
              System healthy
            </span>
            <span className="font-mono text-[13px] text-foreground">
              {clockUtc6(now)} UTC+6
            </span>
            <button
              onClick={() => logout()}
              className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="flex items-center gap-5 overflow-x-auto border-t border-border px-5 py-2 md:hidden">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `whitespace-nowrap text-[13px] ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}
