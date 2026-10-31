'use client';

// Subpaths keep Turbopack from choking on the shared package's NodeNext
// `.js` re-export specifiers (same workaround as the constants export).
import { countChars } from '@aural/shared/chars';
import { MAX_TTS_CHARS } from '@aural/shared/constants';
import type { EngineView, JobStatus } from '@aural/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ConfigPanel } from '@/components/config-panel/config-panel';
import { Player } from '@/components/player/player';
import {
  TTSStatus,
  type TTSStatusError,
} from '@/components/tts-status/tts-status';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { fetchVoices } from '@/features/engines/api';
import { useEngines, useVoices } from '@/features/engines/hooks';
import { createTTSJob } from '@/features/tts/api';
import { isTerminalStatus, useTTSJob } from '@/features/tts/hooks';
import { useTTSStore } from '@/features/tts/store';
import { ApiError } from '@/lib/api-client';

const UNDO_WINDOW_MS = 5000;

function engineCap(engine: EngineView | undefined): number {
  const capabilities = engine?.capabilities;
  if (capabilities && 'maxCharsPerRequest' in capabilities) {
    return Math.min(
      MAX_TTS_CHARS,
      capabilities.maxCharsPerRequest ?? MAX_TTS_CHARS,
    );
  }
  return MAX_TTS_CHARS;
}

