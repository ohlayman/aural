'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

export interface DialogProps {
  /** Element that opens the dialog when clicked. */
  trigger: ReactNode;
  title: string;
  children: ReactNode;
  /** Controlled open state. Omit for uncontrolled usage. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Radix Dialog wrapper. Focus lock, Esc-to-close, and focus restore to
 * the trigger are all handled by Radix.
 */
export function Dialog({
  trigger,
  title,
  children,
  open,
  onOpenChange,
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-elev-1)] p-6 text-[var(--text-primary)] shadow-[var(--shadow-md)] focus-visible:outline-none"
        >
          <DialogPrimitive.Title className="text-lg font-semibold">
            {title}
          </DialogPrimitive.Title>
          <div className="mt-3 text-sm text-[var(--text-secondary)]">
            {children}
          </div>
          <DialogPrimitive.Close
            aria-label="关闭"
            className="absolute right-3 top-3 rounded-[var(--radius-full)] px-1.5 text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)]"
          >
            ×
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
