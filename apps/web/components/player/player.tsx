'use client';

import { useTranslations } from 'next-intl';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { Slider } from '@/components/ui/slider';
import { computePeaks, decodeAudio } from '@/lib/audio/decode';
import {
  createAudioPlayer,
  type AudioPlayerController,
} from '@/lib/audio/player';
import { buildBars, drawRibbon, formatTime } from './ribbon';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const SEEK_STEP_SECONDS = 5;
const SPECTRUM_BANDS = 64;
const DPR_CAP = 1.75;

type Phase = 'empty' | 'loading' | 'ready' | 'error';
type Mode = 'ready' | 'playing' | 'paused';

export interface PlayerProps {
  assetId?: string;
  title: string;
  engineLabel: string;
  voiceName: string;
  status?: string;
}

function formatRate(rate: number): string {
  return `${rate}×`;
}

function fileStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}`;
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-');
}

/** 64-band radial spectrum from real FFT data; null draws the idle ring. */
function drawSpectrum(
  canvas: HTMLCanvasElement | null,
  values: Uint8Array | null,
): void {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;

  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 118;
  const height = rect.height || 118;
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const inner = size * 0.254;
  const max = size * 0.474;

  if (!values) {
    context.beginPath();
    context.arc(cx, cy, inner, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    context.lineWidth = 1;
    context.stroke();
    return;
  }

  const usable = Math.max(SPECTRUM_BANDS, Math.floor(values.length * 0.75));
  context.lineCap = 'round';
  context.lineWidth = 1.5;

  for (let band = 0; band < SPECTRUM_BANDS; band++) {
    const start = Math.floor((band / SPECTRUM_BANDS) * usable);
    const end = Math.max(
      start + 1,
      Math.floor(((band + 1) / SPECTRUM_BANDS) * usable),
    );
    let sum = 0;
    let count = 0;
    for (let bin = start; bin < end && bin < values.length; bin++) {
      sum += values[bin];
      count += 1;
    }
    const value = count > 0 ? sum / count / 255 : 0;

    const angle = (band / SPECTRUM_BANDS) * Math.PI * 2 - Math.PI / 2;
    const length = inner + (max - inner) * value;
    const mix = band / (SPECTRUM_BANDS - 1);
    const red = Math.round(34 + (142 - 34) * mix);
    const green = Math.round(211 + (116 - 211) * mix);
    const blue = Math.round(238 + (255 - 238) * mix);
    const alpha = 0.16 + value * 0.7;

    context.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
    context.beginPath();
    context.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    context.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
    context.stroke();
  }
}

export function Player({
  assetId,
  title,
  engineLabel,
  voiceName,
}: PlayerProps) {
  const t = useTranslations('player');

  const [phase, setPhase] = useState<Phase>(assetId ? 'loading' : 'empty');
  const [mode, setMode] = useState<Mode>('ready');
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [hover, setHover] = useState<{ left: number; time: number } | null>(
    null,
  );
  const [downloadStamp, setDownloadStamp] = useState('');

  const controllerRef = useRef<AudioPlayerController | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ribbonRef = useRef<HTMLCanvasElement | null>(null);
  const radialRef = useRef<HTMLCanvasElement | null>(null);
  const currentTimeRef = useRef<HTMLSpanElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const barsRef = useRef<number[]>([]);
  const rateRef = useRef(1);
  const volumeRef = useRef(1);
  const lastVolumeRef = useRef(1);

  // Decode the asset and build the audio graph for this assetId.
  useEffect(() => {
    if (!assetId) {
      barsRef.current = [];
      setPhase('empty');
      setMode('ready');
      setDuration(0);
      setHover(null);
      return;
    }

    let cancelled = false;
    let ctx: AudioContext | null = null;
    let controller: AudioPlayerController | null = null;

    setPhase('loading');
    setMode('ready');
    setDuration(0);
    setHover(null);
    setDownloadStamp(fileStamp(new Date()));

    const url = `/api/v1/assets/${encodeURIComponent(assetId)}/audio`;

    void (async () => {
      try {
        ctx = new AudioContext();
        const buffer = await decodeAudio(url, ctx);
        if (cancelled) return;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.82;
        const gain = ctx.createGain();

        const created = createAudioPlayer(
          ctx,
          buffer,
          analyser,
          gain,
          () => setMode('ready'),
        );
        created.setRate(rateRef.current);
        created.setVolume(volumeRef.current);
        controller = created;
        controllerRef.current = created;
        analyserRef.current = analyser;
        barsRef.current = buildBars(computePeaks(buffer, 120), 160);

        setDuration(buffer.duration);
        setPhase('ready');
        setMode('ready');
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
      controllerRef.current = null;
      analyserRef.current = null;
      controller?.dispose();
      if (ctx && ctx.state !== 'closed') {
        void ctx.close().catch(() => {});
      }
    };
  }, [assetId]);

  // Idle ring whenever there is no live spectrum.
  useEffect(() => {
    drawSpectrum(radialRef.current, null);
  }, [phase]);

  // Progress, ribbon, spectrum: direct DOM/canvas writes, never React state.
  useEffect(() => {
    if (phase !== 'ready') return;

    let frameId = 0;
    let lastPlaying = false;
    let idleDrawn = false;
    const bins = new Uint8Array(256);

    function frame() {
      const controller = controllerRef.current;
      if (controller) {
        const playing = controller.isPlaying();
        const current = controller.getCurrentTime();
        const total = controller.getDuration();
        const progress = total > 0 ? current / total : 0;

        if (ribbonRef.current) {
          drawRibbon(ribbonRef.current, barsRef.current, progress);
        }
        if (currentTimeRef.current) {
          const text = formatTime(current);
          if (currentTimeRef.current.textContent !== text) {
            currentTimeRef.current.textContent = text;
          }
        }

        if (playing) {
          const analyser = analyserRef.current;
          if (analyser) {
            try {
              analyser.getByteFrequencyData(bins);
            } catch {
              // The analyser can be mid-teardown; keep the last frame.
            }
            drawSpectrum(radialRef.current, bins);
          }
          idleDrawn = false;
        } else if (!idleDrawn) {
          drawSpectrum(radialRef.current, null);
          idleDrawn = true;
        }

        if (playing !== lastPlaying) {
          lastPlaying = playing;
          if (glowRef.current) {
            glowRef.current.style.opacity = playing ? '1' : '0.5';
          }
        }
      }

      frameId = requestAnimationFrame(frame);
    }

    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [phase]);

  const playing = mode === 'playing';
  const label =
    phase === 'empty'
      ? 'QUEUED'
      : phase === 'loading'
        ? 'LOADING'
        : phase === 'error'
          ? 'FAILED'
          : mode === 'playing'
            ? 'PLAYING'
            : mode === 'paused'
              ? 'PAUSED'
              : 'READY';

  async function togglePlay() {
    const controller = controllerRef.current;
    if (!controller || phase !== 'ready') return;

    if (controller.isPlaying()) {
      controller.pause();
      setMode('paused');
      return;
    }

    try {
      await controller.play();
      setMode(controller.isPlaying() ? 'playing' : 'ready');
    } catch {
      setMode('ready');
    }
  }

  function seekBy(delta: number) {
    const controller = controllerRef.current;
    if (!controller || phase !== 'ready') return;

    controller.seek(controller.getCurrentTime() + delta);
    setMode(
      controller.isPlaying()
        ? 'playing'
        : controller.getCurrentTime() > 0
          ? 'paused'
          : 'ready',
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (phase !== 'ready') return;

    const isSpace = event.key === ' ' || event.key === 'Spacebar';
    const isArrow = event.key === 'ArrowRight' || event.key === 'ArrowLeft';
    if (!isSpace && !isArrow) return;

    // Focused controls (play/speed/download/volume slider) own these keys.
    const target = event.target as HTMLElement;
    if (
      target !== event.currentTarget &&
      target.closest('button,a,input,[role="slider"]')
    ) {
      return;
    }

    event.preventDefault();
    if (isSpace) {
      void togglePlay();
    } else {
      seekBy(
        event.key === 'ArrowRight' ? SEEK_STEP_SECONDS : -SEEK_STEP_SECONDS,
      );
    }
  }

  function ratioAt(event: MouseEvent<HTMLDivElement>): number | null {
    const ribbon = ribbonRef.current;
    if (!ribbon) return null;
    const rect = ribbon.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  }

  function handleRibbonMove(event: MouseEvent<HTMLDivElement>) {
    if (phase !== 'ready') return;
    const ratio = ratioAt(event);
    if (ratio === null) return;
    setHover({ left: ratio * 100, time: ratio * duration });
  }

  function handleRibbonClick(event: MouseEvent<HTMLDivElement>) {
    if (phase !== 'ready') return;
    const ratio = ratioAt(event);
    const controller = controllerRef.current;
    if (ratio === null || !controller) return;

    controller.seek(ratio * controller.getDuration());
    setMode(
      controller.isPlaying()
        ? 'playing'
        : controller.getCurrentTime() > 0
          ? 'paused'
          : 'ready',
    );
  }

  function cycleRate() {
    const index = SPEEDS.indexOf(rate);
    const next = SPEEDS[(index + 1) % SPEEDS.length];
    rateRef.current = next;
    setRate(next);
    controllerRef.current?.setRate(next);
  }

  function changeVolume(percent: number) {
    const next = Math.min(1, Math.max(0, percent / 100));
    if (next > 0) lastVolumeRef.current = next;
    volumeRef.current = next;
    setVolume(next);
    setMuted(next === 0);
    controllerRef.current?.setVolume(next);
  }

  function toggleMute() {
    const next = muted || volume === 0 ? lastVolumeRef.current || 1 : 0;
    if (next > 0) lastVolumeRef.current = next;
    volumeRef.current = next;
    setVolume(next);
    setMuted(next === 0);
    controllerRef.current?.setVolume(next);
  }

  const audioUrl = assetId
    ? `/api/v1/assets/${encodeURIComponent(assetId)}/audio`
    : undefined;
  const downloadName = `aural-${safeFileName(voiceName)}-${
    downloadStamp || '00000000-0000'
  }.mp3`;
  const dimmed = phase === 'empty' ? 'opacity-40' : '';

  return (
    <div className="relative mt-4 overflow-hidden rounded-[20px] border border-[var(--border-subtle)] bg-[linear-gradient(140deg,rgba(124,92,255,0.09),rgba(10,12,17,0.6)_42%,rgba(34,211,238,0.05))]">
      <div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-10%] inset-y-[-40%] bg-[radial-gradient(closest-side,rgba(124,92,255,0.22),transparent_70%)] opacity-50 blur-[24px] transition-opacity duration-300"
      />

      <div
        role="group"
        aria-label={t('region')}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="relative flex flex-wrap items-center gap-5 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)] sm:flex-nowrap"
      >
        <div
          className={`relative h-[118px] w-[118px] flex-none ${dimmed}`}
        >
          <canvas
            ref={radialRef}
            aria-hidden="true"
            className="block h-full w-full"
          />
          <button
            type="button"
            aria-label={playing ? t('pause') : t('play')}
            disabled={phase !== 'ready'}
            onClick={() => void togglePlay()}
            className="absolute inset-0 z-[2] m-auto grid h-12 w-12 place-items-center rounded-full border border-[var(--border-strong)] bg-[rgba(10,12,17,0.72)] text-[var(--text-primary)] backdrop-blur-sm transition hover:scale-105 hover:border-[rgba(124,92,255,0.6)] hover:bg-[rgba(124,92,255,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)] disabled:pointer-events-none disabled:opacity-40"
          >
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                <rect x="3" y="2" width="3" height="10" rx="1" />
                <rect x="8" y="2" width="3" height="10" rx="1" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                <path d="M4 2.4v9.2c0 .5.55.8.98.54l7-4.6a.64.64 0 0 0 0-1.08l-7-4.6A.64.64 0 0 0 4 2.4Z" />
              </svg>
            )}
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[var(--text-primary)]">
            {assetId ? title : t('empty')}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] uppercase tracking-[0.03em] text-[var(--text-tertiary)]">
            {engineLabel} · MP3 · 24kHz
          </div>

          <div
            className={`relative mt-2 h-14 cursor-pointer ${dimmed}`}
            onMouseMove={handleRibbonMove}
            onMouseLeave={() => setHover(null)}
            onClick={handleRibbonClick}
          >
            <canvas
              ref={ribbonRef}
              aria-hidden="true"
              className="block h-full w-full"
            />
            {hover ? (
              <div
                className="pointer-events-none absolute -top-[26px] -translate-x-1/2 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elev-2)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--text-primary)]"
                style={{ left: `${hover.left}%` }}
              >
                {formatTime(hover.time)}
              </div>
            ) : null}
          </div>

          <div
            className={`mt-0.5 flex justify-between font-mono text-[10.5px] tracking-[0.03em] text-[var(--text-tertiary)] ${dimmed}`}
          >
            <span ref={currentTimeRef} data-testid="player-current">
              00:00
            </span>
            <span data-testid="player-duration">{formatTime(duration)}</span>
          </div>
        </div>

        <div
          className={`flex flex-none flex-col items-end gap-2.5 ${dimmed}`}
        >
          <div
            data-testid="player-label"
            role="status"
            aria-live="polite"
            className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]"
          >
            {label}
          </div>

          <div className="flex items-center gap-1 text-[var(--text-secondary)]">
            <button
              type="button"
              aria-label={t('speed')}
              disabled={phase !== 'ready'}
              onClick={cycleRate}
              className="h-11 min-w-11 rounded-[9px] px-1.5 font-mono text-[11px] transition hover:bg-white/[0.07] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)] disabled:pointer-events-none disabled:opacity-40 lg:h-8 lg:min-w-8"
            >
              {formatRate(rate)}
            </button>

            <div className="flex w-24 items-center gap-1">
              <button
                type="button"
                aria-label={muted ? t('unmute') : t('mute')}
                disabled={phase !== 'ready'}
                onClick={toggleMute}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-[9px] transition hover:bg-white/[0.07] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)] disabled:pointer-events-none disabled:opacity-40 lg:h-8 lg:w-8"
              >
                {muted || volume === 0 ? (
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 2.5 4.5 5.2H2v5.6h2.5L8 13.5V2.5Z" />
                    <path d="m11 6 4 4m0-4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 2.5 4.5 5.2H2v5.6h2.5L8 13.5V2.5Z" />
                    <path d="M10.5 5.6a3.2 3.2 0 0 1 0 4.8M12.3 3.8a5.6 5.6 0 0 1 0 8.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
                  </svg>
                )}
              </button>
              <Slider
                ariaLabel={t('volume')}
                value={Math.round(volume * 100)}
                min={0}
                max={100}
                step={1}
                disabled={phase !== 'ready'}
                onValueChange={changeVolume}
              />
            </div>

            {audioUrl ? (
              <a
                href={audioUrl}
                download={downloadName}
                aria-label={t('download')}
                className="grid h-11 w-11 place-items-center rounded-[9px] transition hover:bg-white/[0.07] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)] lg:h-8 lg:w-8"
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 2.5v7.5m-2.8-2.8L8 10l2.8-2.8M3 12.5h10" />
                </svg>
              </a>
            ) : (
              <span
                aria-hidden="true"
                className="grid h-11 w-11 place-items-center opacity-40 lg:h-8 lg:w-8"
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2.5v7.5m-2.8-2.8L8 10l2.8-2.8M3 12.5h10" />
                </svg>
              </span>
            )}
          </div>
        </div>
      </div>

      {phase === 'error' ? (
        <p
          role="alert"
          className="relative border-t border-[var(--border-subtle)] px-4 py-2 text-xs text-[var(--danger)]"
        >
          {t('error')}
        </p>
      ) : null}
    </div>
  );
}

export default Player;
