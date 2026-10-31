import { playBuffer, type PlayBufferHandle } from './play-buffer';

export interface AudioPlayerController {
  /** Resumes the context and starts playback at the stored offset. */
  play(): Promise<void>;
  /** Stores the current offset and stops the source. */
  pause(): void;
  /** Clamps to 0..duration and restarts the source when playing. */
  seek(time: number): void;
  /** Applies immediately to the running source and is remembered. */
  setRate(rate: number): void;
  /** Sets the gain (clamped to 0..1). */
  setVolume(volume: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getRate(): number;
  isPlaying(): boolean;
  /** Stops the source and tears down the analyser/gain graph. */
  dispose(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Playback controller on top of `playBuffer`. It owns the graph below the
 * analyser (analyser → gain → destination); the caller owns the context.
 * Progress uses the real audio clock (`ctx.currentTime`), never timers.
 */
export function createAudioPlayer(
  ctx: AudioContext,
  buffer: AudioBuffer,
  analyser: AnalyserNode,
  gain: GainNode,
  onEnded?: () => void,
): AudioPlayerController {
  analyser.connect(gain);
  gain.connect(ctx.destination);

  const duration = buffer.duration;
  let offset = 0;
  let startedAt = 0;
  let playing = false;
  let rate = 1;
  let handle: PlayBufferHandle | null = null;
  let disposed = false;

  function currentTime(): number {
    const time = playing ? offset + (ctx.currentTime - startedAt) * rate : offset;
    return clamp(time, 0, duration);
  }

  function startSource(at: number) {
    handle = playBuffer(ctx, buffer, analyser, at, () => {
      handle = null;
      playing = false;
      offset = 0;
      onEnded?.();
    });
    handle.setRate(rate);
  }

  function stopSource() {
    const current = handle;
    handle = null;
    current?.stop();
  }

  return {
    async play() {
      if (disposed || playing) return;
      // Starting at the very end would end instantly; replay from the top.
      if (offset >= duration) offset = 0;

      await ctx.resume();
      if (disposed || playing) return;

      startedAt = ctx.currentTime;
      playing = true;
      startSource(offset);
    },

    pause() {
      if (!playing) return;
      offset = currentTime();
      playing = false;
      stopSource();
    },

    seek(time: number) {
      if (disposed) return;
      offset = clamp(time, 0, duration);
      if (playing) {
        stopSource();
        startedAt = ctx.currentTime;
        startSource(offset);
      }
    },

    setRate(next: number) {
      if (disposed || !Number.isFinite(next) || next <= 0) return;
      if (playing) {
        // Rebase the offset under the old rate so the time does not jump.
        offset = currentTime();
        startedAt = ctx.currentTime;
      }
      rate = next;
      handle?.setRate(next);
    },

    setVolume(volume: number) {
      if (disposed) return;
      gain.gain.value = clamp(volume, 0, 1);
    },

    getCurrentTime() {
      return currentTime();
    },

    getDuration() {
      return duration;
    },

    getRate() {
      return rate;
    },

    isPlaying() {
      return playing;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      playing = false;
      stopSource();
      try {
        analyser.disconnect();
      } catch {
        // Already disconnected.
      }
      try {
        gain.disconnect();
      } catch {
        // Already disconnected.
      }
    },
  };
}
