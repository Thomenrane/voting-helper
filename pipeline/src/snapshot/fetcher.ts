/**
 * Network fetcher for snapshot commands. Any non-success outcome raises an
 * explicit error — the runner attributes it to its source for reporting.
 */
import { EnvHttpProxyAgent, fetch } from 'undici';

const USER_AGENT = 'voting-helper-pipeline/0.1 (+https://github.com/Thomenrane/voting-helper)';

/** Large PDFs (up to ~29 MB) over Wayback can be slow — generous timeout. */
const DEFAULT_TIMEOUT_MS = 180_000;

/**
 * Hard cap on a single download. The largest known source is ~29 MB
 * (Vlaams Belang PDF); anything near this cap is a broken or hostile
 * source, not a programme — refuse instead of buffering towards OOM.
 */
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

/**
 * Honours HTTP(S)_PROXY / NO_PROXY (Node 22's fetch ignores them natively);
 * behaves as the default agent when no proxy is configured.
 */
const dispatcher = new EnvHttpProxyAgent();

/** Surfaces the network-level cause hidden inside undici's 'fetch failed'. */
function describeFetchFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = error.cause;
  if (cause instanceof Error) {
    const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : cause.message;
    return `${error.message} (${code})`;
  }
  return error.message;
}

export async function fetchBytes(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Uint8Array> {
  let response;
  try {
    response = await fetch(url, {
      dispatcher,
      headers: { 'user-agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new Error(describeFetchFailure(cause), { cause });
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (contentLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(
      `response advertises ${contentLength} bytes — exceeds the ${MAX_DOWNLOAD_BYTES}-byte download cap`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error('empty response body');
  }
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(
      `response body is ${bytes.byteLength} bytes — exceeds the ${MAX_DOWNLOAD_BYTES}-byte download cap`,
    );
  }
  return bytes;
}
