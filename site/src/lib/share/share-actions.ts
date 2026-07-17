/**
 * Share actions (#27) — hand the generated image to the user, offline.
 *
 * Capability detection only, never user-agent sniffing: if the browser can
 * share files (Web Share API level 2 — typically mobile), the native share
 * sheet opens; otherwise the image is downloaded through a blob URL. Nothing
 * touches the network either way — the blob never leaves the browser and no
 * URL encodes any answer or score.
 */

export type ShareOutcome = 'shared' | 'downloaded' | 'dismissed';

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Deferred revocation: revoking synchronously can abort the download in
  // some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Share the image via the native sheet when the browser supports sharing
 * files, else download it. A share sheet dismissed by the user is not an
 * error ('dismissed' — no feedback message); a share failure falls back to
 * the download path.
 */
export async function shareOrDownloadImage(
  blob: Blob,
  fileName: string,
  title: string,
): Promise<ShareOutcome> {
  const file = new File([blob], fileName, { type: blob.type });
  if (
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'dismissed';
      // Share failed for another reason — the download fallback still works.
    }
  }
  downloadBlob(blob, fileName);
  return 'downloaded';
}
