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
      className="relative flex h-5 w-full touch-none select-none items-center data-[disabled]:opacity-40"
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-[var(--radius-full)] bg-[var(--bg-elev-2)]">
        <SliderPrimitive.Range className="absolute h-full bg-[var(--violet)]" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb asChild aria-disabled={disabled ? true : undefined}>
        {/*
          A native input gives the thumb a real `disabled` attribute for
          assistive tech; Radix supplies the ARIA value props.
        */}
        <input
          type="range"
          aria-label={ariaLabel}
          aria-disabled={disabled ? true : undefined}
          disabled={disabled}
          min={min}
          max={max}
          step={step}
          value={value}
          readOnly
          className="block h-4 w-4 cursor-pointer appearance-none rounded-[var(--radius-full)] border border-[var(--border-strong)] bg-[var(--text-primary)] shadow-[var(--shadow-sm)] transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] disabled:pointer-events-none"
        />
      </SliderPrimitive.Thumb>
    </SliderPrimitive.Root>
  );
}
