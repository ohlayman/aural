import { AppError } from '../../errors.js';
import type { TTSProvider, TTSRequest, TTSResult, Voice } from '../types.js';
import { isAbortLike, siliconflowErrorFromStatus } from './errors.js';

// 以下常量（端点、模型 ID、音色 ID）需在接入当天与硅基流动官方文档核对。
export const SILICONFLOW_DEFAULT_BASE_URL = 'https://api.siliconflow.cn/v1';
export const SILICONFLOW_DEFAULT_TTS_MODEL = 'FunAudioLLM/CosyVoice2-0.5B';
const PROVIDER_ID = 'siliconflow';
const SPEECH_PATH = '/audio/speech';
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 2; // 首次请求 + 重试 1 次

const VOICES: Voice[] = [
  {
    id: 'qingchuan',
    engineId: PROVIDER_ID,
    name: '晴川',
    language: 'zh',
    gender: 'female',
    style: ['温和', '叙事'],
    enabled: true,
  },
  {
    id: 'chenzhou',
    engineId: PROVIDER_ID,
    name: '沉舟',
    language: 'zh',
    gender: 'male',
    style: ['低沉', '纪实'],
    enabled: true,
  },
  {
    id: 'bailu',
    engineId: PROVIDER_ID,
    name: '白露',
    language: 'zh',
    gender: 'female',
    style: ['清亮', '口语'],
    enabled: true,
  },
  {
    id: 'changfeng',
    engineId: PROVIDER_ID,
    name: '长风',
    language: 'zh',
    gender: 'male',
    style: ['磁性', '旁白'],
    enabled: true,
  },
];

/** 管线传入的 voiceId 可能带 `siliconflow:` 前缀，调用供应商前统一去掉。 */
function resolveLocalVoiceId(voiceId: string): string {
  const prefix = `${PROVIDER_ID}:`;
  return voiceId.startsWith(prefix) ? voiceId.slice(prefix.length) : voiceId;
}

export const siliconflowTTS: TTSProvider = {
  id: PROVIDER_ID,
  displayName: '硅基流动',
  tier: 'standard',
  capabilities: {
    streaming: false,
    pitch: false,
    volume: false,
    ssml: false,
    clone: false,
    maxCharsPerRequest: 5000, // 占位值，接入当天按官方文档核对
    formats: ['mp3'],
    languages: ['zh', 'en'],
  },
  async listVoices(language?: string): Promise<Voice[]> {
    return language ? VOICES.filter((voice) => voice.language === language) : [...VOICES];
  },
  async synthesize(req: TTSRequest, signal?: AbortSignal): Promise<TTSResult> {
    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
      throw new AppError('UNAUTHORIZED', 'SILICONFLOW_API_KEY 未配置');
    }

    const baseUrl = (process.env.SILICONFLOW_BASE_URL ?? SILICONFLOW_DEFAULT_BASE_URL).replace(
      /\/$/,
      '',
    );
    const body = {
      model: process.env.SILICONFLOW_TTS_MODEL ?? SILICONFLOW_DEFAULT_TTS_MODEL,
      input: req.text,
      voice: resolveLocalVoiceId(req.voiceId),
      response_format: 'mp3',
      speed: req.speed ?? 1,
    };

    // 90s 覆盖首次请求与重试的总时长；与调用方信号任一触发都会中断。
    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    let lastError: AppError | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(`${baseUrl}${SPEECH_PATH}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: combinedSignal,
        });

        if (response.ok) {
          const audio = new Uint8Array(await response.arrayBuffer());
          // 供应商返回裸音频时没有时长信息，不伪造 durationMs。
          return { audio, format: 'mp3' };
        }

        const error = siliconflowErrorFromStatus(response.status);
        if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
          lastError = error;
          continue;
        }
        throw error;
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        if (isAbortLike(error)) {
          lastError = new AppError('PROVIDER_TIMEOUT', '硅基流动请求超时');
          // 调用方主动取消时不重试。
          if (signal?.aborted) {
            throw lastError;
          }
        } else {
          lastError = new AppError('PROVIDER_UNAVAILABLE', '硅基流动网络异常');
        }
        if (attempt === MAX_ATTEMPTS) {
          throw lastError;
        }
      }
    }

    throw lastError ?? new AppError('PROVIDER_UNAVAILABLE', '硅基流动合成失败');
  },
};
