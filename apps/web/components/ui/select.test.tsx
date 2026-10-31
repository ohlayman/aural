import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Select } from './select';

const options = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
];

function SelectHarness() {
  const [value, setValue] = useState('zh');

  return (
    <Select
      ariaLabel="语言"
      value={value}
      onValueChange={setValue}
      options={options}
    />
  );
}

describe('Select', () => {
  it('opens and selecting an option calls onValueChange', async () => {
    const user = userEvent.setup();
    render(<SelectHarness />);

    await user.click(screen.getByRole('combobox', { name: '语言' }));
    await user.click(await screen.findByRole('option', { name: 'English' }));

    expect(
      screen.getByRole('combobox', { name: '语言' }),
    ).toHaveTextContent('English');
  });
});
