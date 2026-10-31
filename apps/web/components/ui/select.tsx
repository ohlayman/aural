'use client';

import * as SelectPrimitive from '@radix-ui/react-select';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  /** Selected value. Omit for uncontrolled usage. */
  value?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  /** Accessible name for the trigger button. */
  ariaLabel: string;
  disabled?: boolean;
}

/**
 * Radix Select wrapper. Keyboard navigation, typeahead, and focus
 * management come from Radix; this component only owns styling.
 */
export function Select({
  value,
  onValueChange,
  options,
  ariaLabel,
  disabled,
}: SelectProps) {
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className="inline-flex h-10 min-w-[9rem] items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-elev-1)] px-3 text-sm text-[var(--text-primary)] transition hover:bg-[var(--bg-elev-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)] disabled:opacity-50 data-[placeholder]:text-[var(--text-tertiary)]"
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon aria-hidden="true" className="text-[var(--text-tertiary)]">
          ▾
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-elev-2)] p-1 shadow-[var(--shadow-md)]"
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="relative flex cursor-pointer select-none items-center rounded-[6px] py-2 pl-8 pr-3 text-sm text-[var(--text-secondary)] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-[var(--bg-elev-1)] data-[highlighted]:text-[var(--text-primary)]"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2 text-[var(--violet)]">
                  ✓
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
