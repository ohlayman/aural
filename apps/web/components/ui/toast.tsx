'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface ToastItem {
  id: number;
  text: string;
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
 * to screen readers. Auto-dismiss is 2.2s; entrance is 240ms.
 */
export function Toaster({ children }: ToasterProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const show = useCallback<ShowToast>((text) => {
    nextId.current += 1;
    setToasts((current) => [...current, { id: nextId.current, text }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      <ToastPrimitive.Provider duration={2200} swipeDirection="down">
        {children}
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            defaultOpen
            duration={2200}
            onOpenChange={(open) => {
              if (!open) dismiss(toast.id);
            }}
            className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-elev-2)] px-4 py-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-md)] animate-[aural-toast-in_240ms_ease-out]"
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
