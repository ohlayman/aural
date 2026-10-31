import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/messages/zh.json';
import { TTS_INITIAL_STATE, useTTSStore } from '@/features/tts/store';
import TTSPage from './page';

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
        maxCharsPerRequest: 10,
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
      style: ['温和', '叙事'],
      enabled: true,
    },
    {
      id: 'deep',
      engineId: 'fixture',
      name: '沉舟',
      language: 'zh',
      gender: 'male',
      style: ['低沉', '纪实'],
      enabled: true,
    },
  ],
}));

vi.mock('@/features/engines/hooks', () => ({
  useEngines: () => ({ data: fixtures.engines }),
  useVoices: () => ({ data: fixtures.voices }),
}));

function renderPage() {
  return render(
    <NextIntlClientProvider locale="zh" messages={zh}>
      <TTSPage />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useTTSStore.setState({ ...TTS_INITIAL_STATE });
});

describe('TTSPage', () => {
  it('counts characters and disables generate over the engine cap', async () => {
    const user = userEvent.setup();
    renderPage();

    const textarea = screen.getByRole('textbox', { name: '待合成文本' });
    await user.type(textarea, 'a'.repeat(11));

    expect(screen.getByText('11 / 10')).toBeVisible();
    expect(screen.getByRole('button', { name: /生成/ })).toBeDisabled();
  });

  it('restores cleared text through the inline undo action', async () => {
    const user = userEvent.setup();
    renderPage();

    const textarea = screen.getByRole('textbox', { name: '待合成文本' });
    await user.type(textarea, '你好');
    await user.click(screen.getByRole('button', { name: '清空' }));

    expect(textarea).toHaveValue('');
    await user.click(screen.getByRole('button', { name: '撤销' }));

    expect(textarea).toHaveValue('你好');
  });
});
