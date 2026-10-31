'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

export interface TooltipProps {
  content: ReactNode;
  /** Single element that receives hover/focus. */
  children: ReactNode;
}

/** Radix Tooltip wrapper: short delay, no arrow (per spec). */
export function Tooltip({ content, children }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={100}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="top"
            sideOffset={6}
            className="z-50 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-elev-2)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] shadow-[var(--shadow-md)]"
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
