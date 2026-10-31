import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;

type ExecFailure = { stderr?: string; message?: string };

function toToolError(tool: string, error: unknown): Error {
  const failure = error as ExecFailure;
  const detail = failure.stderr?.trim() || failure.message || String(error);
  return new Error(`${tool} failed: ${detail}`);
}

/** 用 ffprobe 读取音频时长，返回四舍五入后的毫秒数。 */
export async function probeDurationMs(filePath: string): Promise<number> {
  let stdout: string;
  try {
    const result = await execFileAsync(ffprobeStatic.path, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nw=1:nk=1',
      filePath,
    ]);
    stdout = result.stdout;
  } catch (error) {
    throw toToolError('ffprobe', error);
  }

  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds)) {
    throw new Error(`ffprobe returned an invalid duration: ${JSON.stringify(stdout)}`);
  }
  return Math.round(seconds * 1000);
}

/** 解码成 8k 单声道 s16le PCM，供前端画波形使用。 */
export async function toPcm8k(filePath: string): Promise<Int16Array> {
  let stdout: Buffer;
  try {
    const result = await execFileAsync(
      ffmpegPath,
      ['-v', 'error', '-i', filePath, '-f', 's16le', '-ac', '1', '-ar', '8000', 'pipe:1'],
      { encoding: 'buffer', maxBuffer: MAX_BUFFER },
    );
    stdout = result.stdout;
  } catch (error) {
    throw toToolError('ffmpeg', error);
  }

  const samples = new Int16Array(Math.floor(stdout.length / 2));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = stdout.readInt16LE(i * 2);
  }
  return samples;
}

/** 把任意音频输入统一转成单声道 24k / 64kbps 的 mp3。 */
export async function normalizeToMp3(input: Buffer, outputPath: string): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), 'aural-normalize-'));
  const tempFile = join(tempDir, 'input.mp3');
  try {
    await writeFile(tempFile, input);
    await execFileAsync(ffmpegPath, [
      '-y',
      '-v',
      'error',
      '-i',
      tempFile,
      '-ac',
      '1',
      '-ar',
      '24000',
      '-b:a',
      '64k',
      outputPath,
    ]);
  } catch (error) {
    throw toToolError('ffmpeg', error);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
