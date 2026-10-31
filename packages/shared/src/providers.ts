export type TTSCapabilities = {
  streaming: boolean;
  pitch: boolean;
  volume: boolean;
  ssml: boolean;
  clone: boolean;
  maxCharsPerRequest: number;
  formats: Array<'mp3' | 'wav' | 'opus'>;
  languages: string[];
};

export type STTCapabilities = {
  streaming: boolean;
  timestamps: boolean;
  diarization: boolean;
  maxAudioSeconds: number;
  languages: string[];
};

export type TTSRequest = {
  text: string;
  voiceId: string;
  language?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
  format?: 'mp3' | 'wav' | 'opus';
};

export type TTSResult = {
  audio: Uint8Array | ReadableStream;
  format: 'mp3' | 'wav' | 'opus';
  durationMs?: number;
  sampleRate?: number;
};

export type STTRequest = {
  audio: Uint8Array | ReadableStream;
  mimeType: string;
  language?: string | 'auto';
  timestamps?: boolean;
  diarization?: boolean;
};

export type STTResult = {
  text: string;
  language?: string;
  segments?: Array<{ text: string; startMs: number; endMs: number; speaker?: string }>;
  durationMs?: number;
};

export type Voice = {
  id: string;
  engineId: string;
  name: string;
  language: string;
  gender?: 'female' | 'male' | 'neutral';
  style?: string[];
  previewUrl?: string;
  enabled: boolean;
};

export interface TTSProvider {
  readonly id: string;
  readonly displayName: string;
  readonly tier: 'standard' | 'hd';
  readonly capabilities: TTSCapabilities;
  listVoices(language?: string): Promise<Voice[]>;
  synthesize(req: TTSRequest, signal?: AbortSignal): Promise<TTSResult>;
}

export interface STTProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: STTCapabilities;
  transcribe(req: STTRequest, signal?: AbortSignal): Promise<STTResult>;
}
