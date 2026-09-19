import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

type Variant = 'success' | 'error' | 'info';
type Toast = { id: number; title: string; message?: string; variant: Variant };
type Ctx = { push: (t: Omit<Toast, 'id'>) => void };

const ToastCtx = createContext<Ctx | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { ...t, id }]);
    setTimeout(
      () => setToasts((cur) => cur.filter((x) => x.id !== id)),
      4000,
    );
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => {
          const accent =
            t.variant === 'error' ? 'border-destructive' : 'border-primary';
          const title =
            t.variant === 'error' ? 'text-destructive' : 'text-primary';
          return (
            <div
              key={t.id}
              className={`pointer-events-auto rounded-[10px] border ${accent} bg-card px-4 py-3 shadow-lg`}
            >
              <div className={`text-xs font-semibold tracking-widest ${title}`}>
                {t.title}
              </div>
              {t.message && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {t.message}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const c = useContext(ToastCtx);
  if (!c) throw new Error('useToast must be used within ToastProvider');
  return c;
}
