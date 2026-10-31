'use client';

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';

export type ButtonVariant = 'primary' | 'ghost' | 'text';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. Defaults to `primary`. */
  variant?: ButtonVariant;
  /** Control height. Defaults to `md`. */
  size?: ButtonSize;
  /** Shows a spinner, disables the button, and sets `aria-busy`. */
  loading?: boolean;
  children?: ReactNode;
}

const base =
  'inline-flex select-none items-center justify-center gap-2 font-medium transition duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] disabled:pointer-events-none disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--violet)] text-white shadow-[var(--shadow-sm)] hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]',
  ghost:
    'border border-[var(--border-strong)] bg-[var(--bg-elev-1)] text-[var(--text-primary)] hover:scale-[1.02] hover:bg-[var(--bg-elev-2)] active:scale-[0.98]',
  text: 'bg-transparent text-[var(--text-secondary)] hover:scale-[1.02] hover:text-[var(--text-primary)] active:scale-[0.98]',
};

const sizes: Record<ButtonSize, string> = {
  md: 'h-11 rounded-[var(--radius-sm)] px-5 text-sm',
  sm: 'h-9 rounded-[var(--radius-sm)] px-3.5 text-xs',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      className,
      children,
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const classes = [base, variants[variant], sizes[size], className]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading ? 'true' : undefined}
        {...props}
      >
        {loading ? (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : null}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
