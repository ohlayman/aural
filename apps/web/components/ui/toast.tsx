'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

const TOAST_DURATION_MS = 2200;
const TOAST_EXIT_MS = 240;

interface ToastItem {
  id: number;
  text: string;
  open: boolean;
}

type ShowToast = (text: string) => void;

const ToastContext = createContext<ShowToast>(() => {});

/** Returns a function that shows a short, bottom-center toast. */
export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export interface ToasterProps {
  children?: ReactNode;
}

/**
 * Radix Toast provider. Mount once near the app root. Radix renders a
 * visually hidden `role="status"` live region, so toasts are announced
 * to screen readers. Auto-dismiss starts at 2.2s; the exit animation
 * runs for 240ms before the toast is removed.
 */
export function Toaster({ children }: ToasterProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const exitTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const show = useCallback<ShowToast>((text) => {
    nextId.current += 1;
    setToasts((current) => [
      ...current,
      { id: nextId.current, text, open: true },
    ]);
  }, []);

  const handleOpenChange = useCallback((id: number, open: boolean) => {
    if (open) return;

    setToasts((current) =>
      current.map((toast) =>
        toast.id === id ? { ...toast, open: false } : toast,
      ),
    );

    const timer = setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      exitTimers.current.delete(id);
    }, TOAST_EXIT_MS);
    exitTimers.current.set(id, timer);
  }, []);

  useEffect(() => {
    const timers = exitTimers.current;

    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={show}>
      <ToastPrimitive.Provider
        duration={TOAST_DURATION_MS}
        swipeDirection="down"
      >
        {children}
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            open={toast.open}
            forceMount
            duration={TOAST_DURATION_MS}
            onOpenChange={(open) => handleOpenChange(toast.id, open)}
            className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-elev-2)] px-4 py-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-md)] animate-[aural-toast-in_240ms_ease-out] data-[state=closed]:animate-[aural-toast-out_240ms_ease-in]"
          >
            <ToastPrimitive.Title className="font-medium">
              {toast.text}
            </ToastPrimitive.Title>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-6 left-1/2 z-50 flex w-auto max-w-[92vw] -translate-x-1/2 list-none flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
