import type { ReadableStream } from 'node:stream/web';

/**
 * 存储适配器抽象。key 为相对路径（如 `audio/xxx.mp3`），实现方需自行校验。
 */
export interface Storage {
  /** 写入数据（Buffer 或 Web ReadableStream），返回字节数。 */
  put(key: string, data: Buffer | ReadableStream): Promise<{ size: number }>;
  /** 按 key 读取为 Web ReadableStream；文件不存在时 reject。 */
  getStream(key: string): Promise<ReadableStream>;
  /** 生成带 exp + HMAC token 的签名访问 URL。 */
  signedUrl(key: string, ttlSec: number): Promise<string>;
  /** 校验签名 URL：token 需匹配 `${key}:${exp}` 的 HMAC，且 exp 未过期。 */
  verifySignedUrl(key: string, exp: number, token: string): boolean;
  /** 删除文件；文件不存在视为成功。 */
  delete(key: string): Promise<void>;
  /** 查询文件元信息；文件不存在返回 null，key 非法时抛错。 */
  stat(key: string): Promise<{ size: number; mtimeMs: number } | null>;
}
