import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import zh from '@/messages/zh.json';
import { TTS_INITIAL_STATE, useTTSStore } from '@/features/tts/store';
import { ConfigPanel } from './config-panel';

function renderPanel(props: ComponentProps<typeof ConfigPanel>) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zh}>
      <ConfigPanel {...props} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useTTSStore.setState({ ...TTS_INITIAL_STATE });
});

describe('ConfigPanel', () => {
  it('disables pitch when the engine does not support it', () => {
    renderPanel({ engine: { id: 'fixture', capabilities: { pitch: false } } });

    // Radix marks the thumb with data-disabled and the root with aria-disabled.
    expect(screen.getByRole('slider', { name: '音调' })).toHaveAttribute(
      'data-disabled',
    );
  });

  it('renders voice cards and marks the selected voice', () => {
    renderPanel({
      engine: { id: 'fixture', capabilities: { pitch: true } },
      voices: [
        {
          id: 'default',
          engineId: 'fixture',
          name: '晴川',
          language: 'zh',
          gender: 'female',
          style: ['warm'],
          enabled: true,
        },
        {
          id: 'deep',
          engineId: 'fixture',
          name: '沉舟',
          language: 'zh',
          gender: 'male',
          style: ['low'],
          enabled: true,
        },
      ],
      value: { language: 'zh', voiceId: 'fixture:deep', speed: 1, pitch: 0 },
    });

    expect(screen.getByRole('button', { name: /^晴川/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: /^沉舟/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('女声 · 温和')).toBeInTheDocument();
    expect(screen.getByText('男声 · 低沉')).toBeInTheDocument();
  });
});
