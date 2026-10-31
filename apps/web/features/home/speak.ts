// Subpath keeps Turbopack from choking on the shared package's NodeNext
// `.js` re-export specifiers; the value still comes from @aural/shared.
import { POLL_INTERVALS } from '@aural/shared/constants';
import { createTTSJob, fetchAssetAudio, getJob } from '@/features/tts/api';
import { playBuffer } from '@/lib/audio/play-buffer';

/** Upper bound for queueing/synthesis before the browser gives up. */
export const SPEAK_TIMEOUT_MS = 120_000;

export type SpeakState = 'thinking' | 'speaking';

export interface SpeakTextOptions {
  text: string;
  engineId: string;
  voiceId: string;
  onState: (state: SpeakState) => void;
  onError: (error: unknown) => void;
  /** Lets the caller drive the orb's FFT ring; null once the graph is gone. */
  onAnalyser?: (analyser: AnalyserNode | null) => void;
  signal: AbortSignal;
}

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'expired']);

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(abortError());
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function playUntilEnded(
  ctx: AudioContext,
  buffer: AudioBuffer,
  analyser: AnalyserNode,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    function finish() {
      settled = true;
      signal.removeEventListener('abort', onAbort);
    }

    const handle = playBuffer(ctx, buffer, analyser, 0, () => {
      if (settled) return;
      finish();
      resolve();
    });

    function onAbort() {
      if (settled) return;
      finish();
      handle.stop();
      reject(abortError());
    }

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Creates a TTS job, polls it with the shared backoff (1s, 2s, then every 5s),
 * downloads and decodes the result, then plays it through an AnalyserNode.
 *
 * The AudioContext is created synchronously so browsers associate it with the
 * caller's user gesture. It is always closed when this function returns.
 * Errors are reported through `onError`; aborting resolves silently.
 */
export async function speakText(options: SpeakTextOptions): Promise<void> {
  const { text, engineId, voiceId, onState, onError, onAnalyser, signal } =
    options;

  let ctx: AudioContext | null = null;

  try {
    onState('thinking');

    ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.82;
    const gain = ctx.createGain();
    analyser.connect(gain);
    gain.connect(ctx.destination);
    onAnalyser?.(analyser);

    await ctx.resume();

    const { jobId } = await createTTSJob({ text, engineId, voiceId });
    const startedAt = Date.now();
    let attempt = 0;

    for (;;) {
      throwIfAborted(signal);

      const interval =
        POLL_INTERVALS[Math.min(attempt, POLL_INTERVALS.length - 1)];
      if (Date.now() - startedAt + interval > SPEAK_TIMEOUT_MS) {
        throw new Error('TTS job timed out');
      }

      await sleep(interval, signal);
      attempt += 1;
      throwIfAborted(signal);

      const job = await getJob(jobId);
      throwIfAborted(signal);

      if (!TERMINAL_STATUSES.has(job.status)) continue;

      if (job.status !== 'succeeded') {
        throw new Error(job.error?.message ?? `TTS job ${job.status}`);
      }

      const assetId = job.output?.assetId;
      if (!assetId) throw new Error('TTS job returned no audio');

      const audio = await fetchAssetAudio(assetId);
      throwIfAborted(signal);

      const buffer = await ctx.decodeAudioData(audio);
      throwIfAborted(signal);

      onState('speaking');
      await playUntilEnded(ctx, buffer, analyser, signal);
      return;
    }
  } catch (error) {
    if (isAbortError(error) || signal.aborted) return;
    onError(error);
  } finally {
    onAnalyser?.(null);
    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => {});
    }
  }
}
