/**
 * Share image drawing (#27) — thin canvas glue over the pure layout module.
 *
 * Replays the primitives of share-image-layout.ts onto a canvas, entirely
 * offline: system font stacks only (the same Georgia/system-ui stacks as the
 * site CSS), colors resolved from the page's CSS custom properties (with the
 * Base.astro values as fallback), no external image, no fetch. Untested DOM
 * glue — every composition decision lives in the tested layout module.
 */
import type {
  ColorRole,
  FontSpec,
  MeasureText,
  ShareImageLayout,
} from './share-image-layout.ts';

/** Fallback palette — mirrors the CSS custom properties in Base.astro. */
const FALLBACK_PALETTE: Record<ColorRole, string> = {
  ink: '#211c33',
  'ink-soft': '#605a75',
  paper: '#fbfafd',
  card: '#ffffff',
  line: '#e5e2ee',
  accent: '#5b54a8',
  'accent-deep': '#423c85',
  'accent-wash': '#edebf7',
};

/** Same stacks as the site CSS — system fonts only, nothing downloaded. */
const FONT_FAMILIES: Record<FontSpec['family'], string> = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

function resolveColor(role: ColorRole): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--${role}`).trim();
  return value !== '' ? value : FALLBACK_PALETTE[role];
}

function toCanvasFont(font: FontSpec): string {
  return `${font.weight} ${font.px}px ${FONT_FAMILIES[font.family]}`;
}

function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Canvas 2D context unavailable.');
  return context;
}

/** Text measurer backed by an offscreen 2D context, for the layout module. */
export function createMeasurer(): MeasureText {
  const context = get2dContext(document.createElement('canvas'));
  return (text, font) => {
    context.font = toCanvasFont(font);
    return context.measureText(text).width;
  };
}

function traceRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, width, height, radius);
  } else {
    context.rect(x, y, width, height);
  }
}

/** Draw the layout onto a fresh canvas. Pure replay — no decisions here. */
export function renderShareImage(layout: ShareImageLayout): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = get2dContext(canvas);

  context.fillStyle = resolveColor(layout.background);
  context.fillRect(0, 0, layout.width, layout.height);

  for (const item of layout.items) {
    if (item.kind === 'rect') {
      traceRoundedRect(context, item.x, item.y, item.width, item.height, item.radius);
      if (item.fill !== undefined) {
        context.fillStyle = resolveColor(item.fill);
        context.fill();
      }
      if (item.stroke !== undefined) {
        context.strokeStyle = resolveColor(item.stroke);
        context.lineWidth = 2;
        context.stroke();
      }
    } else {
      context.font = toCanvasFont(item.font);
      context.textAlign = item.align;
      context.textBaseline = 'alphabetic';
      context.fillStyle = resolveColor(item.color);
      context.fillText(item.text, item.x, item.y);
    }
  }
  return canvas;
}

/** Encode the canvas as a PNG blob. */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob !== null) resolve(blob);
      else reject(new Error('PNG encoding failed.'));
    }, 'image/png');
  });
}
