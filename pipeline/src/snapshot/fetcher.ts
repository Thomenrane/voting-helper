/**
 * Network fetcher for snapshot commands. Any non-success outcome raises an
 * explicit error — the runner attributes it to its source for reporting.
 */
import { EnvHttpProxyAgent, fetch } from 'undici';

const USER_AGENT = 'voting-helper-pipeline/0.1 (+https://github.com/Thomenrane/voting-helper)';

/** Large PDFs (up to ~29 MB) over Wayback can be slow — generous timeout. */
const DEFAULT_TIMEOUT_MS = 180_000;

/**
 * Honours HTTP(S)_PROXY / NO_PROXY (Node 22's fetch ignores them natively);
 * behaves as the default agent when no proxy is configured.
 */
const dispatcher = new EnvHttpProxyAgent();

export async function fetchBytes(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Uint8Array> {
  const response = await fetch(url, {
    dispatcher,
    headers: { 'user-agent': USER_AGENT },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error('empty response body');
  }
  return bytes;
}
