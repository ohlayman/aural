import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TTSState {
  text: string;
  engineId: string;
  voiceId: string;
  language: string;
  speed: number;
  pitch: number;
}

export interface TTSActions {
  setText: (text: string) => void;
  setEngine: (engineId: string) => void;
  setVoice: (voiceId: string) => void;
  setLanguage: (language: string) => void;
  setSpeed: (speed: number) => void;
  setPitch: (pitch: number) => void;
  clear: () => void;
}

export type TTSStore = TTSState & TTSActions;

/** Persisted defaults. Exported so tests can reset the store. */
export const TTS_INITIAL_STATE: TTSState = {
  text: '',
  engineId: '',
  voiceId: '',
  language: 'zh',
  speed: 1,
  pitch: 0,
};

export const useTTSStore = create<TTSStore>()(
  persist(
    (set) => ({
      ...TTS_INITIAL_STATE,
      setText: (text) => set({ text }),
      // A different engine has a different voice list and pitch support.
      setEngine: (engineId) => set({ engineId, voiceId: '', pitch: 0 }),
      setVoice: (voiceId) => set({ voiceId }),
      setLanguage: (language) => set({ language }),
      setSpeed: (speed) => set({ speed }),
      setPitch: (pitch) => set({ pitch }),
      clear: () => set({ text: '' }),
    }),
    {
      name: 'aural:tts',
      // The page rehydrates after mount so SSR markup matches the defaults.
      skipHydration: true,
      partialize: (state) => ({
        text: state.text,
        engineId: state.engineId,
        voiceId: state.voiceId,
        language: state.language,
        speed: state.speed,
        pitch: state.pitch,
      }),
    },
  ),
);
