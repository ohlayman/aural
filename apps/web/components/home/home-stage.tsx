'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useEngines, useVoices } from '@/features/engines/hooks';
import {
  VoicePicker,
  type VoicePickerValue,
} from '@/components/voice-picker/voice-picker';
import { VoiceOrb } from '@/components/voice-orb/voice-orb';

const STORAGE_KEY = 'aural:voice';

function engineOf(voiceId: string): string {
  const separator = voiceId.indexOf(':');
  return separator > 0 ? voiceId.slice(0, separator) : '';
}

function localIdOf(voiceId: string): string {
  const separator = voiceId.indexOf(':');
  return separator > 0 ? voiceId.slice(separator + 1) : voiceId;
}

function readStoredVoice(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistVoice(voiceId: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, voiceId);
  } catch {
    // Storage can be unavailable (private mode); the selection still works.
  }
}

export function HomeStage() {
  const t = useTranslations('home');
  const { data: engines } = useEngines();
  const [selection, setSelection] = useState<VoicePickerValue | null>(null);

  const engineId = selection?.engineId ?? '';
  const { data: voices } = useVoices(engineId);

  // Seed from localStorage when valid, otherwise fall back to the first engine.
  useEffect(() => {
    if (!engines?.length || selection) return;

    const stored = readStoredVoice();
    if (stored) {
      const storedEngine = engineOf(stored);
      if (engines.some((engine) => engine.id === storedEngine)) {
        setSelection({ engineId: storedEngine, voiceId: stored });
        return;
      }
    }

    setSelection({ engineId: engines[0].id, voiceId: '' });
  }, [engines, selection]);

  // Repair the voice id once the engine's voices arrive.
  useEffect(() => {
    if (!selection || !voices?.length) return;

    const known = voices.some(
      (voice) => `${selection.engineId}:${voice.id}` === selection.voiceId,
    );
    if (!known) {
      setSelection({
        engineId: selection.engineId,
        voiceId: `${selection.engineId}:${voices[0].id}`,
      });
    }
  }, [selection, voices]);

  const voiceIndex =
    voices && selection
      ? voices.findIndex((voice) => voice.id === localIdOf(selection.voiceId))
      : -1;

  // Small +/-8deg tint so every voice feels slightly different.
  const hue = voiceIndex >= 0 ? ((voiceIndex % 3) - 1) * 8 : 0;

  function handleChange(next: VoicePickerValue) {
    setSelection(next);
    persistVoice(next.voiceId);
  }

  return (
    <section className="relative mx-auto flex min-h-[calc(100vh-66px)] w-full max-w-6xl flex-col px-6 pb-2 pt-14 text-center">
      <div className="pointer-events-none absolute inset-x-6 top-8 hidden justify-between font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] sm:flex">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-1 w-1 rounded-full bg-[var(--cyan)] shadow-[0_0_8px_var(--cyan)]"
          />
          {t('metaOnline')}
        </span>
        <span>{t('metaFormat')}</span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="mb-5 text-[11px] uppercase tracking-[0.28em] text-[var(--text-tertiary)]">
          {t('eyebrow')}
        </div>

        <h1 className="mb-4 max-w-[900px] text-balance text-[clamp(32px,4.6vw,56px)] font-medium leading-[1.12] tracking-[-0.04em]">
          <span className="block">
            {t.rich('titleLine1', {
              em: (chunks) => (
                <em className="not-italic bg-[linear-gradient(100deg,#D6CBFF_0%,#8E74FF_38%,#22D3EE_92%)] bg-clip-text text-transparent">
                  {chunks}
                </em>
              ),
            })}
          </span>
          <span className="block">{t('titleLine2')}</span>
        </h1>

        <p className="max-w-[470px] text-[15.5px] leading-snug text-[var(--text-secondary)]">
          {t('lede')}
        </p>

        <div className="relative mt-2 flex w-fit max-w-full flex-col items-center">
          <div className="z-20 mb-4 flex justify-center lg:absolute lg:right-0 lg:top-[15%] lg:mb-0">
            {selection?.voiceId ? (
              <VoicePicker value={selection} onChange={handleChange} align="right" />
            ) : (
              <div
                aria-hidden="true"
                className="h-9 w-36 animate-pulse rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elev-2)] motion-reduce:animate-none"
              />
            )}
          </div>

          <VoiceOrb
            state="idle"
            amp={0.14}
            hue={hue}
            label={t('orbLabel')}
          />
        </div>

        <div className="mt-3 flex items-center gap-2 font-mono text-xs tracking-[0.1em] text-[var(--text-secondary)]">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-white/30 motion-safe:animate-pulse"
          />
          <span>{t('hint')}</span>
        </div>
      </div>

      <footer className="mt-3 flex w-full items-end justify-end px-1 font-mono text-[11.5px] text-[var(--text-tertiary)]">
        <div className="flex gap-6 text-left sm:gap-8">
          <div>
            <b className="block text-sm font-medium text-[var(--text-secondary)]">12</b>
            <span className="uppercase tracking-[0.12em]">{t('stats.languages')}</span>
          </div>
          <div>
            <b className="block text-sm font-medium text-[var(--text-secondary)]">24</b>
            <span className="uppercase tracking-[0.12em]">{t('stats.voices')}</span>
          </div>
          <div>
            <b className="block text-sm font-medium text-[var(--text-secondary)]">
              &lt;200<span className="text-[10px]">ms</span>
            </b>
            <span className="uppercase tracking-[0.12em]">{t('stats.firstByte')}</span>
          </div>
        </div>
      </footer>
    </section>
  );
}
