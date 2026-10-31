import { describe, expect, it } from 'vitest';
import { orbReducer, type OrbEvent } from './state';

describe('orbReducer', () => {
  it('speaking starts and ends', () => {
    let s = orbReducer('idle', { type: 'SPEAK_START' });
    expect(s).toBe('speaking');
    s = orbReducer(s, { type: 'SPEAK_END' });
    expect(s).toBe('idle');
  });

  it('short press is ignored', () => {
    const s = orbReducer('idle', { type: 'PRESS_END', durationMs: 300 });
    expect(s).toBe('idle');
  });

  it('press start enters listening', () => {
    expect(orbReducer('idle', { type: 'PRESS_START' })).toBe('listening');
  });

  it('long press enters thinking', () => {
    const listening = orbReducer('idle', { type: 'PRESS_START' });
    expect(orbReducer(listening, { type: 'PRESS_END', durationMs: 1200 })).toBe(
      'thinking',
    );
  });

  it('keeps the same state for unknown events', () => {
    const unknown = { type: 'UNKNOWN' } as unknown as OrbEvent;
    expect(orbReducer('speaking', unknown)).toBe('speaking');
  });
});
