export function workingFileName(ownerId: string, uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== 'file:' || url.host || url.search || url.hash) return null;
    const marker = `/chroma-drafts/${ownerId}/`;
    const path = decodeURIComponent(url.pathname);
    const index = path.lastIndexOf(marker);
    if (index < 0) return null;
    const name = path.slice(index + marker.length);
    return /^[A-Za-z0-9-]+\.(?:jpe?g|png|heic)$/i.test(name) ? name : null;
  } catch {
    return null;
  }
}
