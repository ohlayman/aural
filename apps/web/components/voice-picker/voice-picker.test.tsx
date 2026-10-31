import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import zh from '@/messages/zh.json';
import { VoicePicker } from './voice-picker';

const fixtures = vi.hoisted(() => ({
  engines: [
    {
      id: 'fixture',
      kind: 'tts',
      displayName: '本地示例',
      tier: 'standard',
      capabilities: {
        streaming: false,
        pitch: false,
        volume: false,
        ssml: false,
        clone: false,
        maxCharsPerRequest: 5000,
        formats: ['mp3'],
        languages: ['zh', 'en'],
      },
      voiceCount: 2,
      languages: ['zh', 'en'],
    },
  ],
  voices: [
    {
      id: 'default',
      engineId: 'fixture',
      name: '晴川',
      language: 'zh',
      gender: 'female',
      style: ['warm', 'narrative'],
      enabled: true,
    },
    {
      id: 'deep',
      engineId: 'fixture',
      name: '沉舟',
      language: 'zh',
      gender: 'male',
      style: ['low', 'documentary'],
      enabled: true,
    },
  ],
}));

vi.mock('@/features/engines/hooks', () => ({
  useEngines: () => ({ data: fixtures.engines }),
  useVoices: () => ({ data: fixtures.voices }),
}));

function renderPicker(onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="zh" messages={zh}>
      <VoicePicker
        value={{ engineId: 'fixture', voiceId: 'fixture:default' }}
        onChange={onChange}
      />
    </NextIntlClientProvider>,
  );
  return onChange;
}

function stubAudio() {
  const play = vi.fn();
  const pause = vi.fn();
  const sources: string[] = [];

  class AudioStub {
    onended: (() => void) | null = null;

    constructor(src: string) {
      sources.push(src);
    }

    play = play;
    pause = pause;
  }

  vi.stubGlobal('Audio', AudioStub);
  return { play, pause, sources };
}

describe('VoicePicker', () => {
  it('shows the localized engine tier in the trigger', () => {
    renderPicker();

    expect(screen.getByRole('button', { name: /晴川/ })).toHaveTextContent('标准');
  });

  it('selects a voice and closes the popover', async () => {
    const user = userEvent.setup();
    const onChange = renderPicker();

    await user.click(screen.getByRole('button', { name: /晴川/ }));
    await user.click(screen.getByRole('radio', { name: /沉舟/ }));

    expect(onChange).toHaveBeenCalledWith({
      engineId: 'fixture',
      voiceId: 'fixture:deep',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('selects a focused voice row with Enter', async () => {
    const user = userEvent.setup();
    const onChange = renderPicker();

    await user.click(screen.getByRole('button', { name: /晴川/ }));
    screen.getByRole('radio', { name: /沉舟/ }).focus();
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith({
      engineId: 'fixture',
      voiceId: 'fixture:deep',
    });
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderPicker();

    const trigger = screen.getByRole('button', { name: /晴川/ });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: '选择音色' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('previews without selecting, and stops on a second click', async () => {
    const { play, pause, sources } = stubAudio();

    const user = userEvent.setup();
    const onChange = renderPicker();

    await user.click(screen.getByRole('button', { name: /晴川/ }));
    await user.click(screen.getByRole('button', { name: '试听 沉舟' }));

    expect(play).toHaveBeenCalledTimes(1);
    expect(sources).toEqual(['/api/v1/voices/fixture%3Adeep/preview']);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '停止试听 沉舟' }));

    expect(pause).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('localizes gender and style tags in Chinese', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('button', { name: /晴川/ }));

    expect(screen.getByText('女 · 温和')).toBeInTheDocument();
    expect(screen.getByText('男 · 低沉')).toBeInTheDocument();
  });

  it('renders unknown tag keys raw', async () => {
    fixtures.voices.push({
      id: 'raw',
      engineId: 'fixture',
      name: '原声',
      language: 'zh',
      gender: 'neutral',
      style: ['unmapped'],
      enabled: true,
    });

    try {
      const user = userEvent.setup();
      renderPicker();

      await user.click(screen.getByRole('button', { name: /晴川/ }));

      expect(screen.getByText('中性 · unmapped')).toBeInTheDocument();
    } finally {
      fixtures.voices.pop();
    }
  });

  it('localizes the trigger and panel labels in English', async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <VoicePicker
          value={{ engineId: 'fixture', voiceId: 'fixture:default' }}
          onChange={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    const trigger = screen.getByRole('button', { name: /晴川/ });
    expect(trigger).toHaveAccessibleName('Current voice: 晴川. Click to change.');

    await user.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Choose a voice' })).toBeInTheDocument();
    expect(screen.getByText('Woman · Warm')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview 沉舟' })).toHaveTextContent(
      'Preview',
    );
  });

  it('stops the preview when a voice is selected', async () => {
    const { play, pause } = stubAudio();

    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('button', { name: /晴川/ }));
    await user.click(screen.getByRole('button', { name: '试听 沉舟' }));
    expect(play).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('radio', { name: /沉舟/ }));

    expect(pause).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
