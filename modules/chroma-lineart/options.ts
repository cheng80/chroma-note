export type LineArtOptions = Readonly<{ maxEdge: number; lineGain: number }>;

export const DEFAULT_LINE_ART_OPTIONS: LineArtOptions = Object.freeze({ maxEdge: 1024, lineGain: 1.8 });

/** Keep the accepted style1 pipeline; only resolution and pointwise mask gain vary. */
export function resolveLineArtOptions(options: Partial<LineArtOptions> = {}): LineArtOptions {
  const maxEdge = options.maxEdge ?? DEFAULT_LINE_ART_OPTIONS.maxEdge;
  const lineGain = options.lineGain ?? DEFAULT_LINE_ART_OPTIONS.lineGain;
  if (!Number.isInteger(maxEdge) || maxEdge < 16 || maxEdge > 1536) throw new Error('lineart_invalid_max_edge');
  if (!Number.isFinite(lineGain) || lineGain < 0.1 || lineGain > 4) throw new Error('lineart_invalid_line_gain');
  return Object.freeze({ maxEdge, lineGain });
}
