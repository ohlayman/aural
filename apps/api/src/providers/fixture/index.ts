import { readFile } from 'node:fs/promises';
import type {
  STTProvider,
  STTRequest,
  STTResult,
  TTSProvider,
  TTSRequest,
  TTSResult,
  Voice,
} from '../types.js';

const SAMPLE_AUDIO = new URL('./sample-3s.mp3', import.meta.url);
const FIXTURE_TRANSCRIPT = '这是本地示例引擎返回的一段固定中文转写文本。';

const voices: Voice[] = [
  {
    id: 'default',
    engineId: 'fixture',
    name: '晴川',
    language: 'zh',
    gender: 'female',
    style: ['温和', '叙事'],
    enabled: true,
  },
  {
    id: 'deep',
    engineId: 'fixture',
    name: '沉舟',
    language: 'zh',
    gender: 'male',
    style: ['低沉', '纪实'],
    enabled: true,
  },
];

export const fixtureTTS: TTSProvider = {
  id: 'fixture',
  displayName: '本地示例',
  tier: 'standard',
  capabilities: {
    streaming: false,
    pitch: false,
    volume: false,
    ssml: false,
    clone: false,
    maxCharsPerRequest: 5000,
    formats: ['mp3'],
    languages: ['zh', 'en'],
  },
  async listVoices(): Promise<Voice[]> {
    return voices;
  },
  async synthesize(_req: TTSRequest): Promise<TTSResult> {
    const audio = await readFile(SAMPLE_AUDIO);
    return { audio, format: 'mp3', durationMs: 3000, sampleRate: 24000 };
  },
};

export const fixtureSTT: STTProvider = {
  id: 'fixture',
  displayName: '本地示例',
  capabilities: {
    streaming: false,
    timestamps: false,
    diarization: false,
    maxAudioSeconds: 1800,
    languages: ['zh', 'en'],
  },
  async transcribe(_req: STTRequest): Promise<STTResult> {
    return { text: FIXTURE_TRANSCRIPT, language: 'zh', durationMs: 3000 };
  },
};
