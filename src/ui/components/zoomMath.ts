export function clamp(value: number, minimum: number, maximum: number) {
  'worklet';
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampOffset(value: number, viewportSize: number, scale: number) {
  'worklet';
  const limit = Math.max(0, viewportSize * (scale - 1) / 2);
  return clamp(value, -limit, limit);
}

export function contentCoordinateAtFocal(focal: number, viewportSize: number, offset: number, scale: number) {
  'worklet';
  return (focal - viewportSize / 2 - offset) / scale;
}

export function offsetForFocal(contentCoordinate: number, focal: number, viewportSize: number, scale: number) {
  'worklet';
  return clampOffset(focal - viewportSize / 2 - contentCoordinate * scale, viewportSize, scale);
}
