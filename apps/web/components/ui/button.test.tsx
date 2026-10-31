import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('is disabled and aria-busy while loading', () => {
    render(<Button loading>生成</Button>);

    const button = screen.getByRole('button', { name: /生成/ });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('calls onClick when enabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>生成</Button>);

    await user.click(screen.getByRole('button', { name: /生成/ }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick while loading', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        生成
      </Button>,
    );

    await user.click(screen.getByRole('button', { name: /生成/ }));

    expect(onClick).not.toHaveBeenCalled();
  });
});