export function TTSPage() {
  const t = useTranslations('tts');
  const showToast = useToast();

  const text = useTTSStore((state) => state.text);
  const engineId = useTTSStore((state) => state.engineId);
  const voiceId = useTTSStore((state) => state.voiceId);
  const setText = useTTSStore((state) => state.setText);
  const setEngine = useTTSStore((state) => state.setEngine);
  const setVoice = useTTSStore((state) => state.setVoice);
  const clear = useTTSStore((state) => state.clear);

  const { data: engines } = useEngines();
  const engine = engines?.find((item) => item.id === engineId);
  const { data: voices } = useVoices(engineId);

  const [undoText, setUndoText] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const playerRef = useRef<HTMLDivElement | null>(null);
  // Latest generate closure for the page-wide ⌘/Ctrl+Enter shortcut.
  const shortcutRef = useRef<{
    canGenerate: boolean;
    busy: boolean;
    submit: () => void;
  }>({ canGenerate: false, busy: false, submit: () => {} });

  const [jobId, setJobId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<TTSStatusError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [assetId, setAssetId] = useState<string | null>(null);
  // Snapshot of the submitted text so editing later does not rename the track.
  const [resultTitle, setResultTitle] = useState('');

  const {
    data: job,
    isError: pollFailed,
    error: jobQueryError,
  } = useTTSJob(jobId ?? undefined);

  // Load persisted params after mount (keeps SSR and client markup in sync).
  // Fallback effects wait for this so they never overwrite a persisted engine.
  useEffect(() => {
    const unsubscribe = useTTSStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    void useTTSStore.persist.rehydrate();

    return unsubscribe;
  }, []);

  // Keep the persisted engine valid, falling back to the first one.
  useEffect(() => {
    if (!hydrated || !engines?.length) return;

    const storedEngineId = useTTSStore.getState().engineId;
    if (!engines.some((item) => item.id === storedEngineId)) {
      setEngine(engines[0].id);
    }
  }, [hydrated, engines, setEngine]);

  // A new engine resets the voice (store) — resolve it to its first voice.
  useEffect(() => {
    if (!hydrated || !engineId || !voices?.length) return;

    const storedVoiceId = useTTSStore.getState().voiceId;
    if (!voices.some((voice) => `${engineId}:${voice.id}` === storedVoiceId)) {
      setVoice(`${engineId}:${voices[0].id}`);
    }
  }, [hydrated, engineId, voices, voiceId, setVoice]);

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (job?.status === 'succeeded' && job.output?.assetId) {
      setAssetId(job.output.assetId);
    }
  }, [job]);

  // Poll failures are retryable: polling keeps running, so a later successful
  // poll replaces this error automatically.
  const pollError: TTSStatusError | null =
    jobId && pollFailed
      ? {
          code:
            jobQueryError instanceof ApiError ? jobQueryError.code : 'NETWORK',
          retryable: true,
        }
      : null;

  const effectiveError: TTSStatusError | undefined =
    localError ??
    pollError ??
    (job?.error
      ? { code: job.error.code, retryable: job.error.retryable }
      : undefined);

  const jobLoading =
    Boolean(jobId) &&
    !effectiveError &&
    (!job || !isTerminalStatus(job.status));
  const busy = submitting || jobLoading;

  const displayStatus: JobStatus | null = effectiveError
    ? 'failed'
    : job?.status ?? (jobId ? 'queued' : null);
  const displayError = effectiveError;

  async function submitTTSJob(overrides?: {
    engineId: string;
    voiceId: string;
  }): Promise<void> {
    const state = useTTSStore.getState();
    const nextEngineId = overrides?.engineId ?? state.engineId;
    const nextVoiceId = overrides?.voiceId ?? state.voiceId;

    if (!state.text.trim() || !nextEngineId || !nextVoiceId) return;

    setLocalError(null);
    setJobId(null);
    setAssetId(null);
    setResultTitle(state.text.trim().slice(0, 60) || t('title'));
    setSubmitting(true);

    try {
      const result = await createTTSJob({
        text: state.text,
        engineId: nextEngineId,
        voiceId: nextVoiceId,
        language: state.language,
        speed: state.speed,
        pitch: state.pitch,
      });
      setJobId(result.jobId);
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? { code: error.code, retryable: error.retryable }
          : { code: 'UNKNOWN', retryable: true },
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleRetry() {
    void submitTTSJob();
  }

  async function handleSwitchEngine() {
    const list = engines ?? [];
    const index = list.findIndex((item) => item.id === engineId);
    const next = list.length > 1 ? list[(index + 1) % list.length] : undefined;

    if (!next || next.id === engineId) {
      showToast(t('noOtherEngine'));
      return;
    }

    setLocalError(null);
    setJobId(null);
    setAssetId(null);
    setSubmitting(true);

    try {
      const nextVoices = await fetchVoices(next.id);
      if (!nextVoices.length) {
        showToast(t('noOtherVoice'));
        return;
      }

      const nextVoiceId = `${next.id}:${nextVoices[0].id}`;
      setEngine(next.id);
      setVoice(nextVoiceId);
      showToast(t('switchEngineRetry', { name: next.displayName }));
      await submitTTSJob({ engineId: next.id, voiceId: nextVoiceId });
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? { code: error.code, retryable: error.retryable }
          : { code: 'UNKNOWN', retryable: true },
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleEngineChange(next: string) {
    const nextEngine = engines?.find((item) => item.id === next);
    setEngine(next);
    setUndoText(null);
    showToast(
      t('engineSwitched', { name: nextEngine?.displayName ?? next }),
    );
  }

  function handleClear() {
    if (!text) return;

    const previous = text;
    clear();
    setUndoText(previous);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setUndoText(null);
      undoTimer.current = null;
    }, UNDO_WINDOW_MS);
    showToast(t('cleared'));
  }

  function handleUndo() {
    if (undoText === null) return;
    setText(undoText);
    setUndoText(null);
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
  }

  const count = countChars(text);
  const cap = engineCap(engine);
  const overCap = count > cap;
  const warn = !overCap && count >= cap * 0.8;
  const canGenerate =
    text.trim().length > 0 && !overCap && Boolean(engineId) && Boolean(voiceId);

  // Keep the shortcut closure in sync with the latest state.
  useEffect(() => {
    shortcutRef.current = {
      canGenerate,
      busy,
      submit: () => void submitTTSJob(),
    };
  });

  // ⌘/Ctrl+Enter anywhere on the page submits the current text.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();

      const { canGenerate: allowed, busy: isBusy, submit } =
        shortcutRef.current;
      if (!allowed || isBusy) return;
      submit();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // On narrow screens, bring the player into view once generation starts.
  useEffect(() => {
    if (!jobId || typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 1023px)').matches) return;

    const node = playerRef.current;
    if (!node) return;

    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    node.scrollIntoView({
      block: 'center',
      behavior: reduced ? 'auto' : 'smooth',
    });
  }, [jobId]);

  const counterClass = overCap
    ? 'text-[var(--danger)]'
    : warn
      ? 'text-[var(--warning)]'
      : 'text-[var(--text-tertiary)]';

  const engineOptions =
    engines?.map((item) => ({ value: item.id, label: item.displayName })) ?? [];

  const selectedVoice = voices?.find(
    (voice) => `${engineId}:${voice.id}` === voiceId,
  );

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-[var(--text-secondary)]">{t('subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          <Select
            ariaLabel={t('engineLabel')}
            value={engineId}
            onValueChange={handleEngineChange}
            options={engineOptions}
          />
          <Button
            disabled={!canGenerate || busy}
            loading={busy}
            onClick={() => void submitTTSJob()}
          >
            {t('generate')}
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elev-1)] p-5">
          <label
            htmlFor="tts-text"
            className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]"
          >
            {t('textLabel')}
          </label>
          <textarea
            id="tts-text"
            aria-label={t('textLabel')}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t('textPlaceholder')}
            rows={12}
            className="min-h-64 w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-elev-2)] px-4 py-3 text-sm leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition focus-visible:border-[var(--violet)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)]"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleClear}>
                {t('clear')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setText(t('sampleText'))}
              >
                {t('sample')}
              </Button>
              {undoText !== null ? (
                <Button variant="text" size="sm" onClick={handleUndo}>
                  {t('undo')}
                </Button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {overCap ? (
                <span className="text-xs text-[var(--danger)]">
                  {t('overCap', { cap })}
                </span>
              ) : null}
              <span className={`font-mono text-xs ${counterClass}`}>
                {count} / {cap}
              </span>
            </div>
          </div>

          {displayStatus ? (
            <div data-asset-id={assetId ?? undefined}>
              <TTSStatus
                status={displayStatus}
                stage={job?.stage}
                error={displayError}
                onRetry={handleRetry}
                onSwitchEngine={() => void handleSwitchEngine()}
              />
            </div>
          ) : null}

          <div ref={playerRef}>
            <Player
              assetId={assetId ?? undefined}
              title={resultTitle || t('title')}
              engineLabel={engine?.displayName ?? engineId}
              voiceName={selectedVoice?.name ?? voiceId}
              status={job?.status}
            />
          </div>
        </div>

        <ConfigPanel engine={engine} voices={voices} />
      </div>
    </section>
  );
}

export default TTSPage;
