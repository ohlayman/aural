export interface PlayBufferHandle {
  stop(): void;
}

/**
 * Plays a decoded AudioBuffer through an AnalyserNode. The caller owns the
 * graph above the analyser (analyser → gain → destination) and the context.
 * The source is always disconnected when playback ends or is stopped.
 */
export function playBuffer(
  ctx: AudioContext,
  buffer: AudioBuffer,
  analyser: AnalyserNode,
  offsetSec = 0,
  onEnded?: () => void,
): PlayBufferHandle {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(analyser);

  let finished = false;

  source.onended = () => {
    if (finished) return;
    finished = true;
    try {
      source.disconnect();
    } catch {
      // Disconnecting an already-disconnected node is harmless.
    }
    onEnded?.();
  };

  try {
    source.start(0, offsetSec);
  } catch (error) {
    source.disconnect();
    throw error;
  }

  return {
    stop() {
      if (finished) return;
      finished = true;
      try {
        source.stop();
      } catch {
        // stop() throws if the source was never started or already stopped.
      }
      try {
        source.disconnect();
      } catch {
        // Already disconnected.
      }
    },
  };
}
