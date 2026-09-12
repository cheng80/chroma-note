import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadModelAssets, getModelAssetStatus, pauseModelDownload, subscribeModelAssets, type ModelAssetState } from '../../modules/chroma-analysis';

const initialState: ModelAssetState = { status: 'checking', downloadedBytes: 0, totalBytes: 0, currentFile: null, errorCode: null };

export function useModelAssets() {
  const [state, setState] = useState<ModelAssetState>(initialState);
  const [pending, setPending] = useState<'start' | 'pause' | null>(null);
  const [startupChecked, setStartupChecked] = useState(false);
  const lifecycle = useRef({ alive: false, request: 0, event: 0, pending: null as 'start' | 'pause' | null, state: initialState });

  useEffect(() => {
    const live = { alive: true, request: 0, event: 0, pending: null as 'start' | 'pause' | null, state: initialState };
    lifecycle.current = live;
    const publish = (next: ModelAssetState) => {
      if (!live.alive) return;
      live.state = next;
      setState(next);
      if (next.status !== 'checking') setStartupChecked(true);
    };
    let unsubscribe: (() => void) | undefined;
    const event = live.event;
    try {
      unsubscribe = subscribeModelAssets(next => {
        if (!live.alive) return;
        live.event += 1;
        publish(next);
        if (['ready', 'paused', 'failed'].includes(next.status)) {
          live.request += 1;
          live.pending = null;
          setPending(null);
        }
      });
      void getModelAssetStatus().then(next => {
        if (live.event === event && live.request === 0) publish(next);
      }).catch(error => {
        if (live.event === event && live.request === 0) publish({ ...live.state, status: 'failed', errorCode: error instanceof Error ? error.message : String(error) });
      });
    } catch (error) {
      publish({ ...live.state, status: 'failed', errorCode: error instanceof Error ? error.message : String(error) });
    }
    return () => { live.alive = false; unsubscribe?.(); };
  }, []);

  const run = useCallback(async (action: 'start' | 'pause') => {
    const live = lifecycle.current;
    if (!live.alive) return;
    if (action === 'start' && (live.pending || !['required', 'paused', 'failed'].includes(live.state.status))) return;
    if (action === 'pause' && (live.pending === 'pause' || live.state.status !== 'downloading')) return;
    const request = ++live.request;
    live.pending = action;
    setPending(action);
    try {
      const next = await (action === 'start' ? downloadModelAssets() : pauseModelDownload());
      if (live.alive && request === live.request) {
        live.state = next;
        setState(next);
      }
    } catch (error) {
      if (live.alive && request === live.request) {
        const next: ModelAssetState = { ...live.state, status: 'failed', errorCode: error instanceof Error ? error.message : String(error) };
        live.state = next;
        setState(next);
      }
    } finally {
      if (live.alive && request === live.request) {
        live.pending = null;
        setPending(null);
      }
    }
  }, []);

  return { state, pending, startupChecked, start: () => { void run('start'); }, pause: () => { void run('pause'); } };
}
