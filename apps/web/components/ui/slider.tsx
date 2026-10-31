'use client';

import * as SliderPrimitive from '@radix-ui/react-slider';

export interface SliderProps {
  /** Current thumb value. */
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (value: number) => void;
  disabled?: boolean;
  /** Accessible name for the thumb. */
  ariaLabel: string;
}

/**
 * Single-thumb Radix Slider wrapper. Arrow keys, Home/End, and page
 * steps are handled by Radix; this component only owns styling.
 */
export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  disabled,
  ariaLabel,
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(next) => {
        if (next[0] !== undefined) onValueChange?.(next[0]);
      }}
      className="relative flex h-11 w-full touch-none select-none items-center data-[disabled]:opacity-40 lg:h-5"
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-[var(--radius-full)] bg-[var(--bg-elev-2)]">
        <SliderPrimitive.Range className="absolute h-full bg-[var(--violet)]" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        className="block h-4 w-4 rounded-[var(--radius-full)] border border-[var(--border-strong)] bg-[var(--text-primary)] shadow-[var(--shadow-sm)] transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] data-[disabled]:pointer-events-none"
      />
    </SliderPrimitive.Root>
  );
}
