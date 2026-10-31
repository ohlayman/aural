'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { Voice } from '@aural/shared';
import { useEffect, useRef, useState } from 'react';
import { previewUrl } from '@/features/engines/api';
import { useEngines, useVoices } from '@/features/engines/hooks';

export interface VoicePickerValue {
  engineId: string;
  voiceId: string;
}

export interface VoicePickerProps {
  value: VoicePickerValue;
  onChange: (next: VoicePickerValue) => void;
  language?: string;
}

function localIdOf(voiceId: string): string {
  const separator = voiceId.indexOf(':');
  return separator > 0 ? voiceId.slice(separator + 1) : voiceId;
}

function tagsOf(voice: Voice): string {
  return [voice.gender, voice.style?.[0]].filter(Boolean).join(' · ');
}

export function VoicePicker({ value, onChange, language }: VoicePickerProps) {
  const [open, setOpen] = useState(false);
  const [activeEngine, setActiveEngine] = useState(value.engineId);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setActiveEngine(value.engineId);
  }, [value.engineId]);

  const { data: engines } = useEngines();
  const localId = localIdOf(value.voiceId);
  const { data: currentVoices } = useVoices(value.engineId, language);
  const currentVoice = currentVoices?.find((voice) => voice.id === localId);
  const currentName = currentVoice?.name ?? localId;
  const currentTier = engines?.find((engine) => engine.id === value.engineId)?.tier;

  const { data: activeVoices } = useVoices(activeEngine, language);

  function stopPreview() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
  }

  function togglePreview(voice: Voice) {
    const compositeId = `${activeEngine}:${voice.id}`;

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
    void Promise.resolve(audio.play()).catch(() => {});
  }

  function selectVoice(voice: Voice) {
    onChange({ engineId: activeEngine, voiceId: `${activeEngine}:${voice.id}` });
    setOpen(false);
  }

  function selectEngine(engineId: string) {
    stopPreview();
    setActiveEngine(engineId);
  }

  function handleOpenChange(next: boolean) {
    if (!next) stopPreview();
    if (next) setActiveEngine(value.engineId);
    setOpen(next);
  }

  useEffect(() => () => audioRef.current?.pause(), []);

  return (
    <div className="relative inline-block">
      <DialogPrimitive.Root modal={false} open={open} onOpenChange={handleOpenChange}>
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={`当前音色：${currentName}，点击更换`}
            className="inline-flex h-9 select-none items-center gap-2 rounded-[var(--radius-full)] border border-[var(--border-subtle)] bg-[var(--bg-elev-2)] px-3 text-sm text-[var(--text-primary)] transition hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)]"
          >
            <span
              aria-hidden="true"
              className="h-4 w-4 shrink-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--violet),var(--blue))] shadow-[var(--glow)]"
            />
            <span className="max-w-32 truncate">{currentName}</span>
            <span aria-hidden="true" className="h-3 w-px bg-[var(--border-strong)]" />
            <span className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
              {currentTier ?? ''}
            </span>
            <span aria-hidden="true" className="text-[var(--text-tertiary)]">
              ▾
            </span>
          </button>
        </DialogPrimitive.Trigger>

        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="absolute left-0 top-full z-50 mt-2 w-[322px] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elev-2)] p-3 text-[var(--text-primary)] shadow-[var(--shadow-md)] focus-visible:outline-none"
        >
          <DialogPrimitive.Title className="sr-only">选择音色</DialogPrimitive.Title>

          <div
            role="group"
            aria-label="引擎"
            className="flex gap-1 rounded-[var(--radius-sm)] bg-[var(--bg-elev-1)] p-1"
          >
            {engines?.map((engine) => {
              const active = engine.id === activeEngine;
              return (
                <button
                  key={engine.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectEngine(engine.id)}
                  className={`flex-1 rounded-[6px] px-2 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)] ${
                    active
                      ? 'bg-[var(--violet)] text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {engine.displayName}
                </button>
              );
            })}
          </div>

          <div role="radiogroup" aria-label="音色" className="mt-3 flex flex-col gap-1">
            {activeVoices?.map((voice) => {
              const compositeId = `${activeEngine}:${voice.id}`;
              const selected = activeEngine === value.engineId && voice.id === localId;
              const tags = tagsOf(voice);
              const playing = playingId === compositeId;

              return (
                <div
                  key={voice.id}
                  role="radio"
                  aria-checked={selected}
                  aria-label={tags ? `${voice.name} ${tags}` : voice.name}
                  tabIndex={0}
                  onClick={() => selectVoice(voice)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectVoice(voice);
                    }
                  }}
                  className={`flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)] ${
                    selected
                      ? 'border-[var(--violet)] bg-[var(--bg-elev-1)]'
                      : 'border-transparent hover:bg-[var(--bg-elev-1)]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-7 w-7 shrink-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--cyan),var(--blue))]"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">{voice.name}</span>
                    {tags ? (
                      <span className="truncate text-xs text-[var(--text-tertiary)]">
                        {tags}
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    aria-label={playing ? `停止试听 ${voice.name}` : `试听 ${voice.name}`}
                    aria-pressed={playing}
                    onClick={(event) => {
                      event.stopPropagation();
                      togglePreview(voice);
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    className="shrink-0 rounded-[var(--radius-full)] border border-[var(--border-strong)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)]"
                  >
                    {playing ? '停止' : '试听'}
                  </button>
                </div>
              );
            })}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Root>
    </div>
  );
}
