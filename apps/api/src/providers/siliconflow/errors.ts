import { AppError } from '../../errors.js';

/** 将硅基流动的 HTTP 状态码映射为应用错误，业务代码不接触厂商原始报文。 */
export function siliconflowErrorFromStatus(status: number): AppError {
  if (status === 401) {
    return new AppError('UNAUTHORIZED', '硅基流动鉴权失败');
  }
  if (status === 403) {
    return new AppError('FORBIDDEN', '硅基流动无访问权限');
  }
  if (status === 429) {
    return new AppError('RATE_LIMITED', '硅基流动请求频率超限');
  }
  if (status >= 400 && status < 500) {
    return new AppError('INVALID_ARGUMENT', `硅基流动拒绝了请求（HTTP ${status}）`);
  }
  return new AppError('PROVIDER_UNAVAILABLE', `硅基流动服务异常（HTTP ${status}）`);
}

/** fetch 被 AbortSignal 中断时，各运行时抛出的错误名可能是 AbortError 或 TimeoutError。 */
export function isAbortLike(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}
