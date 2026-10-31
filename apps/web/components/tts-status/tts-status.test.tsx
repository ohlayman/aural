import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import zh from '@/messages/zh.json';
import { TTSStatus } from './tts-status';

function renderStatus(props: ComponentProps<typeof TTSStatus>) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zh}>
      <TTSStatus {...props} />
    </NextIntlClientProvider>,
  );
}

describe('TTSStatus', () => {
  it.each([
    ['queued', undefined, '排队中'],
    ['running', 'synthesizing', '正在合成'],
    ['running', 'encoding', '正在处理音频'],
    ['succeeded', 'done', '生成完成'],
  ] as const)('maps %s/%s to %s', (status, stage, label) => {
    renderStatus({ status, stage });

    expect(screen.getByText(label)).toBeVisible();
  });

  it('announces status changes politely', () => {
    const { container } = renderStatus({ status: 'running', stage: 'synthesizing' });

    expect(container.firstElementChild).toHaveAttribute('aria-live', 'polite');
  });

  it('shows retry and switch engine for a retryable provider failure', () => {
    renderStatus({
      status: 'failed',
      error: { code: 'PROVIDER_TIMEOUT', retryable: true },
    });

    expect(screen.getByText('生成失败')).toBeVisible();
    expect(screen.getByText(zh.errors.PROVIDER_TIMEOUT)).toBeVisible();
    expect(screen.getByRole('button', { name: '重试' })).toBeVisible();
    expect(screen.getByRole('button', { name: '换引擎重试' })).toBeVisible();
  });

  it('does not offer retry for a cancelled job', () => {
    renderStatus({ status: 'cancelled' });

    expect(screen.getByText('已取消')).toBeVisible();
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
    expect(screen.queryByRole('button', { name: '换引擎重试' })).toBeNull();
  });

  it('offers retry for an expired job', () => {
    renderStatus({ status: 'expired' });

    expect(screen.getByText('任务超时')).toBeVisible();
    expect(screen.getByRole('button', { name: '重试' })).toBeVisible();
  });

  it('shows the quota copy with its reset hint', () => {
    renderStatus({
      status: 'failed',
      error: { code: 'QUOTA_EXCEEDED', retryable: false },
    });

    expect(screen.getByText(zh.errors.QUOTA_EXCEEDED)).toBeVisible();
    expect(screen.queryByRole('button', { name: '换引擎重试' })).toBeNull();
  });

  it('falls back to generic copy for an unknown error code', () => {
    renderStatus({
      status: 'failed',
      error: { code: 'SOMETHING_NEW', retryable: true },
    });

    expect(screen.getByText(zh.errors.UNKNOWN)).toBeVisible();
  });
});
