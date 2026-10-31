import { z } from 'zod';
import { countChars } from './chars.js';
import { MAX_TTS_CHARS } from './constants.js';
import type { Voice } from './providers.js';

const AudioFormatSchema = z.enum(['mp3', 'wav', 'opus']);

const SegmentSchema = z.object({
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  speaker: z.string().optional(),
});

export const JobStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'expired',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobStageSchema = z.enum([
  'validating',
  'queued',
  'synthesizing',
  'encoding',
  'uploading',
  'transcribing',
  'done',
]);
export type JobStage = z.infer<typeof JobStageSchema>;

export const TTSJobRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .refine((text) => countChars(text) <= MAX_TTS_CHARS, {
      message: `文本不能超过 ${MAX_TTS_CHARS} 字`,
    }),
  engineId: z.string().trim().min(1),
  voiceId: z.string().trim().min(1),
  language: z.string().min(1).optional(),
  speed: z.number().min(0.5).max(2).optional(),
  pitch: z.number().optional(),
  volume: z.number().optional(),
  format: AudioFormatSchema.optional(),
});
export type TTSJobRequest = z.infer<typeof TTSJobRequestSchema>;

export const STTJobRequestSchema = z.object({
  audioKey: z.string().trim().min(1),
  language: z.string().min(1).optional(),
  timestamps: z.boolean().optional(),
  diarization: z.boolean().optional(),
  durationMs: z.number().positive().optional(),
});
export type STTJobRequest = z.infer<typeof STTJobRequestSchema>;

const TTSCapabilitiesSchema = z.object({
  streaming: z.boolean(),
  pitch: z.boolean(),
  volume: z.boolean(),
  ssml: z.boolean(),
  clone: z.boolean(),
  maxCharsPerRequest: z.number().int().positive(),
  formats: z.array(AudioFormatSchema),
  languages: z.array(z.string().min(1)),
});

const STTCapabilitiesSchema = z.object({
  streaming: z.boolean(),
  timestamps: z.boolean(),
  diarization: z.boolean(),
  maxAudioSeconds: z.number().positive(),
  languages: z.array(z.string().min(1)),
});

export const EngineViewSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['tts', 'stt']),
  displayName: z.string().min(1),
  tier: z.enum(['standard', 'hd']),
  capabilities: z.union([TTSCapabilitiesSchema, STTCapabilitiesSchema]),
  voiceCount: z.number().int().nonnegative(),
  languages: z.array(z.string().min(1)),
});
export type EngineView = z.infer<typeof EngineViewSchema>;

export const VoiceSchema: z.ZodType<Voice> = z.object({
  id: z.string().min(1),
  engineId: z.string().min(1),
  name: z.string().min(1),
  language: z.string().min(1),
  gender: z.enum(['female', 'male', 'neutral']).optional(),
  style: z.array(z.string()).optional(),
  previewUrl: z.string().optional(),
  enabled: z.boolean(),
});

export const JobSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  type: z.enum(['tts', 'stt']),
  engineId: z.string().min(1),
  voiceId: z.string().min(1).optional(),
  status: JobStatusSchema,
  progress: z.number().nullable().optional(),
  stage: JobStageSchema.optional(),
  input: z.union([TTSJobRequestSchema, STTJobRequestSchema]),
  output: z
    .object({
      assetId: z.string().optional(),
      text: z.string().optional(),
      segments: z.array(SegmentSchema).optional(),
      durationMs: z.number().optional(),
      language: z.string().optional(),
    })
    .optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      retryable: z.boolean(),
    })
    .optional(),
  createdAt: z.string().min(1),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
});
export type Job = z.infer<typeof JobSchema>;

export const AssetSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  jobId: z.string().optional(),
  type: z.enum(['tts', 'stt']),
  title: z.string(),
  audioUrl: z.string().optional(),
  textContent: z.string().optional(),
  durationMs: z.number().optional(),
  sizeBytes: z.number().int().optional(),
  peaks: z.array(z.number()).optional(),
  engineId: z.string().min(1),
  voiceId: z.string().optional(),
  createdAt: z.string().min(1),
  expiresAt: z.string().min(1),
});
export type Asset = z.infer<typeof AssetSchema>;

export const SessionSchema = z.object({
  sessionId: z.string().min(1),
  quota: z.object({
    ttsChars: z.object({
      used: z.number().int().nonnegative(),
      limit: z.number().int().nonnegative(),
    }),
    sttSeconds: z.object({
      used: z.number().int().nonnegative(),
      limit: z.number().int().nonnegative(),
    }),
  }),
  expiresAt: z.string().min(1),
});
export type Session = z.infer<typeof SessionSchema>;
