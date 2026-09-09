export const EXPORT_WIDTH_PX = 1080;
export const MAX_EXPORT_HEIGHT_PX = 16000;

export type ExportCaptureSize =
  | { kind: 'not-ready' }
  | { kind: 'too-tall'; pixelHeight: number }
  | {
      kind: 'ready';
      width: number;
      height: number;
      pixelWidth: number;
      pixelHeight: number;
      bitmapBytes: number;
    };

export function exportCaptureSize(
  layoutWidth: number,
  layoutHeight: number,
  pixelRatio: number,
): ExportCaptureSize {
  if (![layoutWidth, layoutHeight, pixelRatio].every(Number.isFinite) || layoutWidth <= 0 || layoutHeight <= 0 || pixelRatio <= 0) {
    return { kind: 'not-ready' };
  }

  const pixelHeight = Math.ceil((EXPORT_WIDTH_PX * layoutHeight) / layoutWidth);
  // ponytail: cap one-shot bitmap memory; compose strips if valid records ever exceed this bound.
  if (pixelHeight > MAX_EXPORT_HEIGHT_PX) return { kind: 'too-tall', pixelHeight };

  return {
    kind: 'ready',
    width: EXPORT_WIDTH_PX / pixelRatio,
    height: pixelHeight / pixelRatio,
    pixelWidth: EXPORT_WIDTH_PX,
    pixelHeight,
    bitmapBytes: EXPORT_WIDTH_PX * pixelHeight * 4,
  };
}

export function toLocalFileUri(uri: string): string {
  return /^[a-z][a-z\d+.-]*:/i.test(uri) ? uri : `file://${uri}`;
}
