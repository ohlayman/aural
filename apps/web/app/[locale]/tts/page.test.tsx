import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/messages/zh.json';
import { TTS_INITIAL_STATE, useTTSStore } from '@/features/tts/store';
import { ApiError } from '@/lib/api-client';
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

const ttsJob = vi.hoisted(() => ({
  createTTSJob: vi.fn(),
  query: {
    data: undefined as unknown,
    isError: false,
    error: undefined as unknown,
  },
}));

vi.mock('@/features/tts/api', () => ({
  createTTSJob: ttsJob.createTTSJob,
  getJob: vi.fn(),
}));

vi.mock('@/features/tts/hooks', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/tts/hooks')>();
  return {
    ...actual,
    useTTSJob: () => ttsJob.query,
  };
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="zh" messages={zh}>
        <TTSPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useTTSStore.setState({ ...TTS_INITIAL_STATE });
  ttsJob.createTTSJob.mockReset();
  ttsJob.query.data = undefined;
  ttsJob.query.isError = false;
  ttsJob.query.error = undefined;
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

  it('keeps a selected non-default voice', async () => {
    const user = userEvent.setup();
    renderPage();

    const second = await screen.findByRole('button', { name: /^沉舟/ });
    await user.click(second);

    expect(useTTSStore.getState().voiceId).toBe('fixture:deep');
    expect(second).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps persisted engine, voice and pitch after rehydration', async () => {
    window.localStorage.setItem(
      'aural:tts',
      JSON.stringify({
        state: {
          text: '持久化文本',
          engineId: 'fixture',
          voiceId: 'fixture:deep',
          language: 'en',
          speed: 1.5,
          pitch: 3,
        },
        version: 0,
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(useTTSStore.getState().engineId).toBe('fixture');
      expect(useTTSStore.getState().voiceId).toBe('fixture:deep');
      expect(useTTSStore.getState().pitch).toBe(3);
    });

    expect(
      screen.getByRole('textbox', { name: '待合成文本' }),
    ).toHaveValue('持久化文本');
    expect(screen.getByRole('button', { name: /^沉舟/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('surfaces a poll failure as a failed status and re-enables generate', async () => {
    ttsJob.createTTSJob.mockResolvedValue({
      jobId: 'job-1',
      status: 'queued',
      createdAt: '2026-10-31T00:00:00.000Z',
    });
    ttsJob.query.isError = true;
    ttsJob.query.error = new ApiError({
      code: 'NETWORK',
      message: 'Network request failed',
      status: 0,
      retryable: true,
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(useTTSStore.getState().voiceId).toBe('fixture:default');
    });

    await user.type(
      screen.getByRole('textbox', { name: '待合成文本' }),
      '你好',
    );
    const generate = screen.getByRole('button', { name: '生成' });
    await user.click(generate);

    expect(await screen.findByText('生成失败')).toBeVisible();
    expect(screen.getByText(zh.errors.NETWORK)).toBeVisible();
    expect(screen.getByRole('button', { name: '重试' })).toBeVisible();
    expect(generate).toBeEnabled();
    expect(generate).not.toHaveAttribute('aria-busy');
  });
});
