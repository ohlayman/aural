import { describe, expect, it, vi } from 'vitest';
import { createAudioPlayer } from './player';

class FakeSource {
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeContext {
  currentTime = 0;
  state = 'running';
  destination = {} as AudioDestinationNode;
  sources: FakeSource[] = [];
  resume = vi.fn(async () => {});
  createBufferSource = vi.fn(() => {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  });
}

function setup(duration = 10, onEnded?: () => void) {
  const ctx = new FakeContext();
  const analyser = { connect: vi.fn(), disconnect: vi.fn() };
  const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };

  const player = createAudioPlayer(
    ctx as unknown as AudioContext,
    { duration } as AudioBuffer,
    analyser as unknown as AnalyserNode,
    gain as unknown as GainNode,
    onEnded,
  );

  return { ctx, analyser, gain, player };
}

describe('createAudioPlayer', () => {
  it('connects the analyser → gain → destination graph', () => {
    const { ctx, analyser, gain } = setup();

    expect(analyser.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(ctx.destination);
  });

  it('seek clamps to 0..duration', () => {
    const { player } = setup(10);

    player.seek(-1);
    expect(player.getCurrentTime()).toBe(0);

    player.seek(999);
    expect(player.getCurrentTime()).toBe(player.getDuration());
  });

  it('tracks the real audio clock across play/pause', async () => {
    const { ctx, player } = setup(10);

    await player.play();
    expect(ctx.resume).toHaveBeenCalled();
    expect(ctx.sources[0].start).toHaveBeenCalledWith(0, 0);

    ctx.currentTime = 2;
    expect(player.getCurrentTime()).toBeCloseTo(2);

    player.pause();
    ctx.currentTime = 10;
    expect(player.getCurrentTime()).toBeCloseTo(2);
    expect(ctx.sources[0].stop).toHaveBeenCalled();

    await player.play();
    expect(ctx.sources[1].start).toHaveBeenCalledWith(0, 2);
    ctx.currentTime = 12.5;
    expect(player.getCurrentTime()).toBeCloseTo(4.5);
  });

  it('restarts at the seeked offset while playing', async () => {
    const { ctx, player } = setup(10);

    await player.play();
    ctx.currentTime = 3;
    player.seek(5);

    expect(player.getCurrentTime()).toBeCloseTo(5);
    expect(ctx.sources).toHaveLength(2);
    expect(ctx.sources[0].stop).toHaveBeenCalled();
    expect(ctx.sources[1].start).toHaveBeenCalledWith(0, 5);
  });

  it('applies setRate immediately without jumping the clock', async () => {
    const { ctx, player } = setup(10);

    await player.play();
    ctx.currentTime = 2;

    player.setRate(2);
    expect(player.getRate()).toBe(2);
    expect(ctx.sources[0].playbackRate.value).toBe(2);
    expect(player.getCurrentTime()).toBeCloseTo(2);

    ctx.currentTime = 4;
    expect(player.getCurrentTime()).toBeCloseTo(6);
  });

  it('remembers the rate for the next play', async () => {
    const { ctx, player } = setup(10);

    player.setRate(1.5);
    await player.play();
    expect(ctx.sources[0].playbackRate.value).toBe(1.5);

    ctx.currentTime = 2;
    expect(player.getCurrentTime()).toBeCloseTo(3);

    player.pause();
    ctx.currentTime = 100;
    await player.play();
    ctx.currentTime = 101;
    expect(player.getCurrentTime()).toBeCloseTo(4.5);
    expect(ctx.sources[1].playbackRate.value).toBe(1.5);
  });

  it('clamps volume into the gain node', () => {
    const { gain, player } = setup();

    player.setVolume(0.4);
    expect(gain.gain.value).toBe(0.4);

    player.setVolume(2);
    expect(gain.gain.value).toBe(1);

    player.setVolume(-3);
    expect(gain.gain.value).toBe(0);
  });

  it('reports the natural end and resets to the start', async () => {
    const onEnded = vi.fn();
    const { ctx, player } = setup(10, onEnded);

    await player.play();
    ctx.currentTime = 5;
    ctx.sources[0].onended?.();

    expect(player.isPlaying()).toBe(false);
    expect(player.getCurrentTime()).toBe(0);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('replays from the top when play is called at the end', async () => {
    const { ctx, player } = setup(10);

    player.seek(10);
    await player.play();
    expect(ctx.sources[0].start).toHaveBeenCalledWith(0, 0);
  });

  it('dispose stops the source and disconnects the graph', async () => {
    const { ctx, analyser, gain, player } = setup(10);

    await player.play();
    player.dispose();

    expect(player.isPlaying()).toBe(false);
    expect(ctx.sources[0].stop).toHaveBeenCalled();
    expect(analyser.disconnect).toHaveBeenCalled();
    expect(gain.disconnect).toHaveBeenCalled();
  });
});
