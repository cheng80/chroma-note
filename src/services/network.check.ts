function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
try {
  let receivedSignal: AbortSignal | undefined;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    receivedSignal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => receivedSignal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  }) as typeof fetch;
  globalThis.setTimeout = ((handler: TimerHandler) => originalSetTimeout(handler, 0)) as typeof setTimeout;
  const { boundedFetch } = await import('./network.ts');
  await boundedFetch('https://example.invalid').then(
    () => { throw new Error('timeout must reject'); },
    (error) => assert(error instanceof Error && error.message === 'aborted', 'timeout must abort the request'),
  );
  assert(receivedSignal?.aborted, 'bounded fetch must pass its timeout signal');
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
}

console.log('network.check passed');
