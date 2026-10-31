import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/messages/zh.json';
import { Player } from './player';

const mocks = vi.hoisted(() => ({
  controller: {
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    seek: vi.fn(),
    setRate: vi.fn(),
    setVolume: vi.fn(),
    getCurrentTime: vi.fn(() => 3),
    getDuration: vi.fn(() => 10),
    getRate: vi.fn(() => 1),
    isPlaying: vi.fn(() => false),
    dispose: vi.fn(),
  },
  decodeAudio: vi.fn(),
  computePeaks: vi.fn(),
  createAudioPlayer: vi.fn(),
}));

vi.mock('@/lib/audio/decode', () => ({
  decodeAudio: mocks.decodeAudio,
  computePeaks: mocks.computePeaks,
}));

vi.mock('@/lib/audio/player', () => ({
  createAudioPlayer: mocks.createAudioPlayer,
}));

class FakeAnalyser {
  fftSize = 0;
  smoothingTimeConstant = 0;
  frequencyBinCount = 256;
  connect = vi.fn();
  disconnect = vi.fn();
  getByteFrequencyData = vi.fn();
}

class FakeGain {
  gain = { value: 1 };
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeAudioContext {
  state = 'running';
  destination = {};
  createAnalyser = () => new FakeAnalyser();
  createGain = () => new FakeGain();
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
}

function renderPlayer() {
  return render(
    <NextIntlClientProvider locale="zh" messages={zh}>
      <Player
        assetId="asset-1"
        title="测试音轨"
        engineLabel="fixture"
        voiceName="晴川"
      />
    </NextIntlClientProvider>,
  );
}

async function ready() {
  const label = await screen.findByTestId('player-label');
  await waitFor(() => expect(label).toHaveTextContent('READY'));
}

describe('Player keyboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decodeAudio.mockResolvedValue({ duration: 10 });
    mocks.computePeaks.mockReturnValue(new Array<number>(120).fill(0.5));
    mocks.createAudioPlayer.mockReturnValue(mocks.controller);
    vi.stubGlobal('AudioContext', FakeAudioContext);
  });

  it('leaves arrow keys to the focused volume slider', async () => {
    renderPlayer();
    await ready();

    const slider = screen.getByRole('slider', { name: '音量' });
    slider.focus();
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });

    expect(mocks.controller.setVolume).toHaveBeenCalled();
    expect(mocks.controller.seek).not.toHaveBeenCalled();

    // Space on the slider must not toggle playback either.
    fireEvent.keyDown(slider, { key: ' ' });
    expect(mocks.controller.play).not.toHaveBeenCalled();
  });

  it('seeks with the arrow keys when the player surface is focused', async () => {
    renderPlayer();
    await ready();

    const surface = screen.getByRole('group', { name: '音频播放器' });
    surface.focus();
    fireEvent.keyDown(surface, { key: 'ArrowRight' });

    // getCurrentTime is mocked at 3s, so ArrowRight seeks to 8s.
    expect(mocks.controller.seek).toHaveBeenCalledWith(8);
  });

  it('toggles playback with Space when the player surface is focused', async () => {
    renderPlayer();
    await ready();

    const surface = screen.getByRole('group', { name: '音频播放器' });
    surface.focus();
    fireEvent.keyDown(surface, { key: ' ' });

    expect(mocks.controller.play).toHaveBeenCalledTimes(1);
  });
});
