import { AppError } from '../errors.js';
import { fixtureSTT, fixtureTTS } from './fixture/index.js';
import { siliconflowTTS } from './siliconflow/index.js';
import type { STTCapabilities, STTProvider, TTSCapabilities, TTSProvider } from './types.js';

export type EngineView = {
  id: string;
  kind: 'tts' | 'stt';
  displayName: string;
  tier: 'standard' | 'hd';
  capabilities: TTSCapabilities | STTCapabilities;
  voiceCount: number;
  languages: string[];
};

export type Registry = {
  resolveTTS(id: string): TTSProvider;
  resolveSTT(id: string): STTProvider;
  list(): Promise<EngineView[]>;
  defaultTTS(): TTSProvider;
};

export type RegistryConfig = {
  tts: TTSProvider[];
  stt: STTProvider[];
  defaultTts: string;
};

function resolveProvider<T>(providers: Map<string, T>, id: string): T {
  const provider = providers.get(id);
  if (!provider) {
    throw new AppError('INVALID_ARGUMENT', `未知引擎：${id}`);
  }
  return provider;
}

export function createRegistry(config: RegistryConfig): Registry {
  const tts = new Map(config.tts.map((provider) => [provider.id, provider]));
  const stt = new Map(config.stt.map((provider) => [provider.id, provider]));

  return {
    resolveTTS: (id) => resolveProvider(tts, id),
    resolveSTT: (id) => resolveProvider(stt, id),
    async list(): Promise<EngineView[]> {
      const ttsViews = await Promise.all(
        config.tts.map(async (provider) => ({
          id: provider.id,
          kind: 'tts' as const,
          displayName: provider.displayName,
          tier: provider.tier,
          capabilities: provider.capabilities,
          voiceCount: (await provider.listVoices()).length,
          languages: provider.capabilities.languages,
        })),
      );
      const sttViews = config.stt.map((provider) => ({
        id: provider.id,
        kind: 'stt' as const,
        displayName: provider.displayName,
        tier: 'standard' as const,
        capabilities: provider.capabilities,
        voiceCount: 0,
        languages: provider.capabilities.languages,
      }));
      return [...ttsViews, ...sttViews];
    },
    defaultTTS: () => resolveProvider(tts, config.defaultTts),
  };
}

const ttsInstances: Record<string, TTSProvider> = {
  fixture: fixtureTTS,
  siliconflow: siliconflowTTS,
};
const sttInstances: Record<string, STTProvider> = { fixture: fixtureSTT };

function parseProviderList(value: string | undefined): string[] {
  const names = (value ?? 'fixture')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length > 0 ? names : ['fixture'];
}

function mapProviders<T>(names: string[], instances: Record<string, T>, kind: string): T[] {
  return names.map((name) => {
    const instance = instances[name];
    if (!instance) {
      throw new Error(`未知的 ${kind} 引擎：${name}`);
    }
    return instance;
  });
}

export function createRegistryFromEnv(): Registry {
  const tts = mapProviders(parseProviderList(process.env.TTS_PROVIDERS), ttsInstances, 'TTS');
  const stt = mapProviders(parseProviderList(process.env.STT_PROVIDERS), sttInstances, 'STT');
  const defaultTts = process.env.DEFAULT_TTS_PROVIDER || tts[0].id;
  if (!tts.some((provider) => provider.id === defaultTts)) {
    throw new Error(`未知的默认 TTS 引擎：${defaultTts}`);
  }
  return createRegistry({ tts, stt, defaultTts });
}
