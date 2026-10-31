import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { Dialog } from './dialog';

function DialogHarness() {
  return (
    <Dialog trigger={<Button>打开</Button>} title="确认操作">
      <p>对话框内容</p>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('opens, closes on Escape, and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);

    const trigger = screen.getByRole('button', { name: '打开' });
    await user.click(trigger);

    expect(screen.getByRole('dialog', { name: '确认操作' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
