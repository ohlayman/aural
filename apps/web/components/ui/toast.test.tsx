import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster, useToast } from './toast';

function ToastTrigger() {
  const toast = useToast();

  return (
    <button type="button" onClick={() => toast('已保存')}>
      显示提示
    </button>
  );
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the text and auto-hides after 2.2s', async () => {
    render(
      <Toaster>
        <ToastTrigger />
      </Toaster>,
    );

    fireEvent.click(screen.getByRole('button', { name: '显示提示' }));

    // Radix fills its hidden `role="status"` live region on the next
    // animation frame.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32);
    });

    expect(screen.getByText('已保存')).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('status')
        .some((region) => region.textContent?.includes('已保存')),
    ).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2168);
    });

    // Auto-dismiss starts at 2.2s; the exit animation keeps the root
    // mounted in its closed state for another 240ms.
    expect(
      screen.getByText('已保存').closest('[data-state="closed"]'),
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(240);
    });

    expect(screen.queryByText('已保存')).not.toBeInTheDocument();
  });
});
