'use client';

import type { JobStage, JobStatus } from '@aural/shared';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/** Provider-side failures where another engine may succeed. */
const SWITCHABLE_ERRORS = new Set([
  'PROVIDER_TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'INTERNAL',
]);

export interface TTSStatusError {
  code: string;
  retryable?: boolean;
}

export interface TTSStatusProps {
  status: JobStatus;
  stage?: JobStage;
  error?: TTSStatusError;
  onRetry?: () => void;
  onSwitchEngine?: () => void;
}

function statusKey(status: JobStatus, stage?: JobStage): string {
  if (status === 'running') {
    if (stage === 'synthesizing') return 'synthesizing';
    if (stage === 'encoding') return 'encoding';
    return 'running';
  }
  return status;
}

function dotClass(status: JobStatus): string {
  if (status === 'running') return 'bg-[var(--cyan)] animate-pulse';
  if (status === 'succeeded') return 'bg-[var(--success)]';
  if (status === 'failed' || status === 'expired') return 'bg-[var(--danger)]';
  if (status === 'cancelled') return 'bg-[var(--text-tertiary)]';
  // queued / ready
  return 'bg-[var(--violet)]';
}

export function TTSStatus({
  status,
  stage,
  error,
  onRetry,
  onSwitchEngine,
}: TTSStatusProps) {
  const t = useTranslations('tts.status');
  const tErrors = useTranslations('errors');

  const showError = status === 'failed' || status === 'expired';
  const errorKey =
    status === 'expired'
      ? 'EXPIRED'
      : error?.code && tErrors.has(error.code)
        ? error.code
        : 'UNKNOWN';

  const canRetry =
    status === 'expired' || (status === 'failed' && error?.retryable === true);
  const canSwitchEngine = error?.code
    ? SWITCHABLE_ERRORS.has(error.code)
    : false;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elev-1)] p-4"
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass(status)}`}
        />
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {t(statusKey(status, stage))}
        </span>
      </div>

      {showError ? (
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          {tErrors(errorKey)}
        </p>
      ) : null}

      {canRetry || canSwitchEngine ? (
        <div className="flex flex-wrap items-center gap-2">
          {canRetry ? (
            <Button size="sm" onClick={onRetry}>
              {t('retry')}
            </Button>
          ) : null}
          {canSwitchEngine ? (
            <Button size="sm" variant="ghost" onClick={onSwitchEngine}>
              {t('switchEngine')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
