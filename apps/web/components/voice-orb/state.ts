export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type OrbEvent =
  | { type: 'SPEAK_START' }
  | { type: 'SPEAK_END' }
  | { type: 'PRESS_START' }
  | { type: 'PRESS_END'; durationMs: number };

const SHORT_PRESS_MS = 450;

export function orbReducer(state: OrbState, event: OrbEvent): OrbState {
  switch (event.type) {
    case 'SPEAK_START':
      return 'speaking';
    case 'SPEAK_END':
      return 'idle';
    case 'PRESS_START':
      return 'listening';
    case 'PRESS_END':
      return event.durationMs < SHORT_PRESS_MS ? 'idle' : 'thinking';
    default:
      return state;
  }
}
