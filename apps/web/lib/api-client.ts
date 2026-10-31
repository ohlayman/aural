export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    requestId: string;
    details?: unknown;
  };
};

type ApiErrorInit = {
  code: string;
  message: string;
  status: number;
  retryable: boolean;
  requestId?: string;
  details?: unknown;
  cause?: unknown;
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor({ code, message, status, retryable, requestId, details, cause }: ApiErrorInit) {
    super(message, { cause });
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.requestId = requestId;
    this.details = details;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body != null && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  let response: Response;

  try {
    response = await fetch(path, { credentials: 'include', ...init, headers });
  } catch (cause) {
    throw new ApiError({
      code: 'NETWORK',
      message: 'Network request failed',
      status: 0,
      retryable: true,
      cause,
    });
  }

  if (!response.ok) {
    let body: ApiErrorBody | undefined;

    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = undefined;
    }

    throw new ApiError({
      code: body?.error?.code ?? 'HTTP_ERROR',
      message: body?.error?.message ?? (response.statusText || 'Request failed'),
      status: response.status,
      retryable: body?.error?.retryable ?? response.status >= 500,
      requestId: body?.error?.requestId,
      details: body?.error?.details,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
