import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Slider } from './slider';

function SliderHarness() {
  const [value, setValue] = useState(40);

  return (
    <Slider
      ariaLabel="音量"
      value={value}
      min={0}
      max={100}
      step={1}
      onValueChange={setValue}
    />
  );
}

describe('Slider', () => {
  it('increases aria-valuenow with ArrowRight', async () => {
    const user = userEvent.setup();
    render(<SliderHarness />);

    const slider = screen.getByRole('slider', { name: '音量' });
    slider.focus();

    expect(slider).toHaveAttribute('aria-valuenow', '40');

    await user.keyboard('{ArrowRight}');

    expect(slider).toHaveAttribute('aria-valuenow', '41');
  });
});
