'use client';

import type { Voice } from '@aural/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { previewUrl } from '@/features/engines/api';
import { useTTSStore } from '@/features/tts/store';

/** The minimal engine shape the panel needs (tests pass only `pitch`). */
export interface ConfigEngine {
  id: string;
  capabilities: {
    pitch?: boolean;
    maxCharsPerRequest?: number;
    [key: string]: unknown;
  };
}

export interface ConfigPanelValue {
  language: string;
  voiceId: string;
  speed: number;
  pitch: number;
}

export interface ConfigPanelProps {
  engine?: ConfigEngine | null;
  voices?: Voice[] | null;
  /** Overrides the persisted store value (used by tests and previews). */
  value?: ConfigPanelValue;
  onLanguageChange?: (language: string) => void;
  onVoiceChange?: (voiceId: string) => void;
  onSpeedChange?: (speed: number) => void;
  onPitchChange?: (pitch: number) => void;
}

export function ConfigPanel({
  engine,
  voices,
  value,
  onLanguageChange,
  onVoiceChange,
  onSpeedChange,
  onPitchChange,
}: ConfigPanelProps) {
  const t = useTranslations('tts');

  const storeLanguage = useTTSStore((state) => state.language);
  const storeVoiceId = useTTSStore((state) => state.voiceId);
  const storeSpeed = useTTSStore((state) => state.speed);
  const storePitch = useTTSStore((state) => state.pitch);
  const setLanguage = useTTSStore((state) => state.setLanguage);
  const setVoice = useTTSStore((state) => state.setVoice);
  const setSpeed = useTTSStore((state) => state.setSpeed);
  const setPitch = useTTSStore((state) => state.setPitch);

  const current = value ?? {
    language: storeLanguage,
    voiceId: storeVoiceId,
    speed: storeSpeed,
    pitch: storePitch,
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const pitchEnabled = engine?.capabilities.pitch !== false;

  const languageOptions = [
    { value: 'zh', label: t('language.zh') },
    { value: 'en', label: t('language.en') },
    { value: 'auto', label: t('language.auto') },
  ];

  function stopPreview() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
  }

  function togglePreview(voice: Voice) {
    if (!engine) return;

    const compositeId = `${engine.id}:${voice.id}`;
    if (playingId === compositeId) {
      stopPreview();
      return;
    }

    stopPreview();
    const audio = new Audio(previewUrl(compositeId));
    audioRef.current = audio;
    setPlayingId(compositeId);
    audio.onended = () => {
      if (audioRef.current === audio) {
        audioRef.current = null;
        setPlayingId(null);
      }
    };
    // Autoplay rejection must not surface as an unhandled rejection.
    void Promise.resolve(audio.play()).catch(() => {});
  }

  function selectVoice(voice: Voice) {
    stopPreview();
    const next = engine ? `${engine.id}:${voice.id}` : voice.id;
    if (onVoiceChange) onVoiceChange(next);
    else setVoice(next);
  }

  function changeLanguage(language: string) {
    if (onLanguageChange) onLanguageChange(language);
    else setLanguage(language);
  }

  function changeSpeed(speed: number) {
    if (onSpeedChange) onSpeedChange(speed);
    else setSpeed(speed);
  }

  function changePitch(pitch: number) {
    if (onPitchChange) onPitchChange(pitch);
    else setPitch(pitch);
  }

  // A new engine has a different preview source; never leave audio running.
  useEffect(() => {
    stopPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine?.id]);

  useEffect(() => () => audioRef.current?.pause(), []);

  function tagsOf(voice: Voice): string {
    const gender = voice.gender ? t(`gender.${voice.gender}`) : '';
    return [gender, voice.style?.[0]].filter(Boolean).join(' · ');
  }

  return (
    <aside className="flex flex-col gap-6 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elev-1)] p-5">
      <h2 className="text-sm font-medium text-[var(--text-primary)]">
        {t('configTitle')}
      </h2>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
          {t('languageLabel')}
        </span>
        <Select
          ariaLabel={t('languageLabel')}
          value={current.language}
          onValueChange={changeLanguage}
          options={languageOptions}
        />
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
          {t('voiceGroup')}
        </h3>

        {voices?.length ? (
          <ul className="flex flex-col gap-1.5">
            {voices.map((voice) => {
              const compositeId = engine ? `${engine.id}:${voice.id}` : voice.id;
              const selected =
                current.voiceId === voice.id || current.voiceId === compositeId;
              const playing = playingId === compositeId;
              const tags = tagsOf(voice);

              return (
                <li key={voice.id} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectVoice(voice)}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)] ${
                      selected
                        ? 'border-[var(--violet)] bg-[var(--bg-elev-2)]'
                        : 'border-transparent hover:bg-[var(--bg-elev-2)]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-7 w-7 shrink-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--cyan),var(--blue))]"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm text-[var(--text-primary)]">
                        {voice.name}
                      </span>
                      {tags ? (
                        <span className="truncate text-xs text-[var(--text-tertiary)]">
                          {tags}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={
                      playing
                        ? t('stopPreviewVoice', { name: voice.name })
                        : t('previewVoice', { name: voice.name })
                    }
                    aria-pressed={playing}
                    disabled={!engine}
                    onClick={() => togglePreview(voice)}
                    className="shrink-0 rounded-[var(--radius-full)] border border-[var(--border-strong)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)] disabled:opacity-40"
                  >
                    {playing ? t('stop') : t('preview')}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-[var(--text-tertiary)]">{t('voiceEmpty')}</p>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span>{t('speedLabel')}</span>
          <span className="font-mono text-[var(--text-tertiary)]">
            {current.speed.toFixed(2)}×
          </span>
        </div>
        <Slider
          ariaLabel={t('speedLabel')}
          value={current.speed}
          min={0.5}
          max={2}
          step={0.05}
          onValueChange={changeSpeed}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span>{t('pitchLabel')}</span>
          <span className="font-mono text-[var(--text-tertiary)]">
            {current.pitch > 0 ? `+${current.pitch}` : current.pitch}
          </span>
        </div>
        <Slider
          ariaLabel={t('pitchLabel')}
          value={current.pitch}
          min={-12}
          max={12}
          step={1}
          disabled={!pitchEnabled}
          onValueChange={changePitch}
        />
        {!pitchEnabled ? (
          <p className="text-xs text-[var(--text-tertiary)]">
            {t('pitchUnsupported')}
          </p>
        ) : null}
      </div>

      <p className="border-t border-[var(--border-subtle)] pt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
        {t('outputNote')}
      </p>
    </aside>
  );
}
